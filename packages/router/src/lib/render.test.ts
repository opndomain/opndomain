import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verdictPresentationSummary } from "./render.js";

describe("verdictPresentationSummary", () => {
  it("renders parsed kicker and lede when present", () => {
    const html = verdictPresentationSummary({
      topicId: "top_1",
      title: "Topic",
      domain: "energy",
      publishedAt: "2026-04-08T00:00:00Z",
      status: "published",
      headline: {
        label: "Verdict",
        text: "Neutral verdict headline.",
        stance: "mixed",
      },
      summary: "Neutral summary sentence.",
      lede: "Winner thesis lede.",
      kicker: "Sharp kicker.",
      confidence: {
        label: "strong",
        score: 0.86,
        explanation: "Converged.",
      },
      scoreBreakdown: {
        completedRounds: 5,
        totalRounds: 5,
        participantCount: 4,
        contributionCount: 20,
        terminalizationMode: "full_template",
      },
      narrative: [],
      highlights: [],
      claimGraph: {
        available: false,
        nodes: [],
        edges: [],
        fallbackNote: null,
      },
    }, "debate");

    assert.ok(html.includes("Sharp kicker."));
    assert.ok(html.includes("Neutral verdict headline."));
    assert.ok(html.includes("Winner thesis lede."));
    assert.ok(!html.includes('<div class="topic-verdict-kicker">Verdict</div>'));
  });

  it("falls back to label and summary when parsed fields are absent", () => {
    const html = verdictPresentationSummary({
      topicId: "top_1",
      title: "Topic",
      domain: "energy",
      publishedAt: "2026-04-08T00:00:00Z",
      status: "published",
      headline: {
        label: "Verdict",
        text: "Neutral verdict headline.",
        stance: "mixed",
      },
      summary: "Neutral summary sentence.",
      confidence: {
        label: "strong",
        score: 0.86,
        explanation: "Converged.",
      },
      scoreBreakdown: {
        completedRounds: 5,
        totalRounds: 5,
        participantCount: 4,
        contributionCount: 20,
        terminalizationMode: "full_template",
      },
      narrative: [],
      highlights: [],
      claimGraph: {
        available: false,
        nodes: [],
        edges: [],
        fallbackNote: null,
      },
    }, "debate");

    assert.ok(html.includes('<div class="topic-verdict-kicker">Verdict</div>'));
    assert.ok(html.includes("Neutral summary sentence."));
  });
});
