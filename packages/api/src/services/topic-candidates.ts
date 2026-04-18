import {
  MAX_REFINEMENT_DEPTH,
  REFINEMENT_CANDIDATE_SOURCE,
  TOPIC_TEMPLATES,
  type BatchUpsertTopicCandidatesResponse,
  type TopicCandidate,
  type TopicCandidateCleanupResponse,
  type TopicCandidateDuplicate,
  type TopicCandidateDetail,
  type TopicIdeaComparableRecord,
  type TopicIdeaContextRecord,
  type TopicCandidateInventoryItem,
  type TopicCandidateQuery,
  type TopicCandidateSummary,
  type TrustTier,
  findTopicIdeaDuplicate,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";
import { recordLifecycleMutation } from "./lifecycle.js";
import { createSystemTopic } from "./topics.js";
import { archiveRefinementFailure, linkRefinementChild } from "./vertical-refinement.js";

type IdeaRecordExclusions = {
  ancestorTopicIds?: Set<string>;
  ancestorCandidateSourceIds?: Set<string>;
};

type TopicCandidateRow = {
  id: string;
  source: string;
  source_id: string | null;
  source_url: string | null;
  domain_id: string;
  title: string;
  prompt: string;
  template_id: string;
  topic_format: string;
  cadence_family: string;
  cadence_override_minutes: number | null;
  min_trust_tier: TrustTier;
  status: "approved" | "consumed" | "failed";
  priority_score: number;
  published_at: string | null;
  promoted_topic_id: string | null;
  promotion_error: string | null;
  created_at: string;
  updated_at: string;
};

type DomainInventoryGapRow = {
  id: string;
};

type PromoteResult = {
  cron: string;
  executedAt: string;
  mutatedTopicIds: string[];
};

function mapCandidateSummary(row: TopicCandidateRow): TopicCandidateSummary {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    domainId: row.domain_id,
    title: row.title,
    topicFormat: row.topic_format,
    cadenceFamily: row.cadence_family,
    cadenceOverrideMinutes: row.cadence_override_minutes === null ? null : Number(row.cadence_override_minutes),
    minTrustTier: row.min_trust_tier,
    status: row.status,
    priorityScore: Number(row.priority_score ?? 0),
    publishedAt: row.published_at,
    promotedTopicId: row.promoted_topic_id,
    promotionError: row.promotion_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCandidateDetail(row: TopicCandidateRow): TopicCandidateDetail {
  return {
    ...mapCandidateSummary(row),
    prompt: row.prompt,
    templateId: row.template_id,
  };
}

async function findDuplicateCandidate(env: ApiEnv, candidate: TopicCandidate) {
  if (candidate.sourceId) {
    return firstRow<TopicCandidateRow>(
      env.DB,
      `
        SELECT *
        FROM topic_candidates
        WHERE source = ? AND source_id = ?
        LIMIT 1
      `,
      candidate.source,
      candidate.sourceId,
    );
  }

  return firstRow<TopicCandidateRow>(
    env.DB,
    `
      SELECT *
      FROM topic_candidates
      WHERE source = ? AND source_id IS NULL AND source_url = ?
      LIMIT 1
    `,
    candidate.source,
    candidate.sourceUrl ?? null,
  );
}

function toDuplicateRecord(row: TopicCandidateRow) {
  return {
    kind: "source_identity_duplicate" as const,
    existingRecordKind: "candidate" as const,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    domainId: row.domain_id,
    existingCandidateId: row.id,
    reason: "source_identity_match" as const,
    matchedTitle: row.title,
  };
}

function toIdeaDuplicateRecord(match: NonNullable<ReturnType<typeof findTopicIdeaDuplicate>>, domainId: string): TopicCandidateDuplicate {
  if (match.existingRecordKind === "topic") {
    return {
      kind: "idea_duplicate_topic",
      existingRecordKind: "topic",
      domainId,
      existingTopicId: match.existingId,
      reason: match.reason,
      matchedTitle: match.existingTitle,
    };
  }

  return {
    kind: "idea_duplicate_candidate",
    existingRecordKind: "candidate",
    domainId,
    existingCandidateId: match.existingId,
    reason: match.reason,
    matchedTitle: match.existingTitle,
  };
}

async function listDomainIdeaRecords(
  env: ApiEnv,
  domainId: string,
  exclusions: IdeaRecordExclusions = {},
): Promise<TopicIdeaComparableRecord[]> {
  const [topicRows, candidateRows] = await Promise.all([
    allRows<{ id: string; domain_id: string; status: string; title: string; prompt: string }>(
      env.DB,
      `
        SELECT id, domain_id, status, title, prompt
        FROM topics
        WHERE domain_id = ?
      `,
      domainId,
    ),
    allRows<{ id: string; domain_id: string; status: string; title: string; prompt: string; source: string; source_id: string | null }>(
      env.DB,
      `
        SELECT id, domain_id, status, title, prompt, source, source_id
        FROM topic_candidates
        WHERE domain_id = ?
          AND status IN ('approved', 'consumed')
      `,
      domainId,
    ),
  ]);

  const ancestorTopicIds = exclusions.ancestorTopicIds ?? new Set<string>();
  const ancestorCandidateSourceIds = exclusions.ancestorCandidateSourceIds ?? new Set<string>();

  return [
    ...topicRows.map((row) => ({
      recordKind: "topic" as const,
      id: row.id,
      domainId: row.domain_id,
      status: row.status,
      title: row.title,
      prompt: row.prompt,
    })).filter((row) => !ancestorTopicIds.has(row.id)),
    ...candidateRows
      .filter((row) => row.source !== REFINEMENT_CANDIDATE_SOURCE || !row.source_id || !ancestorCandidateSourceIds.has(row.source_id))
      .map((row) => ({
        recordKind: "candidate" as const,
        id: row.id,
        domainId: row.domain_id,
        status: row.status,
        title: row.title,
        prompt: row.prompt,
      })),
  ];
}

async function buildRefinementAncestorExclusions(env: ApiEnv, candidate: TopicCandidate): Promise<IdeaRecordExclusions> {
  const ancestorTopicIds = new Set<string>();
  const ancestorCandidateSourceIds = new Set<string>();

  if (candidate.source !== REFINEMENT_CANDIDATE_SOURCE || !candidate.sourceId) {
    return { ancestorTopicIds, ancestorCandidateSourceIds };
  }

  let cursor: string | null = candidate.sourceId;
  while (cursor && ancestorTopicIds.size < MAX_REFINEMENT_DEPTH + 1) {
    ancestorTopicIds.add(cursor);
    ancestorCandidateSourceIds.add(cursor);
    const parent: { parent_topic_id: string | null } | null = await firstRow<{ parent_topic_id: string | null }>(
      env.DB,
      "SELECT parent_topic_id FROM topics WHERE id = ?",
      cursor,
    );
    cursor = parent?.parent_topic_id ?? null;
  }

  return { ancestorTopicIds, ancestorCandidateSourceIds };
}

async function findIdeaDuplicate(
  env: ApiEnv,
  candidate: TopicCandidate,
  options?: { excludeCandidateId?: string },
) {
  const exclusions = await buildRefinementAncestorExclusions(env, candidate);
  const records = await listDomainIdeaRecords(env, candidate.domainId, exclusions);
  return findTopicIdeaDuplicate(candidate, records, { excludeRecordId: options?.excludeCandidateId });
}

function validatePromotableCandidate(row: TopicCandidateRow) {
  if (row.topic_format !== "scheduled_research" && row.topic_format !== "rolling_research") {
    badRequest("invalid_topic_candidate_format", "Candidate topicFormat must be scheduled_research or rolling_research.");
  }

  const template = TOPIC_TEMPLATES[row.template_id as keyof typeof TOPIC_TEMPLATES];
  if (!template) {
    badRequest("invalid_topic_candidate_template", "Candidate templateId is no longer valid.");
  }
  if (row.cadence_family !== template.cadenceFamily) {
    badRequest("invalid_topic_candidate_cadence_family", "Candidate cadenceFamily does not match the current template contract.");
  }

  const isRolling = row.topic_format === "rolling_research";

  return {
    domainId: row.domain_id,
    title: row.title,
    prompt: row.prompt,
    templateId: row.template_id as keyof typeof TOPIC_TEMPLATES,
    topicFormat: row.topic_format as "scheduled_research" | "rolling_research",
    cadenceFamily: row.cadence_family,
    cadenceOverrideMinutes: row.cadence_override_minutes ?? undefined,
    minTrustTier: row.min_trust_tier,
    ...(isRolling ? { minDistinctParticipants: 5, countdownSeconds: 60 } : {}),
  };
}

function formatPromotionError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "promotion_failed";
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Topic candidate promotion failed.";
  return `${code}: ${message}`.slice(0, 500);
}

async function consumeTopicCandidate(env: ApiEnv, candidateId: string, topicId: string) {
  await runStatement(
    env.DB.prepare(
      `
        UPDATE topic_candidates
        SET status = 'consumed', promoted_topic_id = ?, promotion_error = NULL
        WHERE id = ?
      `,
    ).bind(topicId, candidateId),
  );
}

async function failTopicCandidate(env: ApiEnv, candidateId: string, error: unknown) {
  await runStatement(
    env.DB.prepare(
      `
        UPDATE topic_candidates
        SET status = 'failed', promotion_error = ?
        WHERE id = ?
      `,
    ).bind(formatPromotionError(error), candidateId),
  );
}

export async function batchUpsertTopicCandidates(
  env: ApiEnv,
  candidates: TopicCandidate[],
): Promise<BatchUpsertTopicCandidatesResponse> {
  let createdCount = 0;
  let updatedCount = 0;
  const duplicates: BatchUpsertTopicCandidatesResponse["duplicates"] = [];

  for (const candidate of candidates) {
    const existing = await findDuplicateCandidate(env, candidate);
    if (!existing) {
      const ideaDuplicate = await findIdeaDuplicate(env, candidate);
      if (ideaDuplicate) {
        duplicates.push(toIdeaDuplicateRecord(ideaDuplicate, candidate.domainId));
        continue;
      }

      await runStatement(
        env.DB.prepare(
          `
            INSERT INTO topic_candidates (
              id, source, source_id, source_url, domain_id, title, prompt, template_id, topic_format,
              cadence_family, cadence_override_minutes, min_trust_tier, status, priority_score, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
          `,
        ).bind(
          createId("tcand"),
          candidate.source,
          candidate.sourceId ?? null,
          candidate.sourceUrl ?? null,
          candidate.domainId,
          candidate.title,
          candidate.prompt,
          candidate.templateId,
          candidate.topicFormat,
          candidate.cadenceFamily,
          candidate.cadenceOverrideMinutes ?? null,
          candidate.minTrustTier,
          candidate.priorityScore,
          candidate.publishedAt ?? null,
        ),
      );
      createdCount += 1;
      continue;
    }

    if (existing.status !== "approved") {
      duplicates.push(toDuplicateRecord(existing));
      continue;
    }

    const ideaDuplicate = await findIdeaDuplicate(env, candidate, { excludeCandidateId: existing.id });
    if (ideaDuplicate) {
      duplicates.push(toIdeaDuplicateRecord(ideaDuplicate, candidate.domainId));
      continue;
    }

    await runStatement(
      env.DB.prepare(
        `
          UPDATE topic_candidates
          SET
            source_url = ?,
            domain_id = ?,
            title = ?,
            prompt = ?,
            template_id = ?,
            topic_format = ?,
            cadence_family = ?,
            cadence_override_minutes = ?,
            min_trust_tier = ?,
            priority_score = ?,
            published_at = ?,
            promoted_topic_id = NULL,
            promotion_error = NULL
          WHERE id = ?
        `,
      ).bind(
        candidate.sourceUrl ?? null,
        candidate.domainId,
        candidate.title,
        candidate.prompt,
        candidate.templateId,
        candidate.topicFormat,
        candidate.cadenceFamily,
        candidate.cadenceOverrideMinutes ?? null,
        candidate.minTrustTier,
        candidate.priorityScore,
        candidate.publishedAt ?? null,
        existing.id,
      ),
    );
    updatedCount += 1;
  }

  return {
    createdCount,
    updatedCount,
    duplicates,
  };
}

export async function listTopicCandidates(env: ApiEnv, query: TopicCandidateQuery): Promise<TopicCandidateSummary[]> {
  const whereClauses: string[] = [];
  const bindings: unknown[] = [];

  if (query.domainId) {
    whereClauses.push("domain_id = ?");
    bindings.push(query.domainId);
  }
  if (query.status) {
    whereClauses.push("status = ?");
    bindings.push(query.status);
  }

  const rows = await allRows<TopicCandidateRow>(
    env.DB,
    `
      SELECT *
      FROM topic_candidates
      ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY priority_score DESC, created_at DESC
    `,
    ...bindings,
  );
  return rows.map(mapCandidateSummary);
}

export async function getTopicCandidate(env: ApiEnv, candidateId: string): Promise<TopicCandidateDetail> {
  const row = await firstRow<TopicCandidateRow>(
    env.DB,
    `
      SELECT *
      FROM topic_candidates
      WHERE id = ?
      LIMIT 1
    `,
    candidateId,
  );
  if (!row) {
    notFound("The requested topic candidate was not found.");
  }
  return mapCandidateDetail(row);
}

export async function promoteTopicCandidates(env: ApiEnv, options?: { cron?: string; now?: Date }): Promise<PromoteResult> {
  const now = options?.now ?? new Date();
  const cron = options?.cron ?? "manual";
  const mutatedTopicIds: string[] = [];
  const domainsNeedingPromotion = await allRows<DomainInventoryGapRow>(
    env.DB,
    `
      SELECT d.id
      FROM domains d
      WHERE NOT EXISTS (
        SELECT 1
        FROM topics t
        WHERE t.domain_id = d.id
          AND t.archived_at IS NULL
          AND t.topic_format IN ('scheduled_research', 'rolling_research')
          AND t.status IN ('open', 'countdown', 'started')
      )
      ORDER BY d.created_at ASC
    `,
  );

  for (const domain of domainsNeedingPromotion) {
    const candidate = await firstRow<TopicCandidateRow>(
      env.DB,
      `
        SELECT *
        FROM topic_candidates
        WHERE domain_id = ?
          AND status = 'approved'
          AND topic_format IN ('scheduled_research', 'rolling_research')
        ORDER BY priority_score DESC, created_at DESC
        LIMIT 1
      `,
      domain.id,
    );
    if (!candidate) {
      continue;
    }

    try {
      const topic = await createSystemTopic(env, validatePromotableCandidate(candidate));
      await consumeTopicCandidate(env, candidate.id, topic.id);
      if (candidate.source === REFINEMENT_CANDIDATE_SOURCE && candidate.source_id) {
        try {
          await linkRefinementChild(env, candidate.source_id, topic.id);
        } catch (linkError) {
          await archiveRefinementFailure(env, {
            topicId: topic.id,
            domainId: topic.domainId,
            stage: "link_child",
            message: linkError instanceof Error ? linkError.message : String(linkError),
            parentTopicId: candidate.source_id,
          });
          console.error("refinement linkage failed", { parentId: candidate.source_id, childId: topic.id, error: linkError });
        }
      }
      await invalidateTopicPublicSurfaces(env, {
        topicId: topic.id,
        domainId: topic.domainId,
        reason: "topic_candidate_promoted",
        occurredAt: nowIso(now),
      });
      mutatedTopicIds.push(topic.id);
    } catch (error) {
      await failTopicCandidate(env, candidate.id, error);
    }
  }

  const result = {
    cron,
    executedAt: nowIso(now),
    mutatedTopicIds,
  };
  await recordLifecycleMutation(env, result);
  return result;
}

export async function getTopicCandidateInventory(env: ApiEnv): Promise<TopicCandidateInventoryItem[]> {
  const rows = await allRows<{ domain_id: string; domain_slug: string; approved_count: number }>(
    env.DB,
    `
      SELECT d.id AS domain_id, d.slug AS domain_slug, COUNT(tc.id) AS approved_count
      FROM domains d
      LEFT JOIN topic_candidates tc ON tc.domain_id = d.id AND tc.status = 'approved'
      GROUP BY d.id, d.slug
      ORDER BY d.slug ASC
    `,
  );
  return rows.map((row) => ({
    domainId: row.domain_id,
    domainSlug: row.domain_slug,
    approvedCount: Number(row.approved_count ?? 0),
  }));
}

export async function getTopicIdeaContext(env: ApiEnv, domainId: string): Promise<TopicIdeaContextRecord[]> {
  const rows = await listDomainIdeaRecords(env, domainId);
  return rows.map((row) => ({
    recordKind: row.recordKind,
    id: row.id,
    domainId: row.domainId ?? domainId,
    status: row.status,
    title: row.title,
    prompt: row.prompt,
  }));
}

export async function cleanupExpiredCandidates(env: ApiEnv, maxAgeDays: number): Promise<TopicCandidateCleanupResponse> {
  const result = await runStatement(
    env.DB.prepare(
      `
        DELETE FROM topic_candidates
        WHERE status IN ('consumed', 'failed')
          AND updated_at < datetime('now', ? || ' days')
      `,
    ).bind(-maxAgeDays),
  );
  return { deleted: Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) };
}

export async function assertNoCandidateDuplicate(env: ApiEnv, candidate: TopicCandidate) {
  const existing = await findDuplicateCandidate(env, candidate);
  if (existing) {
    conflict("A topic candidate with that source identity already exists.", toDuplicateRecord(existing));
  }

  const ideaDuplicate = await findIdeaDuplicate(env, candidate);
  if (ideaDuplicate) {
    conflict("A topic candidate with that idea already exists in this domain.", toIdeaDuplicateRecord(ideaDuplicate, candidate.domainId));
  }
}
