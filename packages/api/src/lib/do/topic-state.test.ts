import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOPIC_STATE_SNAPSHOT_PENDING_KEY } from "@opndomain/shared";
import { TopicStateDurableObject } from "./topic-state.js";
import { flushPendingTopicState } from "./flush.js";
import { readTopicStateTelemetry } from "./telemetry.js";

class FakeSql {
  readonly pendingMessages = new Map<string, Record<string, unknown>>();
  readonly pendingScores = new Map<string, Record<string, unknown>>();
  readonly pendingVotes = new Map<string, Record<string, unknown>>();
  readonly pendingAux = new Map<string, Record<string, unknown>>();
  readonly idempotency = new Map<string, Record<string, unknown>>();
  readonly voteKeys = new Map<string, Record<string, unknown>>();
  readonly counts = new Map<string, number>();
  readonly latest = new Map<string, Record<string, unknown>>();

  exec(statement: string, ...values: unknown[]) {
    const sql = statement.replace(/\s+/g, " ").trim();
    if (
      sql.startsWith("CREATE TABLE") ||
      sql.startsWith("CREATE INDEX") ||
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK"
    ) {
      return [];
    }
    if (sql.startsWith("INSERT INTO pending_messages")) {
      this.pendingMessages.set(String(values[0]), {
        id: values[0],
        topic_id: values[1],
        payload_json: values[2],
        flushed: 0,
        created_at: values[3],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO pending_scores")) {
      this.pendingScores.set(String(values[0]), {
        id: values[0],
        contribution_id: values[1],
        payload_json: values[2],
        flushed: 0,
        created_at: values[3],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO pending_votes")) {
      this.pendingVotes.set(String(values[0]), {
        id: values[0],
        vote_key: values[1],
        topic_id: values[2],
        contribution_id: values[3],
        payload_json: values[4],
        flushed: 0,
        created_at: values[5],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO pending_aux")) {
      const tableName = sql.includes("'epistemic_claims'") ? "epistemic_claims" : "votes";
      const operation = sql.includes("'upsert'") ? "upsert" : "insert";
      this.pendingAux.set(String(values[0]), {
        id: values[0],
        table_name: tableName,
        operation,
        payload_json: values[1],
        flushed: 0,
        created_at: values[2],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO idempotency_keys")) {
      this.idempotency.set(String(values[0]), {
        key: values[0],
        contribution_id: values[1],
        response_json: values[2],
        created_at: values[3],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO vote_keys")) {
      this.voteKeys.set(String(values[0]), {
        vote_key: values[0],
        direction: values[1],
        vote_kind: values[2],
        response_json: values[3],
        created_at: values[4],
      });
      return [];
    }
    if (sql.startsWith("INSERT INTO contribution_counts")) {
      const key = `${values[0]}:${values[1]}`;
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      return [];
    }
    if (sql.startsWith("INSERT OR REPLACE INTO latest_round_contributions")) {
      this.latest.set(String(values[0]), {
        contribution_id: values[0],
        topic_id: values[1],
        round_index: values[2],
        being_id: values[3],
        visibility: values[4],
        created_at: values[5],
      });
      return [];
    }
    if (sql.includes("SELECT response_json FROM idempotency_keys")) {
      const row = this.idempotency.get(String(values[0]));
      return row ? [row] : [];
    }
    if (sql.includes("SELECT direction, vote_kind, response_json FROM vote_keys")) {
      const row = this.voteKeys.get(String(values[0]));
      return row ? [row] : [];
    }
    if (sql.includes("SELECT contribution_id FROM idempotency_keys")) {
      const row = this.idempotency.get(String(values[0]));
      return row ? [{ contribution_id: row.contribution_id }] : [];
    }
    if (sql.includes("SELECT count FROM contribution_counts")) {
      const count = this.counts.get(`${values[0]}:${values[1]}`) ?? 0;
      return [{ count }];
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM pending_messages WHERE flushed = 0")) {
      return [{ count: Array.from(this.pendingMessages.values()).filter((row) => Number(row.flushed) === 0).length }];
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0 AND table_name = 'votes'")) {
      return [{ count: Array.from(this.pendingAux.values()).filter((row) => Number(row.flushed) === 0).length }];
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0 AND table_name != 'votes'")) {
      return [{
        count: Array.from(this.pendingAux.values()).filter(
          (row) => Number(row.flushed) === 0 && String(row.table_name) !== "votes",
        ).length,
      }];
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM pending_aux WHERE flushed = 0")) {
      return [{ count: Array.from(this.pendingAux.values()).filter((row) => Number(row.flushed) === 0).length }];
    }
    if (sql.startsWith("SELECT id, topic_id, payload_json")) {
      const limit = Number(values[0] ?? 80);
      return Array.from(this.pendingMessages.values())
        .filter((row) => Number(row.flushed) === 0)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, limit);
    }
    if (sql.startsWith("SELECT id, contribution_id, payload_json")) {
      const contributionIds = new Set(values.map(String));
      return Array.from(this.pendingScores.values()).filter((row) => contributionIds.has(String(row.contribution_id)));
    }
    if (sql.startsWith("SELECT payload_json FROM pending_scores WHERE flushed = 0")) {
      return Array.from(this.pendingScores.values())
        .filter((row) => Number(row.flushed) === 0)
        .map((row) => ({ payload_json: row.payload_json }));
    }
    if (sql.startsWith("SELECT id, vote_key, topic_id, contribution_id, payload_json")) {
      const limit = Number(values[0] ?? 80);
      return Array.from(this.pendingVotes.values())
        .filter((row) => Number(row.flushed) === 0)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, limit);
    }
    if (sql.startsWith("SELECT id, payload_json, flushed, created_at FROM pending_aux")) {
      const limit = Number(values[0] ?? 80);
      return Array.from(this.pendingAux.values())
        .filter((row) => Number(row.flushed) === 0 && (
          (sql.includes("table_name = 'votes'") && String(row.table_name) === "votes") ||
          (sql.includes("table_name = 'epistemic_claims'") && String(row.table_name) === "epistemic_claims")
        ))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, limit);
    }
    if (sql.startsWith("SELECT vote_key, payload_json FROM pending_votes WHERE flushed = 0")) {
      return Array.from(this.pendingVotes.values())
        .filter((row) => Number(row.flushed) === 0)
        .map((row) => ({
          vote_key: row.vote_key,
          payload_json: row.payload_json,
        }));
    }
    if (sql.startsWith("SELECT payload_json FROM pending_votes WHERE flushed = 0")) {
      return [
        ...Array.from(this.pendingVotes.values()),
        ...Array.from(this.pendingAux.values()).filter((row) => String(row.table_name) === "votes"),
      ]
        .filter((row) => Number(row.flushed) === 0)
        .map((row) => ({ payload_json: row.payload_json }));
    }
    if (sql.startsWith("UPDATE pending_messages SET flushed = 1")) {
      const row = this.pendingMessages.get(String(values[0]));
      if (row) {
        row.flushed = 1;
      }
      return [];
    }
    if (sql.startsWith("UPDATE pending_scores SET flushed = 1")) {
      const row = this.pendingScores.get(String(values[0]));
      if (row) {
        row.flushed = 1;
      }
      return [];
    }
    if (sql.startsWith("UPDATE pending_votes SET flushed = 1")) {
      const row = this.pendingVotes.get(String(values[0]));
      if (row) {
        row.flushed = 1;
      }
      return [];
    }
    if (sql.startsWith("UPDATE pending_aux SET flushed = 1")) {
      const row = this.pendingAux.get(String(values[0]));
      if (row) {
        row.flushed = 1;
      }
      return [];
    }
    if (sql.startsWith("DELETE FROM pending_messages")) {
      for (const [key, row] of this.pendingMessages.entries()) {
        if (Number(row.flushed) === 1 && String(row.created_at) < String(values[0])) {
          this.pendingMessages.delete(key);
        }
      }
      return [];
    }
    if (sql.startsWith("DELETE FROM pending_scores")) {
      for (const [key, row] of this.pendingScores.entries()) {
        if (Number(row.flushed) === 1 && String(row.created_at) < String(values[0])) {
          this.pendingScores.delete(key);
        }
      }
      return [];
    }
    if (sql.startsWith("DELETE FROM pending_votes")) {
      for (const [key, row] of this.pendingVotes.entries()) {
        if (Number(row.flushed) === 1 && String(row.created_at) < String(values[0])) {
          this.pendingVotes.delete(key);
        }
      }
      return [];
    }
    if (sql.startsWith("DELETE FROM pending_aux")) {
      for (const [key, row] of this.pendingAux.entries()) {
        if (Number(row.flushed) === 1 && String(row.created_at) < String(values[0])) {
          this.pendingAux.delete(key);
        }
      }
      return [];
    }
    if (sql.startsWith("DELETE FROM idempotency_keys")) {
      return [];
    }
    if (sql.startsWith("DELETE FROM vote_keys")) {
      return [];
    }
    if (sql.includes("SELECT COUNT(*) AS count FROM pending_votes WHERE flushed = 0")) {
      return [{ count: Array.from(this.pendingVotes.values()).filter((row) => Number(row.flushed) === 0).length }];
    }
    throw new Error(`Unhandled SQL in test fake: ${sql}`);
  }
}

class FakeStorage {
  private values = new Map<string, unknown>();
  readonly sql = new FakeSql();
  alarmAt: number | null = null;

  async transaction<T>(closure: () => Promise<T> | T) {
    return await closure();
  }

  async get<T>(key: string) {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async setAlarm(scheduledTime: number) {
    this.alarmAt = scheduledTime;
  }
}

class FakeDb {
  batchCalls = 0;
  executedBatches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  throwOnBatch = false;
  nextBatchResults: Array<{ success?: boolean; error?: string }> | null = null;
  throwOnRunMatch: RegExp | null = null;
  persistedContributionIds = new Set<string>();
  persistedScoreIds = new Set<string>();
  persistedVoteIds = new Set<string>();
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  prepare(sql: string) {
    return new FakeQueryStatement(sql, this);
  }

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, [...(this.firstQueue.get(sqlFragment) ?? []), ...rows]);
  }

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, [...(this.allQueue.get(sqlFragment) ?? []), ...rows]);
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return [];
    }
    return entry[1] as T[];
  }

  async batch(statements: Array<{ sql: string; bindings: unknown[] }>) {
    this.batchCalls += 1;
    this.executedBatches.push(statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    if (this.throwOnBatch) {
      throw new Error("simulated partial failure");
    }
    const results: Array<{ success?: boolean; error?: string }> =
      this.nextBatchResults ?? statements.map(() => ({ success: true }));
    this.nextBatchResults = null;
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      const result = results[index];
      if (!result || result.error || result.success === false) {
        continue;
      }
      if (statement.sql.includes("INSERT OR IGNORE INTO contributions")) {
        this.persistedContributionIds.add(String(statement.bindings[0]));
      }
      if (statement.sql.includes("INSERT OR IGNORE INTO contribution_scores")) {
        this.persistedScoreIds.add(String(statement.bindings[0]));
      }
      if (statement.sql.includes("INSERT OR IGNORE INTO votes")) {
        this.persistedVoteIds.add(String(statement.bindings[0]));
      }
    }
    return results;
  }
}

class FakeQueryStatement {
  constructor(
    readonly sql: string,
    private readonly db: FakeDb,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new FakeQueryStatement(this.sql, this.db, bindings);
  }

  async first<T>() {
    return this.db.consumeFirst<T>(this.sql);
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql) };
  }

  async run() {
    if (this.db.throwOnRunMatch?.test(this.sql)) {
      throw new Error(`simulated run failure for ${this.sql}`);
    }
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    return { success: true };
  }
}

class FakeBucket {
  putCalls: string[] = [];
  failKeys = new Set<string>();

