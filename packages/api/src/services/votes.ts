import { DEFAULT_MAX_VOTES_PER_ACTOR, RoundConfigSchema, TOPIC_TEMPLATES, type VoteTargetPolicy } from "@opndomain/shared";
import type { DetectedRole, RoundKind, ScoringProfile, TopicTemplateId } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { computeCompositeScore } from "../lib/scoring/composite.js";
import { aggregateWeightedVotes, computeCategoryScores, computeEarlyVoteTimingMultiplier, computeEffectiveVoteWeight, computeVoteInfluence } from "../lib/scoring/votes.js";
import { allRows, firstRow } from "../lib/db.js";
import { isTranscriptVisibleContribution } from "../lib/visibility.js";

type VoteContextRow = {
  contribution_id: string;
  substance_score: number | null;
  role_bonus: number | null;
  details_json: string | null;
  relevance: number | null;
  novelty: number | null;
  reframe: number | null;
  initial_score: number | null;
  shadow_initial_score: number | null;
  scoring_profile: string | null;
  round_kind: string;
  template_id: string;
  topic_id: string;
};

type PersistedVoteRow = {
  direction: number;
  weight: number | null;
  voter_being_id: string;
};

type PersistedContributionVoteRow = PersistedVoteRow & {
  contribution_id: string;
  vote_kind?: string;
};

export type TopicVoteStatsRow = {
  distinct_voter_count: number | null;
  topic_vote_count: number | null;
};

export type ContributionVoteAggregate = ReturnType<typeof aggregateWeightedVotes>;

type VoteTargetRow = {
  id: string;
  round_id: string;
  sequence_index: number;
  being_id: string;
  visibility: string;
  round_visibility: string | null;
  reveal_at: string | null;
};

type RoundRow = {
  id: string;
  sequence_index: number;
};

type VoteReliabilityRow = {
  reliability: number | null;
};

export type VoteRouteContext = {
  topicId: string;
  templateId: keyof typeof TOPIC_TEMPLATES;
  activeRoundId: string;
  activeRoundSequenceIndex: number;
  voterBeingId: string;
  voterTrustTier: string;
  roundConfig: unknown;
};

export type ResolvedVotePolicy = {
  voteRequired: boolean;
  voteTargetPolicy: VoteTargetPolicy | null;
  minVotesPerActor: number | null;
  maxVotesPerActor: number;
  earlyVoteWeightMode: string | null;
};

export type VoteSubmissionResult = {
  id: string;
  topicId: string;
  roundId: string;
  contributionId: string;
  voterBeingId: string;
  direction: number;
  weight: number;
  voteKind: string;
  weightedValue: number;
  acceptedAt: string;
  replayed: boolean;
  pendingFlush: boolean;
};

type ResolvedVoteTargets = {
  targetRoundId: string;
  eligibleContributionIds: string[];
  policy: ResolvedVotePolicy;
};

export function resolveVotePolicyDefaults(
  templateId: keyof typeof TOPIC_TEMPLATES,
  sequenceIndex: number,
  rawConfig: unknown,
): ResolvedVotePolicy {
  const parsed = RoundConfigSchema.parse(rawConfig);
  const templatePolicy = TOPIC_TEMPLATES[templateId]?.rounds[sequenceIndex]?.votePolicy ?? null;
  return {
    voteRequired: parsed.voteRequired ?? templatePolicy?.required ?? false,
    voteTargetPolicy: parsed.voteTargetPolicy ?? templatePolicy?.targetPolicy ?? null,
    minVotesPerActor: parsed.minVotesPerActor ?? null,
    maxVotesPerActor: parsed.maxVotesPerActor ?? DEFAULT_MAX_VOTES_PER_ACTOR,
    earlyVoteWeightMode: parsed.earlyVoteWeightMode ?? null,
  };
}

async function resolveAllowedTargetRound(
  env: ApiEnv,
  topicId: string,
  activeSequenceIndex: number,
  targetPolicy: VoteTargetPolicy,
): Promise<RoundRow> {
  if (targetPolicy === "prior_round") {
    if (activeSequenceIndex <= 0) {
      forbidden("The active round does not have a prior round to vote on.");
    }
    const round = await firstRow<RoundRow>(
      env.DB,
      `
        SELECT id, sequence_index
        FROM rounds
        WHERE topic_id = ? AND sequence_index = ?
        LIMIT 1
      `,
      topicId,
      activeSequenceIndex - 1,
    );
    if (!round) {
      notFound("The prior round for this vote window was not found.");
    }
    return round;
  }

  const round = await firstRow<RoundRow>(
    env.DB,
    `
      SELECT r.id, r.sequence_index
      FROM rounds r
      WHERE r.topic_id = ?
        AND r.sequence_index < ?
        AND EXISTS (
          SELECT 1
          FROM contributions c
          INNER JOIN round_configs rc ON rc.round_id = r.id
          WHERE c.round_id = r.id
            AND c.visibility IN ('normal', 'low_confidence')
            AND (
              json_extract(rc.config_json, '$.visibility') != 'sealed'
              OR (r.reveal_at IS NOT NULL AND r.reveal_at <= CURRENT_TIMESTAMP)
            )
        )
      ORDER BY r.sequence_index DESC
      LIMIT 1
    `,
    topicId,
    activeSequenceIndex,
  );
  if (!round) {
    notFound("No prior round with transcript-visible contributions is available for voting.");
  }
  return round;
}

