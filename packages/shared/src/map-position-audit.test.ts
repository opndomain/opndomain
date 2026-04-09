import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMapPositionAudit, buildAuditConsensus } from "./map-position-audit.js";

describe("parseMapPositionAudit", () => {
  it("parses a well-formed audit block", () => {
    const body = `Some vote reasoning here.

KICKER: AI safety requires oversight.

MAP_POSITION_AUDIT:
@alice: 2
@bob: 1
@carol: 1`;
    const result = parseMapPositionAudit(body);
    assert.ok(result);
    assert.equal(result.size, 3);
    assert.equal(result.get("alice"), 2);
    assert.equal(result.get("bob"), 1);
    assert.equal(result.get("carol"), 1);
  });

  it("returns null when no audit block present", () => {
    const body = "Just some plain vote text with a KICKER: something.";
    assert.equal(parseMapPositionAudit(body), null);
  });

  it("handles handles without @ prefix", () => {
    const body = `MAP_POSITION_AUDIT:
alice: 2
bob: 1`;
    const result = parseMapPositionAudit(body);
    assert.ok(result);
    assert.equal(result.get("alice"), 2);
    assert.equal(result.get("bob"), 1);
  });

  it("normalizes handles: lowercase and strips guest- prefix", () => {
    const body = `MAP_POSITION_AUDIT:
@Guest-Alice: 2
@BOB: 1`;
    const result = parseMapPositionAudit(body);
    assert.ok(result);
    assert.equal(result.get("alice"), 2);
    assert.equal(result.get("bob"), 1);
  });

  it("ignores zero position numbers", () => {
    const body = `MAP_POSITION_AUDIT:
@alice: 0
@bob: 1`;
    const result = parseMapPositionAudit(body);
    assert.ok(result);
    assert.equal(result.size, 1);
    assert.equal(result.get("bob"), 1);
  });

  it("returns null for empty audit block", () => {
    const body = `MAP_POSITION_AUDIT:

Some other text`;
    assert.equal(parseMapPositionAudit(body), null);
  });

  it("stops parsing at non-matching lines after valid entries", () => {
    const body = `MAP_POSITION_AUDIT:
@alice: 2
@bob: 1
Some unrelated trailing text
@carol: 3`;
    const result = parseMapPositionAudit(body);
    assert.ok(result);
    assert.equal(result.size, 2);
    assert.equal(result.has("carol"), false);
  });
});

describe("buildAuditConsensus", () => {
  const finalArgContribs = [
    { id: "c1", handle: "alice" },
    { id: "c2", handle: "bob" },
    { id: "c3", handle: "carol" },
  ];

  it("returns consensus with clear majority", () => {
    const audits = [
      { audit: new Map([["alice", 2], ["bob", 1], ["carol", 1]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 2], ["bob", 1], ["carol", 1]]), voterHandle: "voter2" },
      { audit: new Map([["alice", 2], ["bob", 1], ["carol", 3]]), voterHandle: "voter3" },
    ];
    const result = buildAuditConsensus(audits, finalArgContribs, 3, 3);
    assert.ok(result);
    assert.equal(result.get("c1"), 2); // alice → position 2
    assert.equal(result.get("c2"), 1); // bob → position 1
    assert.equal(result.get("c3"), 1); // carol: 2 votes for 1, 1 for 3 → 1 wins
  });

  it("returns null when below quorum", () => {
    const audits = [
      { audit: new Map([["alice", 2], ["bob", 1]]), voterHandle: "voter1" },
    ];
    // 3 total voters, quorum = 2, only 1 audit → null
    const result = buildAuditConsensus(audits, finalArgContribs, 3, 3);
    assert.equal(result, null);
  });

  it("breaks ties by lower position number", () => {
    const audits = [
      { audit: new Map([["alice", 2]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 3]]), voterHandle: "voter2" },
    ];
    const result = buildAuditConsensus(audits, [{ id: "c1", handle: "alice" }], 2, 3);
    assert.ok(result);
    assert.equal(result.get("c1"), 2); // tie: 2 wins over 3
  });

  it("drops out-of-range position numbers", () => {
    const twoContribs = [
      { id: "c1", handle: "alice" },
      { id: "c2", handle: "bob" },
    ];
    const audits = [
      { audit: new Map([["alice", 5], ["bob", 1]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 5], ["bob", 1]]), voterHandle: "voter2" },
      { audit: new Map([["alice", 2], ["bob", 1]]), voterHandle: "voter3" },
    ];
    // positionCount = 3, so 5 is out of range; alice has one valid vote for 2
    const result = buildAuditConsensus(audits, twoContribs, 3, 3);
    assert.ok(result);
    assert.equal(result.get("c1"), 2); // only valid vote for alice is position 2
    assert.equal(result.get("c2"), 1);
  });

  it("resolves handles to contribution IDs correctly", () => {
    const audits = [
      { audit: new Map([["alice", 1]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 1]]), voterHandle: "voter2" },
    ];
    const result = buildAuditConsensus(
      audits,
      [{ id: "contrib-abc", handle: "Alice" }], // uppercase handle
      2,
      2,
    );
    assert.ok(result);
    assert.equal(result.get("contrib-abc"), 1);
  });

  it("handles quorum calculation for even voter counts", () => {
    const audits = [
      { audit: new Map([["alice", 1]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 1]]), voterHandle: "voter2" },
      { audit: new Map([["alice", 1]]), voterHandle: "voter3" },
    ];
    // 4 total voters, quorum = 3, exactly 3 audits → meets quorum
    const result = buildAuditConsensus(
      audits,
      [{ id: "c1", handle: "alice" }],
      4,
      2,
    );
    assert.ok(result);
    assert.equal(result.get("c1"), 1);
  });

  it("returns null when audit coverage is incomplete (missing contributor)", () => {
    // All 3 voters agree on alice and bob, but none mention carol
    const audits = [
      { audit: new Map([["alice", 1], ["bob", 2]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 1], ["bob", 2]]), voterHandle: "voter2" },
      { audit: new Map([["alice", 1], ["bob", 2]]), voterHandle: "voter3" },
    ];
    const result = buildAuditConsensus(audits, finalArgContribs, 3, 2);
    // carol has no audit entries → incomplete → null
    assert.equal(result, null);
  });

  it("returns null when all audited positions are out of range", () => {
    const audits = [
      { audit: new Map([["alice", 10]]), voterHandle: "voter1" },
      { audit: new Map([["alice", 10]]), voterHandle: "voter2" },
    ];
    const result = buildAuditConsensus(
      audits,
      [{ id: "c1", handle: "alice" }],
      2,
      3, // max position is 3, but votes are for 10
    );
    assert.equal(result, null);
  });
});
