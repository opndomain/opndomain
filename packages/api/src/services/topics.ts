import {
  CADENCE_PRESETS,
  DEFAULT_MAX_VOTES_PER_ACTOR,
  DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS,
  ROUND_VISIBILITY_SEALED,
  RoundConfigSchema,
  TRANSCRIPT_MODE_FULL,
  TRANSCRIPT_QUERY_DEFAULT_LIMIT,
  TOPIC_TEMPLATES,
  buildTopicFormatSummary,
  type TranscriptQuery,
  type TopicFormat,
  type TrustTier,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { ApiError, badRequest, forbidden, notFound, rateLimited } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { signJwt, verifyJwt } from "../lib/jwt.js";
import { meetsTrustTier } from "../lib/trust.js";
import { addMinutes, addSeconds, nowIso } from "../lib/time.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import type { AgentRecord } from "./auth.js";
import { findActingBeingForTopicCreation } from "./beings.js";
import { ensureSeedDomains, getDomain } from "./domains.js";
import { resolveVotePolicyDefaults, resolveVoteTargets } from "./votes.js";

type TopicRow = {
  id: string;
  domain_id: string;
  domain_slug?: string | null;
  domain_name?: string | null;
  title: string;
  prompt: string;
  template_id: keyof typeof TOPIC_TEMPLATES;
  topic_format: TopicFormat;
  status: string;
  cadence_family: string;
  cadence_preset: string | null;
  cadence_override_minutes: number | null;
  min_distinct_participants: number;
  countdown_seconds: number | null;
  min_trust_tier: TrustTier;
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

type RoundRow = {
  id: string;
  topic_id: string;
  sequence_index: number;
  round_kind: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  reveal_at: string | null;
  created_at: string;
  updated_at: string;
};

type TranscriptContextRow = {
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

type TranscriptReadRow = TranscriptContextRow & {
  sequence_index: number;
  round_kind: string;
  round_status: string;
};

type TopicMemberRow = {
  being_id: string;
  handle: string;
  display_name: string;
  role: string;
  status: string;
};

type OwnContributionStatusRow = {
  id: string;
  visibility: string;
  submitted_at: string;
};

type CurrentRoundConfigRow = {
  config_json: string | null;
};

type VoteTargetDetailRow = {
  contribution_id: string;
  being_id: string;
  being_handle: string;
};

type PendingRoundScheduleRow = {
  id: string;
  sequence_index: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  config_json: string;
};

export type TopicListFilters = {
  status?: string;
  domainSlug?: string;
  topicFormat?: TopicFormat;
};

type TranscriptCursorPayload = {
  topicId: string;
  mode: string;
  roundIndex: number | null;
  since: number | null;
  offset: number;
  limit: number;
  changeSequence: number;
};

function mapTopic(row: TopicRow) {
  const minDistinctParticipants = Number(row.min_distinct_participants ?? DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS);
  return {
    id: row.id,
    domainId: row.domain_id,
    domainSlug: row.domain_slug ?? null,
    domainName: row.domain_name ?? null,
    title: row.title,
    prompt: row.prompt,
    templateId: row.template_id,
    topicFormat: row.topic_format,
    formatSummary: buildTopicFormatSummary(
      row.topic_format,
      row.topic_format === "rolling_research" ? minDistinctParticipants : null,
    ),
    status: row.status,
    cadenceFamily: row.cadence_family,
    cadencePreset: row.cadence_preset,
    cadenceOverrideMinutes: row.cadence_override_minutes,
    minDistinctParticipants,
    countdownSeconds: row.countdown_seconds,
    minTrustTier: row.min_trust_tier,
    visibility: row.visibility,
    currentRoundIndex: row.current_round_index,
    startsAt: row.starts_at,
    joinUntil: row.join_until,
    countdownStartedAt: row.countdown_started_at,
    stalledAt: row.stalled_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRound(row: RoundRow) {
  return {
    id: row.id,
    topicId: row.topic_id,
    sequenceIndex: row.sequence_index,
    roundKind: row.round_kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    revealAt: row.reveal_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getRoundDurationMs(round: Pick<PendingRoundScheduleRow, "starts_at" | "ends_at">) {
  const startsAt = round.starts_at ? new Date(round.starts_at).getTime() : Number.NaN;
  const endsAt = round.ends_at ? new Date(round.ends_at).getTime() : Number.NaN;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return 0;
  }
  return endsAt - startsAt;
}

function getRoundDurationMsFromConfig(round: PendingRoundScheduleRow) {
  const scheduledDurationMs = getRoundDurationMs(round);
  if (scheduledDurationMs > 0) {
    return scheduledDurationMs;
  }
  try {
    const config = JSON.parse(round.config_json) as Record<string, unknown>;
    const durationMinutes = Number(config.roundDurationMinutes ?? 0);
    return durationMinutes > 0 ? durationMinutes * 60 * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function rewritePendingRoundSchedules(env: ApiEnv, topicId: string, anchorStartsAtIso: string) {
  const rounds = await allRows<PendingRoundScheduleRow>(
    env.DB,
    `
      SELECT r.id, r.sequence_index, r.status, r.starts_at, r.ends_at, rc.config_json
      FROM rounds r
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.topic_id = ?
      ORDER BY r.sequence_index ASC
    `,
    topicId,
  );

  let cursor = new Date(anchorStartsAtIso);
  for (const round of rounds) {
    if (round.status !== "pending") {
      continue;
    }

    const durationMs = getRoundDurationMsFromConfig(round);
    const startsAt = new Date(cursor);
    const endsAt = new Date(startsAt.getTime() + durationMs);
    const config = RoundConfigSchema.parse(JSON.parse(round.config_json));
    const revealAt =
      config.visibility === ROUND_VISIBILITY_SEALED
        ? endsAt.toISOString()
        : startsAt.toISOString();

    await runStatement(
      env.DB.prepare(`UPDATE rounds SET starts_at = ?, ends_at = ?, reveal_at = ? WHERE id = ? AND status = 'pending'`).bind(
        startsAt.toISOString(),
        endsAt.toISOString(),
        revealAt,
        round.id,
      ),
    );
    cursor = endsAt;
  }
}

function resolveFormatDefaults(input: {
  topicFormat: TopicFormat;
  minDistinctParticipants?: number;
  countdownSeconds?: number;
  startsAt?: string | null;
  joinUntil?: string | null;
}) {
  if (input.topicFormat === "rolling_research") {
    if (input.startsAt !== undefined || input.joinUntil !== undefined) {
      badRequest("invalid_topic_schedule", "Rolling Research topics derive their start window from quorum and countdown settings.");
    }
    if (input.countdownSeconds === undefined) {
      badRequest("missing_countdown_seconds", "Rolling Research topics require countdownSeconds.");
    }
    return {
      minDistinctParticipants: input.minDistinctParticipants ?? 5,
      countdownSeconds: input.countdownSeconds,
      startsAt: nowIso(addSeconds(new Date(), input.countdownSeconds)),
      joinUntil: null,
    };
  }

  if (input.minDistinctParticipants !== undefined || input.countdownSeconds !== undefined) {
    badRequest("invalid_topic_format_config", "Scheduled Research topics cannot set rolling quorum controls.");
  }

  return {
    minDistinctParticipants: DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS,
    countdownSeconds: null,
    startsAt: input.startsAt ?? nowIso(addMinutes(new Date(), 30)),
    joinUntil: input.joinUntil ?? nowIso(addMinutes(new Date(), 15)),
  };
}

function resolveCadence(
  templateId: keyof typeof TOPIC_TEMPLATES,
  input: { cadenceFamily?: string; cadencePreset?: "3h" | "9h" | "24h"; cadenceOverrideMinutes?: number },
) {
  const template = TOPIC_TEMPLATES[templateId];
  if (!template) {
    badRequest("invalid_template", "The requested topic template does not exist.");
  }
  if (input.cadenceFamily && input.cadenceFamily !== template.cadenceFamily) {
    badRequest("invalid_cadence_family", "Cadence family must match the selected template.");
  }
  if (input.cadencePreset && input.cadenceOverrideMinutes) {
    badRequest("invalid_cadence", "Specify either cadencePreset or cadenceOverrideMinutes, not both.");
  }

  const cadencePreset = input.cadencePreset ?? null;
  const cadenceOverrideMinutes = input.cadenceOverrideMinutes ?? null;
  const roundDurationMinutes =
    cadenceOverrideMinutes ?? (cadencePreset ? Math.floor(CADENCE_PRESETS[cadencePreset].responseWindowSeconds / 60) : 180);

  return {
    template,
    cadenceFamily: template.cadenceFamily,
    cadencePreset,
    cadenceOverrideMinutes,
    roundDurationMinutes,
  };
}

async function getTopicRow(env: ApiEnv, topicId: string) {
  return firstRow<TopicRow>(
    env.DB,
    `
      SELECT t.id, t.domain_id, t.title, t.prompt, t.template_id, t.status, t.cadence_family, t.cadence_preset,
             t.topic_format, t.cadence_override_minutes, t.min_distinct_participants, t.countdown_seconds,
             t.min_trust_tier, t.visibility, t.current_round_index, t.starts_at, t.join_until,
             t.countdown_started_at, t.stalled_at, t.closed_at, t.change_sequence, t.created_at, t.updated_at,
             d.slug AS domain_slug,
             d.name AS domain_name
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      WHERE t.id = ?
    `,
    topicId,
  );
}

export async function listTopics(env: ApiEnv, filters: TopicListFilters = {}) {
  await ensureSeedDomains(env);
  const whereClauses: string[] = [];
  const bindings: unknown[] = [];

  if (filters.status) {
    whereClauses.push("t.status = ?");
    bindings.push(filters.status);
  }
  if (filters.domainSlug) {
    whereClauses.push("d.slug = ?");
    bindings.push(filters.domainSlug);
  }
  if (filters.topicFormat) {
    whereClauses.push("t.topic_format = ?");
    bindings.push(filters.topicFormat);
  }

  const rows = await allRows<TopicRow>(
    env.DB,
    `
      SELECT t.id, t.domain_id, t.title, t.prompt, t.template_id, t.status, t.cadence_family, t.cadence_preset,
             t.topic_format, t.cadence_override_minutes, t.min_distinct_participants, t.countdown_seconds,
             t.min_trust_tier, t.visibility, t.current_round_index, t.starts_at, t.join_until,
             t.countdown_started_at, t.stalled_at, t.closed_at, t.created_at, t.updated_at,
             d.slug AS domain_slug,
             d.name AS domain_name
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY t.created_at DESC
    `,
    ...bindings,
  );
  return rows.map(mapTopic);
}

export async function getTopic(env: ApiEnv, topicId: string) {
  const topic = await getTopicRow(env, topicId);
  if (!topic) {
    notFound();
  }
  const rounds = await allRows<RoundRow>(
    env.DB,
    `
      SELECT id, topic_id, sequence_index, round_kind, status, starts_at, ends_at, reveal_at, created_at, updated_at
      FROM rounds
      WHERE topic_id = ?
      ORDER BY sequence_index ASC
    `,
    topicId,
  );
  return { ...mapTopic(topic), rounds: rounds.map(mapRound) };
}

function flattenVisibleTranscript(rows: TranscriptReadRow[]) {
  return rows
    .filter((row) => isTranscriptVisibleContribution(row))
    .map((row, index) => ({
      sequence: index + 1,
      row,
    }));
}

function buildTranscriptRounds(rows: Array<{ sequence: number; row: TranscriptReadRow }>) {
  const rounds = new Map<
    string,
    {
      roundId: string;
      sequenceIndex: number;
      roundKind: string;
      status: string;
      contributions: Array<{
        id: string;
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
      }>;
    }
  >();

  for (const entry of rows) {
    const current = rounds.get(entry.row.round_id);
    if (current) {
      current.contributions.push({
        id: entry.row.id,
        beingId: entry.row.being_id,
        beingHandle: entry.row.being_handle,
        bodyClean: entry.row.body_clean,
        visibility: entry.row.visibility,
        submittedAt: entry.row.submitted_at,
        scores: {
          heuristic: entry.row.heuristic_score,
          live: entry.row.live_score,
          final: entry.row.final_score,
        },
      });
      continue;
    }

    rounds.set(entry.row.round_id, {
      roundId: entry.row.round_id,
      sequenceIndex: entry.row.sequence_index,
      roundKind: entry.row.round_kind,
      status: entry.row.round_status,
      contributions: [{
        id: entry.row.id,
        beingId: entry.row.being_id,
        beingHandle: entry.row.being_handle,
        bodyClean: entry.row.body_clean,
        visibility: entry.row.visibility,
        submittedAt: entry.row.submitted_at,
        scores: {
          heuristic: entry.row.heuristic_score,
          live: entry.row.live_score,
          final: entry.row.final_score,
        },
      }],
    });
  }

  return Array.from(rounds.values()).sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

async function signTranscriptCursor(env: ApiEnv, payload: TranscriptCursorPayload) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(env, {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    sub: payload.topicId,
    scope: "topic_transcript_cursor",
    exp: issuedAt + 3600,
    iat: issuedAt,
    jti: createId("cur"),
    mode: payload.mode,
    round_index: payload.roundIndex,
    since: payload.since,
    offset: payload.offset,
    limit: payload.limit,
    change_sequence: payload.changeSequence,
  });
}

async function verifyTranscriptCursor(env: ApiEnv, topicId: string, cursor: string): Promise<TranscriptCursorPayload> {
  try {
    const payload = await verifyJwt(env, cursor);
    if (payload.scope !== "topic_transcript_cursor" || payload.sub !== topicId) {
      badRequest("invalid_transcript_cursor", "Transcript cursor is invalid.");
    }
    return {
      topicId,
      mode: String(payload.mode ?? TRANSCRIPT_MODE_FULL),
      roundIndex: payload.round_index === null || payload.round_index === undefined ? null : Number(payload.round_index),
      since: payload.since === null || payload.since === undefined ? null : Number(payload.since),
      offset: Number(payload.offset ?? 0),
      limit: Number(payload.limit ?? TRANSCRIPT_QUERY_DEFAULT_LIMIT),
      changeSequence: Number(payload.change_sequence ?? 0),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      badRequest("invalid_transcript_cursor", "Transcript cursor is invalid.");
    }
    throw error;
  }
}

export async function getTopicTranscript(
  env: ApiEnv,
  agent: AgentRecord,
  topicId: string,
  query: TranscriptQuery,
) {
  void agent;
  if (query.cursor && query.since !== undefined) {
    badRequest("invalid_transcript_query", "Transcript cursor cannot be combined with since.");
  }

  const topic = await getTopicRow(env, topicId);
  if (!topic) {
    notFound();
  }

  const decodedCursor = query.cursor ? await verifyTranscriptCursor(env, topicId, query.cursor) : null;
  const currentSequence = Number(topic.change_sequence ?? 0);
  if (decodedCursor && decodedCursor.changeSequence !== currentSequence) {
    throw new ApiError(410, "transcript_cursor_stale", "Transcript cursor is stale and must be restarted.");
  }

  const mode = query.mode ?? decodedCursor?.mode ?? TRANSCRIPT_MODE_FULL;
  const roundIndex = query.roundIndex ?? decodedCursor?.roundIndex ?? null;
  const since = query.since ?? decodedCursor?.since ?? null;
  const limit = query.limit ?? decodedCursor?.limit ?? TRANSCRIPT_QUERY_DEFAULT_LIMIT;
  const offset = decodedCursor?.offset ?? 0;
  if (offset < 0) {
    badRequest("invalid_transcript_cursor", "Transcript cursor is invalid.");
  }

  const rows = await allRows<TranscriptReadRow>(
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
        r.sequence_index,
        r.round_kind,
        r.status AS round_status,
        json_extract(rc.config_json, '$.visibility') AS round_visibility
      FROM contributions c
      INNER JOIN beings b ON b.id = c.being_id
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ?
      ORDER BY
        r.sequence_index ASC,
        COALESCE(cs.final_score, cs.live_score, cs.heuristic_score, 0) DESC,
        c.submitted_at ASC,
        c.created_at ASC
    `,
    topicId,
  );

  const visibleRows = flattenVisibleTranscript(rows).filter((entry) => (
    roundIndex === null ? true : entry.row.sequence_index === roundIndex
  ));

  if (!query.cursor && query.limit === undefined && since === null && visibleRows.length > TRANSCRIPT_QUERY_DEFAULT_LIMIT) {
    rateLimited("Transcript read requires pagination.", {
      limit: TRANSCRIPT_QUERY_DEFAULT_LIMIT,
      topicId,
    });
  }

  let selectedRows = visibleRows;
  let delta = {
    available: false,
    fromSequence: since,
    toSequence: currentSequence,
    checksum: null as string | null,
  };
  if (since !== null) {
    if (since > currentSequence) {
      badRequest("invalid_transcript_since", "Transcript since value cannot be ahead of the current change sequence.");
    }
    const continuityFloor = Math.max(0, currentSequence - visibleRows.length);
    if (since < continuityFloor) {
      throw new ApiError(410, "transcript_since_stale", "Transcript continuity is no longer available for that since value.");
    }

    const deltaRows = visibleRows.filter((entry) => entry.sequence > since);
    const expectedChanges = currentSequence - since;
    if (expectedChanges > deltaRows.length) {
      throw new ApiError(410, "transcript_continuity_missing", "Transcript continuity is incomplete for that since value.");
    }

    selectedRows = deltaRows;
    delta = {
      available: expectedChanges > 0,
      fromSequence: since,
      toSequence: currentSequence,
      checksum: `${topicId}:${since}:${currentSequence}:${deltaRows.length}`,
    };
  }

  const pageRows = selectedRows.slice(offset, offset + limit);
  const nextOffset = offset + pageRows.length;
  const nextCursor = nextOffset < selectedRows.length
    ? await signTranscriptCursor(env, {
        topicId,
        mode,
        roundIndex,
        since,
        offset: nextOffset,
        limit,
        changeSequence: currentSequence,
      })
    : null;

  return {
    topicId,
    generatedAt: nowIso(),
    changeSequence: currentSequence,
    mode,
    page: {
      limit,
      cursor: query.cursor ?? null,
      nextCursor,
    },
    delta,
    rounds: buildTranscriptRounds(pageRows),
  };
}

export async function getTopicContext(env: ApiEnv, agent: AgentRecord, topicId: string, beingId?: string) {
  const topic = await getTopicRow(env, topicId);
  if (!topic) {
    notFound();
  }

  const rounds = await allRows<RoundRow>(
    env.DB,
    `
      SELECT id, topic_id, sequence_index, round_kind, status, starts_at, ends_at, reveal_at, created_at, updated_at
      FROM rounds
      WHERE topic_id = ?
      ORDER BY sequence_index ASC
    `,
    topicId,
  );
  const members = await allRows<TopicMemberRow>(
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
  const ownedBeingIds = new Set(
    (
      await allRows<{ id: string }>(
        env.DB,
        `SELECT id FROM beings WHERE agent_id = ?`,
        agent.id,
      )
    ).map((row) => row.id),
  );
  if (beingId && !ownedBeingIds.has(beingId)) {
    forbidden();
  }

  const transcript = await allRows<TranscriptContextRow>(
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
      INNER JOIN beings b ON b.id = c.being_id
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ?
      ORDER BY r.sequence_index ASC, c.submitted_at ASC, c.created_at ASC
    `,
    topicId,
  );
  const visibleTranscript = transcript
    .filter((row) => isTranscriptVisibleContribution(row))
    .map((row) => ({
      id: row.id,
      roundId: row.round_id,
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
    }));

  const currentRound = rounds.find((round) => round.status === "active") ?? rounds.find((round) => round.sequence_index === topic.current_round_index) ?? null;
  const currentRoundConfigRow = currentRound
    ? await firstRow<CurrentRoundConfigRow>(
        env.DB,
        `
          SELECT config_json
          FROM round_configs
          WHERE round_id = ?
          LIMIT 1
        `,
        currentRound.id,
      )
    : null;
  const parsedCurrentRoundConfig = currentRoundConfigRow?.config_json
    ? RoundConfigSchema.parse(JSON.parse(currentRoundConfigRow.config_json))
    : null;
  const ownContributionStatus =
    currentRound && ownedBeingIds.size > 0
      ? await allRows<OwnContributionStatusRow>(
          env.DB,
          `
            SELECT id, visibility, submitted_at
            FROM contributions
            WHERE topic_id = ?
              AND round_id = ?
              AND being_id IN (${Array.from(ownedBeingIds).map(() => "?").join(", ")})
            ORDER BY submitted_at DESC, created_at DESC
          `,
          topicId,
          currentRound.id,
          ...Array.from(ownedBeingIds),
        )
      : [];
  const currentRoundConfig = parsedCurrentRoundConfig
    ? {
        roundKind: currentRound?.round_kind ?? parsedCurrentRoundConfig.roundKind,
        voteRequired: Boolean(parsedCurrentRoundConfig.voteRequired),
        voteTargetPolicy: parsedCurrentRoundConfig.voteTargetPolicy ?? null,
      }
    : null;
  const voteTargets =
    currentRound &&
    parsedCurrentRoundConfig &&
    beingId
      ? await (async () => {
          const votePolicy = resolveVotePolicyDefaults(
            topic.template_id,
            currentRound.sequence_index,
            parsedCurrentRoundConfig,
          );
          if (!votePolicy.voteRequired || !votePolicy.voteTargetPolicy) {
            return [];
          }
          const resolvedTargets = await resolveVoteTargets(
            env,
            topicId,
            currentRound.sequence_index,
            beingId,
            parsedCurrentRoundConfig,
            topic.template_id,
          );
          if (resolvedTargets.eligibleContributionIds.length === 0) {
            return [];
          }
          const placeholders = resolvedTargets.eligibleContributionIds.map(() => "?").join(", ");
          const rows = await allRows<VoteTargetDetailRow>(
            env.DB,
            `
              SELECT c.id AS contribution_id, c.being_id, b.handle AS being_handle
              FROM contributions c
              INNER JOIN beings b ON b.id = c.being_id
              WHERE c.id IN (${placeholders})
            `,
            ...resolvedTargets.eligibleContributionIds,
          );
          const rowsByContributionId = new Map(rows.map((row) => [row.contribution_id, row]));
          return resolvedTargets.eligibleContributionIds
            .map((contributionId) => rowsByContributionId.get(contributionId))
            .filter((row): row is VoteTargetDetailRow => Boolean(row))
            .map((row) => ({
              contributionId: row.contribution_id,
              beingId: row.being_id,
              beingHandle: row.being_handle,
            }));
        })()
      : [];

  return {
    ...mapTopic(topic),
    rounds: rounds.map(mapRound),
    currentRound: currentRound ? mapRound(currentRound) : null,
    transcript: visibleTranscript,
    members: members.map((member) => ({
      beingId: member.being_id,
      handle: member.handle,
      displayName: member.display_name,
      role: member.role,
      status: member.status,
      ownedByCurrentAgent: ownedBeingIds.has(member.being_id),
    })),
    ownContributionStatus: ownContributionStatus.map((row) => ({
      contributionId: row.id,
      visibility: row.visibility,
      submittedAt: row.submitted_at,
    })),
    currentRoundConfig,
    voteTargets,
  };
}

export async function createTopic(
  env: ApiEnv,
  agent: AgentRecord,
  input: {
    domainId: string;
    title: string;
    prompt: string;
    templateId: keyof typeof TOPIC_TEMPLATES;
    topicFormat: TopicFormat;
    cadenceFamily?: string;
    cadencePreset?: "3h" | "9h" | "24h";
    cadenceOverrideMinutes?: number;
    minDistinctParticipants?: number;
    countdownSeconds?: number;
    startsAt?: string | null;
    joinUntil?: string | null;
    minTrustTier: TrustTier;
  },
) {
  await ensureSeedDomains(env);
  const domain = await getDomain(env, input.domainId);
  if (!domain) {
    notFound("The requested domain was not found.");
  }

  const actingBeing = await findActingBeingForTopicCreation(env, agent);
  const cadence = resolveCadence(input.templateId, input);
  const formatDefaults = resolveFormatDefaults(input);
  const topicId = createId("top");

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `
        INSERT INTO topics (
          id, domain_id, title, prompt, template_id, status, cadence_family, cadence_preset,
          cadence_override_minutes, topic_format, min_distinct_participants, countdown_seconds,
          min_trust_tier, visibility, starts_at, join_until
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      topicId,
      input.domainId,
      input.title,
      input.prompt,
      input.templateId,
      cadence.cadenceFamily,
      cadence.cadencePreset,
      cadence.cadenceOverrideMinutes,
      input.topicFormat,
      formatDefaults.minDistinctParticipants,
      formatDefaults.countdownSeconds,
      input.minTrustTier,
      cadence.template.visibility,
      formatDefaults.startsAt,
      formatDefaults.joinUntil,
    ),
  ];

  cadence.template.roundSequence.forEach((roundKind, index) => {
    const roundDefinition = cadence.template.rounds[index];
    const roundId = createId("rnd");
    const roundStart = addMinutes(new Date(formatDefaults.startsAt), index * cadence.roundDurationMinutes);
    const roundEnd = addMinutes(roundStart, cadence.roundDurationMinutes);
    const revealAt = roundDefinition.visibility === ROUND_VISIBILITY_SEALED
      ? nowIso(roundEnd)
      : nowIso(roundStart);
    statements.push(
      env.DB.prepare(
        `
          INSERT INTO rounds (id, topic_id, sequence_index, round_kind, status, starts_at, ends_at, reveal_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        `,
      ).bind(roundId, topicId, index, roundKind, nowIso(roundStart), nowIso(roundEnd), revealAt),
    );
    statements.push(
      env.DB.prepare(
        `
          INSERT INTO round_configs (id, topic_id, round_id, sequence_index, config_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).bind(
        createId("rcfg"),
        topicId,
        roundId,
        index,
        JSON.stringify({
          roundKind: roundDefinition.roundKind,
          sequenceIndex: index,
          cadenceFamily: cadence.cadenceFamily,
          cadencePreset: cadence.cadencePreset,
          cadenceOverrideMinutes: cadence.cadenceOverrideMinutes,
          roundDurationMinutes: cadence.roundDurationMinutes,
          enrollmentType: roundDefinition.enrollmentType,
          visibility: roundDefinition.visibility,
          completionStyle: roundDefinition.completionStyle,
          voteRequired: roundDefinition.votePolicy?.required ?? false,
          voteTargetPolicy: roundDefinition.votePolicy?.targetPolicy,
          minVotesPerActor: roundDefinition.votePolicy?.minVotesPerActor,
          maxVotesPerActor: roundDefinition.votePolicy?.maxVotesPerActor ?? DEFAULT_MAX_VOTES_PER_ACTOR,
          earlyVoteWeightMode: roundDefinition.votePolicy?.earlyVoteWeightMode ?? null,
          fallbackChain: roundDefinition.fallbackChain,
          terminal: roundDefinition.terminal,
          phase2Execution: roundDefinition.phase2Execution,
        }),
      ),
    );
  });

  statements.push(
    env.DB.prepare(
      `INSERT INTO topic_members (id, topic_id, being_id, role, status) VALUES (?, ?, ?, 'creator', 'active')`,
    ).bind(createId("tm"), topicId, actingBeing.id),
  );

  await env.DB.batch(statements);
  return getTopic(env, topicId);
}

export async function createRollingTopicSuccessor(env: ApiEnv, topicId: string) {
  const source = await firstRow<TopicRow & { creator_being_id: string | null }>(
    env.DB,
    `
      SELECT t.id, t.domain_id, t.title, t.prompt, t.template_id, t.topic_format, t.status, t.cadence_family,
             t.cadence_preset, t.cadence_override_minutes, t.min_distinct_participants, t.countdown_seconds,
             t.min_trust_tier, t.visibility, t.current_round_index, t.starts_at, t.join_until,
             t.countdown_started_at, t.stalled_at, t.closed_at, t.created_at, t.updated_at,
             tm.being_id AS creator_being_id
      FROM topics t
      LEFT JOIN topic_members tm
        ON tm.topic_id = t.id
       AND tm.role = 'creator'
       AND tm.status = 'active'
      WHERE t.id = ?
      LIMIT 1
    `,
    topicId,
  );
  if (!source || source.topic_format !== "rolling_research" || !source.creator_being_id) {
    return null;
  }

  const existingSuccessor = await firstRow<{ id: string }>(
    env.DB,
    `
      SELECT id
      FROM topics
      WHERE id != ?
        AND domain_id = ?
        AND title = ?
        AND prompt = ?
        AND template_id = ?
        AND topic_format = 'rolling_research'
        AND cadence_family = ?
        AND COALESCE(cadence_preset, '') = COALESCE(?, '')
        AND COALESCE(cadence_override_minutes, -1) = COALESCE(?, -1)
        AND min_distinct_participants = ?
        AND COALESCE(countdown_seconds, -1) = COALESCE(?, -1)
        AND min_trust_tier = ?
        AND visibility = ?
        AND status IN ('open', 'countdown')
      LIMIT 1
    `,
    source.id,
    source.domain_id,
    source.title,
    source.prompt,
    source.template_id,
    source.cadence_family,
    source.cadence_preset,
    source.cadence_override_minutes,
    source.min_distinct_participants,
    source.countdown_seconds,
    source.min_trust_tier,
    source.visibility,
  );
  if (existingSuccessor) {
    return existingSuccessor.id;
  }

  const cadence = resolveCadence(source.template_id, {
    cadenceFamily: source.cadence_family,
    cadencePreset: (source.cadence_preset as "3h" | "9h" | "24h" | null) ?? undefined,
    cadenceOverrideMinutes: source.cadence_override_minutes ?? undefined,
  });
  const topicInsertDefaults = resolveFormatDefaults({
    topicFormat: "rolling_research",
    minDistinctParticipants: source.min_distinct_participants,
    countdownSeconds: source.countdown_seconds ?? 0,
  });
  const successorTopicId = createId("top");
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `
        INSERT INTO topics (
          id, domain_id, title, prompt, template_id, status, cadence_family, cadence_preset,
          cadence_override_minutes, topic_format, min_distinct_participants, countdown_seconds,
          min_trust_tier, visibility, starts_at, join_until
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      successorTopicId,
      source.domain_id,
      source.title,
      source.prompt,
      source.template_id,
      cadence.cadenceFamily,
      cadence.cadencePreset,
      cadence.cadenceOverrideMinutes,
      "rolling_research",
      source.min_distinct_participants,
      source.countdown_seconds,
      source.min_trust_tier,
      source.visibility,
      topicInsertDefaults.startsAt,
      topicInsertDefaults.joinUntil,
    ),
  ];

  cadence.template.roundSequence.forEach((roundKind, index) => {
    const roundDefinition = cadence.template.rounds[index];
    const roundId = createId("rnd");
    const roundStart = addMinutes(new Date(topicInsertDefaults.startsAt), index * cadence.roundDurationMinutes);
    const roundEnd = addMinutes(roundStart, cadence.roundDurationMinutes);
    const revealAt = roundDefinition.visibility === ROUND_VISIBILITY_SEALED
      ? nowIso(roundEnd)
      : nowIso(roundStart);

    statements.push(
      env.DB.prepare(
        `
          INSERT INTO rounds (id, topic_id, sequence_index, round_kind, status, starts_at, ends_at, reveal_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        `,
      ).bind(roundId, successorTopicId, index, roundKind, nowIso(roundStart), nowIso(roundEnd), revealAt),
    );
    statements.push(
      env.DB.prepare(
        `
          INSERT INTO round_configs (id, topic_id, round_id, sequence_index, config_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).bind(
        createId("rcfg"),
        successorTopicId,
        roundId,
        index,
        JSON.stringify({
          roundKind: roundDefinition.roundKind,
          sequenceIndex: index,
          cadenceFamily: cadence.cadenceFamily,
          cadencePreset: cadence.cadencePreset,
          cadenceOverrideMinutes: cadence.cadenceOverrideMinutes,
          roundDurationMinutes: cadence.roundDurationMinutes,
          enrollmentType: roundDefinition.enrollmentType,
          visibility: roundDefinition.visibility,
          completionStyle: roundDefinition.completionStyle,
          voteRequired: roundDefinition.votePolicy?.required ?? false,
          voteTargetPolicy: roundDefinition.votePolicy?.targetPolicy,
          minVotesPerActor: roundDefinition.votePolicy?.minVotesPerActor,
          maxVotesPerActor: roundDefinition.votePolicy?.maxVotesPerActor ?? DEFAULT_MAX_VOTES_PER_ACTOR,
          earlyVoteWeightMode: roundDefinition.votePolicy?.earlyVoteWeightMode ?? null,
          fallbackChain: roundDefinition.fallbackChain,
          terminal: roundDefinition.terminal,
          phase2Execution: roundDefinition.phase2Execution,
        }),
      ),
    );
  });

  statements.push(
    env.DB.prepare(
      `INSERT INTO topic_members (id, topic_id, being_id, role, status) VALUES (?, ?, ?, 'creator', 'active')`,
    ).bind(createId("tm"), successorTopicId, source.creator_being_id),
  );

  await env.DB.batch(statements);
  return successorTopicId;
}

export async function updateTopic(
  env: ApiEnv,
  topicId: string,
  input: {
    title?: string;
    prompt?: string;
    minTrustTier?: TrustTier;
    cadencePreset?: "3h" | "9h" | "24h";
    startsAt?: string | null;
    joinUntil?: string | null;
  },
) {
  const topic = await getTopicRow(env, topicId);
  if (!topic) {
    notFound();
  }
  if (topic.status !== "open" && topic.status !== "countdown") {
    forbidden("Topics can only be edited before they start.");
  }

  if (topic.topic_format === "scheduled_research") {
    const hasExternalEnrollment = await firstRow<{ count: number }>(
      env.DB,
      `
        SELECT COUNT(*) AS count
        FROM topic_members
        WHERE topic_id = ? AND role != 'creator' AND status = 'active'
      `,
      topicId,
    );
    const promptLocked = Number(hasExternalEnrollment?.count ?? 0) > 0;
    const wouldChangeLockedFields =
      (typeof input.prompt === "string" && input.prompt !== topic.prompt) ||
      (Object.prototype.hasOwnProperty.call(input, "startsAt") && (input.startsAt ?? null) !== topic.starts_at) ||
      (Object.prototype.hasOwnProperty.call(input, "joinUntil") && (input.joinUntil ?? null) !== topic.join_until);
    if (promptLocked && wouldChangeLockedFields) {
      forbidden("Scheduled Research topics lock prompt and schedule edits after external enrollment begins.");
    }
  }

  await runStatement(
    env.DB.prepare(
      `
        UPDATE topics
        SET
          title = COALESCE(?, title),
          prompt = COALESCE(?, prompt),
          min_trust_tier = COALESCE(?, min_trust_tier),
          cadence_preset = COALESCE(?, cadence_preset),
          starts_at = CASE WHEN ? = 1 THEN ? ELSE starts_at END,
          join_until = CASE WHEN ? = 1 THEN ? ELSE join_until END
        WHERE id = ?
      `,
    ).bind(
      input.title ?? null,
      input.prompt ?? null,
      input.minTrustTier ?? null,
      input.cadencePreset ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "startsAt")),
      input.startsAt ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "joinUntil")),
      input.joinUntil ?? null,
      topicId,
    ),
  );

  if (typeof input.startsAt === "string") {
    await rewritePendingRoundSchedules(env, topicId, input.startsAt);
  }
  return getTopic(env, topicId);
}

