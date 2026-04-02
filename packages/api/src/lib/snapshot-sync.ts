import {
  ARTIFACT_STATUS_READY,
  CACHE_CONTROL_CURATED,
  CACHE_CONTROL_STATE,
  CACHE_CONTROL_TRANSCRIPT,
  CURATED_OPEN_KEY,
  SNAPSHOT_PENDING_PREFIX,
  SNAPSHOT_PENDING_TTL_SECONDS,
  buildTopicFormatSummary,
} from "@opndomain/shared";
import type { ApiEnv } from "./env.js";
import { allRows, firstRow, runStatement } from "./db.js";
import { isTranscriptVisibleContribution } from "./visibility.js";
import { writeTopicSnapshotExportManifest } from "./ops-archive.js";

type TopicSnapshotRow = {
  id: string;
  domain_id: string;
  title: string;
  prompt: string;
  template_id: string;
  topic_format: "scheduled_research" | "rolling_research";
  status: string;
  min_distinct_participants: number;
  countdown_seconds: number | null;
  current_round_index: number;
  change_sequence: number;
  updated_at: string;
};

type RoundSnapshotRow = {
  id: string;
  sequence_index: number;
  round_kind: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  reveal_at: string | null;
  round_visibility: string | null;
};

type TranscriptRow = {
  id: string;
  round_id: string;
  being_id: string;
  being_handle: string;
  body_clean: string | null;
  visibility: string;
  submitted_at: string;
  heuristic_score: number | null;
  live_score: number | null;
  final_score: number | null;
  reveal_at: string | null;
  round_visibility: string | null;
};

type CountRow = {
  count: number;
};

type VerdictSnapshotRow = {
  confidence: string;
  terminalization_mode: string;
  summary: string;
  reasoning_json: string | null;
};

function transcriptSnapshotKey(env: ApiEnv, topicId: string): string {
  return `${env.TOPIC_TRANSCRIPT_PREFIX}/${topicId}/transcript.json`;
}

function stateSnapshotKey(env: ApiEnv, topicId: string): string {
  return `${env.TOPIC_TRANSCRIPT_PREFIX}/${topicId}/state.json`;
}

export async function queueSnapshotRetry(env: ApiEnv, topicId: string, reason: string) {
  await env.PUBLIC_CACHE.put(
    `${SNAPSHOT_PENDING_PREFIX}${topicId}`,
    JSON.stringify({ topicId, reason, queuedAt: new Date().toISOString() }),
    { expirationTtl: SNAPSHOT_PENDING_TTL_SECONDS },
  );
}

export async function listPendingSnapshotRetries(env: ApiEnv): Promise<string[]> {
  const result = await (env.PUBLIC_CACHE as KVNamespace).list({ prefix: SNAPSHOT_PENDING_PREFIX });
  return result.keys.map((entry) => entry.name.slice(SNAPSHOT_PENDING_PREFIX.length)).filter(Boolean);
}

async function writeCuratedOpenSnapshot(env: ApiEnv) {
  const openTopics = await allRows<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
  }>(
    env.DB,
    `
      SELECT id, title, status, updated_at
      FROM topics
      WHERE status IN ('open', 'started')
      ORDER BY updated_at DESC
      LIMIT 50
    `,
  );

  await env.PUBLIC_ARTIFACTS.put(
    env.CURATED_OPEN_KEY ?? CURATED_OPEN_KEY,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      topics: openTopics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        status: topic.status,
        updatedAt: topic.updated_at,
      })),
    }),
    {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL_CURATED },
    },
  );
}

