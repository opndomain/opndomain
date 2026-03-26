import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordCronHeartbeat, sweepTopicLifecycle } from "./lifecycle.js";

class FakePreparedStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
    private bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    this.bindings = bindings;
    return this;
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql) };
  }

  async first<T>() {
    return this.db.consumeFirst<T>(this.sql);
  }

  async run() {
    return this.db.consumeRun(this.sql, this.bindings);
  }
}

class FakeDb {
  readonly executedBatches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  readonly runs: Array<{ sql: string; bindings: unknown[] }> = [];
  private allQueue = new Map<string, unknown[]>();
  private firstQueue = new Map<string, unknown[]>();
  private runQueue = new Map<string, number[]>();

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, rows);
  }

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, rows);
  }

  queueRun(sqlFragment: string, changes: number[]) {
    this.runQueue.set(sqlFragment, [...changes]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(statements: FakePreparedStatement[]) {
    this.executedBatches.push(
      statements.map((statement) => ({
        sql: (statement as unknown as { sql: string }).sql,
        bindings: (statement as unknown as { bindings: unknown[] }).bindings,
      })),
    );
    return [];
  }

  consumeRun(sql: string, bindings: unknown[]) {
    this.runs.push({ sql, bindings });
    const entry = Array.from(this.runQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return { success: true, meta: { changes: 1 } };
    }
    const [fragment, changesQueue] = entry;
    const [next = 1, ...rest] = changesQueue;
    this.runQueue.set(fragment, rest);
    return { success: true, meta: { changes: next } };
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return [];
    }
    this.allQueue.delete(entry[0]);
    return entry[1] as T[];
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
}

describe("topic lifecycle sweeps", () => {
  it("transitions topics and rounds during a manual sweep", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", [
      {
        id: "top_countdown",
        status: "open",
        cadence_family: "scheduled",
        starts_at: "2026-03-24T12:30:00.000Z",
        join_until: "2026-03-24T12:00:00.000Z",
      },
      {
        id: "top_start",
        status: "open",
        cadence_family: "scheduled",
        starts_at: "2026-03-24T11:45:00.000Z",
        join_until: "2026-03-24T11:30:00.000Z",
      },
    ]);
    db.queueFirst("COUNT(*) AS participant_count", [
      { participant_count: 3 },
      { participant_count: 3 },
    ]);
    db.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [
      {
        id: "rnd_1",
        topic_id: "top_start",
        domain_id: "dom_1",
        sequence_index: 0,
        status: "active",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:50:00.000Z",
        reveal_at: "2026-03-24T11:50:00.000Z",
        cadence_preset: "3h",
        config_json: JSON.stringify({
          completionStyle: "aggressive",
          visibility: "open",
          roundDurationMinutes: 60,
        }),
      },
    ]);
    db.queueAll("FROM contributions c", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        visibility: "normal",
        final_score: 80,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
      {
        id: "cnt_2",
        being_id: "bng_2",
        visibility: "normal",
        final_score: 70,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
      {
        id: "cnt_3",
        being_id: "bng_3",
        visibility: "normal",
        final_score: 75,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds r\n      INNER JOIN round_configs", [
      {
        id: "rnd_1",
        topic_id: "top_start",
        sequence_index: 0,
        status: "completed",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:50:00.000Z",
        reveal_at: "2026-03-24T11:50:00.000Z",
        config_json: JSON.stringify({ visibility: "open", roundDurationMinutes: 60 }),
      },
      {
        id: "rnd_2",
        topic_id: "top_start",
        sequence_index: 1,
        status: "pending",
        starts_at: "2026-03-24T12:00:00.000Z",
        ends_at: "2026-03-24T13:00:00.000Z",
        reveal_at: "2026-03-24T12:00:00.000Z",
        config_json: JSON.stringify({ visibility: "sealed", roundDurationMinutes: 60 }),
      },
    ]);
    db.queueAll("SELECT id FROM topics WHERE status = 'started'", [{ id: "top_stalled" }]);
    db.queueFirst("SELECT id FROM rounds WHERE topic_id = ? AND status = 'active' LIMIT 1", [null]);

    const env = {
      DB: db as unknown as D1Database,
      PUBLIC_CACHE: { get: async () => "0", put: async () => undefined } as unknown as KVNamespace,
    } as never;

    const result = await sweepTopicLifecycle(env, {
      now: new Date("2026-03-24T12:00:00.000Z"),
    });

    assert.equal(result.cron, "manual");
    assert.deepEqual(result.mutatedTopicIds.sort(), ["top_countdown", "top_start", "top_stalled"].sort());
    const statements = db.runs.map((statement) => statement.sql);
    assert.ok(statements.some((sql) => sql.includes("UPDATE topics SET status = 'countdown'")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE topics SET status = 'started', current_round_index = 0")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE rounds SET status = 'active' WHERE topic_id = ? AND sequence_index = 0")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE rounds SET status = 'completed'")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE rounds SET status = 'active', starts_at = ? WHERE id = ?")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE topics SET current_round_index = ?, status = 'started'")));
    assert.ok(statements.some((sql) => sql.includes("UPDATE topics SET status = 'stalled', stalled_at = ?")));
  });

  it("records cron heartbeats in KV", async () => {
    const writes: Array<{ key: string; value: string }> = [];
    const env = {
      PUBLIC_CACHE: {
        put: async (key: string, value: string) => {
          writes.push({ key, value });
        },
      },
    } as never;

    await recordCronHeartbeat(env, "*/5 * * * *", new Date("2026-03-24T12:00:00.000Z"));
    assert.deepEqual(writes, [
      {
        key: "cron/last-run/*/5 * * * *",
        value: "2026-03-24T12:00:00.000Z",
      },
    ]);
  });

  it("rewrites downstream round timings after early completion and preserves durations", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
    db.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [
      {
        id: "rnd_1",
        topic_id: "top_1",
        domain_id: "dom_1",
        sequence_index: 0,
        status: "active",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T12:00:00.000Z",
        reveal_at: "2026-03-24T11:00:00.000Z",
        cadence_preset: "3h",
        config_json: JSON.stringify({
          completionStyle: "aggressive",
          visibility: "open",
          roundDurationMinutes: 60,
        }),
      },
    ]);
    db.queueAll("FROM contributions c", [
      {
        id: "cnt_1",
        being_id: "bng_1",
        visibility: "normal",
        final_score: 80,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
      {
        id: "cnt_2",
        being_id: "bng_2",
        visibility: "normal",
        final_score: 70,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
      {
        id: "cnt_3",
        being_id: "bng_3",
        visibility: "normal",
        final_score: 65,
        round_visibility: "open",
        reveal_at: "2026-03-24T11:00:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds r\n      INNER JOIN round_configs", [
      {
        id: "rnd_1",
        topic_id: "top_1",
        sequence_index: 0,
        status: "completed",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:30:00.000Z",
        reveal_at: "2026-03-24T11:30:00.000Z",
        config_json: JSON.stringify({ visibility: "open", roundDurationMinutes: 60 }),
      },
      {
        id: "rnd_2",
        topic_id: "top_1",
        sequence_index: 1,
        status: "pending",
        starts_at: "2026-03-24T12:00:00.000Z",
        ends_at: "2026-03-24T13:00:00.000Z",
        reveal_at: "2026-03-24T13:00:00.000Z",
        config_json: JSON.stringify({ visibility: "sealed", roundDurationMinutes: 60 }),
      },
      {
        id: "rnd_3",
        topic_id: "top_1",
        sequence_index: 2,
        status: "pending",
        starts_at: "2026-03-24T13:00:00.000Z",
        ends_at: "2026-03-24T15:00:00.000Z",
        reveal_at: "2026-03-24T13:00:00.000Z",
        config_json: JSON.stringify({ visibility: "open", roundDurationMinutes: 120 }),
      },
    ]);
    db.queueAll("SELECT id FROM topics WHERE status = 'started'", []);

    const cacheWrites: Array<{ key: string; value: string }> = [];
    const env = {
      DB: db as unknown as D1Database,
      PUBLIC_CACHE: {
        get: async () => "0",
        put: async (key: string, value: string) => {
          cacheWrites.push({ key, value });
        },
      } as unknown as KVNamespace,
    } as never;

    const result = await sweepTopicLifecycle(env, {
      cron: "*/5 * * * *",
      now: new Date("2026-03-24T11:30:00.000Z"),
    });

    assert.deepEqual(result.mutatedTopicIds, ["top_1"]);
    const completedUpdate = db.runs.find((run) => run.sql.includes("UPDATE rounds SET status = 'completed'"));
    assert.deepEqual(completedUpdate?.bindings, ["2026-03-24T11:30:00.000Z", "2026-03-24T11:30:00.000Z", "rnd_1"]);

    const pendingRewrites = db.runs.filter((run) => run.sql.includes("UPDATE rounds SET starts_at = ?, ends_at = ?, reveal_at = ?"));
    assert.deepEqual(
      pendingRewrites.map((run) => run.bindings),
      [
        ["2026-03-24T11:30:00.000Z", "2026-03-24T12:30:00.000Z", "2026-03-24T12:30:00.000Z", "rnd_2"],
        ["2026-03-24T12:30:00.000Z", "2026-03-24T14:30:00.000Z", "2026-03-24T12:30:00.000Z", "rnd_3"],
      ],
    );
    assert.ok(db.runs.some((run) => run.sql.includes("UPDATE rounds SET status = 'active', starts_at = ? WHERE id = ?")));
    assert.ok(cacheWrites.some((write) => write.key.includes("public-invalidation:top_1")));
  });

  it("treats duplicate advancement as a no-op when the completion CAS changes zero rows", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
    db.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [
      {
        id: "rnd_1",
        topic_id: "top_1",
        domain_id: "dom_1",
        sequence_index: 0,
        status: "active",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:00:00.000Z",
        reveal_at: "2026-03-24T11:00:00.000Z",
        cadence_preset: "3h",
        config_json: JSON.stringify({ completionStyle: "aggressive", visibility: "open" }),
      },
    ]);
    db.queueRun("UPDATE rounds SET status = 'completed'", [0]);
    db.queueAll("SELECT id FROM topics WHERE status = 'started'", []);

    const result = await sweepTopicLifecycle(
      {
        DB: db as unknown as D1Database,
        PUBLIC_CACHE: { get: async () => "0", put: async () => undefined } as unknown as KVNamespace,
      } as never,
      { cron: "*/5 * * * *", now: new Date("2026-03-24T11:05:00.000Z") },
    );

    assert.deepEqual(result.mutatedTopicIds, []);
    assert.equal(db.runs.filter((run) => run.sql.includes("UPDATE rounds SET status = 'completed'")).length, 1);
    assert.equal(db.runs.some((run) => run.sql.includes("UPDATE topics SET current_round_index")), false);
  });

  it("supports aggressive, patient, and quality-gated completion styles", async () => {
    const aggressiveDb = new FakeDb();
    aggressiveDb.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
    aggressiveDb.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [{
      id: "rnd_aggressive",
      topic_id: "top_aggressive",
      domain_id: "dom_1",
      sequence_index: 0,
      status: "active",
      starts_at: "2026-03-24T11:00:00.000Z",
      ends_at: "2026-03-24T12:00:00.000Z",
      reveal_at: "2026-03-24T11:00:00.000Z",
      cadence_preset: "3h",
      config_json: JSON.stringify({ completionStyle: "aggressive", visibility: "open" }),
    }]);
    aggressiveDb.queueAll("FROM contributions c", [
      { id: "a1", being_id: "b1", visibility: "normal", final_score: 80, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
      { id: "a2", being_id: "b2", visibility: "normal", final_score: 70, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
      { id: "a3", being_id: "b3", visibility: "normal", final_score: 65, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
    ]);
    aggressiveDb.queueAll("FROM rounds r\n      INNER JOIN round_configs", [
      {
        id: "rnd_aggressive",
        topic_id: "top_aggressive",
        sequence_index: 0,
        status: "completed",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:10:00.000Z",
        reveal_at: "2026-03-24T11:10:00.000Z",
        config_json: JSON.stringify({ visibility: "open" }),
      },
      {
        id: "rnd_aggressive_next",
        topic_id: "top_aggressive",
        sequence_index: 1,
        status: "pending",
        starts_at: "2026-03-24T12:00:00.000Z",
        ends_at: "2026-03-24T13:00:00.000Z",
        reveal_at: "2026-03-24T12:00:00.000Z",
        config_json: JSON.stringify({ visibility: "open" }),
      },
    ]);
    aggressiveDb.queueAll("SELECT id FROM topics WHERE status = 'started'", []);

    const aggressive = await sweepTopicLifecycle(
      {
        DB: aggressiveDb as never,
        PUBLIC_CACHE: { get: async () => "0", put: async () => undefined } as never,
      } as never,
      { cron: "*/5 * * * *", now: new Date("2026-03-24T11:10:00.000Z") },
    );
    assert.deepEqual(aggressive.mutatedTopicIds, ["top_aggressive"]);

    const patientDb = new FakeDb();
    patientDb.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
    patientDb.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [{
      id: "rnd_patient",
      topic_id: "top_patient",
      domain_id: "dom_1",
      sequence_index: 0,
      status: "active",
      starts_at: "2026-03-24T11:00:00.000Z",
      ends_at: "2026-03-24T12:00:00.000Z",
      reveal_at: "2026-03-24T11:00:00.000Z",
      cadence_preset: "3h",
      config_json: JSON.stringify({ completionStyle: "patient", visibility: "open" }),
    }]);
    patientDb.queueAll("FROM contributions c", [
      { id: "p1", being_id: "b1", visibility: "normal", final_score: 80, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
      { id: "p2", being_id: "b2", visibility: "normal", final_score: 70, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
    ]);
    patientDb.queueFirst("SELECT COUNT(*) AS count FROM topic_members", [{ count: 2 }]);
    patientDb.queueAll("FROM rounds r\n      INNER JOIN round_configs", [
      {
        id: "rnd_patient",
        topic_id: "top_patient",
        sequence_index: 0,
        status: "completed",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:10:00.000Z",
        reveal_at: "2026-03-24T11:10:00.000Z",
        config_json: JSON.stringify({ visibility: "open" }),
      },
      {
        id: "rnd_patient_next",
        topic_id: "top_patient",
        sequence_index: 1,
        status: "pending",
        starts_at: "2026-03-24T12:00:00.000Z",
        ends_at: "2026-03-24T13:00:00.000Z",
        reveal_at: "2026-03-24T12:00:00.000Z",
        config_json: JSON.stringify({ visibility: "open" }),
      },
    ]);
    patientDb.queueAll("SELECT id FROM topics WHERE status = 'started'", []);

    const patient = await sweepTopicLifecycle(
      {
        DB: patientDb as never,
        PUBLIC_CACHE: { get: async () => "0", put: async () => undefined } as never,
      } as never,
      { cron: "*/5 * * * *", now: new Date("2026-03-24T11:10:00.000Z") },
    );
    assert.deepEqual(patient.mutatedTopicIds, ["top_patient"]);

    const qualityDb = new FakeDb();
    qualityDb.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
    qualityDb.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", [{
      id: "rnd_quality",
      topic_id: "top_quality",
      domain_id: "dom_1",
      sequence_index: 1,
      status: "active",
      starts_at: "2026-03-24T11:00:00.000Z",
      ends_at: "2026-03-24T12:30:00.000Z",
      reveal_at: "2026-03-24T11:00:00.000Z",
      cadence_preset: null,
      config_json: JSON.stringify({
        completionStyle: "quality_gated",
        visibility: "open",
        roundDurationMinutes: 30,
      }),
    }]);
    qualityDb.queueAll("FROM contributions c", [
      { id: "q1", being_id: "b1", visibility: "normal", final_score: 85, round_visibility: "open", reveal_at: "2026-03-24T11:00:00.000Z" },
    ]);
    qualityDb.queueFirst("SELECT COUNT(*) AS count FROM topic_members", [{ count: 3 }]);
    qualityDb.queueAll("WHERE c.topic_id = ? AND r.sequence_index < ?", [
      { final_score: 50, visibility: "normal", round_visibility: "open", reveal_at: "2026-03-24T10:00:00.000Z" },
      { final_score: 70, visibility: "normal", round_visibility: "open", reveal_at: "2026-03-24T10:00:00.000Z" },
      { final_score: 90, visibility: "normal", round_visibility: "open", reveal_at: "2026-03-24T10:00:00.000Z" },
    ]);
    qualityDb.queueAll("FROM rounds r\n      INNER JOIN round_configs", [
      {
        id: "rnd_quality",
        topic_id: "top_quality",
        sequence_index: 1,
        status: "completed",
        starts_at: "2026-03-24T11:00:00.000Z",
        ends_at: "2026-03-24T11:35:00.000Z",
        reveal_at: "2026-03-24T11:35:00.000Z",
        config_json: JSON.stringify({ visibility: "open" }),
      },
      {
        id: "rnd_quality_next",
        topic_id: "top_quality",
        sequence_index: 2,
        status: "pending",
        starts_at: "2026-03-24T12:30:00.000Z",
        ends_at: "2026-03-24T13:30:00.000Z",
        reveal_at: "2026-03-24T12:30:00.000Z",
        config_json: JSON.stringify({ visibility: "sealed" }),
      },
    ]);
    qualityDb.queueAll("SELECT id FROM topics WHERE status = 'started'", []);

    const quality = await sweepTopicLifecycle(
      {
        DB: qualityDb as never,
        PUBLIC_CACHE: { get: async () => "0", put: async () => undefined } as never,
      } as never,
      { cron: "*/5 * * * *", now: new Date("2026-03-24T11:35:00.000Z") },
    );
    assert.deepEqual(quality.mutatedTopicIds, ["top_quality"]);
  });
});
