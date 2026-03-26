import {
  CADENCE_PRESETS,
  DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS,
  MATCHMAKING_SWEEP_CRON,
  QUALITY_GATED_MIN_SCORE_FLOOR,
  ROUND_AUTO_ADVANCE_SWEEP_CRON,
  ROUND_VISIBILITY_SEALED,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { nowIso } from "../lib/time.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";
import { runTerminalizationSequence } from "./terminalization.js";

type TopicSweepRow = {
  id: string;
  status: string;
  cadence_family: string;
  starts_at: string | null;
  join_until: string | null;
};

type ActiveRoundRow = {
  id: string;
  topic_id: string;
  domain_id: string;
  sequence_index: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  reveal_at: string | null;
  cadence_preset: string | null;
  config_json: string;
};

type RoundPlanRow = {
  id: string;
  topic_id: string;
  sequence_index: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  reveal_at: string | null;
  config_json: string;
};

type ContributionEvalRow = {
  id: string;
  being_id: string;
  visibility: string;
  final_score: number | null;
  round_visibility: string | null;
  reveal_at: string | null;
};

function parseConfig(configJson: string): Record<string, unknown> {
  return JSON.parse(configJson) as Record<string, unknown>;
}

function roundDurationMs(round: Pick<RoundPlanRow, "starts_at" | "ends_at">): number {
  const startsAt = round.starts_at ? new Date(round.starts_at).getTime() : Number.NaN;
  const endsAt = round.ends_at ? new Date(round.ends_at).getTime() : Number.NaN;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return 0;
  }
  return endsAt - startsAt;
}

async function runCas(statement: D1PreparedStatement): Promise<boolean> {
  const runnable = statement as D1PreparedStatement & {
    db?: { batch?: (statements: D1PreparedStatement[]) => Promise<Array<{ error?: string }>> };
  };
  if (typeof runnable.run === "function") {
    const result = await runnable.run();
    return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }
  if (runnable.db?.batch) {
    const results = await runnable.db.batch([statement]);
    const first = results?.[0];
    return !first?.error;
  }
  return false;
}