export async function syncTopicSnapshots(
  env: ApiEnv,
  topicId: string,
  reason: string,
): Promise<{ transcriptKey: string; stateKey: string }> {
  const topic = await firstRow<TopicSnapshotRow>(
    env.DB,
    `
      SELECT id, domain_id, title, prompt, template_id, status, current_round_index, updated_at
             , topic_format, min_distinct_participants, countdown_seconds, change_sequence
      FROM topics
      WHERE id = ?
    `,
    topicId,
  );
  if (!topic) {
    throw new Error(`Topic ${topicId} was not found for snapshot sync.`);
  }

  const rounds = await allRows<RoundSnapshotRow>(
    env.DB,
    `
      SELECT r.id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at,
      r.reveal_at,
      json_extract(rc.config_json, '$.visibility') AS round_visibility
      FROM rounds r
      LEFT JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.topic_id = ?
      ORDER BY r.sequence_index ASC
    `,
    topicId,
  );
  const transcript = await allRows<TranscriptRow>(
    env.DB,
    `
      SELECT
        c.id,
        c.round_id,
        c.being_id,
        b.handle AS being_handle,
        c.body_clean,
        c.visibility,
        c.submitted_at,
        cs.heuristic_score,
        cs.live_score,
        cs.final_score,
        r.reveal_at,
        json_extract(rc.config_json, '$.visibility') AS round_visibility
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      INNER JOIN beings b ON b.id = c.being_id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ?
        AND c.visibility IN ('normal', 'low_confidence')
      ORDER BY
        r.sequence_index ASC,
        COALESCE(cs.final_score, cs.live_score, cs.heuristic_score, 0) DESC,
        c.submitted_at ASC,
        c.created_at ASC
    `,
    topicId,
  );
  const verdict = topic.status === "closed"
    ? await firstRow<VerdictSnapshotRow>(
        env.DB,
        `
          SELECT confidence, terminalization_mode, summary, reasoning_json
          FROM verdicts
          WHERE topic_id = ?
        `,
        topicId,
      )
    : null;
  const memberCountRow = await firstRow<CountRow>(
    env.DB,
    `
      SELECT COUNT(*) AS count
      FROM topic_members
      WHERE topic_id = ? AND status = 'active'
    `,
    topicId,
  );
  const contributionCountRow = await firstRow<CountRow>(
    env.DB,
    `
      SELECT COUNT(*) AS count
      FROM contributions
      WHERE topic_id = ?
    `,
    topicId,
  );
  const revealVisibleTranscript = transcript.filter((row) => isTranscriptVisibleContribution(row));
  const visibleRoundIds = new Set(revealVisibleTranscript.map((row) => row.round_id));
  const transcriptVersion = visibleRoundIds.size;

  const transcriptKey = transcriptSnapshotKey(env, topicId);
  const stateKey = stateSnapshotKey(env, topicId);
  const roundsWithContributions = rounds
    .map((round) => ({
      roundId: round.id,
      sequenceIndex: round.sequence_index,
      roundKind: round.round_kind,
      status: round.status,
      contributions: transcript
        .filter((row) => isTranscriptVisibleContribution(row))
        .filter((row) => row.round_id === round.id)
        .map((row) => ({
          id: row.id,
          beingId: row.being_id,
          beingHandle: row.being_handle,
          bodyClean: row.body_clean,
          visibility: row.visibility,
          submittedAt: row.submitted_at,
          scores: {
            heuristic: row.heuristic_score,
            live: row.live_score,
            final: row.final_score,
          },
        })),
    }))
    .filter((round) => round.contributions.length > 0);

  await env.SNAPSHOTS.put(
    transcriptKey,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      topicId,
      topicPrompt: topic.prompt,
      templateId: topic.template_id,
      transcriptVersion,
      changeSequence: topic.change_sequence,
      rounds: roundsWithContributions,
    }),
    {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL_TRANSCRIPT },
    },
  );

  await env.SNAPSHOTS.put(
    stateKey,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      topicId: topic.id,
      title: topic.title,
      prompt: topic.prompt,
      templateId: topic.template_id,
      topicFormat: topic.topic_format,
      formatSummary: buildTopicFormatSummary(
        topic.topic_format,
        topic.topic_format === "rolling_research" ? topic.min_distinct_participants : null,
      ),
      domainId: topic.domain_id,
      status: topic.status,
      minDistinctParticipants: topic.min_distinct_participants,
      countdownSeconds: topic.countdown_seconds,
      currentRoundIndex: topic.current_round_index,
      rounds: rounds.map((round) => ({
        roundId: round.id,
        sequenceIndex: round.sequence_index,
        roundKind: round.round_kind,
        status: round.status,
        startsAt: round.starts_at,
        endsAt: round.ends_at,
        revealAt: round.reveal_at,
        visibility: round.round_visibility,
      })),
      memberCount: memberCountRow?.count ?? 0,
      contributionCount: contributionCountRow?.count ?? 0,
      transcriptVersion,
      changeSequence: topic.change_sequence,
      verdict: verdict
        ? {
            confidence: verdict.confidence,
            terminalizationMode: verdict.terminalization_mode,
            summary: verdict.summary,
            reasoning: verdict.reasoning_json ? JSON.parse(verdict.reasoning_json) : null,
          }
        : null,
    }),
    {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL_STATE },
    },
  );

  await writeTopicSnapshotExportManifest(env, {
    manifestVersion: 1,
    kind: "topic_snapshot_export",
    generatedAt: new Date().toISOString(),
    topicId: topic.id,
    changeSequence: Number(topic.change_sequence ?? 0),
    sourceReason: reason,
    transcript: {
      key: transcriptKey,
      contentType: "application/json",
    },
    state: {
      key: stateKey,
      contentType: "application/json",
    },
  });

  await writeCuratedOpenSnapshot(env);

  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO topic_artifacts (
          id, topic_id, transcript_snapshot_key, state_snapshot_key, artifact_status
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(topic_id) DO UPDATE SET
          transcript_snapshot_key = excluded.transcript_snapshot_key,
          state_snapshot_key = excluded.state_snapshot_key,
          artifact_status = CASE
            WHEN topic_artifacts.artifact_status IN ('published', 'suppressed', 'error')
              THEN topic_artifacts.artifact_status
            ELSE excluded.artifact_status
          END
      `,
    ).bind(`tar_${topicId}`, topicId, transcriptKey, stateKey, ARTIFACT_STATUS_READY),
  );

  await env.PUBLIC_CACHE.delete(`${SNAPSHOT_PENDING_PREFIX}${topicId}`);
  return { transcriptKey, stateKey };
}
