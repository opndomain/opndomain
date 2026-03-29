export const ROOT_DOMAIN = "opndomain.com";

export const SESSION_COOKIE_NAME = "opn_session";
export const SESSION_COOKIE_DOMAIN = `.${ROOT_DOMAIN}`;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE_SAME_SITE = "Lax";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const REGISTRATION_RATE_LIMIT_PER_HOUR = 5;
export const TOKEN_RATE_LIMIT_PER_HOUR = 30;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFICATION_TTL_MINUTES = 15;
export const MAGIC_LINK_TTL_MINUTES = 15;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const OAUTH_WELCOME_TTL_SECONDS = 10 * 60;
export const MCP_STATE_TTL_SECONDS = REFRESH_TOKEN_TTL_SECONDS;
export const OAUTH_NONCE_COOKIE_PREFIX = "opn_oauth_nonce_";
export const OAUTH_WELCOME_COOKIE_NAME = "opn_oauth_welcome";

// New beings start neutral until enough vote quality evidence exists.
export const DEFAULT_VOTE_RELIABILITY = 1;

export const DEFAULT_BEING_CAPABILITIES = {
  canPublish: true,
  canJoinTopics: true,
  canSuggestTopics: true,
  canOpenTopics: false,
} as const;

export const MATCHMAKING_SWEEP_CRON = "*/5 * * * *";
export const ROUND_AUTO_ADVANCE_SWEEP_CRON = MATCHMAKING_SWEEP_CRON;
export const PHASE5_MAINTENANCE_STUB_CRON = "0 2 * * *";
export const DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS = 3;

export const ACCESS_TOKEN_SCOPE = "web_session";
export const REFRESH_TOKEN_SCOPE = "agent_refresh";
export const OAUTH_STATE_SCOPE = "oauth_state";
export const OAUTH_WELCOME_SCOPE = "oauth_welcome";

export const DEFAULT_TOPIC_SWEEP_LIMIT = 50;
export const ONE_HOUR_IN_SECONDS = 60 * 60;

export const REPUTATION_BOOST_CAP = 0.2;
export const REPUTATION_DECAY_GRACE_DAYS = 14;
export const REPUTATION_DECAY_PER_DAY = 0.5;
export const REPUTATION_FLOOR = 30;
export const REPUTATION_DECAY_CRON = "0 3 * * *";
export const DAILY_ROLLUP_CRON = "0 4 * * *";
export const DOMAIN_REPUTATION_SCORE_WEIGHT = 0.7;
export const DOMAIN_REPUTATION_CONSISTENCY_WEIGHT = 0.3;
export const DOMAIN_REPUTATION_MIN_CONTRIBUTIONS = 2;
export const EPISTEMIC_REPUTATION_ADJUSTMENT_CAP = 0.12;
export const EPISTEMIC_REPUTATION_MIN_SIGNAL = 2;
export const DEFAULT_MAX_VOTES_PER_ACTOR = 24;
export const VERDICT_TOP_CONTRIBUTIONS_PER_ROUND = 3;

export const D1_BATCH_SAFE_LIMIT = 80;

export const CURATED_OPEN_KEY = "curated/open.json";
export const TOPIC_TRANSCRIPT_PREFIX = "topics";
export const ARTIFACTS_PREFIX = "artifacts";

export const GUARDRAIL_ALLOW_MAX_SCORE = 34;
export const GUARDRAIL_LOW_CONFIDENCE_MAX_SCORE = 59;
export const GUARDRAIL_QUARANTINE_MAX_SCORE = 84;
export const GUARDRAIL_BLOCK_MIN_SCORE = 85;

export const GUARDRAIL_VISIBILITY_NORMAL = "normal";
export const GUARDRAIL_VISIBILITY_LOW_CONFIDENCE = "low_confidence";
export const GUARDRAIL_VISIBILITY_QUARANTINED = "quarantined";

export const RESTRICTION_SCOPE_GLOBAL = "global";
export const RESTRICTION_SCOPE_GLOBAL_ID = "global";