async function transitionTopicsIntoCountdownOrStarted(env: ApiEnv, now: Date) {
  const rows = await allRows<TopicSweepRow>(
    env.DB,
    `
      SELECT id, status, cadence_family, starts_at, join_until
      FROM topics
      WHERE status IN ('open', 'countdown')
      ORDER BY created_at ASC
      LIMIT 50
    `,
  );

  const mutatedTopicIds = new Set<string>();
  for (const topic of rows) {
    const startsAt = topic.starts_at ? new Date(topic.starts_at) : null;
    const joinUntil = topic.join_until ? new Date(topic.join_until) : null;
    const participantCountRow = await firstRow<{ participant_count: number }>(
      env.DB,
      `
        SELECT COUNT(*) AS participant_count
        FROM topic_members
        WHERE topic_id = ? AND status = 'active'
      `,
      topic.id,
    );
    const participantCount = Number(participantCountRow?.participant_count ?? 0);
    const hasMinimumParticipants = participantCount >= DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS;

    if (topic.cadence_family === "quorum" && topic.status === "open" && hasMinimumParticipants && startsAt && startsAt.getTime() > now.getTime()) {
      const changed = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'countdown', countdown_started_at = ? WHERE id = ? AND status = 'open'`).bind(nowIso(now), topic.id),
      );
      if (changed) {
        mutatedTopicIds.add(topic.id);
      }
      continue;
    }

    if (
      topic.cadence_family === "rolling" &&
      topic.status === "open" &&
      joinUntil &&
      joinUntil.getTime() <= now.getTime()
    ) {
      if (hasMinimumParticipants) {
        const started = await runCas(
          env.DB.prepare(`UPDATE topics SET status = 'started', current_round_index = 0 WHERE id = ? AND status = 'open'`).bind(topic.id),
        );
        if (started) {
          await runCas(env.DB.prepare(`UPDATE rounds SET status = 'active' WHERE topic_id = ? AND sequence_index = 0 AND status = 'pending'`).bind(topic.id));
          mutatedTopicIds.add(topic.id);
        }
      } else {
        const stalled = await runCas(
          env.DB.prepare(`UPDATE topics SET status = 'stalled', stalled_at = ? WHERE id = ? AND status = 'open'`).bind(nowIso(now), topic.id),
        );
        if (stalled) {
          mutatedTopicIds.add(topic.id);
        }
      }
      continue;
    }

    if (
      topic.cadence_family === "scheduled" &&
      topic.status === "open" &&
      joinUntil &&
      joinUntil.getTime() <= now.getTime() &&
      startsAt &&
      startsAt.getTime() > now.getTime()
    ) {
      const changed = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'countdown', countdown_started_at = ? WHERE id = ? AND status = 'open'`).bind(nowIso(now), topic.id),
      );
      if (changed) {
        mutatedTopicIds.add(topic.id);
      }
      continue;
    }

    if (
      (topic.status === "open" || topic.status === "countdown") &&
      ((startsAt && startsAt.getTime() <= now.getTime()) || (!startsAt && joinUntil && joinUntil.getTime() <= now.getTime()))
    ) {
      const started = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'started', current_round_index = 0 WHERE id = ? AND status IN ('open', 'countdown')`).bind(topic.id),
      );
      if (started) {
        await runCas(env.DB.prepare(`UPDATE rounds SET status = 'active' WHERE topic_id = ? AND sequence_index = 0 AND status = 'pending'`).bind(topic.id));
        mutatedTopicIds.add(topic.id);
      }
    }
  }

  return mutatedTopicIds;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return QUALITY_GATED_MIN_SCORE_FLOOR;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function shouldCompleteRound(env: ApiEnv, round: ActiveRoundRow, now: Date): Promise<boolean> {
  const config = parseConfig(round.config_json);
  const completionStyle = String(config.completionStyle ?? "aggressive");

  if (!round.ends_at) {
    return false;
  }
  if (new Date(round.ends_at).getTime() <= now.getTime()) {
    return true;
  }

  const contributionRows = await allRows<ContributionEvalRow>(
    env.DB,
    `
      SELECT
        c.id,
        c.being_id,
        c.visibility,
        cs.final_score,
        json_extract(rc.config_json, '$.visibility') AS round_visibility,
        r.reveal_at
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ? AND c.round_id = ?
    `,
    round.topic_id,
    round.id,
  );
  const visibleContributions = contributionRows.filter((row) => isTranscriptVisibleContribution(row, now));
  const distinctContributors = new Set(visibleContributions.map((row) => row.being_id));

  if (completionStyle === "aggressive") {
    return visibleContributions.length > 0 && distinctContributors.size >= DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS;
  }

  const activeMemberCountRow = await firstRow<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM topic_members WHERE topic_id = ? AND status = 'active'`,
    round.topic_id,
  );
  const activeMemberCount = Number(activeMemberCountRow?.count ?? 0);
  if (completionStyle === "patient") {
    return activeMemberCount > 0 && distinctContributors.size >= activeMemberCount;
  }

  const startsAtMs = round.starts_at ? new Date(round.starts_at).getTime() : now.getTime();
  const elapsedMs = now.getTime() - startsAtMs;
  const roundDurationMinutes = Number(config.roundDurationMinutes ?? 0);
  const cadencePreset = round.cadence_preset ?? String(config.cadencePreset ?? "");
  const minElapsedSeconds =
    cadencePreset && cadencePreset in CADENCE_PRESETS
      ? CADENCE_PRESETS[cadencePreset as keyof typeof CADENCE_PRESETS].minDurationSeconds
      : Math.max(60, roundDurationMinutes * 60);
  if (elapsedMs < minElapsedSeconds * 1000) {
    return false;
  }

  const priorScores = await allRows<{ final_score: number | null; visibility: string; round_visibility: string | null; reveal_at: string | null }>(
    env.DB,
    `
      SELECT
        cs.final_score,
        c.visibility,
        json_extract(rc.config_json, '$.visibility') AS round_visibility,
        r.reveal_at
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ? AND r.sequence_index < ?
    `,
    round.topic_id,
    round.sequence_index,
  );
  const threshold = Math.max(
    QUALITY_GATED_MIN_SCORE_FLOOR,
    median(
      priorScores
        .filter((row) => isTranscriptVisibleContribution(row, now))
        .map((row) => Number(row.final_score ?? 0))
        .filter((score) => Number.isFinite(score)),
    ),
  );
  return visibleContributions.some((row) => Number(row.final_score ?? 0) >= threshold);
}

async function rewritePendingRoundTimings(env: ApiEnv, rounds: RoundPlanRow[], fromSequenceIndex: number, anchorTime: Date) {
  let cursor = new Date(anchorTime);
  for (const round of rounds.filter((candidate) => candidate.sequence_index >= fromSequenceIndex).sort((a, b) => a.sequence_index - b.sequence_index)) {
    if (round.status !== "pending") {
      continue;
    }
    const config = parseConfig(round.config_json);
    const durationMs = roundDurationMs(round);
    const startsAt = new Date(cursor);
    const endsAt = new Date(startsAt.getTime() + durationMs);
    const revealAt = String(config.visibility ?? ROUND_VISIBILITY_SEALED) === ROUND_VISIBILITY_SEALED
      ? endsAt.toISOString()
      : startsAt.toISOString();
    await runCas(
      env.DB
        .prepare(`UPDATE rounds SET starts_at = ?, ends_at = ?, reveal_at = ? WHERE id = ? AND status = 'pending'`)
        .bind(startsAt.toISOString(), endsAt.toISOString(), revealAt, round.id),
    );
    cursor = endsAt;
  }
}

