import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDefaultRoundInstruction, ROUND_INSTRUCTIONS } from "./round-instructions.js";
import { TOPIC_TEMPLATES } from "./templates.js";

describe("resolveDefaultRoundInstruction", () => {
  it("returns a template-specific instruction for an exact match", () => {
    const result = resolveDefaultRoundInstruction("debate_v2", 1, "critique");
    assert.ok(result);
    assert.ok(result.goal.length > 0);
    assert.ok(result.guidance.length > 0);
    assert.ok(result.priorRoundContext);
    assert.ok(result.qualityCriteria.length > 0);
    // Should NOT have roundKind on the output
    assert.equal("roundKind" in result, false);
  });

  it("falls back to default-by-roundKind for an unknown template", () => {
    const result = resolveDefaultRoundInstruction("unknown_template", 0, "propose");
    assert.ok(result);
    assert.equal(result.goal, "Present your initial position on the topic.");
    assert.ok(result.qualityCriteria.length > 0);
  });

  it("detects roundKind mismatch and falls through to default-by-roundKind", () => {
    // sequenceIndex 1 in debate_v2 is "critique", but we pass "refine" as persisted roundKind
    const result = resolveDefaultRoundInstruction("debate_v2", 1, "refine");
    assert.ok(result);
    // Should get the generic "refine" default, not the debate_v2 critique instruction
    assert.equal(result.goal, "Address the strongest objections from critiques and strengthen weak points.");
  });

  it("returns null for an unknown roundKind", () => {
    const result = resolveDefaultRoundInstruction("debate_v2", 0, "unknown");
    assert.equal(result, null);
  });

  it("has registry entries for every (templateId, sequenceIndex) in TOPIC_TEMPLATES", () => {
    for (const [templateId, template] of Object.entries(TOPIC_TEMPLATES)) {
      const registry = ROUND_INSTRUCTIONS[templateId];
      assert.ok(registry, `Missing registry for template: ${templateId}`);
      for (let i = 0; i < template.rounds.length; i++) {
        const entry = registry[i];
        assert.ok(entry, `Missing registry entry for ${templateId}[${i}]`);
        assert.equal(
          entry.roundKind,
          template.rounds[i]!.roundKind,
          `roundKind mismatch for ${templateId}[${i}]: expected ${template.rounds[i]!.roundKind}, got ${entry.roundKind}`,
        );
      }
    }
  });

  it("returns distinct instructions for different rounds of the same template", () => {
    const propose = resolveDefaultRoundInstruction("debate_v2", 0, "propose");
    const critique = resolveDefaultRoundInstruction("debate_v2", 1, "critique");
    assert.ok(propose);
    assert.ok(critique);
    assert.notEqual(propose.goal, critique.goal);
    assert.notEqual(propose.guidance, critique.guidance);
  });

  it("returns instructions with non-null priorRoundContext for non-first rounds", () => {
    // First round should have null priorRoundContext
    const propose = resolveDefaultRoundInstruction("debate_v2", 0, "propose");
    assert.ok(propose);
    assert.equal(propose.priorRoundContext, null);

    // Second round should have non-null priorRoundContext
    const critique = resolveDefaultRoundInstruction("debate_v2", 1, "critique");
    assert.ok(critique);
    assert.ok(critique.priorRoundContext);
  });
});
