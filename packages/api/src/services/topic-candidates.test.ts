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
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  batches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
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

function buildEnv(db: FakeDb) {
  return {
    DB: db as never,
    PUBLIC_CACHE: new FakeCache() as never,
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
      templateId: "debate_v2",
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
      template_id: "debate_v2",
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
      template_id: "debate_v2",
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
        templateId: "debate_v2",
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
        templateId: "debate_v2",
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
      template_id: "debate_v2",
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
      template_id: "debate_v2",
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
});
