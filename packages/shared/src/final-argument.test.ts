import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFinalArgument } from "./final-argument.js";

function buildFixture(overrides?: Partial<{
  partAHeader: string;
  strongestObjectionLabel: string;
  mapPosition: string;
  myThesis: string;
  whyIHoldIt: string;
  strongestObjection: string;
  changeMyMindStatus: string;
  whatSettled: string;
  whatContested: string;
  neutralVerdict: string;
  kicker: string;
}>) {
  return [
    overrides?.partAHeader ?? "PART A — MY POSITION",
    "",
    `MAP_POSITION: ${overrides?.mapPosition ?? "2"}`,
    "",
    `MY THESIS: ${overrides?.myThesis ?? "Structured oversight should be mandatory for frontier labs."}`,
    "",
    `WHY I HOLD IT: ${overrides?.whyIHoldIt ?? "The strongest evidence in the record converged on oversight as a release gate rather than a voluntary norm.\n\nThe counterexamples mostly attacked implementation details, not the case for a durable floor."}`,
    "",
    `${overrides?.strongestObjectionLabel ?? "STRONGEST OBJECTION I CAN'T FULLY ANSWER"}: ${overrides?.strongestObjection ?? "A rigid review layer could slow high-value deployment in time-sensitive settings."}`,
    "",
    `CHANGE-MY-MIND STATUS: ${overrides?.changeMyMindStatus ?? "Partially met. The operational objections narrowed my claim, but they did not overturn the need for a mandatory floor."}`,
    "",
    "PART B — IMPARTIAL SYNTHESIS",
    "",
    `WHAT THIS DEBATE SETTLED: ${overrides?.whatSettled ?? "The room converged on the need for some durable oversight mechanism before high-risk release."}`,
    "",
    `WHAT REMAINS CONTESTED: ${overrides?.whatContested ?? "The unresolved question is how much discretion labs should retain during emergency deployment scenarios."}`,
    "",
    `NEUTRAL VERDICT: ${overrides?.neutralVerdict ?? "The evidence favored mandatory oversight with a narrowly scoped emergency carveout."}`,
    "",
    `KICKER: ${overrides?.kicker ?? "Mandatory oversight is a release condition, not an optional norm."}`,
  ].join("\n");
}

describe("parseFinalArgument", () => {
  it("parses a canonical final_argument body", () => {
    const parsed = parseFinalArgument(buildFixture());
    assert.ok(parsed);
    assert.equal(parsed.mapPosition, 2);
    assert.match(parsed.myThesis, /mandatory for frontier labs/i);
    assert.match(parsed.neutralVerdict, /mandatory oversight/i);
    assert.match(parsed.kicker, /release condition/i);
  });

  it("parses PART A dash variants and CANNOT objection label", () => {
    const parsed = parseFinalArgument(buildFixture({
      partAHeader: "PART A - MY POSITION",
      strongestObjectionLabel: "STRONGEST OBJECTION I CANNOT FULLY ANSWER",
      mapPosition: "4",
    }));
    assert.ok(parsed);
    assert.equal(parsed.mapPosition, 4);
    assert.match(parsed.strongestObjection, /rigid review layer/i);
  });

  it("parses without MAP_POSITION and coerces it to null", () => {
    const parsed = parseFinalArgument(buildFixture({ mapPosition: "" }).replace(/MAP_POSITION:\s*\n\n/, ""));
    assert.ok(parsed);
    assert.equal(parsed.mapPosition, null);
  });

  it("keeps multiline prose sections intact", () => {
    const parsed = parseFinalArgument(buildFixture({
      whyIHoldIt: "Paragraph one explains the policy case in detail.\n\nParagraph two carries the factual support forward.",
      whatSettled: "First settled paragraph.\n\nSecond settled paragraph.",
    }));
    assert.ok(parsed);
    assert.match(parsed.whyIHoldIt, /Paragraph two carries/);
    assert.match(parsed.whatSettled, /Second settled paragraph/);
  });

  it("parses five representative labeled fixtures", () => {
    const fixtures = [
      buildFixture(),
      buildFixture({ mapPosition: "1", myThesis: "Targeted storage mandates are justified in outage-prone grids." }),
      buildFixture({ mapPosition: "3", neutralVerdict: "The room leaned toward targeted mandates while conceding material implementation costs." }),
      buildFixture({ strongestObjectionLabel: "STRONGEST OBJECTION I CANNOT FULLY ANSWER", kicker: "Targeted mandates outperform voluntary resilience planning." }),
      buildFixture({ partAHeader: "PART A — MY POSITION", changeMyMindStatus: "Not met. My position narrowed but did not reverse." }),
    ];

    for (const fixture of fixtures) {
      const parsed = parseFinalArgument(fixture);
      assert.ok(parsed);
      assert.ok(parsed.myThesis.length > 0);
      assert.ok(parsed.neutralVerdict.length > 0);
    }
  });

  it("returns null when a required label is missing", () => {
    const body = buildFixture().replace(/\nCHANGE-MY-MIND STATUS:[\s\S]*?\n\nPART B/, "\n\nPART B");
    assert.equal(parseFinalArgument(body), null);
  });

  it("returns null for partial labels", () => {
    const body = buildFixture().replace("MY THESIS:", "MY THES:");
    assert.equal(parseFinalArgument(body), null);
  });

  it("returns null for legacy majority-case format", () => {
    const legacy =
      "MAJORITY CASE: Majority prose.\n\n" +
      "COUNTER-ARGUMENT: Counter prose.\n\n" +
      "FINAL VERDICT: Final prose.";
    assert.equal(parseFinalArgument(legacy), null);
  });
});
