import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEMANTIC_EMBEDDING_MODEL, EMBEDDING_RECORD_VERSION } from "@opndomain/shared";
import {
  embeddingTextForClaim,
  embeddingTextForTopic,
  upsertClaimEmbedding,
  upsertTopicEmbedding,
  findTopicsNearestToVector,
  backfillTopicEmbeddings,
} from "./embeddings.js";

class FakePreparedStatement {
  constructor(readonly sql: string, private readonly db: FakeDb, readonly bindings: unknown[] = []) {}
  bind(...bindings: unknown[]) { return new FakePreparedStatement(this.sql, this.db, bindings); }
  async first<T>() { return this.db.consumeFirst<T>(this.sql); }
  async all<T>() { return { results: this.db.consumeAll<T>(this.sql) }; }
  async run() {
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();
  queueFirst(fragment: string, rows: unknown[]) { this.firstQueue.set(fragment, [...rows]); }
  queueAll(fragment: string, rows: unknown[]) { this.allQueue.set(fragment, [...rows]); }
  prepare(sql: string) { return new FakePreparedStatement(sql, this); }
  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!entry) return null;
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }
  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

type StubVector = { id: string; values: number[]; metadata?: Record<string, string> };

class FakeVectorize {
  upserts: StubVector[] = [];
  stored = new Map<string, StubVector>();
  queries: Array<{ vector: number[]; opts: unknown }> = [];
  upsertError: Error | null = null;
  queryMatches: Array<{ id: string; score: number; metadata?: Record<string, string> }> = [];
  async upsert(vectors: StubVector[]) {
    if (this.upsertError) throw this.upsertError;
    for (const v of vectors) {
      this.upserts.push(v);
      this.stored.set(v.id, v);
    }
    return { mutationId: "m" };
  }
  async getByIds(ids: string[]) {
    return ids.map((id) => this.stored.get(id)).filter((v): v is StubVector => Boolean(v));
  }
  async query(vector: number[], opts: unknown) {
    this.queries.push({ vector, opts });
    return { matches: this.queryMatches };
  }
}

function buildEnv(db: FakeDb, ai: { run?: (model: string, input: unknown) => unknown } = {}, vectorize = {}) {
  return {
    DB: db as never,
    AI: ai as never,
    ...vectorize,
  } as never;
}

const sampleTopicRow = (overrides: Record<string, unknown> = {}) => ({
  id: "top_1",
  title: "Sample topic",
  prompt: "Sample prompt",
  domain_id: "dom_1",
  status: "closed",
  closed_at: "2026-04-20T00:00:00.000Z",
  parent_topic_id: null,
  embedding_indexed_at: null,
  embedding_model: null,
  embedding_text_hash: null,
  embedding_version: null,
  verdict_summary: "Sample verdict summary",
  ...overrides,
});

function fakeAiReturning(vector: number[]) {
  return {
    async run(_model: string, _input: unknown) {
      return { data: [vector] };
    },
  };
}

describe("embeddings canonical text", () => {
  it("joins title + prompt + verdict summary for topics", () => {
    const text = embeddingTextForTopic({ title: "T", prompt: "P", verdictSummary: "V" });
    assert.equal(text, "T\n\nP\n\nV");
  });
  it("omits verdict summary when null for topics", () => {
    const text = embeddingTextForTopic({ title: "T", prompt: "P", verdictSummary: null });
    assert.equal(text, "T\n\nP");
  });
  it("joins claim text + source quote for claims", () => {
    assert.equal(embeddingTextForClaim({ claimText: "c", sourceQuote: "q" }), "c\n\nq");
    assert.equal(embeddingTextForClaim({ claimText: "c", sourceQuote: null }), "c");
  });
});

