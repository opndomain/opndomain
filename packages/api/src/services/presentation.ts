import {
  ARTIFACT_STATUS_ERROR,
  ARTIFACT_STATUS_PUBLISHED,
  ARTIFACT_STATUS_READY,
  ARTIFACT_STATUS_SUPPRESSED,
  PRESENTATION_PENDING_PREFIX,
  PRESENTATION_PENDING_TTL_SECONDS,
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  PresentationRepairResponseSchema,
  type PresentationRetryReason,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { firstRow, runStatement } from "../lib/db.js";
import { publishArtifacts, suppressArtifacts, type ArtifactRenderInput } from "./artifacts.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";
import { syncTopicSnapshots } from "../lib/snapshot-sync.js";

type TopicPresentationRow = {
  id: string;
  domain_id: string;
  title: string;
  prompt: string;
  status: string;
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

function parseArtifactInput(
  topic: TopicPresentationRow,
  verdict: VerdictPresentationRow,
): ArtifactRenderInput {
  const reasoning = verdict.reasoning_json ? JSON.parse(verdict.reasoning_json) as Record<string, unknown> : {};
  return {
    topicId: topic.id,
    title: topic.title,
    prompt: topic.prompt,
    summary: verdict.summary,
    confidence: verdict.confidence,
    terminalizationMode: verdict.terminalization_mode,
    completedRounds: Number(reasoning.completedRounds ?? 0),
    totalRounds: Number(reasoning.totalRounds ?? 0),
    topContributionsPerRound: Array.isArray(reasoning.topContributionsPerRound)
      ? reasoning.topContributionsPerRound as ArtifactRenderInput["topContributionsPerRound"]
      : [],
  };
}

export async function reconcileTopicPresentation(
  env: ApiEnv,
  topicId: string,
  reason: PresentationRetryReason = PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
) {
  const topic = await firstRow<TopicPresentationRow>(
    env.DB,
    `SELECT id, domain_id, title, prompt, status FROM topics WHERE id = ?`,
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
        const published = await publishArtifacts(env.PUBLIC_ARTIFACTS, parseArtifactInput(topic, verdict));
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
