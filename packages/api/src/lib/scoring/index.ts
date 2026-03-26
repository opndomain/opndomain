import type { ApiEnv } from "../env.js";
import type { ContributionScoreDetails, RiskFamily } from "@opndomain/shared";
import { SCORE_DETAILS_VERSION, type RoundKind, type ScoringProfile, type TopicTemplateId } from "@opndomain/shared";
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
    recentTranscriptContributions: Array<{
      id: string;
      bodyClean: string;
    }>;
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
  const heuristic = scoreHeuristics(input.bodyClean);
  const role = detectRole(input.bodyClean, heuristic.substanceScore);
  const semantic = await scoreSemanticSimilarity(env, input);
  const multipliers = roleMultipliers(role, semantic.novelty, heuristic.substanceScore);
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
    },
  };
}
