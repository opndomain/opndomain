import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeRefinementStatus, overlayRefinementContext } from "./vertical-refinement.js";

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
}

class FakeDb {
  throwOnFirstMatch: RegExp | null = null;

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  consumeFirst<T>(sql: string): T | null {
    if (this.throwOnFirstMatch?.test(sql)) {
      throw new Error(`forced first() failure for ${sql}`);
    }
    return null;
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
    .map((write) => JSON.parse(write.body.trim()) as { kind: string; stage: string; topicId: string });
}

describe("vertical refinement", () => {
  it("prefers parsed final argument fields and marks contested outcomes eligible", () => {
    const result = computeRefinementStatus(
      { refinement_depth: 0 },
      "contested_synthesis",
      {
        whatSettled: "Parsed settled point.",
        whatContested: "Parsed contested claim that is definitely longer than fifty characters for eligibility.",
        strongestObjection: "Parsed objection.",
        neutralVerdict: "Parsed neutral verdict.",
      },
      [
        { label: "Majority", contributionIds: [], aggregateScore: 10, stanceCounts: { support: 1, oppose: 0, neutral: 0 }, strength: 80, classification: "majority" },
      ],
      "moderate",
      {
        majorityCase: "Fallback settled point.",
        counterArgument: "Fallback contested point.",
        finalVerdict: "Fallback verdict.",
      },
    );

    assert.equal(result.eligible, true);
    assert.equal(result.reason, "contested");
    assert.equal(result.whatSettled, "Parsed settled point.");
    assert.equal(result.whatContested, "Parsed contested claim that is definitely longer than fifty characters for eligibility.");
    assert.equal(result.strongestObjection, "Parsed objection.");
    assert.equal(result.neutralVerdict, "Parsed neutral verdict.");
  });

  it("falls back to both-sides summary and blocks max-depth topics", () => {
    const result = computeRefinementStatus(
      { refinement_depth: 10 },
      "clear_synthesis",
      null,
      [
        { label: "Runner up", contributionIds: [], aggregateScore: 5, stanceCounts: { support: 0, oppose: 1, neutral: 0 }, strength: 42, classification: "runner_up" },
        { label: "Minority", contributionIds: [], aggregateScore: 3, stanceCounts: { support: 0, oppose: 1, neutral: 0 }, strength: 20, classification: "minority" },
      ],
      "moderate",
      {
        majorityCase: "Fallback settled point.",
        counterArgument: "Fallback contested point.",
        finalVerdict: "Fallback verdict.",
      },
    );

    assert.equal(result.eligible, false);
    assert.equal(result.reason, "max_depth");
    assert.equal(result.whatSettled, "Fallback settled point.");
    assert.equal(result.whatContested, "Fallback contested point.");
    assert.equal(result.neutralVerdict, "Fallback verdict.");
    assert.deepEqual(result.positionSummaries, [
      { label: "Runner up", classification: "runner_up" },
      { label: "Minority", classification: "minority" },
    ]);
  });

  it("returns the base instruction and archives overlay failures", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    db.throwOnFirstMatch = /FROM topic_refinement_context/;
    const baseInstruction = {
      goal: "Base goal",
      guidance: "Base guidance",
      priorRoundContext: "Base context",
      qualityCriteria: ["Criterion"],
      votingGuidance: null,
    };

    const result = await overlayRefinementContext(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
      } as never,
      "top_1",
      0,
      baseInstruction,
    );

    assert.deepEqual(result, baseInstruction);
    const events = refinementFailureEvents(snapshots);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "refinement_failure");
    assert.equal(events[0]?.stage, "overlay_context");
    assert.equal(events[0]?.topicId, "top_1");
  });
});