  async put(key: string, _value: unknown, _options?: unknown) {
    if (this.failKeys.has(key)) {
      throw new Error(`simulated bucket failure for ${key}`);
    }
    this.putCalls.push(key);
  }
}

function queueSnapshotRows(db: FakeDb, topicId = "top_1") {
  db.queueFirst("FROM topics", [
    {
      id: topicId,
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      status: "started",
      current_round_index: 0,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
  db.queueAll("FROM rounds", [
    {
      id: "rnd_1",
      sequence_index: 0,
      round_kind: "debate",
      status: "active",
      starts_at: null,
      ends_at: null,
    },
  ]);
  db.queueAll("FROM contributions c", [
    {
      id: "cnt_1",
      round_id: "rnd_1",
      being_id: "bng_1",
      being_handle: "being-1",
      body_clean: "Body",
      visibility: "normal",
      submitted_at: "2026-03-25T00:00:00.000Z",
      heuristic_score: 77,
      live_score: null,
    },
  ]);
  db.queueFirst("FROM topic_members", [{ count: 1 }]);
  db.queueFirst("FROM contributions", [{ count: 1 }]);
}

function buildPayload() {
  return {
    contributionId: "cnt_1",
    idempotencyKey: "idem_12345678",
    topicId: "top_1",
    roundId: "rnd_1",
    roundIndex: 0,
    beingId: "bng_1",
    body: "Body",
    bodyClean: "Body",
    visibility: "normal",
    guardrailDecision: "allow",
    scoreVersion: "6",
    shadowVersion: "7",
    scoringProfile: "adversarial",
    submittedAt: "2026-03-25T00:00:00.000Z",
    scores: {
      substanceScore: 77,
      relevance: 70,
      novelty: 60,
      reframe: 64,
      roleBonus: 12,
      detectedRole: "evidence",
      echoDetected: false,
      metaDetected: false,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      agreementNovDampenLive: 1,
      agreementNovDampenShadow: 1,
      semanticScore: 64.67,
      semanticFlags: [],
      initialScore: 68,
      finalScore: 68,
      shadowInitialScore: 67,
      shadowFinalScore: 67,
      details: {
        version: "phase3_v1",
        substance: 77,
        sentenceContribution: 12,
        uniqueTermRatio: 20,
        specificity: 0,
        evidence: 0,
        vagueness: 0,
        wordCount: 1,
        role: "evidence",
        roleBonus: 12,
        echoDetected: false,
        metaDetected: false,
        liveMultiplier: 1,
        shadowMultiplier: 1,
        relevance: 70,
        novelty: 60,
        reframe: 64,
        semanticFlags: [],
        riskScore: 0,
        riskFamilies: [],
        transforms: [],
        agreementNovDampenLive: 1,
        agreementNovDampenShadow: 1,
        heuristic: {
          sentenceCount: 1,
          sentenceContribution: 12,
          wordCount: 1,
          uniqueWordCount: 1,
          uniqueTermRatioScore: 20,
          specificityScore: 0,
          evidenceScore: 0,
          vaguenessPenalty: 0,
          densityMultiplier: 1,
          substanceScore: 77,
        },
        roleAnalysis: {
          detectedRole: "evidence",
          roleBonus: 12,
          echoDetected: false,
          metaDetected: false,
          familyWeights: { evidence: 3 },
          familyMatches: { evidence: 1 },
          liveEligible: true,
          shadowEligible: false,
        },
        semantic: {
          enabled: true,
          topicEmbeddingText: "Prompt",
          comparisonWindow: {
            scope: "topic_recent_transcript",
            size: 20,
            includedVisibilities: ["normal", "low_confidence"],
            includedDecisions: ["allow", "queue"],
            topicEmbeddingSource: "topic_prompt_only",
          },
          comparedContributionIds: [],
          semanticFlags: [],
          relevance: 70,
          novelty: 60,
          reframe: 64,
          semanticAverage: 64.67,
        },
      },
    },
  };
}

function queueVoteRecomputeRows(db: FakeDb, topicId = "top_1") {
  db.queueAll("FROM contribution_scores cs", [
    {
      contribution_id: "cnt_1",
      substance_score: 77,
      role_bonus: 12,
      details_json: JSON.stringify({
        role: "evidence",
        roleAnalysis: { detectedRole: "evidence" },
      }),
      relevance: 70,
      novelty: 60,
      reframe: 64,
      initial_score: 68,
      shadow_initial_score: 67,
      scoring_profile: "adversarial",
      round_kind: "critique",
      template_id: "debate_v2",
      topic_id: topicId,
    },
  ]);
  db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
    { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
  ]);
  db.queueAll("GROUP BY contribution_id", [
    {
      contribution_id: "cnt_1",
      vote_count: 1,
      distinct_voter_count: 1,
      upvote_count: 1,
      downvote_count: 0,
      raw_weighted_sum: 2,
      max_possible: 2,
    },
  ]);
  db.queueAll("GROUP BY topic_id", [
    { topic_id: topicId, distinct_voter_count: 1, topic_vote_count: 1 },
  ]);
}

describe("topic state durable object", () => {
  it("replays the exact stored response body for repeated idempotency keys", async () => {
    const storage = new FakeStorage();
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      { DB: new FakeDb() as never } as never,
    );

    const first = await object.fetch(
      new Request("https://topic-state.internal/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload()),
      }),
    );
    const second = await object.fetch(
      new Request("https://topic-state.internal/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload()),
      }),
    );

    const firstPayload = await first.json();
    const secondPayload = await second.json();
    assert.deepEqual(firstPayload, secondPayload);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(storage.sql.pendingMessages.size, 1);
    assert.equal(storage.sql.idempotency.size, 1);
    const payload = firstPayload as { scores: { finalScore: number } };
    assert.equal(payload.scores.finalScore, 68);
  });

  it("leaves pending rows unflushed when the batch throws", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    db.throwOnBatch = true;
    const payload = buildPayload();

    storage.sql.exec(
      `INSERT INTO pending_messages (id, topic_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
      payload.contributionId,
      payload.topicId,
      JSON.stringify({
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
      }),
      payload.submittedAt,
    );
    storage.sql.exec(
      `INSERT INTO pending_scores (id, contribution_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
      "sc_1",
      payload.contributionId,
      JSON.stringify({
        id: "sc_1",
        contribution_id: payload.contributionId,
        substance_score: payload.scores.substanceScore,
        relevance: payload.scores.relevance,
        novelty: payload.scores.novelty,
        reframe: payload.scores.reframe,
        role_bonus: payload.scores.roleBonus,
        heuristic_score: payload.scores.substanceScore,
        semantic_score: payload.scores.semanticScore,
        score_version: payload.scoreVersion,
        shadow_version: payload.shadowVersion,
        scoring_profile: payload.scoringProfile,
        details_json: payload.scores.details,
      }),
      payload.submittedAt,
    );

    const originalConsoleError = console.error;
    let result: Awaited<ReturnType<typeof flushPendingTopicState>>;
    try {
      console.error = () => undefined;
      result = await flushPendingTopicState(
        {
          storage,
        } as never,
        {
          DB: db as never,
          SNAPSHOTS: { put: async () => undefined } as never,
          PUBLIC_ARTIFACTS: { put: async () => undefined } as never,
          PUBLIC_CACHE: { delete: async () => undefined } as never,
          TOPIC_TRANSCRIPT_PREFIX: "topics",
          CURATED_OPEN_KEY: "curated/open.json",
        } as never,
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(result.flushedContributionIds.length, 0);
    assert.equal(result.remainingCount, 1);
    assert.equal(Number(storage.sql.pendingMessages.get(payload.contributionId)?.flushed ?? 0), 0);
  });

  it("keeps message and score pending until the flush pair fully succeeds", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const artifacts = new FakeBucket();
    const payload = { ...buildPayload(), submittedAt: new Date().toISOString() };

    storage.sql.exec(
      `INSERT INTO pending_messages (id, topic_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
      payload.contributionId,
      payload.topicId,
      JSON.stringify({
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
      }),
      payload.submittedAt,
    );
    storage.sql.exec(
      `INSERT INTO pending_scores (id, contribution_id, payload_json, flushed, created_at) VALUES (?, ?, ?, 0, ?)`,
      "sc_1",
      payload.contributionId,
      JSON.stringify({
        id: "sc_1",
        contribution_id: payload.contributionId,
        substance_score: payload.scores.substanceScore,
        relevance: payload.scores.relevance,
        novelty: payload.scores.novelty,
        reframe: payload.scores.reframe,
        role_bonus: payload.scores.roleBonus,
        heuristic_score: payload.scores.substanceScore,
        semantic_score: payload.scores.semanticScore,
        score_version: payload.scoreVersion,
        shadow_version: payload.shadowVersion,
        scoring_profile: payload.scoringProfile,
        details_json: payload.scores.details,
      }),
      payload.submittedAt,
    );

    db.nextBatchResults = [{ success: true }, { success: false, error: "score insert failed" }];
    let result = await flushPendingTopicState(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.equal(result.flushedContributionIds.length, 0);
    assert.equal(result.remainingCount, 1);
    assert.equal(Number(storage.sql.pendingMessages.get(payload.contributionId)?.flushed ?? 0), 0);
    assert.equal(Number(storage.sql.pendingScores.get("sc_1")?.flushed ?? 0), 0);
    assert.equal(db.persistedContributionIds.has(payload.contributionId), true);
    assert.equal(db.persistedScoreIds.has("sc_1"), false);
    assert.equal(snapshots.putCalls.length, 0);
    assert.equal(await storage.get<string[]>(TOPIC_STATE_SNAPSHOT_PENDING_KEY), null);

    queueSnapshotRows(db, payload.topicId);
    result = await flushPendingTopicState(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.deepEqual(result.flushedContributionIds, [payload.contributionId]);
    assert.equal(result.remainingCount, 0);
    assert.equal(Number(storage.sql.pendingMessages.get(payload.contributionId)?.flushed ?? 0), 1);
    assert.equal(Number(storage.sql.pendingScores.get("sc_1")?.flushed ?? 0), 1);
    assert.equal(db.persistedScoreIds.has("sc_1"), true);
    assert.equal(snapshots.putCalls.some((key) => key.includes(`${payload.topicId}/transcript.json`)), true);
  });

  it("keeps only failed snapshot retry topics queued across idle alarms", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const artifacts = new FakeBucket();
    const publicCacheDeletes: string[] = [];
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: {
          delete: async (key: string) => {
            publicCacheDeletes.push(key);
          },
        } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    await storage.put(TOPIC_STATE_SNAPSHOT_PENDING_KEY, ["top_1", "top_2"]);
    queueSnapshotRows(db, "top_1");
    queueSnapshotRows(db, "top_2");
    snapshots.failKeys.add("topics/top_1/transcript.json");

    const originalConsoleError = console.error;
    try {
      console.error = () => undefined;
      await object.alarm();
    } finally {
      console.error = originalConsoleError;
    }

    assert.deepEqual(await storage.get<string[]>(TOPIC_STATE_SNAPSHOT_PENDING_KEY), ["top_1"]);
    assert.equal(snapshots.putCalls.some((key) => key.includes("top_2/transcript.json")), true);

    queueSnapshotRows(db, "top_1");
    snapshots.failKeys.delete("topics/top_1/transcript.json");
    await object.alarm();

    assert.equal(await storage.get<string[]>(TOPIC_STATE_SNAPSHOT_PENDING_KEY), null);
    assert.equal(snapshots.putCalls.some((key) => key.includes("top_1/transcript.json")), true);
    assert.equal(publicCacheDeletes.some((key) => key.endsWith("top_1")), true);
  });

  it("replays canonical vote responses and rejects conflicting duplicates", async () => {
    const storage = new FakeStorage();
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      { DB: new FakeDb() as never } as never,
    );

    const first = await object.fetch(
      new Request("https://topic-state.internal/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: "vot_1",
          topicId: "top_1",
          roundId: "rnd_1",
          contributionId: "cnt_1",
          voterBeingId: "bng_2",
          direction: 1,
          weight: 2,
          voteKind: "most_interesting",
          weightedValue: 2,
          acceptedAt: "2026-03-25T00:00:00.000Z",
          idempotencyKey: "idem_vote_1",
          targetRoundId: "rnd_0",
        }),
      }),
    );
    const replay = await object.fetch(
      new Request("https://topic-state.internal/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: "vot_2",
          topicId: "top_1",
          roundId: "rnd_1",
          contributionId: "cnt_1",
          voterBeingId: "bng_2",
          direction: 1,
          weight: 2,
          voteKind: "most_interesting",
          weightedValue: 2,
          acceptedAt: "2026-03-25T00:00:01.000Z",
          idempotencyKey: "idem_vote_1",
          targetRoundId: "rnd_0",
        }),
      }),
    );
    const conflict = await object.fetch(
      new Request("https://topic-state.internal/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: "vot_3",
          topicId: "top_1",
          roundId: "rnd_1",
          contributionId: "cnt_different",
          voterBeingId: "bng_2",
          direction: 1,
          weight: 2,
          voteKind: "most_interesting",
          weightedValue: 2,
          acceptedAt: "2026-03-25T00:00:02.000Z",
          idempotencyKey: "idem_vote_2",
          targetRoundId: "rnd_0",
        }),
      }),
    );

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await first.json(), await replay.json());
    assert.equal(storage.sql.pendingAux.size, 1);
    assert.deepEqual(await storage.get("votes:contribution-aggregate:cnt_1"), {
      contributionId: "cnt_1",
      topicId: "top_1",
      voteCount: 1,
      distinctVoterCount: 1,
      upvoteCount: 1,
      downvoteCount: 0,
      rawWeightedSum: 2,
      maxPossible: 2,
      weightedVoteScore: 100,
      updatedAt: "2026-03-25T00:00:00.000Z",
      reconciledAt: null,
    });
    assert.deepEqual(await storage.get("votes:topic-aggregate:top_1"), {
      topicId: "top_1",
      topicVoteCount: 1,
      distinctVoterCount: 1,
      updatedAt: "2026-03-25T00:00:00.000Z",
      reconciledAt: null,
    });
  });

  it("reports pending vote summary for active-round cap enforcement", async () => {
    const storage = new FakeStorage();
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      { DB: new FakeDb() as never } as never,
    );

    await object.fetch(
      new Request("https://topic-state.internal/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: "vot_1",
          topicId: "top_1",
          roundId: "rnd_active",
          contributionId: "cnt_1",
          voterBeingId: "bng_2",
          direction: 1,
          weight: 2,
          voteKind: "most_interesting",
          weightedValue: 2,
          acceptedAt: "2026-03-25T00:00:00.000Z",
          idempotencyKey: "idem_vote_3",
          targetRoundId: "rnd_0",
        }),
      }),
    );
    await object.fetch(
      new Request("https://topic-state.internal/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voteId: "vot_2",
          topicId: "top_1",
          roundId: "rnd_other",
          contributionId: "cnt_2",
          voterBeingId: "bng_2",
          direction: -1,
          weight: 2,
          voteKind: "fabrication",
          weightedValue: -2,
          acceptedAt: "2026-03-25T00:00:01.000Z",
          idempotencyKey: "idem_vote_4",
          targetRoundId: "rnd_0",
        }),
      }),
    );

    const response = await object.fetch(
      new Request(
        "https://topic-state.internal/vote-summary?roundId=rnd_active&contributionId=cnt_1&voterBeingId=bng_2",
      ),
    );
    const payload = await response.json() as {
      pendingVoteCount: number;
      hasMatchingVoteKey: boolean;
      matchingDirection: number | null;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.pendingVoteCount, 1);
    assert.equal(payload.hasMatchingVoteKey, true);
    assert.equal(payload.matchingDirection, 1);
  });

  it("emits read-only telemetry for backlog, latency, throughput, and freshness", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const artifacts = new FakeBucket();
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    const contributionResponse = await object.fetch(
      new Request("https://topic-state.internal/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload()),
      }),
    );
    assert.equal(contributionResponse.status, 200);

    const pendingTelemetryResponse = await object.fetch(new Request("https://topic-state.internal/telemetry"));
    const pendingTelemetry = await pendingTelemetryResponse.json() as {
      pendingContributionBacklog: number;
      semanticBacklog: number;
    };
    assert.equal(pendingTelemetryResponse.status, 200);
    assert.equal(pendingTelemetry.pendingContributionBacklog, 1);
    assert.equal(pendingTelemetry.semanticBacklog, 0);

    queueSnapshotRows(db, "top_1");
    const flushResult = await flushPendingTopicState(
      { storage } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );
    assert.deepEqual(flushResult.flushedContributionIds, ["cnt_1"]);

    const telemetryResponse = await object.fetch(new Request("https://topic-state.internal/telemetry"));
    const telemetry = await telemetryResponse.json() as {
      acceptLatencyMsSamples: number[];
      recomputeDurationMsSamples: number[];
      snapshotDurationMsSamples: number[];
      drainThroughputSamples: Array<{
        contributionsPerFlush: number;
        votesPerFlush: number;
        auxRowsPerFlush: number;
      }>;
      pendingContributionBacklog: number;
      pendingVoteBacklog: number;
      pendingAuxBacklog: number;
      semanticBacklog: number;
      publicationFreshnessLagMs: number;
    };

    assert.equal(telemetryResponse.status, 200);
    assert.equal(telemetry.acceptLatencyMsSamples.length, 1);
    assert.equal(telemetry.acceptLatencyMsSamples[0] >= 0, true);
    assert.equal(telemetry.pendingContributionBacklog, 0);
    assert.equal(telemetry.pendingVoteBacklog, 0);
    assert.equal(telemetry.pendingAuxBacklog, 0);
    assert.equal(telemetry.semanticBacklog, 0);
    assert.equal(telemetry.snapshotDurationMsSamples.length >= 1, true);
    assert.equal(telemetry.snapshotDurationMsSamples[0] >= 0, true);
    assert.equal(telemetry.drainThroughputSamples.length, 1);
    assert.equal(telemetry.drainThroughputSamples[0]?.contributionsPerFlush, 1);
    assert.equal(telemetry.drainThroughputSamples[0]?.votesPerFlush, 0);
    assert.equal(telemetry.drainThroughputSamples[0]?.auxRowsPerFlush, 0);
    assert.equal(telemetry.publicationFreshnessLagMs, 0);
  });

  it("counts only deferred semantic work in semantic backlog telemetry", async () => {
    const storage = new FakeStorage();

    storage.sql.pendingScores.set("sc_semantic_pending", {
      id: "sc_semantic_pending",
      contribution_id: "cnt_pending",
      payload_json: JSON.stringify({
        semantic_score: null,
        details_json: {
          semantic: {
            enabled: true,
          },
        },
      }),
      flushed: 0,
      created_at: "2026-03-25T00:00:00.000Z",
    });
    storage.sql.pendingScores.set("sc_semantic_complete", {
      id: "sc_semantic_complete",
      contribution_id: "cnt_complete",
      payload_json: JSON.stringify({
        semantic_score: 72,
        details_json: {
          semantic: {
            enabled: true,
          },
        },
      }),
      flushed: 0,
      created_at: "2026-03-25T00:01:00.000Z",
    });
    storage.sql.pendingScores.set("sc_semantic_disabled", {
      id: "sc_semantic_disabled",
      contribution_id: "cnt_disabled",
      payload_json: JSON.stringify({
        semantic_score: null,
        details_json: {
          semantic: {
            enabled: false,
          },
        },
      }),
      flushed: 0,
      created_at: "2026-03-25T00:02:00.000Z",
    });

    const telemetry = await readTopicStateTelemetry({ storage } as never);

    assert.equal(telemetry.semanticBacklog, 1);
  });

  it("flushes pending vote records into D1 and recomputes contribution scores", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const artifacts = new FakeBucket();
    const acceptedAt = "2026-03-25T00:05:00.000Z";

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'votes', 'insert', ?, 0, ?)`,
      "vot_1",
      JSON.stringify({
        voteId: "vot_1",
        topicId: "top_1",
        roundId: "rnd_active",
        contributionId: "cnt_1",
        voterBeingId: "bng_2",
        direction: 1,
        weight: 2,
        voteKind: "most_interesting",
        weightedValue: 2,
        acceptedAt,
        idempotencyKey: "idem_vote_flush",
        targetRoundId: "rnd_prior",
      }),
      acceptedAt,
    );
    queueVoteRecomputeRows(db);
    db.queueAll("SELECT id, starts_at, ends_at\n        FROM rounds\n        WHERE id IN", [{
      id: "rnd_active",
      starts_at: "2026-03-25T00:00:00.000Z",
      ends_at: "2026-03-25T00:10:00.000Z",
    }]);
    queueSnapshotRows(db, "top_1");

    const result = await flushPendingTopicState(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.deepEqual(result.flushedContributionIds, ["cnt_1"]);
    assert.equal(result.remainingCount, 0);
    assert.equal(db.batchCalls > 0, true);
    assert.equal(db.runs.some((run) => run.sql.includes("UPDATE contribution_scores")), true);
    const topicAggregate = await storage.get("votes:topic-aggregate:top_1") as {
      topicId: string;
      topicVoteCount: number;
      distinctVoterCount: number;
      updatedAt: string;
      reconciledAt: string | null;
    };
    assert.equal(topicAggregate.topicId, "top_1");
    assert.equal(topicAggregate.topicVoteCount, 1);
    assert.equal(topicAggregate.distinctVoterCount, 1);
    assert.equal(typeof topicAggregate.updatedAt, "string");
    assert.equal(typeof topicAggregate.reconciledAt, "string");
    const contributionAggregate = await storage.get("votes:contribution-aggregate:cnt_1") as {
      weightedVoteScore: number;
      voteCount: number;
      distinctVoterCount: number;
      upvoteCount: number;
      downvoteCount: number;
      reconciledAt: string | null;
    };
    assert.equal(contributionAggregate.weightedVoteScore, 100);
    assert.equal(contributionAggregate.voteCount, 1);
    assert.equal(contributionAggregate.distinctVoterCount, 1);
    assert.equal(contributionAggregate.upvoteCount, 1);
    assert.equal(contributionAggregate.downvoteCount, 0);
    assert.equal(typeof contributionAggregate.reconciledAt, "string");
    const voteInsert = db.executedBatches[0]?.find((statement) => statement.sql.includes("INSERT OR IGNORE INTO votes"));
    assert.ok(voteInsert);
    assert.equal(voteInsert?.bindings[7], "most_interesting");
    assert.equal(voteInsert?.bindings[8], 0.5);
    assert.equal(voteInsert?.bindings[9], 0.5);
  });

  it("persists null vote timing percentages when authoritative round timing is invalid", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const acceptedAt = "2026-03-25T00:05:00.000Z";

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'votes', 'insert', ?, 0, ?)`,
      "vot_invalid",
      JSON.stringify({
        voteId: "vot_invalid",
        topicId: "top_1",
        roundId: "rnd_active",
        contributionId: "cnt_1",
        voterBeingId: "bng_2",
        direction: 1,
        weight: 2,
        voteKind: "most_interesting",
        weightedValue: 2,
        acceptedAt,
        idempotencyKey: "idem_vote_invalid",
        targetRoundId: "rnd_prior",
      }),
      acceptedAt,
    );
    queueVoteRecomputeRows(db);
    db.queueAll("SELECT id, starts_at, ends_at\n        FROM rounds\n        WHERE id IN", [{
      id: "rnd_active",
      starts_at: null,
      ends_at: null,
    }]);
    queueSnapshotRows(db, "top_1");

    const result = await flushPendingTopicState(
      { storage } as never,
      {
        DB: db as never,
        SNAPSHOTS: { put: async () => undefined } as never,
        PUBLIC_ARTIFACTS: { put: async () => undefined } as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.deepEqual(result.flushedContributionIds, ["cnt_1"]);
    const voteInsert = db.executedBatches[0]?.find((statement) => statement.sql.includes("INSERT OR IGNORE INTO votes"));
    assert.ok(voteInsert);
    assert.equal(voteInsert?.bindings[7], "most_interesting");
    assert.equal(voteInsert?.bindings[8], null);
    assert.equal(voteInsert?.bindings[9], null);
  });

  it("force-flush drains pending votes before returning", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const artifacts = new FakeBucket();
    const acceptedAt = new Date().toISOString();
    const object = new TopicStateDurableObject(
      {
        storage,
      } as never,
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'votes', 'insert', ?, 0, ?)`,
      "vot_2",
      JSON.stringify({
        voteId: "vot_2",
        topicId: "top_1",
        roundId: "rnd_active",
        contributionId: "cnt_1",
        voterBeingId: "bng_3",
        direction: -1,
        weight: 1.5,
        voteKind: "fabrication",
        weightedValue: -1.5,
        acceptedAt,
        idempotencyKey: "idem_vote_force_flush",
        targetRoundId: "rnd_prior",
      }),
      acceptedAt,
    );
    queueVoteRecomputeRows(db);
    queueSnapshotRows(db, "top_1");

    const response = await object.fetch(
      new Request("https://topic-state.internal/force-flush", {
        method: "POST",
      }),
    );
    const payload = await response.json() as { flushed: boolean; remaining: number };

    assert.equal(response.status, 200);
    assert.equal(payload.flushed, true);
    assert.equal(payload.remaining, 0);
    assert.equal(db.batchCalls > 0, true);
    assert.equal(Number(storage.sql.pendingAux.get("vot_2")?.flushed ?? 0), 1);
  });

