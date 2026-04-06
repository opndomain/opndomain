import type { ApiEnv } from "../env.js";
import type { ContributionScoreDetails, RiskFamily } from "@opndomain/shared";
import { SCORE_DETAILS_VERSION, type RoundKind, type ScoringProfile, type TopicTemplateId, BEHAVIORAL_DIMENSION_DEFAULTS, tryParseMapRoundBody } from "@opndomain/shared";
import type { BehavioralDimensionWeight, StanceInferenceDetails } from "@opndomain/shared";
import { getAdaptiveSemanticWeightRatio, resolveAdaptiveScoringScaleTier } from "@opndomain/shared";
import { scoreBehavioralDimensions } from "./behavioral.js";
import { computeCompositeScore } from "./composite.js";
import { scoreHeuristics } from "./heuristic.js";
import { detectRole } from "./roles.js";
import { scoreSemanticSimilarity } from "./semantic.js";
import {
  AGREEMENT_DAMPEN_LIVE,
  AGREEMENT_DAMPEN_SHADOW,
  ECHO_LIVE_MULTIPLIERS,
  ECHO_SEVERE_SUBSTANCE_THRESHOLD,
  ECHO_SHADOW_FLAT_MULTIPLIER,
  META_LIVE_PENALTY_MULTIPLIER,
  META_SHADOW_PENALTY_MULTIPLIER,
} from "./constants.js";

function agreementNoveltyDampening(role: string, novelty: number | null) {
  if (role !== "agreement" || novelty === null) {
    return { live: 1, shadow: 1 };
  }
  if (novelty < 45) {
    return { live: AGREEMENT_DAMPEN_LIVE.low, shadow: AGREEMENT_DAMPEN_SHADOW.low };
  }
  if (novelty < 68) {
    return { live: AGREEMENT_DAMPEN_LIVE.mid, shadow: AGREEMENT_DAMPEN_SHADOW.mid };
  }
  return { live: AGREEMENT_DAMPEN_LIVE.high, shadow: AGREEMENT_DAMPEN_SHADOW.high };
}

function roleMultipliers(role: ReturnType<typeof detectRole>, novelty: number | null, substanceScore: number) {
  const agreementDampen = agreementNoveltyDampening(role.detectedRole === "echo" ? "agreement" : role.detectedRole, novelty);
  let liveMultiplier = agreementDampen.live;
  let shadowMultiplier = agreementDampen.shadow;

  if (role.echoDetected) {
    liveMultiplier *= substanceScore < ECHO_SEVERE_SUBSTANCE_THRESHOLD ? ECHO_LIVE_MULTIPLIERS.low : ECHO_LIVE_MULTIPLIERS.mid;
    shadowMultiplier *= ECHO_SHADOW_FLAT_MULTIPLIER;
  }
  if (role.metaDetected) {
    liveMultiplier *= META_LIVE_PENALTY_MULTIPLIER;
    shadowMultiplier *= META_SHADOW_PENALTY_MULTIPLIER;
  }

  return {
    liveMultiplier,
    shadowMultiplier,
    agreementNovDampenLive: agreementDampen.live,
    agreementNovDampenShadow: agreementDampen.shadow,
  };
}

