import {
  TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
  TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
  TOPIC_STATE_FLUSH_INTERVAL_MS,
  TOPIC_STATE_IDLE_CHECK_INTERVAL_MS,
  TOPIC_STATE_IDLE_TIMEOUT_MS,
  TOPIC_STATE_SNAPSHOT_PENDING_KEY,
} from "@opndomain/shared";
import type { ApiEnv } from "../env.js";
import { createId } from "../ids.js";
import { flushPendingTopicState } from "./flush.js";
import { readTopicStateTelemetry, recordTopicStateAcceptLatency } from "./telemetry.js";
import {
  TOPIC_STATE_INIT_SQL,
  type TopicStateIngestRequest,
  type TopicStatePublicResponse,
  type TopicStateVoteIngestRequest,
  type TopicStateVotePublicResponse,
} from "./schema.js";

const TOPIC_STATE_LAST_ACTIVITY_KEY = "meta:last-activity";
const TOPIC_STATE_CHANGE_SEQUENCE_PREFIX = "meta:change-sequence:";
const TOPIC_STATE_TOPIC_VOTE_AGGREGATE_PREFIX = "votes:topic-aggregate:";
const TOPIC_STATE_CONTRIBUTION_VOTE_AGGREGATE_PREFIX = "votes:contribution-aggregate:";
const TOPIC_STATE_TOPIC_VOTER_PREFIX = "votes:topic-voter:";
const TOPIC_STATE_CONTRIBUTION_VOTER_PREFIX = "votes:contribution-voter:";

type TopicVoteAggregate = {
  topicId: string;
  topicVoteCount: number;
  distinctVoterCount: number;
  updatedAt: string;
  reconciledAt: string | null;
};

type ContributionVoteAggregate = {
  contributionId: string;
  topicId: string;
  voteCount: number;
  distinctVoterCount: number;
  upvoteCount: number;
  downvoteCount: number;
  rawWeightedSum: number;
  maxPossible: number;
  weightedVoteScore: number;
  updatedAt: string;
  reconciledAt: string | null;
};