  it("flushes buffered epistemic claims idempotently", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const firstAcceptedAt = new Date().toISOString();
    const secondAcceptedAt = new Date(Date.now() + 1000).toISOString();

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'epistemic_claims', 'upsert', ?, 0, ?)`,
      "cnt_1",
      JSON.stringify({
        contributionId: "cnt_1",
        topicId: "top_1",
        domainId: "dom_1",
        beingId: "bng_1",
        claims: [
          {
            ordinal: 1,
            body: "Measured results improve outcomes.",
            normalizedBody: "measured results improve outcomes",
            verifiability: "empirical",
          },
        ],
      }),
      firstAcceptedAt,
    );
    db.queueFirst("FROM claims\n      WHERE contribution_id = ? AND ordinal = ?", [null]);
    db.queueAll("FROM claims\n      WHERE domain_id = ? AND contribution_id <> ?", []);

    let result = await flushPendingTopicState(
      { storage } as never,
      {
        DB: db as never,
        SNAPSHOTS: { put: async () => undefined } as never,
        PUBLIC_ARTIFACTS: { put: async () => undefined } as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.equal(result.remainingCount, 0);
    assert.equal(Number(storage.sql.pendingAux.get("cnt_1")?.flushed ?? 0), 1);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO claims")));

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'epistemic_claims', 'upsert', ?, 0, ?)`,
      "cnt_1",
      JSON.stringify({
        contributionId: "cnt_1",
        topicId: "top_1",
        domainId: "dom_1",
        beingId: "bng_1",
        claims: [
          {
            ordinal: 1,
            body: "Measured results improve outcomes.",
            normalizedBody: "measured results improve outcomes",
            verifiability: "empirical",
          },
        ],
      }),
      secondAcceptedAt,
    );
    db.queueFirst("FROM claims\n      WHERE contribution_id = ? AND ordinal = ?", [
      {
        id: "clm_1",
        body: "Measured results improve outcomes.",
        normalized_body: "measured results improve outcomes",
        contribution_id: "cnt_1",
        being_id: "bng_1",
        ordinal: 1,
      },
    ]);
    db.queueAll("FROM claims\n      WHERE domain_id = ? AND contribution_id <> ?", []);

    result = await flushPendingTopicState(
      { storage } as never,
      {
        DB: db as never,
        SNAPSHOTS: { put: async () => undefined } as never,
        PUBLIC_ARTIFACTS: { put: async () => undefined } as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
    );

    assert.equal(result.remainingCount, 0);
    assert.equal(Number(storage.sql.pendingAux.get("cnt_1")?.flushed ?? 0), 1);
    assert.equal(db.runs.filter((run) => run.sql.includes("INSERT INTO claims")).length >= 2, true);
  });

  it("keeps epistemic claim rows pending when the graph update fails", async () => {
    const storage = new FakeStorage();
    const db = new FakeDb();
    const acceptedAt = new Date().toISOString();
    db.throwOnRunMatch = /INSERT INTO claims/;

    storage.sql.exec(
      `INSERT INTO pending_aux (id, table_name, operation, payload_json, flushed, created_at)
       VALUES (?, 'epistemic_claims', 'upsert', ?, 0, ?)`,
      "cnt_1",
      JSON.stringify({
        contributionId: "cnt_1",
        topicId: "top_1",
        domainId: "dom_1",
        beingId: "bng_1",
        claims: [
          {
            ordinal: 1,
            body: "Measured results improve outcomes.",
            normalizedBody: "measured results improve outcomes",
            verifiability: "empirical",
          },
        ],
      }),
      acceptedAt,
    );
    db.queueFirst("FROM claims\n      WHERE contribution_id = ? AND ordinal = ?", [null]);

    const originalConsoleError = console.error;
    let result: Awaited<ReturnType<typeof flushPendingTopicState>>;
    try {
      console.error = () => undefined;
      result = await flushPendingTopicState(
        { storage } as never,
        {
          DB: db as never,
          SNAPSHOTS: { put: async () => undefined } as never,
          PUBLIC_ARTIFACTS: { put: async () => undefined } as never,
          PUBLIC_CACHE: { delete: async () => undefined } as never,
          TOPIC_TRANSCRIPT_PREFIX: "topics",
          CURATED_OPEN_KEY: "curated/open.json",
        } as never,
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(result.remainingCount, 1);
    assert.equal(Number(storage.sql.pendingAux.get("cnt_1")?.flushed ?? 0), 0);
  });
});
