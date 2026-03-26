import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApiApp } from "../index.js";

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
    return this.db.consumeFirst<T>(this.sql, this.bindings);
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql, this.bindings) };
  }

  async run() {
    return { success: true };
  }
}

class FakeDb {
  readonly allCalls: Array<{ sql: string; bindings: unknown[] }> = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, rows);
  }

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, rows);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(_statements: FakePreparedStatement[]) {
    return [];
  }

  consumeFirst<T>(sql: string, _bindings: unknown[] = []): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string, bindings: unknown[] = []): T[] {
    this.allCalls.push({ sql, bindings });
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

function buildEnv(db: FakeDb) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {} as never,
    PUBLIC_ARTIFACTS: {} as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {} as never,
    SESSION_COOKIE_NAME: "opn_session",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: false,
  } as never;
}

describe("topic routes", () => {
  it("passes validated status and domain filters into listTopics", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      status: "started",
      cadence_family: "quorum",
      cadence_preset: "3h",
      cadence_override_minutes: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?status=started&domain=ai-safety"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: Array<{ id: string }> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.status = ? AND d.slug = ?"));
    assert.deepEqual(query?.bindings, ["started", "ai-safety"]);
  });

  it("rejects invalid topic status filters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?status=invalid"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_topic_status");
    assert.equal(db.allCalls.length, 0);
  });
});
