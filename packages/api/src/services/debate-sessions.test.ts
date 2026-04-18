import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanupStaleDebateSessions,
  createDebateSession,
  getDebateSessionStatus,
  bootstrapDebateSession,
} from "./debate-sessions.js";

// --- FakeDb that tracks queries and returns canned results ---

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
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  readonly runs: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly firstCalls: string[] = [];
  readonly allCalls: string[] = [];
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

  async batch(statements: FakePreparedStatement[]) {
    for (const statement of statements) {
      this.runs.push({ sql: statement.sql, bindings: statement.bindings });
    }
    return statements.map(() => ({ success: true }));
  }

  consumeFirst<T>(sql: string, _bindings: unknown[] = []): T | null {
    this.firstCalls.push(sql);
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) return null;
    const [, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(entry[0], rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string, _bindings: unknown[] = []): T[] {
    this.allCalls.push(sql);
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) return [];
    this.allQueue.delete(entry[0]);
    return entry[1] as T[];
  }
}

class FakeKv {
  readonly store = new Map<string, { value: string; ttl?: number }>();
  readonly deletes: string[] = [];

  async get(key: string, format?: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return format === "json" ? JSON.parse(entry.value) : entry.value;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }) {
    this.store.set(key, { value, ttl: opts?.expirationTtl });
  }

  async delete(key: string) {
    this.store.delete(key);
    this.deletes.push(key);
  }
}

function buildEnv(db: FakeDb, kv: FakeKv) {
  return {
    DB: db as unknown as D1Database,
    PUBLIC_CACHE: kv as unknown as KVNamespace,
    ROOT_DOMAIN: "opndomain.com",
  } as never;
}

// --- Tests ---

describe("debate session status", () => {
  it("returns null for stale sessions so lazy-create can reactivate them", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    // No KV entry — falls through to D1
    db.queueFirst("FROM debate_sessions", [{
      id: "ds_1",
      topic_id: "top_1",
      being_id: "bng_1",
      client_id: null,
      status: "stale",
      next_wake_at: null,
      current_round_index: 0,
      pending_action: "generate_body",
      pending_action_payload: "{}",
      sticky_guidance: null,
      last_reducer_at: null,
      last_client_touch_at: null,
      last_error: null,
      retry_count: 0,
      terminal_outcome: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }]);

    const result = await getDebateSessionStatus(env, "top_1", "bng_1");
    assert.equal(result, null, "stale session must return null so route handler bootstraps it");
  });

  it("returns status for active sessions from D1 when KV misses", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    db.queueFirst("FROM debate_sessions", [{
      id: "ds_2",
      topic_id: "top_1",
      being_id: "bng_1",
      client_id: null,
      status: "active",
      next_wake_at: "2026-04-01T01:00:00.000Z",
      current_round_index: 2,
      pending_action: "generate_body",
      pending_action_payload: "{}",
      sticky_guidance: "be concise",
      last_reducer_at: "2026-04-01T00:30:00.000Z",
      last_client_touch_at: "2026-04-01T00:30:00.000Z",
      last_error: null,
      retry_count: 0,
      terminal_outcome: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:30:00.000Z",
    }]);

    const result = await getDebateSessionStatus(env, "top_1", "bng_1");
    assert.notEqual(result, null);
    assert.equal(result!.status, "active");
    assert.equal(result!.pendingAction, "generate_body");
    assert.equal(result!.roundIndex, 2);
    assert.equal(result!.stickyGuidance, "be concise");
  });

  it("returns status from KV cache when available", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    const cached = {
      status: "active",
      pendingAction: "wait_until",
      roundIndex: 1,
      nextWakeAt: "2026-04-01T02:00:00.000Z",
      stickyGuidance: null,
      updatedAt: "2026-04-01T01:00:00.000Z",
    };
    await kv.put("debate-flag:bng_1:top_1", JSON.stringify(cached));

    const result = await getDebateSessionStatus(env, "top_1", "bng_1");
    assert.deepEqual(result, cached, "should return KV-cached payload without hitting D1");
  });

  it("returns null when no session exists", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    const result = await getDebateSessionStatus(env, "top_1", "bng_1");
    assert.equal(result, null);
  });
});

