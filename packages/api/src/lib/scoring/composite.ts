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
  weightedVoteScore?: number | null;
  voteCount?: number;
  distinctVoterCount?: number;
  topicVoteCount?: number;
  liveVoteInfluenceCap?: number;
  shadowVoteInfluenceCap?: number;
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
    liveBase =
      relevance * liveWeights.relevance +
      novelty * liveWeights.novelty +
      reframe * liveWeights.reframe +
      input.substanceScore * liveWeights.substance +
      input.roleBonus * liveWeights.role;
    shadowBase =
      relevance * shadowWeights.relevance +
      novelty * shadowWeights.novelty +
      reframe * shadowWeights.reframe +
      input.substanceScore * shadowWeights.substance +
      input.roleBonus * shadowWeights.role;
  } else {
    liveBase =
      input.substanceScore * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.live.substance +
      input.roleBonus * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.live.role;
    shadowBase =
      input.substanceScore * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.shadow.substance +
      input.roleBonus * WITHOUT_SEMANTICS_FALLBACK_WEIGHTS.shadow.role;
  }

  const initialScore = clamp(liveBase * alignment * input.liveMultiplier * reputationBoost, 0, 100);
  const shadowInitialScore = clamp(shadowBase * alignment * input.shadowMultiplier * reputationBoost, 0, 100);
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
