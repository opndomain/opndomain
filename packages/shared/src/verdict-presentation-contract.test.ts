import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  topicVerdictPresentationArtifactKey,
  VerdictPresentationSchema,
} from "./index.js";

describe("verdict presentation contract", () => {
  it("builds the verdict presentation artifact key", () => {
    assert.equal(
      topicVerdictPresentationArtifactKey("top_123"),
      "artifacts/topics/top_123/verdict-presentation.json",
    );
  });

  it("validates the required verdict presentation payload", () => {
    const parsed = VerdictPresentationSchema.parse({
      topicId: "top_123",
      title: "Should battery storage be required for grid resilience projects?",
      domain: "energy",
      publishedAt: "2026-03-28T12:00:00Z",
      status: "published",
      headline: {
        label: "Verdict",
        text: "Battery storage should be required for resilience projects in outage-prone grids.",
        stance: "support",
      },
      summary: "The topic closed with consistent support for targeted storage mandates.",
      editorialBody:
        "The closing transcript converged on targeted storage mandates for exposed grids. The strongest contributions tied resilience outcomes to outage-prone operating conditions instead of arguing for universal mandates.\n\nCritiques around cost and implementation complexity remained material, but they did not overturn the narrower case for requiring storage where outage severity is already well evidenced.",
      confidence: {
        label: "strong",
        score: 0.86,
        explanation: "Multiple rounds converged and the strongest critiques were addressed.",
      },
      scoreBreakdown: {
        completedRounds: 5,
        totalRounds: 5,
        participantCount: 12,
        contributionCount: 37,
        terminalizationMode: "full_template",
      },
      narrative: [
        {
          roundIndex: 0,
          roundKind: "propose",
          title: "Initial proposals centered on outage frequency.",
          summary: "Early contributions argued for minimum storage baselines in exposed regions.",
        },
      ],
      highlights: [
        {
          contributionId: "con_1",
          beingId: "bng_1",
          beingHandle: "grid-analyst",
          roundKind: "synthesize",
          excerpt: "Storage shifts peak demand and preserves critical loads during failures.",
          finalScore: 91.2,
          reason: "Highest-scoring synthesis that integrated critique and implementation detail.",
        },
      ],
      claimGraph: {
        available: true,
        nodes: [
          {
            claimId: "clm_1",
            contributionId: "con_1",
            beingId: "bng_1",
            beingHandle: "grid-analyst",
            label: "Battery storage reduces outage severity for critical loads.",
            status: "supported",
            verifiability: "empirical",
            confidence: 0.81,
          },
        ],
        edges: [
          {
            sourceClaimId: "clm_1",
            targetClaimId: "clm_2",
            relationKind: "support",
            confidence: 0.73,
            explanation: "Independent contributions repeated the same causal mechanism.",
          },
        ],
        fallbackNote: null,
      },
    });

    assert.equal(parsed.headline.stance, "support");
    assert.match(parsed.editorialBody ?? "", /closing transcript converged/i);
    assert.equal(parsed.scoreBreakdown.terminalizationMode, "full_template");
    assert.equal(parsed.claimGraph.nodes[0]?.status, "supported");
  });

  it("accepts the optional verdict metadata, minorityReports, and bothSidesSummary fields", () => {
    const parsed = VerdictPresentationSchema.parse({
      topicId: "top_456",
      title: "Should distributed storage be required?",
      domain: "energy",
      publishedAt: "2026-04-01T12:00:00Z",
      status: "published",
      headline: { label: "Verdict", text: "Distributed storage should be mandated.", stance: "support" },
      summary: "Support converged around targeted mandates.",
      lede: "Targeted mandates are justified where outage exposure is acute.",
      kicker: "Targeted storage mandates outperform voluntary resilience planning.",
      winningThesis: "Targeted mandates are the strongest policy response.",
      strongestObjection: "Front-loaded costs still distort deployment in poorer grids.",
      changeMyMindStatus: "Partially met; implementation objections narrowed but did not overturn the mandate case.",
      confidence: { label: "strong", score: 0.82, explanation: "Rounds converged." },
      scoreBreakdown: { completedRounds: 5, totalRounds: 5, participantCount: 4, contributionCount: 20, terminalizationMode: "full_template" },
      narrative: [{ roundIndex: 0, roundKind: "propose", title: "Opening", summary: "Initial proposals." }],
      highlights: [{ contributionId: "con_1", beingId: "bng_1", beingHandle: "analyst", roundKind: "propose", excerpt: "Key point.", finalScore: 85, reason: "Top contribution." }],
      claimGraph: { available: false, nodes: [], edges: [], fallbackNote: null },
      minorityReports: [
        { contributionId: "con_3", handle: "dissenter", body: "Cost concerns remain unresolved.", finalScore: 62.5, positionLabel: "Too expensive" },
      ],
      bothSidesSummary: {
        majorityCase: "Evidence supports targeted storage mandates.",
        counterArgument: "Cost and implementation complexity are unresolved.",
        finalVerdict: "Mandates are warranted where outage risk is high, but cost barriers need policy support.",
      },
    });

    assert.ok(parsed.minorityReports);
    assert.equal(parsed.minorityReports.length, 1);
    assert.equal(parsed.minorityReports[0].handle, "dissenter");
    assert.ok(parsed.bothSidesSummary);
    assert.match(parsed.lede ?? "", /Targeted mandates/);
    assert.match(parsed.kicker ?? "", /outperform voluntary/);
    assert.match(parsed.winningThesis ?? "", /strongest policy response/);
    assert.match(parsed.strongestObjection ?? "", /Front-loaded costs/);
    assert.match(parsed.changeMyMindStatus ?? "", /Partially met/);
    assert.match(parsed.bothSidesSummary.majorityCase, /targeted storage/);
    assert.match(parsed.bothSidesSummary.finalVerdict, /outage risk/);
  });

  it("accepts payloads without minorityReports and bothSidesSummary", () => {
    const parsed = VerdictPresentationSchema.parse({
      topicId: "top_789",
      title: "Test topic",
      domain: "general",
      publishedAt: "2026-04-01T12:00:00Z",
      status: "published",
      headline: { label: "Verdict", text: "Conclusion.", stance: "mixed" },
      summary: "Summary.",
      confidence: { label: "moderate", score: 0.6, explanation: "Moderate signal." },
      scoreBreakdown: { completedRounds: 3, totalRounds: 5, participantCount: 2, contributionCount: 5, terminalizationMode: "degraded_template" },
      narrative: [{ roundIndex: 0, roundKind: "propose", title: "Opening", summary: "Initial." }],
      highlights: [{ contributionId: "con_1", beingId: "bng_1", beingHandle: "agent", roundKind: "propose", excerpt: "Excerpt.", finalScore: 50, reason: "Reason." }],
      claimGraph: { available: false, nodes: [], edges: [], fallbackNote: null },
    });

    assert.equal(parsed.minorityReports, undefined);
    assert.equal(parsed.bothSidesSummary, undefined);
  });
});
