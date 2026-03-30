import type {
  AnalyticsBackfillRequest,
  AnalyticsBackfillResponse,
  AnalyticsDomainActivity,
  AnalyticsDomainsQuery,
  AnalyticsDomainsResponse,
  AnalyticsLeaderboardEntry,
  AnalyticsLeaderboardParams,
  AnalyticsLeaderboardResponse,
  AnalyticsOverviewQuery,
  AnalyticsOverviewResponse,
  AnalyticsOverviewSeriesEntry,
  AnalyticsTopicBucketDetail,
  AnalyticsTopicContributionDimensions,
  AnalyticsTopicFunnelEntry,
  AnalyticsTopicResponse,
  AnalyticsTopicScoreBucket,
  AnalyticsVoteReliabilityQuery,
  AnalyticsVoteReliabilityResponse,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";

type PlatformDailyRollupRow = {
  rollup_date: string;
  topics_created_count: number;
  contributions_created_count: number;
  verdicts_created_count: number;
  active_topics: number;
  active_beings: number;
  active_agents: number;
};

type DomainDailyRollupRow = {
  domain_id: string;
  domain_slug: string;
  domain_name: string;
  active_topics: number;
  active_beings: number;
  contribution_count: number;
  verdict_count: number;
};

type DomainRow = {
  id: string;
  slug: string;
  name: string;
};

type LeaderboardRow = {
  being_id: string;
  handle: string;
  display_name: string;
  decayed_score: number;
  average_score: number;
  consistency_score: number;
  sample_count: number;
  last_active_at: string | null;
};

type TopicRow = {
  id: string;
  domain_id: string;
  title: string;
  status: string;
  current_round_index: number;
};

type TopicSummaryRow = {
  participant_count: number;
  contribution_count: number;
};

type ClaimCountRow = {
  count: number;
};

type ScoreBucketRow = {
  bucket_index: number;
  round_kind: string;
  count: number;
};

type BucketDetailRow = {
  contribution_id: string;
  being_id: string;
  being_handle: string;
  round_id: string;
  round_kind: string;
  final_score: number | null;
  excerpt: string | null;
  substance_score: number | null;
  relevance: number | null;
  novelty: number | null;
  reframe: number | null;
  role_bonus: number | null;
};

type DimensionAverageRow = {
  substance_score: number | null;
  relevance: number | null;
  novelty: number | null;
  reframe: number | null;
  role_bonus: number | null;
};

type ParticipationFunnelRow = {
  round_id: string;
  round_index: number;
  round_kind: string;
  participant_count: number;
  contribution_count: number;
};

type RollupDateBoundsRow = {
  min_date: string | null;
  max_date: string | null;
};

type VoteReliabilityRow = {
  being_id: string;
  handle: string;
  display_name: string;
  trust_tier: "unverified" | "supervised" | "verified" | "established" | "trusted";
  reliability: number | null;
  votes_count: number | null;
};

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toCount(value: unknown) {
  return Number(value ?? 0);
}

function buildOverviewWindow(
  rows: PlatformDailyRollupRow[],
  query: AnalyticsOverviewQuery,
  now: Date,
) {
  const fallbackDate = isoDate(now);
  return {
    from: query.from ?? rows[0]?.rollup_date ?? fallbackDate,
    to: query.to ?? rows.at(-1)?.rollup_date ?? fallbackDate,
  };
}

function clampScore(value: unknown) {
  return Math.max(0, Math.min(100, Number(value ?? 0)));
}

function bucketBounds(bucketIndex: number) {
  return {
    minScore: bucketIndex * 10,
    maxScore: bucketIndex === 9 ? 100 : (bucketIndex + 1) * 10,
  };
}

function bucketIndexForScore(value: unknown) {
  const score = clampScore(value);
  return score >= 100 ? 9 : Math.floor(score / 10);
}

function emptyRoundCounts() {
  return {
    propose: 0,
    critique: 0,
    refine: 0,
    synthesize: 0,
  };
}

function buildScoreDistribution(rows: ScoreBucketRow[]): AnalyticsTopicScoreBucket[] {
  const counts = new Map<number, ReturnType<typeof emptyRoundCounts>>();
  for (const row of rows) {
    const bucketIndex = toCount(row.bucket_index);
    const roundKind = row.round_kind as keyof ReturnType<typeof emptyRoundCounts>;
    const entry = counts.get(bucketIndex) ?? emptyRoundCounts();
    if (roundKind in entry) {
      entry[roundKind] = toCount(row.count);
      counts.set(bucketIndex, entry);
    }
  }

  return Array.from({ length: 10 }, (_, bucketIndex) => {
    const roundCounts = counts.get(bucketIndex) ?? emptyRoundCounts();
    const { minScore, maxScore } = bucketBounds(bucketIndex);
    return {
      minScore,
      maxScore,
      totalCount: Object.values(roundCounts).reduce((sum, count) => sum + count, 0),
      roundCounts,
    };
  });
}

function toDimensionBreakdown(row?: DimensionAverageRow | BucketDetailRow | null): AnalyticsTopicContributionDimensions {
  return {
    substance: Number(row?.substance_score ?? 0),
    relevance: Number(row?.relevance ?? 0),
    novelty: Number(row?.novelty ?? 0),
    reframe: Number(row?.reframe ?? 0),
    roleBonus: Number(row?.role_bonus ?? 0),
  };
}

function buildExcerpt(value: string | null) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length <= 160) {
    return trimmed;
  }
  return `${trimmed.slice(0, 157).trimEnd()}...`;
}

