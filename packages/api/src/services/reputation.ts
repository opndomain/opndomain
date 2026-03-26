import {
  DOMAIN_REPUTATION_CONSISTENCY_WEIGHT,
  DOMAIN_REPUTATION_MIN_CONTRIBUTIONS,
  DOMAIN_REPUTATION_SCORE_WEIGHT,
  REPUTATION_DECAY_GRACE_DAYS,
  REPUTATION_DECAY_PER_DAY,
  REPUTATION_FLOOR,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";

type DomainReputationRow = {
  id: string;
  average_score: number;
  sample_count: number;
  m2: number;
  consistency_score: number;
  decayed_score: number;
  last_active_at: string | null;
};

type ReputationSampleRow = {
  final_score: number | null;
  closed_at: string | null;
};

type RollupDomainRow = {
  id: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeAggregate(scores: number[]) {
  let averageScore = 0;
  let m2 = 0;
  let sampleCount = 0;
  for (const rawScore of scores) {
    const sample = clamp(rawScore, 0, 100);
    sampleCount += 1;
    const delta = sample - averageScore;
    averageScore += delta / sampleCount;
    const delta2 = sample - averageScore;
    m2 += delta * delta2;
  }
  const stddev = sampleCount > 1 ? Math.sqrt(m2 / (sampleCount - 1)) : 0;
  const consistencyScore = Math.max(0, 100 - 2 * stddev);
  const decayedScore =
    averageScore * DOMAIN_REPUTATION_SCORE_WEIGHT +
    consistencyScore * DOMAIN_REPUTATION_CONSISTENCY_WEIGHT;
  return { averageScore, sampleCount, m2, consistencyScore, decayedScore };
}

function diffDays(fromIso: string, to: Date): number {
  const fromMs = new Date(fromIso).getTime();
  if (!Number.isFinite(fromMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((to.getTime() - fromMs) / 86_400_000));
}

export async function updateDomainReputation(
  env: ApiEnv,
  domainId: string,
  beingId: string,
  score: number,
  now = new Date(),
): Promise<DomainReputationRow> {
  const existing = await firstRow<DomainReputationRow>(
    env.DB,
    `
      SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
      FROM domain_reputation
      WHERE domain_id = ? AND being_id = ?
    `,
    domainId,
    beingId,
  );

  const sample = clamp(score, 0, 100);
  const sampleCount = Number(existing?.sample_count ?? 0) + 1;
  const currentAverage = Number(existing?.average_score ?? 0);
  const currentM2 = Number(existing?.m2 ?? 0);
  const delta = sample - currentAverage;
  const averageScore = currentAverage + delta / sampleCount;
  const delta2 = sample - averageScore;
  const m2 = currentM2 + delta * delta2;
  const stddev = sampleCount > 1 ? Math.sqrt(m2 / (sampleCount - 1)) : 0;
  const consistencyScore = Math.max(0, 100 - 2 * stddev);
  const decayedScore =
    averageScore * DOMAIN_REPUTATION_SCORE_WEIGHT +
    consistencyScore * DOMAIN_REPUTATION_CONSISTENCY_WEIGHT;
  const activeAt = now.toISOString();

  const id = existing?.id ?? createId("drp");
  await env.DB
    .prepare(
      `
        INSERT INTO domain_reputation (
          id, domain_id, being_id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(domain_id, being_id) DO UPDATE SET
          average_score = excluded.average_score,
          sample_count = excluded.sample_count,
          m2 = excluded.m2,
          consistency_score = excluded.consistency_score,
          decayed_score = excluded.decayed_score,
          last_active_at = excluded.last_active_at
      `,
    )
    .bind(id, domainId, beingId, averageScore, sampleCount, m2, consistencyScore, decayedScore, activeAt)
    .run();

  return {
    id,
    average_score: averageScore,
    sample_count: sampleCount,
    m2,
    consistency_score: consistencyScore,
    decayed_score: decayedScore,
    last_active_at: activeAt,
  };
}

export async function rebuildDomainReputation(
  env: ApiEnv,
  domainId: string,
  beingId: string,
  now = new Date(),
): Promise<DomainReputationRow> {
  const rows = await allRows<ReputationSampleRow>(
    env.DB,
    `
      SELECT cs.final_score, t.closed_at
      FROM contributions c
      INNER JOIN contribution_scores cs ON cs.contribution_id = c.id
      INNER JOIN topics t ON t.id = c.topic_id
      WHERE c.being_id = ?
        AND t.domain_id = ?
        AND t.status = 'closed'
      ORDER BY t.closed_at ASC, c.submitted_at ASC, c.created_at ASC
    `,
    beingId,
    domainId,
  );
  const aggregate = computeAggregate(
    rows.map((row) => Number(row.final_score ?? 0)).filter((score) => Number.isFinite(score)),
  );
  const existing = await firstRow<DomainReputationRow>(
    env.DB,
    `
      SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
      FROM domain_reputation
      WHERE domain_id = ? AND being_id = ?
    `,
    domainId,
    beingId,
  );
  const id = existing?.id ?? createId("drp");
  const activeAt = rows.length > 0 ? now.toISOString() : existing?.last_active_at ?? now.toISOString();
  await env.DB
    .prepare(
      `
        INSERT INTO domain_reputation (
          id, domain_id, being_id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(domain_id, being_id) DO UPDATE SET
          average_score = excluded.average_score,
          sample_count = excluded.sample_count,
          m2 = excluded.m2,
          consistency_score = excluded.consistency_score,
          decayed_score = excluded.decayed_score,
          last_active_at = excluded.last_active_at
      `,
    )
    .bind(
      id,
      domainId,
      beingId,
      aggregate.averageScore,
      aggregate.sampleCount,
      aggregate.m2,
      aggregate.consistencyScore,
      aggregate.decayedScore,
      activeAt,
    )
    .run();
  await decayStaleReputations(env, now);
  return {
    id,
    average_score: aggregate.averageScore,
    sample_count: aggregate.sampleCount,
    m2: aggregate.m2,
    consistency_score: aggregate.consistencyScore,
    decayed_score: aggregate.decayedScore,
    last_active_at: activeAt,
  };
}

export async function getDomainReputationFactor(
  env: ApiEnv,
  domainId: string,
  beingId: string,
): Promise<number> {
  const row = await firstRow<DomainReputationRow>(
    env.DB,
    `
      SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
      FROM domain_reputation
      WHERE domain_id = ? AND being_id = ?
    `,
    domainId,
    beingId,
  );
  const sampleCount = Number(row?.sample_count ?? 0);
  if (!row || sampleCount < DOMAIN_REPUTATION_MIN_CONTRIBUTIONS) {
    return 0;
  }
  return clamp(Number(row.decayed_score ?? 0) / 100, 0, 1);
}

export async function decayStaleReputations(env: ApiEnv, now = new Date()): Promise<number> {
  const rows = await allRows<DomainReputationRow>(
    env.DB,
    `
      SELECT id, average_score, sample_count, m2, consistency_score, decayed_score, last_active_at
      FROM domain_reputation
    `,
  );

  let updated = 0;
  for (const row of rows) {
    if (!row.last_active_at) {
      continue;
    }
    const inactiveDays = diffDays(row.last_active_at, now);
    const overdueDays = inactiveDays - REPUTATION_DECAY_GRACE_DAYS;
    if (overdueDays <= 0) {
      continue;
    }
    const baseScore =
      Number(row.average_score ?? 0) * DOMAIN_REPUTATION_SCORE_WEIGHT +
      Number(row.consistency_score ?? 0) * DOMAIN_REPUTATION_CONSISTENCY_WEIGHT;
    const nextScore = Math.max(REPUTATION_FLOOR, baseScore - overdueDays * REPUTATION_DECAY_PER_DAY);
    await env.DB.prepare(`UPDATE domain_reputation SET decayed_score = ? WHERE id = ?`).bind(nextScore, row.id).run();
    updated += 1;
  }

  return updated;
}

export async function rollupDomainDailyCounts(env: ApiEnv, now = new Date()): Promise<number> {
  const rollupDate = now.toISOString().slice(0, 10);
  const domains = await allRows<RollupDomainRow>(env.DB, `SELECT id FROM domains`);
  for (const domain of domains) {
    const activeBeings = await firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(DISTINCT tm.being_id) AS count
        FROM topic_members tm
        INNER JOIN topics t ON t.id = tm.topic_id
        WHERE t.domain_id = ? AND tm.status = 'active'
      `,
      domain.id,
    );
    const activeTopics = await firstRow<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM topics WHERE domain_id = ? AND status IN ('open', 'countdown', 'started')`,
      domain.id,
    );
    const contributionCount = await firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(*) AS count
        FROM contributions c
        INNER JOIN topics t ON t.id = c.topic_id
        WHERE t.domain_id = ? AND substr(c.created_at, 1, 10) = ?
      `,
      domain.id,
      rollupDate,
    );
    const verdictCount = await firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(*) AS count
        FROM verdicts v
        INNER JOIN topics t ON t.id = v.topic_id
        WHERE t.domain_id = ? AND substr(v.created_at, 1, 10) = ?
      `,
      domain.id,
      rollupDate,
    );

    await env.DB
      .prepare(
        `
          INSERT INTO domain_daily_rollups (
            id, domain_id, rollup_date, active_beings, active_topics, contribution_count, verdict_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(domain_id, rollup_date) DO UPDATE SET
            active_beings = excluded.active_beings,
            active_topics = excluded.active_topics,
            contribution_count = excluded.contribution_count,
            verdict_count = excluded.verdict_count
        `,
      )
      .bind(
        createId("ddr"),
        domain.id,
        rollupDate,
        Number(activeBeings?.count ?? 0),
        Number(activeTopics?.count ?? 0),
        Number(contributionCount?.count ?? 0),
        Number(verdictCount?.count ?? 0),
      )
      .run();
  }

  return domains.length;
}