function nextAlarmAfter(delayMs: number): number {
  return Date.now() + delayMs;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sqlExec(state: DurableObjectState, sql: string, ...bindings: unknown[]) {
  return (
    state.storage as DurableObjectStorage & {
      sql: { exec: (statement: string, ...values: unknown[]) => Iterable<Record<string, unknown>> };
    }
  ).sql.exec(sql, ...bindings);
}

function sqlFirst<T>(state: DurableObjectState, sql: string, ...bindings: unknown[]) {
  for (const row of sqlExec(state, sql, ...bindings) as Iterable<T>) {
    return row;
  }
  return null;
}

async function withStorageTransaction<T>(state: DurableObjectState, callback: () => Promise<T> | T): Promise<T> {
  return (
    state.storage as DurableObjectStorage & {
      transaction: <R>(closure: () => Promise<R> | R) => Promise<R>;
    }
  ).transaction(callback);
}

function publicResponseFromPayload(payload: TopicStateIngestRequest): TopicStatePublicResponse {
  return {
    id: payload.contributionId,
    visibility: payload.visibility,
    guardrailDecision: payload.guardrailDecision,
    scores: {
      substance: payload.scores.substanceScore,
      role: payload.scores.detectedRole,
      roleBonus: payload.scores.roleBonus,
      echoDetected: payload.scores.echoDetected,
      metaDetected: payload.scores.metaDetected,
      relevance: payload.scores.relevance,
      novelty: payload.scores.novelty,
      reframe: payload.scores.reframe,
      semanticFlags: payload.scores.semanticFlags,
      initialScore: payload.scores.initialScore,
      finalScore: payload.scores.finalScore,
      shadowInitialScore: payload.scores.shadowInitialScore,
      shadowFinalScore: payload.scores.shadowFinalScore,
    },
  };
}

function voteKeyFromPayload(payload: TopicStateVoteIngestRequest): string {
  return `${payload.roundId}:${payload.voteKind}:${payload.voterBeingId}`;
}

function topicVoteAggregateKey(topicId: string): string {
  return `${TOPIC_STATE_TOPIC_VOTE_AGGREGATE_PREFIX}${topicId}`;
}

function contributionVoteAggregateKey(contributionId: string): string {
  return `${TOPIC_STATE_CONTRIBUTION_VOTE_AGGREGATE_PREFIX}${contributionId}`;
}

function topicVoterKey(topicId: string, voterBeingId: string): string {
  return `${TOPIC_STATE_TOPIC_VOTER_PREFIX}${topicId}:${voterBeingId}`;
}

function contributionVoterKey(contributionId: string, voterBeingId: string): string {
  return `${TOPIC_STATE_CONTRIBUTION_VOTER_PREFIX}${contributionId}:${voterBeingId}`;
}

function toWeightedVoteScore(rawWeightedSum: number, maxPossible: number): number {
  if (!Number.isFinite(maxPossible) || maxPossible <= 0) {
    return 50;
  }
  return clamp(((rawWeightedSum / maxPossible + 1) / 2) * 100, 0, 100);
}

function voteResponseFromPayload(payload: TopicStateVoteIngestRequest, replayed = false): TopicStateVotePublicResponse {
  return {
    id: payload.voteId,
    topicId: payload.topicId,
    roundId: payload.roundId,
    contributionId: payload.contributionId,
    voterBeingId: payload.voterBeingId,
    direction: payload.direction,
    weight: payload.weight,
    voteKind: payload.voteKind,
    weightedValue: payload.weightedValue,
    acceptedAt: payload.acceptedAt,
    replayed,
    pendingFlush: true,
  };
}

async function updatePendingVoteAggregates(state: DurableObjectState, payload: TopicStateVoteIngestRequest): Promise<void> {
  const direction = payload.direction === 1 ? 1 : payload.direction === -1 ? -1 : 0;
  const weight = Number.isFinite(payload.weight) && payload.weight > 0 ? payload.weight : 0;
  if (direction === 0 || weight === 0) {
    return;
  }

  const contributionAggregateStorageKey = contributionVoteAggregateKey(payload.contributionId);
  const topicAggregateStorageKey = topicVoteAggregateKey(payload.topicId);
  const contributionVoterStorageKey = contributionVoterKey(payload.contributionId, payload.voterBeingId);
  const topicVoterStorageKey = topicVoterKey(payload.topicId, payload.voterBeingId);
  const [
    existingContributionAggregate,
    existingTopicAggregate,
    contributionVoteSeen,
    topicVoteSeen,
  ] = await Promise.all([
    state.storage.get<ContributionVoteAggregate>(contributionAggregateStorageKey),
    state.storage.get<TopicVoteAggregate>(topicAggregateStorageKey),
    state.storage.get<boolean>(contributionVoterStorageKey),
    state.storage.get<boolean>(topicVoterStorageKey),
  ]);

  const contributionAggregate: ContributionVoteAggregate = existingContributionAggregate ?? {
    contributionId: payload.contributionId,
    topicId: payload.topicId,
    voteCount: 0,
    distinctVoterCount: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    rawWeightedSum: 0,
    maxPossible: 0,
    weightedVoteScore: 50,
    updatedAt: payload.acceptedAt,
    reconciledAt: null,
  };
  contributionAggregate.voteCount += 1;
  contributionAggregate.rawWeightedSum += direction * weight;
  contributionAggregate.maxPossible += weight;
  contributionAggregate.weightedVoteScore = toWeightedVoteScore(
    contributionAggregate.rawWeightedSum,
    contributionAggregate.maxPossible,
  );
  contributionAggregate.updatedAt = payload.acceptedAt;
  contributionAggregate.reconciledAt = null;
  if (!contributionVoteSeen) {
    contributionAggregate.distinctVoterCount += 1;
  }
  if (direction > 0) {
    contributionAggregate.upvoteCount += 1;
  } else {
    contributionAggregate.downvoteCount += 1;
  }

  const topicAggregate: TopicVoteAggregate = existingTopicAggregate ?? {
    topicId: payload.topicId,
    topicVoteCount: 0,
    distinctVoterCount: 0,
    updatedAt: payload.acceptedAt,
    reconciledAt: null,
  };
  topicAggregate.topicVoteCount += 1;
  topicAggregate.updatedAt = payload.acceptedAt;
  topicAggregate.reconciledAt = null;
  if (!topicVoteSeen) {
    topicAggregate.distinctVoterCount += 1;
  }

  await Promise.all([
    state.storage.put(contributionAggregateStorageKey, contributionAggregate),
    state.storage.put(topicAggregateStorageKey, topicAggregate),
    contributionVoteSeen ? Promise.resolve() : state.storage.put(contributionVoterStorageKey, true),
    topicVoteSeen ? Promise.resolve() : state.storage.put(topicVoterStorageKey, true),
  ]);
}

async function nextTopicChangeSequence(
  state: DurableObjectState,
  topicId: string,
  hintedSequence?: number,
): Promise<number> {
  const key = `${TOPIC_STATE_CHANGE_SEQUENCE_PREFIX}${topicId}`;
  const stored = Number((await state.storage.get<number>(key)) ?? 0);
  const base = Math.max(stored, Number(hintedSequence ?? 0));
  const next = base + 1;
  await state.storage.put(key, next);
  return next;
}

function readPendingVoteSummary(
  state: DurableObjectState,
  roundId: string,
  contributionId: string,
  voterBeingId: string,
  voteKind?: string,
) {
  const rows = sqlExec(
    state,
    `SELECT payload_json FROM pending_votes WHERE flushed = 0
     UNION ALL
     SELECT payload_json FROM pending_aux WHERE flushed = 0 AND table_name = 'votes'`,
  ) as Iterable<{ payload_json: string }>;

  let pendingVoteCount = 0;
  let matchingDirection: number | null = null;
  const pendingVotesByKind: Record<string, number> = {};
  let hasMatchingVoteKind = false;
  let contributionAlreadyTargeted = false;
  for (const row of rows) {
    const payload = JSON.parse(String(row.payload_json)) as TopicStateVoteIngestRequest;
    if (payload.roundId === roundId && payload.voterBeingId === voterBeingId) {
      pendingVoteCount += 1;
      pendingVotesByKind[payload.voteKind] = (pendingVotesByKind[payload.voteKind] ?? 0) + 1;
      if (payload.contributionId === contributionId) {
        matchingDirection = payload.direction;
        contributionAlreadyTargeted = true;
      }
      if (voteKind && payload.voteKind === voteKind) {
        hasMatchingVoteKind = true;
      }
    }
  }

  return {
    pendingVoteCount,
    pendingVotesByKind,
    hasMatchingVoteKey: matchingDirection !== null,
    hasMatchingVoteKind,
    matchingDirection,
    contributionAlreadyTargeted,
  };
}

export class TopicStateDurableObject {
  private initialized = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: ApiEnv,
  ) {}

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    for (const statement of TOPIC_STATE_INIT_SQL) {
      sqlExec(this.state, statement);
    }
    this.initialized = true;
  }

  private async pendingCount() {
    const messages = sqlFirst<{ count: number }>(this.state, `SELECT COUNT(*) AS count FROM pending_messages WHERE flushed = 0`);
    const aux = sqlFirst<{ count: number }>(this.state, `SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0`);
    const votes = sqlFirst<{ count: number }>(this.state, `SELECT COUNT(*) AS count FROM pending_votes WHERE flushed = 0`);
    return Number(messages?.count ?? 0) + Number(aux?.count ?? 0) + Number(votes?.count ?? 0);
  }

  private async scheduleNextAlarm() {
    const pendingCount = await this.pendingCount();
    if (pendingCount > 0) {
      await this.state.storage.setAlarm(nextAlarmAfter(TOPIC_STATE_FLUSH_INTERVAL_MS));
      return;
    }

    const lastActivityAt = await this.state.storage.get<string>(TOPIC_STATE_LAST_ACTIVITY_KEY);
    const lastActivityMs = lastActivityAt ? new Date(lastActivityAt).getTime() : 0;
    if (Date.now() - lastActivityMs > TOPIC_STATE_IDLE_TIMEOUT_MS) {
      return;
    }
    await this.state.storage.setAlarm(nextAlarmAfter(TOPIC_STATE_IDLE_CHECK_INTERVAL_MS));
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
    const url = new URL(request.url);
    const startedAt = Date.now();

    if (url.pathname === "/healthz" && request.method === "GET") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/telemetry" && request.method === "GET") {
      return Response.json(await readTopicStateTelemetry(this.state));
    }
    if (url.pathname === "/count" && request.method === "GET") {
      const topicId = url.searchParams.get("topicId") ?? "";
      const roundIndex = Number(url.searchParams.get("roundIndex") ?? -1);
      const row = sqlFirst<{ count: number }>(
        this.state,
        `SELECT count FROM contribution_counts WHERE topic_id = ? AND round_index = ?`,
        topicId,
        roundIndex,
      );
      return Response.json({ count: Number(row?.count ?? 0) });
    }
    if (url.pathname === "/check-idempotency" && request.method === "GET") {
      const key = url.searchParams.get("key") ?? "";
      const row = sqlFirst<{ contribution_id: string }>(
        this.state,
        `SELECT contribution_id FROM idempotency_keys WHERE key = ?`,
        key,
      );
      return Response.json({
        exists: Boolean(row),
        contributionId: row?.contribution_id ?? null,
      });
    }
    if (url.pathname === "/vote-summary" && request.method === "GET") {
      const roundId = url.searchParams.get("roundId") ?? "";
      const contributionId = url.searchParams.get("contributionId") ?? "";
      const voterBeingId = url.searchParams.get("voterBeingId") ?? "";
      const voteKind = url.searchParams.get("voteKind") ?? undefined;
      return Response.json(readPendingVoteSummary(this.state, roundId, contributionId, voterBeingId, voteKind));
    }
    if (url.pathname === "/vote" && request.method === "POST") {
      const payload = (await request.json()) as TopicStateVoteIngestRequest;
      const idempotencyKey = `vt:${payload.idempotencyKey}`;
      const replayByIdempotency = sqlFirst<{ response_json: string }>(
        this.state,
        `SELECT response_json FROM idempotency_keys WHERE key = ?`,
        idempotencyKey,
      );
      if (replayByIdempotency) {
        return Response.json(JSON.parse(replayByIdempotency.response_json), { status: 200 });
      }
      const voteKey = voteKeyFromPayload(payload);
      const replay = sqlFirst<{ direction: number; vote_kind: string; response_json: string }>(
        this.state,
        `SELECT direction, vote_kind, response_json FROM vote_keys WHERE vote_key = ?`,
        voteKey,
      );
      if (replay) {
        const replayedResponse = JSON.parse(replay.response_json) as { contributionId?: string };
        if (replayedResponse.contributionId !== payload.contributionId) {
          return Response.json(
            {
              error: "vote_kind_already_cast",
              code: "vote_kind_already_cast",
              message: `You already cast a ${payload.voteKind} vote on a different contribution this round.`,
              details: { existingContributionId: replayedResponse.contributionId },
            },
            { status: 409 },
          );
        }
        return Response.json(JSON.parse(replay.response_json), { status: 200 });
      }

      const changeSequence = await nextTopicChangeSequence(this.state, payload.topicId);
      const payloadWithSequence = { ...payload, changeSequence };
      const responseJson = voteResponseFromPayload(payloadWithSequence);
      await withStorageTransaction(this.state, async () => {
        sqlExec(
          this.state,
          `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
           VALUES (?, 'votes', 'insert', ?, 0, ?)`,
          payload.voteId,
          JSON.stringify(payloadWithSequence),
          payload.acceptedAt,
        );
        sqlExec(
          this.state,
          `INSERT INTO vote_keys (vote_key, direction, vote_kind, response_json, created_at) VALUES (?, ?, ?, ?, ?)`,
          voteKey,
          payload.direction,
          payload.voteKind,
          JSON.stringify(responseJson),
          payload.acceptedAt,
        );
        sqlExec(
          this.state,
          `INSERT INTO idempotency_keys (key, contribution_id, response_json, created_at) VALUES (?, ?, ?, ?)`,
          idempotencyKey,
          payload.voteId,
          JSON.stringify(responseJson),
          payload.acceptedAt,
        );
      });
      await updatePendingVoteAggregates(this.state, payloadWithSequence);

      await this.state.storage.put(TOPIC_STATE_LAST_ACTIVITY_KEY, payload.acceptedAt);
      await this.state.storage.setAlarm(nextAlarmAfter(TOPIC_STATE_FLUSH_INTERVAL_MS));
      await recordTopicStateAcceptLatency(this.state, Date.now() - startedAt, payload.acceptedAt);
      return Response.json(responseJson, { status: 200 });
    }
    if (url.pathname === "/round-voter-counts" && request.method === "GET") {
      const roundId = url.searchParams.get("roundId") ?? "";
      const rows = sqlExec(
        this.state,
        `SELECT payload_json FROM pending_votes WHERE flushed = 0
         UNION ALL
         SELECT payload_json FROM pending_aux WHERE flushed = 0 AND table_name = 'votes'`,
      ) as Iterable<{ payload_json: string }>;
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const payload = JSON.parse(String(row.payload_json)) as TopicStateVoteIngestRequest;
        if (payload.roundId === roundId) {
          counts[payload.voterBeingId] = (counts[payload.voterBeingId] ?? 0) + 1;
        }
      }
      return Response.json(counts);
    }
    if (url.pathname === "/force-flush" && request.method === "POST") {
      let remaining = 0;
      for (let attempt = 0; attempt < TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS; attempt += 1) {
        const result = await flushPendingTopicState(this.state, this.env);
        remaining = result.remainingCount;
        if (remaining === TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING) {
          break;
        }
      }
      return Response.json({ flushed: remaining === TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING, remaining }, { status: 200 });
    }
    if (url.pathname !== "/contribute" || request.method !== "POST") {
      return Response.json(
        {
          error: "not_found",
          code: "not_found",
          message: "The requested durable object route was not found.",
        },
        { status: 404 },
      );
    }

    const payload = (await request.json()) as TopicStateIngestRequest;
    const replay = sqlFirst<{ response_json: string }>(
      this.state,
      `SELECT response_json FROM idempotency_keys WHERE key = ?`,
      payload.idempotencyKey,
    );
    if (replay) {
      return Response.json(JSON.parse(replay.response_json), { status: 200 });
    }

    const changeSequence = await nextTopicChangeSequence(this.state, payload.topicId, payload.topicHints?.changeSequence);
    const responseJson = publicResponseFromPayload(payload);
    const messagePayload = {
      id: payload.contributionId,
      topic_id: payload.topicId,
      round_id: payload.roundId,
      being_id: payload.beingId,
      body: payload.body,
      body_clean: payload.bodyClean,
      visibility: payload.visibility,
      guardrail_decision: payload.guardrailDecision,
      idempotency_key: payload.idempotencyKey,
      submitted_at: payload.submittedAt,
      change_sequence: changeSequence,
      stance: payload.stance ?? null,
      target_contribution_id: payload.targetContributionId ?? null,
    };
    const scorePayload = {
      id: createId("sc"),
      contribution_id: payload.contributionId,
      substance_score: payload.scores.substanceScore,
      relevance: payload.scores.relevance,
      novelty: payload.scores.novelty,
      reframe: payload.scores.reframe,
      role_bonus: payload.scores.roleBonus,
      initial_score: payload.scores.initialScore,
      final_score: payload.scores.finalScore,
      shadow_initial_score: payload.scores.shadowInitialScore,
      shadow_final_score: payload.scores.shadowFinalScore,
      heuristic_score: payload.scores.substanceScore,
      semantic_score: payload.scores.semanticScore,
      score_version: payload.scoreVersion,
      shadow_version: payload.shadowVersion,
      scoring_profile: payload.scoringProfile,
      details_json: payload.scores.details,
    };
    const epistemicPayload = payload.claims
      ? {
          contributionId: payload.contributionId,
          topicId: payload.topicId,
          domainId: payload.claims.domainId,
          beingId: payload.beingId,
          claims: payload.claims.items,
          submittedAt: payload.submittedAt,
        }
      : null;

    await withStorageTransaction(this.state, async () => {
      sqlExec(
        this.state,
        `INSERT INTO pending_messages (id, topic_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
        payload.contributionId,
        payload.topicId,
        JSON.stringify(messagePayload),
        payload.submittedAt,
      );
      sqlExec(
        this.state,
        `INSERT INTO pending_scores (id, contribution_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
        scorePayload.id,
        payload.contributionId,
        JSON.stringify(scorePayload),
        payload.submittedAt,
      );
      sqlExec(
        this.state,
        `INSERT INTO idempotency_keys (key, contribution_id, response_json, created_at) VALUES (?, ?, ?, ?)`,
        payload.idempotencyKey,
        payload.contributionId,
        JSON.stringify(responseJson),
        payload.submittedAt,
      );
      sqlExec(
        this.state,
        `INSERT INTO contribution_counts (topic_id, round_index, count) VALUES (?, ?, 1)
         ON CONFLICT(topic_id, round_index) DO UPDATE SET count = count + 1`,
        payload.topicId,
        payload.roundIndex,
      );
      sqlExec(
        this.state,
        `INSERT OR REPLACE INTO latest_round_contributions (contribution_id, topic_id, round_index, being_id, visibility, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        payload.contributionId,
        payload.topicId,
        payload.roundIndex,
        payload.beingId,
        payload.visibility,
        payload.submittedAt,
      );
      if (epistemicPayload && epistemicPayload.claims.length > 0) {
        sqlExec(
          this.state,
          `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
           VALUES (?, 'epistemic_claims', 'upsert', ?, 0, ?)
           ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at, flushed = 0`,
          payload.contributionId,
          JSON.stringify(epistemicPayload),
          payload.submittedAt,
        );
      }
    });

    await this.state.storage.put(TOPIC_STATE_LAST_ACTIVITY_KEY, payload.submittedAt);
    await this.state.storage.setAlarm(nextAlarmAfter(TOPIC_STATE_FLUSH_INTERVAL_MS));
    await recordTopicStateAcceptLatency(this.state, Date.now() - startedAt, payload.submittedAt);
    return Response.json(responseJson, { status: 200 });
  }

  async alarm(): Promise<void> {
    await this.ensureInitialized();
    const snapshotPending = (await this.state.storage.get<string[]>(TOPIC_STATE_SNAPSHOT_PENDING_KEY)) ?? [];
    await flushPendingTopicState(this.state, this.env, snapshotPending);
    await this.scheduleNextAlarm();
  }
}
