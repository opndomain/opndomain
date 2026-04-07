import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOPIC_TEMPLATES } from "@opndomain/shared";

const LEGACY_GENERALIZED_ROUNDS = new Set([
  "opening",
  "analysis",
  "challenge",
  "synthesis",
]);

describe("template round contract", () => {
  it("uses authority round labels and preserves documented round counts", () => {
    assert.equal(TOPIC_TEMPLATES.debate.rounds.length, 10);
    assert.equal(TOPIC_TEMPLATES.research.rounds.length, 8);

    for (const template of Object.values(TOPIC_TEMPLATES)) {
      for (const round of template.rounds) {
        assert.equal(LEGACY_GENERALIZED_ROUNDS.has(round.roundKind), false);
      }
    }
  });
});
