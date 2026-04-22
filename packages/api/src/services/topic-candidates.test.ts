import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { batchUpsertTopicCandidates, promoteTopicCandidates } from "./topic-candidates.js";

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
  batches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  firstCalls: string[] = [];
  allCalls: string[] = [];
  throwOnFirstMatch: RegExp | null = null;
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

  async batch(statements: FakePreparedStatement[]) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    return [];
  }

  consumeFirst<T>(sql: string): T | null {
    this.firstCalls.push(sql);
    if (this.throwOnFirstMatch?.test(sql)) {
      throw new Error(`forced first() failure for ${sql}`);
    }
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
    this.allCalls.push(sql);
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    if (!entry) {
      return [];
    }
    return entry[1] as T[];
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

class FakeBucket {
  writes: Array<{ key: string; body: string }> = [];

  async put(key: string, body: string) {
    this.writes.push({ key, body });
  }
}

function refinementFailureEvents(bucket: FakeBucket) {
  return bucket.writes
    .filter((write) => write.key.includes("protocol-events/v1/") && write.key.includes("kind=refinement_failure"))
    .map((write) => JSON.parse(write.body.trim()) as { kind: string; stage: string; topicId: string; parentTopicId?: string });
}

function buildEnv(db: FakeDb, snapshots?: FakeBucket) {
  return {
    DB: db as never,
    PUBLIC_CACHE: new FakeCache() as never,
    SNAPSHOTS: snapshots as never,
    ENABLE_ELASTIC_ROUNDS: false,
  } as never;
}

describe("topic candidates", () => {
  it("creates new candidates when no duplicate exists", async () => {
    const db = new FakeDb();

    const result = await batchUpsertTopicCandidates(buildEnv(db), [{
      id: "ignored_by_service",
      source: "arxiv",
      sourceId: "1234.5678",
      sourceUrl: "https://arxiv.org/abs/1234.5678",
      domainId: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceFamily: "scheduled",
      cadenceOverrideMinutes: 180,
      minTrustTier: "supervised",
      priorityScore: 8,
      publishedAt: "2026-03-31T00:00:00.000Z",
    }]);

    assert.deepEqual(result, {
      createdCount: 1,
      updatedCount: 0,
      duplicates: [],
    });
    assert.ok(db.runs.some((entry) => entry.sql.includes("INSERT INTO topic_candidates")));
  });

  it("updates approved duplicates and preserves consumed duplicates as conflicts", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "arxiv",
      source_id: "1234.5678",
      source_url: "https://arxiv.org/abs/1234.5678",
      domain_id: "dom_1",
      title: "Old",
      prompt: "Old prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 180,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 1,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
    }, {
      id: "tcand_2",
      source: "arxiv",
      source_id: "9999.0000",
      source_url: "https://arxiv.org/abs/9999.0000",
      domain_id: "dom_1",
      title: "Consumed",
      prompt: "Consumed prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 180,
      min_trust_tier: "supervised",
      status: "consumed",
      priority_score: 5,
      published_at: null,
      promoted_topic_id: "top_1",
      promotion_error: null,
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
    }]);

    const result = await batchUpsertTopicCandidates(buildEnv(db), [
      {
        id: "ignored_1",
        source: "arxiv",
        sourceId: "1234.5678",
        sourceUrl: "https://arxiv.org/abs/1234.5678",
        domainId: "dom_2",
        title: "Updated",
        prompt: "Updated prompt",
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 120,
        minTrustTier: "verified",
        priorityScore: 9,
        publishedAt: null,
      },
      {
        id: "ignored_2",
        source: "arxiv",
        sourceId: "9999.0000",
        sourceUrl: "https://arxiv.org/abs/9999.0000",
        domainId: "dom_1",
        title: "Should duplicate",
        prompt: "Should duplicate",
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 180,
        minTrustTier: "supervised",
        priorityScore: 4,
        publishedAt: null,
      },
    ]);

    assert.equal(result.createdCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.deepEqual(result.duplicates, [{
      kind: "source_identity_duplicate",
      existingRecordKind: "candidate",
      source: "arxiv",
      sourceId: "9999.0000",
      sourceUrl: "https://arxiv.org/abs/9999.0000",
      domainId: "dom_1",
      existingCandidateId: "tcand_2",
      reason: "source_identity_match",
      matchedTitle: "Consumed",
    }]);
    assert.ok(db.runs.some((entry) => entry.sql.includes("UPDATE topic_candidates")));
  });

  it("promotes the highest-ranked approved candidate without creating a creator member", async () => {
    const db = new FakeDb();
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "arxiv",
      source_id: "1234.5678",
      source_url: "https://arxiv.org/abs/1234.5678",
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: null,
      status: "active",
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
      id: "top_new",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 60,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: "2026-03-31T00:30:00.000Z",
      join_until: "2026-03-31T00:15:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      change_sequence: 0,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.equal(result.cron, "*/1 * * * *");
    assert.equal(result.mutatedTopicIds.length, 1);
    assert.ok(db.batches.some((batch) => batch.some((statement) => statement.sql.includes("INSERT INTO topics"))));
    assert.ok(db.batches.every((batch) => batch.every((statement) => !statement.sql.includes("INSERT INTO topic_members"))));
    assert.ok(db.runs.some((entry) => entry.sql.includes("SET status = 'consumed'")));
  });

  it("skips a candidate when the atomic claim loses the race", async () => {
    // Regression: before claim-then-create, two concurrent invocations could
    // both SELECT the same approved candidate and both call createSystemTopic,
    // producing duplicate topics with the same title. The CAS claim now
    // returns rows_affected=0 when another promoter already flipped the row
    // from 'approved', and the loop must continue without creating a topic.
    const db = new FakeDb();
    db.zeroChangesOnMatch = /UPDATE topic_candidates SET status = 'consumed' WHERE id = \? AND status = 'approved'/;
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_racy",
      source: "rss",
      source_id: "rss:racy",
      source_url: null,
      domain_id: "dom_1",
      title: "Raced Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.deepEqual(result.mutatedTopicIds, []);
    assert.equal(
      db.batches.length,
      0,
      "topic creation must not run when the claim was lost to a concurrent promoter",
    );
    assert.ok(
      db.runs.some((entry) => entry.sql.includes("UPDATE topic_candidates SET status = 'consumed' WHERE id = ? AND status = 'approved'")),
      "the CAS claim must be attempted before creating the topic",
    );
    assert.ok(
      !db.runs.some((entry) => entry.sql.includes("UPDATE topic_candidates SET promoted_topic_id")),
      "promoted_topic_id must not be written when the claim was lost",
    );
  });

  it("restricts the promotion gap query to non-archived blocking topics", async () => {
    const db = new FakeDb();
    db.queueAll("SELECT d.id", []);
    await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });
    const gapSql = db.allCalls.find((sql) => sql.includes("SELECT d.id") && sql.includes("FROM domains"));
    assert.ok(gapSql, "expected a domain-gap query");
    assert.ok(
      gapSql!.includes("t.archived_at IS NULL"),
      "promotion gap query must exclude archived topics so archived-but-open rows don't block their domain",
    );
    assert.ok(
      gapSql!.includes("t.status IN ('open', 'countdown', 'started')"),
      "promotion gap query must still guard against currently active lifecycle states",
    );
  });

  it("fetches refinement candidates in a pre-gap phase so they bypass the one-per-domain cap", async () => {
    // Regression: before the bypass, refinement children with real parent
    // pedigree were blocked behind speculative general-research topics sitting
    // open with zero members. They have narrow, closed-debate provenance and
    // should promote even when the domain is "occupied" by an unrelated topic.
    const db = new FakeDb();
    // Simulate no domain gap at all — every domain already has an active topic.
    db.queueAll("SELECT d.id", []);
    await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });
    const refinementFetch = db.allCalls.find((sql) =>
      sql.includes("FROM topic_candidates")
      && sql.includes("WHERE source = ?")
      && sql.includes("status = 'approved'")
      && !sql.includes("domain_id = ?"),
    );
    assert.ok(
      refinementFetch,
      "promotion must run an ungated SELECT for refinement candidates before the domain-gap phase",
    );
    const postGapFetch = db.firstCalls.find((sql) =>
      sql.includes("FROM topic_candidates")
      && sql.includes("domain_id = ?")
      && sql.includes("source != ?"),
    );
    if (db.firstCalls.some((sql) => sql.includes("WHERE domain_id = ?"))) {
      assert.ok(
        postGapFetch,
        "per-domain candidate lookup must exclude refinement source so it isn't double-promoted",
      );
    }
  });

  it("marks invalid candidates failed instead of promoting them", async () => {
    const db = new FakeDb();
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "manual",
      source_id: "bad-1",
      source_url: "https://example.com/bad-1",
      domain_id: "dom_1",
      title: "Bad Candidate",
      prompt: "Prompt",
      template_id: "unknown_template",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.deepEqual(result.mutatedTopicIds, []);
    assert.ok(db.runs.some((entry) => entry.sql.includes("SET status = 'failed'")));
    assert.equal(db.batches.length, 0);
  });

  it("skips dedupe against ancestor topics and ancestor refinement candidates", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT parent_topic_id FROM topics WHERE id = ?", [
      { parent_topic_id: "top_parent" },
      { parent_topic_id: null },
    ]);
    db.queueAll("FROM topics\n        WHERE domain_id = ?", [{
      id: "top_parent",
      domain_id: "dom_1",
      status: "closed",
      title: "Parent topic",
      prompt: "Parent prompt",
    }, {
      id: "top_other",
      domain_id: "dom_1",
      status: "closed",
      title: "Other topic",
      prompt: "Other prompt",
    }]);
    db.queueAll("FROM topic_candidates\n        WHERE domain_id = ?", [{
      id: "tcand_parent",
      domain_id: "dom_1",
      status: "approved",
      title: "Parent refinement candidate",
      prompt: "Parent prompt",
      source: "vertical_refinement",
      source_id: "top_parent",
    }]);

    const result = await batchUpsertTopicCandidates(buildEnv(db), [{
      id: "ignored",
      source: "vertical_refinement",
      sourceId: "top_child",
      sourceClaimId: "cl_target",
      domainId: "dom_1",
      title: "Parent topic",
      prompt: "Parent prompt",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceFamily: "scheduled",
      cadenceOverrideMinutes: 2,
      minTrustTier: "unverified",
      priorityScore: 90,
      publishedAt: null,
    }]);

    assert.equal(result.createdCount, 1);
    assert.deepEqual(result.duplicates, []);
  });

  it("links refinement children after promotion without failing the promoted topic", async () => {
    const db = new FakeDb();
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "vertical_refinement",
      source_id: "top_parent",
      source_url: null,
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 2,
      min_trust_tier: "unverified",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: null,
      status: "active",
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
      id: "top_child",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "cron_auto",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 2,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "unverified",
      visibility: "public",
      current_round_index: 0,
      starts_at: "2026-03-31T00:30:00.000Z",
      join_until: "2026-03-31T00:15:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      parent_topic_id: null,
      refinement_depth: 0,
      change_sequence: 0,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);
    db.queueFirst("SELECT refinement_depth, title FROM topics WHERE id = ?", [{
      refinement_depth: 1,
      title: "Parent topic",
    }]);
    db.queueFirst("SELECT refinement_status_json FROM verdicts WHERE topic_id = ?", [{
      refinement_status_json: JSON.stringify({
        eligible: true,
        reason: "contested",
        whatSettled: "Settled",
        whatContested: "Contested",
        neutralVerdict: "Neutral verdict",
      }),
    }]);

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.deepEqual(result.mutatedTopicIds, ["top_child"]);
    assert.ok(db.runs.some((entry) => entry.sql.includes("SET parent_topic_id = ?, refinement_depth = ?")));
    assert.ok(db.runs.some((entry) => entry.sql.includes("INSERT OR IGNORE INTO topic_refinement_context")));
  });

  it("keeps the promoted child when refinement linkage throws and archives the failure", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "vertical_refinement",
      source_id: "top_parent",
      source_url: null,
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 2,
      min_trust_tier: "unverified",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: null,
      status: "active",
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
      id: "top_child",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "cron_auto",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 2,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "unverified",
      visibility: "public",
      current_round_index: 0,
      starts_at: "2026-03-31T00:30:00.000Z",
      join_until: "2026-03-31T00:15:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      parent_topic_id: null,
      refinement_depth: 0,
      change_sequence: 0,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);
    db.queueFirst("SELECT refinement_depth, title FROM topics WHERE id = ?", [{
      refinement_depth: 1,
      title: "Parent topic",
    }]);
    db.queueFirst("SELECT refinement_status_json FROM verdicts WHERE topic_id = ?", [{
      refinement_status_json: "{invalid-json",
    }]);

    const result = await promoteTopicCandidates(
      buildEnv(db, snapshots),
      { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") },
    );

    assert.deepEqual(result.mutatedTopicIds, ["top_child"]);
    assert.ok(db.runs.some((entry) => entry.sql.includes("SET status = 'consumed'")));
    const events = refinementFailureEvents(snapshots);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "refinement_failure");
    assert.equal(events[0]?.stage, "link_child");
    assert.equal(events[0]?.topicId, "top_child");
    assert.equal(events[0]?.parentTopicId, "top_parent");
  });

  // --- Merged-claim refinement dedup (migration 030) ---

  it("rejects refinement candidates missing sourceClaimId as invalid input (not a duplicate)", async () => {
    const db = new FakeDb();
    await assert.rejects(
      () => batchUpsertTopicCandidates(buildEnv(db), [{
        id: "ignored",
        source: "vertical_refinement",
        sourceId: "top_parent",
        // sourceClaimId intentionally omitted — service guard must throw
        // because the partial unique index keys on source_claim_id.
        domainId: "dom_1",
        title: "Candidate",
        prompt: "Prompt body long enough to satisfy producers.",
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 2,
        minTrustTier: "unverified",
        priorityScore: 90,
        publishedAt: null,
      }]),
      (error: unknown) => {
        // badRequest uses a distinct error code so callers can tell this
        // apart from a duplicate/conflict result.
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /invalid_refinement_candidate|sourceClaimId/i);
        return true;
      },
    );
    assert.equal(db.runs.length, 0, "no INSERT should fire for an invalid refinement candidate");
  });

  it("upserts one refinement candidate per distinct sourceClaimId from the same parent (no collision)", async () => {
    const db = new FakeDb();

    const result = await batchUpsertTopicCandidates(buildEnv(db), [
      {
        id: "ignored_a",
        source: "vertical_refinement",
        sourceId: "top_parent",
        sourceClaimId: "cl_a",
        mergedClaimIds: ["cl_a"],
        domainId: "dom_1",
        title: "Follow-up A",
        prompt: "Prompt body for follow-up A, long enough to satisfy producers and readers.",
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 2,
        minTrustTier: "unverified",
        priorityScore: 90,
        publishedAt: null,
      },
      {
        id: "ignored_b",
        source: "vertical_refinement",
        sourceId: "top_parent",
        sourceClaimId: "cl_b",
        mergedClaimIds: ["cl_b"],
        domainId: "dom_1",
        title: "Follow-up B",
        prompt: "Prompt body for follow-up B, long enough to satisfy producers and readers.",
        templateId: "debate",
        topicFormat: "scheduled_research",
        cadenceFamily: "scheduled",
        cadenceOverrideMinutes: 2,
        minTrustTier: "unverified",
        priorityScore: 90,
        publishedAt: null,
      },
    ]);

    // Before migration 030 these two would collide on (source, source_id).
    // Now they live as separate rows keyed on (source, source_id, source_claim_id).
    assert.equal(result.createdCount, 2);
    assert.deepEqual(result.duplicates, []);
    const inserts = db.runs.filter((entry) => entry.sql.includes("INSERT INTO topic_candidates"));
    assert.equal(inserts.length, 2);
  });

  it("persists merged_claim_ids_json when the candidate covers multiple claims", async () => {
    const db = new FakeDb();

    const result = await batchUpsertTopicCandidates(buildEnv(db), [{
      id: "ignored",
      source: "vertical_refinement",
      sourceId: "top_parent",
      sourceClaimId: "cl_primary",
      mergedClaimIds: ["cl_primary", "cl_sibling"],
      domainId: "dom_1",
      title: "Merged follow-up",
      prompt: "Prompt body long enough to satisfy producers and readers of the debate question.",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceFamily: "scheduled",
      cadenceOverrideMinutes: 2,
      minTrustTier: "unverified",
      priorityScore: 90,
      publishedAt: null,
    }]);

    assert.equal(result.createdCount, 1);
    const insert = db.runs.find((entry) => entry.sql.includes("INSERT INTO topic_candidates"));
    assert.ok(insert, "INSERT must run");
    const serialized = insert!.bindings.find((binding) => typeof binding === "string" && binding.includes("cl_primary") && binding.includes("cl_sibling"));
    assert.equal(typeof serialized, "string");
    assert.deepEqual(JSON.parse(serialized as string), ["cl_primary", "cl_sibling"]);
  });

  function queueRefinementPromotion(db: FakeDb, candidateOverrides: Record<string, unknown>) {
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "vertical_refinement",
      source_id: "top_parent",
      source_url: null,
      source_claim_id: null,
      merged_claim_ids_json: null,
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 2,
      min_trust_tier: "unverified",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
      ...candidateOverrides,
    }]);
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: null,
      status: "active",
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
      id: "top_child",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "cron_auto",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 2,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "unverified",
      visibility: "public",
      current_round_index: 0,
      starts_at: "2026-03-31T00:30:00.000Z",
      join_until: "2026-03-31T00:15:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      parent_topic_id: null,
      refinement_depth: 0,
      change_sequence: 0,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);
    db.queueFirst("SELECT refinement_depth, title FROM topics WHERE id = ?", [{
      refinement_depth: 1,
      title: "Parent topic",
    }]);
    db.queueFirst("SELECT refinement_status_json FROM verdicts WHERE topic_id = ?", [{
      refinement_status_json: JSON.stringify({
        eligible: true,
        reason: "contested",
        whatSettled: "Settled",
        whatContested: "Contested",
        neutralVerdict: "Neutral verdict",
      }),
    }]);
  }

  function claimLinkCalls(db: FakeDb) {
    return db.runs.filter((entry) =>
      entry.sql.includes("UPDATE refinement_claims")
      && entry.sql.includes("SET promoted_topic_id")
      && entry.sql.includes("promoted_topic_id IS NULL"),
    );
  }

  it("links every merged claim ID to the promoted child topic", async () => {
    const db = new FakeDb();
    queueRefinementPromotion(db, {
      source_claim_id: "cl_primary",
      merged_claim_ids_json: JSON.stringify(["cl_primary", "cl_sibling"]),
    });

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.deepEqual(result.mutatedTopicIds, ["top_child"]);
    const linkCalls = claimLinkCalls(db);
    assert.equal(linkCalls.length, 2, "both merged claims must be linked to the new topic");
    const linkedClaimIds = new Set(linkCalls.map((entry) => entry.bindings[1]));
    assert.deepEqual(linkedClaimIds, new Set(["cl_primary", "cl_sibling"]));
  });

  it("falls back to source_claim_id when merged_claim_ids_json is NULL (back-compat for pre-030 rows)", async () => {
    const db = new FakeDb();
    queueRefinementPromotion(db, {
      source_claim_id: "cl_only",
      merged_claim_ids_json: null,
    });

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    assert.deepEqual(result.mutatedTopicIds, ["top_child"]);
    const linkCalls = claimLinkCalls(db);
    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0]?.bindings[1], "cl_only");
  });

  it("falls back to source_claim_id on malformed merged_claim_ids_json without orphaning the child topic", async () => {
    const db = new FakeDb();
    queueRefinementPromotion(db, {
      source_claim_id: "cl_fallback",
      merged_claim_ids_json: "{not-an-array",
    });

    const result = await promoteTopicCandidates(buildEnv(db), { cron: "*/1 * * * *", now: new Date("2026-03-31T00:00:00.000Z") });

    // Child topic must still be created — the parse error is non-fatal.
    assert.deepEqual(result.mutatedTopicIds, ["top_child"]);
    const linkCalls = claimLinkCalls(db);
    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0]?.bindings[1], "cl_fallback");
  });
});
