import { Hono } from "hono";
import {
  ContributionSubmissionSchema,
  RoundConfigSchema,
  SCORE_VERSION_LIVE,
  SCORE_VERSION_SHADOW,
  SEMANTIC_COMPARISON_WINDOW_SIZE,
  TOPIC_TEMPLATES,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { ApiError } from "../lib/errors.js";
import { forbidden, notFound } from "../lib/errors.js";
import { runGuardrailPipeline } from "../lib/guardrails/index.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import { createId } from "../lib/ids.js";
import { extractClaims } from "../lib/epistemic/claim-extraction.js";
import { scoreContribution } from "../lib/scoring/index.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";
import { authenticateRequest } from "../services/auth.js";
import { getDomainReputationFactor } from "../services/reputation.js";

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

export async function resolveContributionContext(env: ApiEnv, agentId: string, topicId: string, beingId: string) {
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
  if (!being || being.agent_id !== agentId) {
    forbidden();
  }
  if (being.status !== "active" || !being.can_publish) {
    forbidden("That being cannot publish contributions.");
  }

  const topic = await firstRow<TopicContextRow>(
    env.DB,
    `
      SELECT id, domain_id, title, prompt, min_trust_tier, status, template_id
      FROM topics
      WHERE id = ?
    `,
    topicId,
  );
  if (!topic) {
    notFound("The requested topic was not found.");
  }
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

export async function resolveTopicActorContext(env: ApiEnv, agentId: string, topicId: string, beingId: string) {
  const { being, topic } = await resolveContributionContext(env, agentId, topicId, beingId);
  return { being, topic };
}

export async function resolveVoteContext(env: ApiEnv, agentId: string, topicId: string, beingId: string) {
  const { being, topic, activeRound } = await resolveContributionContext(env, agentId, topicId, beingId);
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
    context = await resolveContributionContext(c.env, agent.id, topicId, body.beingId);
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

  const recentTranscriptContributions = (
    await allRows<RecentContributionRow>(
      c.env.DB,
      `
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
      topicId,
      SEMANTIC_COMPARISON_WINDOW_SIZE,
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
    recentTranscriptContributions,
  });
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
      claims: c.env.ENABLE_EPISTEMIC_SCORING
        ? {
            domainId: context.topic.domain_id,
            items: extractClaims(guardrail.bodyClean),
          }
        : undefined,
    }),
  });

  return jsonData(c, await doResponse.json(), doResponse.status);
});
