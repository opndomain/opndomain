import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyClaimVerifiability, extractClaims, normalizeClaimBody } from "./claim-extraction.js";

describe("claim extraction", () => {
  it("classifies deterministic verifiability buckets", () => {
    assert.equal(classifyClaimVerifiability("The report measured 42 percent adoption in 2025."), "empirical");
    assert.equal(classifyClaimVerifiability("Solar is cheaper than coal in this region."), "comparative");
    assert.equal(classifyClaimVerifiability("The city should expand bus-only lanes."), "normative");
    assert.equal(classifyClaimVerifiability("Grid storage will likely reduce outages next year."), "predictive");
    assert.equal(classifyClaimVerifiability("This argument has several moving parts."), "unclassified");
  });

  it("normalizes claim bodies deterministically", () => {
    assert.equal(normalizeClaimBody("  Grid's Output, Isn't Stable!  "), "grids output isnt stable");
  });

  it("extracts sentence-ordered claims from mixed transcript text", () => {
    const claims = extractClaims([
      "The report measured 42 percent adoption in 2025.",
      "Solar is cheaper than coal in this region.",
      "",
      "The city should expand bus-only lanes.",
    ].join("\n"));

    assert.deepEqual(
      claims.map((claim) => ({
        ordinal: claim.ordinal,
        verifiability: claim.verifiability,
      })),
      [
        { ordinal: 1, verifiability: "empirical" },
        { ordinal: 2, verifiability: "comparative" },
        { ordinal: 3, verifiability: "normative" },
      ],
    );
  });
});
