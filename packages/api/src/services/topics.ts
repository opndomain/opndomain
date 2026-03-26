import { CADENCE_PRESETS, TOPIC_TEMPLATES, type TrustTier } from "@opndomain/shared";
import { DEFAULT_MAX_VOTES_PER_ACTOR, ROUND_VISIBILITY_SEALED } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { meetsTrustTier } from "../lib/trust.js";
import { addMinutes, nowIso } from "../lib/time.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import type { AgentRecord } from "./auth.js";
import { findActingBeingForTopicCreation } from "./beings.js";
import { ensureSeedDomains, getDomain } from "./domains.js";

type TopicRow = {
  id: string;
  domain_id: string;
  domain_slug?: string | null;
  domain_name?: string | null;
  title: string;
  prompt: string;
  template_id: keyof typeof TOPIC_TEMPLATES;
  status: string;
  cadence_family: string;
  cadence_preset: string | null;
  cadence_override_minutes: number | null;
  min_trust_tier: TrustTier;
  visibility: string;
  current_round_index: number;
  starts_at: string | null;
  join_until: string | null;
  countdown_started_at: string | null;
  stalled_at: string | null;
  closed_at: string | null;
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

export type TopicListFilters = {
  status?: string;
  domainSlug?: string;
};

function mapTopic(row: TopicRow) {
  return {
    id: row.id,
    domainId: row.domain_id,
    domainSlug: row.domain_slug ?? null,
    domainName: row.domain_name ?? null,
    title: row.title,
    prompt: row.prompt,
    templateId: row.template_id,
    status: row.status,
    cadenceFamily: row.cadence_family,
    cadencePreset: row.cadence_preset,
    cadenceOverrideMinutes: row.cadence_override_minutes,
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
             t.cadence_override_minutes, t.min_trust_tier, t.visibility, t.current_round_index, t.starts_at,
             t.join_until, t.countdown_started_at, t.stalled_at, t.closed_at, t.created_at, t.updated_at,
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

  const rows = await allRows<TopicRow>(
    env.DB,
    `
      SELECT t.id, t.domain_id, t.title, t.prompt, t.template_id, t.status, t.cadence_family, t.cadence_preset,
             t.cadence_override_minutes, t.min_trust_tier, t.visibility, t.current_round_index, t.starts_at,
             t.join_until, t.countdown_started_at, t.stalled_at, t.closed_at, t.created_at, t.updated_at,
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
    cadenceFamily?: string;
    cadencePreset?: "3h" | "9h" | "24h";
    cadenceOverrideMinutes?: number;
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
  const topicId = createId("top");
  const startsAt = nowIso(addMinutes(new Date(), 30));
  const joinUntil = nowIso(addMinutes(new Date(), 15));

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `
        INSERT INTO topics (
          id, domain_id, title, prompt, template_id, status, cadence_family, cadence_preset,
          cadence_override_minutes, min_trust_tier, visibility, starts_at, join_until
        ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
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
      input.minTrustTier,
      cadence.template.visibility,
      startsAt,
      joinUntil,
    ),
  ];

  cadence.template.roundSequence.forEach((roundKind, index) => {
    const roundDefinition = cadence.template.rounds[index];
    const roundId = createId("rnd");
    const roundStart = addMinutes(new Date(startsAt), index * cadence.roundDurationMinutes);
    const roundEnd = addMinutes(roundStart, cadence.roundDurationMinutes);
    const revealAt = roundDefinition.visibility === ROUND_VISIBILITY_SEALED ? nowIso(roundEnd) : nowIso(roundStart);
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
          minVotesPerActor: roundDefinition.votePolicy?.minVotesPerActor ?? null,
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

export async function updateTopic(
  env: ApiEnv,
  topicId: string,
  input: {
    title?: string;
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

  await runStatement(
    env.DB.prepare(
      `
        UPDATE topics
        SET
          title = COALESCE(?, title),
          min_trust_tier = COALESCE(?, min_trust_tier),
          cadence_preset = COALESCE(?, cadence_preset),
          starts_at = CASE WHEN ? = 1 THEN ? ELSE starts_at END,
          join_until = CASE WHEN ? = 1 THEN ? ELSE join_until END
        WHERE id = ?
      `,
    ).bind(
      input.title ?? null,
      input.minTrustTier ?? null,
      input.cadencePreset ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "startsAt")),
      input.startsAt ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "joinUntil")),
      input.joinUntil ?? null,
      topicId,
    ),
  );
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
