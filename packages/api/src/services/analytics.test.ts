import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backfillPlatformDailyRollups,
  getAnalyticsTopic,
  getAnalyticsVoteReliability,
  rollupPlatformDailyCounts,
} from "./analytics.js";

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
  it("builds topic analytics with stacked buckets, drilldown, and average dimensions", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics\n      WHERE id = ?", [{
      id: "top_1",
      domain_id: "dom_1",
      title: "Should storage mandates expand?",
      status: "started",
      current_round_index: 2,
    }]);
    db.queueFirst("FROM contributions\n        WHERE topic_id = ?", [{
      participant_count: 2,
      contribution_count: 4,
    }]);
    db.queueFirst("SELECT COUNT(*) AS count FROM claims WHERE topic_id = ?", [{ count: 3 }]);
    db.queueAll("GROUP BY bucket_index", [
      { bucket_index: 0, round_kind: "propose", count: 1 },
      { bucket_index: 1, round_kind: "critique", count: 2 },
      { bucket_index: 9, round_kind: "synthesize", count: 1 },
    ]);
    db.queueAll("COALESCE(c.body_clean, c.body) AS excerpt", [
      {
        contribution_id: "ctr_1",
        being_id: "bng_1",
        being_handle: "grid-analyst",
        round_id: "rnd_1",
        round_kind: "propose",
        final_score: 8,
        excerpt: "Storage targets stabilize the grid during peak demand.",
        substance_score: 72,
        relevance: 81,
        novelty: 44,
        reframe: 38,
        role_bonus: 10,
      },
      {
        contribution_id: "ctr_2",
        being_id: "bng_2",
        being_handle: "policy-wonk",
        round_id: "rnd_2",
        round_kind: "critique",
        final_score: 14,
        excerpt: "Mandates can overshoot local infrastructure constraints.",
        substance_score: 66,
        relevance: 79,
        novelty: 51,
        reframe: 42,
        role_bonus: 8,
      },
    ]);
    db.queueFirst("COALESCE(AVG(cs.substance_score), 0) AS substance_score", [{
      substance_score: 69,
      relevance: 80,
      novelty: 47.5,
      reframe: 40,
      role_bonus: 9,
    }]);
    db.queueAll("FROM rounds r\n        LEFT JOIN contributions c ON c.round_id = r.id", [{
      round_id: "rnd_1",
      round_index: 0,
      round_kind: "propose",
      participant_count: 2,
      contribution_count: 4,
    }]);

    const payload = await getAnalyticsTopic({ DB: db as never } as never, "top_1");

    assert.equal(payload.scoreDistribution[0]?.roundCounts.propose, 1);
    assert.equal(payload.scoreDistribution[1]?.totalCount, 2);
    assert.equal(payload.scoreDistribution[9]?.roundCounts.synthesize, 1);
    assert.equal(payload.bucketDetails[0]?.contributions[0]?.contributionId, "ctr_1");
    assert.equal(payload.averageDimensionBreakdown.roleBonus, 9);
    assert.equal(payload.summary.claimDensity, 0.75);
  });

  it("builds vote reliability analytics with threshold filtering", async () => {
    const db = new FakeDb();
    db.queueAll("FROM vote_reliability vr", [
      {
        being_id: "bng_1",
        handle: "grid-analyst",
        display_name: "Grid Analyst",
        trust_tier: "verified",
        reliability: 7.6,
        votes_count: 9,
      },
      {
        being_id: "bng_2",
        handle: "market-maker",
        display_name: "Market Maker",
        trust_tier: "supervised",
        reliability: 6.2,
        votes_count: 5,
      },
    ]);

    const payload = await getAnalyticsVoteReliability({ DB: db as never } as never, { minVotes: 5 });

    assert.equal(payload.minVotes, 5);
    assert.equal(payload.histogram[7]?.trustTierCounts.verified, 1);
    assert.equal(payload.histogram[6]?.trustTierCounts.supervised, 1);
    assert.equal(payload.scatter[0]?.reliability, 76);
    assert.equal(payload.summary.qualifyingBeings, 2);
    assert.equal(payload.summary.maxVotesCount, 9);
  });

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
