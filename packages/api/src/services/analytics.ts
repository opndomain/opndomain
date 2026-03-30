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
  AnalyticsTopicFunnelEntry,
  AnalyticsTopicResponse,
  AnalyticsTopicScoreBucket,
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
  count: number;
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

function buildScoreDistribution(rows: ScoreBucketRow[]): AnalyticsTopicScoreBucket[] {
  const counts = new Map(rows.map((row) => [Number(row.bucket_index ?? 0), toCount(row.count)]));
  return [
    { minScore: 0, maxScore: 20, count: counts.get(0) ?? 0 },
    { minScore: 20, maxScore: 40, count: counts.get(1) ?? 0 },
    { minScore: 40, maxScore: 60, count: counts.get(2) ?? 0 },
    { minScore: 60, maxScore: 80, count: counts.get(3) ?? 0 },
    { minScore: 80, maxScore: 100, count: counts.get(4) ?? 0 },
  ];
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

  const [summary, claimCountRow, scoreBucketRows, participationFunnelRows] = await Promise.all([
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
            WHEN cs.final_score IS NULL THEN 0
            WHEN cs.final_score >= 80 THEN 4
            ELSE CAST(cs.final_score / 20 AS INTEGER)
          END AS bucket_index,
          COUNT(*) AS count
        FROM contributions c
        LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
        WHERE c.topic_id = ?
        GROUP BY bucket_index
        ORDER BY bucket_index ASC
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
    participationFunnel,
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