export async function resolveVoteTargets(
  env: ApiEnv,
  topicId: string,
  currentRoundSequenceIndex: number,
  voterBeingId: string,
  rawConfig: unknown,
  templateId: keyof typeof TOPIC_TEMPLATES,
): Promise<{ targetRoundId: string; eligibleContributionIds: string[]; policy: ResolvedVotePolicy }> {
  const policy = resolveVotePolicyDefaults(templateId, currentRoundSequenceIndex, rawConfig);
  if (!policy.voteRequired || !policy.voteTargetPolicy) {
    badRequest("votes_disabled", "The active round is not accepting votes.");
  }

  const allowedRound = await resolveAllowedTargetRound(env, topicId, currentRoundSequenceIndex, policy.voteTargetPolicy);
  const rows = await allRows<VoteTargetRow>(
    env.DB,
    `
      SELECT
        c.id,
        c.round_id,
        r.sequence_index,
        c.being_id,
        c.visibility,
        json_extract(rc.config_json, '$.visibility') AS round_visibility,
        r.reveal_at
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN round_configs rc ON rc.round_id = r.id
      WHERE c.topic_id = ?
        AND c.round_id = ?
        AND c.visibility IN ('normal', 'low_confidence')
        AND c.being_id <> ?
      ORDER BY c.submitted_at ASC, c.created_at ASC
    `,
    topicId,
    allowedRound.id,
    voterBeingId,
  );

  return {
    targetRoundId: allowedRound.id,
    eligibleContributionIds: rows.filter((row) => isTranscriptVisibleContribution(row)).map((row) => row.id),
    policy,
  };
}

function parseDetectedRole(detailsJson: string | null): DetectedRole {
  if (!detailsJson) {
    return "claim";
  }
  try {
    const parsed = JSON.parse(detailsJson) as {
      role?: string;
      roleAnalysis?: { detectedRole?: string };
    };
    return (parsed.roleAnalysis?.detectedRole ?? parsed.role ?? "claim") as DetectedRole;
  } catch {
    return "claim";
  }
}

