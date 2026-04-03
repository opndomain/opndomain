import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSlotLabel,
  computeInstanceFingerprint,
  computeEpistemicAdjustment,
  PROVENANCE_ROLE_WEIGHTS,
  CREDIT_WEIGHT_CAP_PER_SLOT,
  EPISTEMIC_ADJUSTMENT_CLAMP,
  FINALIZATION_PHASE_SEQUENCE,
  AutonomousConfigSchema,
} from "@opndomain/shared";

// ---------------------------------------------------------------------------
// Shared utility tests (pure functions from canonical-slots.ts)
// ---------------------------------------------------------------------------

describe("normalizeSlotLabel", () => {
  it("lowercases and strips punctuation", () => {
    assert.equal(normalizeSlotLabel("Climate Change IS Real!"), "climate change is real");
  });

  it("collapses whitespace", () => {
    assert.equal(normalizeSlotLabel("  too   many   spaces  "), "too many spaces");
  });

  it("produces identical output for equivalent labels", () => {
    const a = normalizeSlotLabel("AI Safety Concerns");
    const b = normalizeSlotLabel("ai safety concerns");
    assert.equal(a, b);
  });
});

describe("computeInstanceFingerprint", () => {
  it("produces deterministic fingerprint for sorted IDs", async () => {
    const fp1 = await computeInstanceFingerprint(["inst_a", "inst_b"]);
    const fp2 = await computeInstanceFingerprint(["inst_b", "inst_a"]);
    assert.equal(fp1, fp2);
  });

  it("produces different fingerprints for different ID sets", async () => {
    const fp1 = await computeInstanceFingerprint(["inst_a", "inst_b"]);
    const fp2 = await computeInstanceFingerprint(["inst_a", "inst_c"]);
    assert.notEqual(fp1, fp2);
  });

  it("produces consistent hex output", async () => {
    const fp = await computeInstanceFingerprint(["inst_x"]);
    assert.match(fp, /^[0-9a-f]{64}$/);
  });
});

describe("computeEpistemicAdjustment", () => {
  it("returns 0 for empty slot credits", () => {
    assert.equal(computeEpistemicAdjustment([]), 0);
  });

  it("computes weighted adjustment from accurate and interesting votes", () => {
    const adjustment = computeEpistemicAdjustment([
      { creditWeight: 1.0, accurateNet: 3, interestingNet: 2, hallucinatedNet: 0 },
    ]);
    // 1.0 * (3*0.7 + 2*0.3 - 0*1.0) = 2.1 + 0.6 = 2.7
    assert.equal(Number(adjustment.toFixed(1)), 2.7);
  });

  it("applies hallucination penalty", () => {
    const adjustment = computeEpistemicAdjustment([
      { creditWeight: 1.0, accurateNet: 0, interestingNet: 0, hallucinatedNet: 3 },
    ]);
    // 1.0 * (0 + 0 - 3*1.0) = -3
    assert.equal(adjustment, -3);
  });

  it("clamps to +/-5", () => {
    const positive = computeEpistemicAdjustment([
      { creditWeight: 1.0, accurateNet: 100, interestingNet: 0, hallucinatedNet: 0 },
    ]);
    assert.equal(positive, EPISTEMIC_ADJUSTMENT_CLAMP);

    const negative = computeEpistemicAdjustment([
      { creditWeight: 1.0, accurateNet: 0, interestingNet: 0, hallucinatedNet: 100 },
    ]);
    assert.equal(negative, -EPISTEMIC_ADJUSTMENT_CLAMP);
  });

  it("respects credit weight cap across multiple slots", () => {
    const adjustment = computeEpistemicAdjustment([
      { creditWeight: 0.5, accurateNet: 2, interestingNet: 0, hallucinatedNet: 0 },
      { creditWeight: 0.5, accurateNet: 2, interestingNet: 0, hallucinatedNet: 0 },
    ]);
    // 0.5*(2*0.7) + 0.5*(2*0.7) = 0.7 + 0.7 = 1.4
    assert.equal(Number(adjustment.toFixed(1)), 1.4);
  });
});

describe("PROVENANCE_ROLE_WEIGHTS", () => {
  it("author has weight 1.0", () => {
    assert.equal(PROVENANCE_ROLE_WEIGHTS.author, 1.0);
  });

  it("objection has weight 0.0", () => {
    assert.equal(PROVENANCE_ROLE_WEIGHTS.objection, 0.0);
  });

  it("support < refinement < carry_forward < author", () => {
    assert.ok(PROVENANCE_ROLE_WEIGHTS.support < PROVENANCE_ROLE_WEIGHTS.carry_forward);
    assert.ok(PROVENANCE_ROLE_WEIGHTS.carry_forward < PROVENANCE_ROLE_WEIGHTS.refinement);
    assert.ok(PROVENANCE_ROLE_WEIGHTS.refinement < PROVENANCE_ROLE_WEIGHTS.author);
  });
});

describe("FINALIZATION_PHASE_SEQUENCE", () => {
  it("has 7 phases in correct order", () => {
    assert.equal(FINALIZATION_PHASE_SEQUENCE.length, 7);
    assert.deepEqual(FINALIZATION_PHASE_SEQUENCE, [
      "flush_complete",
      "scores_recomputed",
      "reputation_provisional",
      "verdict_written",
      "epistemic_applied",
      "dossier_assembled",
      "merge_ready",
    ]);
  });
});

describe("AutonomousConfigSchema", () => {
  it("applies plan-aligned defaults", () => {
    const config = AutonomousConfigSchema.parse({});
    assert.equal(config.minParticipantsPerInstance, 5);
    assert.equal(config.maxParticipantsPerInstance, 40);
    assert.equal(config.maxConcurrentInstances, 1);
    assert.equal(config.podSize, 8);
    assert.equal(config.roundDurationSeconds, 300);
  });

  it("allows overrides", () => {
    const config = AutonomousConfigSchema.parse({
      minParticipantsPerInstance: 10,
      podSize: 15,
    });
    assert.equal(config.minParticipantsPerInstance, 10);
    assert.equal(config.podSize, 15);
    assert.equal(config.roundDurationSeconds, 300); // default preserved
  });
});

describe("CREDIT_WEIGHT_CAP_PER_SLOT", () => {
  it("caps at 1.0", () => {
    assert.equal(CREDIT_WEIGHT_CAP_PER_SLOT, 1.0);
  });
});
