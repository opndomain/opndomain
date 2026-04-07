import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBaseWeightProfile } from "@opndomain/shared";
import { computeCompositeScore } from "./composite.js";

describe("composite scoring", () => {
  it("looks up the authority round-type weight profiles", () => {
    assert.deepEqual(getBaseWeightProfile("synthesize", "live"), {
      relevance: 0.24,
      novelty: 0.1,
      reframe: 0.24,
      substance: 0.25,
      role: 0.17,
    });
    assert.deepEqual(getBaseWeightProfile("propose", "shadow"), {
      relevance: 0.24,
      novelty: 0.18,
      reframe: 0.14,
      substance: 0.25,
      role: 0.19,
    });
    assert.deepEqual(getBaseWeightProfile("refine", "live"), {
      relevance: 0.23,
      novelty: 0.12,
      reframe: 0.22,
      substance: 0.27,
      role: 0.16,
    });
  });

  it("computes the aligned composite formula with semantics", () => {
    const result = computeCompositeScore({
      roundKind: "critique",
      templateId: "debate",
      scoringProfile: "adversarial",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 10,
      detectedRole: "critique",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });

    assert.equal(result.initialScore, 46.2);
    assert.equal(result.finalScore, 46.2);
    assert.ok(Math.abs(result.shadowInitialScore - 45.32) < 0.000001);
    assert.ok(Math.abs(result.shadowFinalScore - 45.32) < 0.000001);
  });

  it("falls back to the authority without-semantics weights when semantic scores are null", () => {
    const result = computeCompositeScore({
      roundKind: "refine",
      templateId: "research",
      scoringProfile: "exploratory",
      reputationFactor: 0,
      substanceScore: 80,
      roleBonus: 20,
      detectedRole: "other",
      relevance: null,
      novelty: null,
      reframe: null,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });

    assert.ok(Math.abs(result.initialScore - 69.2) < 0.000001);
    assert.ok(Math.abs(result.shadowInitialScore - 66.8) < 0.000001);
  });

  it("applies scoring-profile adjustments and role-round alignment", () => {
    const standard = computeCompositeScore({
      roundKind: "synthesize",
      templateId: "debate",
      scoringProfile: "dialectical",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 20,
      detectedRole: "synthesis",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });
    const socratic = computeCompositeScore({
      roundKind: "synthesize",
      templateId: "socratic",
      scoringProfile: "dialectical",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 20,
      detectedRole: "synthesis",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });

    assert.ok(Math.abs(standard.initialScore - 50.624) < 0.000001);
    assert.ok(Math.abs(socratic.initialScore - 51.98) < 0.000001);
    assert.notEqual(standard.initialScore, socratic.initialScore);
  });

  it("applies the reputation boost capped at 20 percent", () => {
    const result = computeCompositeScore({
      roundKind: "refine",
      templateId: "research",
      scoringProfile: "exploratory",
      reputationFactor: 1,
      substanceScore: 50,
      roleBonus: 0,
      detectedRole: "other",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });

    assert.equal(result.initialScore, 51.6);
    assert.ok(Math.abs(result.shadowInitialScore - 49.2) < 0.000001);
  });

  it("applies the unscored profile weights", () => {
    const result = computeCompositeScore({
      roundKind: "propose",
      templateId: "chaos",
      scoringProfile: "unscored",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 0,
      detectedRole: "other",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
    });

    assert.equal(result.initialScore, 43);
    assert.equal(result.finalScore, 43);
    assert.equal(result.shadowInitialScore, 41);
    assert.equal(result.shadowFinalScore, 41);
  });

  it("keeps final scores equal to initial scores when votes are below maturity", () => {
    const result = computeCompositeScore({
      roundKind: "critique",
      templateId: "debate",
      scoringProfile: "adversarial",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 10,
      detectedRole: "critique",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      weightedVoteScore: 0,
      voteCount: 2,
      distinctVoterCount: 6,
      topicVoteCount: 18,
    });

    assert.equal(result.finalScore, result.initialScore);
    assert.equal(result.shadowFinalScore, result.shadowInitialScore);
  });

  it("applies vote influence caps and round multipliers", () => {
    const critique = computeCompositeScore({
      roundKind: "critique",
      templateId: "debate",
      scoringProfile: "adversarial",
      reputationFactor: 0,
      substanceScore: 40,
      roleBonus: 10,
      detectedRole: "critique",
      relevance: 40,
      novelty: 40,
      reframe: 40,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      weightedVoteScore: 100,
      voteCount: 6,
      distinctVoterCount: 6,
      topicVoteCount: 18,
    });
    const predict = computeCompositeScore({
      roundKind: "predict",
      templateId: "research",
      scoringProfile: "exploratory",
      reputationFactor: 0,
      substanceScore: 40,
      roleBonus: 10,
      detectedRole: "question",
      relevance: 40,
      novelty: 40,
      reframe: 40,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      weightedVoteScore: 100,
      voteCount: 6,
      distinctVoterCount: 6,
      topicVoteCount: 18,
    });

    assert.ok(critique.finalScore > critique.initialScore);
    assert.ok(predict.finalScore > predict.initialScore);
    assert.ok(critique.finalScore < 100);
    assert.ok(predict.finalScore < 100);
  });

  it("keeps a live semantic floor while shadow can fully skip semantics", () => {
    const result = computeCompositeScore({
      roundKind: "propose",
      templateId: "research",
      scoringProfile: "exploratory",
      reputationFactor: 0,
      substanceScore: 40,
      roleBonus: 10,
      detectedRole: "claim",
      relevance: 100,
      novelty: 100,
      reframe: 100,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      liveSemanticWeightRatio: 0.15,
      shadowSemanticWeightRatio: 0,
    });

    assert.ok(result.initialScore > result.shadowInitialScore);
    assert.ok(result.shadowInitialScore > 0);
  });

  it("requires per-contribution distinct voters before vote influence matures", () => {
    const result = computeCompositeScore({
      roundKind: "critique",
      templateId: "debate",
      scoringProfile: "adversarial",
      reputationFactor: 0,
      substanceScore: 50,
      roleBonus: 10,
      detectedRole: "critique",
      relevance: 50,
      novelty: 50,
      reframe: 50,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      weightedVoteScore: 100,
      voteCount: 4,
      distinctVoterCount: 1,
      topicVoteCount: 18,
    });

    assert.equal(result.finalScore, result.initialScore);
    assert.equal(result.shadowFinalScore, result.shadowInitialScore);
  });
});