function buildBucketDetails(rows: BucketDetailRow[]): AnalyticsTopicBucketDetail[] {
  const grouped = new Map<string, AnalyticsTopicBucketDetail>();
  for (const row of rows) {
    const bucketIndex = bucketIndexForScore(row.final_score);
    const { minScore, maxScore } = bucketBounds(bucketIndex);
    const roundKind = row.round_kind as AnalyticsTopicBucketDetail["roundKind"];
    const key = `${minScore}:${maxScore}:${roundKind}`;
    const entry = grouped.get(key) ?? {
      minScore,
      maxScore,
      roundKind,
      contributions: [],
    };
    entry.contributions.push({
      contributionId: row.contribution_id,
      beingId: row.being_id,
      beingHandle: row.being_handle,
      roundId: row.round_id,
      roundKind,
      finalScore: clampScore(row.final_score),
      excerpt: buildExcerpt(row.excerpt),
      dimensions: toDimensionBreakdown(row),
    });
    grouped.set(key, entry);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.minScore !== right.minScore) {
      return left.minScore - right.minScore;
    }
    return left.roundKind.localeCompare(right.roundKind);
  });
}

function normalizeReliabilityScore(value: unknown) {
  return clampScore(Number(value ?? 0) * 10);
}

function buildVoteReliabilityHistogram(rows: VoteReliabilityRow[]) {
  const histogram = Array.from({ length: 10 }, (_, bucketIndex) => ({
    ...bucketBounds(bucketIndex),
    totalCount: 0,
    trustTierCounts: {
      unverified: 0,
      supervised: 0,
      verified: 0,
      established: 0,
      trusted: 0,
    },
  }));

  for (const row of rows) {
    const bucketIndex = bucketIndexForScore(normalizeReliabilityScore(row.reliability));
    const bucket = histogram[bucketIndex];
    if (!bucket) {
      continue;
    }
    bucket.totalCount += 1;
    bucket.trustTierCounts[row.trust_tier] += 1;
  }

  return histogram;
}

function nextIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return isoDate(date);
}

function* eachIsoDate(from: string, to: string) {
  let current = from;
  while (current <= to) {
    yield current;
    current = nextIsoDate(current);
  }
}

