import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTranscriptVisibleContribution } from "./visibility.js";

describe("transcript visibility", () => {
  it("hides sealed active contributions before reveal_at", () => {
    const visible = isTranscriptVisibleContribution(
      {
        visibility: "normal",
        round_visibility: "sealed",
        reveal_at: "2026-03-26T13:00:00.000Z",
      },
      new Date("2026-03-26T12:00:00.000Z"),
    );

    assert.equal(visible, false);
  });

  it("shows open contributions immediately", () => {
    const visible = isTranscriptVisibleContribution(
      {
        visibility: "normal",
        round_visibility: "open",
        reveal_at: null,
      },
      new Date("2026-03-26T12:00:00.000Z"),
    );

    assert.equal(visible, true);
  });

  it("keeps sealed rounds hidden when reveal_at is null", () => {
    const visible = isTranscriptVisibleContribution(
      {
        visibility: "normal",
        round_visibility: "sealed",
        reveal_at: null,
      },
      new Date("2026-03-26T12:00:00.000Z"),
    );

    assert.equal(visible, false);
  });
});
