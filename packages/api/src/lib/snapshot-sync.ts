import {
  ARTIFACT_STATUS_READY,
  CACHE_CONTROL_CURATED,
  CACHE_CONTROL_STATE,
  CACHE_CONTROL_TRANSCRIPT,
  CURATED_OPEN_KEY,
  SNAPSHOT_PENDING_PREFIX,
  SNAPSHOT_PENDING_TTL_SECONDS,
  TRANSCRIPT_QUERY_DEFAULT_LIMIT,
  RoundConfigSchema,
  buildTopicFormatSummary,
  resolveDefaultRoundInstruction,
  type RoundInstruction,
} from "@opndomain/shared";
import type { ApiEnv } from "./env.js";
import { allRows, firstRow, runStatement } from "./db.js";
import { isTranscriptVisibleContribution } from "./visibility.js";
import { writeTopicSnapshotExportManifest } from "./ops-archive.js";
import { overlayRefinementContext } from "../services/vertical-refinement.js";

type TopicSnapshotRow = {
  id: string;
  domain_id: string;
  title: string;
  prompt: string;
  template_id: string;
  topic_format: "scheduled_research" | "rolling_research";
  topic_source: "cron_auto" | "manual_user" | "manual_admin";
  status: string;
  cadence_family: string;
  cadence_preset: string | null;
  cadence_override_minutes: number | null;
  min_distinct_participants: number;
  countdown_seconds: number | null;
  min_trust_tier: string;
  visibility: string;
  current_round_index: number;
  starts_at: string | null;
  join_until: string | null;
  countdown_started_at: string | null;
  stalled_at: string | null;
  closed_at: string | null;
  change_sequence: number;
  created_at: string;
  updated_at: string;
};

type DomainSnapshotRow = {
  slug: string | null;
  name: string | null;
};

type RoundSnapshotRow = {
  id: string;
  topic_id: string;
  sequence_index: number;
  round_kind: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  reveal_at: string | null;
  round_visibility: string | null;
  config_json: string | null;
  created_at: string;
  updated_at: string;
};

type TranscriptRow = {
  id: string;
  round_id: string;
  being_id: string;
  being_handle: string;
  display_name: string | null;
  body_clean: string | null;
  visibility: string;
  submitted_at: string;
  heuristic_score: number | null;
  live_score: number | null;
  final_score: number | null;
  reveal_at: string | null;
  round_visibility: string | null;
  round_kind: string;
  sequence_index: number;
};

type CountRow = {
  count: number;
};

type VerdictSnapshotRow = {
  confidence: string;
  terminalization_mode: string;
  summary: string;
  reasoning_json: string | null;
  verdict_outcome: string | null;
  positions_json: string | null;
};

type TopicMemberSnapshotRow = {
  being_id: string;
  handle: string;
  display_name: string | null;
  role: string;
  status: string;
};

type SharedTranscriptItem = {
  id: string;
  roundId: string;
  beingId: string;
  beingHandle: string;
  bodyClean: string | null;
  visibility: string;
  submittedAt: string;
  scores: {
    heuristic: number | null;
    live: number | null;
    final: number | null;
  };
};

function transcriptSnapshotKey(env: ApiEnv, topicId: string): string {
  return `${env.TOPIC_TRANSCRIPT_PREFIX}/${topicId}/transcript.json`;
}

function stateSnapshotKey(env: ApiEnv, topicId: string): string {
  return `${env.TOPIC_TRANSCRIPT_PREFIX}/${topicId}/state.json`;
}

function sharedContextSnapshotKey(env: ApiEnv, topicId: string): string {
  return `${env.TOPIC_TRANSCRIPT_PREFIX}/${topicId}/shared-context.json`;
}

function scoreOf(item: SharedTranscriptItem): number {
  return item.scores.final ?? item.scores.live ?? item.scores.heuristic ?? 0;
}

function capTranscriptByBudget(
  visibleTranscript: SharedTranscriptItem[],
  budget: number,
): { transcript: SharedTranscriptItem[]; capped: boolean } {
  if (visibleTranscript.length <= budget) {
    return { transcript: visibleTranscript, capped: false };
  }

  function isPending(item: SharedTranscriptItem): boolean {
    return item.scores.heuristic === null && item.scores.live === null && item.scores.final === null;
  }

  const pending = visibleTranscript.filter(isPending);
  const finalized = visibleTranscript.filter((item) => !isPending(item));
  const remainingBudget = Math.max(0, budget - pending.length);

  if (finalized.length <= remainingBudget) {
    return { transcript: visibleTranscript, capped: false };
  }

  const sortedFinalized = [...finalized].sort((a, b) => scoreOf(b) - scoreOf(a));
  const keptFinalized = new Set(sortedFinalized.slice(0, remainingBudget));
  return {
    transcript: visibleTranscript.filter((item) => isPending(item) || keptFinalized.has(item)),
    capped: true,
  };
}

