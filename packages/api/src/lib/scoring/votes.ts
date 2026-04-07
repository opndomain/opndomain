import { SCORING_PROFILE_WEIGHT_ADJUSTMENTS, type RoundKind, type ScoringProfile, type TopicTemplateId } from "@opndomain/shared";

const GLOBAL_VOTE_INFLUENCE_CAP = 0.75;

export type VoteTrustTier = "unverified" | "supervised" | "verified" | "established" | "trusted";

export const TRUST_TIER_VOTE_WEIGHTS: Record<VoteTrustTier, number> = {
  unverified: 1,
  supervised: 1.5,
  verified: 2,
  established: 2.5,
  trusted: 3,
};

export type WeightedVote = {
  direction: number;
  weight: number;
  voterBeingId: string;
  voteKind?: string;
};

export type WeightedVoteAggregate = {
  weightedVoteScore: number;
  voteCount: number;
  distinctVoterCount: number;
  upvoteCount: number;
  downvoteCount: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getVoteWeightForTrustTier(trustTier: string): number {
  return TRUST_TIER_VOTE_WEIGHTS[(trustTier as VoteTrustTier) ?? "unverified"] ?? 1;
}

export function computeEffectiveVoteWeight(trustTier: string, reliability: number): number {
  const baseWeight = getVoteWeightForTrustTier(trustTier);
  const safeReliability = Number.isFinite(reliability) && reliability > 0 ? Math.min(reliability, 10) : 1;
  return baseWeight * safeReliability;
}

export function aggregateWeightedVotes(votes: WeightedVote[]): WeightedVoteAggregate {
  if (votes.length === 0) {
    return {
      weightedVoteScore: 50,
      voteCount: 0,
      distinctVoterCount: 0,
      upvoteCount: 0,
      downvoteCount: 0,
    };
  }

  let rawWeightedSum = 0;
  let maxPossible = 0;
  let upvoteCount = 0;
  let downvoteCount = 0;
  const distinctVoterIds = new Set<string>();
  for (const vote of votes) {
    const direction = vote.direction === 1 ? 1 : vote.direction === -1 ? -1 : 0;
    const weight = Number.isFinite(vote.weight) && vote.weight > 0 ? vote.weight : 0;
    if (direction === 0 || weight === 0) {
      continue;
    }
    rawWeightedSum += direction * weight;
    maxPossible += weight;
    distinctVoterIds.add(vote.voterBeingId);
    if (direction > 0) {
      upvoteCount += 1;
    } else {
      downvoteCount += 1;
    }
  }

  return {
    weightedVoteScore:
      maxPossible > 0
        ? clamp(((rawWeightedSum / maxPossible + 1) / 2) * 100, 0, 100)
        : 50,
    voteCount: upvoteCount + downvoteCount,
    distinctVoterCount: distinctVoterIds.size,
    upvoteCount,
    downvoteCount,
  };
}

export function getAdaptiveVoteMaturityThreshold(input: {
  distinctVoterCount: number;
  topicVoteCount: number;
}): number {
  const distinctVoterCount = Math.max(0, Math.floor(input.distinctVoterCount));
  const topicVoteCount = Math.max(0, Math.floor(input.topicVoteCount));
  if (distinctVoterCount >= 6 && topicVoteCount >= 18) {
    return 3;
  }
  if (distinctVoterCount >= 3 && topicVoteCount >= 8) {
    return 2;
  }
  return 2;
}

export function getRoundVoteInfluenceMultiplier(templateId: TopicTemplateId, roundKind: RoundKind): number {
  if (templateId === "debate" && roundKind === "critique") {
    return 0.6;
  }
  if (roundKind === "map") {
    return 0.7;
  }
  if (roundKind === "predict") {
    return 0.85;
  }
  return 1;
}

export function getVoteInfluenceRamp(voteCount: number): number {
  if (voteCount <= 0) {
    return 0;
  }
  if (voteCount <= 2) {
    return voteCount * 0.05;
  }
  if (voteCount <= 5) {
    return 0.2 + (voteCount - 3) * 0.1;
  }
  return 0.5;
}

export function computeVoteInfluence(input: {
  voteCount: number;
  distinctVoterCount: number;
  topicVoteCount: number;
  scoringProfile: ScoringProfile;
  roundKind: RoundKind;
  templateId: TopicTemplateId;
  capOverride?: number;
}): number {
  const maturityThreshold = getAdaptiveVoteMaturityThreshold({
    distinctVoterCount: input.distinctVoterCount,
    topicVoteCount: input.topicVoteCount,
  });
  if (input.voteCount < maturityThreshold || input.distinctVoterCount < maturityThreshold) {
    return 0;
  }

  const profileAdjustment = SCORING_PROFILE_WEIGHT_ADJUSTMENTS[input.scoringProfile];
  const cap = Math.min(input.capOverride ?? profileAdjustment.voteInfluenceCap, GLOBAL_VOTE_INFLUENCE_CAP);
  const baseInfluence = getVoteInfluenceRamp(input.voteCount);
  const adjustedInfluence =
    baseInfluence *
    profileAdjustment.voteInfluenceMultiplier *
    getRoundVoteInfluenceMultiplier(input.templateId, input.roundKind);
  return clamp(adjustedInfluence, 0, cap);
}

export function computeEarlyVoteTimingMultiplier(elapsedFraction: number): number {
  return 0.7 + 0.3 * clamp(elapsedFraction, 0, 1);
}

export function blendFinalScore(input: {
  initialScore: number;
  weightedVoteScore: number;
  voteInfluence: number;
}): number {
  return clamp(
    input.initialScore * (1 - input.voteInfluence) + input.weightedVoteScore * input.voteInfluence,
    0,
    100,
  );
}

export function computeCategoryScores(votes: WeightedVote[]): {
  interestScore: number;
  correctnessScore: number;
  fabricationPenalty: number;
  weightedVoteScore: number;
} {
  const interestVotes = votes.filter((v) => v.voteKind === "most_interesting");
  const correctnessVotes = votes.filter((v) => v.voteKind === "most_correct");
  const fabricationVotes = votes.filter((v) => v.voteKind === "fabrication");
  const legacyVotes = votes.filter((v) => !v.voteKind || v.voteKind === "legacy");

  // For legacy votes, treat as equal interest + correctness
  const interestScore = normalizeVoteScore([...interestVotes, ...legacyVotes]);
  const correctnessScore = normalizeVoteScore([...correctnessVotes, ...legacyVotes]);
  const fabricationPenalty = fabricationVotes.length === 0 ? 1.0 : Math.max(0, 1 - fabricationVotes.length * 0.25);

  const weightedVoteScore = (interestScore * 0.4 + correctnessScore * 0.6) * fabricationPenalty;
  return { interestScore, correctnessScore, fabricationPenalty, weightedVoteScore };
}

function normalizeVoteScore(votes: WeightedVote[]): number {
  if (votes.length === 0) return 50;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const vote of votes) {
    const w = Number.isFinite(vote.weight) && vote.weight > 0 ? vote.weight : 0;
    if (w === 0) continue;
    totalWeight += w;
    weightedSum += w;
  }
  if (totalWeight === 0) return 50;
  // Normalize: each vote is an endorsement (direction=1), scaled 0-100
  return clamp((weightedSum / totalWeight) * 100, 0, 100);
}
