import {
  TOPIC_STATE_FLUSHED_RETENTION_MS,
  TOPIC_STATE_IDEMPOTENCY_RETENTION_MS,
  TOPIC_STATE_SNAPSHOT_PENDING_KEY,
} from "@opndomain/shared";
import type { ApiEnv } from "../env.js";
import { runStatement } from "../db.js";
import { updateDomainClaimGraph } from "../epistemic/claim-graph.js";
import { syncTopicSnapshots } from "../snapshot-sync.js";
import { recomputeContributionFinalScores, type ContributionVoteAggregate, type TopicVoteStatsRow } from "../../services/votes.js";
import {
  TOPIC_STATE_PENDING_RECORD_LIMIT,
  type PendingMessageRow,
  type PendingScoreRow,
  type PendingVoteRow,
} from "./schema.js";

const TOPIC_STATE_TOPIC_VOTE_AGGREGATE_PREFIX = "votes:topic-aggregate:";
const TOPIC_STATE_CONTRIBUTION_VOTE_AGGREGATE_PREFIX = "votes:contribution-aggregate:";

type AuthoritativeContributionVoteAggregateRow = {
  contribution_id: string;
  vote_count: number | null;
  distinct_voter_count: number | null;
  upvote_count: number | null;
  downvote_count: number | null;
  raw_weighted_sum: number | null;
  max_possible: number | null;
};

type AuthoritativeTopicVoteStatsRow = TopicVoteStatsRow & {
  topic_id: string;
};

function sqlExec(state: DurableObjectState, sql: string, ...bindings: unknown[]) {
  return Array.from(
    (
      state.storage as DurableObjectStorage & {
        sql: { exec: (statement: string, ...values: unknown[]) => Iterable<Record<string, unknown>> };
      }
    ).sql.exec(sql, ...bindings),
  );
}

