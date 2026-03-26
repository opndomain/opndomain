import {
  AGREEMENT_NOVELTY_DAMPEN_LIVE_HIGH,
  AGREEMENT_NOVELTY_DAMPEN_LIVE_LOW,
  AGREEMENT_NOVELTY_DAMPEN_LIVE_MID,
  AGREEMENT_NOVELTY_DAMPEN_SHADOW_HIGH,
  AGREEMENT_NOVELTY_DAMPEN_SHADOW_LOW,
  AGREEMENT_NOVELTY_DAMPEN_SHADOW_MID,
  ECHO_LIVE_MULTIPLIER_LOW,
  ECHO_LIVE_MULTIPLIER_MID,
  ECHO_SHADOW_MULTIPLIER,
  ECHO_LOW_SUBSTANCE_THRESHOLD,
  ECHO_SUBSTANCE_THRESHOLD,
  META_LIVE_MULTIPLIER,
  META_REFUSAL_MIN_MATCHES,
  META_SHADOW_MULTIPLIER,
  ROLE_BONUS_AGREEMENT,
  ROLE_BONUS_CLAIM,
  ROLE_BONUS_CRITIQUE,
  ROLE_BONUS_ECHO,
  ROLE_BONUS_EVIDENCE,
  ROLE_BONUS_OTHER,
  ROLE_BONUS_QUESTION,
  ROLE_BONUS_SYNTHESIS,
  ROLE_DETECTION_ASSIGNMENT_THRESHOLD,
  ROLE_DETECTION_MIN_MATCHES_LIVE,
  ROLE_DETECTION_MIN_MATCHES_SHADOW,
  ROLE_DETECTION_SHADOW_THRESHOLD,
  SEMANTIC_COMPARISON_SCOPE,
  SEMANTIC_COMPARISON_WINDOW_SIZE,
  SEMANTIC_TOPIC_EMBEDDING_SOURCE,
  SUBSTANCE_DENSITY_BASE_WORD_COUNT,
  SUBSTANCE_DENSITY_MIN_MULTIPLIER,
  SUBSTANCE_EVIDENCE_PATTERN_CAP,
  SUBSTANCE_EVIDENCE_PATTERN_POINTS,
  SUBSTANCE_SCORE_MAX,
  SUBSTANCE_SENTENCE_SCORE_FIVE_TO_SIX,
  SUBSTANCE_SENTENCE_SCORE_FOUR,
  SUBSTANCE_SENTENCE_SCORE_ONE,
  SUBSTANCE_SENTENCE_SCORE_SEVEN_PLUS,
  SUBSTANCE_SENTENCE_SCORE_THREE,
  SUBSTANCE_SENTENCE_SCORE_TWO,
  SUBSTANCE_SPECIFICITY_CAP,
  SUBSTANCE_UNIQUE_TERM_RATIO_CAP,
  SUBSTANCE_VAGUENESS_PATTERN_CAP,
  SUBSTANCE_VAGUENESS_PATTERN_POINTS,
  type DetectedRole,
} from "@opndomain/shared";

export const ROLE_BONUSES: Readonly<Record<DetectedRole, number>> = {
  evidence: ROLE_BONUS_EVIDENCE,
  critique: ROLE_BONUS_CRITIQUE,
  synthesis: ROLE_BONUS_SYNTHESIS,
  claim: ROLE_BONUS_CLAIM,
  question: ROLE_BONUS_QUESTION,
  agreement: ROLE_BONUS_AGREEMENT,
  echo: ROLE_BONUS_ECHO,
  other: ROLE_BONUS_OTHER,
};

export const ROLE_ASSIGNMENT_THRESHOLD = ROLE_DETECTION_ASSIGNMENT_THRESHOLD;
export const ROLE_SHADOW_THRESHOLD = ROLE_DETECTION_SHADOW_THRESHOLD;
export const ROLE_MIN_MATCHES_LIVE = ROLE_DETECTION_MIN_MATCHES_LIVE;
export const ROLE_MIN_MATCHES_SHADOW = ROLE_DETECTION_MIN_MATCHES_SHADOW;
export const META_REFUSAL_THRESHOLD = META_REFUSAL_MIN_MATCHES;
export const ECHO_MIN_SUBSTANCE_THRESHOLD = ECHO_SUBSTANCE_THRESHOLD;
export const ECHO_SEVERE_SUBSTANCE_THRESHOLD = ECHO_LOW_SUBSTANCE_THRESHOLD;
export const ECHO_LIVE_MULTIPLIERS = {
  low: ECHO_LIVE_MULTIPLIER_LOW,
  mid: ECHO_LIVE_MULTIPLIER_MID,
} as const;
export const ECHO_SHADOW_FLAT_MULTIPLIER = ECHO_SHADOW_MULTIPLIER;
export const META_LIVE_PENALTY_MULTIPLIER = META_LIVE_MULTIPLIER;
export const META_SHADOW_PENALTY_MULTIPLIER = META_SHADOW_MULTIPLIER;
export const AGREEMENT_DAMPEN_LIVE = {
  low: AGREEMENT_NOVELTY_DAMPEN_LIVE_LOW,
  mid: AGREEMENT_NOVELTY_DAMPEN_LIVE_MID,
  high: AGREEMENT_NOVELTY_DAMPEN_LIVE_HIGH,
} as const;
export const AGREEMENT_DAMPEN_SHADOW = {
  low: AGREEMENT_NOVELTY_DAMPEN_SHADOW_LOW,
  mid: AGREEMENT_NOVELTY_DAMPEN_SHADOW_MID,
  high: AGREEMENT_NOVELTY_DAMPEN_SHADOW_HIGH,
} as const;