async function computePlatformRollupCounts(env: ApiEnv, rollupDate: string) {
  const nextDate = nextIsoDate(rollupDate);
  const [topicsCreated, contributionsCreated, verdictsCreated, activeTopics, activeBeings, activeAgents] = await Promise.all([
    firstRow<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM topics WHERE substr(created_at, 1, 10) = ?`,
      rollupDate,
    ),
    firstRow<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM contributions WHERE substr(created_at, 1, 10) = ?`,
      rollupDate,
    ),
    firstRow<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM verdicts WHERE substr(created_at, 1, 10) = ?`,
      rollupDate,
    ),
    firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(*) AS count
        FROM topics
        WHERE created_at < ?
          AND (closed_at IS NULL OR closed_at >= ?)
      `,
      nextDate,
      rollupDate,
    ),
    firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(DISTINCT tm.being_id) AS count
        FROM topic_members tm
        INNER JOIN topics t ON t.id = tm.topic_id
        INNER JOIN beings b ON b.id = tm.being_id
        WHERE tm.status = 'active'
          AND b.status = 'active'
          AND tm.joined_at < ?
          AND t.created_at < ?
          AND (t.closed_at IS NULL OR t.closed_at >= ?)
      `,
      nextDate,
      nextDate,
      rollupDate,
    ),
    firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(DISTINCT a.id) AS count
        FROM topic_members tm
        INNER JOIN topics t ON t.id = tm.topic_id
        INNER JOIN beings b ON b.id = tm.being_id
        INNER JOIN agents a ON a.id = b.agent_id
        WHERE tm.status = 'active'
          AND b.status = 'active'
          AND a.status = 'active'
          AND tm.joined_at < ?
          AND t.created_at < ?
          AND (t.closed_at IS NULL OR t.closed_at >= ?)
      `,
      nextDate,
      nextDate,
      rollupDate,
    ),
  ]);

  return {
    topicsCreatedCount: toCount(topicsCreated?.count ?? 0),
    contributionsCreatedCount: toCount(contributionsCreated?.count ?? 0),
    verdictsCreatedCount: toCount(verdictsCreated?.count ?? 0),
    activeTopics: toCount(activeTopics?.count ?? 0),
    activeBeings: toCount(activeBeings?.count ?? 0),
    activeAgents: toCount(activeAgents?.count ?? 0),
  };
}

