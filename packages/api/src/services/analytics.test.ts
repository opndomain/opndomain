import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backfillPlatformDailyRollups, rollupPlatformDailyCounts } from "./analytics.js";

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
    return { success: true };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
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

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

function queueDailyRollupCounts(db: FakeDb, counts: {
  topicsCreated: number;
  contributionsCreated: number;
  verdictsCreated: number;
  activeTopics: number;
  activeBeings: number;
  activeAgents: number;
}) {
  db.queueFirst("SELECT COUNT(*) AS count FROM topics WHERE substr(created_at, 1, 10) = ?", [{ count: counts.topicsCreated }]);
  db.queueFirst("SELECT COUNT(*) AS count FROM contributions WHERE substr(created_at, 1, 10) = ?", [{ count: counts.contributionsCreated }]);
  db.queueFirst("SELECT COUNT(*) AS count FROM verdicts WHERE substr(created_at, 1, 10) = ?", [{ count: counts.verdictsCreated }]);
  db.queueFirst("FROM topics\n        WHERE created_at < ?", [{ count: counts.activeTopics }]);
  db.queueFirst("COUNT(DISTINCT tm.being_id) AS count", [{ count: counts.activeBeings }]);
  db.queueFirst("COUNT(DISTINCT a.id) AS count", [{ count: counts.activeAgents }]);
}

describe("analytics service", () => {
  it("writes a platform daily rollup for the scheduled day", async () => {
    const db = new FakeDb();
    queueDailyRollupCounts(db, {
      topicsCreated: 2,
      contributionsCreated: 9,
      verdictsCreated: 1,
      activeTopics: 4,
      activeBeings: 7,
      activeAgents: 3,
    });

    const rowsWritten = await rollupPlatformDailyCounts(
      { DB: db as never } as never,
      new Date("2026-03-29T12:00:00.000Z"),
    );

    assert.equal(rowsWritten, 1);
    const insert = db.runs.find((run) => run.sql.includes("INSERT INTO platform_daily_rollups"));
    assert.ok(insert);
    assert.deepEqual(insert?.bindings.slice(1), [
      "2026-03-29",
      2,
      9,
      1,
      4,
      7,
      3,
    ]);
  });

  it("skips duplicate backfill writes across the same range when overwrite is false", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT id FROM platform_daily_rollups WHERE rollup_date = ?", [
      null,
      null,
      { id: "pdr_1" },
      { id: "pdr_2" },
    ]);
    queueDailyRollupCounts(db, {
      topicsCreated: 1,
      contributionsCreated: 5,
      verdictsCreated: 0,
      activeTopics: 2,
      activeBeings: 3,
      activeAgents: 2,
    });
    queueDailyRollupCounts(db, {
      topicsCreated: 0,
      contributionsCreated: 4,
      verdictsCreated: 1,
      activeTopics: 2,
      activeBeings: 4,
      activeAgents: 2,
    });

    const first = await backfillPlatformDailyRollups(
      { DB: db as never } as never,
      { from: "2026-03-28", to: "2026-03-29" },
      new Date("2026-03-29T12:00:00.000Z"),
    );
    const second = await backfillPlatformDailyRollups(
      { DB: db as never } as never,
      { from: "2026-03-28", to: "2026-03-29" },
      new Date("2026-03-29T12:00:00.000Z"),
    );

    assert.deepEqual(first, {
      from: "2026-03-28",
      to: "2026-03-29",
      daysProcessed: 2,
      rowsWritten: 2,
    });
    assert.deepEqual(second, {
      from: "2026-03-28",
      to: "2026-03-29",
      daysProcessed: 2,
      rowsWritten: 0,
    });
    assert.equal(db.runs.filter((run) => run.sql.includes("INSERT INTO platform_daily_rollups")).length, 2);
  });
});
