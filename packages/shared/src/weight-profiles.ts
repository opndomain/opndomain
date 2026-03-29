import type { DetectedRole } from "./schemas.js";
import {
  ADAPTIVE_SCORING_COMMUNITY_MAX_PARTICIPANTS,
  ADAPTIVE_SCORING_INTIMATE_MAX_PARTICIPANTS,
  ADAPTIVE_SCORING_LIVE_SEMANTIC_WEIGHT_BY_TIER,
  ADAPTIVE_SCORING_NETWORK_MAX_PARTICIPANTS,
  ADAPTIVE_SCORING_SHADOW_SEMANTIC_WEIGHT_BY_TIER,
} from "./constants.js";
import type { AdaptiveScoringScaleTier } from "./schemas.js";
import type { RoundKind, ScoringProfile, TopicTemplateId } from "./templates.js";

export type ScoreWeightProfile = {
  relevance: number;
  novelty: number;
  reframe: number;
  substance: number;
  role: number;
};

export type WeightProfileVariant = "live" | "shadow";

type BaseWeightProfileKey = RoundKind | "default";

export const LIVE_WEIGHT_PROFILES: Record<BaseWeightProfileKey, ScoreWeightProfile> = {
  propose: { relevance: 0.22, novelty: 0.18, reframe: 0.14, substance: 0.31, role: 0.15 },
  critique: { relevance: 0.2, novelty: 0.12, reframe: 0.2, substance: 0.32, role: 0.16 },
  refine: { relevance: 0.23, novelty: 0.12, reframe: 0.22, substance: 0.27, role: 0.16 },
  synthesize: { relevance: 0.24, novelty: 0.1, reframe: 0.24, substance: 0.25, role: 0.17 },
  predict: { relevance: 0.21, novelty: 0.14, reframe: 0.18, substance: 0.29, role: 0.18 },
  vote: { relevance: 0.2, novelty: 0.16, reframe: 0.16, substance: 0.31, role: 0.17 },
  default: { relevance: 0.2, novelty: 0.18, reframe: 0.15, substance: 0.32, role: 0.15 },
};

export const SHADOW_WEIGHT_PROFILES: Record<BaseWeightProfileKey, ScoreWeightProfile> = {
  propose: { relevance: 0.24, novelty: 0.18, reframe: 0.14, substance: 0.25, role: 0.19 },
  critique: { relevance: 0.21, novelty: 0.1, reframe: 0.22, substance: 0.28, role: 0.19 },
  refine: { relevance: 0.24, novelty: 0.1, reframe: 0.24, substance: 0.23, role: 0.19 },
  synthesize: { relevance: 0.26, novelty: 0.08, reframe: 0.26, substance: 0.22, role: 0.18 },
  predict: { relevance: 0.23, novelty: 0.12, reframe: 0.2, substance: 0.26, role: 0.19 },
  vote: { relevance: 0.22, novelty: 0.14, reframe: 0.16, substance: 0.28, role: 0.2 },
  default: { relevance: 0.23, novelty: 0.17, reframe: 0.13, substance: 0.28, role: 0.19 },
};

export const WITHOUT_SEMANTICS_FALLBACK_WEIGHTS = {
  live: { substance: 0.82, role: 0.18 },
  shadow: { substance: 0.78, role: 0.22 },
} as const;

export const SCORING_PROFILE_WEIGHT_ADJUSTMENTS: Record<
  ScoringProfile,
  {
    live: ScoreWeightProfile | { critiqueOrVote: ScoreWeightProfile; default: ScoreWeightProfile };
    shadow: ScoreWeightProfile | { critiqueOrVote: ScoreWeightProfile; default: ScoreWeightProfile };
    voteInfluenceMultiplier: number;
    voteInfluenceCap: number;
  }
> = {
  adversarial: {
    live: {
      critiqueOrVote: { relevance: 0.18, novelty: 0.1, reframe: 0.24, substance: 0.28, role: 0.2 },
      default: { relevance: 0.2, novelty: 0.12, reframe: 0.18, substance: 0.32, role: 0.18 },
    },
    shadow: {
      critiqueOrVote: { relevance: 0.2, novelty: 0.08, reframe: 0.24, substance: 0.26, role: 0.22 },
      default: { relevance: 0.21, novelty: 0.12, reframe: 0.18, substance: 0.28, role: 0.21 },
    },
    voteInfluenceMultiplier: 1.25,
    voteInfluenceCap: 0.75,
  },
  exploratory: {
    live: { relevance: 0.22, novelty: 0.24, reframe: 0.13, substance: 0.27, role: 0.14 },
    shadow: { relevance: 0.24, novelty: 0.22, reframe: 0.12, substance: 0.24, role: 0.18 },
    voteInfluenceMultiplier: 0.8,
    voteInfluenceCap: 0.5,
  },
  dialectical: {
    live: { relevance: 0.24, novelty: 0.12, reframe: 0.26, substance: 0.22, role: 0.16 },
    shadow: { relevance: 0.25, novelty: 0.1, reframe: 0.28, substance: 0.2, role: 0.17 },
    voteInfluenceMultiplier: 0.7,
    voteInfluenceCap: 0.45,
  },
  unscored: {
    live: { relevance: 0.18, novelty: 0.14, reframe: 0.12, substance: 0.42, role: 0.14 },
    shadow: { relevance: 0.2, novelty: 0.12, reframe: 0.1, substance: 0.4, role: 0.18 },
    voteInfluenceMultiplier: 0.25,
    voteInfluenceCap: 0.15,
  },
};

