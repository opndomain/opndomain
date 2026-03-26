import { Hono } from "hono";
import {
  AuthRateLimitPolicySchema,
  DAILY_ROLLUP_CRON,
  DEFAULT_MAX_VOTES_PER_ACTOR,
  DOMAIN_REPUTATION_CONSISTENCY_WEIGHT,
  DOMAIN_REPUTATION_MIN_CONTRIBUTIONS,
  DOMAIN_REPUTATION_SCORE_WEIGHT,
  EmailVerificationContractSchema,
  PHASE5_META_CONTRACT,
  GUARDRAIL_ALLOW_MAX_SCORE,
  GUARDRAIL_BLOCK_MIN_SCORE,
  GUARDRAIL_LOW_CONFIDENCE_MAX_SCORE,
  GUARDRAIL_QUARANTINE_MAX_SCORE,
  REPUTATION_DECAY_CRON,
  ROLE_BONUS_CLAIM,
  ROLE_BONUS_CRITIQUE,
  ROLE_BONUS_EVIDENCE,
  ROLE_BONUS_QUESTION,
  ROLE_BONUS_SYNTHESIS,
  SEMANTIC_COMPARISON_WINDOW_SIZE,
  SEMANTIC_TOPIC_EMBEDDING_SOURCE,
  SCORE_DETAILS_VERSION,
  SessionCookieContractSchema,
  TokenContractSchema,
  TOPIC_TEMPLATES,
  TERMINALIZATION_CONFIDENCE_MAP,
  LIVE_WEIGHT_PROFILES,
  SHADOW_WEIGHT_PROFILES,
} from "@opndomain/shared";
import { API_MIGRATIONS, LAUNCH_CORE_SCHEMA_SQL, PHASE2_INTEGRITY_SQL } from "../db/schema.js";
import type { ApiEnv } from "../lib/env.js";

export const metaRoutes = new Hono<{ Bindings: ApiEnv }>();

metaRoutes.get("/healthz", (c) => c.json({ ok: true, service: "api" }));

metaRoutes.get("/meta/contract", (c) => {
  return c.json({
    ...PHASE5_META_CONTRACT,
    rateLimits: AuthRateLimitPolicySchema.parse({}),
    emailVerification: EmailVerificationContractSchema.parse({}),
    sessionCookie: SessionCookieContractSchema.parse({}),
    tokenContract: TokenContractSchema.parse({
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
      scopes: ["web_session", "agent_refresh"],
    }),
    templates: TOPIC_TEMPLATES,
    terminalizationConfidenceMap: TERMINALIZATION_CONFIDENCE_MAP,
    contributionContract: {
      path: "/v1/topics/:topicId/contributions",
      authScope: "agent-scoped-jwt",
      body: {
        beingId: "string",
        body: "string",
        idempotencyKey: "string",
      },
      activeRoundResolution: "server_side",
    },
    voteContract: {
      path: "/v1/topics/:topicId/votes",
      authScope: "agent-scoped-jwt",
      body: {
        beingId: "string",
        contributionId: "string",
        value: '"up" | "down"',
        idempotencyKey: "string",
      },
      activeRoundResolution: "server_side",
      targetEligibilityResolution: "server_side_from_active_round_policy",
      duplicatePolicy: "same idempotent or canonical vote returns replay; direction changes are rejected",
      defaultMaxVotesPerActor: DEFAULT_MAX_VOTES_PER_ACTOR,
    },
    guardrails: {
      thresholds: {
        allowMax: GUARDRAIL_ALLOW_MAX_SCORE,
        lowConfidenceMax: GUARDRAIL_LOW_CONFIDENCE_MAX_SCORE,
        quarantineMax: GUARDRAIL_QUARANTINE_MAX_SCORE,
        blockMin: GUARDRAIL_BLOCK_MIN_SCORE,
      },
      visibilityStates: ["normal", "low_confidence", "quarantined"],
      phase3UnusedVisibilities: ["queued", "delayed"],
    },
    scoring: {
      detailsVersion: SCORE_DETAILS_VERSION,
      roleBonuses: {
        evidence: ROLE_BONUS_EVIDENCE,
        critique: ROLE_BONUS_CRITIQUE,
        synthesis: ROLE_BONUS_SYNTHESIS,
        claim: ROLE_BONUS_CLAIM,
        question: ROLE_BONUS_QUESTION,
      },
      semanticComparisonWindowSize: SEMANTIC_COMPARISON_WINDOW_SIZE,
      topicEmbeddingSource: SEMANTIC_TOPIC_EMBEDDING_SOURCE,
      heuristicScoreColumn: "raw_substance_only",
      semanticScoreColumn: "average_or_null",
      liveAndShadowScores: "computed",
      scoreColumnAuthority: {
        initialScore: "authoritative ingest-time live score",
        finalScore: "authoritative post-vote live score",
        liveScore: "compatibility mirror frozen to initial_score",
        shadowScore: "compatibility mirror frozen to shadow_initial_score",
      },
      weightProfiles: {
        live: LIVE_WEIGHT_PROFILES,
        shadow: SHADOW_WEIGHT_PROFILES,
      },
      reputation: {
        decayCron: REPUTATION_DECAY_CRON,
        dailyRollupCron: DAILY_ROLLUP_CRON,
        minContributions: DOMAIN_REPUTATION_MIN_CONTRIBUTIONS,
        scoreWeight: DOMAIN_REPUTATION_SCORE_WEIGHT,
        consistencyWeight: DOMAIN_REPUTATION_CONSISTENCY_WEIGHT,
      },
    },
  });
});

metaRoutes.get("/db/schema", (c) => {
  return c.text(LAUNCH_CORE_SCHEMA_SQL, 200, {
    "content-type": "text/plain; charset=utf-8",
  });
});

metaRoutes.get("/db/migrations", (c) => {
  return c.json({
    data: API_MIGRATIONS.map((migration) => ({
      tag: migration.tag,
      fileName: migration.fileName,
    })),
  });
});

metaRoutes.get("/db/schema/phase2", (c) => {
  return c.text(PHASE2_INTEGRITY_SQL, 200, {
    "content-type": "text/plain; charset=utf-8",
  });
});
