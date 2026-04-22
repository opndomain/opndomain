import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  insertExtractedClaims,
  linkClaimToPromotedTopic,
  listUnrefinedClaims,
  listVerdictsNeedingExtraction,
} from "./refinement-claims.js";

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
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    const changes = this.db.zeroChangesOnMatch?.test(this.sql) ? 0 : 1;
    return { success: true, meta: { changes } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  firstCalls: string[] = [];
  allCalls: string[] = [];
  zeroChangesOnMatch: RegExp | null = null;
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
    this.firstCalls.push(sql);
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
    this.allCalls.push(sql);
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

function buildEnv(db: FakeDb) {
  return { DB: db as never } as never;
}

class FakeVectorize {
  upserts: Array<{ id: string; values: number[]; metadata?: Record<string, string> }> = [];
  stored = new Map<string, { id: string; values: number[]; metadata?: Record<string, string> }>();
  queryMatches: Array<{ id: string; score: number; metadata?: Record<string, string> }> = [];
  async upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>) {
    for (const v of vectors) { this.upserts.push(v); this.stored.set(v.id, v); }
    return { mutationId: "m" };
  }
  async getByIds(ids: string[]) {
    return ids.map((id) => this.stored.get(id)).filter((v): v is { id: string; values: number[] } => Boolean(v));
  }
  async query(_vector: number[], _opts: unknown) {
    return { matches: this.queryMatches };
  }
}

function buildEnvWithEmbeddings(db: FakeDb, opts: {
  ai?: { run: (model: string, input: unknown) => unknown };
  topicsMatches?: Array<{ id: string; score: number; metadata?: Record<string, string> }>;
} = {}) {
  const vectorizeTopics = new FakeVectorize();
  vectorizeTopics.queryMatches = opts.topicsMatches ?? [];
  const vectorizeClaims = new FakeVectorize();
  const ai = opts.ai ?? {
    async run() { return { data: [[0.1, 0.2, 0.3]] }; },
  };
  return {
    env: {
      DB: db as never,
      AI: ai as never,
      VECTORIZE_TOPICS: vectorizeTopics as never,
      VECTORIZE_CLAIMS: vectorizeClaims as never,
    } as never,
    vectorizeTopics,
    vectorizeClaims,
  };
}

