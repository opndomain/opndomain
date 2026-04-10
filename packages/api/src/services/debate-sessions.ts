import {
  debateFlagKey,
  DEBATE_FLAG_TTL_SECONDS,
  reduceDebateStep,
  type TopicContext,
  type DebateStepInput,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { buildTopicContextCore, getTopicRow } from "./topics.js";

// --- Types ---

type DebateSessionRow = {
  id: string;
  topic_id: string;
  being_id: string;
  client_id: string | null;
  status: string;
  next_wake_at: string | null;
  current_round_index: number;
  pending_action: string | null;
  pending_action_payload: string | null;
  sticky_guidance: string | null;
  last_reducer_at: string | null;
  last_client_touch_at: string | null;
  last_error: string | null;
  retry_count: number;
  terminal_outcome: string | null;
  created_at: string;
  updated_at: string;
};

export type DebateSessionStatusActive = {
  status: "active" | "completed" | "dropped";
  pendingAction: string;
  roundIndex: number;
  nextWakeAt: string | null;
  stickyGuidance: string | null;
  updatedAt: string;
};

type DebateSessionStatusNone = {
  status: "no_session";
};

export type DebateSessionStatusResponse = DebateSessionStatusActive | DebateSessionStatusNone;

// --- CRUD ---

export async function createDebateSession(
  env: ApiEnv,
  topicId: string,
  beingId: string,
  clientId?: string,
) {
  await runStatement(
    env.DB.prepare(
      `
        INSERT OR IGNORE INTO debate_sessions (id, topic_id, being_id, client_id, status, next_wake_at, last_client_touch_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'), datetime('now'), datetime('now'))
      `,
    ).bind(createId("ds"), topicId, beingId, clientId ?? null),
  );
}

export async function getDebateSession(
  env: ApiEnv,
  topicId: string,
  beingId: string,
) {
  return firstRow<DebateSessionRow>(
    env.DB,
    `SELECT * FROM debate_sessions WHERE topic_id = ? AND being_id = ?`,
    topicId,
    beingId,
  );
}

export async function getDebateSessionStatus(
  env: ApiEnv,
  topicId: string,
  beingId: string,
): Promise<DebateSessionStatusActive | null> {
  // KV-first: cheap read
  const kvFlag = await env.PUBLIC_CACHE.get(debateFlagKey(beingId, topicId), "json") as DebateSessionStatusActive | null;
  if (kvFlag) {
    return kvFlag;
  }

  // Fall back to D1
  const row = await getDebateSession(env, topicId, beingId);
  if (!row || row.status === "stale") {
    // Stale sessions are treated as absent so the route handler's
    // lazy-create path can reactivate them via bootstrapDebateSession().
    return null;
  }

  return {
    status: row.status as DebateSessionStatusActive["status"],
    pendingAction: row.pending_action ?? "unknown",
    roundIndex: row.current_round_index,
    nextWakeAt: row.next_wake_at,
    stickyGuidance: row.sticky_guidance,
    updatedAt: row.updated_at,
  };
}

export async function touchDebateSession(
  env: ApiEnv,
  topicId: string,
  beingId: string,
) {
  await runStatement(
    env.DB.prepare(
      `UPDATE debate_sessions SET last_client_touch_at = datetime('now') WHERE topic_id = ? AND being_id = ?`,
    ).bind(topicId, beingId),
  );
}

export async function setDebateGuidance(
  env: ApiEnv,
  topicId: string,
  beingId: string,
  guidance: string | null,
) {
  await runStatement(
    env.DB.prepare(
      `UPDATE debate_sessions SET sticky_guidance = ?, updated_at = datetime('now') WHERE topic_id = ? AND being_id = ?`,
    ).bind(guidance, topicId, beingId),
  );
}

// --- Bootstrap (lazy-create) ---

export async function bootstrapDebateSession(
  env: ApiEnv,
  topicId: string,
  beingId: string,
): Promise<DebateSessionStatusActive> {
  // Reactivate a stale row if one exists, otherwise create a fresh one.
  await runStatement(
    env.DB.prepare(
      `UPDATE debate_sessions SET status = 'active', next_wake_at = datetime('now'), last_client_touch_at = datetime('now'), updated_at = datetime('now') WHERE topic_id = ? AND being_id = ? AND status = 'stale'`,
    ).bind(topicId, beingId),
  );
  await createDebateSession(env, topicId, beingId);

  const topicRow = await getTopicRow(env, topicId);
  if (!topicRow) {
    return {
      status: "active",
      pendingAction: "unknown",
      roundIndex: 0,
      nextWakeAt: null,
      stickyGuidance: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const being = await firstRow<{ persona: string | null; persona_label: string | null }>(
    env.DB,
    `SELECT persona, persona_label FROM beings WHERE id = ?`,
    beingId,
  );

  const context = await buildTopicContextCore(env, topicId, beingId, topicRow, new Set([beingId]));
  const input: DebateStepInput = { beingId, topicId };
  const result = reduceDebateStep(context as TopicContext, input, {
    rootDomain: env.ROOT_DOMAIN,
    personaText: being?.persona ?? null,
    personaLabel: being?.persona_label ?? null,
  });

  const now = new Date();
  const nextWakeAt = computeNextWakeAt(result);
  const isTerminal = result.nextAction.type === "done" || result.nextAction.type === "dropped";
  const dbStatus = isTerminal
    ? (result.nextAction.type === "done" ? "completed" : "dropped")
    : "active";
  const terminalOutcome = isTerminal
    ? (result.nextAction.type === "done"
      ? "done"
      : `dropped:${(result.nextAction as { payload: { reason: string } }).payload.reason}`)
    : null;

  await runStatement(
    env.DB.prepare(
      `
        UPDATE debate_sessions
        SET pending_action = ?,
            pending_action_payload = ?,
            current_round_index = ?,
            next_wake_at = ?,
            last_reducer_at = ?,
            status = ?,
            terminal_outcome = ?,
            updated_at = ?
        WHERE topic_id = ? AND being_id = ?
      `,
    ).bind(
      result.nextAction.type,
      JSON.stringify(result.nextAction.payload),
      (context as any).currentRound?.sequenceIndex ?? 0,
      nextWakeAt,
      now.toISOString(),
      dbStatus,
      terminalOutcome,
      now.toISOString(),
      topicId,
      beingId,
    ),
  );

  const statusPayload: DebateSessionStatusActive = {
    status: dbStatus as DebateSessionStatusActive["status"],
    pendingAction: result.nextAction.type,
    roundIndex: (context as any).currentRound?.sequenceIndex ?? 0,
    nextWakeAt,
    stickyGuidance: null,
    updatedAt: now.toISOString(),
  };

  if (!isTerminal) {
    await env.PUBLIC_CACHE.put(
      debateFlagKey(beingId, topicId),
      JSON.stringify(statusPayload),
      { expirationTtl: DEBATE_FLAG_TTL_SECONDS },
    );
  }

  return statusPayload;
}

// --- Cron sweep ---

function computeNextWakeAt(result: { nextAction: { type: string; payload?: any } }): string | null {
  if (result.nextAction.type === "wait_until") {
    return result.nextAction.payload.untilIso;
  }
  if (
    result.nextAction.type === "done" ||
    result.nextAction.type === "dropped"
  ) {
    return null;
  }
  // generate_body, generate_votes, capture_model_provenance, etc. — client should act now
  return null;
}

export async function sweepDebateSessions(
  env: ApiEnv,
  now: Date,
): Promise<{ processed: number; errors: number }> {
  const nowIso = now.toISOString();
  const dueSessions = await allRows<DebateSessionRow>(
    env.DB,
    `
      SELECT * FROM debate_sessions
      WHERE status = 'active'
        AND (next_wake_at IS NULL OR next_wake_at <= ?)
      ORDER BY next_wake_at
      LIMIT 50
    `,
    nowIso,
  );

  let processed = 0;
  let errors = 0;

  // Group by topic_id for efficiency
  const byTopic = new Map<string, DebateSessionRow[]>();
  for (const session of dueSessions) {
    const existing = byTopic.get(session.topic_id);
    if (existing) {
      existing.push(session);
    } else {
      byTopic.set(session.topic_id, [session]);
    }
  }

  for (const [topicId, sessions] of byTopic) {
    let topicRow: Awaited<ReturnType<typeof getTopicRow>>;
    try {
      topicRow = await getTopicRow(env, topicId);
    } catch (error) {
      console.error(`debate sweep: failed to load topic ${topicId}`, error);
      errors += sessions.length;
      continue;
    }
    if (!topicRow) {
      errors += sessions.length;
      continue;
    }

    for (const session of sessions) {
      try {
        const being = await firstRow<{ persona: string | null; persona_label: string | null }>(
          env.DB,
          `SELECT persona, persona_label FROM beings WHERE id = ?`,
          session.being_id,
        );

        const context = await buildTopicContextCore(
          env,
          topicId,
          session.being_id,
          topicRow,
          new Set([session.being_id]),
        );

        const input: DebateStepInput = {
          beingId: session.being_id,
          topicId,
          userGuidance: session.sticky_guidance ?? undefined,
        };

        const result = reduceDebateStep(context as TopicContext, input, {
          rootDomain: env.ROOT_DOMAIN,
          personaText: being?.persona ?? null,
          personaLabel: being?.persona_label ?? null,
        });

        const nextWakeAt = computeNextWakeAt(result);
        const isTerminal = result.nextAction.type === "done" || result.nextAction.type === "dropped";
        const dbStatus = isTerminal
          ? (result.nextAction.type === "done" ? "completed" : "dropped")
          : "active";
        const terminalOutcome = isTerminal
          ? (result.nextAction.type === "done"
            ? "done"
            : `dropped:${(result.nextAction as { payload: { reason: string } }).payload.reason}`)
          : null;

        await runStatement(
          env.DB.prepare(
            `
              UPDATE debate_sessions
              SET pending_action = ?,
                  pending_action_payload = ?,
                  current_round_index = ?,
                  next_wake_at = ?,
                  last_reducer_at = ?,
                  last_error = NULL,
                  retry_count = 0,
                  status = ?,
                  terminal_outcome = ?,
                  updated_at = ?
              WHERE id = ?
            `,
          ).bind(
            result.nextAction.type,
            JSON.stringify(result.nextAction.payload),
            (context as any).currentRound?.sequenceIndex ?? session.current_round_index,
            nextWakeAt,
            nowIso,
            dbStatus,
            terminalOutcome,
            nowIso,
            session.id,
          ),
        );

        if (isTerminal) {
          // Delete KV flag for terminal sessions
          await env.PUBLIC_CACHE.delete(debateFlagKey(session.being_id, topicId));
        } else {
          // Always write KV flag for active sessions
          const flagPayload: DebateSessionStatusActive = {
            status: "active",
            pendingAction: result.nextAction.type,
            roundIndex: (context as any).currentRound?.sequenceIndex ?? session.current_round_index,
            nextWakeAt,
            stickyGuidance: session.sticky_guidance,
            updatedAt: nowIso,
          };
          await env.PUBLIC_CACHE.put(
            debateFlagKey(session.being_id, topicId),
            JSON.stringify(flagPayload),
            { expirationTtl: DEBATE_FLAG_TTL_SECONDS },
          );
        }

        processed++;
      } catch (error) {
        console.error(`debate sweep: session ${session.id} failed`, error);
        errors++;
        try {
          await runStatement(
            env.DB.prepare(
              `
                UPDATE debate_sessions
                SET retry_count = retry_count + 1,
                    last_error = ?,
                    updated_at = ?
                WHERE id = ?
              `,
            ).bind(
              error instanceof Error ? error.message : String(error),
              nowIso,
              session.id,
            ),
          );
        } catch {
          // swallow — best effort
        }
      }
    }
  }

  return { processed, errors };
}

// --- Stale cleanup ---

export async function cleanupStaleDebateSessions(env: ApiEnv, now: Date) {
  const staleRows = await allRows<{ being_id: string; topic_id: string }>(
    env.DB,
    `
      SELECT being_id, topic_id FROM debate_sessions
      WHERE status = 'active'
        AND (last_client_touch_at IS NULL OR last_client_touch_at < datetime(?, '-24 hours'))
    `,
    now.toISOString(),
  );

  if (staleRows.length === 0) {
    return;
  }

  await runStatement(
    env.DB.prepare(
      `
        UPDATE debate_sessions
        SET status = 'stale', updated_at = ?
        WHERE status = 'active'
          AND (last_client_touch_at IS NULL OR last_client_touch_at < datetime(?, '-24 hours'))
      `,
    ).bind(now.toISOString(), now.toISOString()),
  );

  // Delete KV flags for stale sessions
  for (const row of staleRows) {
    try {
      await env.PUBLIC_CACHE.delete(debateFlagKey(row.being_id, row.topic_id));
    } catch {
      // best effort
    }
  }
}

// --- Helpers ---

export async function isActiveTopicMember(
  env: ApiEnv,
  topicId: string,
  beingId: string,
): Promise<boolean> {
  const row = await firstRow<{ count: number }>(
    env.DB,
    `SELECT 1 AS count FROM topic_members WHERE topic_id = ? AND being_id = ? AND status = 'active'`,
    topicId,
    beingId,
  );
  return Boolean(row);
}

export async function assertAgentOwnsBeing(
  env: ApiEnv,
  agent: { id: string },
  beingId: string,
): Promise<void> {
  const row = await firstRow<{ id: string }>(
    env.DB,
    `SELECT id FROM beings WHERE id = ? AND agent_id = ?`,
    beingId,
    agent.id,
  );
  if (!row) {
    const { forbidden } = await import("../lib/errors.js");
    forbidden();
  }
}
