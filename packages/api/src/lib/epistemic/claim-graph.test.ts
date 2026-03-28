import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferClaimRelation, updateDomainClaimGraph } from "./claim-graph.js";
import { runEpistemicEngine } from "./engine.js";

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

describe("claim graph", () => {
  it("infers contradiction for high-overlap claims with flipped polarity", () => {
    const relation = inferClaimRelation(
      {
        body: "Battery storage does not reduce grid outages in winter peaks.",
        normalizedBody: "battery storage does not reduce grid outages in winter peaks",
      },
      {
        body: "Battery storage reduces grid outages in winter peaks.",
        normalizedBody: "battery storage reduces grid outages in winter peaks",
      },
    );

    assert.equal(relation?.kind, "contradiction");
    assert.ok((relation?.confidence ?? 0) > 0.7);
  });

  it("persists claims and deterministic graph evidence without prediction tables", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM claims\n      WHERE contribution_id = ? AND ordinal = ?", [null, null]);
    db.queueAll("FROM claims\n      WHERE domain_id = ? AND contribution_id <> ?", [{
      id: "clm_existing",
      body: "Battery storage reduces grid outages in winter peaks.",
      normalized_body: "battery storage reduces grid outages in winter peaks",
      contribution_id: "con_existing",
      being_id: "bng_existing",
      ordinal: 1,
    }]);

    const result = await updateDomainClaimGraph(
      { DB: db as never } as never,
      {
        topicId: "top_1",
        domainId: "dom_1",
        beingId: "bng_1",
        contributionId: "con_1",
        claims: [
          {
            ordinal: 1,
            body: "Battery storage does not reduce grid outages in winter peaks.",
            normalizedBody: "battery storage does not reduce grid outages in winter peaks",
            verifiability: "empirical",
          },
          {
            ordinal: 2,
            body: "Grid operators should still fund resilience pilots.",
            normalizedBody: "grid operators should still fund resilience pilots",
            verifiability: "normative",
          },
        ],
      },
    );

    assert.equal(result.claims.length, 2);
    assert.ok(result.relationCount >= 1);
    assert.ok(result.evidenceCount >= 1);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO claims")));
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO claim_relations")));
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO claim_resolution_evidence")));
    assert.equal(db.runs.some((run) => run.sql.includes("prediction")), false);
  });

  it("returns a neutral prediction stub from the engine", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM claims\n      WHERE contribution_id = ? AND ordinal = ?", [null]);
    db.queueAll("FROM claims\n      WHERE domain_id = ? AND contribution_id <> ?", []);

    const result = await runEpistemicEngine(
      { DB: db as never } as never,
      {
        topicId: "top_1",
        domainId: "dom_1",
        beingId: "bng_1",
        contributionId: "con_1",
        body: "The report measured 42 percent adoption in 2025.",
      },
    );

    assert.equal(result.claims.length, 1);
    assert.deepEqual(result.predictions, []);
    assert.equal(result.predictionMode, "neutral_stub");
  });
});
