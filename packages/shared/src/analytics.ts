import { z } from "zod";
import { RoundKindSchema } from "./templates.js";
import { TopicStatusSchema, TrustTierSchema } from "./schemas.js";

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");
const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().min(1));
const AnalyticsScoringRoundKindSchema = z.enum(["propose", "critique", "refine", "synthesize"]);
const AnalyticsScoreRoundCountsSchema = z.object({
  propose: z.number().int().nonnegative(),
  critique: z.number().int().nonnegative(),
  refine: z.number().int().nonnegative(),
  synthesize: z.number().int().nonnegative(),
});

export const AnalyticsOverviewQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
});

export const AnalyticsOverviewTotalsSchema = z.object({
  totalTopics: z.number().int().nonnegative(),
  totalContributions: z.number().int().nonnegative(),
  totalVerdicts: z.number().int().nonnegative(),
  activeBeings: z.number().int().nonnegative(),
  activeAgents: z.number().int().nonnegative(),
});

export const AnalyticsOverviewSeriesEntrySchema = z.object({
  rollupDate: IsoDateSchema,
  topicsCreatedCount: z.number().int().nonnegative(),
  contributionsCreatedCount: z.number().int().nonnegative(),
  verdictsCreatedCount: z.number().int().nonnegative(),
  cumulativeTopics: z.number().int().nonnegative(),
  cumulativeContributions: z.number().int().nonnegative(),
  cumulativeVerdicts: z.number().int().nonnegative(),
  activeTopics: z.number().int().nonnegative(),
  activeBeings: z.number().int().nonnegative(),
  activeAgents: z.number().int().nonnegative(),
});

export const AnalyticsOverviewResponseSchema = z.object({
  generatedAt: TimestampSchema,
  window: z.object({
    from: IsoDateSchema,
    to: IsoDateSchema,
  }),
  totals: AnalyticsOverviewTotalsSchema,
  series: z.array(AnalyticsOverviewSeriesEntrySchema),
});

export const AnalyticsDomainsQuerySchema = z.object({
  rollupDate: IsoDateSchema.optional(),
});

export const AnalyticsDomainActivitySchema = z.object({
  domainId: z.string().min(1),
  domainSlug: z.string().min(1),
  domainName: z.string().min(1),
  activeTopics: z.number().int().nonnegative(),
  activeBeings: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
  verdictCount: z.number().int().nonnegative(),
});

export const AnalyticsDomainsResponseSchema = z.object({
  rollupDate: IsoDateSchema,
  domains: z.array(AnalyticsDomainActivitySchema),
});

export const AnalyticsLeaderboardParamsSchema = z.object({
  domainId: z.string().min(1),
});

export const AnalyticsLeaderboardEntrySchema = z.object({
  beingId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  decayedScore: z.number().finite(),
  averageScore: z.number().finite(),
  consistencyScore: z.number().finite(),
  sampleCount: z.number().int().nonnegative(),
  lastActiveAt: TimestampSchema.nullable(),
});

export const AnalyticsLeaderboardResponseSchema = z.object({
  domain: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  leaderboard: z.array(AnalyticsLeaderboardEntrySchema),
});

export const AnalyticsTopicParamsSchema = z.object({
  topicId: z.string().min(1),
});

export const AnalyticsTopicSummarySchema = z.object({
  participantCount: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
  claimCount: z.number().int().nonnegative(),
  claimDensity: z.number().finite().nonnegative(),
});

export const AnalyticsTopicScoreBucketSchema = z.object({
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  totalCount: z.number().int().nonnegative(),
  roundCounts: AnalyticsScoreRoundCountsSchema,
});

export const AnalyticsTopicContributionDimensionsSchema = z.object({
  substance: z.number().finite(),
  relevance: z.number().finite(),
  novelty: z.number().finite(),
  reframe: z.number().finite(),
  roleBonus: z.number().finite(),
});

export const AnalyticsTopicBucketContributionSchema = z.object({
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
  roundId: z.string().min(1),
  roundKind: AnalyticsScoringRoundKindSchema,
  finalScore: z.number().finite(),
  excerpt: z.string(),
  dimensions: AnalyticsTopicContributionDimensionsSchema,
});

export const AnalyticsTopicBucketDetailSchema = z.object({
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  roundKind: AnalyticsScoringRoundKindSchema,
  contributions: z.array(AnalyticsTopicBucketContributionSchema),
});

export const AnalyticsTopicFunnelEntrySchema = z.object({
  roundId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  roundKind: RoundKindSchema,
  participantCount: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
});

export const AnalyticsTopicVoteTimingSchema = z.object({
  totalVotes: z.number().int().nonnegative(),
  timedVotes: z.number().int().nonnegative(),
  averageVotePositionPct: z.number().finite().nullable(),
  averageRoundElapsedPct: z.number().finite().nullable(),
});

