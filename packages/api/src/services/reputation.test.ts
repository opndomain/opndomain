import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decayStaleReputations,
  getDomainReputationFactor,
  getEpistemicReputationAdjustment,
  rebuildDomainReputation,
  rebuildEpistemicReliability,
  updateDomainReputation,
} from "./reputation.js";

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
  batchCalls: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  throwOnBatch = false;
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
    this.batchCalls.push(statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    if (this.throwOnBatch) {
      throw new Error("simulated batch failure");
    }
    this.runs.push(...statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    return statements.map(() => ({ success: true }));
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

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

describe("reputation service", () => {
  it("applies Welford updates and exposes reputation only after enough samples", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM domain_reputation", [null]);
    const first = await updateDomainReputation({ DB: db as never } as never, "dom_1", "bng_1", 80, new Date("2026-03-25T00:00:00.000Z"));
    assert.equal(first.sample_count, 1);
    assert.equal(first.average_score, 80);

    db.queueFirst("FROM domain_reputation", [first]);
    const second = await updateDomainReputation({ DB: db as never } as never, "dom_1", "bng_1", 60, new Date("2026-03-26T00:00:00.000Z"));
    assert.equal(second.sample_count, 2);
    assert.equal(second.average_score, 70);
    assert.ok(second.m2 > 0);
    assert.ok(second.consistency_score < 100);
    assert.equal(db.batchCalls.length, 2);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO domain_reputation_history")));

    db.queueFirst("FROM domain_reputation", [{ ...second, sample_count: 1 }]);
    const gated = await getDomainReputationFactor({ DB: db as never } as never, "dom_1", "bng_1");
    assert.equal(gated, 0);

    db.queueFirst("FROM domain_reputation", [second]);
    const exposed = await getDomainReputationFactor({ DB: db as never } as never, "dom_1", "bng_1");
    assert.ok(exposed > 0);
    assert.ok(exposed <= 1);
  });

  it("does not partially mutate reputation when the history append batch fails", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM domain_reputation", [null, null]);
    db.throwOnBatch = true;

    await assert.rejects(
      updateDomainReputation({ DB: db as never } as never, "dom_1", "bng_1", 80, new Date("2026-03-25T00:00:00.000Z")),
      /simulated batch failure/,
    );

    assert.equal(db.runs.length, 0);
    assert.equal(db.batchCalls.length, 1);
    assert.equal(db.batchCalls[0]?.length, 2);

    db.throwOnBatch = false;
    const retried = await updateDomainReputation(
      { DB: db as never } as never,
      "dom_1",
      "bng_1",
      80,
      new Date("2026-03-25T00:00:00.000Z"),
    );

    assert.equal(retried.sample_count, 1);
    assert.equal(retried.average_score, 80);
    assert.equal(db.batchCalls.length, 2);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO domain_reputation_history")));
  });

  it("decays stale reputations from the blended base and respects the floor", async () => {
    const db = new FakeDb();
    db.queueAll("FROM domain_reputation", [{
      id: "drp_1",
      average_score: 90,
      sample_count: 3,
      m2: 20,
      consistency_score: 80,
      decayed_score: 85,
      last_active_at: "2026-03-01T00:00:00.000Z",
    }]);

    const updated = await decayStaleReputations({ DB: db as never } as never, new Date("2026-03-25T00:00:00.000Z"));
    assert.equal(updated, 1);
    assert.ok(db.runs.some((run) => run.sql.includes("UPDATE domain_reputation SET decayed_score = ?")));
    const bind = db.runs[0]?.bindings[0] as number;
    assert.ok(bind >= 30);
    assert.ok(bind < 87);
  });

  it("rebuilds reputation from closed-topic final scores without double-counting prior aggregates", async () => {
    const db = new FakeDb();
    db.queueAll("FROM contributions c", [
      { final_score: 80, closed_at: "2026-03-20T00:00:00.000Z" },
      { final_score: 60, closed_at: "2026-03-21T00:00:00.000Z" },
    ]);
    db.queueFirst("FROM domain_reputation", [
      {
        id: "drp_1",
        average_score: 95,
        sample_count: 5,
        m2: 123,
        consistency_score: 70,
        decayed_score: 87.5,
        last_active_at: "2026-03-19T00:00:00.000Z",
      },
    ]);
    db.queueAll("SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at\n      FROM domain_reputation", []);

    const rebuilt = await rebuildDomainReputation(
      { DB: db as never } as never,
      "dom_1",
      "bng_1",
      new Date("2026-03-26T00:00:00.000Z"),
    );

    assert.equal(rebuilt.id, "drp_1");
    assert.equal(rebuilt.sample_count, 2);
    assert.equal(rebuilt.average_score, 70);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO domain_reputation")));
  });

  it("does not decay reputation during the grace window", async () => {
    const db = new FakeDb();
    db.queueAll("FROM domain_reputation", [{
      id: "drp_1",
      average_score: 90,
      sample_count: 3,
      m2: 20,
      consistency_score: 80,
      decayed_score: 85,
      last_active_at: "2026-03-20T00:00:00.000Z",
    }]);

    const updated = await decayStaleReputations({ DB: db as never } as never, new Date("2026-03-26T00:00:00.000Z"));

    assert.equal(updated, 0);
    assert.equal(db.runs.length, 0);
  });

  it("rebuilds epistemic reliability from persisted claim outcomes", async () => {
    const db = new FakeDb();
    db.queueAll("FROM claim_resolutions cr", [
      { status: "supported" },
      { status: "supported" },
      { status: "contested" },
      { status: "refuted" },
    ]);
    db.queueFirst("FROM claim_resolution_evidence cre", [{ count: 1 }]);
    db.queueFirst("FROM epistemic_reliability", [null]);

    const rebuilt = await rebuildEpistemicReliability(
      { DB: db as never } as never,
      "dom_1",
      "bng_1",
      new Date("2026-03-28T00:00:00.000Z"),
    );

    assert.equal(rebuilt.supported_claim_count, 2);
    assert.equal(rebuilt.contested_claim_count, 1);
    assert.equal(rebuilt.refuted_claim_count, 1);
    assert.equal(rebuilt.correction_count, 1);
    assert.ok(rebuilt.reliability_score < 60);
    assert.ok(rebuilt.confidence_score > 0);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO epistemic_reliability")));
  });

  it("returns a bounded epistemic adjustment only after enough signal", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM epistemic_reliability", [{
      id: "erl_1",
      reliability_score: 82,
      confidence_score: 90,
      supported_claim_count: 4,
      contested_claim_count: 1,
      refuted_claim_count: 0,
      correction_count: 0,
      last_evaluated_at: "2026-03-28T00:00:00.000Z",
    }]);

    const adjustment = await getEpistemicReputationAdjustment({ DB: db as never } as never, "dom_1", "bng_1");
    assert.ok(adjustment > 0);
    assert.ok(adjustment <= 0.12);

    db.queueFirst("FROM epistemic_reliability", [{
      id: "erl_2",
      reliability_score: 95,
      confidence_score: 100,
      supported_claim_count: 1,
      contested_claim_count: 0,
      refuted_claim_count: 0,
      correction_count: 0,
      last_evaluated_at: "2026-03-28T00:00:00.000Z",
    }]);

    const gated = await getEpistemicReputationAdjustment({ DB: db as never } as never, "dom_1", "bng_2");
    assert.equal(gated, 0);
  });
});