export async function scoreContribution(
  env: ApiEnv,
  input: {
    topicPrompt: string;
    bodyClean: string;
    transforms: string[];
    riskScore: number;
    riskFamilies: RiskFamily[];
    roundKind: RoundKind;
    templateId: TopicTemplateId;
    scoringProfile: ScoringProfile;
    reputationFactor: number;
    adaptiveScoringEnabled?: boolean;
    activeParticipantCount?: number;
    recentTranscriptContributions: Array<{
      id: string;
      bodyClean: string;
    }>;
    behavioralReferenceContributions?: Array<{
      bodyClean: string;
      contributionId: string;
    }>;
    behavioralDimensions?: BehavioralDimensionWeight[];
    targetContributionId?: string;
    stanceInference?: StanceInferenceDetails;
  },
): Promise<{
  substanceScore: number;
  roleBonus: number;
  detectedRole: string;
  echoDetected: boolean;
  metaDetected: boolean;
  liveMultiplier: number;
  shadowMultiplier: number;
  agreementNovDampenLive: number;
  agreementNovDampenShadow: number;
  relevance: number | null;
  novelty: number | null;
  reframe: number | null;
  semanticScore: number | null;
  semanticFlags: string[];
  initialScore: number;
  finalScore: number;
  shadowInitialScore: number;
  shadowFinalScore: number;
  details: ContributionScoreDetails;
}> {
  // For map round JSON bodies, extract prose content for scoring to avoid JSON tokens polluting heuristics
  let effectiveBodyClean = input.bodyClean;
  if (input.roundKind === "map") {
    const parsed = tryParseMapRoundBody(input.bodyClean);
    if (parsed) {
      const proseFragments: string[] = [];
      for (const pos of parsed.positions) {
        proseFragments.push(pos.statement);
        if (pos.evidenceStrength) proseFragments.push(pos.evidenceStrength);
        if (pos.keyWeakness) proseFragments.push(pos.keyWeakness);
      }
      if (parsed.analysis) proseFragments.push(parsed.analysis);
      effectiveBodyClean = proseFragments.join("\n\n");
    }
  }
  const heuristic = scoreHeuristics(effectiveBodyClean);
  const role = detectRole(effectiveBodyClean, heuristic.substanceScore);
  const semantic = await scoreSemanticSimilarity(env, { ...input, bodyClean: effectiveBodyClean });
  const multipliers = roleMultipliers(role, semantic.novelty, heuristic.substanceScore);

  // Behavioral scoring — skip for unscored profiles
  const isUnscored = input.scoringProfile === "unscored";
  const dimensions = !isUnscored
    ? (input.behavioralDimensions ?? BEHAVIORAL_DIMENSION_DEFAULTS[input.roundKind] ?? [])
    : [];
  const behavioral = scoreBehavioralDimensions({
    bodyClean: effectiveBodyClean,
    roundKind: input.roundKind,
    dimensions,
    behavioralReferenceContributions: input.behavioralReferenceContributions ?? [],
    targetContributionId: input.targetContributionId,
  });

  const activeParticipantCount = Number(input.activeParticipantCount ?? 0);
  const adaptiveScaleTier = resolveAdaptiveScoringScaleTier(activeParticipantCount);
  const composite = computeCompositeScore({
    roundKind: input.roundKind,
    templateId: input.templateId,
    scoringProfile: input.scoringProfile,
    reputationFactor: input.reputationFactor,
    substanceScore: heuristic.substanceScore,
    roleBonus: role.roleBonus,
    detectedRole: role.detectedRole,
    relevance: semantic.relevance,
    novelty: semantic.novelty,
    reframe: semantic.reframe,
    liveMultiplier: multipliers.liveMultiplier,
    shadowMultiplier: multipliers.shadowMultiplier,
    behavioralMultiplier: behavioral.multiplier,
    shadowSemanticWeightRatio: input.adaptiveScoringEnabled
      ? getAdaptiveSemanticWeightRatio(adaptiveScaleTier, "shadow")
      : 1,
  });

  return {
    substanceScore: heuristic.substanceScore,
    roleBonus: role.roleBonus,
    detectedRole: role.detectedRole,
    echoDetected: role.echoDetected,
    metaDetected: role.metaDetected,
    liveMultiplier: multipliers.liveMultiplier,
    shadowMultiplier: multipliers.shadowMultiplier,
    agreementNovDampenLive: multipliers.agreementNovDampenLive,
    agreementNovDampenShadow: multipliers.agreementNovDampenShadow,
    relevance: semantic.relevance,
    novelty: semantic.novelty,
    reframe: semantic.reframe,
    semanticScore: semantic.semanticAverage,
    semanticFlags: semantic.semanticFlags,
    initialScore: composite.initialScore,
    finalScore: composite.finalScore,
    shadowInitialScore: composite.shadowInitialScore,
    shadowFinalScore: composite.shadowFinalScore,
    details: {
      version: SCORE_DETAILS_VERSION,
      substance: heuristic.substanceScore,
      sentenceContribution: heuristic.sentenceContribution,
      uniqueTermRatio: heuristic.uniqueTermRatioScore,
      specificity: heuristic.specificityScore,
      evidence: heuristic.evidenceScore,
      vagueness: heuristic.vaguenessPenalty,
      wordCount: heuristic.wordCount,
      role: role.detectedRole,
      roleBonus: role.roleBonus,
      echoDetected: role.echoDetected,
      metaDetected: role.metaDetected,
      liveMultiplier: multipliers.liveMultiplier,
      shadowMultiplier: multipliers.shadowMultiplier,
      relevance: semantic.relevance,
      novelty: semantic.novelty,
      reframe: semantic.reframe,
      semanticFlags: semantic.semanticFlags,
      riskScore: input.riskScore,
      riskFamilies: input.riskFamilies,
      transforms: input.transforms,
      agreementNovDampenLive: multipliers.agreementNovDampenLive,
      agreementNovDampenShadow: multipliers.agreementNovDampenShadow,
      heuristic,
      roleAnalysis: role,
      semantic,
      inferredStance: input.stanceInference,
      behavioral: dimensions.length > 0
        ? { scores: behavioral.scores, weightedScore: behavioral.weightedScore, multiplier: behavioral.multiplier }
        : undefined,
    },
  };
}