function buildInClause(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

function normalizeTopicVoteStats(row: TopicVoteStatsRow | null | undefined) {
  return {
    distinctVoterCount: Number(row?.distinct_voter_count ?? 0),
    topicVoteCount: Number(row?.topic_vote_count ?? 0),
  };
}

async function loadContributionContexts(env: ApiEnv, contributionIds: string[]) {
  if (contributionIds.length === 0) {
    return [] as VoteContextRow[];
  }

  const results = await env.DB
    .prepare(
      `
        SELECT
          cs.contribution_id,
          cs.substance_score,
          cs.role_bonus,
          cs.details_json,
          cs.relevance,
          cs.novelty,
          cs.reframe,
          cs.initial_score,
          cs.shadow_initial_score,
          cs.scoring_profile,
          r.round_kind,
          t.template_id,
          c.topic_id
        FROM contribution_scores cs
        INNER JOIN contributions c ON c.id = cs.contribution_id
        INNER JOIN rounds r ON r.id = c.round_id
        INNER JOIN topics t ON t.id = c.topic_id
        WHERE cs.contribution_id IN (${buildInClause(contributionIds)})
      `,
    )
    .bind(...contributionIds)
    .all<VoteContextRow>();
  return results.results ?? [];
}

async function loadContributionVotes(env: ApiEnv, contributionIds: string[]) {
  if (contributionIds.length === 0) {
    return [] as PersistedContributionVoteRow[];
  }

  const results = await env.DB
    .prepare(
      `
        SELECT contribution_id, direction, weight, voter_being_id, vote_kind
        FROM votes
        WHERE contribution_id IN (${buildInClause(contributionIds)})
      `,
    )
    .bind(...contributionIds)
    .all<PersistedContributionVoteRow>();
  return results.results ?? [];
}

async function loadTopicVoteStats(env: ApiEnv, topicIds: string[]) {
  if (topicIds.length === 0) {
    return new Map<string, TopicVoteStatsRow>();
  }

  const results = await env.DB
    .prepare(
      `
        SELECT
          topic_id,
          COUNT(DISTINCT CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN voter_being_id END) AS distinct_voter_count,
          COUNT(CASE WHEN direction IN (-1, 1) AND COALESCE(weight, 0) > 0 THEN 1 END) AS topic_vote_count
        FROM votes
        WHERE topic_id IN (${buildInClause(topicIds)})
        GROUP BY topic_id
      `,
    )
    .bind(...topicIds)
    .all<TopicVoteStatsRow & { topic_id: string }>();

  return new Map((results.results ?? []).map((row) => [row.topic_id, row]));
}

export async function recomputeContributionFinalScores(
  env: ApiEnv,
  contributionIds: string[],
  overrides?: {
    contributionAggregatesByContributionId?: Map<string, ContributionVoteAggregate>;
    topicStatsByTopicId?: Map<string, TopicVoteStatsRow>;
  },
): Promise<Map<string, { finalScore: number; shadowFinalScore: number }>> {
  const uniqueContributionIds = Array.from(new Set(contributionIds.filter(Boolean)));
  if (uniqueContributionIds.length === 0) {
    return new Map();
  }

  const contexts = await loadContributionContexts(env, uniqueContributionIds);
  if (contexts.length === 0) {
    return new Map();
  }

  const contributionAggregatesByContributionId =
    overrides?.contributionAggregatesByContributionId ??
    (() => {
      const map = new Map<string, ContributionVoteAggregate>();
      return map;
    })();
  if (!overrides?.contributionAggregatesByContributionId) {
    const voteRows = await loadContributionVotes(env, uniqueContributionIds);
    const votesByContributionId = new Map<string, Array<{ direction: number; weight: number; voterBeingId: string; voteKind?: string }>>();
    for (const vote of voteRows) {
      const existing = votesByContributionId.get(vote.contribution_id) ?? [];
      existing.push({
        direction: vote.direction,
        weight: Number(vote.weight ?? 0),
        voterBeingId: vote.voter_being_id,
        voteKind: vote.vote_kind,
      });
      votesByContributionId.set(vote.contribution_id, existing);
    }
    for (const context of contexts) {
      const votes = votesByContributionId.get(context.contribution_id) ?? [];
      const hasCategoricalVotes = votes.some((v) => v.voteKind && v.voteKind !== "legacy");
      if (hasCategoricalVotes) {
        const categoryScores = computeCategoryScores(votes);
        const baseAggregate = aggregateWeightedVotes(votes);
        contributionAggregatesByContributionId.set(context.contribution_id, {
          ...baseAggregate,
          weightedVoteScore: categoryScores.weightedVoteScore,
        });
      } else {
        contributionAggregatesByContributionId.set(
          context.contribution_id,
          aggregateWeightedVotes(votes),
        );
      }
    }
  }

  const topicIds = Array.from(new Set(contexts.map((context) => context.topic_id)));
  const topicStatsByTopicId = overrides?.topicStatsByTopicId ?? (await loadTopicVoteStats(env, topicIds));
  const outputs = new Map<string, { finalScore: number; shadowFinalScore: number }>();

  for (const contributionContext of contexts) {
    const aggregate = contributionAggregatesByContributionId.get(contributionContext.contribution_id) ?? aggregateWeightedVotes([]);
    const topicStats = normalizeTopicVoteStats(topicStatsByTopicId.get(contributionContext.topic_id));
    const voteInfluence = computeVoteInfluence({
      voteCount: aggregate.voteCount,
      distinctVoterCount: aggregate.distinctVoterCount,
      topicVoteCount: topicStats.topicVoteCount,
      scoringProfile: (contributionContext.scoring_profile ?? "adversarial") as ScoringProfile,
      roundKind: contributionContext.round_kind as RoundKind,
      templateId: contributionContext.template_id as TopicTemplateId,
    });
    const recomputed = computeCompositeScore({
      roundKind: contributionContext.round_kind as RoundKind,
      templateId: contributionContext.template_id as TopicTemplateId,
      scoringProfile: (contributionContext.scoring_profile ?? "adversarial") as ScoringProfile,
      reputationFactor: 0,
      substanceScore: Number(contributionContext.substance_score ?? 0),
      roleBonus: Number(contributionContext.role_bonus ?? 0),
      detectedRole: parseDetectedRole(contributionContext.details_json),
      relevance: contributionContext.relevance,
      novelty: contributionContext.novelty,
      reframe: contributionContext.reframe,
      liveMultiplier: 1,
      shadowMultiplier: 1,
      weightedVoteScore: aggregate.weightedVoteScore,
      voteCount: aggregate.voteCount,
      distinctVoterCount: aggregate.distinctVoterCount,
      topicVoteCount: topicStats.topicVoteCount,
      liveVoteInfluenceCap: voteInfluence,
    });
    const initialScore = Number(contributionContext.initial_score ?? 0);
    const shadowInitialScore = Number(contributionContext.shadow_initial_score ?? 0);
    const finalScore = Math.max(
      0,
      Math.min(initialScore * (1 - voteInfluence) + aggregate.weightedVoteScore * voteInfluence, 100),
    );
    const shadowDenominator = aggregate.weightedVoteScore - recomputed.shadowInitialScore;
    const shadowVoteInfluence =
      Math.abs(shadowDenominator) < Number.EPSILON
        ? 0
        : (recomputed.shadowFinalScore - recomputed.shadowInitialScore) / shadowDenominator;
    const shadowFinalScore = Math.max(
      0,
      Math.min(shadowInitialScore * (1 - shadowVoteInfluence) + aggregate.weightedVoteScore * shadowVoteInfluence, 100),
    );

    // Keep the compatibility mirror columns frozen at ingest-time initial values.
    await env.DB
      .prepare(
        `
          UPDATE contribution_scores
          SET
            final_score = ?,
            shadow_final_score = ?
          WHERE contribution_id = ?
        `,
      )
      .bind(finalScore, shadowFinalScore, contributionContext.contribution_id)
      .run();

    outputs.set(contributionContext.contribution_id, { finalScore, shadowFinalScore });
  }

  return outputs;
}

export async function recomputeContributionFinalScore(
  env: ApiEnv,
  contributionId: string,
): Promise<{ finalScore: number; shadowFinalScore: number } | null> {
  const results = await recomputeContributionFinalScores(env, [contributionId]);
  return results.get(contributionId) ?? null;
}

export async function submitVote(
  env: ApiEnv,
  input: VoteRouteContext & {
    contributionId: string;
    voteKind: string;
    idempotencyKey: string;
    resolvedTargets?: ResolvedVoteTargets;
  },
): Promise<Response> {
  const resolvedTargets =
    input.resolvedTargets ??
    (await resolveVoteTargets(
      env,
      input.topicId,
      input.activeRoundSequenceIndex,
      input.voterBeingId,
      input.roundConfig,
      input.templateId,
    ));
  const { targetRoundId, eligibleContributionIds } = resolvedTargets;
  if (!eligibleContributionIds.includes(input.contributionId)) {
    notFound("The requested contribution was not found in the policy-allowed vote target set.");
  }

  const reliability = await firstRow<VoteReliabilityRow>(
    env.DB,
    `
      SELECT reliability
      FROM vote_reliability
      WHERE being_id = ?
    `,
    input.voterBeingId,
  );
  const direction = input.voteKind === "fabrication" ? -1 : 1;
  let weight = computeEffectiveVoteWeight(input.voterTrustTier, Number(reliability?.reliability ?? 1));

  // E2: Apply early-vote timing multiplier when earlyVoteWeightMode is configured
  const { policy } = resolvedTargets;
  if (policy.earlyVoteWeightMode === "downweight_early") {
    const roundTiming = await firstRow<{ starts_at: string | null; ends_at: string | null }>(
      env.DB,
      `SELECT starts_at, ends_at FROM rounds WHERE id = ? LIMIT 1`,
      input.activeRoundId,
    );
    const startsAtMs = roundTiming?.starts_at ? new Date(roundTiming.starts_at).getTime() : Number.NaN;
    const endsAtMs = roundTiming?.ends_at ? new Date(roundTiming.ends_at).getTime() : Number.NaN;
    if (Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && endsAtMs > startsAtMs) {
      const nowMs = Date.now();
      const elapsedFraction = (nowMs - startsAtMs) / (endsAtMs - startsAtMs);
      const timingMultiplier = computeEarlyVoteTimingMultiplier(elapsedFraction);
      weight = weight * timingMultiplier;
    }
  }

  const acceptedAt = new Date().toISOString();

  const namespaceId = env.TOPIC_STATE_DO.idFromName(input.topicId);
  const stub = env.TOPIC_STATE_DO.get(namespaceId);
  return stub.fetch("https://topic-state.internal/vote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      voteId: createId("vot"),
      topicId: input.topicId,
      roundId: input.activeRoundId,
      contributionId: input.contributionId,
      voterBeingId: input.voterBeingId,
      direction,
      weight,
      voteKind: input.voteKind,
      weightedValue: direction * weight,
      acceptedAt,
      idempotencyKey: input.idempotencyKey,
      targetRoundId,
    }),
  });
}
