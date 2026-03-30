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

  async batch(statements: FakePreparedStatement[]) {
    const failingStatement = statements.find((statement) => this.throwOnRunMatch?.test(statement.sql));
    if (failingStatement) {
      throw new Error(`simulated run failure for ${failingStatement.sql}`);
    }
    this.runs.push(...statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    return statements.map(() => ({ success: true }));
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

async function withMockFetch<T>(
  implementation: typeof globalThis.fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function queueClosedTopicPresentationReads(db: FakeDb) {
  db.queueFirst("FROM topics", [
    {
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "energy",
      title: "Topic",
      prompt: "Prompt",
      status: "closed",
      closed_at: "2026-03-25T02:00:00.000Z",
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

function queueTerminalizationSuccessPath(
  db: FakeDb,
  verdictRow?: {
    summary: string;
    editorialBody?: string | null;
    narrative?: Array<{
      roundIndex: number;
      roundKind: string;
      title: string;
      summary: string;
    }>;
    highlights?: Array<{
      contributionId: string;
      beingId: string;
      beingHandle: string;
      roundKind: string;
      excerpt: string;
      finalScore: number;
      reason: string;
    }>;
  },
) {
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
      being_handle: "alpha",
      round_id: "rnd_1",
      round_kind: "propose",
      sequence_index: 0,
      final_score: 73,
      shadow_final_score: 72,
      body_clean: "Body",
      visibility: "normal",
    },
  ]);
  db.queueAll("FROM contribution_scores cs", [{
    contribution_id: "cnt_1",
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
  db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
    { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    { contribution_id: "cnt_1", direction: 1, weight: 1, voter_being_id: "bng_3" },
  ]);
  db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 2, topic_vote_count: 2 }]);
  db.queueFirst("FROM domain_reputation", [null]);
  queueClosedTopicPresentationReads(db);
  db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
    {
      confidence: "moderate",
      terminalization_mode: "full_template",
      summary: verdictRow?.summary ?? "summary",
      reasoning_json: JSON.stringify({
        editorialBody:
          verdictRow?.editorialBody
          ?? "This topic closed after 2 completed rounds with a verdict shaped by transcript-visible scoring rather than a single unchallenged claim.\n\nThe clearest closing signal came from @alpha in the propose round, where the highest-scoring excerpt emphasized: \"Body\"",
        narrative: verdictRow?.narrative ?? [
          {
            roundIndex: 0,
            roundKind: "propose",
            title: "propose round",
            summary: "Lead signal: Body",
          },
        ],
        highlights: verdictRow?.highlights ?? [
          {
            contributionId: "cnt_1",
            beingId: "bng_1",
            beingHandle: "alpha",
            roundKind: "propose",
            excerpt: "Body",
            finalScore: 73,
            reason: "Highest-scoring visible contribution in the propose round.",
          },
        ],
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

  it("continues explicit reterminalize repairs when force-flush does not drain", async () => {
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
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 1, topic_vote_count: 1 }]);
    db.queueAll("SELECT cs.final_score, t.closed_at", [
      { final_score: 73, closed_at: "2026-03-25T02:00:00.000Z" },
    ]);
    db.queueFirst("FROM domain_reputation", [null]);
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

    const warnings: string[] = [];
    const originalConsoleWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message ?? ""));
    };

    try {
      const result = await runTerminalizationSequence(
        {
          DB: db as never,
          SNAPSHOTS: snapshots as never,
          PUBLIC_ARTIFACTS: publicArtifacts as never,
          PUBLIC_CACHE: cache as never,
          TOPIC_STATE_DO: {
            idFromName: (name: string) => name,
            get: () => ({
              fetch: async () => Response.json({ flushed: false, remaining: 1 }),
            }),
          },
          TOPIC_TRANSCRIPT_PREFIX: "topics",
          CURATED_OPEN_KEY: "curated/open.json",
        } as never,
        "top_1",
        { reterminalize: true },
      );

      assert.equal(result.terminalized, true);
      assert.ok(warnings.some((warning) => warning.includes("continuing reterminalize")));
      assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO verdicts")));
    } finally {
      console.warn = originalConsoleWarn;
    }
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
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
      { contribution_id: "cnt_1", direction: 1, weight: 1, voter_being_id: "bng_3" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 2, topic_vote_count: 2 }]);
    db.queueFirst("FROM domain_reputation", [null]);
    queueClosedTopicPresentationReads(db);
    db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
      {
        confidence: "moderate",
        terminalization_mode: "full_template",
        summary: "summary",
        reasoning_json: JSON.stringify({
          editorialBody:
            "This topic closed after 2 completed rounds with a verdict shaped by transcript-visible scoring rather than a single unchallenged claim.\n\nThe clearest closing signal came from @alpha in the propose round, where the highest-scoring excerpt emphasized: \"Body\"",
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
    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"editorialBody":"This topic closed after 2 completed rounds/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"narrative":\[/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"highlights":\[/);
    assert.ok(publicArtifacts.writes.some((write) => write.options?.httpMetadata?.contentType === "text/html; charset=utf-8"));
    const jsonWrite = publicArtifacts.writes.find((write) => write.key.endsWith("/verdict-presentation.json"));
    assert.ok(jsonWrite);
    const jsonPayload = JSON.parse(String(jsonWrite?.body ?? "{}"));
    assert.match(String(jsonPayload.editorialBody ?? ""), /topic closed after 2 completed rounds/i);
    assert.equal(jsonPayload.narrative[0]?.summary, "Lead signal: Body");
    assert.equal(jsonPayload.claimGraph.available, false);
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
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 1, topic_vote_count: 1 }]);
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

  it("reterminalize can backfill a missing verdict row and still publish repaired artifacts", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    db.queueFirst("FROM topics WHERE id = ?", [{ id: "top_1", domain_id: "dom_1", template_id: "debate_v2", status: "closed" }]);
    db.queueFirst("FROM verdicts WHERE topic_id = ?", [null]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
      { id: "rnd_1", sequence_index: 0, round_kind: "propose", status: "completed" },
      { id: "rnd_2", sequence_index: 1, round_kind: "predict", status: "completed" },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 1, topic_vote_count: 1 }]);
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
    assert.ok(publicArtifacts.writes.some((write) => write.key.endsWith("/verdict-presentation.json")));
    assert.ok(publicArtifacts.writes.some((write) => write.key.endsWith("/verdict.html")));
    assert.ok(publicArtifacts.writes.some((write) => write.key.endsWith("/og.png")));
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
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 1, topic_vote_count: 1 }]);
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
        being_handle: "alpha",
        round_id: "rnd_1",
        round_kind: "propose",
        sequence_index: 0,
        final_score: 73,
        shadow_final_score: 72,
        body_clean: "Body",
        visibility: "normal",
      },
    ]);
    db.queueAll("FROM contribution_scores cs", [{
      contribution_id: "cnt_1",
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
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 1, topic_vote_count: 1 }]);
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

  it("writes AI-backed verdict editorial fields when ZHIPU generation succeeds", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueTerminalizationSuccessPath(db, {
      summary: "AI summary",
      editorialBody: "AI editorial body",
      narrative: [
        {
          roundIndex: 0,
          roundKind: "propose",
          title: "Opening pressure",
          summary: "AI narrative beat",
        },
      ],
      highlights: [
        {
          contributionId: "cnt_1",
          beingId: "bng_1",
          beingHandle: "alpha",
          roundKind: "propose",
          excerpt: "AI excerpt",
          finalScore: 73,
          reason: "AI reason",
        },
      ],
    });

    await withMockFetch(
      (async (input, init) => {
        assert.equal(String(input), "https://api.z.ai/api/paas/v4/chat/completions");
        assert.match(String((init?.headers as Record<string, string>).Authorization), /^Bearer /);
        return Response.json({
          choices: [{
            message: {
              content: JSON.stringify({
                summary: "AI summary",
                editorialBody: "AI editorial body",
                narrative: [
                  {
                    roundIndex: 0,
                    roundKind: "propose",
                    title: "Opening pressure",
                    summary: "AI narrative beat",
                  },
                ],
                highlights: [
                  {
                    contributionId: "cnt_1",
                    beingId: "bng_1",
                    beingHandle: "alpha",
                    roundKind: "propose",
                    excerpt: "AI excerpt",
                    finalScore: 73,
                    reason: "AI reason",
                  },
                ],
              }),
            },
          }],
        });
      }) as typeof globalThis.fetch,
      async () => {
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
            ZHIPU_API_KEY: "test-api-key",
            ZHIPU_MODEL: "glm-4.7",
            ZHIPU_BASE_URL: "https://api.z.ai/api/paas/v4",
            ZHIPU_TIMEOUT_MS: 8000,
          } as never,
          "top_1",
        );

        assert.equal(result.terminalized, true);
      },
    );

    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[4] ?? ""), /AI summary/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"editorialBody":"AI editorial body"/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"AI narrative beat"/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"AI excerpt"/);
  });

  it("falls back when ZHIPU output fails schema validation", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueTerminalizationSuccessPath(db);

    await withMockFetch(
      (async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Broken response without required fields",
            }),
          },
        }],
      })) as typeof globalThis.fetch,
      async () => {
        await runTerminalizationSequence(
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
            ZHIPU_API_KEY: "test-api-key",
            ZHIPU_MODEL: "glm-4.7",
            ZHIPU_TIMEOUT_MS: 8000,
          } as never,
          "top_1",
        );
      },
    );

    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[4] ?? ""), /^propose: Body/);
    assert.match(String(verdictInsert?.bindings[5] ?? ""), /"editorialBody":"This topic closed after 2 completed rounds/);
  });

  it("falls back when the ZHIPU request times out", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueTerminalizationSuccessPath(db);

    await withMockFetch(
      (async () => {
        throw new Error("zhipu_timeout");
      }) as typeof globalThis.fetch,
      async () => {
        await runTerminalizationSequence(
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
            ZHIPU_API_KEY: "test-api-key",
            ZHIPU_MODEL: "glm-4.7",
            ZHIPU_TIMEOUT_MS: 1,
          } as never,
          "top_1",
        );
      },
    );

    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[4] ?? ""), /^propose: Body/);
  });

  it("falls back without calling ZHIPU when config is missing", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueTerminalizationSuccessPath(db);
    let fetchCalls = 0;

    await withMockFetch(
      (async () => {
        fetchCalls += 1;
        return Response.json({});
      }) as typeof globalThis.fetch,
      async () => {
        await runTerminalizationSequence(
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
            ZHIPU_API_KEY: "",
            ZHIPU_MODEL: "glm-4.7",
            ZHIPU_TIMEOUT_MS: 8000,
          } as never,
          "top_1",
        );
      },
    );

    assert.equal(fetchCalls, 0);
    const verdictInsert = db.runs.find((run) => run.sql.includes("INSERT INTO verdicts"));
    assert.ok(verdictInsert);
    assert.match(String(verdictInsert?.bindings[4] ?? ""), /^propose: Body/);
  });
});
