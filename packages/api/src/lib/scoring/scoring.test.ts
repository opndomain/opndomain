import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreContribution } from "./index.js";
import { scoreHeuristics } from "./heuristic.js";
import { detectRole } from "./roles.js";
import { scoreSemanticSimilarity } from "./semantic.js";

const EMBEDDING_TERMS = [
  "durable",
  "object",
  "flush",
  "retry",
  "buffered",
  "writes",
  "sqlite",
  "cache",
  "headers",
  "debate",
] as const;

function fakeVector(text: string) {
  const normalized = text.toLowerCase();
  return EMBEDDING_TERMS.map((term) => {
    const matches = normalized.match(new RegExp(term, "g"));
    return matches?.length ?? 0;
  });
}

const fakeBackend = {
  async embed(texts: string[]) {
    return texts.map(fakeVector);
  },
};

describe("scoring", () => {
  it("gives stronger heuristic scores to substantive, evidence-backed text", () => {
    const strong = scoreHeuristics(
      "Cloudflare Durable Objects measured 12ms median flush latency in practice. The benchmark results show a trade-off between sqlite durability and throughput.",
    );
    const weak = scoreHeuristics("This is really important and there are many approaches. Let me know.");

    assert.ok(strong.substanceScore > weak.substanceScore);
    assert.ok(strong.evidenceScore > 0);
    assert.ok(weak.vaguenessPenalty > 0);
  });

  it("detects role, echo, and meta/refusal patterns", () => {
    const echoRole = detectRole("I agree with that.", 20);
    assert.equal(echoRole.detectedRole, "echo");
    assert.equal(echoRole.echoDetected, true);

    const metaRole = detectRole("I can't provide an answer without knowing the topic because there is not enough context.", 55);
    assert.equal(metaRole.metaDetected, true);
  });

  it("uses prompt-only semantic scoring and title changes do not affect relevance", async () => {
    const result = await scoreSemanticSimilarity(
      {
        ENABLE_SEMANTIC_SCORING: true,
      } as never,
      {
        topicPrompt: "Design a retry-safe Durable Object flush path.",
        bodyClean: "A retry-safe Durable Object flush path should batch sqlite-backed buffered writes.",
        recentTranscriptContributions: [
          { id: "cnt_old", bodyClean: "Workers use Durable Objects for buffered writes." },
          { id: "cnt_new", bodyClean: "Use sqlite-backed buffering in Durable Objects for flush retries." },
        ],
      },
      fakeBackend,
    );
    const samePromptDifferentTitleWorld = await scoreSemanticSimilarity(
      {
        ENABLE_SEMANTIC_SCORING: true,
      } as never,
      {
        topicPrompt: "Design a retry-safe Durable Object flush path.",
        bodyClean: "A retry-safe Durable Object flush path should batch sqlite-backed buffered writes.",
        recentTranscriptContributions: [
          { id: "cnt_old", bodyClean: "Workers use Durable Objects for buffered writes." },
          { id: "cnt_new", bodyClean: "Use sqlite-backed buffering in Durable Objects for flush retries." },
        ],
      },
      fakeBackend,
    );

    assert.equal(result.enabled, true);
    assert.equal(result.topicEmbeddingText, "Design a retry-safe Durable Object flush path.");
    assert.equal(result.comparisonWindow.scope, "topic_recent_transcript");
    assert.deepEqual(result.comparisonWindow.includedVisibilities, ["normal", "low_confidence"]);
    assert.equal(result.comparisonWindow.topicEmbeddingSource, "topic_prompt_only");
    assert.deepEqual(result.comparedContributionIds, ["cnt_old", "cnt_new"]);
    assert.equal(result.relevance, samePromptDifferentTitleWorld.relevance);
    assert.ok((result.semanticAverage ?? 0) > 0);
  });

  it("applies novelty confidence degradation for sample sizes 0, 1, and 2+", async () => {
    const body = "Design a retry-safe Durable Object flush path with buffering.";
    const prompt = "Design a retry-safe Durable Object flush path.";

    const empty = await scoreSemanticSimilarity(
      { ENABLE_SEMANTIC_SCORING: true } as never,
      {
        topicPrompt: prompt,
        bodyClean: body,
        recentTranscriptContributions: [],
      },
      fakeBackend,
    );
    const single = await scoreSemanticSimilarity(
      { ENABLE_SEMANTIC_SCORING: true } as never,
      {
        topicPrompt: prompt,
        bodyClean: body,
        recentTranscriptContributions: [{ id: "cnt_1", bodyClean: body }],
      },
      fakeBackend,
    );
    const multiple = await scoreSemanticSimilarity(
      { ENABLE_SEMANTIC_SCORING: true } as never,
      {
        topicPrompt: prompt,
        bodyClean: body,
        recentTranscriptContributions: [
          { id: "cnt_1", bodyClean: body },
          { id: "cnt_2", bodyClean: body },
        ],
      },
      fakeBackend,
    );

    assert.ok((empty.novelty ?? 0) > (single.novelty ?? 0));
    assert.ok((single.novelty ?? 0) > (multiple.novelty ?? 0));
    assert.equal(multiple.novelty, 0);
    assert.deepEqual(empty.semanticFlags.includes("novelty_damped_sparse_context"), true);
    assert.deepEqual(single.semanticFlags.includes("novelty_damped_sparse_context"), true);
    assert.deepEqual(multiple.semanticFlags.includes("novelty_damped_sparse_context"), false);
  });

  it("computes reframe as inverse max redundancy, not from relevance", async () => {
    const result = await scoreSemanticSimilarity(
      { ENABLE_SEMANTIC_SCORING: true } as never,
      {
        topicPrompt: "Debate the merits of buffered writes.",
        bodyClean: "Use sqlite-backed buffered writes for retry-safe flushes.",
        recentTranscriptContributions: [
          { id: "cnt_1", bodyClean: "Use sqlite-backed buffered writes for retry-safe flushes." },
          { id: "cnt_2", bodyClean: "A different contribution about caching headers." },
        ],
      },
      fakeBackend,
    );

    assert.ok(Math.abs((result.reframe ?? 0) - 0) < 0.000001);
    assert.equal(result.semanticFlags.includes("high_redundancy"), true);
  });

  it("returns null semantic fields when semantic scoring is disabled", async () => {
    const result = await scoreSemanticSimilarity(
      {
        ENABLE_SEMANTIC_SCORING: false,
      } as never,
      {
        topicPrompt: "Prompt",
        bodyClean: "Body",
        recentTranscriptContributions: [],
      },
      fakeBackend,
    );

    assert.equal(result.enabled, false);
    assert.equal(result.semanticAverage, null);
    assert.deepEqual(result.semanticFlags, []);
  });

  it("returns composite scores alongside raw scoring components", async () => {
    const result = await scoreContribution(
      { ENABLE_SEMANTIC_SCORING: false } as never,
      {
        topicPrompt: "Prompt",
        bodyClean: "Measured benchmark results show a trade-off in practice.",
        transforms: [],
        riskScore: 0,
        riskFamilies: [],
        roundKind: "propose",
        templateId: "debate_v2",
        scoringProfile: "adversarial",
        reputationFactor: 0.5,
        recentTranscriptContributions: [],
      },
    );

    assert.ok(result.initialScore > 0);
    assert.equal(result.finalScore, result.initialScore);
    assert.ok(result.shadowInitialScore > 0);
    assert.equal(result.shadowFinalScore, result.shadowInitialScore);
  });
});
