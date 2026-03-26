import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MATCHMAKING_SWEEP_CRON } from "@opndomain/shared";
import worker from "./index.js";

class FakeBucket {
  constructor(private readonly log: string[]) {}

  async put(key: string, _body: string) {
    this.log.push(`bucket.put:${key}`);
  }

  async delete(key: string) {
    this.log.push(`bucket.delete:${key}`);
  }
}

class FakeCache {
  values = new Map<string, string>();

  constructor(private readonly log: string[]) {}

  async get(key: string) {
    this.log.push(`cache.get:${key}`);
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.log.push(`cache.put:${key}`);
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.log.push(`cache.delete:${key}`);
    this.values.delete(key);
  }

  async list({ prefix }: { prefix: string }) {
    this.log.push(`cache.list:${prefix}`);
    return {
      keys: Array.from(this.values.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

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
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  constructor(private readonly log: string[]) {}

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(_statements: FakePreparedStatement[]) {
    this.log.push("db.batch");
    return [];
  }

  consumeFirst<T>(sql: string): T | null {
    this.log.push(`db.first:${sql.slice(0, 48)}`);
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
    this.log.push(`db.all:${sql.slice(0, 48)}`);
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

function queueSnapshotAndPresentationReads(db: FakeDb) {
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
      current_round_index: 0,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      status: "closed",
      current_round_index: 0,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
  db.queueAll("FROM rounds r\n      LEFT JOIN round_configs", [{
    id: "rnd_1",
    sequence_index: 0,
    round_kind: "propose",
    status: "completed",
    starts_at: "2026-03-25T00:00:00.000Z",
    ends_at: "2026-03-25T01:00:00.000Z",
    reveal_at: "2026-03-25T00:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueAll("INNER JOIN beings b ON b.id = c.being_id", [{
    id: "cnt_1",
    round_id: "rnd_1",
    being_id: "bng_1",
    being_handle: "alpha",
    body_clean: "Body",
    visibility: "normal",
    submitted_at: "2026-03-25T00:10:00.000Z",
    heuristic_score: 70,
    live_score: 70,
    final_score: 75,
    reveal_at: "2026-03-25T00:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueFirst("SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?", [
    {
      confidence: "moderate",
      terminalization_mode: "degraded_template",
      summary: "summary",
      reasoning_json: JSON.stringify({
        topContributionsPerRound: [
          {
            roundKind: "propose",
            contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 75, excerpt: "Body" }],
          },
        ],
        completedRounds: 1,
        totalRounds: 1,
      }),
    },
  ]);
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", [{ count: 1 }, { count: 1 }]);
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", [{ count: 1 }, { count: 1 }]);
  db.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
  db.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", []);
  db.queueAll("SELECT id FROM topics WHERE status = 'started'", []);
}

describe("scheduled worker", () => {
  it("drains snapshot and presentation retry queues before the lifecycle sweep", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);
    const snapshots = new FakeBucket(log);
    const artifacts = new FakeBucket(log);
    cache.values.set("snapshot-pending:top_1", JSON.stringify({ topicId: "top_1" }));
    cache.values.set("presentation-pending:top_1", JSON.stringify({ topicId: "top_1" }));
    queueSnapshotAndPresentationReads(db);

    const waits: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: MATCHMAKING_SWEEP_CRON, scheduledTime: new Date("2026-03-26T12:00:00.000Z").getTime() } as ScheduledController,
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise);
        },
      } as ExecutionContext,
    );
    await Promise.all(waits);

    const snapshotDeleteIndex = log.indexOf("cache.delete:snapshot-pending:top_1");
    const presentationDeleteIndex = log.indexOf("cache.delete:presentation-pending:top_1");
    const lifecycleIndex = log.findIndex((entry) => entry.startsWith("db.all:\n      SELECT id, status, cadence_family"));

    assert.ok(snapshotDeleteIndex >= 0);
    assert.ok(presentationDeleteIndex >= 0);
    assert.ok(lifecycleIndex >= 0);
    assert.ok(snapshotDeleteIndex < lifecycleIndex);
    assert.ok(presentationDeleteIndex < lifecycleIndex);
  });

  it("purges expired magic links during the maintenance cron", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);
    const waits: Promise<unknown>[] = [];

    await worker.scheduled(
      { cron: "0 2 * * *", scheduledTime: new Date("2026-03-26T02:00:00.000Z").getTime() } as ScheduledController,
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: new FakeBucket(log) as never,
        PUBLIC_ARTIFACTS: new FakeBucket(log) as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise);
        },
      } as ExecutionContext,
    );
    await Promise.all(waits);

    assert.ok(db.runs.some((entry) => entry.sql.includes("DELETE FROM magic_links")));
    assert.equal(cache.values.get("cron/phase5-maintenance-stub"), "2026-03-26T02:00:00.000Z");
  });
});
