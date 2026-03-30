import {
  ARTIFACT_STATUS_ERROR,
  ARTIFACT_STATUS_PUBLISHED,
  ARTIFACT_STATUS_READY,
  ARTIFACT_STATUS_SUPPRESSED,
  PRESENTATION_PENDING_PREFIX,
  PRESENTATION_PENDING_TTL_SECONDS,
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  PresentationRepairResponseSchema,
  VerdictPresentationSchema,
  type PresentationRetryReason,
  type VerdictConfidence,
  type VerdictPresentation,
  type RoundKind,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { publishArtifacts, suppressArtifacts } from "./artifacts.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";
import { syncTopicSnapshots } from "../lib/snapshot-sync.js";

type TopicPresentationRow = {
  id: string;
  domain_id: string;
  domain_slug: string;
  title: string;
  prompt: string;
  status: string;
  closed_at: string | null;
};

type VerdictPresentationRow = {
  confidence: string;
  terminalization_mode: string;
  summary: string;
  reasoning_json: string | null;
};

type ArtifactRow = {
  transcript_snapshot_key: string | null;
  state_snapshot_key: string | null;
  verdict_html_key: string | null;
  og_image_key: string | null;
  artifact_status: string;
};

type ParsedReasoning = {
  completedRounds?: number;
  totalRounds?: number;
  participantCount?: number;
  contributionCount?: number;
  editorialBody?: string | null;
  topContributionsPerRound?: Array<{
    roundKind?: string;
    contributions?: Array<{
      contributionId?: string;
      beingId?: string;
      beingHandle?: string;
      finalScore?: number;
      excerpt?: string;
    }>;
  }>;
  narrative?: VerdictPresentation["narrative"];
  highlights?: VerdictPresentation["highlights"];
};

const FALLBACK_ROUND_KIND: RoundKind = "propose";

type ClaimNodeRow = {
  claim_id: string;
  contribution_id: string;
  being_id: string;
  being_handle: string;
  label: string;
  status: "unresolved" | "contested" | "supported" | "refuted" | "mixed";
  verifiability: "unclassified" | "empirical" | "normative" | "predictive";
  confidence: number;
};

type ClaimEdgeRow = {
  source_claim_id: string;
  target_claim_id: string;
  relation_kind: "support" | "contradiction" | "refinement" | "supersession";
  confidence: number;
  explanation: string | null;
};

export async function queuePresentationRetry(
  env: ApiEnv,
  topicId: string,
  reason: PresentationRetryReason,
  error?: unknown,
): Promise<void> {
  const key = `${PRESENTATION_PENDING_PREFIX}${topicId}`;
  const existing = await env.PUBLIC_CACHE.get(key, "json") as { attemptCount?: number } | null;
  const next = {
    topicId,
    reason,
    queuedAt: new Date().toISOString(),
    attemptCount: Number(existing?.attemptCount ?? 0) + 1,
    error:
      error instanceof Error
        ? { class: error.name, message: error.message }
        : error
          ? { class: "Error", message: String(error) }
          : null,
  };
  await env.PUBLIC_CACHE.put(key, JSON.stringify(next), { expirationTtl: PRESENTATION_PENDING_TTL_SECONDS });
}

export async function listPendingPresentationRetries(env: ApiEnv): Promise<string[]> {
  const result = await env.PUBLIC_CACHE.list({ prefix: PRESENTATION_PENDING_PREFIX });
  return result.keys.map((entry) => entry.name.slice(PRESENTATION_PENDING_PREFIX.length)).filter(Boolean);
}

const CONFIDENCE_SCORE_MAP: Record<VerdictConfidence, number> = {
  emerging: 0.42,
  moderate: 0.68,
  strong: 0.86,
};

function parseReasoningJson(reasoningJson: string | null): ParsedReasoning {
  if (!reasoningJson) {
    return {};
  }
  try {
    return JSON.parse(reasoningJson) as ParsedReasoning;
  } catch {
    return {};
  }
}

function buildFallbackNarrative(reasoning: ParsedReasoning): VerdictPresentation["narrative"] {
  const rounds = Array.isArray(reasoning.topContributionsPerRound) ? reasoning.topContributionsPerRound : [];
  return rounds.map((round, roundIndex) => {
    const lead = Array.isArray(round.contributions) ? round.contributions[0] : null;
    const roundKind = (round.roundKind ?? FALLBACK_ROUND_KIND) as RoundKind;
    return {
      roundIndex,
      roundKind,
      title: `${roundKind.replaceAll("_", " ")} round`,
      summary: lead?.excerpt?.trim()
        ? `Lead signal: ${lead.excerpt.slice(0, 180)}`
        : "No transcript-visible contributions were available in this round.",
    };
  });
}

function buildFallbackHighlights(reasoning: ParsedReasoning): VerdictPresentation["highlights"] {
  const rounds = Array.isArray(reasoning.topContributionsPerRound) ? reasoning.topContributionsPerRound : [];
  return rounds.flatMap((round) =>
    (Array.isArray(round.contributions) ? round.contributions.slice(0, 1) : []).flatMap((contribution) => {
      if (!contribution?.contributionId || !contribution.beingId || !round.roundKind) {
        return [];
      }
      return [{
        contributionId: contribution.contributionId,
        beingId: contribution.beingId,
        beingHandle: contribution.beingHandle ?? contribution.beingId,
        roundKind: round.roundKind as RoundKind,
        excerpt: contribution.excerpt?.trim() || "No excerpt available.",
        finalScore: Number(contribution.finalScore ?? 0),
        reason: `Highest-scoring visible contribution in the ${round.roundKind.replaceAll("_", " ")} round.`,
      }];
    }),
  );
}

async function buildClaimGraph(env: ApiEnv, topicId: string): Promise<VerdictPresentation["claimGraph"]> {
  if (!env.ENABLE_EPISTEMIC_SCORING) {
    return {
      available: false,
      nodes: [],
      edges: [],
      fallbackNote: "Claim graph unavailable because epistemic scoring is disabled.",
    };
  }
  try {
    const nodes = await allRows<ClaimNodeRow>(
      env.DB,
      `
        SELECT
          c.id AS claim_id,
          c.contribution_id,
          c.being_id,
          b.handle AS being_handle,
          c.body AS label,
          COALESCE(cr.status, 'unresolved') AS status,
          c.verifiability,
          COALESCE(cr.confidence, 0) AS confidence
        FROM claims c
        INNER JOIN beings b ON b.id = c.being_id
        LEFT JOIN claim_resolutions cr ON cr.claim_id = c.id
        WHERE c.topic_id = ?
        ORDER BY c.created_at ASC, c.ordinal ASC
      `,
      topicId,
    );
    if (nodes.length === 0) {
      return {
        available: false,
        nodes: [],
        edges: [],
        fallbackNote: "Claim graph unavailable because no claim rows were published for this topic.",
      };
    }

    const edges = await allRows<ClaimEdgeRow>(
      env.DB,
      `
        SELECT source_claim_id, target_claim_id, relation_kind, confidence, explanation
        FROM claim_relations
        WHERE source_claim_id IN (SELECT id FROM claims WHERE topic_id = ?)
          AND target_claim_id IN (SELECT id FROM claims WHERE topic_id = ?)
        ORDER BY created_at ASC
      `,
      topicId,
      topicId,
    );

    return {
      available: true,
      nodes: nodes.map((node) => ({
        claimId: node.claim_id,
        contributionId: node.contribution_id,
        beingId: node.being_id,
        beingHandle: node.being_handle,
        label: node.label,
        status: node.status,
        verifiability: node.verifiability,
        confidence: Number(node.confidence ?? 0),
      })),
      edges: edges.map((edge) => ({
        sourceClaimId: edge.source_claim_id,
        targetClaimId: edge.target_claim_id,
        relationKind: edge.relation_kind,
        confidence: Number(edge.confidence ?? 0),
        explanation: edge.explanation,
      })),
      fallbackNote: null,
    };
  } catch {
    return {
      available: false,
      nodes: [],
      edges: [],
      fallbackNote: "Claim graph unavailable because the epistemic rows could not be loaded.",
    };
  }
}

async function buildVerdictPresentation(
  env: ApiEnv,
  topic: TopicPresentationRow,
  verdict: VerdictPresentationRow,
): Promise<VerdictPresentation> {
  const reasoning = parseReasoningJson(verdict.reasoning_json);
  const completedRounds = Number(reasoning.completedRounds ?? 0);
  const totalRounds = Number(reasoning.totalRounds ?? completedRounds);
  const narrative = Array.isArray(reasoning.narrative) && reasoning.narrative.length > 0
    ? reasoning.narrative
    : buildFallbackNarrative(reasoning);
  const highlights = Array.isArray(reasoning.highlights) && reasoning.highlights.length > 0
    ? reasoning.highlights
    : buildFallbackHighlights(reasoning);
  const claimGraph = await buildClaimGraph(env, topic.id);
  const confidence = verdict.confidence as VerdictConfidence;

  return VerdictPresentationSchema.parse({
    topicId: topic.id,
    title: topic.title,
    domain: topic.domain_slug,
    publishedAt: topic.closed_at ?? new Date().toISOString(),
    status: ARTIFACT_STATUS_PUBLISHED,
    headline: {
      label: "Verdict",
      text: verdict.summary,
      stance: verdict.terminalization_mode === "insufficient_signal" ? "uncertain" : "mixed",
    },
    summary: verdict.summary,
    editorialBody:
      typeof reasoning.editorialBody === "string" && reasoning.editorialBody.trim().length > 0
        ? reasoning.editorialBody
        : null,
    confidence: {
      label: confidence,
      score: CONFIDENCE_SCORE_MAP[confidence],
      explanation:
        verdict.terminalization_mode === "insufficient_signal"
          ? "The topic closed without enough transcript-visible signal for a stronger conclusion."
          : `${completedRounds}/${Math.max(totalRounds, completedRounds)} rounds completed under ${verdict.terminalization_mode}.`,
    },
    scoreBreakdown: {
      completedRounds,
      totalRounds,
      participantCount: Number(reasoning.participantCount ?? 0),
      contributionCount: Number(reasoning.contributionCount ?? 0),
      terminalizationMode: verdict.terminalization_mode,
    },
    narrative,
    highlights,
    claimGraph,
  });
}

export async function reconcileTopicPresentation(
  env: ApiEnv,
  topicId: string,
  reason: PresentationRetryReason = PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
) {
    const topic = await firstRow<TopicPresentationRow>(
      env.DB,
      `
        SELECT
          topics.id,
          topics.domain_id,
          topics.title,
          topics.prompt,
          topics.status,
          topics.closed_at,
          (
            SELECT slug
            FROM domains
            WHERE domains.id = topics.domain_id
          ) AS domain_slug
        FROM topics
        WHERE id = ?
      `,
      topicId,
    );
  if (!topic) {
    throw new Error(`Topic ${topicId} not found.`);
  }

  try {
    const snapshots = await syncTopicSnapshots(env, topicId, reason);
    const existingArtifact = await firstRow<ArtifactRow>(
      env.DB,
      `
        SELECT transcript_snapshot_key, state_snapshot_key, verdict_html_key, og_image_key, artifact_status
        FROM topic_artifacts
        WHERE topic_id = ?
      `,
      topicId,
    );
    const verdict = topic.status === "closed"
      ? await firstRow<VerdictPresentationRow>(
          env.DB,
          `SELECT confidence, terminalization_mode, summary, reasoning_json FROM verdicts WHERE topic_id = ?`,
          topicId,
        )
      : null;
    if (topic.status === "closed" && !verdict) {
      throw new Error(`Closed topic ${topicId} is missing a verdict row; reterminalize before reconcile.`);
    }

    let artifactStatus =
      topic.status !== "closed" && existingArtifact?.artifact_status === ARTIFACT_STATUS_SUPPRESSED
        ? ARTIFACT_STATUS_SUPPRESSED
        : ARTIFACT_STATUS_READY;
    let verdictHtmlKey: string | null =
      artifactStatus === ARTIFACT_STATUS_SUPPRESSED ? existingArtifact?.verdict_html_key ?? null : null;
    let ogImageKey: string | null =
      artifactStatus === ARTIFACT_STATUS_SUPPRESSED ? existingArtifact?.og_image_key ?? null : null;
    if (topic.status === "closed" && verdict) {
      if (verdict.terminalization_mode === "insufficient_signal") {
        await suppressArtifacts(env.PUBLIC_ARTIFACTS, topicId);
        artifactStatus = ARTIFACT_STATUS_SUPPRESSED;
      } else {
        const published = await publishArtifacts(
          env.PUBLIC_ARTIFACTS,
          await buildVerdictPresentation(env, topic, verdict),
        );
        verdictHtmlKey = published.verdictHtmlKey;
        ogImageKey = published.ogImageKey;
        artifactStatus = ARTIFACT_STATUS_PUBLISHED;
      }
    }

    await runStatement(
      env.DB.prepare(
        `
          INSERT INTO topic_artifacts (
            id, topic_id, transcript_snapshot_key, state_snapshot_key, verdict_html_key, og_image_key, artifact_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(topic_id) DO UPDATE SET
            transcript_snapshot_key = excluded.transcript_snapshot_key,
            state_snapshot_key = excluded.state_snapshot_key,
            verdict_html_key = excluded.verdict_html_key,
            og_image_key = excluded.og_image_key,
            artifact_status = excluded.artifact_status
        `,
      ).bind(`tar_${topicId}`, topicId, snapshots.transcriptKey, snapshots.stateKey, verdictHtmlKey, ogImageKey, artifactStatus),
    );

    const invalidationKeys = await invalidateTopicPublicSurfaces(env, {
      topicId,
      domainId: topic.domain_id,
      reason,
    });
    await env.PUBLIC_CACHE.delete(`${PRESENTATION_PENDING_PREFIX}${topicId}`);

    return PresentationRepairResponseSchema.parse({
      topicId,
      artifact: {
        transcriptSnapshotKey: snapshots.transcriptKey,
        stateSnapshotKey: snapshots.stateKey,
        verdictHtmlKey,
        ogImageKey,
        artifactStatus,
      },
      retryQueued: false,
      invalidationKeys,
    });
  } catch (error) {
    await runStatement(
      env.DB.prepare(
        `
          INSERT INTO topic_artifacts (id, topic_id, artifact_status)
          VALUES (?, ?, ?)
          ON CONFLICT(topic_id) DO UPDATE SET artifact_status = excluded.artifact_status
        `,
      ).bind(`tar_${topicId}`, topicId, ARTIFACT_STATUS_ERROR),
    );
    await queuePresentationRetry(env, topicId, reason, error);
    const artifact = await firstRow<ArtifactRow>(
      env.DB,
      `
        SELECT transcript_snapshot_key, state_snapshot_key, verdict_html_key, og_image_key, artifact_status
        FROM topic_artifacts
        WHERE topic_id = ?
      `,
      topicId,
    );
    return PresentationRepairResponseSchema.parse({
      topicId,
      artifact: {
        transcriptSnapshotKey: artifact?.transcript_snapshot_key ?? null,
        stateSnapshotKey: artifact?.state_snapshot_key ?? null,
        verdictHtmlKey: artifact?.verdict_html_key ?? null,
        ogImageKey: artifact?.og_image_key ?? null,
        artifactStatus: artifact?.artifact_status ?? ARTIFACT_STATUS_ERROR,
      },
      retryQueued: true,
      invalidationKeys: [],
    });
  }
}
