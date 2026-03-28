import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTerminalizationSequence } from "./terminalization.js";

class FakePreparedStatement {
  constructor(
    readonly sql: string,
    private readonly db: FakeDb,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new FakePreparedStatement(this.sql, this.db, bindings);
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

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  queries: string[] = [];
  throwOnRunMatch: RegExp | null = null;
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  consumeFirst<T>(sql: string): T | null {
    this.queries.push(sql);
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    this.queries.push(sql);
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

class FakeBucket {
  writes: Array<{ key: string; body: unknown; options?: { httpMetadata?: { contentType?: string } } }> = [];
  deletes: string[] = [];

  async put(key: string, body: unknown, options?: { httpMetadata?: { contentType?: string } }) {
    this.writes.push({ key, body, options });
  }

  async delete(key: string) {
    this.deletes.push(key);
  }
}

class FakeCache {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async list({ prefix }: { prefix: string }) {
    return {
      keys: Array.from(this.values.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

function queueClosedTopicPresentationReads(db: FakeDb) {
  db.queueFirst("SELECT id, domain_id, title, prompt, status FROM topics WHERE id = ?", [
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      status: "closed",
    },
  ]);
  db.queueFirst("FROM topics\n      WHERE id = ?", [
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      status: "closed",
      current_round_index: 1,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
  db.queueAll("FROM rounds r\n      LEFT JOIN round_configs", [
    {
      id: "rnd_1",
      sequence_index: 0,
      round_kind: "propose",
      status: "completed",
      starts_at: "2026-03-25T00:00:00.000Z",
      ends_at: "2026-03-25T01:00:00.000Z",
      reveal_at: "2026-03-25T00:00:00.000Z",
      round_visibility: "open",
    },
    {
      id: "rnd_2",
      sequence_index: 1,
      round_kind: "predict",
      status: "completed",
      starts_at: "2026-03-25T01:00:00.000Z",
      ends_at: "2026-03-25T02:00:00.000Z",
      reveal_at: "2026-03-25T01:00:00.000Z",
      round_visibility: "open",
    },
  ]);
  db.queueAll("INNER JOIN beings b ON b.id = c.being_id", [
    {
      id: "cnt_1",
      round_id: "rnd_1",
      being_id: "bng_1",
      being_handle: "alpha",
      body_clean: "Body",
      visibility: "normal",
      submitted_at: "2026-03-25T00:10:00.000Z",
      heuristic_score: 70,
      live_score: 70,
      final_score: 73,
      reveal_at: "2026-03-25T00:00:00.000Z",
      round_visibility: "open",
    },
  ]);
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", [{ count: 1 }]);
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", [{ count: 1 }]);
}

describe("terminalization service", () => {
  it("forces a DO flush before checking for prior terminalization", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics WHERE id = ?", [
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
    ]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [{ id: "vrd_1" }]);
    const calls: string[] = [];

    const result = await runTerminalizationSequence(
      {
        DB: db as never,
        TOPIC_STATE_DO: {
          idFromName: (name: string) => name,
          get: () => ({
            fetch: async (request: Request) => {
              calls.push(new URL(request.url).pathname);
              return Response.json({ flushed: true, remaining: 0 });
            },
          }),
        },
      } as never,
      "top_1",
    );

    assert.deepEqual(calls, ["/force-flush"]);
    assert.equal(result.alreadyTerminalized, true);
  });

  it("skips non-closed topics after the flush barrier", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics WHERE id = ?", [{ id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "started" }]);
    let flushCalls = 0;

    const result = await runTerminalizationSequence(
      {
        DB: db as never,
        TOPIC_STATE_DO: {
          idFromName: (name: string) => name,
          get: () => ({
            fetch: async () => {
              flushCalls += 1;
              return Response.json({ flushed: true, remaining: 0 });
            },
          }),
        },
      } as never,
      "top_1",
    );

    assert.equal(flushCalls, 1);
    assert.equal(result.terminalized, false);
    assert.equal(result.alreadyTerminalized, false);
  });

  it("aborts terminalization when force-flush does not drain within the cap", async () => {
    const db = new FakeDb();
    await assert.rejects(
      () =>
        runTerminalizationSequence(
          {
            DB: db as never,
            PUBLIC_CACHE: {
              get: async () => null,
              put: async () => undefined,
            } as never,
            TOPIC_STATE_DO: {
              idFromName: (name: string) => name,
              get: () => ({
                fetch: async () => Response.json({ flushed: false, remaining: 1 }),
              }),
            },
          } as never,
          "top_1",
        ),
      /Force flush did not drain/,
    );
  });

  it("recomputes final scores during terminalization without mutating ingest-time live mirrors", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    db.queueFirst("FROM topics WHERE id = ?", [
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
    ]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [null]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
      { id: "rnd_1", sequence_index: 0, round_kind: "propose", status: "completed" },
      { id: "rnd_2", sequence_index: 1, round_kind: "predict", status: "completed" },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueFirst("FROM contribution_scores cs", [{
      substance_score: 70,
      role_bonus: 10,
      details_json: JSON.stringify({ role: "claim" }),
      relevance: 0.8,
      novelty: 0.7,
      reframe: 0.4,
      initial_score: 68,
      shadow_initial_score: 67,
      scoring_profile: "adversarial",
      round_kind: "propose",
      template_id: "debate_v2",
      topic_id: "top_1",
    }]);
    db.queueAll("SELECT direction, weight, voter_being_id\n        FROM votes", [
      { direction: 1, weight: 2, voter_being_id: "bng_2" },
      { direction: 1, weight: 1, voter_being_id: "bng_3" },
    ]);
    db.queueFirst("COUNT(DISTINCT CASE WHEN direction IN (-1, 1)", [{ distinct_voter_count: 2, topic_vote_count: 2 }]);
    db.queueFirst("FROM domain_reputation", [null]);
    queueClosedTopicPresentationReads(db);
    db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
      {
        confidence: "moderate",
        terminalization_mode: "full_template",
        summary: "summary",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [
            {
              roundKind: "propose",
              contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 73, excerpt: "Body" }],
            },
          ],
          completedRounds: 2,
          totalRounds: 2,
        }),
      },
    ]);

    const result = await runTerminalizationSequence(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_STATE_DO: {
          idFromName: (name: string) => name,
          get: () => ({
            fetch: async () => Response.json({ flushed: true, remaining: 0 }),
          }),
        },
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
    );

    assert.equal(result.terminalized, true);
    const scoreUpdate = db.runs.find((run) => run.sql.includes("UPDATE contribution_scores"));
    assert.ok(scoreUpdate);
    assert.equal(scoreUpdate?.sql.includes("live_score"), false);
    assert.equal(scoreUpdate?.sql.includes("shadow_score"), false);
    assert.ok(publicArtifacts.writes.some((write) => write.options?.httpMetadata?.contentType === "text/html; charset=utf-8"));
    assert.ok(publicArtifacts.writes.some((write) => write.options?.httpMetadata?.contentType === "image/png"));
  });

  it("reterminalize replaces an existing verdict and rebuilds affected reputations", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    db.queueFirst("FROM topics WHERE id = ?", [{ id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" }]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [{ id: "vrd_1" }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
      { id: "rnd_1", sequence_index: 0, round_kind: "propose", status: "completed" },
      { id: "rnd_2", sequence_index: 1, round_kind: "predict", status: "completed" },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueFirst("FROM contribution_scores cs", [{
      substance_score: 70,
      role_bonus: 10,
      details_json: JSON.stringify({ role: "claim" }),
      relevance: 0.8,
      novelty: 0.7,
      reframe: 0.4,
      initial_score: 68,
      shadow_initial_score: 67,
      scoring_profile: "adversarial",
      round_kind: "propose",
      template_id: "debate_v2",
      topic_id: "top_1",
    }]);
    db.queueAll("SELECT direction, weight, voter_being_id\n        FROM votes", [
      { direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueFirst("COUNT(DISTINCT CASE WHEN direction IN (-1, 1)", [{ distinct_voter_count: 1, topic_vote_count: 1 }]);
    db.queueAll("SELECT cs.final_score, t.closed_at", [
      { final_score: 73, closed_at: "2026-03-25T02:00:00.000Z" },
    ]);
    db.queueFirst("FROM domain_reputation", [{
      id: "drp_1",
      average_score: 70,
      sample_count: 1,
      m2: 0,
      consistency_score: 100,
      decayed_score: 79,
      last_active_at: "2026-03-25T02:00:00.000Z",
    }]);
    db.queueAll("SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at\n      FROM domain_reputation", []);
    queueClosedTopicPresentationReads(db);
    db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
      {
        confidence: "moderate",
        terminalization_mode: "full_template",
        summary: "summary",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [
            {
              roundKind: "propose",
              contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 73, excerpt: "Body" }],
            },
          ],
          completedRounds: 2,
          totalRounds: 2,
        }),
      },
    ]);

    const result = await runTerminalizationSequence(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_STATE_DO: {
          idFromName: (name: string) => name,
          get: () => ({
            fetch: async () => Response.json({ flushed: true, remaining: 0 }),
          }),
        },
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
      { reterminalize: true },
    );

    assert.equal(result.terminalized, true);
    assert.ok(
      db.runs.some(
        (run) => run.sql.includes("INSERT INTO verdicts") && run.sql.includes("ON CONFLICT(topic_id) DO UPDATE SET"),
      ),
    );
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO domain_reputation")));
  });

  it("skips epistemic table work entirely when the flag is disabled", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    db.queueFirst("FROM topics WHERE id = ?", [
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
    ]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [null]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
      { id: "rnd_1", sequence_index: 0, round_kind: "propose", status: "completed" },
      { id: "rnd_2", sequence_index: 1, round_kind: "predict", status: "completed" },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueFirst("FROM contribution_scores cs", [{
      substance_score: 70,
      role_bonus: 10,
      details_json: JSON.stringify({ role: "claim" }),
      relevance: 0.8,
      novelty: 0.7,
      reframe: 0.4,
      initial_score: 68,
      shadow_initial_score: 67,
      scoring_profile: "adversarial",
      round_kind: "propose",
      template_id: "debate_v2",
      topic_id: "top_1",
    }]);
    db.queueAll("SELECT direction, weight, voter_being_id\n        FROM votes", [
      { direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueFirst("COUNT(DISTINCT CASE WHEN direction IN (-1, 1)", [{ distinct_voter_count: 1, topic_vote_count: 1 }]);
    db.queueFirst("FROM domain_reputation", [null]);
    queueClosedTopicPresentationReads(db);
    db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
      {
        confidence: "moderate",
        terminalization_mode: "full_template",
        summary: "summary",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [
            {
              roundKind: "propose",
              contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 73, excerpt: "Body" }],
            },
          ],
          completedRounds: 2,
          totalRounds: 2,
        }),
      },
    ]);

    const result = await runTerminalizationSequence(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_STATE_DO: {
          idFromName: (name: string) => name,
          get: () => ({
            fetch: async () => Response.json({ flushed: true, remaining: 0 }),
          }),
        },
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
    );

    assert.equal(result.terminalized, true);
    assert.equal(db.queries.some((sql) => sql.includes("FROM claims WHERE topic_id = ?")), false);
    assert.equal(db.runs.some((run) => run.sql.includes("epistemic_reliability")), false);
  });

  it("fails open when epistemic terminalization work errors", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    db.throwOnRunMatch = /INSERT INTO epistemic_reliability/;
    db.queueFirst("FROM topics WHERE id = ?", [
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
      { id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" },
    ]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [null]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
      { id: "rnd_1", sequence_index: 0, round_kind: "propose", status: "completed" },
      { id: "rnd_2", sequence_index: 1, round_kind: "predict", status: "completed" },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueFirst("FROM contribution_scores cs", [{
      substance_score: 70,
      role_bonus: 10,
      details_json: JSON.stringify({ role: "claim" }),
      relevance: 0.8,
      novelty: 0.7,
      reframe: 0.4,
      initial_score: 68,
      shadow_initial_score: 67,
      scoring_profile: "adversarial",
      round_kind: "propose",
      template_id: "debate_v2",
      topic_id: "top_1",
    }]);
    db.queueAll("SELECT direction, weight, voter_being_id\n        FROM votes", [
      { direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueFirst("COUNT(DISTINCT CASE WHEN direction IN (-1, 1)", [{ distinct_voter_count: 1, topic_vote_count: 1 }]);
    db.queueFirst("FROM domain_reputation", [null]);
    db.queueFirst("SELECT COUNT(*) AS count FROM claims WHERE topic_id = ?", [{ count: 2 }]);
    db.queueAll("SELECT cr.status", [{ status: "supported" }]);
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM claim_resolution_evidence", [{ count: 0 }]);
    db.queueFirst("FROM epistemic_reliability", [null]);
    queueClosedTopicPresentationReads(db);
    db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
      {
        confidence: "moderate",
        terminalization_mode: "full_template",
        summary: "summary",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [
            {
              roundKind: "propose",
              contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 73, excerpt: "Body" }],
            },
          ],
          completedRounds: 2,
          totalRounds: 2,
          epistemic: { status: "unavailable" },
        }),
      },
    ]);

    const originalConsoleError = console.error;
    let result: Awaited<ReturnType<typeof runTerminalizationSequence>>;
    try {
      console.error = () => undefined;
      result = await runTerminalizationSequence(
        {
          DB: db as never,
          SNAPSHOTS: snapshots as never,
          PUBLIC_ARTIFACTS: publicArtifacts as never,
          PUBLIC_CACHE: cache as never,
          TOPIC_STATE_DO: {
            idFromName: (name: string) => name,
            get: () => ({
              fetch: async () => Response.json({ flushed: true, remaining: 0 }),
            }),
          },
          TOPIC_TRANSCRIPT_PREFIX: "topics",
          CURATED_OPEN_KEY: "curated/open.json",
          ENABLE_EPISTEMIC_SCORING: true,
        } as never,
        "top_1",
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(result.terminalized, true);
    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"epistemic":\{"status":"unavailable"\}/);
  });
});