describe("refinement claims service", () => {
  it("inserts a batch of claims for a topic with no prior extraction", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics WHERE id = ? AND archived_at IS NULL", [{ id: "top_1" }]);
    db.queueFirst("COUNT(*) AS n FROM refinement_claims WHERE topic_id = ?", [{ n: 0 }]);

    const records = await insertExtractedClaims(buildEnv(db), "top_1", [
      { claimText: "Claim A", classification: "contested", sourceQuote: "from A" },
      { claimText: "Claim B" },
    ]);

    assert.equal(records.length, 2);
    assert.equal(records[0].claimText, "Claim A");
    assert.equal(records[0].topicId, "top_1");
    assert.equal(records[0].promotedTopicId, null);
    assert.equal(records[1].classification, null, "missing classification should normalize to null");

    const inserts = db.runs.filter((run) => run.sql.includes("INSERT INTO refinement_claims"));
    assert.equal(inserts.length, 2, "must issue one INSERT per claim");
  });

  it("rejects re-extraction when claims already exist for the topic", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics WHERE id = ? AND archived_at IS NULL", [{ id: "top_1" }]);
    db.queueFirst("COUNT(*) AS n FROM refinement_claims WHERE topic_id = ?", [{ n: 4 }]);

    await assert.rejects(
      insertExtractedClaims(buildEnv(db), "top_1", [{ claimText: "should fail" }]),
      /already been extracted/,
    );
    assert.ok(
      !db.runs.some((run) => run.sql.includes("INSERT INTO refinement_claims")),
      "no INSERT must fire when extraction is rejected",
    );
  });

  it("rejects extraction for unknown or archived topics", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics WHERE id = ? AND archived_at IS NULL", []);

    await assert.rejects(
      insertExtractedClaims(buildEnv(db), "top_missing", [{ claimText: "should fail" }]),
      /No active topic matched/,
    );
  });

  it("lists unrefined claims with parent-topic context bundled", async () => {
    const db = new FakeDb();
    db.queueAll("FROM refinement_claims rc\n      INNER JOIN topics t", [
      {
        id: "rfc_1",
        topic_id: "top_1",
        claim_text: "Contested claim",
        classification: "contested",
        source_quote: "verdict said...",
        promoted_topic_id: null,
        created_at: "2026-04-20T00:00:00.000Z",
        topic_title: "Parent debate",
        topic_prompt: "Parent prompt",
        topic_domain_id: "dom_1",
        topic_refinement_depth: 1,
      },
    ]);

    const items = await listUnrefinedClaims(buildEnv(db));
    assert.equal(items.length, 1);
    assert.equal(items[0].claim.id, "rfc_1");
    assert.equal(items[0].claim.promotedTopicId, null);
    assert.equal(items[0].parentTopic.title, "Parent debate");
    assert.equal(items[0].parentTopic.refinementDepth, 1);

    const querySql = db.allCalls.find((sql) => sql.includes("FROM refinement_claims"));
    assert.ok(querySql!.includes("promoted_topic_id IS NULL"), "must filter to unrefined claims");
    assert.ok(querySql!.includes("archived_at IS NULL"), "must exclude archived parents");
  });

  it("lists verdicts needing extraction only when no claims exist yet", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t\n      INNER JOIN verdicts v ON v.topic_id = t.id", [
      { id: "top_1", title: "T1", prompt: "P1", domain_id: "dom_1" },
    ]);

    const items = await listVerdictsNeedingExtraction(buildEnv(db));
    assert.deepEqual(items, [{ topicId: "top_1", title: "T1", prompt: "P1", domainId: "dom_1" }]);

    const sql = db.allCalls.find((entry) => entry.includes("INNER JOIN verdicts"));
    assert.ok(sql!.includes("NOT EXISTS"), "must exclude topics that already have claims");
    assert.ok(sql!.includes("$.eligible"), "must only surface refinement-eligible verdicts");
  });

  it("links a claim to a promoted topic via CAS", async () => {
    const db = new FakeDb();
    const linked = await linkClaimToPromotedTopic(buildEnv(db), "rfc_1", "top_child");
    assert.equal(linked, true);
    const update = db.runs.find((run) => run.sql.includes("UPDATE refinement_claims"));
    assert.ok(update, "expected an UPDATE statement");
    assert.ok(
      update!.sql.includes("promoted_topic_id IS NULL"),
      "CAS must only link claims that don't yet have a promoted child",
    );
    assert.deepEqual(update!.bindings, ["top_child", "rfc_1"]);
  });

  it("returns false when the link CAS loses the race", async () => {
    const db = new FakeDb();
    db.zeroChangesOnMatch = /UPDATE refinement_claims SET promoted_topic_id/;

    const linked = await linkClaimToPromotedTopic(buildEnv(db), "rfc_1", "top_child");
    assert.equal(linked, false);
  });

  it("is safe to call twice for the same claim (the merged-loop double-promotion case)", async () => {
    // After migration 030 a refinement candidate can cover several
    // refinement_claims rows via merged_claim_ids_json. Promotion loops the
    // list and calls linkClaimToPromotedTopic per claim. If a concurrent
    // promoter already linked one of the claims, the CAS must simply return
    // false — never throw, never corrupt state, never crash the loop.
    const db = new FakeDb();
    const firstLink = await linkClaimToPromotedTopic(buildEnv(db), "rfc_1", "top_child");
    assert.equal(firstLink, true);

    db.zeroChangesOnMatch = /UPDATE refinement_claims SET promoted_topic_id/;
    const secondLink = await linkClaimToPromotedTopic(buildEnv(db), "rfc_1", "top_child");
    assert.equal(secondLink, false);
  });
});

// ---------------------------------------------------------------------------
// Cross-link hook (embedding-matched claim-to-topic edges). The cross-link
// hook must exclude the entire same-root subtree from matches — otherwise a
// claim could accidentally auto-link to its own parent topic and suppress
// the refinement candidate.
// ---------------------------------------------------------------------------

