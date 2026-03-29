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
    assert.equal(parsed.scoreBreakdown.terminalizationMode, "full_template");
    assert.equal(parsed.claimGraph.nodes[0]?.status, "supported");
  });
});
