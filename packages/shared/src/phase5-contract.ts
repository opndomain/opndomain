import {
  CACHE_GENERATION_LANDING,
  CACHE_GENERATION_DOMAIN_PREFIX,
  CACHE_GENERATION_TOPIC_PREFIX,
  CACHE_GENERATION_VERDICT_PREFIX,
  PRESENTATION_PENDING_PREFIX,
  QUALITY_GATED_MIN_SCORE_FLOOR,
  ROUND_VISIBILITY_SEALED,
  SNAPSHOT_PENDING_PREFIX,
  TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
  TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
  topicOgSvgArtifactKey,
  topicVerdictHtmlArtifactKey,
} from "./constants.js";

export const PHASE5_CONTRACT_PHASE = 5;

export const PHASE5_META_CONTRACT = {
  phase: PHASE5_CONTRACT_PHASE,
  closure: {
    executedCompletionStyles: ["aggressive", "patient", "quality_gated"],
    qualityGatedMinScoreFloor: QUALITY_GATED_MIN_SCORE_FLOOR,
    sealedRoundVisibilityValue: ROUND_VISIBILITY_SEALED,
    revealAtRules: {
      sealedInitial: "ends_at",
      openInitial: "starts_at",
      sealedOnCompletion: "actual_completion_time",
      openOnCompletion: "actual_completion_time",
    },
    idempotentAdvancement: "d1_cas_meta_changes",
  },
  revealVisibility: {
    transcriptVisibilityIsRevealGated: true,
    stateSnapshotsMayExposeUnrevealedRoundMetadata: true,
    transcriptHiddenForSealedRoundsUntilRevealAt: true,
  },
  terminalization: {
    authoritativeEntryPoint: "runTerminalizationSequence",
    modes: ["full_template", "degraded_template", "insufficient_signal"],
    forceFlush: {
      maxAttempts: TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
      drainedRemainingValue: TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
      boundedRetries: true,
    },
    finalScoreRepairSemantics: {
      initialScoreMutable: false,
      finalScoreRecomputedFromVotes: true,
      compatibilityMirrorsStayAtInitial: true,
    },
  },
  artifacts: {
    policy: {
      full_template: "published",
      degraded_template: "published",
      insufficient_signal: "suppressed",
    },
    deterministicKeys: {
      verdictHtml: topicVerdictHtmlArtifactKey(":topicId"),
      ogSvg: topicOgSvgArtifactKey(":topicId"),
    },
    ogAssetFormat: "svg",
  },
  invalidation: {
    generationKeys: [
      CACHE_GENERATION_LANDING,
      `${CACHE_GENERATION_DOMAIN_PREFIX}{domainId}`,
      `${CACHE_GENERATION_TOPIC_PREFIX}{topicId}`,
      `${CACHE_GENERATION_VERDICT_PREFIX}{topicId}`,
    ],
  },
  retryQueues: {
    snapshot: `${SNAPSHOT_PENDING_PREFIX}{topicId}`,
    presentation: `${PRESENTATION_PENDING_PREFIX}{topicId}`,
  },
  repairRoutes: [
    "POST /v1/internal/topics/:topicId/reconcile-presentation",
    "POST /v1/internal/topics/:topicId/reterminalize",
  ],
} as const;
