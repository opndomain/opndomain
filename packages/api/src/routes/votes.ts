import { Hono } from "hono";
import { VoteSubmissionSchema } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { firstRow } from "../lib/db.js";
import { ApiError, badRequest, conflict, forbidden } from "../lib/errors.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";
import { authenticateRequest } from "../services/auth.js";
import { resolveVotePolicyDefaults, resolveVoteTargets, submitVote } from "../services/votes.js";
import { resolveVoteContext } from "./contributions.js";

type VoteCountRow = {
  count: number | null;
};

type ExistingVoteRow = {
  id: string;
  topic_id: string;
  round_id: string;
  contribution_id: string;
  voter_being_id: string;
  direction: number;
  weight: number | null;
  created_at: string;
};

type PendingVoteSummary = {
  pendingVoteCount: number;
  hasMatchingVoteKey: boolean;
  matchingDirection: number | null;
};

function voteReplayResponse(row: ExistingVoteRow) {
  return {
    id: row.id,
    topicId: row.topic_id,
    roundId: row.round_id,
    contributionId: row.contribution_id,
    voterBeingId: row.voter_being_id,
    direction: row.direction,
    weight: row.weight,
    value: row.direction >= 0 ? "up" : "down",
    weightedValue: Number(row.weight ?? 0) * row.direction,
    acceptedAt: row.created_at,
    replayed: true,
    pendingFlush: false,
  };
}

export const voteRoutes = new Hono<{ Bindings: ApiEnv }>();

voteRoutes.post("/:topicId/votes", async (c) => {
  try {
    const body = parseJsonBody(VoteSubmissionSchema, await c.req.json());
    const pathTopicId = c.req.param("topicId");

    const { agent } = await authenticateRequest(c.env, c.req.raw);
    const context = await resolveVoteContext(c.env, agent, pathTopicId, body.beingId);
    const votePolicy = resolveVotePolicyDefaults(
      context.topic.template_id,
      context.activeRound.sequence_index,
      context.roundConfig,
    );
    if (!votePolicy.voteRequired || !votePolicy.voteTargetPolicy) {
      badRequest("votes_disabled", "The active round is not accepting votes.");
    }

    const resolvedTargets = await resolveVoteTargets(
      c.env,
      pathTopicId,
      context.activeRound.sequence_index,
      body.beingId,
      context.roundConfig,
      context.topic.template_id,
    );
    const { eligibleContributionIds, policy } = resolvedTargets;
    if (!eligibleContributionIds.includes(body.contributionId)) {
      badRequest("invalid_vote_target", "The requested contribution is not in the active round's eligible vote target set.");
    }

    const contributionOwner = await firstRow<{ being_id: string | null }>(
      c.env.DB,
      `SELECT being_id FROM contributions WHERE id = ?`,
      body.contributionId,
    );
    if (contributionOwner?.being_id === body.beingId) {
      forbidden("That being cannot vote on its own contribution.");
    }

    const persistedVote = await firstRow<ExistingVoteRow>(
      c.env.DB,
      `
        SELECT id, topic_id, round_id, contribution_id, voter_being_id, direction, weight, created_at
        FROM votes
        WHERE round_id = ? AND contribution_id = ? AND voter_being_id = ?
      `,
      context.activeRound.id,
      body.contributionId,
      body.beingId,
    );
    if (persistedVote) {
      if (persistedVote.direction !== (body.value === "up" ? 1 : -1)) {
        conflict("A canonical vote already exists for that voter and contribution.", {
          existingDirection: persistedVote.direction,
        });
      }
      return jsonData(c, voteReplayResponse(persistedVote));
    }

    const namespaceId = c.env.TOPIC_STATE_DO.idFromName(pathTopicId);
    const stub = c.env.TOPIC_STATE_DO.get(namespaceId);
    const pendingVoteSummaryResponse = await stub.fetch(
      `https://topic-state.internal/vote-summary?roundId=${encodeURIComponent(context.activeRound.id)}&contributionId=${encodeURIComponent(body.contributionId)}&voterBeingId=${encodeURIComponent(body.beingId)}`,
    );
    const pendingVoteSummary = (await pendingVoteSummaryResponse.json()) as PendingVoteSummary;

    const persistedVoteCountRow = await firstRow<VoteCountRow>(
      c.env.DB,
      `
        SELECT COUNT(*) AS count
        FROM votes
        WHERE round_id = ? AND voter_being_id = ?
      `,
      context.activeRound.id,
      body.beingId,
    );
    const requestedDirection = body.value === "up" ? 1 : -1;
    const totalVotesThisRound =
      Number(persistedVoteCountRow?.count ?? 0) + Number(pendingVoteSummary.pendingVoteCount ?? 0);
    const isPendingReplay =
      pendingVoteSummary.hasMatchingVoteKey && pendingVoteSummary.matchingDirection === requestedDirection;
    if (totalVotesThisRound >= policy.maxVotesPerActor && !isPendingReplay) {
      forbidden("That being has already used all available votes for the active round.");
    }

    const doResponse = await submitVote(c.env, {
      topicId: pathTopicId,
      templateId: context.topic.template_id,
      activeRoundId: context.activeRound.id,
      activeRoundSequenceIndex: context.activeRound.sequence_index,
      voterBeingId: body.beingId,
      voterTrustTier: context.being.trust_tier,
      roundConfig: context.roundConfig,
      contributionId: body.contributionId,
      value: body.value,
      idempotencyKey: body.idempotencyKey,
      resolvedTargets,
    });

    const payload = await doResponse.json() as {
      weight?: number;
      replayed?: boolean;
    };
    if (doResponse.status === 409) {
      return c.json(payload, 409);
    }
    if (doResponse.ok && payload.replayed !== true) {
      try {
        await archiveProtocolEvent(c.env, {
          occurredAt: new Date().toISOString(),
          kind: "vote_cast",
          topicId: pathTopicId,
          roundId: context.activeRound.id,
          targetRoundId: resolvedTargets.targetRoundId,
          contributionId: body.contributionId,
          voterBeingId: body.beingId,
          direction: requestedDirection as -1 | 1,
          weight: Number(payload.weight ?? 0),
        });
      } catch (error) {
        console.error("vote event archive failed", error);
      }
    }
    return jsonData(c, payload, doResponse.status);
  } catch (error) {
    if (error instanceof ApiError) {
      return c.json(
        {
          error: error.code,
          code: error.code,
          message: error.message,
          details: error.details,
        },
        error.status as never,
      );
    }
    throw error;
  }
});
