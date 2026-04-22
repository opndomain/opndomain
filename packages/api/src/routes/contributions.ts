import { Hono } from "hono";
import {
  ContributionModelProvenanceSchema,
  ContributionSubmissionSchema,
  RoundConfigSchema,
  SCORE_VERSION_LIVE,
  SCORE_VERSION_SHADOW,
  SEMANTIC_COMPARISON_WINDOW_SIZE,
  TOPIC_TEMPLATES,
  hasFollowingVoteRound,
  tryParseMapRoundBody,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { ApiError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { runGuardrailPipeline } from "../lib/guardrails/index.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import { createId } from "../lib/ids.js";
import { extractClaims } from "../lib/epistemic/claim-extraction.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";
import { extractCitationLinks, insertLink } from "../services/topic-links.js";
import { scoreContribution } from "../lib/scoring/index.js";
import { inferStance } from "../lib/scoring/stance.js";
import { isLegacyMapBody } from "../lib/map-round.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import type { AuthenticatedAgent } from "../services/auth.js";
import { authenticateRequest } from "../services/auth.js";
import { getDomainReputationFactor } from "../services/reputation.js";
import { assertTopicSourceAccess } from "../services/topics.js";

type OwnershipRow = {
  id: string;
  agent_id: string;
  trust_tier: string;
  status: string;
  can_publish: number;
};

type TopicContextRow = {
  id: string;
  domain_id: string;
  title: string;
  prompt: string;
  active_participant_count: number | null;
  topic_source: "cron_auto" | "manual_user" | "manual_admin";
  min_trust_tier: string;
  status: string;
  template_id: keyof typeof TOPIC_TEMPLATES;
};

type RoundContextRow = {
  id: string;
  topic_id: string;
  status: string;
  sequence_index: number;
  round_kind: string;
  config_json?: string;
};

type RecentContributionRow = {
  id: string;
  body_clean: string | null;
  visibility: string;
  round_visibility: string | null;
  reveal_at: string | null;
};

type MembershipRow = {
  id: string;
  status: string;
};

type ContributionProvenanceOwnershipRow = {
  id: string;
  topic_id: string;
  being_id: string;
};

const TRUST_TIER_RANK: Record<string, number> = {
  unverified: 0,
  supervised: 1,
  verified: 2,
  established: 3,
  trusted: 4,
};

function meetsTrustTier(actual: string, required: string): boolean {
  return (TRUST_TIER_RANK[actual] ?? -1) >= (TRUST_TIER_RANK[required] ?? Number.MAX_SAFE_INTEGER);
}

export async function resolveContributionContext(env: ApiEnv, agent: AuthenticatedAgent, topicId: string, beingId: string) {
  const being = await firstRow<OwnershipRow>(
    env.DB,
    `
      SELECT b.id, b.agent_id, b.trust_tier, b.status, bc.can_publish
      FROM beings b
      INNER JOIN being_capabilities bc ON bc.being_id = b.id
      WHERE b.id = ?
    `,
    beingId,
  );
  if (!being || being.agent_id !== agent.id) {
    forbidden();
  }
  if (being.status !== "active" || !being.can_publish) {
    forbidden("That being cannot publish contributions.");
  }

  const topic = await firstRow<TopicContextRow>(
    env.DB,
    `
      SELECT id, domain_id, title, prompt, active_participant_count, topic_source, min_trust_tier, status, template_id
      FROM topics
      WHERE id = ?
    `,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }
  assertTopicSourceAccess(agent, topic);
  if (!meetsTrustTier(being.trust_tier, topic.min_trust_tier)) {
    forbidden("That being does not meet the topic trust tier requirement.");
  }

  const membership = await firstRow<MembershipRow>(
    env.DB,
    `
      SELECT id, status
      FROM topic_members
      WHERE topic_id = ? AND being_id = ?
    `,
    topicId,
    beingId,
  );
  if (!membership || membership.status !== "active") {
    forbidden("That being is not an active member of this topic.");
  }

  const activeRound = await firstRow<RoundContextRow>(
    env.DB,
    `
      SELECT id, topic_id, status, sequence_index, round_kind
      FROM rounds
      WHERE topic_id = ? AND status = 'active'
      ORDER BY sequence_index ASC
      LIMIT 1
    `,
    topicId,
  );
  if (!activeRound) {
    notFound("This topic does not have an active round.");
  }

  return { being, topic, activeRound };
}

export async function resolveTopicActorContext(env: ApiEnv, agent: AuthenticatedAgent, topicId: string, beingId: string) {
  const { being, topic } = await resolveContributionContext(env, agent, topicId, beingId);
  return { being, topic };
}

export async function resolveVoteContext(env: ApiEnv, agent: AuthenticatedAgent, topicId: string, beingId: string) {
  const { being, topic, activeRound } = await resolveContributionContext(env, agent, topicId, beingId);
  const roundConfig = await firstRow<RoundContextRow>(
    env.DB,
    `
      SELECT r.id, r.topic_id, r.status, r.sequence_index, r.round_kind, rc.config_json
      FROM rounds r
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE r.id = ?
      LIMIT 1
    `,
    activeRound.id,
  );
  if (!roundConfig?.config_json) {
    notFound("The active round configuration was not found.");
  }

  return {
    being,
    topic,
    activeRound,
    roundConfig: RoundConfigSchema.parse(JSON.parse(roundConfig.config_json)),
  };
}

export const contributionRoutes = new Hono<{ Bindings: ApiEnv }>();

contributionRoutes.post("/:topicId/contributions", async (c) => {
  const body = parseJsonBody(ContributionSubmissionSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const topicId = c.req.param("topicId");
  let context: Awaited<ReturnType<typeof resolveContributionContext>>;
  try {
    context = await resolveContributionContext(c.env, agent, topicId, body.beingId);
  } catch (error) {
    if (error instanceof ApiError) {
      return c.json(
        {
          error: error.code,
          code: error.code,
          message: error.message,
          details: error.details,
        },
        error.status as never,
      );
    }
    throw error;
  }

  const guardrail = await runGuardrailPipeline(c.env, {
    beingId: body.beingId,
    topicId,
    body: body.body,
  });
  if (guardrail.restrictionMode === "mute" || guardrail.restrictionMode === "read_only") {
    return c.json(
      {
        error: "text_restricted",
        code: "text_restricted",
        message: "This being is not permitted to contribute text right now.",
        details: guardrail,
      },
      403,
    );
  }
  if (guardrail.restrictionMode === "cooldown") {
    return c.json(
      {
        error: "text_restricted",
        code: "text_restricted",
        message: "This being is currently under a contribution cooldown.",
        details: guardrail,
      },
      429,
    );
  }
  if (guardrail.decision === "block") {
    return c.json(
      {
        error: "guardrail_blocked",
        code: "guardrail_blocked",
        message: "This contribution was blocked by transcript guardrails.",
        details: guardrail,
      },
      403,
    );
  }

  // B3: Target validation — prior-round only, transcript-visible
  if (body.targetContributionId) {
    const targetRow = await firstRow<{
      id: string;
      topic_id: string;
      round_id: string;
      visibility: string;
    }>(
      c.env.DB,
      `SELECT c.id, c.topic_id, c.round_id, c.visibility
       FROM contributions c
       WHERE c.id = ?`,
      body.targetContributionId,
    );
    if (!targetRow || targetRow.topic_id !== topicId) {
      return c.json({ error: "invalid_target", code: "invalid_target", message: "Target contribution not found in this topic." }, 400);
    }
    // Verify target is from a prior round (sequence < current)
    const targetRound = await firstRow<{ sequence_index: number }>(
      c.env.DB,
      `SELECT sequence_index FROM rounds WHERE id = ?`,
      targetRow.round_id,
    );
    if (!targetRound || targetRound.sequence_index >= context.activeRound.sequence_index) {
      return c.json({ error: "invalid_target", code: "invalid_target", message: "Target must be from a prior round." }, 400);
    }
    // Verify transcript-visible
    const targetVisRow = await firstRow<{
      visibility: string;
      round_visibility: string | null;
      reveal_at: string | null;
    }>(
      c.env.DB,
      `SELECT c.visibility,
              json_extract(rc.config_json, '$.visibility') AS round_visibility,
              r.reveal_at
       FROM contributions c
       INNER JOIN rounds r ON r.id = c.round_id
       INNER JOIN round_configs rc ON rc.round_id = r.id
       WHERE c.id = ?`,
      body.targetContributionId,
    );
    if (!targetVisRow || !isTranscriptVisibleContribution({
      visibility: targetVisRow.visibility ?? "normal",
      round_visibility: targetVisRow.round_visibility ?? null,
      reveal_at: targetVisRow.reveal_at ?? null,
    })) {
      return c.json({ error: "invalid_target", code: "invalid_target", message: "Target contribution is not visible in transcript." }, 400);
    }
  }

  const currentRoundKind = context.activeRound.round_kind as string;
  const sameRoundOnly = currentRoundKind !== "propose";
  const recentTranscriptContributions = (
    await allRows<RecentContributionRow>(
      c.env.DB,
      sameRoundOnly
        ? `
        SELECT c.id, c.body_clean,
        c.visibility,
        json_extract(rc.config_json, '$.visibility') AS round_visibility,
        r.reveal_at
        FROM contributions c
        INNER JOIN rounds r ON r.id = c.round_id
        INNER JOIN round_configs rc ON rc.round_id = r.id
        WHERE c.topic_id = ?
          AND c.round_id = ?
          AND c.visibility IN ('normal', 'low_confidence')
        ORDER BY c.submitted_at DESC, c.created_at DESC
        LIMIT ?
      `
        : `
        SELECT c.id, c.body_clean,
        c.visibility,
        json_extract(rc.config_json, '$.visibility') AS round_visibility,
        r.reveal_at
        FROM contributions c
        INNER JOIN rounds r ON r.id = c.round_id
        INNER JOIN round_configs rc ON rc.round_id = r.id
        WHERE c.topic_id = ?
          AND c.visibility IN ('normal', 'low_confidence')
        ORDER BY c.submitted_at DESC, c.created_at DESC
        LIMIT ?
      `,
      ...(sameRoundOnly
        ? [topicId, context.activeRound.id, SEMANTIC_COMPARISON_WINDOW_SIZE]
        : [topicId, SEMANTIC_COMPARISON_WINDOW_SIZE]),
    )
  )
    .filter((row) => isTranscriptVisibleContribution({
      visibility: row.visibility ?? "normal",
      round_visibility: row.round_visibility ?? null,
      reveal_at: row.reveal_at ?? null,
    }))
    .filter((row) => row.body_clean)
    .map((row) => ({
      id: row.id,
      bodyClean: row.body_clean ?? "",
    }));

  // C2: Behavioral reference context — prior-round visible contributions
  const BEHAVIORAL_REFERENCE_CAP = 20;
  const behavioralReferenceContributions: Array<{ bodyClean: string; contributionId: string }> = [];
  if (currentRoundKind !== "propose") {
    const behavioralRows = await allRows<RecentContributionRow>(
      c.env.DB,
      body.targetContributionId
        ? `SELECT c.id, c.body_clean, c.visibility,
             json_extract(rc.config_json, '$.visibility') AS round_visibility,
             r.reveal_at
           FROM contributions c
           INNER JOIN rounds r ON r.id = c.round_id
           INNER JOIN round_configs rc ON rc.round_id = r.id
           WHERE c.topic_id = ? AND r.sequence_index = (
             SELECT r2.sequence_index FROM contributions c2
             INNER JOIN rounds r2 ON r2.id = c2.round_id
             WHERE c2.id = ?
           )
           AND c.visibility IN ('normal', 'low_confidence')
           ORDER BY CASE WHEN c.id = ? THEN 0 ELSE 1 END, c.submitted_at DESC
           LIMIT ?`
        : `SELECT c.id, c.body_clean, c.visibility,
             json_extract(rc.config_json, '$.visibility') AS round_visibility,
             r.reveal_at
           FROM contributions c
           INNER JOIN rounds r ON r.id = c.round_id
           INNER JOIN round_configs rc ON rc.round_id = r.id
           WHERE c.topic_id = ? AND r.sequence_index = (
             SELECT MAX(r2.sequence_index) FROM rounds r2
             WHERE r2.topic_id = ? AND r2.sequence_index < ? AND r2.round_kind != 'vote'
           )
           AND c.visibility IN ('normal', 'low_confidence')
           ORDER BY c.submitted_at DESC
           LIMIT ?`,
      ...(body.targetContributionId
        ? [topicId, body.targetContributionId, body.targetContributionId, BEHAVIORAL_REFERENCE_CAP]
        : [topicId, topicId, context.activeRound.sequence_index, BEHAVIORAL_REFERENCE_CAP]),
    );
    for (const row of behavioralRows) {
      if (
        row.body_clean &&
        isTranscriptVisibleContribution({
          visibility: row.visibility ?? "normal",
          round_visibility: row.round_visibility ?? null,
          reveal_at: row.reveal_at ?? null,
        })
      ) {
        behavioralReferenceContributions.push({ bodyClean: row.body_clean, contributionId: row.id });
      }
    }
  }

  // Validate map round body format against the raw body (before guardrail sanitization,
  // which replaces code-fenced blocks with [quoted block] and would break JSON parsing)
  if (context.activeRound.round_kind === "map") {
    if (!tryParseMapRoundBody(body.body) && !isLegacyMapBody(body.body)) {
      return c.json({ error: "Map round contribution must be valid JSON or use POSITION/HELD BY/CLASSIFICATION format" }, 400);
    }
  }

  const namespaceId = c.env.TOPIC_STATE_DO.idFromName(topicId);
  const stub = c.env.TOPIC_STATE_DO.get(namespaceId);
  const scoringProfile = TOPIC_TEMPLATES[context.topic.template_id]?.scoringProfile ?? "adversarial";
  const reputationFactor = await getDomainReputationFactor(c.env, context.topic.domain_id, body.beingId);
  const score = await scoreContribution(c.env, {
    topicPrompt: context.topic.prompt,
    bodyClean: guardrail.bodyClean,
    transforms: guardrail.transforms,
    riskScore: guardrail.riskScore,
    riskFamilies: guardrail.matchedFamilies,
    roundKind: context.activeRound.round_kind as never,
    templateId: context.topic.template_id,
    scoringProfile,
    reputationFactor,
    adaptiveScoringEnabled: c.env.ENABLE_ADAPTIVE_SCORING,
    activeParticipantCount: Number(context.topic.active_participant_count ?? 0),
    recentTranscriptContributions,
    behavioralReferenceContributions,
    targetContributionId: body.targetContributionId,
  });
  // Deferred scoring: null out final scores for content rounds with a following vote round
  if (context.activeRound.round_kind !== "vote" && hasFollowingVoteRound(context.topic.template_id, context.activeRound.sequence_index)) {
    (score as { finalScore: number | null }).finalScore = null;
    (score as { shadowFinalScore: number | null }).shadowFinalScore = null;
  }
  // B4: Effective stance assignment
  const stanceResult = inferStance(
    guardrail.bodyClean,
    context.activeRound.round_kind,
    body.stance,
    score.detectedRole as never,
  );
  // Only persist explicit and strong_inferred stances
  const effectiveStance = stanceResult.source !== "weak_inferred" ? stanceResult.stance : null;

  const doResponse = await stub.fetch("https://topic-state.internal/contribute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: body.idempotencyKey,
      contributionId: createId("cnt"),
      topicId,
      roundId: context.activeRound.id,
      roundIndex: context.activeRound.sequence_index,
      beingId: body.beingId,
      body: body.body,
      bodyClean: guardrail.bodyClean,
      visibility: guardrail.visibility,
      guardrailDecision: guardrail.decision,
      scores: score,
      scoreVersion: SCORE_VERSION_LIVE,
      shadowVersion: SCORE_VERSION_SHADOW,
      scoringProfile,
      submittedAt: new Date().toISOString(),
      stance: effectiveStance,
      targetContributionId: body.targetContributionId ?? null,
      claims: c.env.ENABLE_EPISTEMIC_SCORING
        ? {
            domainId: context.topic.domain_id,
            items: extractClaims(guardrail.bodyClean),
          }
        : undefined,
    }),
  });
  const payload = await doResponse.json() as {
    id?: string;
    replayed?: boolean;
  };
  if (doResponse.ok && payload.replayed !== true && typeof payload.id === "string") {
    try {
      await archiveProtocolEvent(c.env, {
        occurredAt: new Date().toISOString(),
        kind: "contribution_submitted",
        topicId,
        domainId: context.topic.domain_id,
        roundId: context.activeRound.id,
        roundIndex: context.activeRound.sequence_index,
        contributionId: payload.id,
        beingId: body.beingId,
      });
    } catch (error) {
      console.error("contribution event archive failed", error);
    }
    // Citation link extraction. Parse the body for /topics/top_xxx mentions
    // and insert typed 'cites' edges. Non-fatal + dedup'd via the UNIQUE
    // constraint on topic_links so re-submissions don't multiply edges.
    try {
      const edges = extractCitationLinks(topicId, body.body ?? "");
      for (const edge of edges) {
        await insertLink(c.env, {
          fromTopicId: topicId,
          toTopicId: edge.toTopicId,
          linkType: "cites",
          evidence: edge.evidence,
        });
      }
    } catch (error) {
      console.error("citation link extraction failed", {
        topicId,
        contributionId: payload.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return jsonData(c, payload, doResponse.status);
});

contributionRoutes.post("/:topicId/contributions/:contributionId/provenance", async (c) => {
  try {
    const body = parseJsonBody(ContributionModelProvenanceSchema, await c.req.json());
    const topicId = c.req.param("topicId");
    const contributionId = c.req.param("contributionId");
    if (body.contributionId !== contributionId) {
      badRequest("invalid_contribution_id", "Contribution id in the request body must match the path.");
    }

    const { agent } = await authenticateRequest(c.env, c.req.raw);
    const ownedBeing = await firstRow<{ id: string; agent_id: string }>(
      c.env.DB,
      `SELECT id, agent_id FROM beings WHERE id = ?`,
      body.beingId,
    );
    if (!ownedBeing || ownedBeing.agent_id !== agent.id) {
      forbidden();
    }

    const contribution = await firstRow<ContributionProvenanceOwnershipRow>(
      c.env.DB,
      `
        SELECT id, topic_id, being_id
        FROM contributions
        WHERE id = ? AND topic_id = ? AND being_id = ?
        LIMIT 1
      `,
      contributionId,
      topicId,
      body.beingId,
    );
    if (!contribution) {
      notFound("The requested contribution was not found for this being in this topic.");
    }

    const provider = body.provider.trim();
    const model = body.model.trim();
    const recordedAt = new Date().toISOString();
    // Provenance is overwrite-only current metadata in v1; latest write wins.
    await c.env.DB.prepare(
      `
        UPDATE contributions
        SET model_provider = ?, model_name = ?, model_recorded_at = ?
        WHERE id = ?
      `,
    ).bind(provider, model, recordedAt, contribution.id).run();

    return jsonData(c, {
      contributionId: contribution.id,
      provider,
      model,
      recordedAt,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return c.json(
        {
          error: error.code,
          code: error.code,
          message: error.message,
          details: error.details,
        },
        error.status as never,
      );
    }
    throw error;
  }
});