async function writePlatformDailyRollup(
  env: ApiEnv,
  rollupDate: string,
  overwrite: boolean,
): Promise<number> {
  if (!overwrite) {
    const existing = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM platform_daily_rollups WHERE rollup_date = ?`,
      rollupDate,
    );
    if (existing) {
      return 0;
    }
  }

  const counts = await computePlatformRollupCounts(env, rollupDate);
  await env.DB.prepare(
    `
      INSERT INTO platform_daily_rollups (
        id,
        rollup_date,
        topics_created_count,
        contributions_created_count,
        verdicts_created_count,
        active_topics,
        active_beings,
        active_agents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rollup_date) DO UPDATE SET
        topics_created_count = excluded.topics_created_count,
        contributions_created_count = excluded.contributions_created_count,
        verdicts_created_count = excluded.verdicts_created_count,
        active_topics = excluded.active_topics,
        active_beings = excluded.active_beings,
        active_agents = excluded.active_agents
    `,
  )
    .bind(
      createId("pdr"),
      rollupDate,
      counts.topicsCreatedCount,
      counts.contributionsCreatedCount,
      counts.verdictsCreatedCount,
      counts.activeTopics,
      counts.activeBeings,
      counts.activeAgents,
    )
    .run();

  return 1;
}

async function resolvePlatformBackfillBounds(
  env: ApiEnv,
  now: Date,
): Promise<{ from: string; to: string }> {
  const bounds = await firstRow<RollupDateBoundsRow>(
    env.DB,
    `
      SELECT MIN(day) AS min_date, MAX(day) AS max_date
      FROM (
        SELECT substr(created_at, 1, 10) AS day FROM topics
        UNION ALL
        SELECT substr(created_at, 1, 10) AS day FROM contributions
        UNION ALL
        SELECT substr(created_at, 1, 10) AS day FROM verdicts
        UNION ALL
        SELECT substr(joined_at, 1, 10) AS day FROM topic_members
      )
    `,
  );
  const fallbackDate = isoDate(now);
  return {
    from: bounds?.min_date ?? fallbackDate,
    to: bounds?.max_date ?? fallbackDate,
  };
}

export async function getAnalyticsOverview(
  env: ApiEnv,
  query: AnalyticsOverviewQuery,
  now = new Date(),
): Promise<AnalyticsOverviewResponse> {
  const baseline = query.from
    ? await firstRow<{
        topics_created_count: number;
        contributions_created_count: number;
        verdicts_created_count: number;
      }>(
        env.DB,
        `
          SELECT
            COALESCE(SUM(topics_created_count), 0) AS topics_created_count,
            COALESCE(SUM(contributions_created_count), 0) AS contributions_created_count,
            COALESCE(SUM(verdicts_created_count), 0) AS verdicts_created_count
          FROM platform_daily_rollups
          WHERE rollup_date < ?
        `,
        query.from,
      )
    : null;
  const rows = await allRows<PlatformDailyRollupRow>(
    env.DB,
    `
      SELECT
        rollup_date,
        topics_created_count,
        contributions_created_count,
        verdicts_created_count,
        active_topics,
        active_beings,
        active_agents
      FROM platform_daily_rollups
      WHERE (? IS NULL OR rollup_date >= ?)
        AND (? IS NULL OR rollup_date <= ?)
      ORDER BY rollup_date ASC
    `,
    query.from ?? null,
    query.from ?? null,
    query.to ?? null,
    query.to ?? null,
  );

  let cumulativeTopics = toCount(baseline?.topics_created_count);
  let cumulativeContributions = toCount(baseline?.contributions_created_count);
  let cumulativeVerdicts = toCount(baseline?.verdicts_created_count);
  const series: AnalyticsOverviewSeriesEntry[] = rows.map((row) => {
    cumulativeTopics += toCount(row.topics_created_count);
    cumulativeContributions += toCount(row.contributions_created_count);
    cumulativeVerdicts += toCount(row.verdicts_created_count);
    return {
      rollupDate: row.rollup_date,
      topicsCreatedCount: toCount(row.topics_created_count),
      contributionsCreatedCount: toCount(row.contributions_created_count),
      verdictsCreatedCount: toCount(row.verdicts_created_count),
      cumulativeTopics,
      cumulativeContributions,
      cumulativeVerdicts,
      activeTopics: toCount(row.active_topics),
      activeBeings: toCount(row.active_beings),
      activeAgents: toCount(row.active_agents),
    };
  });

  const latest = series.at(-1);
  return {
    generatedAt: now.toISOString(),
    window: buildOverviewWindow(rows, query, now),
    totals: {
      totalTopics: latest?.cumulativeTopics ?? 0,
      totalContributions: latest?.cumulativeContributions ?? 0,
      totalVerdicts: latest?.cumulativeVerdicts ?? 0,
      activeBeings: latest?.activeBeings ?? 0,
      activeAgents: latest?.activeAgents ?? 0,
    },
    series,
  };
}

export async function getAnalyticsDomains(
  env: ApiEnv,
  query: AnalyticsDomainsQuery,
  now = new Date(),
): Promise<AnalyticsDomainsResponse> {
  const resolvedRollupDate = query.rollupDate ?? (
    await firstRow<{ rollup_date: string }>(
      env.DB,
      `SELECT rollup_date FROM domain_daily_rollups ORDER BY rollup_date DESC LIMIT 1`,
    )
  )?.rollup_date ?? isoDate(now);

  const rows = await allRows<DomainDailyRollupRow>(
    env.DB,
    `
      SELECT
        ddr.domain_id,
        d.slug AS domain_slug,
        d.name AS domain_name,
        ddr.active_topics,
        ddr.active_beings,
        ddr.contribution_count,
        ddr.verdict_count
      FROM domain_daily_rollups ddr
      INNER JOIN domains d ON d.id = ddr.domain_id
      WHERE ddr.rollup_date = ?
      ORDER BY d.name ASC, d.id ASC
    `,
    resolvedRollupDate,
  );

  const domains: AnalyticsDomainActivity[] = rows.map((row) => ({
    domainId: row.domain_id,
    domainSlug: row.domain_slug,
    domainName: row.domain_name,
    activeTopics: toCount(row.active_topics),
    activeBeings: toCount(row.active_beings),
    contributionCount: toCount(row.contribution_count),
    verdictCount: toCount(row.verdict_count),
  }));

  return {
    rollupDate: resolvedRollupDate,
    domains,
  };
}

export async function getAnalyticsLeaderboard(
  env: ApiEnv,
  params: AnalyticsLeaderboardParams,
): Promise<AnalyticsLeaderboardResponse> {
  const domain = await firstRow<DomainRow>(
    env.DB,
    `SELECT id, slug, name FROM domains WHERE id = ?`,
    params.domainId,
  );
  if (!domain) {
    notFound("The requested domain was not found.");
  }

  const rows = await allRows<LeaderboardRow>(
    env.DB,
    `
      SELECT
        dr.being_id,
        b.handle,
        b.display_name,
        dr.decayed_score,
        dr.average_score,
        dr.consistency_score,
        dr.sample_count,
        dr.last_active_at
      FROM domain_reputation dr
      INNER JOIN beings b ON b.id = dr.being_id
      WHERE dr.domain_id = ?
      ORDER BY
        dr.decayed_score DESC,
        dr.average_score DESC,
        dr.consistency_score DESC,
        dr.sample_count DESC,
        b.handle ASC,
        dr.being_id ASC
    `,
    domain.id,
  );

  const leaderboard: AnalyticsLeaderboardEntry[] = rows.map((row) => ({
    beingId: row.being_id,
    handle: row.handle,
    displayName: row.display_name,
    decayedScore: Number(row.decayed_score ?? 0),
    averageScore: Number(row.average_score ?? 0),
    consistencyScore: Number(row.consistency_score ?? 0),
    sampleCount: toCount(row.sample_count),
    lastActiveAt: row.last_active_at,
  }));

  return {
    domain: {
      id: domain.id,
      slug: domain.slug,
      name: domain.name,
    },
    leaderboard,
  };
}

export async function getAnalyticsTopic(
  env: ApiEnv,
  topicId: string,
): Promise<AnalyticsTopicResponse> {
  const topic = await firstRow<TopicRow>(
    env.DB,
    `
      SELECT id, domain_id, title, status, current_round_index
      FROM topics
      WHERE id = ?
    `,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }

  const [summary, claimCountRow, scoreBucketRows, bucketDetailRows, dimensionAverageRow, participationFunnelRows] = await Promise.all([
    firstRow<TopicSummaryRow>(
      env.DB,
      `
        SELECT
          COUNT(DISTINCT being_id) AS participant_count,
          COUNT(*) AS contribution_count
        FROM contributions
        WHERE topic_id = ?
      `,
      topicId,
    ),
    firstRow<ClaimCountRow>(
      env.DB,
      `SELECT COUNT(*) AS count FROM claims WHERE topic_id = ?`,
      topicId,
    ),
    allRows<ScoreBucketRow>(
      env.DB,
      `
        SELECT
          CASE
            WHEN COALESCE(cs.final_score, 0) >= 100 THEN 9
            WHEN COALESCE(cs.final_score, 0) < 0 THEN 0
            ELSE CAST(COALESCE(cs.final_score, 0) / 10 AS INTEGER)
          END AS bucket_index,
          r.round_kind,
          COUNT(*) AS count
        FROM contributions c
        LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
        INNER JOIN rounds r ON r.id = c.round_id
        WHERE c.topic_id = ?
          AND r.round_kind IN ('propose', 'critique', 'refine', 'synthesize')
        GROUP BY bucket_index
          , r.round_kind
        ORDER BY bucket_index ASC
          , r.round_kind ASC
      `,
      topicId,
    ),
    allRows<BucketDetailRow>(
      env.DB,
      `
        SELECT
          c.id AS contribution_id,
          c.being_id,
          b.handle AS being_handle,
          c.round_id,
          r.round_kind,
          cs.final_score,
          COALESCE(c.body_clean, c.body) AS excerpt,
          cs.substance_score,
          cs.relevance,
          cs.novelty,
          cs.reframe,
          cs.role_bonus
        FROM contributions c
        INNER JOIN beings b ON b.id = c.being_id
        INNER JOIN rounds r ON r.id = c.round_id
        LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
        WHERE c.topic_id = ?
          AND r.round_kind IN ('propose', 'critique', 'refine', 'synthesize')
        ORDER BY
          CASE WHEN cs.final_score IS NULL THEN 1 ELSE 0 END ASC,
          cs.final_score DESC,
          c.submitted_at ASC,
          c.id ASC
      `,
      topicId,
    ),
    firstRow<DimensionAverageRow>(
      env.DB,
      `
        SELECT
          COALESCE(AVG(cs.substance_score), 0) AS substance_score,
          COALESCE(AVG(cs.relevance), 0) AS relevance,
          COALESCE(AVG(cs.novelty), 0) AS novelty,
          COALESCE(AVG(cs.reframe), 0) AS reframe,
          COALESCE(AVG(cs.role_bonus), 0) AS role_bonus
        FROM contributions c
        INNER JOIN rounds r ON r.id = c.round_id
        LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
        WHERE c.topic_id = ?
          AND r.round_kind IN ('propose', 'critique', 'refine', 'synthesize')
      `,
      topicId,
    ),
    allRows<ParticipationFunnelRow>(
      env.DB,
      `
        SELECT
          r.id AS round_id,
          r.sequence_index AS round_index,
          r.round_kind,
          COUNT(DISTINCT c.being_id) AS participant_count,
          COUNT(c.id) AS contribution_count
        FROM rounds r
        LEFT JOIN contributions c ON c.round_id = r.id
        WHERE r.topic_id = ?
        GROUP BY r.id, r.sequence_index, r.round_kind
        ORDER BY r.sequence_index ASC, r.id ASC
      `,
      topicId,
    ),
  ]);

  const contributionCount = toCount(summary?.contribution_count ?? 0);
  const claimCount = toCount(claimCountRow?.count ?? 0);
  const participationFunnel: AnalyticsTopicFunnelEntry[] = participationFunnelRows.map((row) => ({
    roundId: row.round_id,
    roundIndex: toCount(row.round_index),
    roundKind: row.round_kind as AnalyticsTopicFunnelEntry["roundKind"],
    participantCount: toCount(row.participant_count),
    contributionCount: toCount(row.contribution_count),
  }));

  return {
    topic: {
      id: topic.id,
      domainId: topic.domain_id,
      title: topic.title,
      status: topic.status as AnalyticsTopicResponse["topic"]["status"],
      currentRoundIndex: toCount(topic.current_round_index),
    },
    summary: {
      participantCount: toCount(summary?.participant_count ?? 0),
      contributionCount,
      claimCount,
      claimDensity: contributionCount > 0 ? Number((claimCount / contributionCount).toFixed(4)) : 0,
    },
    scoreDistribution: buildScoreDistribution(scoreBucketRows),
    bucketDetails: buildBucketDetails(bucketDetailRows),
    averageDimensionBreakdown: toDimensionBreakdown(dimensionAverageRow),
    participationFunnel,
  };
}

export async function getAnalyticsVoteReliability(
  env: ApiEnv,
  query: AnalyticsVoteReliabilityQuery,
): Promise<AnalyticsVoteReliabilityResponse> {
  const rows = await allRows<VoteReliabilityRow>(
    env.DB,
    `
      SELECT
        vr.being_id,
        b.handle,
        b.display_name,
        b.trust_tier,
        vr.reliability,
        vr.votes_count
      FROM vote_reliability vr
      INNER JOIN beings b ON b.id = vr.being_id
      WHERE vr.votes_count >= ?
        AND b.status = 'active'
      ORDER BY vr.votes_count DESC, b.handle ASC, vr.being_id ASC
    `,
    query.minVotes,
  );

  return {
    minVotes: query.minVotes,
    histogram: buildVoteReliabilityHistogram(rows),
    scatter: rows.map((row) => ({
      beingId: row.being_id,
      handle: row.handle,
      displayName: row.display_name,
      reliability: normalizeReliabilityScore(row.reliability),
      votesCount: toCount(row.votes_count),
      trustTier: row.trust_tier,
    })),
    summary: {
      qualifyingBeings: rows.length,
      maxVotesCount: rows.reduce((max, row) => Math.max(max, toCount(row.votes_count)), 0),
    },
  };
}

export async function rollupPlatformDailyCounts(
  env: ApiEnv,
  now = new Date(),
): Promise<number> {
  return writePlatformDailyRollup(env, isoDate(now), true);
}

export async function backfillPlatformDailyRollups(
  env: ApiEnv,
  input: AnalyticsBackfillRequest,
  now = new Date(),
): Promise<AnalyticsBackfillResponse> {
  const bounds = await resolvePlatformBackfillBounds(env, now);
  const from = input.from ?? bounds.from;
  const to = input.to ?? bounds.to;
  const overwrite = input.overwrite ?? false;
  if (from > to) {
    badRequest("invalid_date_range", "The backfill date range is invalid.");
  }

  let daysProcessed = 0;
  let rowsWritten = 0;
  for (const rollupDate of eachIsoDate(from, to)) {
    daysProcessed += 1;
    rowsWritten += await writePlatformDailyRollup(env, rollupDate, overwrite);
  }

  return {
    from,
    to,
    daysProcessed,
    rowsWritten,
  };
}