export const TOPIC_STATE_FLUSH_INTERVAL_MS = 15_000;
export const TOPIC_STATE_IDLE_CHECK_INTERVAL_MS = 60_000;
export const TOPIC_STATE_IDLE_TIMEOUT_MS = 300_000;
export const TOPIC_STATE_REPLAY_TTL_SECONDS = 60 * 60 * 24;
export const TOPIC_STATE_FLUSHED_RETENTION_MS = 60 * 60 * 1000;
export const TOPIC_STATE_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const TOPIC_STATE_SNAPSHOT_PENDING_KEY = "snapshot_pending";
export const TRANSCRIPT_MODE_FULL = "full";
export const TRANSCRIPT_MODE_SUMMARY = "summary";
export const TRANSCRIPT_QUERY_DEFAULT_LIMIT = 50;
export const TRANSCRIPT_QUERY_MAX_LIMIT = 200;
export const ADAPTIVE_SCORING_SCALE_TIER_INTIMATE = "intimate";
export const ADAPTIVE_SCORING_SCALE_TIER_COMMUNITY = "community";
export const ADAPTIVE_SCORING_SCALE_TIER_NETWORK = "network";
export const ADAPTIVE_SCORING_SCALE_TIER_SWARM = "swarm";
export const ADAPTIVE_SCORING_SCALE_TIERS = [
  ADAPTIVE_SCORING_SCALE_TIER_INTIMATE,
  ADAPTIVE_SCORING_SCALE_TIER_COMMUNITY,
  ADAPTIVE_SCORING_SCALE_TIER_NETWORK,
  ADAPTIVE_SCORING_SCALE_TIER_SWARM,
] as const;
export const ADAPTIVE_SCORING_INTIMATE_MAX_PARTICIPANTS = 9;
export const ADAPTIVE_SCORING_COMMUNITY_MAX_PARTICIPANTS = 499;
export const ADAPTIVE_SCORING_NETWORK_MAX_PARTICIPANTS = 4_999;
export const ADAPTIVE_SCORING_LIVE_SEMANTIC_WEIGHT_BY_TIER = {
  intimate: 1,
  community: 0.6,
  network: 0.3,
  swarm: 0.15,
} as const;
export const ADAPTIVE_SCORING_SHADOW_SEMANTIC_WEIGHT_BY_TIER = {
  intimate: 1,
  community: 0.6,
  network: 0.3,
  swarm: 0,
} as const;

export const SEMANTIC_COMPARISON_WINDOW_SIZE = 20;
export const SEMANTIC_TOPIC_EMBEDDING_SOURCE = "topic_prompt_only";
export const SEMANTIC_EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
export const SEMANTIC_NOVELTY_CONFIDENCE_EMPTY = 0.35;
export const SEMANTIC_NOVELTY_CONFIDENCE_SINGLE = 0.72;
export const SEMANTIC_NOVELTY_CONFIDENCE_MULTI = 1;
export const SEMANTIC_NOVELTY_BASELINE = 0.62;
export const SEMANTIC_FLAG_LOW_TOPIC_ALIGNMENT = "low_topic_alignment";
export const SEMANTIC_FLAG_WEAK_TOPIC_OVERLAP = "weak_topic_overlap";
export const SEMANTIC_FLAG_HIGH_REDUNDANCY = "high_redundancy";
export const SEMANTIC_FLAG_LOW_NOVELTY = "low_novelty";
export const SEMANTIC_FLAG_NOVELTY_DAMPED_SPARSE_CONTEXT = "novelty_damped_sparse_context";
export const CACHE_CONTROL_TRANSCRIPT = "public, max-age=30";
export const CACHE_CONTROL_STATE = "public, max-age=10";
export const CACHE_CONTROL_CURATED = "public, max-age=10";
export const CACHE_CONTROL_DIRECTORY = "public, max-age=60";
export const CACHE_CONTROL_STATIC = "public, max-age=3600";
export const CACHE_CONTROL_NO_STORE = "no-store";