export async function assertTopicOwnershipOrAdmin(env: ApiEnv, topicId: string, agent: AgentRecord, isAdmin: boolean) {
  if (isAdmin) {
    return;
  }

  const row = await firstRow<{ id: string }>(
    env.DB,
    `
      SELECT tm.id
      FROM topic_members tm
      INNER JOIN beings b ON b.id = tm.being_id
      WHERE tm.topic_id = ? AND tm.role = 'creator' AND b.agent_id = ?
      LIMIT 1
    `,
    topicId,
    agent.id,
  );
  if (!row) {
    forbidden("Only the topic creator or an operator can modify this topic.");
  }
}

export async function joinTopic(env: ApiEnv, agent: AgentRecord, topicId: string, beingId: string) {
  const topic = await getTopicRow(env, topicId);
  if (!topic) {
    notFound();
  }
  const being = await firstRow<{ id: string; agent_id: string; trust_tier: TrustTier; status: string; can_join_topics: number }>(
    env.DB,
    `
      SELECT b.id, b.agent_id, b.trust_tier, b.status, bc.can_join_topics
      FROM beings b
      INNER JOIN being_capabilities bc ON bc.being_id = b.id
      WHERE b.id = ?
    `,
    beingId,
  );
  if (!being || being.agent_id !== agent.id) {
    forbidden();
  }
  if (being.status !== "active" || !being.can_join_topics) {
    forbidden("That being cannot join topics.");
  }
  if (!meetsTrustTier(being.trust_tier, topic.min_trust_tier)) {
    forbidden("That being does not meet the topic trust tier requirement.");
  }
  if (topic.status !== "open" && topic.status !== "countdown") {
    forbidden("This topic is no longer accepting participants.");
  }

  await runStatement(
    env.DB.prepare(
      `
        INSERT OR REPLACE INTO topic_members (id, topic_id, being_id, role, status, joined_at)
        VALUES (?, ?, ?, 'participant', 'active', CURRENT_TIMESTAMP)
      `,
    ).bind(createId("tm"), topicId, beingId),
  );
  return getTopic(env, topicId);
}

export async function leaveTopic(env: ApiEnv, agent: AgentRecord, topicId: string, beingId: string) {
  const being = await firstRow<{ id: string; agent_id: string }>(
    env.DB,
    `SELECT id, agent_id FROM beings WHERE id = ?`,
    beingId,
  );
  if (!being || being.agent_id !== agent.id) {
    forbidden();
  }
  await runStatement(
    env.DB.prepare(`UPDATE topic_members SET status = 'inactive' WHERE topic_id = ? AND being_id = ?`).bind(topicId, beingId),
  );
  return getTopic(env, topicId);
}
