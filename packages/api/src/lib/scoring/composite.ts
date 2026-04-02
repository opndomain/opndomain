import {
  getRoleAlignmentMultiplier,
  WITHOUT_SEMANTICS_FALLBACK_WEIGHTS,
  type DetectedRole,
  type RoundKind,
  type ScoringProfile,
  type TopicTemplateId,
} from "@opndomain/shared";
import { getAdjustedWeightProfile } from "@opndomain/shared";
import { blendFinalScore, computeVoteInfluence } from "./votes.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeAdaptiveBaseScore(input: {
  weights: {
    relevance: number;
    novelty: number;
    reframe: number;
    substance: number;
    role: number;
  };
  fallbackWeights: { substance: number; role: number };
  semanticWeightRatio: number;
  relevance: number;
  novelty: number;
  reframe: number;
  substanceScore: number;
  roleBonus: number;
}): number {
  const ratio = clamp(input.semanticWeightRatio, 0, 1);
  const semanticMass = input.weights.relevance + input.weights.novelty + input.weights.reframe;
  const redistributedMass = semanticMass * (1 - ratio);
  const substanceWeight = input.weights.substance + redistributedMass * input.fallbackWeights.substance;
  const roleWeight = input.weights.role + redistributedMass * input.fallbackWeights.role;

  return (
    input.relevance * input.weights.relevance * ratio +
    input.novelty * input.weights.novelty * ratio +
    input.reframe * input.weights.reframe * ratio +
    input.substanceScore * substanceWeight +
    input.roleBonus * roleWeight
  );
}

export function computeCompositeScore(input: {
  roundKind: RoundKind;
  templateId: TopicTemplateId;
  scoringProfile: ScoringProfile;
  reputationFactor: number;
  substanceScore: number;
  roleBonus: number;
  detectedRole: DetectedRole;
  relevance: number | null;
  novelty: number | null;
  reframe: number | null;
  liveMultiplier: number;
  shadowMultiplier: number;
  behavioralMultiplier?: number;
  weightedVoteScore?: number | null;
  voteCount?: number;
  distinctVoterCount?: number;
  topicVoteCount?: number;
  liveVoteInfluenceCap?: number;
  shadowVoteInfluenceCap?: number;
  liveSemanticWeightRatio?: number;
  shadowSemanticWeightRatio?: number;
}): {
  initialScore: number;
  finalScore: number;
  shadowInitialScore: number;
  shadowFinalScore: number;
} {
  const alignment = getRoleAlignmentMultiplier(input.templateId, input.roundKind, input.detectedRole);
  const reputationBoost = 1 + clamp(input.reputationFactor, 0, 1) * 0.2;
  const hasSemantics = input.relevance !== null && input.novelty !== null && input.reframe !== null;
  const liveWeights = getAdjustedWeightProfile(input.roundKind, input.scoringProfile, "live");
  const shadowWeights = getAdjustedWeightProfile(input.roundKind, input.scoringProfile, "shadow");

  let liveBase: number;
  let shadowBase: number;
  if (hasSemantics) {
    const relevance = input.relevance as number;
    const novelty = input.novelty as number;
    const reframe = input.reframe as number;
    liveBase = computeAdaptiveBaseScore({
      weights: liveWeights,
      fallbackWeights: WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.live,
      semanticWeightRatio: input.liveSemanticWeightRatio ?? 1,
      relevance,
      novelty,
      reframe,
      substanceScore: input.substanceScore,
      roleBonus: input.roleBonus,
    });
    shadowBase = computeAdaptiveBaseScore({
      weights: shadowWeights,
      fallbackWeights: WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.shadow,
      semanticWeightRatio: input.shadowSemanticWeightRatio ?? 1,
      relevance,
      novelty,
      reframe,
      substanceScore: input.substanceScore,
      roleBonus: input.roleBonus,
    });
  } else {
    liveBase =
      input.substanceScore * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.live.substance +
      input.roleBonus * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.live.role;
    shadowBase =
      input.substanceScore * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.shadow.substance +
      input.roleBonus * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.shadow.role;
  }

  const bm = input.behavioralMultiplier ?? 1.0;
  const initialScore = clamp(liveBase * alignment * bm * input.liveMultiplier * reputationBoost, 0, 100);
  const shadowInitialScore = clamp(shadowBase * alignment * bm * input.shadowMultiplier * reputationBoost, 0, 100);
  const weightedVoteScore = input.weightedVoteScore ?? 50;
  const voteCount = input.voteCount ?? 0;
  const distinctVoterCount = input.distinctVoterCount ?? 0;
  const topicVoteCount = input.topicVoteCount ?? 0;
  const liveVoteInfluence = computeVoteInfluence({
    voteCount,
    distinctVoterCount,
    topicVoteCount,
    scoringProfile: input.scoringProfile,
    roundKind: input.roundKind,
    templateId: input.templateId,
    capOverride: input.liveVoteInfluenceCap,
  });
  const shadowVoteInfluence = computeVoteInfluence({
    voteCount,
    distinctVoterCount,
    topicVoteCount,
    scoringProfile: input.scoringProfile,
    roundKind: input.roundKind,
    templateId: input.templateId,
    capOverride: input.shadowVoteInfluenceCap,
  });

  return {
    initialScore,
    finalScore: blendFinalScore({
      initialScore,
      weightedVoteScore,
      voteInfluence: liveVoteInfluence,
    }),
    shadowInitialScore,
    shadowFinalScore: blendFinalScore({
      initialScore: shadowInitialScore,
      weightedVoteScore,
      voteInfluence: shadowVoteInfluence,
    }),
  };
}