export const STANDARD_ROLE_ALIGNMENT_MULTIPLIERS = {
  propose: { evidence: 1.08, claim: 1.08 },
  critique: { critique: 1.1 },
  refine: { synthesis: 1.08, evidence: 1.06 },
  synthesize: { synthesis: 1.12 },
  predict: { question: 1.04, evidence: 1.04 },
  vote: { question: 1.02 },
  agreement: 0.92,
  default: 1,
} as const;

export const SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS = {
  propose: { question: 1.1, claim: 1.1 },
  critique: { question: 1.12, critique: 1.12 },
  refine: { synthesis: 1.1, evidence: 1.1 },
  synthesize: { synthesis: 1.15 },
  predict: { question: 1.06 },
  agreementOrEcho: 0.88,
  default: 1,
} as const;

export function getBaseWeightProfile(roundKind: RoundKind, variant: WeightProfileVariant): ScoreWeightProfile {
  const profiles = variant === "shadow" ? SHADOW_WEIGHT_PROFILES : LIVE_WEIGHT_PROFILES;
  return profiles[roundKind] ?? profiles.default;
}

export function getAdjustedWeightProfile(
  roundKind: RoundKind,
  scoringProfile: ScoringProfile,
  variant: WeightProfileVariant,
): ScoreWeightProfile {
  const adjustment = SCORING_PROFILE_WEIGHT_ADJUSTMENTS[scoringProfile][variant];
  if ("critiqueOrVote" in adjustment) {
    return roundKind === "critique" || roundKind === "vote" ? adjustment.critiqueOrVote : adjustment.default;
  }
  return adjustment;
}

export function resolveAdaptiveScoringScaleTier(activeParticipantCount: number): AdaptiveScoringScaleTier {
  const count = Math.max(0, Math.floor(activeParticipantCount));
  if (count <= ADAPTIVE_SCORING_INTIMATE_MAX_PARTICIPANTS) {
    return "intimate";
  }
  if (count <= ADAPTIVE_SCORING_COMMUNITY_MAX_PARTICIPANTS) {
    return "community";
  }
  if (count <= ADAPTIVE_SCORING_NETWORK_MAX_PARTICIPANTS) {
    return "network";
  }
  return "swarm";
}

export function getAdaptiveSemanticWeightRatio(
  scaleTier: AdaptiveScoringScaleTier,
  variant: WeightProfileVariant,
): number {
  return variant === "shadow"
    ? ADAPTIVE_SCORING_SHADOW_SEMANTIC_WEIGHT_BY_TIER[scaleTier]
    : ADAPTIVE_SCORING_LIVE_SEMANTIC_WEIGHT_BY_TIER[scaleTier];
}

export function getRoleAlignmentMultiplier(
  templateId: TopicTemplateId,
  roundKind: RoundKind,
  role: DetectedRole,
): number {
  if (templateId === "socratic") {
    if (role === "agreement" || role === "echo") {
      return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.agreementOrEcho;
    }
    switch (roundKind) {
      case "propose":
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.propose[role as keyof typeof SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.propose] ??
          SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
      case "critique":
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.critique[role as keyof typeof SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.critique] ??
          SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
      case "refine":
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.refine[role as keyof typeof SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.refine] ??
          SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
      case "synthesize":
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.synthesize[role as keyof typeof SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.synthesize] ??
          SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
      case "predict":
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.predict[role as keyof typeof SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.predict] ??
          SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
      default:
        return SOCRATIC_ROLE_ALIGNMENT_MULTIPLIERS.default;
    }
  }
  if (role === "agreement") {
    return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.agreement;
  }
  switch (roundKind) {
    case "propose":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.propose[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.propose] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    case "critique":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.critique[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.critique] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    case "synthesize":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.synthesize[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.synthesize] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    case "refine":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.refine[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.refine] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    case "predict":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.predict[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.predict] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    case "vote":
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.vote[role as keyof typeof STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.vote] ??
        STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
    default:
      return STANDARD_ROLE_ALIGNMENT_MULTIPLIERS.default;
  }
}
