import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meetsTrustTier } from "./trust.js";

describe("meetsTrustTier", () => {
  it("accepts equal or higher trust tiers", () => {
    assert.equal(meetsTrustTier("supervised", "supervised"), true);
    assert.equal(meetsTrustTier("trusted", "verified"), true);
  });

  it("rejects lower trust tiers", () => {
    assert.equal(meetsTrustTier("unverified", "supervised"), false);
    assert.equal(meetsTrustTier("verified", "trusted"), false);
  });
});