describe("upsertTopicEmbedding", () => {
  it("computes + upserts + stamps model/hash/version when row is unindexed", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id", [sampleTopicRow()]);
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [{ parent_topic_id: null }]);
    const vectorize = new FakeVectorize();
    const env = buildEnv(db, fakeAiReturning([0.1, 0.2, 0.3]), { VECTORIZE_TOPICS: vectorize });

    const outcome = await upsertTopicEmbedding(env, "top_1");
    assert.equal(outcome, "upserted");
    assert.equal(vectorize.upserts.length, 1);
    assert.equal(vectorize.upserts[0].id, "top_1");
    assert.deepEqual(vectorize.upserts[0].values, [0.1, 0.2, 0.3]);
    assert.equal((vectorize.upserts[0].metadata as Record<string, string>).domainId, "dom_1");

    const stamp = db.runs.find((run) => run.sql.includes("UPDATE topics SET embedding_indexed_at"));
    assert.ok(stamp);
    assert.equal(stamp!.bindings[1], SEMANTIC_EMBEDDING_MODEL);
    assert.equal(stamp!.bindings[3], EMBEDDING_RECORD_VERSION);
  });

  it("returns skipped_current when hash + model + version already match", async () => {
    const db = new FakeDb();
    // Pre-compute the hash deterministically via the same code path.
    const { sha256HexExpected } = await (async () => {
      const text = "T\n\nP\n\nV";
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-256", data);
      const bytes = new Uint8Array(digest);
      let hex = "";
      for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
      return { sha256HexExpected: hex };
    })();

    db.queueFirst("SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id", [
      sampleTopicRow({
        title: "T",
        prompt: "P",
        verdict_summary: "V",
        embedding_indexed_at: "2026-04-20T00:00:00.000Z",
        embedding_model: SEMANTIC_EMBEDDING_MODEL,
        embedding_text_hash: sha256HexExpected,
        embedding_version: EMBEDDING_RECORD_VERSION,
      }),
    ]);
    const vectorize = new FakeVectorize();
    const env = buildEnv(db, fakeAiReturning([0.1, 0.2, 0.3]), { VECTORIZE_TOPICS: vectorize });

    const outcome = await upsertTopicEmbedding(env, "top_1");
    assert.equal(outcome, "skipped_current");
    assert.equal(vectorize.upserts.length, 0, "vectorize must not be written when hash is current");
  });

  it("returns skipped_error when Workers AI throws, leaving indexed_at untouched", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id", [sampleTopicRow()]);
    const env = buildEnv(db, {
      async run() { throw new Error("AI offline"); },
    }, { VECTORIZE_TOPICS: new FakeVectorize() });

    const outcome = await upsertTopicEmbedding(env, "top_1");
    assert.equal(outcome, "skipped_error");
    assert.ok(
      !db.runs.some((run) => run.sql.includes("UPDATE topics SET embedding_indexed_at")),
      "must not stamp indexed_at when upsert fails",
    );
  });

  it("returns skipped_error when Vectorize.upsert throws, leaving indexed_at untouched", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id", [sampleTopicRow()]);
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [{ parent_topic_id: null }]);
    const vectorize = new FakeVectorize();
    vectorize.upsertError = new Error("vectorize 503");
    const env = buildEnv(db, fakeAiReturning([0.1, 0.2]), { VECTORIZE_TOPICS: vectorize });

    const outcome = await upsertTopicEmbedding(env, "top_1");
    assert.equal(outcome, "skipped_error");
    assert.ok(!db.runs.some((run) => run.sql.includes("UPDATE topics SET embedding_indexed_at")));
  });

  it("returns skipped_missing for unknown topic ids", async () => {
    const db = new FakeDb();
    const env = buildEnv(db, fakeAiReturning([0.1]), { VECTORIZE_TOPICS: new FakeVectorize() });
    const outcome = await upsertTopicEmbedding(env, "top_missing");
    assert.equal(outcome, "skipped_missing");
  });
});

describe("upsertClaimEmbedding", () => {
  it("upserts with claim metadata and returns the vector + rootTopicId", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM refinement_claims WHERE id", [
      {
        id: "rfc_1",
        topic_id: "top_1",
        claim_text: "Claim body",
        classification: "contested",
        source_quote: null,
        embedding_indexed_at: null,
        embedding_model: null,
        embedding_text_hash: null,
        embedding_version: null,
      },
    ]);
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [{ parent_topic_id: null }]);
    const vectorize = new FakeVectorize();
    const env = buildEnv(db, fakeAiReturning([0.4, 0.5]), { VECTORIZE_CLAIMS: vectorize });

    const result = await upsertClaimEmbedding(env, "rfc_1");
    assert.equal(result.outcome, "upserted");
    assert.deepEqual(result.vector, [0.4, 0.5]);
    assert.equal(result.rootTopicId, "top_1");
    assert.equal(vectorize.upserts.length, 1);
  });
});

describe("findTopicsNearestToVector", () => {
  it("filters matches by excludeIds and threshold", async () => {
    const vectorize = new FakeVectorize();
    vectorize.queryMatches = [
      { id: "top_a", score: 0.95 },
      { id: "top_self", score: 1.0 },
      { id: "top_b", score: 0.6 },
      { id: "top_c", score: 0.2 },
    ];
    const env = buildEnv(new FakeDb(), {}, { VECTORIZE_TOPICS: vectorize });

    const matches = await findTopicsNearestToVector(env, [0.1, 0.2], {
      threshold: 0.5,
      excludeIds: ["top_self"],
      limit: 10,
    });
    assert.deepEqual(
      matches.map((m) => m.topicId),
      ["top_a", "top_b"],
      "must skip excluded self-id and below-threshold matches",
    );
  });

  it("returns [] when VECTORIZE_TOPICS binding is absent", async () => {
    const env = buildEnv(new FakeDb(), {}, {});
    const matches = await findTopicsNearestToVector(env, [0.1, 0.2], { limit: 5 });
    assert.deepEqual(matches, []);
  });
});

describe("backfillTopicEmbeddings", () => {
  it("iterates pending rows and reports counts", async () => {
    const db = new FakeDb();
    db.queueAll("SELECT id FROM topics", [{ id: "top_1" }, { id: "top_2" }]);
    db.queueFirst("SELECT t.id, t.title, t.prompt, t.domain_id, t.status, t.closed_at, t.parent_topic_id", [
      sampleTopicRow({ id: "top_1" }),
      sampleTopicRow({ id: "top_2" }),
    ]);
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [
      { parent_topic_id: null },
      { parent_topic_id: null },
    ]);
    const vectorize = new FakeVectorize();
    const env = buildEnv(db, fakeAiReturning([0.1]), { VECTORIZE_TOPICS: vectorize });

    const result = await backfillTopicEmbeddings(env, { limit: 10 });
    assert.equal(result.processed, 2);
    assert.equal(result.upserted, 2);
    assert.equal(result.failed, 0);
  });
});
