import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AnalyticsBackfillRequestSchema,
  AnalyticsBackfillResponseSchema,
  AnalyticsDomainsResponseSchema,
  AnalyticsLeaderboardResponseSchema,
  AnalyticsOverviewResponseSchema,
  AnalyticsTopicResponseSchema,
  AnalyticsVoteReliabilityQuerySchema,
  AnalyticsVoteReliabilityResponseSchema,
} from "./index.js";

describe("analytics contracts", () => {
  it("validates overview, domains, leaderboard, topic, vote reliability, and backfill payloads", () => {
    const overview = AnalyticsOverviewResponseSchema.parse({
      generatedAt: "2026-03-29T18:00:00Z",
      window: {
        from: "2026-03-25",
        to: "2026-03-29",
      },
      totals: {
        totalTopics: 12,
        totalContributions: 84,
        totalVerdicts: 5,
        activeBeings: 19,
        activeAgents: 11,
      },
      series: [
        {
          rollupDate: "2026-03-25",
          topicsCreatedCount: 2,
          contributionsCreatedCount: 18,
          verdictsCreatedCount: 1,
          cumulativeTopics: 2,
          cumulativeContributions: 18,
          cumulativeVerdicts: 1,
          activeTopics: 2,
          activeBeings: 6,
          activeAgents: 4,
        },
      ],
    });

    const domains = AnalyticsDomainsResponseSchema.parse({
      rollupDate: "2026-03-29",
      domains: [
        {
          domainId: "dom_energy",
          domainSlug: "energy",
          domainName: "Energy",
          activeTopics: 3,
          activeBeings: 8,
          contributionCount: 27,
          verdictCount: 2,
        },
      ],
    });

    const leaderboard = AnalyticsLeaderboardResponseSchema.parse({
      domain: {
        id: "dom_energy",
        slug: "energy",
        name: "Energy",
      },
      leaderboard: [
        {
          beingId: "bng_1",
          handle: "grid-analyst",
          displayName: "Grid Analyst",
          decayedScore: 91.2,
          averageScore: 88.5,
          consistencyScore: 0.74,
          sampleCount: 16,
          lastActiveAt: "2026-03-29T17:00:00Z",
        },
      ],
    });

    const topic = AnalyticsTopicResponseSchema.parse({
      topic: {
        id: "top_1",
        domainId: "dom_energy",
        title: "Should storage mandates expand?",
        status: "started",
        currentRoundIndex: 2,
      },
      summary: {
        participantCount: 12,
        contributionCount: 31,
        claimCount: 18,
        claimDensity: 0.58,
      },
      scoreDistribution: [
        {
          minScore: 0,
          maxScore: 10,
          totalCount: 4,
          roundCounts: {
            propose: 2,
            critique: 1,
            refine: 1,
            synthesize: 0,
          },
        },
      ],
      bucketDetails: [
        {
          minScore: 0,
          maxScore: 10,
          roundKind: "propose",
          contributions: [
            {
              contributionId: "ctr_1",
              beingId: "bng_1",
              beingHandle: "grid-analyst",
              roundId: "rnd_1",
              roundKind: "propose",
              finalScore: 8.5,
              excerpt: "Storage targets stabilize the grid during peak demand.",
              dimensions: {
                substance: 72,
                relevance: 81,
                novelty: 44,
                reframe: 38,
                roleBonus: 10,
              },
            },
          ],
        },
      ],
      averageDimensionBreakdown: {
        substance: 71.4,
        relevance: 76.8,
        novelty: 48.2,
        reframe: 39.6,
        roleBonus: 9.5,
      },
      participationFunnel: [
        {
          roundId: "rnd_1",
          roundIndex: 0,
          roundKind: "propose",
          participantCount: 10,
          contributionCount: 14,
        },
      ],
      voteTiming: {
        totalVotes: 16,
        timedVotes: 14,
        averageVotePositionPct: 0.42,
        averageRoundElapsedPct: 0.42,
      },
    });

    const voteReliabilityQuery = AnalyticsVoteReliabilityQuerySchema.parse({
      minVotes: "5",
    });

    const voteReliability = AnalyticsVoteReliabilityResponseSchema.parse({
      minVotes: 5,
      histogram: [
        {
          minScore: 70,
          maxScore: 80,
          totalCount: 2,
          trustTierCounts: {
            unverified: 0,
            supervised: 1,
            verified: 1,
            established: 0,
            trusted: 0,
          },
        },
      ],
      scatter: [
        {
          beingId: "bng_1",
          handle: "grid-analyst",
          displayName: "Grid Analyst",
          reliability: 76,
          votesCount: 9,
          trustTier: "verified",
        },
      ],
      summary: {
        qualifyingBeings: 2,
        maxVotesCount: 9,
      },
    });

    const backfillRequest = AnalyticsBackfillRequestSchema.parse({
      from: "2026-03-01",
      to: "2026-03-29",
      overwrite: true,
    });

    const backfillResponse = AnalyticsBackfillResponseSchema.parse({
      from: "2026-03-01",
      to: "2026-03-29",
      daysProcessed: 29,
      rowsWritten: 29,
    });

    assert.equal(overview.totals.activeAgents, 11);
    assert.equal(domains.domains[0]?.domainSlug, "energy");
    assert.equal(leaderboard.leaderboard[0]?.sampleCount, 16);
    assert.equal(topic.summary.claimDensity, 0.58);
    assert.equal(topic.scoreDistribution[0]?.roundCounts.propose, 2);
    assert.equal(topic.bucketDetails[0]?.contributions[0]?.dimensions.roleBonus, 10);
    assert.equal(topic.voteTiming.timedVotes, 14);
    assert.equal(voteReliabilityQuery.minVotes, 5);
    assert.equal(voteReliability.scatter[0]?.trustTier, "verified");
    assert.equal(backfillRequest.overwrite, true);
    assert.equal(backfillResponse.daysProcessed, 29);
  });

  it("rejects invalid analytics dates and negative counters", () => {
    assert.throws(
      () =>
        AnalyticsOverviewResponseSchema.parse({
          generatedAt: "2026-03-29T18:00:00Z",
          window: {
            from: "03-25-2026",
            to: "2026-03-29",
          },
          totals: {
            totalTopics: 1,
            totalContributions: 1,
            totalVerdicts: 1,
            activeBeings: 1,
            activeAgents: 1,
          },
          series: [],
        }),
      /YYYY-MM-DD/i,
    );

    assert.throws(
      () =>
        AnalyticsBackfillResponseSchema.parse({
          from: "2026-03-01",
          to: "2026-03-29",
          daysProcessed: -1,
          rowsWritten: 3,
        }),
      /greater than or equal to 0/i,
    );
  });
});
