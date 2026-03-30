import { z } from "zod";
import { RoundKindSchema } from "./templates.js";
import { TopicStatusSchema } from "./schemas.js";

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");
const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().min(1));

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
  count: z.number().int().nonnegative(),
});

export const AnalyticsTopicFunnelEntrySchema = z.object({
  roundId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  roundKind: RoundKindSchema,
  participantCount: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
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
  participationFunnel: z.array(AnalyticsTopicFunnelEntrySchema),
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
export type AnalyticsTopicFunnelEntry = z.infer<typeof AnalyticsTopicFunnelEntrySchema>;
export type AnalyticsTopicResponse = z.infer<typeof AnalyticsTopicResponseSchema>;
export type AnalyticsBackfillRequest = z.infer<typeof AnalyticsBackfillRequestSchema>;
export type AnalyticsBackfillResponse = z.infer<typeof AnalyticsBackfillResponseSchema>;