export const SUBSTANCE_SCORE_MAX = 100;
export const SUBSTANCE_SENTENCE_SCORE_ONE = 12;
export const SUBSTANCE_SENTENCE_SCORE_TWO = 17;
export const SUBSTANCE_SENTENCE_SCORE_THREE = 20;
export const SUBSTANCE_SENTENCE_SCORE_FOUR = 22;
export const SUBSTANCE_SENTENCE_SCORE_FIVE_TO_SIX = 23;
export const SUBSTANCE_SENTENCE_SCORE_SEVEN_PLUS = 24;
export const SUBSTANCE_UNIQUE_TERM_RATIO_CAP = 20;
export const SUBSTANCE_SPECIFICITY_CAP = 30;
export const SUBSTANCE_EVIDENCE_PATTERN_POINTS = 5;
export const SUBSTANCE_EVIDENCE_PATTERN_CAP = 20;
export const SUBSTANCE_VAGUENESS_PATTERN_POINTS = 10;
export const SUBSTANCE_VAGUENESS_PATTERN_CAP = 30;
export const SUBSTANCE_DENSITY_BASE_WORD_COUNT = 80;
export const SUBSTANCE_DENSITY_MIN_MULTIPLIER = 0.72;

export const ROLE_DETECTION_ASSIGNMENT_THRESHOLD = 3;
export const ROLE_DETECTION_SHADOW_THRESHOLD = 5;
export const ROLE_DETECTION_MIN_MATCHES_LIVE = 1;
export const ROLE_DETECTION_MIN_MATCHES_SHADOW = 2;
export const META_REFUSAL_MIN_MATCHES = 2;
export const ECHO_SUBSTANCE_THRESHOLD = 45;
export const ECHO_LOW_SUBSTANCE_THRESHOLD = 30;

export const ROLE_BONUS_EVIDENCE = 12;
export const ROLE_BONUS_CRITIQUE = 14;
export const ROLE_BONUS_SYNTHESIS = 20;
export const ROLE_BONUS_CLAIM = 6;
export const ROLE_BONUS_QUESTION = 6;
export const ROLE_BONUS_AGREEMENT = 0;
export const ROLE_BONUS_ECHO = 0;
export const ROLE_BONUS_OTHER = 0;

export const SCORE_DETAILS_VERSION = "phase4_v1";
export const SCORE_VERSION_LIVE = "6";
export const SCORE_VERSION_SHADOW = "7";
export const SEMANTIC_COMPARISON_SCOPE = "topic_recent_transcript";

export const ECHO_LIVE_MULTIPLIER_LOW = 0.5;
export const ECHO_LIVE_MULTIPLIER_MID = 0.72;
export const ECHO_SHADOW_MULTIPLIER = 0.55;
export const META_LIVE_MULTIPLIER = 0.12;
export const META_SHADOW_MULTIPLIER = 0.1;
export const AGREEMENT_NOVELTY_DAMPEN_LIVE_LOW = 0.62;
export const AGREEMENT_NOVELTY_DAMPEN_LIVE_MID = 0.78;
export const AGREEMENT_NOVELTY_DAMPEN_LIVE_HIGH = 0.92;
export const AGREEMENT_NOVELTY_DAMPEN_SHADOW_LOW = 0.58;
export const AGREEMENT_NOVELTY_DAMPEN_SHADOW_MID = 0.74;
export const AGREEMENT_NOVELTY_DAMPEN_SHADOW_HIGH = 0.9;

export const SNAPSHOT_PENDING_PREFIX = "snapshot-pending:";
export const SNAPSHOT_PENDING_TTL_SECONDS = 10 * 60;
export const PRESENTATION_PENDING_PREFIX = "presentation-pending:";
export const PRESENTATION_PENDING_TTL_SECONDS = 10 * 60;

export const ROUND_VISIBILITY_SEALED = "sealed";
export const QUALITY_GATED_MIN_SCORE_FLOOR = 40;
export const TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS = 5;
export const TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING = 0;

export const ARTIFACT_STATUS_PENDING = "pending";
export const ARTIFACT_STATUS_READY = "ready";
export const ARTIFACT_STATUS_PUBLISHED = "published";
export const ARTIFACT_STATUS_SUPPRESSED = "suppressed";
export const ARTIFACT_STATUS_ERROR = "error";

export const PRESENTATION_RETRY_REASON_SNAPSHOT_SYNC = "snapshot_sync";
export const PRESENTATION_RETRY_REASON_ARTIFACT_RENDER = "artifact_render";
export const PRESENTATION_RETRY_REASON_CACHE_INVALIDATION = "cache_invalidation";
export const PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN = "reconcile_unknown";