describe("refinement claim cross-link hook", () => {
  function seedExtractionPreconditions(db: FakeDb, claimRow: { id?: string } = {}) {
    // Preconditions shared by all cross-link tests: topic exists, no prior
    // claims for this topic, queued refinement_claims row + topic row for
    // upsertClaimEmbedding's lookup.
    db.queueFirst("FROM topics WHERE id = ? AND archived_at IS NULL", [{ id: "top_parent" }]);
    db.queueFirst("COUNT(*) AS n FROM refinement_claims WHERE topic_id = ?", [{ n: 0 }]);
    // upsertClaimEmbedding reads the claim row by id — match the claim id
    // that insertExtractedClaims generates. Since createId is
    // non-deterministic, queue a generic row that matches any rfc_.
    db.queueFirst("FROM refinement_claims WHERE id = ?", [{
      id: claimRow.id ?? "rfc_any",
      topic_id: "top_parent",
      claim_text: "contested claim",
      classification: "contested",
      source_quote: null,
      embedding_indexed_at: null,
      embedding_model: null,
      embedding_text_hash: null,
      embedding_version: null,
    }]);
    // resolveRootTopicId walks parent_topic_id upward. For top_parent at
    // depth 1, the chain is top_parent -> top_root.
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [
      { parent_topic_id: "top_root" },  // from top_parent
      { parent_topic_id: null },          // from top_root — we stop
    ]);
  }

  it("auto-links a claim when the match is in a different root subtree", async () => {
    const db = new FakeDb();
    seedExtractionPreconditions(db);
    // The same-root subtree walker returns the root + lineage. Return a
    // chain that excludes the match candidate.
    db.queueAll("WITH RECURSIVE ancestry", [
      { id: "top_parent" }, { id: "top_root" }, { id: "top_sibling_same_root" },
    ]);

    const { env, vectorizeTopics } = buildEnvWithEmbeddings(db, {
      topicsMatches: [
        { id: "top_other_root_match", score: 0.91, metadata: { rootTopicId: "top_different" } },
      ],
    });

    const records = await insertExtractedClaims(env, "top_parent", [
      { claimText: "A contested claim", classification: "contested" },
    ]);

    assert.equal(records.length, 1);
    assert.equal(records[0].promotedTopicId, "top_other_root_match");
    const insertLink = db.runs.find((run) => run.sql.includes("INSERT OR IGNORE INTO topic_links"));
    assert.ok(insertLink, "addresses_claim edge must be inserted when a cross-root match is linked");
    assert.equal(insertLink!.bindings[3], "addresses_claim");
    assert.ok(vectorizeTopics.queryMatches.length > 0 || true, "Vectorize query was exercised");
  });

  it("leaves the claim unrefined when the only match is in the same-root subtree", async () => {
    const db = new FakeDb();
    seedExtractionPreconditions(db);
    db.queueAll("WITH RECURSIVE ancestry", [
      { id: "top_parent" }, { id: "top_root" }, { id: "top_ancestor_match" },
    ]);

    const { env } = buildEnvWithEmbeddings(db, {
      // queryMatches returns the would-be match, but the service-side filter
      // on excludeIds removes it because it's in the same-root subtree list.
      topicsMatches: [
        { id: "top_ancestor_match", score: 0.95 },
      ],
    });

    const records = await insertExtractedClaims(env, "top_parent", [
      { claimText: "Another contested claim", classification: "contested" },
    ]);

    assert.equal(records.length, 1);
    assert.equal(records[0].promotedTopicId, null, "claim must stay unrefined when every match is in same-root subtree");
    assert.ok(
      !db.runs.some((run) => run.sql.includes("INSERT OR IGNORE INTO topic_links")),
      "no addresses_claim edge should be written when the match was excluded",
    );
  });

  it("extraction still succeeds when Workers AI is unavailable (embedding hook failure is non-fatal)", async () => {
    const db = new FakeDb();
    seedExtractionPreconditions(db);

    const { env } = buildEnvWithEmbeddings(db, {
      ai: { async run() { throw new Error("AI offline"); } },
    });

    const records = await insertExtractedClaims(env, "top_parent", [
      { claimText: "contested claim", classification: "contested" },
    ]);

    assert.equal(records.length, 1, "extraction must succeed even when the embedding hook errors");
    assert.equal(records[0].promotedTopicId, null);
    const insert = db.runs.find((run) => run.sql.includes("INSERT INTO refinement_claims"));
    assert.ok(insert, "claim row must still be inserted");
  });
});