export const SUBSTANCE_SENTENCE_SCORES = {
  one: SUBSTANCE_SENTENCE_SCORE_ONE,
  two: SUBSTANCE_SENTENCE_SCORE_TWO,
  three: SUBSTANCE_SENTENCE_SCORE_THREE,
  four: SUBSTANCE_SENTENCE_SCORE_FOUR,
  fiveToSix: SUBSTANCE_SENTENCE_SCORE_FIVE_TO_SIX,
  sevenPlus: SUBSTANCE_SENTENCE_SCORE_SEVEN_PLUS,
} as const;

export const SUBSTANCE_CONSTANTS = {
  max: SUBSTANCE_SCORE_MAX,
  uniqueTermRatioCap: SUBSTANCE_UNIQUE_TERM_RATIO_CAP,
  specificityCap: SUBSTANCE_SPECIFICITY_CAP,
  evidencePatternPoints: SUBSTANCE_EVIDENCE_PATTERN_POINTS,
  evidencePatternCap: SUBSTANCE_EVIDENCE_PATTERN_CAP,
  vaguenessPatternPoints: SUBSTANCE_VAGUENESS_PATTERN_POINTS,
  vaguenessPatternCap: SUBSTANCE_VAGUENESS_PATTERN_CAP,
  densityBaseWordCount: SUBSTANCE_DENSITY_BASE_WORD_COUNT,
  densityMinMultiplier: SUBSTANCE_DENSITY_MIN_MULTIPLIER,
} as const;

export const EVIDENCE_PATTERNS = [
  /\bmeasured\b/i,
  /\bbenchmark\b/i,
  /\bin practice\b/i,
  /\bresults show\b/i,
  /\btrade[- ]off\b/i,
  /\bcompared to\b/i,
  /\bat \d+/i,
  /\binvariant\b/i,
] as const;

export const VAGUENESS_PATTERNS = [
  /\breally important\b/i,
  /\bmany approaches\b/i,
  /\bdepends on your\b/i,
  /\bthink carefully\b/i,
  /\blet me know\b/i,
  /\bgreat question\b/i,
  /\bthe right choice depends\b/i,
] as const;

export const KNOWN_TECH_TERMS = [
  "latency",
  "throughput",
  "consistency",
  "invariant",
  "embedding",
  "quorum",
  "sqlite",
  "durable object",
  "idempotency",
  "semantic",
  "heuristic",
] as const;

export const META_REFUSAL_PATTERNS = [
  /\bcan'?t provide\b/i,
  /\bwithout knowing\b/i,
  /\bno topic provided\b/i,
  /\bnot enough context\b/i,
  /\bneed more context\b/i,
  /\binsufficient context\b/i,
  /\bmissing the prompt\b/i,
  /\bi cannot answer that\b/i,
  /\bcan't answer that\b/i,
  /\bno context available\b/i,
] as const;

export const ROLE_FAMILY_PATTERNS: ReadonlyArray<{
  role: Extract<DetectedRole, "evidence" | "critique" | "synthesis" | "question" | "agreement">;
  weight: number;
  patterns: readonly RegExp[];
}> = [
  {
    role: "critique",
    weight: 3,
    patterns: [
      /\bhowever\b/i,
      /\bbut\b/i,
      /\brisk\b/i,
      /\bcounterexample\b/i,
      /\bweakness\b/i,
      /\bfails when\b/i,
      /\bdrawback\b/i,
      /\blimitation\b/i,
      /\bdoes not hold\b/i,
    ],
  },
  {
    role: "evidence",
    weight: 3,
    patterns: [
      /\bbecause\b/i,
      /\bevidence\b/i,
      /\bbenchmark\b/i,
      /\bmeasured\b/i,
      /\bdata\b/i,
      /\bresults show\b/i,
      /\bexperiment\b/i,
      /\bobserved\b/i,
      /\bmeasurement\b/i,
      /\bin practice\b/i,
    ],
  },
  {
    role: "synthesis",
    weight: 3,
    patterns: [
      /\bsynthesize\b/i,
      /\bcombine\b/i,
      /\btrade[- ]off\b/i,
      /\btherefore\b/i,
      /\bin summary\b/i,
      /\bon balance\b/i,
      /\bthe synthesis is\b/i,
    ],
  },
  {
    role: "question",
    weight: 2,
    patterns: [
      /\?$/,
      /\bwhat if\b/i,
      /\bhow might\b/i,
      /\bshould we\b/i,
      /\bwhy does\b/i,
      /\bwhat would happen\b/i,
      /\bcan we test\b/i,
    ],
  },
  {
    role: "agreement",
    weight: 3,
    patterns: [
      /\bi agree\b/i,
      /\bagree with\b/i,
      /\bthat matches\b/i,
      /\bexactly right\b/i,
      /\bthat seems right\b/i,
      /\bco-signed\b/i,
      /\b\+1\b/i,
    ],
  },
] as const;

export const SEMANTIC_WINDOW_CONTRACT = {
  scope: SEMANTIC_COMPARISON_SCOPE,
  size: SEMANTIC_COMPARISON_WINDOW_SIZE,
  includedVisibilities: ["normal", "low_confidence"] as const,
  includedDecisions: ["allow", "queue"] as const,
  topicEmbeddingSource: SEMANTIC_TOPIC_EMBEDDING_SOURCE,
} as const;
