import { Hono } from "hono";
import { VoteSubmissionSchema, ClaimVoteAxisSchema, ClaimVoteDirectionSchema } from "@opndomain/shared";
import { z } from "zod";
import type { ApiEnv } from "../lib/env.js";
import { firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";
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
  vote_kind: string;
  created_at: string;
};

type PendingVoteSummary = {
  pendingVoteCount: number;
  pendingVotesByKind: Record<string, number>;
  hasMatchingVoteKey: boolean;
  hasMatchingVoteKind: boolean;
  matchingDirection: number | null;
  contributionAlreadyTargeted: boolean;
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
    voteKind: row.vote_kind ?? "legacy",
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
        SELECT id, topic_id, round_id, contribution_id, voter_being_id, direction, weight, vote_kind, created_at
        FROM votes
        WHERE round_id = ? AND vote_kind = ? AND voter_being_id = ?
      `,
      context.activeRound.id,
      body.voteKind,
      body.beingId,
    );
    if (persistedVote) {
      if (persistedVote.contribution_id !== body.contributionId) {
        conflict("You already cast this vote kind on a different contribution this round.", {
          existingContributionId: persistedVote.contribution_id,
        });
      }
      return jsonData(c, voteReplayResponse(persistedVote));
    }

    const namespaceId = c.env.TOPIC_STATE_DO.idFromName(pathTopicId);
    const stub = c.env.TOPIC_STATE_DO.get(namespaceId);
    const pendingVoteSummaryResponse = await stub.fetch(
      `https://topic-state.internal/vote-summary?roundId=${encodeURIComponent(context.activeRound.id)}&contributionId=${encodeURIComponent(body.contributionId)}&voterBeingId=${encodeURIComponent(body.beingId)}&voteKind=${encodeURIComponent(body.voteKind)}`,
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
    const requestedDirection = body.voteKind === "fabrication" ? -1 : 1;
    const totalVotesThisRound =
      Number(persistedVoteCountRow?.count ?? 0) + Number(pendingVoteSummary.pendingVoteCount ?? 0);
    const isPendingReplay =
      pendingVoteSummary.hasMatchingVoteKind && pendingVoteSummary.matchingDirection === requestedDirection;
    if (totalVotesThisRound >= policy.maxVotesPerActor && !isPendingReplay) {
      forbidden("That being has already used all available votes for the active round.");
    }

    // 3-distinct: reject if this contribution is already targeted by a different vote kind
    if (pendingVoteSummary.contributionAlreadyTargeted && !isPendingReplay) {
      // Also check D1 for already-flushed votes targeting this contribution
      const existingVoteOnContribution = await firstRow<{ id: string }>(
        c.env.DB,
        `SELECT id FROM votes WHERE round_id = ? AND voter_being_id = ? AND contribution_id = ?`,
        context.activeRound.id,
        body.beingId,
        body.contributionId,
      );
      if (existingVoteOnContribution) {
        forbidden("You have already voted on this contribution with a different vote kind.");
      }
    }
    // Also check D1 for the 3-distinct rule
    if (!isPendingReplay) {
      const existingD1VoteOnContribution = await firstRow<{ id: string }>(
        c.env.DB,
        `SELECT id FROM votes WHERE round_id = ? AND voter_being_id = ? AND contribution_id = ?`,
        context.activeRound.id,
        body.beingId,
        body.contributionId,
      );
      if (existingD1VoteOnContribution) {
        forbidden("You have already voted on this contribution with a different vote kind.");
      }
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
      voteKind: body.voteKind,
      idempotencyKey: body.idempotencyKey,
      resolvedTargets,
    });

    const payload = await doResponse.json() as {
      weight?: number;
      replayed?: boolean;
      id?: string;
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
          voteKind: body.voteKind,
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

const ClaimVoteSubmissionSchema = z.object({
  beingId: z.string().min(1),
  instanceId: z.string().min(1),
  canonicalSlotId: z.string().min(1),
  axis: ClaimVoteAxisSchema,
  direction: ClaimVoteDirectionSchema,
});

voteRoutes.post("/:topicId/claim-votes", async (c) => {
  try {
    const body = parseJsonBody(ClaimVoteSubmissionSchema, await c.req.json());
    const topicId = c.req.param("topicId");
    const { agent } = await authenticateRequest(c.env, c.req.raw);

    // Verify being belongs to agent
    const being = await firstRow<{ id: string; trust_tier: string }>(
      c.env.DB,
      `SELECT id, trust_tier FROM beings WHERE id = ? AND agent_id = ?`,
      body.beingId,
      agent.id,
    );
    if (!being) {
      return forbidden("Being not found or not owned by agent.");
    }

    // Verify instance belongs to topic, is in correct phase, and being is a participant
    const instance = await firstRow<{ id: string; status: string; current_round_kind: string | null }>(
      c.env.DB,
      `SELECT ti.id, ti.status, ti.current_round_kind FROM topic_instances ti
       WHERE ti.id = ? AND ti.topic_id = ?`,
      body.instanceId,
      topicId,
    );
    if (!instance || instance.status !== "running") {
      return badRequest("instance_not_active", "Instance is not in a running state.");
    }

    // Verify the instance is in the claim vote phase (vote round)
    const activeRound = await firstRow<{ round_kind: string }>(
      c.env.DB,
      `SELECT round_kind FROM rounds
       WHERE instance_id = ? AND status = 'active' LIMIT 1`,
      body.instanceId,
    );
    if (!activeRound || activeRound.round_kind !== "vote") {
      return badRequest("wrong_phase", "Claim votes are only accepted during the vote round.");
    }

    const participant = await firstRow<{ id: string }>(
      c.env.DB,
      `SELECT id FROM instance_participants WHERE instance_id = ? AND being_id = ?`,
      body.instanceId,
      body.beingId,
    );
    if (!participant) {
      return forbidden("Not a participant in this instance.");
    }

    // Verify slot exists, belongs to topic, and is ballot-eligible
    const slot = await firstRow<{ id: string; ballot_eligible: number }>(
      c.env.DB,
      `SELECT id, ballot_eligible FROM canonical_slots WHERE id = ? AND topic_id = ?`,
      body.canonicalSlotId,
      topicId,
    );
    if (!slot) {
      return badRequest("slot_not_found", "Canonical slot not found.");
    }
    if (!slot.ballot_eligible) {
      return badRequest("slot_not_eligible", "This slot is not ballot-eligible.");
    }

    // Submit to topic-state DO
    const doId = c.env.TOPIC_STATE_DO.idFromName(topicId);
    const stub = c.env.TOPIC_STATE_DO.get(doId);
    const claimVoteId = createId("cv");
    const acceptedAt = new Date().toISOString();
    const idempotencyKey = `${body.instanceId}:${body.canonicalSlotId}:${body.beingId}:${body.axis}`;

    const doResponse = await stub.fetch(new Request("https://do/claim-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimVoteId,
        topicId,
        instanceId: body.instanceId,
        canonicalSlotId: body.canonicalSlotId,
        voterBeingId: body.beingId,
        axis: body.axis,
        direction: body.direction,
        weight: null,
        acceptedAt,
        idempotencyKey,
      }),
    }));

    const payload = await doResponse.json();
    return jsonData(c, payload, doResponse.status);
  } catch (error) {
    if (error instanceof ApiError) {
      return c.json(
        { error: error.code, code: error.code, message: error.message, details: error.details },
        error.status as never,
      );
    }
    throw error;
  }
});