async function resolveRoundInstruction(
  env: ApiEnv,
  templateId: string,
  sequenceIndex: number,
  roundKind: string,
  topicId: string | null = null,
): Promise<RoundInstruction | null> {
  let base: RoundInstruction | null = null;
  try {
    const override = await firstRow<{
      goal: string;
      guidance: string;
      prior_round_context: string | null;
      quality_criteria_json: string;
      round_kind: string;
      voting_guidance?: string | null;
    }>(
      env.DB,
      `SELECT goal, guidance, prior_round_context, quality_criteria_json, round_kind, voting_guidance
       FROM round_instruction_overrides
       WHERE template_id = ? AND sequence_index = ?`,
      templateId,
      sequenceIndex,
    );
    if (override && override.round_kind === roundKind) {
      base = {
        goal: override.goal,
        guidance: override.guidance,
        priorRoundContext: override.prior_round_context,
        qualityCriteria: JSON.parse(override.quality_criteria_json),
        votingGuidance: override.voting_guidance ?? null,
      };
    }
  } catch {
    // Ignore malformed overrides and fall back to code defaults.
  }
  if (!base) {
    base = resolveDefaultRoundInstruction(templateId, sequenceIndex, roundKind);
  }
  return overlayRefinementContext(env, topicId, sequenceIndex, base);
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
): Promise<{ transcriptKey: string; stateKey: string; sharedContextKey: string }> {
  const topic = await firstRow<TopicSnapshotRow>(
    env.DB,
    `
      SELECT id, domain_id, title, prompt, template_id,
             topic_format, topic_source, status, cadence_family, cadence_preset,
             cadence_override_minutes, min_distinct_participants, countdown_seconds,
             min_trust_tier, visibility, current_round_index, starts_at, join_until,
             countdown_started_at, stalled_at, closed_at, change_sequence, created_at, updated_at
      FROM topics
      WHERE id = ?
    `,
    topicId,
  );
  if (!topic) {
    throw new Error(`Topic ${topicId} was not found for snapshot sync.`);
  }
  const domain = await firstRow<DomainSnapshotRow>(
    env.DB,
    `
      SELECT slug, name
      FROM domains
      WHERE id = ?
    `,
    topic.domain_id,
  );

  const rounds = await allRows<RoundSnapshotRow>(
    env.DB,
    `
      SELECT r.id, r.sequence_index, r.round_kind, r.status, r.starts_at, r.ends_at,
      r.reveal_at, r.topic_id, rc.config_json,
      json_extract(rc.config_json, '$.visibility') AS round_visibility,
      r.created_at, r.updated_at
      FROM rounds r
      LEFT JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.topic_id = ?
      ORDER BY r.sequence_index ASC
    `,
    topicId,
  );
  const members = await allRows<TopicMemberSnapshotRow>(
    env.DB,
    `
      SELECT tm.being_id, b.handle, b.display_name, tm.role, tm.status
      FROM topic_members tm
      INNER JOIN beings b ON b.id = tm.being_id
      WHERE tm.topic_id = ?
      ORDER BY tm.joined_at ASC, b.handle ASC
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
        b.display_name,
        c.body_clean,
        c.visibility,
        c.submitted_at,
        cs.heuristic_score,
        cs.live_score,
        cs.final_score,
        r.reveal_at,
        r.round_kind,
        r.sequence_index,
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
        c.submitted_at ASC,
        c.created_at ASC
    `,
    topicId,
  );
  const verdict = topic.status === "closed"
    ? await firstRow<VerdictSnapshotRow>(
        env.DB,
        `
          SELECT confidence, terminalization_mode, summary, reasoning_json, verdict_outcome, positions_json
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
  const sharedContextKey = sharedContextSnapshotKey(env, topicId);
  const roundsWithContributions = rounds
    .map((round) => {
      const roundContributions = transcript
        .filter((row) => isTranscriptVisibleContribution(row))
        .filter((row) => row.round_id === round.id)
        .map((row) => {
          const isPending = row.final_score === null && row.round_kind !== "vote";
          return {
            id: row.id,
            beingId: row.being_id,
            beingHandle: row.being_handle,
            displayName: row.display_name ?? null,
            bodyClean: row.body_clean,
            visibility: row.visibility,
            submittedAt: row.submitted_at,
            scores: isPending
              ? { heuristic: null, live: null, final: null }
              : { heuristic: row.heuristic_score, live: row.live_score, final: row.final_score },
          };
        });
      // Round-scoped sort: if any non-vote contribution has null final_score, sort by time; otherwise by score
      const hasNullScore = round.round_kind !== "vote" && roundContributions.some((c) => c.scores.final === null);
      if (hasNullScore) {
        roundContributions.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      } else {
        roundContributions.sort((a, b) => {
          const sa = a.scores.final ?? a.scores.live ?? a.scores.heuristic ?? 0;
          const sb = b.scores.final ?? b.scores.live ?? b.scores.heuristic ?? 0;
          return sb - sa;
        });
      }
      return {
        roundId: round.id,
        sequenceIndex: round.sequence_index,
        roundKind: round.round_kind,
        status: round.status,
        contributions: roundContributions,
      };
    })
    .filter((round) => round.contributions.length > 0);
  const currentRound = rounds.find((round) => round.status === "active") ?? rounds.find((round) => round.sequence_index === topic.current_round_index) ?? null;
  const visibleTranscriptEntries = transcript
    .filter((row) => isTranscriptVisibleContribution(row))
    .map((row) => {
      const isPending = row.final_score === null && row.round_kind !== "vote";
      return {
        id: row.id,
        roundId: row.round_id,
        beingId: row.being_id,
        beingHandle: row.being_handle,
        bodyClean: row.body_clean,
        visibility: row.visibility,
        submittedAt: row.submitted_at,
        scores: isPending
          ? { heuristic: null, live: null, final: null }
          : { heuristic: row.heuristic_score, live: row.live_score, final: row.final_score },
      };
    });
  const cappedTranscript = capTranscriptByBudget(visibleTranscriptEntries, TRANSCRIPT_QUERY_DEFAULT_LIMIT);

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
            verdictOutcome: verdict.verdict_outcome ?? null,
            positions: verdict.positions_json ? JSON.parse(verdict.positions_json) : null,
          }
        : null,
    }),
    {
      httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL_STATE },
    },
  );

  try {
    const parsedCurrentRoundConfig = currentRound?.config_json
      ? RoundConfigSchema.parse(JSON.parse(currentRound.config_json))
      : null;
    const currentRoundConfig = parsedCurrentRoundConfig
      ? {
          roundKind: currentRound?.round_kind ?? parsedCurrentRoundConfig.roundKind,
          voteRequired: Boolean(parsedCurrentRoundConfig.voteRequired),
          voteTargetPolicy: parsedCurrentRoundConfig.voteTargetPolicy ?? null,
          roundInstruction: await resolveRoundInstruction(
            env,
            topic.template_id,
            currentRound?.sequence_index ?? 0,
            currentRound?.round_kind ?? parsedCurrentRoundConfig.roundKind,
            topic.id,
          ),
        }
      : null;
    await env.SNAPSHOTS.put(
      sharedContextKey,
      JSON.stringify({
        id: topic.id,
        domainId: topic.domain_id,
        domainSlug: domain?.slug ?? null,
        domainName: domain?.name ?? null,
        title: topic.title,
        prompt: topic.prompt,
        templateId: topic.template_id,
        topicFormat: topic.topic_format,
        topicSource: topic.topic_source,
        formatSummary: buildTopicFormatSummary(
          topic.topic_format,
          topic.topic_format === "rolling_research" ? topic.min_distinct_participants : null,
        ),
        status: topic.status,
        cadenceFamily: topic.cadence_family,
        cadencePreset: topic.cadence_preset,
        cadenceOverrideMinutes: topic.cadence_override_minutes,
        minDistinctParticipants: topic.min_distinct_participants,
        countdownSeconds: topic.countdown_seconds,
        minTrustTier: topic.min_trust_tier,
        visibility: topic.visibility,
        currentRoundIndex: topic.current_round_index,
        startsAt: topic.starts_at,
        joinUntil: topic.join_until,
        countdownStartedAt: topic.countdown_started_at,
        stalledAt: topic.stalled_at,
        closedAt: topic.closed_at,
        createdAt: topic.created_at,
        updatedAt: topic.updated_at,
        rounds: rounds.map((round) => ({
          id: round.id,
          topicId: round.topic_id,
          sequenceIndex: round.sequence_index,
          roundKind: round.round_kind,
          status: round.status,
          startsAt: round.starts_at,
          endsAt: round.ends_at,
          revealAt: round.reveal_at,
          createdAt: round.created_at,
          updatedAt: round.updated_at,
        })),
        currentRound: currentRound
          ? {
              id: currentRound.id,
              topicId: currentRound.topic_id,
              sequenceIndex: currentRound.sequence_index,
              roundKind: currentRound.round_kind,
              status: currentRound.status,
              startsAt: currentRound.starts_at,
              endsAt: currentRound.ends_at,
              revealAt: currentRound.reveal_at,
              createdAt: currentRound.created_at,
              updatedAt: currentRound.updated_at,
            }
          : null,
        transcript: cappedTranscript.transcript,
        transcriptCapped: cappedTranscript.capped,
        members: members.map((member) => ({
          beingId: member.being_id,
          handle: member.handle,
          displayName: member.display_name,
          role: member.role,
          status: member.status,
        })),
        currentRoundConfig,
        changeSequence: topic.change_sequence,
      }),
      {
        httpMetadata: { contentType: "application/json", cacheControl: CACHE_CONTROL_STATE },
      },
    );
    console.info("snapshot sync: shared context write completed", { topicId, changeSequence: topic.change_sequence, key: sharedContextKey });
  } catch (error) {
    console.error("snapshot sync: shared context write failed", {
      topicId,
      changeSequence: topic.change_sequence,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

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
    sharedContext: {
      key: sharedContextKey,
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
  return { transcriptKey, stateKey, sharedContextKey };
}