function buildInClause(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toWeightedVoteScore(rawWeightedSum: number, maxPossible: number): number {
  if (!Number.isFinite(maxPossible) || maxPossible <= 0) {
    return 50;
  }
  return clamp(((rawWeightedSum / maxPossible + 1) / 2) * 100, 0, 100);
}

async function readAuthoritativeContributionVoteAggregates(env: ApiEnv, contributionIds: string[]) {
  const aggregateMap = new Map<string, ContributionVoteAggregate>();
  if (contributionIds.length === 0) {
    return aggregateMap;
  }

  const results = await env.DB
    .prepare(
      `
        SELECT
          contribution_id,
          COUNT(CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN 1 END) AS vote_count,
          COUNT(DISTINCT CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN voter_being_id END) AS distinct_voter_count,
          COUNT(CASE WHEN direction = 1 AND COALESCE(weight, 0) > 0 THEN 1 END) AS upvote_count,
          COUNT(CASE WHEN direction = -1 AND COALESCE(weight, 0) > 0 THEN 1 END) AS downvote_count,
          SUM(CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN direction * weight ELSE 0 END) AS raw_weighted_sum,
          SUM(CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN weight ELSE 0 END) AS max_possible
        FROM votes
        WHERE contribution_id IN (${buildInClause(contributionIds)})
        GROUP BY contribution_id
      `,
    )
    .bind(...contributionIds)
    .all<AuthoritativeContributionVoteAggregateRow>();

  for (const row of results.results ?? []) {
    const rawWeightedSum = Number(row.raw_weighted_sum ?? 0);
    const maxPossible = Number(row.max_possible ?? 0);
    aggregateMap.set(row.contribution_id, {
      weightedVoteScore: toWeightedVoteScore(rawWeightedSum, maxPossible),
      voteCount: Number(row.vote_count ?? 0),
      distinctVoterCount: Number(row.distinct_voter_count ?? 0),
      upvoteCount: Number(row.upvote_count ?? 0),
      downvoteCount: Number(row.downvote_count ?? 0),
    });
  }

  for (const contributionId of contributionIds) {
    if (!aggregateMap.has(contributionId)) {
      aggregateMap.set(contributionId, {
        weightedVoteScore: 50,
        voteCount: 0,
        distinctVoterCount: 0,
        upvoteCount: 0,
        downvoteCount: 0,
      });
    }
  }

  return aggregateMap;
}

async function readAuthoritativeTopicVoteStats(env: ApiEnv, topicIds: string[]) {
  const topicStats = new Map<string, TopicVoteStatsRow>();
  if (topicIds.length === 0) {
    return topicStats;
  }

  const results = await env.DB
    .prepare(
      `
        SELECT
          topic_id,
          COUNT(DISTINCT CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN voter_being_id END) AS distinct_voter_count,
          COUNT(CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN 1 END) AS topic_vote_count
        FROM votes
        WHERE topic_id IN (${buildInClause(topicIds)})
        GROUP BY topic_id
      `,
    )
    .bind(...topicIds)
    .all<AuthoritativeTopicVoteStatsRow>();

  for (const row of results.results ?? []) {
    topicStats.set(row.topic_id, row);
  }

  for (const topicId of topicIds) {
    if (!topicStats.has(topicId)) {
      topicStats.set(topicId, { distinct_voter_count: 0, topic_vote_count: 0 });
    }
  }

  return topicStats;
}

async function reconcileVoteAggregates(
  state: DurableObjectState,
  env: ApiEnv,
  contributionIds: string[],
  topicIds: string[],
) {
  const contributionAggregatesByContributionId = await readAuthoritativeContributionVoteAggregates(env, contributionIds);
  const topicStatsByTopicId = await readAuthoritativeTopicVoteStats(env, topicIds);
  const reconciledAt = new Date().toISOString();

  await Promise.all([
    ...Array.from(contributionAggregatesByContributionId.entries()).map(([contributionId, aggregate]) =>
      state.storage.put(`${TOPIC_STATE_CONTRIBUTION_VOTE_AGGREGATE_PREFIX}${contributionId}`, {
        contributionId,
        voteCount: aggregate.voteCount,
        distinctVoterCount: aggregate.distinctVoterCount,
        upvoteCount: aggregate.upvoteCount,
        downvoteCount: aggregate.downvoteCount,
        weightedVoteScore: aggregate.weightedVoteScore,
        updatedAt: reconciledAt,
        reconciledAt,
      }),
    ),
    ...Array.from(topicStatsByTopicId.entries()).map(([topicId, aggregate]) =>
      state.storage.put(`${TOPIC_STATE_TOPIC_VOTE_AGGREGATE_PREFIX}${topicId}`, {
        topicId,
        topicVoteCount: Number(aggregate.topic_vote_count ?? 0),
        distinctVoterCount: Number(aggregate.distinct_voter_count ?? 0),
        updatedAt: reconciledAt,
        reconciledAt,
      }),
    ),
  ]);

  return { contributionAggregatesByContributionId, topicStatsByTopicId };
}

function readPendingMessages(state: DurableObjectState) {
  return sqlExec(
    state,
    `SELECT id, topic_id, payload_json, flushed, created_at
     FROM pending_messages
     WHERE flushed = 0
     ORDER BY created_at ASC
     LIMIT ?`,
    TOPIC_STATE_PENDING_RECORD_LIMIT,
  ) as PendingMessageRow[];
}

function readPendingScores(state: DurableObjectState, contributionIds: string[]) {
  if (contributionIds.length === 0) {
    return [];
  }
  const placeholders = contributionIds.map(() => "?").join(", ");
  return sqlExec(
    state,
    `SELECT id, contribution_id, payload_json, flushed, created_at
     FROM pending_scores
     WHERE contribution_id IN (${placeholders})`,
    ...contributionIds,
  ) as PendingScoreRow[];
}

function readPendingVotes(state: DurableObjectState) {
  return sqlExec(
    state,
    `SELECT id, vote_key, topic_id, contribution_id, payload_json, flushed, created_at
     FROM pending_votes
     WHERE flushed = 0
     ORDER BY created_at ASC
     LIMIT ?`,
    TOPIC_STATE_PENDING_RECORD_LIMIT,
  ) as PendingVoteRow[];
}

function readPendingAuxVotes(state: DurableObjectState) {
  return sqlExec(
    state,
    `SELECT id, payload_json, flushed, created_at
     FROM pending_aux
     WHERE flushed = 0 AND table_name = 'votes' AND operation = 'insert'
     ORDER BY created_at ASC
     LIMIT ?`,
    TOPIC_STATE_PENDING_RECORD_LIMIT,
  ) as Array<{ id: string; payload_json: string; flushed: number; created_at: string }>;
}

function readPendingAuxEpistemicClaims(state: DurableObjectState) {
  return sqlExec(
    state,
    `SELECT id, payload_json, flushed, created_at
     FROM pending_aux
     WHERE flushed = 0 AND table_name = 'epistemic_claims' AND operation = 'upsert'
     ORDER BY created_at ASC
     LIMIT ?`,
    TOPIC_STATE_PENDING_RECORD_LIMIT,
  ) as Array<{ id: string; payload_json: string; flushed: number; created_at: string }>;
}

async function flushContributionRecords(
  state: DurableObjectState,
  env: ApiEnv,
): Promise<{
  flushedContributionIds: string[];
  flushedTopicIds: string[];
  topicChangeSequences: Map<string, number>;
  remainingCount: number;
}> {
  const messages = readPendingMessages(state);
  if (messages.length === 0) {
    return { flushedContributionIds: [], flushedTopicIds: [], topicChangeSequences: new Map(), remainingCount: 0 };
  }

  const contributionIds = messages.map((row) => row.id);
  const scores = readPendingScores(state, contributionIds);
  const scoreByContributionId = new Map<string, PendingScoreRow>();
  for (const score of scores) {
    scoreByContributionId.set(score.contribution_id, score);
  }

  const statements: D1PreparedStatement[] = [];
  const statementOwners: Array<{ type: "message" | "score"; id: string; contributionId: string; topicId?: string }> = [];
  const flushRecords = new Map<
    string,
    {
      contributionId: string;
      topicId: string;
      messageId: string;
      scoreId: string | null;
      messageSucceeded: boolean;
      scoreSucceeded: boolean;
    }
  >();
  for (const message of messages) {
    const payload = JSON.parse(message.payload_json) as Record<string, unknown>;
    const contributionId = String(payload.id);
    const topicId = String(payload.topic_id);
    const score = scoreByContributionId.get(message.id);
    flushRecords.set(contributionId, {
      contributionId,
      topicId,
      messageId: message.id,
      scoreId: score?.id ?? null,
      messageSucceeded: false,
      scoreSucceeded: Number(score?.flushed ?? 0) === 1,
    });
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO contributions (
          id, topic_id, round_id, being_id, body, body_clean, visibility, guardrail_decision, idempotency_key, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        payload.id,
        payload.topic_id,
        payload.round_id,
        payload.being_id,
        payload.body,
        payload.body_clean,
        payload.visibility,
        payload.guardrail_decision,
        payload.idempotency_key,
        payload.submitted_at,
      ),
    );
    statementOwners.push({ type: "message", id: message.id, contributionId, topicId });

    if (!score || Number(score.flushed) === 1) {
      continue;
    }
    const scorePayload = JSON.parse(score.payload_json) as Record<string, unknown>;
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO contribution_scores (
          id, contribution_id, substance_score, relevance, novelty, reframe, role_bonus, initial_score, final_score,
          shadow_initial_score, shadow_final_score, heuristic_score, semantic_score, live_score, shadow_score,
          score_version, shadow_version, scoring_profile, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        scorePayload.id,
        scorePayload.contribution_id,
        scorePayload.substance_score,
        scorePayload.relevance,
        scorePayload.novelty,
        scorePayload.reframe,
        scorePayload.role_bonus,
        scorePayload.initial_score,
        scorePayload.final_score,
        scorePayload.shadow_initial_score,
        scorePayload.shadow_final_score,
        scorePayload.heuristic_score,
        scorePayload.semantic_score,
        // Compatibility mirrors intentionally freeze at ingest-time initial scores.
        scorePayload.initial_score,
        scorePayload.shadow_initial_score,
        scorePayload.score_version,
        scorePayload.shadow_version,
        scorePayload.scoring_profile,
        JSON.stringify(scorePayload.details_json),
      ),
    );
    statementOwners.push({ type: "score", id: score.id, contributionId: String(scorePayload.contribution_id) });
  }

  let results: Array<{ success?: boolean; error?: string }> = [];
  try {
    results = (await env.DB.batch(statements)) as Array<{ success?: boolean; error?: string }>;
  } catch (error) {
    console.error("topic-state contribution flush batch failed", error);
    return { flushedContributionIds: [], flushedTopicIds: [], topicChangeSequences: new Map(), remainingCount: messages.length };
  }

  const flushedContributionIds = new Set<string>();
  const flushedTopicIds = new Set<string>();
  const topicChangeSequences = new Map<string, number>();
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const owner = statementOwners[index];
    if (!result || result.error || result.success === false) {
      continue;
    }
    const record = flushRecords.get(owner.contributionId);
    if (!record) {
      continue;
    }
    if (owner.type === "message") {
      record.messageSucceeded = true;
    } else {
      record.scoreSucceeded = true;
    }
  }

  for (const record of flushRecords.values()) {
    if (!record.messageSucceeded || !record.scoreSucceeded) {
      continue;
    }
    sqlExec(state, `UPDATE pending_messages SET flushed = 1 WHERE id = ?`, record.messageId);
    if (record.scoreId) {
      sqlExec(state, `UPDATE pending_scores SET flushed = 1 WHERE id = ?`, record.scoreId);
    }
    flushedContributionIds.add(record.contributionId);
    flushedTopicIds.add(record.topicId);
    const payload = JSON.parse(String(messages.find((message) => message.id === record.messageId)?.payload_json ?? "{}")) as {
      change_sequence?: number;
    };
    const changeSequence = Number(payload.change_sequence ?? 0);
    if (changeSequence > Number(topicChangeSequences.get(record.topicId) ?? 0)) {
      topicChangeSequences.set(record.topicId, changeSequence);
    }
  }

  const remainingRow = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_messages WHERE flushed = 0`)[0] as { count?: number } | undefined;
  return {
    flushedContributionIds: Array.from(flushedContributionIds),
    flushedTopicIds: Array.from(flushedTopicIds),
    topicChangeSequences,
    remainingCount: Number(remainingRow?.count ?? 0),
  };
}

async function flushVoteRecords(
  state: DurableObjectState,
  env: ApiEnv,
): Promise<{
  flushedContributionIds: string[];
  flushedTopicIds: string[];
  topicChangeSequences: Map<string, number>;
  remainingCount: number;
}> {
  const votes = [
    ...readPendingVotes(state).map((vote) => ({ ...vote, source: "legacy" as const })),
    ...readPendingAuxVotes(state).map((vote) => ({ ...vote, source: "aux" as const })),
  ].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  if (votes.length === 0) {
    return { flushedContributionIds: [], flushedTopicIds: [], topicChangeSequences: new Map(), remainingCount: 0 };
  }

  const parsedVotes = votes.map((vote) => ({
    vote,
    payload: JSON.parse(vote.payload_json) as Record<string, unknown>,
  }));

  const statements = parsedVotes.map(({ payload }) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO votes (
        id, topic_id, round_id, contribution_id, voter_being_id, direction, weight, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      payload.voteId,
      payload.topicId,
      payload.roundId,
      payload.contributionId,
      payload.voterBeingId,
      payload.direction,
      payload.weight,
      payload.acceptedAt,
    ),
  );

  let results: Array<{ success?: boolean; error?: string }> = [];
  try {
    results = (await env.DB.batch(statements)) as Array<{ success?: boolean; error?: string }>;
  } catch (error) {
    console.error("topic-state vote flush batch failed", error);
    return { flushedContributionIds: [], flushedTopicIds: [], topicChangeSequences: new Map(), remainingCount: votes.length };
  }

  const flushedContributionIds = new Set<string>();
  const flushedTopicIds = new Set<string>();
  const topicChangeSequences = new Map<string, number>();
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (!result || result.error || result.success === false) {
      continue;
    }
    const { vote, payload } = parsedVotes[index];
    if (vote.source === "aux") {
      sqlExec(state, `UPDATE pending_aux SET flushed = 1 WHERE id = ?`, vote.id);
    } else {
      sqlExec(state, `UPDATE pending_votes SET flushed = 1 WHERE id = ?`, vote.id);
    }
    flushedContributionIds.add(String(payload.contributionId));
    flushedTopicIds.add(String(payload.topicId));
    const changeSequence = Number(payload.changeSequence ?? 0);
    if (changeSequence > Number(topicChangeSequences.get(String(payload.topicId)) ?? 0)) {
      topicChangeSequences.set(String(payload.topicId), changeSequence);
    }
  }

  const reconciledVoteAggregates = await reconcileVoteAggregates(
    state,
    env,
    Array.from(flushedContributionIds),
    Array.from(flushedTopicIds),
  );
  await recomputeContributionFinalScores(env, Array.from(flushedContributionIds), reconciledVoteAggregates);

  const remainingLegacy = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_votes WHERE flushed = 0`)[0] as { count?: number } | undefined;
  const remainingAux = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0 AND table_name = 'votes'`)[0] as { count?: number } | undefined;
  return {
    flushedContributionIds: Array.from(flushedContributionIds),
    flushedTopicIds: Array.from(flushedTopicIds),
    topicChangeSequences,
    remainingCount: Number(remainingLegacy?.count ?? 0) + Number(remainingAux?.count ?? 0),
  };
}

async function flushEpistemicClaimRecords(state: DurableObjectState, env: ApiEnv): Promise<void> {
  const rows = readPendingAuxEpistemicClaims(state);
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as {
      contributionId: string;
      topicId: string;
      domainId: string;
      beingId: string;
      claims: Array<{
        ordinal: number;
        body: string;
        normalizedBody: string;
        verifiability: "empirical" | "comparative" | "normative" | "predictive" | "unclassified";
      }>;
    };
    try {
      await updateDomainClaimGraph(env, {
        topicId: payload.topicId,
        domainId: payload.domainId,
        beingId: payload.beingId,
        contributionId: payload.contributionId,
        claims: payload.claims,
      });
      sqlExec(state, `UPDATE pending_aux SET flushed = 1 WHERE id = ?`, row.id);
    } catch (error) {
      console.error(`epistemic claim flush failed for contribution ${payload.contributionId}`, error);
    }
  }
}

export async function flushPendingTopicState(
  state: DurableObjectState,
  env: ApiEnv,
  snapshotRetryTopicIds: string[] = [],
): Promise<{ flushedContributionIds: string[]; remainingCount: number }> {
  const contributionResult = await flushContributionRecords(state, env);
  const voteResult = await flushVoteRecords(state, env);
  await flushEpistemicClaimRecords(state, env);
  const allFlushedContributionIds = new Set([
    ...contributionResult.flushedContributionIds,
    ...voteResult.flushedContributionIds,
  ]);
  const topicChangeSequences = new Map<string, number>();
  for (const [topicId, changeSequence] of contributionResult.topicChangeSequences.entries()) {
    topicChangeSequences.set(topicId, changeSequence);
  }
  for (const [topicId, changeSequence] of voteResult.topicChangeSequences.entries()) {
    if (changeSequence > Number(topicChangeSequences.get(topicId) ?? 0)) {
      topicChangeSequences.set(topicId, changeSequence);
    }
  }
  for (const [topicId, changeSequence] of topicChangeSequences.entries()) {
    await runStatement(
      env.DB.prepare(`UPDATE topics SET change_sequence = MAX(change_sequence, ?) WHERE id = ?`).bind(changeSequence, topicId),
    );
  }

  const retentionCutoff = new Date(Date.now() - TOPIC_STATE_FLUSHED_RETENTION_MS).toISOString();
  const idempotencyCutoff = new Date(Date.now() - TOPIC_STATE_IDEMPOTENCY_RETENTION_MS).toISOString();
  sqlExec(state, `DELETE FROM pending_messages WHERE flushed = 1 AND created_at < ?`, retentionCutoff);
  sqlExec(state, `DELETE FROM pending_scores WHERE flushed = 1 AND created_at < ?`, retentionCutoff);
  sqlExec(state, `DELETE FROM pending_votes WHERE flushed = 1 AND created_at < ?`, retentionCutoff);
  sqlExec(state, `DELETE FROM pending_aux WHERE flushed = 1 AND created_at < ?`, retentionCutoff);
  sqlExec(state, `DELETE FROM idempotency_keys WHERE created_at < ?`, idempotencyCutoff);
  sqlExec(state, `DELETE FROM vote_keys WHERE created_at < ?`, idempotencyCutoff);

  const pendingSnapshotTopics = new Set(snapshotRetryTopicIds);
  for (const topicId of contributionResult.flushedTopicIds) {
    pendingSnapshotTopics.add(topicId);
  }
  for (const topicId of voteResult.flushedTopicIds) {
    pendingSnapshotTopics.add(topicId);
  }
  const failedSnapshots: string[] = [];
  for (const topicId of pendingSnapshotTopics) {
    try {
      await syncTopicSnapshots(env, topicId, "topic_state_flush");
    } catch (error) {
      console.error(`snapshot sync failed after topic-state flush for topic ${topicId}`, error);
      failedSnapshots.push(topicId);
    }
  }
  if (failedSnapshots.length > 0) {
    await state.storage.put(TOPIC_STATE_SNAPSHOT_PENDING_KEY, failedSnapshots);
  } else {
    await state.storage.delete(TOPIC_STATE_SNAPSHOT_PENDING_KEY);
  }

  const remainingMessages = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_messages WHERE flushed = 0`)[0] as { count?: number } | undefined;
  const remainingVotes = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_votes WHERE flushed = 0`)[0] as { count?: number } | undefined;
  const remainingAux = sqlExec(state, `SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0`)[0] as { count?: number } | undefined;
  return {
    flushedContributionIds: Array.from(allFlushedContributionIds),
    remainingCount: Number(remainingMessages?.count ?? 0) + Number(remainingVotes?.count ?? 0) + Number(remainingAux?.count ?? 0),
  };
}