export const AnalyticsTopicResponseSchema = z.object({
  topic: z.object({
    id: z.string().min(1),
    domainId: z.string().min(1),
    title: z.string().min(1),
    status: TopicStatusSchema,
    currentRoundIndex: z.number().int().nonnegative(),
  }),
  summary: AnalyticsTopicSummarySchema,
  scoreDistribution: z.array(AnalyticsTopicScoreBucketSchema),
  bucketDetails: z.array(AnalyticsTopicBucketDetailSchema),
  averageDimensionBreakdown: AnalyticsTopicContributionDimensionsSchema,
  participationFunnel: z.array(AnalyticsTopicFunnelEntrySchema),
  voteTiming: AnalyticsTopicVoteTimingSchema,
});

export const AnalyticsVoteReliabilityQuerySchema = z.object({
  minVotes: z.coerce.number().int().min(1).default(5),
});

export const AnalyticsVoteReliabilityHistogramBucketSchema = z.object({
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  totalCount: z.number().int().nonnegative(),
  trustTierCounts: z.object({
    unverified: z.number().int().nonnegative(),
    supervised: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    established: z.number().int().nonnegative(),
    trusted: z.number().int().nonnegative(),
  }),
});

export const AnalyticsVoteReliabilityScatterPointSchema = z.object({
  beingId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  reliability: z.number().finite(),
  votesCount: z.number().int().nonnegative(),
  trustTier: TrustTierSchema,
});

export const AnalyticsVoteReliabilityResponseSchema = z.object({
  minVotes: z.number().int().min(1),
  histogram: z.array(AnalyticsVoteReliabilityHistogramBucketSchema),
  scatter: z.array(AnalyticsVoteReliabilityScatterPointSchema),
  summary: z.object({
    qualifyingBeings: z.number().int().nonnegative(),
    maxVotesCount: z.number().int().nonnegative(),
  }),
});

export const AnalyticsBackfillRequestSchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
  overwrite: z.boolean().optional(),
});

export const AnalyticsBackfillResponseSchema = z.object({
  from: IsoDateSchema,
  to: IsoDateSchema,
  daysProcessed: z.number().int().nonnegative(),
  rowsWritten: z.number().int().nonnegative(),
});

export type AnalyticsOverviewQuery = z.infer<typeof AnalyticsOverviewQuerySchema>;
export type AnalyticsOverviewTotals = z.infer<typeof AnalyticsOverviewTotalsSchema>;
export type AnalyticsOverviewSeriesEntry = z.infer<typeof AnalyticsOverviewSeriesEntrySchema>;
export type AnalyticsOverviewResponse = z.infer<typeof AnalyticsOverviewResponseSchema>;
export type AnalyticsDomainsQuery = z.infer<typeof AnalyticsDomainsQuerySchema>;
export type AnalyticsDomainActivity = z.infer<typeof AnalyticsDomainActivitySchema>;
export type AnalyticsDomainsResponse = z.infer<typeof AnalyticsDomainsResponseSchema>;
export type AnalyticsLeaderboardParams = z.infer<typeof AnalyticsLeaderboardParamsSchema>;
export type AnalyticsLeaderboardEntry = z.infer<typeof AnalyticsLeaderboardEntrySchema>;
export type AnalyticsLeaderboardResponse = z.infer<typeof AnalyticsLeaderboardResponseSchema>;
export type AnalyticsTopicParams = z.infer<typeof AnalyticsTopicParamsSchema>;
export type AnalyticsTopicSummary = z.infer<typeof AnalyticsTopicSummarySchema>;
export type AnalyticsTopicScoreBucket = z.infer<typeof AnalyticsTopicScoreBucketSchema>;
export type AnalyticsTopicContributionDimensions = z.infer<typeof AnalyticsTopicContributionDimensionsSchema>;
export type AnalyticsTopicBucketContribution = z.infer<typeof AnalyticsTopicBucketContributionSchema>;
export type AnalyticsTopicBucketDetail = z.infer<typeof AnalyticsTopicBucketDetailSchema>;
export type AnalyticsTopicFunnelEntry = z.infer<typeof AnalyticsTopicFunnelEntrySchema>;
export type AnalyticsTopicVoteTiming = z.infer<typeof AnalyticsTopicVoteTimingSchema>;
export type AnalyticsTopicResponse = z.infer<typeof AnalyticsTopicResponseSchema>;
export type AnalyticsVoteReliabilityQuery = z.infer<typeof AnalyticsVoteReliabilityQuerySchema>;
export type AnalyticsVoteReliabilityHistogramBucket = z.infer<typeof AnalyticsVoteReliabilityHistogramBucketSchema>;
export type AnalyticsVoteReliabilityScatterPoint = z.infer<typeof AnalyticsVoteReliabilityScatterPointSchema>;
export type AnalyticsVoteReliabilityResponse = z.infer<typeof AnalyticsVoteReliabilityResponseSchema>;
export type AnalyticsBackfillRequest = z.infer<typeof AnalyticsBackfillRequestSchema>;
export type AnalyticsBackfillResponse = z.infer<typeof AnalyticsBackfillResponseSchema>;