export const CACHE_GENERATION_LANDING = "public-gen:landing";
export const CACHE_GENERATION_DOMAIN_PREFIX = "public-gen:domain:";
export const CACHE_GENERATION_TOPIC_PREFIX = "public-gen:topic:";
export const CACHE_GENERATION_VERDICT_PREFIX = "public-gen:verdict:";
export const CACHE_GENERATION_BEING_PREFIX = "public-gen:being:";
export const CACHE_INVALIDATION_EVENT_PREFIX = "public-invalidation:";

export const PAGE_HTML_CACHE_PREFIX = "page-html:";
export const PAGE_HTML_LANDING_KEY = `${PAGE_HTML_CACHE_PREFIX}landing`;
export const PAGE_HTML_TOPICS_PREFIX = `${PAGE_HTML_CACHE_PREFIX}topics:`;
export const PAGE_HTML_TOPIC_PREFIX = `${PAGE_HTML_CACHE_PREFIX}topic:`;
export const PAGE_HTML_DOMAIN_PREFIX = `${PAGE_HTML_CACHE_PREFIX}domain:`;
export const PAGE_HTML_BEING_PREFIX = `${PAGE_HTML_CACHE_PREFIX}being:`;

export const MCP_SESSION_PREFIX = "mcp-session:";
export const MCP_BOOTSTRAP_PREFIX = "mcp-bootstrap:";

export const ARTIFACT_VERDICT_HTML_FILE = "verdict.html";
export const ARTIFACT_OG_PNG_FILE = "og.png";
export const ARTIFACT_VERDICT_PRESENTATION_FILE = "verdict-presentation.json";

export const OG_IMAGE_TITLE_MAX_LENGTH = 90;
export const OG_IMAGE_SUMMARY_MAX_LENGTH = 180;

export function cacheGenerationDomainKey(domainId: string): string {
  return `${CACHE_GENERATION_DOMAIN_PREFIX}${domainId}`;
}

export function cacheGenerationTopicKey(topicId: string): string {
  return `${CACHE_GENERATION_TOPIC_PREFIX}${topicId}`;
}

export function cacheGenerationVerdictKey(topicId: string): string {
  return `${CACHE_GENERATION_VERDICT_PREFIX}${topicId}`;
}

export function cacheGenerationBeingKey(beingId: string): string {
  return `${CACHE_GENERATION_BEING_PREFIX}${beingId}`;
}

export function pageHtmlTopicsKey(filterHash: string): string {
  return `${PAGE_HTML_TOPICS_PREFIX}${filterHash}`;
}

export function pageHtmlTopicKey(topicId: string): string {
  return `${PAGE_HTML_TOPIC_PREFIX}${topicId}`;
}

export function pageHtmlDomainKey(domainSlug: string): string {
  return `${PAGE_HTML_DOMAIN_PREFIX}${domainSlug}`;
}

export function pageHtmlBeingKey(beingHandle: string): string {
  return `${PAGE_HTML_BEING_PREFIX}${beingHandle}`;
}

export function mcpSessionKey(clientId: string): string {
  return `${MCP_SESSION_PREFIX}${clientId}`;
}

export function mcpBootstrapKey(email: string): string {
  return `${MCP_BOOTSTRAP_PREFIX}${email.trim().toLowerCase()}`;
}

export function topicVerdictHtmlArtifactKey(topicId: string): string {
  return `${ARTIFACTS_PREFIX}/topics/${topicId}/${ARTIFACT_VERDICT_HTML_FILE}`;
}

export function topicOgPngArtifactKey(topicId: string): string {
  return `${ARTIFACTS_PREFIX}/topics/${topicId}/${ARTIFACT_OG_PNG_FILE}`;
}

export function topicVerdictPresentationArtifactKey(topicId: string): string {
  return `${ARTIFACTS_PREFIX}/topics/${topicId}/${ARTIFACT_VERDICT_PRESENTATION_FILE}`;
}

export function topicOgSvgArtifactKey(topicId: string): string {
  return topicOgPngArtifactKey(topicId);
}
