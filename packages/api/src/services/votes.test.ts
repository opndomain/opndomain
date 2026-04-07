import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWeightedVotes } from "../lib/scoring/votes.js";
import { recomputeContributionFinalScore, recomputeContributionFinalScores, resolveVotePolicyDefaults, resolveVoteTargets } from "./votes.js";

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
  queries: string[] = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    this.queries.push(sql);
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

describe("vote service", () => {
  it("resolves fallback vote-policy defaults for pre-Phase-4 topics", () => {
    const policy = resolveVotePolicyDefaults("debate", 1, {
      roundKind: "critique",
      sequenceIndex: 1,
      enrollmentType: "open",
      visibility: "sealed",
      completionStyle: "aggressive",
      voteRequired: true,
      voteTargetPolicy: "prior_round",
      fallbackChain: [],
      terminal: false,
      phase2Execution: {
        completionMode: "deadline_only",
        enrollmentMode: "topic_members_only",
        note: "legacy config",
      },
    });

    assert.equal(policy.maxVotesPerActor, 24);
    assert.equal(policy.minVotesPerActor, null);
    assert.equal(policy.voteTargetPolicy, "prior_round");
  });

  it("resolves latest-nonempty-prior targets while excluding the voter", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM rounds", [{ id: "rnd_prior", sequence_index: 1 }]);
    db.queueAll("FROM contributions c", [
      { id: "cnt_a", round_id: "rnd_prior", sequence_index: 1, being_id: "bng_other", visibility: "normal" },
    ]);

    const result = await resolveVoteTargets(
      { DB: db as never } as never,
      "top_1",
      2,
      "bng_1",
      {
        roundKind: "refine",
        sequenceIndex: 2,
        enrollmentType: "open",
        visibility: "sealed",
        completionStyle: "aggressive",
        voteRequired: true,
        voteTargetPolicy: "latest_nonempty_prior",
        fallbackChain: [],
        terminal: false,
        phase2Execution: {
          completionMode: "deadline_only",
          enrollmentMode: "topic_members_only",
          note: "test",
        },
      },
      "research",
    );

    assert.equal(result.targetRoundId, "rnd_prior");
    assert.deepEqual(result.eligibleContributionIds, ["cnt_a"]);
  });

  it("recomputes final scores deterministically from canonical D1 vote state", async () => {
    const db = new FakeDb();
    const contributionRow = {
      contribution_id: "cnt_1",
      initial_score: 70,
      shadow_initial_score: 68,
      scoring_profile: "adversarial",
      round_kind: "critique",
      template_id: "debate",
      topic_id: "top_1",
    };
    db.queueAll("FROM contribution_scores cs", [contributionRow, contributionRow]);
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
      { contribution_id: "cnt_1", direction: -1, weight: 1, voter_being_id: "bng_3" },
      { contribution_id: "cnt_1", direction: 1, weight: 3, voter_being_id: "bng_4" },
    ]);
    db.queueAll("GROUP BY topic_id", [
      { topic_id: "top_1", distinct_voter_count: 3, topic_vote_count: 6 },
      { topic_id: "top_1", distinct_voter_count: 3, topic_vote_count: 6 },
    ]);

    const first = await recomputeContributionFinalScore({ DB: db as never } as never, "cnt_1");
    const second = await recomputeContributionFinalScore({ DB: db as never } as never, "cnt_1");

    assert.deepEqual(first, second);
    assert.ok(db.runs.every((run) => run.sql.includes("UPDATE contribution_scores")));
    assert.ok(db.runs.every((run) => !run.sql.includes("live_score =")));
    assert.ok(db.runs.every((run) => !run.sql.includes("shadow_score =")));
    assert.ok(first?.finalScore !== 70);
  });

  it("batches vote recomputation across contributions in one topic-stat query", async () => {
    const db = new FakeDb();
    db.queueAll("FROM contribution_scores cs", [
      {
        contribution_id: "cnt_1",
        initial_score: 70,
        shadow_initial_score: 68,
        scoring_profile: "adversarial",
        round_kind: "critique",
        template_id: "debate",
        topic_id: "top_1",
      },
      {
        contribution_id: "cnt_2",
        initial_score: 66,
        shadow_initial_score: 64,
        scoring_profile: "adversarial",
        round_kind: "critique",
        template_id: "debate",
        topic_id: "top_1",
      },
    ]);
    db.queueAll("SELECT contribution_id, direction, weight, voter_being_id", [
      { contribution_id: "cnt_1", direction: 1, weight: 2, voter_being_id: "bng_2" },
      { contribution_id: "cnt_1", direction: -1, weight: 1, voter_being_id: "bng_3" },
      { contribution_id: "cnt_2", direction: 1, weight: 2, voter_being_id: "bng_4" },
      { contribution_id: "cnt_2", direction: 1, weight: 1, voter_being_id: "bng_5" },
    ]);
    db.queueAll("GROUP BY topic_id", [{ topic_id: "top_1", distinct_voter_count: 4, topic_vote_count: 8 }]);

    const results = await recomputeContributionFinalScores({ DB: db as never } as never, ["cnt_1", "cnt_2"]);

    assert.equal(results.size, 2);
    assert.equal(db.runs.filter((run) => run.sql.includes("UPDATE contribution_scores")).length, 2);
    assert.equal(db.queries.filter((sql) => sql.includes("GROUP BY topic_id")).length, 1);
    assert.equal(db.queries.filter((sql) => sql.includes("SELECT contribution_id, direction, weight, voter_being_id")).length, 1);
  });

  it("counts distinct per-contribution voters separately from vote row count", () => {
    const aggregate = aggregateWeightedVotes([
      { direction: 1, weight: 2, voterBeingId: "bng_2" },
      { direction: 1, weight: 1, voterBeingId: "bng_2" },
      { direction: -1, weight: 2, voterBeingId: "bng_3" },
      { direction: 1, weight: 0, voterBeingId: "bng_4" },
    ]);

    assert.equal(aggregate.voteCount, 3);
    assert.equal(aggregate.distinctVoterCount, 2);
  });
});