describe("debate session bootstrap reactivates stale rows", () => {
  it("reactivates a stale session and runs the reducer", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    // bootstrapDebateSession calls:
    // 1. UPDATE ... SET status = 'active' WHERE ... AND status = 'stale'  (reactivate)
    // 2. INSERT OR IGNORE (createDebateSession — no-op if row exists after reactivate)
    // 3. getTopicRow  — queue topic row
    // 4. SELECT persona_text, persona_label FROM beings
    // 5. buildTopicContextCore queries — rounds, members, transcript, etc.

    // Topic row for getTopicRow (two reads — getTopicRow + buildTopicContextCore uses it passed in)
    const topicRow = {
      id: "top_1",
      domain_id: "dom_1",
      title: "Test Topic",
      prompt: "Test prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "manual_user",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: "3h",
      cadence_override_minutes: null,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      change_sequence: 0,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    };
    // getTopicRow queried via "FROM topics"
    db.queueFirst("FROM topics", [topicRow]);
    // Being persona — must use persona_text (not persona) to match the column shipped in migration 023.
    db.queueFirst("FROM beings WHERE id", [{ persona_text: "Steady empirical critic", persona_label: "empirical" }]);
    // buildTopicContextCore queries — return empty results for simplicity
    // The topic status is "open" with no active round, so reducer returns awaiting_round_start

    const result = await bootstrapDebateSession(env, "top_1", "bng_1");

    assert.equal(result.status, "active");
    // With no active round, reducer returns wait_until
    assert.equal(result.pendingAction, "wait_until");

    // Verify the stale reactivation UPDATE was issued
    const reactivateRun = db.runs.find((run) =>
      run.sql.includes("status = 'active'") && run.sql.includes("status = 'stale'"),
    );
    assert.ok(reactivateRun, "should issue UPDATE to reactivate stale row");

    // Regression guard: the SELECT must reference persona_text, not the pre-migration `persona` column.
    const personaSelect = db.firstCalls.find((sql) => sql.includes("FROM beings WHERE id"));
    assert.ok(personaSelect, "expected a SELECT against beings by id");
    assert.ok(
      personaSelect!.includes("persona_text") && personaSelect!.includes("persona_label"),
      "persona fetch must select persona_text and persona_label (migration 023)",
    );
    assert.ok(
      !/\bpersona\b[^_]/i.test(personaSelect!),
      "persona fetch must not reference the pre-migration `persona` column",
    );

    // Verify KV flag was written
    assert.ok(kv.store.has("debate-flag:bng_1:top_1"), "should write KV flag for reactivated session");
  });
});

describe("debate session stale cleanup", () => {
  it("marks sessions with NULL last_client_touch_at as stale", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    // Rows returned by the SELECT query for stale sessions
    db.queueAll("FROM debate_sessions", [
      { being_id: "bng_1", topic_id: "top_1" },
      { being_id: "bng_2", topic_id: "top_2" },
    ]);

    const now = new Date("2026-04-10T12:00:00.000Z");
    await cleanupStaleDebateSessions(env, now);

    // Verify the UPDATE was issued
    const updateRun = db.runs.find((run) =>
      run.sql.includes("SET status = 'stale'"),
    );
    assert.ok(updateRun, "should issue UPDATE to mark sessions stale");

    // Verify the UPDATE SQL includes the NULL check
    assert.ok(
      updateRun!.sql.includes("last_client_touch_at IS NULL"),
      "cleanup query must handle NULL last_client_touch_at",
    );

    // Verify KV flags were deleted
    assert.ok(kv.deletes.includes("debate-flag:bng_1:top_1"), "should delete KV flag for stale session 1");
    assert.ok(kv.deletes.includes("debate-flag:bng_2:top_2"), "should delete KV flag for stale session 2");
  });

  it("does nothing when no stale sessions exist", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    // Empty result set — no stale sessions
    db.queueAll("FROM debate_sessions", []);

    const now = new Date("2026-04-10T12:00:00.000Z");
    await cleanupStaleDebateSessions(env, now);

    // No UPDATE should be issued
    const updateRun = db.runs.find((run) =>
      run.sql.includes("SET status = 'stale'"),
    );
    assert.equal(updateRun, undefined, "should not issue UPDATE when no stale sessions");
    assert.equal(kv.deletes.length, 0);
  });
});

describe("debate session auto-enrollment", () => {
  it("sets last_client_touch_at on creation so cleanup can age it out", async () => {
    const db = new FakeDb();
    const kv = new FakeKv();
    const env = buildEnv(db, kv);

    await createDebateSession(env, "top_1", "bng_1");

    const insertRun = db.runs.find((run) =>
      run.sql.includes("INSERT OR IGNORE INTO debate_sessions"),
    );
    assert.ok(insertRun, "should issue INSERT");
    assert.ok(
      insertRun!.sql.includes("last_client_touch_at"),
      "INSERT must include last_client_touch_at column",
    );
  });
});
