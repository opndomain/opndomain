import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildParentGroupPrompt,
  candidatesFromClaimGroup,
  isValidLlmGroup,
  validateLlmGroups,
  type LlmGroupOutput,
} from "./refine.js";

type ParentTopic = {
  id: string;
  title: string;
  prompt: string;
  domainId: string;
  refinementDepth: number;
};

const parentTopic: ParentTopic = {
  id: "top_parent",
  title: "Parent debate",
  prompt: "Parent prompt body.",
  domainId: "dom_psychology",
  refinementDepth: 0,
};

function claim(id: string, text: string) {
  return {
    claim: {
      id,
      topicId: parentTopic.id,
      claimText: text,
      classification: null,
      sourceQuote: null,
      promotedTopicId: null,
      createdAt: "2026-04-22T00:00:00.000Z",
    },
    parentTopic,
  };
}

const baseGroup = (claimIds: string[], titleSuffix = ""): LlmGroupOutput => ({
  title: `Follow-up investigation ${titleSuffix}`.trim(),
  prompt:
    "Investigate a specific unresolved claim from the parent debate. "
    + "The prompt body intentionally exceeds 100 characters to satisfy the schema's minimum prompt length validation.",
  claimIds,
});

describe("refine.ts LLM output validation", () => {
  it("accepts a happy-path output where every input claim is covered exactly once", () => {
    const inputClaimIds = new Set(["cl_a", "cl_b", "cl_c"]);
    const raw = [
      baseGroup(["cl_a", "cl_b"], "merged"),
      baseGroup(["cl_c"], "solo"),
    ];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.groups.length, 2);
    assert.deepEqual(result.groups[0]!.claimIds, ["cl_a", "cl_b"]);
    assert.deepEqual(result.groups[1]!.claimIds, ["cl_c"]);
  });

  it("fails the batch when an input claim is omitted from every output group", () => {
    const inputClaimIds = new Set(["cl_a", "cl_b", "cl_c"]);
    const raw = [baseGroup(["cl_a", "cl_b"])];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "missing_claim_ids");
    assert.deepEqual(result.missing, ["cl_c"]);
  });

  it("fails the batch when the same input claim appears in two output groups", () => {
    const inputClaimIds = new Set(["cl_a", "cl_b"]);
    const raw = [
      baseGroup(["cl_a", "cl_b"], "first"),
      baseGroup(["cl_b"], "second"),
    ];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, false);
    if (result.ok) return;
    // Missing is checked first in the reason-priority order, so a duplicate
    // surfaces via the duplicated list even when reason says missing. We
    // assert the duplicated collection directly.
    assert.ok(result.duplicated.includes("cl_b"));
  });

  it("fails the batch when the LLM invents a claim ID not in the input set", () => {
    const inputClaimIds = new Set(["cl_a", "cl_b"]);
    const raw = [
      baseGroup(["cl_a"], "first"),
      baseGroup(["cl_b", "cl_phantom"], "second"),
    ];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.unknown.includes("cl_phantom"));
  });

  it("drops entries whose claimIds array is empty via the shape validator", () => {
    const withEmpty = { title: "t", prompt: "x".repeat(120), claimIds: [] };
    assert.equal(isValidLlmGroup(withEmpty), false);
  });

  it("fails the batch when every output entry has empty or invalid claimIds (no valid groups)", () => {
    const inputClaimIds = new Set(["cl_a"]);
    const raw = [
      { title: "t", prompt: "x".repeat(120), claimIds: [] },
      { title: "t2", prompt: "y".repeat(120), claimIds: [""] },
    ];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_valid_groups");
    assert.deepEqual(result.missing, ["cl_a"]);
  });

  it("trims whitespace on claim IDs before comparison", () => {
    const inputClaimIds = new Set(["cl_a", "cl_b"]);
    const raw: unknown[] = [
      { title: "t", prompt: "x".repeat(120), claimIds: ["  cl_a ", "cl_b"] },
    ];
    const result = validateLlmGroups(inputClaimIds, raw);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.groups[0]!.claimIds, ["cl_a", "cl_b"]);
  });
});

describe("refine.ts candidate shape", () => {
  it("emits one candidate per validated group with the first claim as primary and the full list as mergedClaimIds", () => {
    const groups: LlmGroupOutput[] = [
      baseGroup(["cl_a", "cl_b"], "merged"),
      baseGroup(["cl_c"], "solo"),
    ];
    const candidates = candidatesFromClaimGroup(parentTopic, groups);
    assert.equal(candidates.length, 2);

    assert.equal(candidates[0]!.sourceId, parentTopic.id);
    assert.equal(candidates[0]!.sourceClaimId, "cl_a");
    assert.deepEqual(candidates[0]!.mergedClaimIds, ["cl_a", "cl_b"]);
    assert.equal(candidates[0]!.source, "vertical_refinement");

    assert.equal(candidates[1]!.sourceClaimId, "cl_c");
    assert.deepEqual(candidates[1]!.mergedClaimIds, ["cl_c"]);
  });
});

describe("refine.ts prompt builder", () => {
  it("includes each claim ID in the prompt so the LLM can reference them in claimIds", () => {
    const entries = [
      claim("cl_a", "Claim A text"),
      claim("cl_b", "Claim B text"),
    ];
    const prompt = buildParentGroupPrompt(parentTopic, entries);
    assert.match(prompt, /\[cl_a\]/);
    assert.match(prompt, /\[cl_b\]/);
    assert.match(prompt, /Claim A text/);
    assert.match(prompt, /Parent debate title/);
  });
});
