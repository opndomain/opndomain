import {
  CADENCE_PRESETS,
  DAILY_ROLLUP_CRON,
  DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS,
  MATCHMAKING_SWEEP_CRON,
  PHASE5_MAINTENANCE_STUB_CRON,
  QUALITY_GATED_MIN_SCORE_FLOOR,
  REPUTATION_DECAY_CRON,
  ROUND_AUTO_ADVANCE_SWEEP_CRON,
  ROUND_VISIBILITY_SEALED,
  TOPIC_CANDIDATE_PROMOTION_CRON,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { nowIso } from "../lib/time.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";
import { syncTopicSnapshots } from "../lib/snapshot-sync.js";
import { forceFlushTopicState, runTerminalizationSequence } from "./terminalization.js";
import { createRollingTopicSuccessor, rewritePendingRoundSchedules } from "./topics.js";
import { finalizeContentRoundScores } from "./votes.js";

type TopicSweepRow = {
  id: string;
  domain_id: string;
  status: string;
  topic_format: string;
  cadence_family: string;
  min_distinct_participants: number;
  countdown_seconds: number | null;
  starts_at: string | null;
  join_until: string | null;
};

type ActiveRoundRow = {
  id: string;
  topic_id: string;
  domain_id: string;
  sequence_index: number;
  round_kind: string;
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
  round_kind: string;
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

type ActiveMemberRow = {
  being_id: string;
};

type CronHeartbeatStatus = {
  cron: string;
  lastRun: string | null;
  ageSeconds: number | null;
};

type LifecycleMutationRecord = {
  cron: string;
  executedAt: string;
  mutatedTopicIds: string[];
};

const CRON_HEARTBEAT_PREFIX = "cron/last-run/";
const CRON_LIFECYCLE_MUTATION_PREFIX = "cron/lifecycle-mutations/";
const CRON_OBSERVED_SCHEDULES = [
  MATCHMAKING_SWEEP_CRON,
  TOPIC_CANDIDATE_PROMOTION_CRON,
  PHASE5_MAINTENANCE_STUB_CRON,
  REPUTATION_DECAY_CRON,
  DAILY_ROLLUP_CRON,
] as const;

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

function resolveRoundDurationMs(round: Pick<RoundPlanRow, "starts_at" | "ends_at" | "config_json">): number {
  const scheduledDurationMs = roundDurationMs(round);
  if (scheduledDurationMs > 0) {
    return scheduledDurationMs;
  }
  const config = parseConfig(round.config_json);
  const roundDurationMinutes = Number(config.roundDurationMinutes ?? 0);
  return Math.max(0, roundDurationMinutes * 60 * 1000);
}

function nextMinuteBoundary(now: Date): Date {
  const nextMinuteMs = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  return new Date(nextMinuteMs);
}

async function countActiveParticipants(env: ApiEnv, topicId: string): Promise<number> {
  const participantCountRow = await firstRow<{ participant_count: number }>(
    env.DB,
    `
      SELECT COUNT(*) AS participant_count
      FROM topic_members
      WHERE topic_id = ? AND status = 'active'
    `,
    topicId,
  );
  return Number(participantCountRow?.participant_count ?? 0);
}

async function activateRound(
  env: ApiEnv,
  round: Pick<RoundPlanRow, "id" | "topic_id" | "sequence_index" | "round_kind" | "config_json" | "starts_at" | "ends_at"> & { domain_id: string },
  now: Date,
): Promise<boolean> {
  const opened = !env.ENABLE_ELASTIC_ROUNDS
    ? await runCas(
      env.DB.prepare(`UPDATE rounds SET status = 'active', starts_at = ? WHERE id = ? AND status = 'pending'`).bind(nowIso(now), round.id),
    )
    : await (async () => {
      const durationMs = resolveRoundDurationMs(round);
      const startsAt = nowIso(now);
      const endsAt = new Date(now.getTime() + durationMs).toISOString();
      const config = parseConfig(round.config_json);
      const revealAt =
        String(config.visibility ?? ROUND_VISIBILITY_SEALED) === ROUND_VISIBILITY_SEALED
          ? endsAt
          : startsAt;
      return runCas(
        env.DB
          .prepare(`UPDATE rounds SET status = 'active', starts_at = ?, ends_at = ?, reveal_at = ? WHERE id = ? AND status = 'pending'`)
          .bind(startsAt, endsAt, revealAt, round.id),
      );
    })();

  if (opened) {
    try {
      const eventRoundKind = round.round_kind || String(parseConfig(round.config_json).roundKind ?? "unknown");
      await archiveProtocolEvent(env, {
        occurredAt: nowIso(now),
        kind: "round_opened",
        topicId: round.topic_id,
        domainId: round.domain_id,
        roundId: round.id,
        roundIndex: round.sequence_index,
        roundKind: eventRoundKind,
      });
    } catch (error) {
      console.error("round opened event archive failed", error);
    }
  }
  return opened;
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
      SELECT id, domain_id, status, topic_format, cadence_family, min_distinct_participants, countdown_seconds, starts_at, join_until
      FROM topics
      WHERE status IN ('open', 'countdown')
      ORDER BY created_at ASC
      LIMIT 200
    `,
  );

  const mutatedTopicIds = new Set<string>();
  for (const topic of rows) {
    const startsAt = topic.starts_at ? new Date(topic.starts_at) : null;
    const joinUntil = topic.join_until ? new Date(topic.join_until) : null;
    const participantCount = await countActiveParticipants(env, topic.id);
    const minimumParticipants = Number(topic.min_distinct_participants ?? DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS);
    const hasMinimumParticipants = participantCount >= minimumParticipants;

    if (topic.topic_format === "rolling_research") {
      if (topic.status === "open" && hasMinimumParticipants) {
        const countdownStartsAt = nextMinuteBoundary(now).toISOString();
        const changed = await runCas(
          env.DB.prepare(
            `UPDATE topics SET status = 'countdown', countdown_started_at = ?, starts_at = ?, join_until = ? WHERE id = ? AND status = 'open'`,
          ).bind(nowIso(now), countdownStartsAt, countdownStartsAt, topic.id),
        );
        if (changed) {
          await rewritePendingRoundSchedules(env, topic.id, countdownStartsAt);
          await invalidateTopicPublicSurfaces(env, {
            topicId: topic.id,
            domainId: topic.domain_id,
            reason: "rolling_countdown_started",
            occurredAt: nowIso(now),
          });
          mutatedTopicIds.add(topic.id);
        }
        continue;
      }

      if (topic.status === "countdown" && startsAt && startsAt.getTime() <= now.getTime()) {
        const started = await runCas(
          env.DB.prepare(
            `UPDATE topics SET status = 'started', current_round_index = 0, active_participant_count = ? WHERE id = ? AND status = 'countdown'`,
          ).bind(participantCount, topic.id),
        );
        if (started) {
          const firstRound = await firstRow<RoundPlanRow>(
            env.DB,
            `
              SELECT r.id, r.topic_id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at, r.reveal_at, rc.config_json
              FROM rounds r
              INNER JOIN round_configs rc ON rc.round_id = r.id
              WHERE r.topic_id = ? AND r.sequence_index = 0
              LIMIT 1
            `,
            topic.id,
          );
          if (firstRound) {
            await activateRound(env, { ...firstRound, domain_id: topic.domain_id }, now);
          }
          const successorTopicId = await createRollingTopicSuccessor(env, topic.id);
          await invalidateTopicPublicSurfaces(env, {
            topicId: topic.id,
            domainId: topic.domain_id,
            reason: "rolling_topic_started",
            occurredAt: nowIso(now),
          });
          if (successorTopicId) {
            await invalidateTopicPublicSurfaces(env, {
              topicId: successorTopicId,
              domainId: topic.domain_id,
              reason: "rolling_successor_created",
              occurredAt: nowIso(now),
            });
            mutatedTopicIds.add(successorTopicId);
          }
          mutatedTopicIds.add(topic.id);
        }
      }
      continue;
    }

    if (topic.cadence_family === "quorum" && topic.status === "open" && hasMinimumParticipants && startsAt && startsAt.getTime() > now.getTime()) {
      const changed = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'countdown', countdown_started_at = ? WHERE id = ? AND status = 'open'`).bind(nowIso(now), topic.id),
      );
      if (changed) {
        await invalidateTopicPublicSurfaces(env, {
          topicId: topic.id,
          domainId: topic.domain_id,
          reason: "topic_countdown_started",
          occurredAt: nowIso(now),
        });
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
          env.DB.prepare(`UPDATE topics SET status = 'started', current_round_index = 0, active_participant_count = ? WHERE id = ? AND status = 'open'`).bind(participantCount, topic.id),
        );
        if (started) {
          const firstRound = await firstRow<RoundPlanRow>(
            env.DB,
            `
              SELECT r.id, r.topic_id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at, r.reveal_at, rc.config_json
              FROM rounds r
              INNER JOIN round_configs rc ON rc.round_id = r.id
              WHERE r.topic_id = ? AND r.sequence_index = 0
              LIMIT 1
            `,
            topic.id,
          );
          if (firstRound) {
            await activateRound(env, { ...firstRound, domain_id: topic.domain_id }, now);
          }
          await invalidateTopicPublicSurfaces(env, {
            topicId: topic.id,
            domainId: topic.domain_id,
            reason: "topic_started",
            occurredAt: nowIso(now),
          });
          mutatedTopicIds.add(topic.id);
        }
      } else {
        const stalled = await runCas(
          env.DB.prepare(`UPDATE topics SET status = 'stalled', stalled_at = ? WHERE id = ? AND status = 'open'`).bind(nowIso(now), topic.id),
        );
        if (stalled) {
          await invalidateTopicPublicSurfaces(env, {
            topicId: topic.id,
            domainId: topic.domain_id,
            reason: "topic_stalled",
            occurredAt: nowIso(now),
          });
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
        await invalidateTopicPublicSurfaces(env, {
          topicId: topic.id,
          domainId: topic.domain_id,
          reason: "topic_countdown_started",
          occurredAt: nowIso(now),
        });
        mutatedTopicIds.add(topic.id);
      }
      continue;
    }

    if (
      (topic.status === "open" || topic.status === "countdown") &&
      ((startsAt && startsAt.getTime() <= now.getTime()) || (!startsAt && joinUntil && joinUntil.getTime() <= now.getTime()))
    ) {
      if (!hasMinimumParticipants) {
        continue;
      }
      const started = await runCas(
        env.DB.prepare(`UPDATE topics SET status = 'started', current_round_index = 0, active_participant_count = ? WHERE id = ? AND status IN ('open', 'countdown')`).bind(participantCount, topic.id),
      );
      if (started) {
        const firstRound = await firstRow<RoundPlanRow>(
          env.DB,
          `
            SELECT r.id, r.topic_id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at, r.reveal_at, rc.config_json
            FROM rounds r
            INNER JOIN round_configs rc ON rc.round_id = r.id
            WHERE r.topic_id = ? AND r.sequence_index = 0
            LIMIT 1
          `,
          topic.id,
        );
        if (firstRound) {
          await activateRound(env, { ...firstRound, domain_id: topic.domain_id }, now);
        }
        await invalidateTopicPublicSurfaces(env, {
          topicId: topic.id,
          domainId: topic.domain_id,
          reason: "topic_started",
          occurredAt: nowIso(now),
        });
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

  // E1: Vote floor gate — if minVotesPerActor is set, block early completion
  // until every active member has cast at least that many votes in this round.
  const minVotesPerActor = Number(config.minVotesPerActor ?? 0);
  if (minVotesPerActor > 0) {
    const activeMembers = await allRows<ActiveMemberRow>(
      env.DB,
      `SELECT being_id FROM topic_members WHERE topic_id = ? AND status = 'active'`,
      round.topic_id,
    );
    const voteCounts = await allRows<{ voter_being_id: string; vote_count: number }>(
      env.DB,
      `SELECT voter_being_id, COUNT(*) as vote_count FROM votes WHERE round_id = ? GROUP BY voter_being_id`,
      round.id,
    );
    const voteCountByBeing = new Map(voteCounts.map((row) => [row.voter_being_id, Number(row.vote_count)]));
    const anyMemberBelowFloor = activeMembers.some(
      (member) => (voteCountByBeing.get(member.being_id) ?? 0) < minVotesPerActor,
    );
    if (anyMemberBelowFloor) {
      return false;
    }
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
        .filter((row) => isTranscriptVisibleContribution(row, now) && row.final_score !== null)
        .map((row) => Number(row.final_score))
        .filter((score) => Number.isFinite(score)),
    ),
  );
  // If all visible contributions have NULL final_score (deferred scoring), skip
  // the quality gate — the round can advance on count + contributor thresholds alone.
  const hasAnyFinalScore = visibleContributions.some((row) => row.final_score !== null);
  if (!hasAnyFinalScore) return true;
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
  try {
    const eventRoundKind = round.round_kind || String(parseConfig(round.config_json).roundKind ?? "unknown");
    await archiveProtocolEvent(env, {
      occurredAt: nowIso(now),
      kind: "round_closed",
      topicId: round.topic_id,
      domainId: round.domain_id,
      roundId: round.id,
      roundIndex: round.sequence_index,
      roundKind: eventRoundKind,
    });
  } catch (error) {
    console.error("round closed event archive failed", error);
  }

  const activeMembers = await allRows<ActiveMemberRow>(
    env.DB,
    `
      SELECT being_id
      FROM topic_members
      WHERE topic_id = ? AND status = 'active'
    `,
    round.topic_id,
  );
  const contributingMembers = new Set(
    (await allRows<ActiveMemberRow>(
      env.DB,
      `
        SELECT DISTINCT being_id
        FROM contributions
        WHERE topic_id = ? AND round_id = ?
      `,
      round.topic_id,
      round.id,
    )).map((row) => row.being_id),
  );
  for (const member of activeMembers) {
    if (contributingMembers.has(member.being_id)) {
      continue;
    }
    const dropped = await runCas(
      env.DB.prepare(
        `UPDATE topic_members
         SET status = 'dropped', updated_at = ?, dropped_at = ?, drop_reason = ?
         WHERE topic_id = ? AND being_id = ? AND status = 'active'`,
      ).bind(nowIso(now), nowIso(now), "missed_round_contribution", round.topic_id, member.being_id),
    );
    if (dropped) {
      await runCas(
        env.DB.prepare(`UPDATE beings SET drop_count = COALESCE(drop_count, 0) + 1, updated_at = ? WHERE id = ?`).bind(nowIso(now), member.being_id),
      );
    }
  }

  // Vote-based drops: drop active members who didn't meet the vote floor
  const config = parseConfig(round.config_json);
  const voteRequired = Boolean(config.voteRequired);
  const voteMinPerActor = Number(config.minVotesPerActor ?? 0);
  if (voteRequired && voteMinPerActor > 0) {
    try {
      const namespaceId = env.TOPIC_STATE_DO.idFromName(round.topic_id);
      const stub = env.TOPIC_STATE_DO.get(namespaceId);

      // Force flush and capture result
      let flushRemaining = 0;
      try {
        const flushResponse = await stub.fetch("https://topic-state.internal/force-flush", { method: "POST" });
        const flushResult = (await flushResponse.json()) as { flushed: boolean; remaining: number };
        flushRemaining = flushResult.remaining;
      } catch (flushError) {
        console.error("vote-drop force-flush failed, proceeding with best-effort data", flushError);
        flushRemaining = 1; // assume incomplete
      }

      // Get D1 vote counts
      const activeMembersPostDrop = await allRows<ActiveMemberRow>(
        env.DB,
        `SELECT being_id FROM topic_members WHERE topic_id = ? AND status = 'active'`,
        round.topic_id,
      );
      const voteCounts = await allRows<{ voter_being_id: string; vote_count: number }>(
        env.DB,
        `SELECT voter_being_id, COUNT(*) as vote_count FROM votes WHERE round_id = ? GROUP BY voter_being_id`,
        round.id,
      );
      const voteCountByBeing = new Map(voteCounts.map((row) => [row.voter_being_id, Number(row.vote_count)]));

      // If flush incomplete, merge with pending counts from DO
      if (flushRemaining > 0) {
        try {
          const pendingResponse = await stub.fetch(
            `https://topic-state.internal/round-voter-counts?roundId=${encodeURIComponent(round.id)}`,
          );
          const pendingCounts = (await pendingResponse.json()) as Record<string, number>;
          for (const [beingId, count] of Object.entries(pendingCounts)) {
            voteCountByBeing.set(beingId, (voteCountByBeing.get(beingId) ?? 0) + Number(count));
          }
        } catch (pendingError) {
          console.error("vote-drop pending count fetch failed, using D1 only", pendingError);
        }
      }

      for (const member of activeMembersPostDrop) {
        if ((voteCountByBeing.get(member.being_id) ?? 0) >= voteMinPerActor) {
          continue;
        }
        const voteDrop = await runCas(
          env.DB.prepare(
            `UPDATE topic_members
             SET status = 'dropped', updated_at = ?, dropped_at = ?, drop_reason = ?
             WHERE topic_id = ? AND being_id = ? AND status = 'active'`,
          ).bind(nowIso(now), nowIso(now), "missed_round_vote", round.topic_id, member.being_id),
        );
        if (voteDrop) {
          await runCas(
            env.DB.prepare(`UPDATE beings SET drop_count = COALESCE(drop_count, 0) + 1, updated_at = ? WHERE id = ?`).bind(nowIso(now), member.being_id),
          );
        }
      }
    } catch (voteDropError) {
      console.error("vote-drop block failed for round", round.id, voteDropError);
    }
  }

  // Deferred score finalization: when a vote round completes, finalize the paired content round
  const completingRoundKind = round.round_kind || String(parseConfig(round.config_json).roundKind ?? "unknown");
  if (completingRoundKind === "vote" && round.sequence_index > 0) {
    try {
      const namespaceId = env.TOPIC_STATE_DO.idFromName(round.topic_id);
      const stub = env.TOPIC_STATE_DO.get(namespaceId);
      const flushResponse = await stub.fetch("https://topic-state.internal/force-flush", { method: "POST" });
      const flushResult = (await flushResponse.json()) as { flushed: boolean; remaining: number };

      if (flushResult.flushed && flushResult.remaining === 0) {
        await finalizeContentRoundScores(env, round.topic_id, round.sequence_index - 1);
      } else {
        console.warn("deferred-score flush incomplete, deferring finalization", {
          topicId: round.topic_id,
          roundId: round.id,
          remaining: flushResult.remaining,
        });
      }
    } catch (err) {
      console.error("deferred-score finalization failed", err);
    }
  }

  const rounds = await allRows<RoundPlanRow>(
    env.DB,
    `
      SELECT r.id, r.topic_id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at, r.reveal_at, rc.config_json
      FROM rounds r
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.topic_id = ?
      ORDER BY r.sequence_index ASC
    `,
    round.topic_id,
  );
  const nextRound = rounds.find((candidate) => candidate.sequence_index === round.sequence_index + 1) ?? null;

  if (nextRound) {
    if (!env.ENABLE_ELASTIC_ROUNDS) {
      await rewritePendingRoundTimings(env, rounds, nextRound.sequence_index, now);
    }
    const activated = await activateRound(env, { ...nextRound, domain_id: round.domain_id }, now);
    if (activated) {
      const activeParticipantCount = await countActiveParticipants(env, round.topic_id);
      await runCas(
        env.DB
          .prepare(`UPDATE topics SET current_round_index = ?, status = 'started', stalled_at = NULL, active_participant_count = ? WHERE id = ?`)
          .bind(nextRound.sequence_index, activeParticipantCount, round.topic_id),
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

  // Refresh R2 transcript/state snapshot so the router reads current data
  // after the cache is invalidated below. Cron-only path: bounded by sweep
  // frequency, not per-contribution, so write amplification stays flat.
  try {
    await syncTopicSnapshots(env, round.topic_id, "round_completion");
  } catch (snapshotError) {
    console.error("snapshot sync after round advance failed", round.id, snapshotError);
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
        r.round_kind,
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
    // Phantom-round guard: if a content round's timer expired with zero
    // visible contributions, the topic has lost its participants. Stall it
    // instead of marching through empty rounds and producing fake verdicts.
    // Vote rounds are exempt — they can legitimately have zero visible rows.
    if (round.round_kind && round.round_kind !== "vote") {
      const contributionCount = await firstRow<{ c: number }>(
        env.DB,
        `SELECT COUNT(*) AS c FROM contributions WHERE round_id = ? AND visibility IN ('normal', 'low_confidence')`,
        round.id,
      );
      if ((contributionCount?.c ?? 0) === 0) {
        try {
          const stalled = await runCas(
            env.DB.prepare(`UPDATE topics SET status = 'stalled', stalled_at = ? WHERE id = ? AND status = 'started'`).bind(nowIso(now), round.topic_id),
          );
          if (stalled) {
            await invalidateTopicPublicSurfaces(env, {
              topicId: round.topic_id,
              domainId: round.domain_id,
              reason: "topic_stalled",
              occurredAt: nowIso(now),
            });
            mutatedTopicIds.add(round.topic_id);
          }
        } catch (stallError) {
          console.error("phantom-round stall failed for topic", round.topic_id, stallError);
        }
        continue;
      }
    }
    try {
      const advanced = await advanceRound(env, round, now);
      if (advanced) {
        mutatedTopicIds.add(round.topic_id);
      }
    } catch (advanceError) {
      console.error("advanceRound failed for round", round.id, advanceError);
    }
  }

  // Safety check: stall any started topic that has no active round AND no
  // pending round ready to activate. The "ready to activate" guard avoids a
  // race where a sweep observes the gap between one round completing and the
  // next being activated by advanceRound — D1 read replicas can also return
  // stale "no active round" results during normal transitions.
  const startedTopics = await allRows<{ id: string }>(env.DB, `SELECT id FROM topics WHERE status = 'started' AND closed_at IS NULL`);
  const nowIsoStr = nowIso(now);
  for (const topic of startedTopics) {
    const activeRound = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM rounds WHERE topic_id = ? AND status = 'active' LIMIT 1`,
      topic.id,
    );
    if (activeRound) continue;

    // If there's a pending round whose starts_at has arrived (or any pending
    // round at all), the topic is mid-transition — don't stall it.
    const pendingRound = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM rounds WHERE topic_id = ? AND status = 'pending' LIMIT 1`,
      topic.id,
    );
    if (pendingRound) continue;

    // If the most recent round completed within the last 60s, give the next
    // sweep a chance to advance instead of stalling on a transient gap.
    const recent = await firstRow<{ ends_at: string | null }>(
      env.DB,
      `SELECT ends_at FROM rounds WHERE topic_id = ? AND status = 'completed' ORDER BY sequence_index DESC LIMIT 1`,
      topic.id,
    );
    if (recent?.ends_at) {
      const endsMs = Date.parse(recent.ends_at);
      if (Number.isFinite(endsMs) && now.getTime() - endsMs < 60_000) continue;
    }

    const stalled = await runCas(
      env.DB.prepare(`UPDATE topics SET status = 'stalled', stalled_at = ? WHERE id = ? AND status = 'started'`).bind(nowIsoStr, topic.id),
    );
    if (stalled) {
      mutatedTopicIds.add(topic.id);
    }
  }

  return mutatedTopicIds;
}

async function retryPendingFinalizations(env: ApiEnv): Promise<Set<string>> {
  const mutated = new Set<string>();
  const pending = await allRows<{ topic_id: string; sequence_index: number }>(
    env.DB,
    `SELECT DISTINCT r.topic_id, r.sequence_index
     FROM rounds r
     WHERE r.round_kind = 'vote'
       AND r.status = 'completed'
       AND r.sequence_index > 0
       AND EXISTS (
         SELECT 1 FROM contributions c
         INNER JOIN contribution_scores cs ON cs.contribution_id = c.id
         INNER JOIN rounds cr ON cr.id = c.round_id
         WHERE cr.topic_id = r.topic_id
           AND cr.sequence_index = r.sequence_index - 1
           AND cs.final_score IS NULL
           AND cr.round_kind != 'vote'
       )
     LIMIT 20`,
  );
  for (const row of pending) {
    try {
      const namespaceId = env.TOPIC_STATE_DO.idFromName(row.topic_id);
      const stub = env.TOPIC_STATE_DO.get(namespaceId);
      const flushResponse = await stub.fetch("https://topic-state.internal/force-flush", { method: "POST" });
      const flushResult = (await flushResponse.json()) as { flushed: boolean; remaining: number };
      if (flushResult.flushed && flushResult.remaining === 0) {
        await finalizeContentRoundScores(env, row.topic_id, row.sequence_index - 1);
        mutated.add(row.topic_id);
      }
    } catch (err) {
      console.error("retryPendingFinalizations failed", { topicId: row.topic_id, err });
    }
  }
  return mutated;
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
    for (const topicId of await retryPendingFinalizations(env)) {
      mutatedTopicIds.add(topicId);
    }
  }

  const result = { cron, executedAt: nowIso(now), mutatedTopicIds: Array.from(mutatedTopicIds) };
  await recordLifecycleMutation(env, result);
  return result;
}

export async function recordCronHeartbeat(env: ApiEnv, cron: string, now: Date): Promise<void> {
  await env.PUBLIC_CACHE.put(`${CRON_HEARTBEAT_PREFIX}${cron}`, nowIso(now));
}

export async function recordLifecycleMutation(env: ApiEnv, record: LifecycleMutationRecord): Promise<void> {
  if (record.mutatedTopicIds.length === 0) {
    return;
  }
  await env.PUBLIC_CACHE.put(
    `${CRON_LIFECYCLE_MUTATION_PREFIX}${record.executedAt}__${record.cron}`,
    JSON.stringify(record),
  );
}

export async function readCronHeartbeatStatuses(env: ApiEnv, now = new Date()): Promise<CronHeartbeatStatus[]> {
  const statuses = await Promise.all(
    CRON_OBSERVED_SCHEDULES.map(async (cron) => {
      const lastRun = await env.PUBLIC_CACHE.get(`${CRON_HEARTBEAT_PREFIX}${cron}`);
      const lastRunMs = lastRun ? new Date(lastRun).getTime() : Number.NaN;
      return {
        cron,
        lastRun,
        ageSeconds: Number.isFinite(lastRunMs) ? Math.max(0, Math.floor((now.getTime() - lastRunMs) / 1000)) : null,
      };
    }),
  );
  return statuses;
}

export async function listRecentLifecycleMutations(env: ApiEnv, limit = 10): Promise<LifecycleMutationRecord[]> {
  const listing = await env.PUBLIC_CACHE.list({ prefix: CRON_LIFECYCLE_MUTATION_PREFIX });
  const keys = listing.keys
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, limit);

  const records = await Promise.all(
    keys.map(async (key) => {
      const payload = await env.PUBLIC_CACHE.get(key);
      if (!payload) {
        return null;
      }
      try {
        const parsed = JSON.parse(payload) as Partial<LifecycleMutationRecord>;
        if (
          typeof parsed.cron !== "string" ||
          typeof parsed.executedAt !== "string" ||
          !Array.isArray(parsed.mutatedTopicIds)
        ) {
          return null;
        }
        return {
          cron: parsed.cron,
          executedAt: parsed.executedAt,
          mutatedTopicIds: parsed.mutatedTopicIds.map((topicId) => String(topicId)),
        };
      } catch {
        return null;
      }
    }),
  );

  return records.filter((record): record is LifecycleMutationRecord => Boolean(record));
}