async function advanceRound(env: ApiEnv, round: ActiveRoundRow, now: Date): Promise<boolean> {
  const completed = await runCas(
    env.DB.prepare(
      `UPDATE rounds SET status = 'completed', ends_at = ?, reveal_at = ? WHERE id = ? AND status = 'active'`,
    ).bind(nowIso(now), nowIso(now), round.id),
  );
  if (!completed) {
    return false;
  }

  const rounds = await allRows<RoundPlanRow>(
    env.DB,
    `
      SELECT r.id, r.topic_id, r.sequence_index, r.status, r.starts_at, r.ends_at, r.reveal_at, rc.config_json
      FROM rounds r
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.topic_id = ?
      ORDER BY r.sequence_index ASC
    `,
    round.topic_id,
  );
  const nextRound = rounds.find((candidate) => candidate.sequence_index === round.sequence_index + 1) ?? null;

  if (nextRound) {
    await rewritePendingRoundTimings(env, rounds, nextRound.sequence_index, now);
    const activated = await runCas(
      env.DB.prepare(`UPDATE rounds SET status = 'active', starts_at = ? WHERE id = ? AND status = 'pending'`).bind(nowIso(now), nextRound.id),
    );
    if (activated) {
      await runCas(
        env.DB
          .prepare(`UPDATE topics SET current_round_index = ?, status = 'started', stalled_at = NULL WHERE id = ?`)
          .bind(nextRound.sequence_index, round.topic_id),
      );
    }
  } else {
    const closed = await runCas(
      env.DB.prepare(`UPDATE topics SET status = 'closed', closed_at = ? WHERE id = ? AND status != 'closed'`).bind(nowIso(now), round.topic_id),
    );
    if (closed) {
      await runTerminalizationSequence(env, round.topic_id);
    }
  }

  await invalidateTopicPublicSurfaces(env, {
    topicId: round.topic_id,
    domainId: round.domain_id,
    reason: "round_completion",
    occurredAt: nowIso(now),
  });
  return true;
}

async function autoAdvanceRounds(env: ApiEnv, now: Date) {
  const activeRounds = await allRows<ActiveRoundRow>(
    env.DB,
    `
      SELECT
        r.id,
        r.topic_id,
        t.domain_id,
        r.sequence_index,
        r.status,
        r.starts_at,
        r.ends_at,
        r.reveal_at,
        t.cadence_preset,
        rc.config_json
      FROM rounds r
      INNER JOIN topics t ON t.id = r.topic_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.status = 'active'
      ORDER BY r.ends_at ASC
      LIMIT 50
    `,
  );

  const mutatedTopicIds = new Set<string>();
  for (const round of activeRounds) {
    if (!(await shouldCompleteRound(env, round, now))) {
      continue;
    }
    const advanced = await advanceRound(env, round, now);
    if (advanced) {
      mutatedTopicIds.add(round.topic_id);
    }
  }

  const startedTopics = await allRows<{ id: string }>(env.DB, `SELECT id FROM topics WHERE status = 'started'`);
  for (const topic of startedTopics) {
    const activeRound = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM rounds WHERE topic_id = ? AND status = 'active' LIMIT 1`,
      topic.id,
    );
    if (!activeRound) {
      const stalled = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'stalled', stalled_at = ? WHERE id = ? AND status = 'started'`).bind(nowIso(now), topic.id),
      );
      if (stalled) {
        mutatedTopicIds.add(topic.id);
      }
    }
  }

  return mutatedTopicIds;
}

export async function sweepTopicLifecycle(env: ApiEnv, options?: { cron?: string; now?: Date }) {
  const now = options?.now ?? new Date();
  const cron = options?.cron ?? "manual";
  const mutatedTopicIds = new Set<string>();

  if (cron === MATCHMAKING_SWEEP_CRON || cron === "manual") {
    for (const topicId of await transitionTopicsIntoCountdownOrStarted(env, now)) {
      mutatedTopicIds.add(topicId);
    }
  }
  if (cron === ROUND_AUTO_ADVANCE_SWEEP_CRON || cron === "manual") {
    for (const topicId of await autoAdvanceRounds(env, now)) {
      mutatedTopicIds.add(topicId);
    }
  }

  return { cron, executedAt: nowIso(now), mutatedTopicIds: Array.from(mutatedTopicIds) };
}

export async function recordCronHeartbeat(env: ApiEnv, cron: string, now: Date): Promise<void> {
  await env.PUBLIC_CACHE.put(`cron/last-run/${cron}`, nowIso(now));
}
