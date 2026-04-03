import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCanonicalSlot,
  createSlotsFromOutput,
  findAliasTarget,
  setSlotAlias,
  performMergeAliasing,
  unaliasSlot,
  getTopicSlots,
  getBallotSlots,
  type CanonicalSlotRow,
} from "./canonical-slots.js";
import {
  recordProvenance,
  computeSlotCreditWeights,
  computeInstanceEpistemicAdjustments,
} from "./claim-provenance.js";
import { selectPodReducers } from "./reducer-selection.js";
import {
  finalizeInstance,
  isPhaseCompleted,
  getFinalizationProgress,
} from "./instance-finalization.js";
import { executeMerge, getLatestMergeRevision } from "./merge-engine.js";

// ---------------------------------------------------------------------------
// Fake DB infrastructure
// ---------------------------------------------------------------------------

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
    if (this.db.runError) throw this.db.runError;
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  batchCalls = 0;
  runError: Error | null = null;
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(fragment: string, rows: unknown[]) {
    const existing = this.firstQueue.get(fragment) ?? [];
    this.firstQueue.set(fragment, [...existing, ...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(statements: FakePreparedStatement[]) {
    this.batchCalls++;
    for (const stmt of statements) {
      this.runs.push({ sql: stmt.sql, bindings: stmt.bindings });
    }
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    if (!entry) return null;
    const [, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(entry[0], rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

function makeEnv(db: FakeDb) {
  return { DB: db as unknown as D1Database } as any;
}

const SLOT_ROW: CanonicalSlotRow = {
  id: "slot_1",
  topic_id: "top_1",
  slot_kind: "position",
  slot_label: "Climate change is anthropogenic",
  introduced_by_instance_id: "inst_1",
  introduced_at_phase: "synthesize",
  alias_of_slot_id: null,
  ballot_eligible: 1,
  frozen_at: null,
  created_at: "2026-04-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// canonical-slots behavioral tests
// ---------------------------------------------------------------------------

describe("canonical-slots service", () => {
  it("createCanonicalSlot returns existing slot if one already exists", async () => {
    const db = new FakeDb();
    // First query finds existing
    db.queueFirst("introduced_by_instance_id = ? AND slot_kind = ? AND slot_label", [SLOT_ROW]);
    const result = await createCanonicalSlot(makeEnv(db), {
      topicId: "top_1",
      slotKind: "position",
      slotLabel: "Climate change is anthropogenic",
      instanceId: "inst_1",
      phase: "synthesize",
    });
    assert.equal(result.id, "slot_1");
    assert.equal(db.runs.length, 0); // no insert happened
  });

  it("createCanonicalSlot inserts and returns new slot when none exists", async () => {
    const db = new FakeDb();
    // Both queries use the same SQL fragment, so queue both results in order
    // First call returns null (not found), second call returns the new row
    db.queueFirst("introduced_by_instance_id = ? AND slot_kind = ? AND slot_label", [null, SLOT_ROW]);
    const result = await createCanonicalSlot(makeEnv(db), {
      topicId: "top_1",
      slotKind: "position",
      slotLabel: "Climate change is anthropogenic",
      instanceId: "inst_1",
      phase: "synthesize",
    });
    assert.equal(result.id, "slot_1");
    assert.ok(db.runs.some((r) => r.sql.includes("INSERT OR IGNORE INTO canonical_slots")));
  });

  it("createSlotsFromOutput skips short labels", async () => {
    const db = new FakeDb();
    db.queueFirst("COUNT(*) as cnt", [{ cnt: 0 }]);
    const result = await createSlotsFromOutput(
      makeEnv(db),
      "top_1",
      "inst_1",
      "synthesize",
      [{ slotKind: "position", slotLabel: "short" }], // length < 8
    );
    assert.equal(result.length, 0);
  });

  it("findAliasTarget matches by normalized label", async () => {
    const db = new FakeDb();
    const targetSlot = { ...SLOT_ROW, id: "slot_canonical" };
    db.queueAll("FROM canonical_slots", [targetSlot]);
    const result = await findAliasTarget(
      makeEnv(db),
      "top_1",
      "position",
      "CLIMATE CHANGE IS ANTHROPOGENIC!",
      "slot_other",
    );
    assert.ok(result);
    assert.equal(result!.id, "slot_canonical");
  });

  it("findAliasTarget returns null when no match", async () => {
    const db = new FakeDb();
    db.queueAll("FROM canonical_slots", [SLOT_ROW]);
    const result = await findAliasTarget(
      makeEnv(db),
      "top_1",
      "position",
      "Totally different label that cannot match",
      "slot_other",
    );
    assert.equal(result, null);
  });

  it("setSlotAlias resolves alias depth to 1", async () => {
    const db = new FakeDb();
    // Target is itself an alias
    db.queueFirst("FROM canonical_slots WHERE id", [{
      ...SLOT_ROW,
      id: "slot_intermediate",
      alias_of_slot_id: "slot_root",
    }]);
    await setSlotAlias(makeEnv(db), "slot_new", "slot_intermediate");
    const aliasUpdate = db.runs.find((r) => r.sql.includes("UPDATE canonical_slots SET alias_of_slot_id"));
    assert.ok(aliasUpdate);
    // Should point to slot_root, not slot_intermediate
    assert.equal(aliasUpdate!.bindings[0], "slot_root");
  });

  it("unaliasSlot removes alias and returns true", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM canonical_slots WHERE id", [{
      ...SLOT_ROW,
      id: "slot_aliased",
      alias_of_slot_id: "slot_canonical",
    }]);
    const result = await unaliasSlot(makeEnv(db), "slot_aliased");
    assert.equal(result, true);
    const update = db.runs.find((r) => r.sql.includes("SET alias_of_slot_id = NULL"));
    assert.ok(update);
  });

  it("unaliasSlot returns false for non-aliased slot", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM canonical_slots WHERE id", [SLOT_ROW]); // alias_of_slot_id is null
    const result = await unaliasSlot(makeEnv(db), "slot_1");
    assert.equal(result, false);
  });

  it("performMergeAliasing aliases matching slots to existing canonical slots", async () => {
    const db = new FakeDb();
    // Instance slots (unaliased)
    const instanceSlot = { ...SLOT_ROW, id: "slot_inst2", introduced_by_instance_id: "inst_2" };
    db.queueAll("introduced_by_instance_id", [instanceSlot]);
    // Existing canonical slots for alias matching
    const canonicalSlot = { ...SLOT_ROW, id: "slot_canonical" };
    db.queueAll("alias_of_slot_id IS NULL", [canonicalSlot]);
    // For setSlotAlias lookup
    db.queueFirst("FROM canonical_slots WHERE id", [canonicalSlot]);

    const result = await performMergeAliasing(makeEnv(db), "top_1", "inst_2");
    assert.equal(result.aliasedCount, 1);
  });

  it("getBallotSlots respects display cap", async () => {
    const db = new FakeDb();
    db.queueAll("ballot_eligible = 1", [SLOT_ROW]);
    const result = await getBallotSlots(makeEnv(db), "top_1", 5);
    assert.equal(result.length, 1);
  });
});

// ---------------------------------------------------------------------------
// claim-provenance behavioral tests
// ---------------------------------------------------------------------------

describe("claim-provenance service", () => {
  it("recordProvenance is idempotent — returns existing on duplicate", async () => {
    const db = new FakeDb();
    const existingProv = {
      id: "prov_1",
      canonical_slot_id: "slot_1",
      instance_id: "inst_1",
      contribution_id: "cnt_1",
      being_id: "bng_1",
      role: "author",
      round_kind: "propose",
      created_at: "2026-04-01T00:00:00Z",
    };
    db.queueFirst("canonical_slot_id = ? AND instance_id = ? AND contribution_id = ? AND role", [existingProv]);
    const result = await recordProvenance(makeEnv(db), {
      canonicalSlotId: "slot_1",
      instanceId: "inst_1",
      contributionId: "cnt_1",
      beingId: "bng_1",
      role: "author",
      roundKind: "propose",
    });
    assert.equal(result.id, "prov_1");
    assert.equal(db.runs.length, 0);
  });

  it("recordProvenance inserts when no existing entry", async () => {
    const db = new FakeDb();
    // Both queries use same fragment, queue null then the result
    db.queueFirst("canonical_slot_id = ? AND instance_id = ? AND contribution_id = ? AND role", [null, {
      id: "prov_new",
      canonical_slot_id: "slot_1",
      instance_id: "inst_1",
      contribution_id: "cnt_1",
      being_id: "bng_1",
      role: "author",
      round_kind: "propose",
      created_at: "2026-04-01T00:00:00Z",
    }]);
    const result = await recordProvenance(makeEnv(db), {
      canonicalSlotId: "slot_1",
      instanceId: "inst_1",
      contributionId: "cnt_1",
      beingId: "bng_1",
      role: "author",
      roundKind: "propose",
    });
    assert.equal(result.id, "prov_new");
    assert.ok(db.runs.some((r) => r.sql.includes("INSERT OR IGNORE INTO claim_provenance")));
  });

  it("computeSlotCreditWeights caps per-being weight at 1.0", async () => {
    const db = new FakeDb();
    db.queueAll("FROM claim_provenance", [
      { id: "p1", canonical_slot_id: "slot_1", instance_id: "inst_1", contribution_id: "cnt_1", being_id: "bng_1", role: "author", round_kind: "propose", created_at: "" },
      { id: "p2", canonical_slot_id: "slot_1", instance_id: "inst_1", contribution_id: "cnt_2", being_id: "bng_1", role: "refinement", round_kind: "refine", created_at: "" },
    ]);
    const weights = await computeSlotCreditWeights(makeEnv(db), "slot_1", "inst_1");
    assert.equal(weights.get("bng_1"), 1.0); // author(1.0) + refinement(0.4) = 1.4, capped at 1.0
  });

  it("computeInstanceEpistemicAdjustments resolves through alias topology", async () => {
    const db = new FakeDb();
    // Instance slots
    db.queueAll("introduced_by_instance_id", [
      { id: "slot_local", alias_of_slot_id: "slot_canonical" },
    ]);
    // Instance lookup
    db.queueFirst("FROM topic_instances WHERE id", [{ topic_id: "top_1" }]);
    // All topic slots for alias resolution
    db.queueAll("FROM canonical_slots WHERE topic_id", [
      { id: "slot_local", alias_of_slot_id: "slot_canonical" },
      { id: "slot_canonical", alias_of_slot_id: null },
    ]);
    // Raw claim votes on the local slot ID
    db.queueAll("FROM claim_votes", [
      { canonical_slot_id: "slot_local", axis: "accurate", direction: 1 },
      { canonical_slot_id: "slot_local", axis: "accurate", direction: 1 },
    ]);
    // Provenance for local slot
    db.queueAll("FROM claim_provenance", [
      { id: "p1", canonical_slot_id: "slot_local", instance_id: "inst_1", contribution_id: "cnt_1", being_id: "bng_1", role: "author", round_kind: "propose", created_at: "" },
    ]);

    const adjustments = await computeInstanceEpistemicAdjustments(makeEnv(db), "inst_1");
    // Votes resolved through alias: 2 accurate votes * 0.7 weight * 1.0 credit = 1.4
    assert.ok(adjustments.has("bng_1"));
    assert.equal(Number(adjustments.get("bng_1")!.toFixed(1)), 1.4);
  });
});

// ---------------------------------------------------------------------------
// reducer-selection behavioral tests
// ---------------------------------------------------------------------------

describe("reducer-selection service", () => {
  it("selects participant with highest score and sufficient round coverage", async () => {
    const db = new FakeDb();
    // Pods
    db.queueAll("FROM instance_pods", [{ id: "pod_1", pod_index: 0 }]);
    // Participants in pod
    db.queueAll("FROM instance_participants", [
      { being_id: "bng_1" },
      { being_id: "bng_2" },
    ]);
    // bng_1: participated in 4 rounds, total score 80
    db.queueFirst("COUNT(DISTINCT r.round_kind) as round_count", [{ round_count: 4 }]);
    db.queueFirst("SUM(cs.final_score), 0) as total_score", [{ total_score: 80 }]);
    db.queueFirst("SUM(cs.final_score), 0) as synth_score", [{ synth_score: 20 }]);
    db.queueFirst("MIN(c.submitted_at) as first_at", [{ first_at: "2026-04-01T00:01:00Z" }]);
    // bng_2: participated in 2 rounds — below eligibility threshold
    db.queueFirst("COUNT(DISTINCT r.round_kind) as round_count", [{ round_count: 2 }]);

    const result = await selectPodReducers(makeEnv(db), "inst_1");
    assert.equal(result.get("pod_1"), "bng_1");
    assert.ok(db.runs.some((r) => r.sql.includes("UPDATE instance_pods SET reducer_being_id")));
  });

  it("rejects participants with fewer than 3 pre-verdict rounds", async () => {
    const db = new FakeDb();
    db.queueAll("FROM instance_pods", [{ id: "pod_1", pod_index: 0 }]);
    db.queueAll("FROM instance_participants", [{ being_id: "bng_1" }]);
    db.queueFirst("COUNT(DISTINCT r.round_kind) as round_count", [{ round_count: 2 }]);

    const result = await selectPodReducers(makeEnv(db), "inst_1");
    assert.equal(result.size, 0);
  });
});

// ---------------------------------------------------------------------------
// instance-finalization behavioral tests
// ---------------------------------------------------------------------------

describe("instance-finalization service", () => {
  it("skips completed phases on resume", async () => {
    const db = new FakeDb();
    // Instance lookup
    db.queueFirst("FROM topic_instances WHERE id", [{
      id: "inst_1", topic_id: "top_1", instance_index: 0, status: "running",
      error_class: null, retry_count: 0, max_retries: 3, participant_count: 5,
    }]);
    // Status update to finalizing
    // For each phase, the INSERT OR IGNORE will be called.
    // Simulate: flush_complete already completed
    db.queueFirst("FROM instance_finalization_steps\n     WHERE instance_id", [{
      id: "fin_1", instance_id: "inst_1", phase: "flush_complete",
      status: "completed", error_detail: null, started_at: "", completed_at: "",
    }]);
    // scores_recomputed: also already completed
    db.queueFirst("FROM instance_finalization_steps\n     WHERE instance_id", [{
      id: "fin_2", instance_id: "inst_1", phase: "scores_recomputed",
      status: "completed", error_detail: null, started_at: "", completed_at: "",
    }]);
    // reputation_provisional: needs to run (started status)
    db.queueFirst("FROM instance_finalization_steps\n     WHERE instance_id", [{
      id: "fin_3", instance_id: "inst_1", phase: "reputation_provisional",
      status: "started", error_detail: null, started_at: "", completed_at: null,
    }]);
    // For reputation phase: topic lookup
    db.queueFirst("FROM topics WHERE id", [{ domain_id: "dom_1" }]);
    // No participants
    db.queueAll("FROM instance_participants", []);
    // Then remaining phases succeed with new rows
    for (let i = 0; i < 4; i++) {
      db.queueFirst("FROM instance_finalization_steps\n     WHERE instance_id", [{
        id: `fin_${4 + i}`, instance_id: "inst_1", phase: "placeholder",
        status: "started", error_detail: null, started_at: "", completed_at: null,
      }]);
    }

    const result = await finalizeInstance(makeEnv(db), "inst_1");
    // flush_complete and scores_recomputed were skipped (no re-execution)
    // The function should reach completion for remaining phases
    assert.ok(result.completedPhases.length > 0);
  });

  it("getFinalizationProgress reports correct state", async () => {
    const db = new FakeDb();
    db.queueAll("FROM instance_finalization_steps WHERE instance_id", [
      { id: "f1", instance_id: "inst_1", phase: "flush_complete", status: "completed", error_detail: null, started_at: "", completed_at: "" },
      { id: "f2", instance_id: "inst_1", phase: "scores_recomputed", status: "completed", error_detail: null, started_at: "", completed_at: "" },
      { id: "f3", instance_id: "inst_1", phase: "reputation_provisional", status: "failed", error_detail: "timeout", started_at: "", completed_at: null },
    ]);
    const progress = await getFinalizationProgress(makeEnv(db), "inst_1");
    assert.deepEqual(progress.completedPhases, ["flush_complete", "scores_recomputed"]);
    assert.equal(progress.failedPhase, "reputation_provisional");
    assert.equal(progress.currentPhase, null);
  });

  it("isPhaseCompleted returns true for completed phase", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM instance_finalization_steps", [{ status: "completed" }]);
    const result = await isPhaseCompleted(makeEnv(db), "inst_1", "flush_complete");
    assert.equal(result, true);
  });

  it("isPhaseCompleted returns false for non-completed phase", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM instance_finalization_steps", [{ status: "started" }]);
    const result = await isPhaseCompleted(makeEnv(db), "inst_1", "flush_complete");
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// merge-engine behavioral tests
// ---------------------------------------------------------------------------

describe("merge-engine service", () => {
  it("same-set merge is idempotent — returns existing revision", async () => {
    const db = new FakeDb();
    // Finalized instances
    db.queueAll("JOIN instance_finalization_steps", [
      { id: "inst_1", participant_count: 5 },
    ]);
    // Existing revision with matching fingerprint
    db.queueFirst("FROM topic_merge_revisions\n     WHERE topic_id = ? AND instance_fingerprint", [{
      id: "mrv_1", topic_id: "top_1", revision: 1,
      instance_fingerprint: "abc", instance_ids_json: '["inst_1"]',
      merge_method: "identity", merge_output_json: JSON.stringify({ topicId: "top_1", revision: 1 }),
      created_at: "",
    }]);

    const result = await executeMerge(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result!.revision, 1);
    // No new insert should happen
    assert.equal(db.runs.filter((r) => r.sql.includes("INSERT INTO topic_merge_revisions")).length, 0);
  });

  it("different-set merge creates new revision", async () => {
    const db = new FakeDb();
    // Two finalized instances
    db.queueAll("JOIN instance_finalization_steps", [
      { id: "inst_1", participant_count: 5 },
      { id: "inst_2", participant_count: 3 },
    ]);
    // No existing revision for this fingerprint
    db.queueFirst("FROM topic_merge_revisions\n     WHERE topic_id = ? AND instance_fingerprint", []);
    // Merge aliasing — no instance slots
    db.queueAll("introduced_by_instance_id = ? AND alias_of_slot_id IS NULL", []);
    db.queueAll("introduced_by_instance_id = ? AND alias_of_slot_id IS NULL", []);
    // Verdict packages
    db.queueAll("FROM instance_verdict_packages", [
      { instance_id: "inst_1", verdict_json: '{"topContributions":[]}', confidence: "moderate", terminalization_mode: "full_template", participant_count: 5 },
      { instance_id: "inst_2", verdict_json: '{"topContributions":[]}', confidence: "emerging", terminalization_mode: "degraded_template", participant_count: 3 },
    ]);
    // Slots for vote tally recompute
    db.queueAll("FROM canonical_slots WHERE topic_id", []);
    // Revision assignment — SELECT inside INSERT
    db.queueFirst("FROM topic_merge_revisions WHERE id", [{ revision: 1 }]);

    const result = await executeMerge(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result!.instanceCount, 2);
    assert.equal(result!.totalParticipants, 8);
    assert.ok(db.runs.some((r) => r.sql.includes("INSERT INTO topic_merge_revisions")));
    assert.ok(db.runs.some((r) => r.sql.includes("UPDATE topics SET merge_revision")));
  });

  it("returns null when no finalized instances exist", async () => {
    const db = new FakeDb();
    db.queueAll("JOIN instance_finalization_steps", []);
    const result = await executeMerge(makeEnv(db), "top_1");
    assert.equal(result, null);
  });

  it("getLatestMergeRevision returns most recent revision", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topic_merge_revisions", [{
      id: "mrv_2", topic_id: "top_1", revision: 2,
      instance_fingerprint: "def", instance_ids_json: '["inst_1","inst_2"]',
      merge_method: "participant_weighted", merge_output_json: null,
      created_at: "",
    }]);
    const result = await getLatestMergeRevision(makeEnv(db), "top_1");
    assert.ok(result);
    assert.equal(result!.revision, 2);
  });
});
