import { Hono } from "hono";
import { VoteSubmissionSchema, VoteBatchSubmissionSchema, ClaimVoteAxisSchema, ClaimVoteDirectionSchema } from "@opndomain/shared";
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

/** Pre-resolved batch context, invariant across all items in a single (topic, being, round) call. */
type ResolvedBatchContext = {
  topicId: string;
  context: Awaited<ReturnType<typeof resolveVoteContext>>;
  resolvedTargets: Awaited<ReturnType<typeof resolveVoteTargets>>;
  policy: { maxVotesPerActor: number };
};

type SingleVoteItemResult = {
  voteKind: string;
  contributionId: string;
  status: "accepted" | "replayed" | "failed";
  voteId?: string;
  code?: string;
  message?: string;
  details?: unknown;
  /** Raw DO payload, only set for accepted/replayed via DO. */
  doPayload?: Record<string, unknown>;
  /** Raw DO response status, only set for DO 409. */
  doStatus?: number;
  /** Full replay response for D1 replays (singular adapter uses this). */
  replayResponse?: ReturnType<typeof voteReplayResponse>;
};

/**
 * Process a single vote item against pre-resolved batch context.
 *
 * **Never throws ApiError.** All per-item failures are returned as { status: "failed" } result objects.
 * Only truly unexpected errors (D1 connection failures, JSON parse errors) propagate as thrown exceptions.
 *
 * **In-batch ordering dependency:** This function must be awaited sequentially within a batch loop.
 * submitVote() is synchronous with respect to the DO write — once it returns, subsequent DO fetches
 * (including pending-summary) observe the write. If submitVote is ever made fire-and-forget or
 * eventually-consistent, in-batch ordering silently breaks.
 */
async function processSingleVote(
  env: ApiEnv,
  resolved: ResolvedBatchContext,
  item: { contributionId: string; voteKind: string; idempotencyKey: string },
): Promise<SingleVoteItemResult> {
  const { topicId, context, resolvedTargets, policy } = resolved;
  const { eligibleContributionIds } = resolvedTargets;
  const baseResult = { voteKind: item.voteKind, contributionId: item.contributionId };

  try {
    // Target validation
    if (!eligibleContributionIds.includes(item.contributionId)) {
      return { ...baseResult, status: "failed", code: "invalid_vote_target", message: "The requested contribution is not in the active round's eligible vote target set." };
    }

    // Self-vote check
    const contributionOwner = await firstRow<{ being_id: string | null }>(
      env.DB,
      `SELECT being_id FROM contributions WHERE id = ?`,
      item.contributionId,
    );
    if (contributionOwner?.being_id === context.being.id) {
      return { ...baseResult, status: "failed", code: "forbidden", message: "That being cannot vote on its own contribution." };
    }

    // D1 replay short-circuit
    const persistedVote = await firstRow<ExistingVoteRow>(
      env.DB,
      `
        SELECT id, topic_id, round_id, contribution_id, voter_being_id, direction, weight, vote_kind, created_at
        FROM votes
        WHERE round_id = ? AND vote_kind = ? AND voter_being_id = ?
      `,
      context.activeRound.id,
      item.voteKind,
      context.being.id,
    );
    if (persistedVote) {
      if (persistedVote.contribution_id !== item.contributionId) {
        return { ...baseResult, status: "failed", code: "conflict", message: "You already cast this vote kind on a different contribution this round.", details: { existingContributionId: persistedVote.contribution_id } };
      }
      return { ...baseResult, status: "replayed", voteId: persistedVote.id, replayResponse: voteReplayResponse(persistedVote) };
    }

    // DO pending-summary fetch (per-item, not hoisted — must reflect earlier items in the same batch)
    const namespaceId = env.TOPIC_STATE_DO.idFromName(topicId);
    const stub = env.TOPIC_STATE_DO.get(namespaceId);
    const pendingVoteSummaryResponse = await stub.fetch(
      `https://topic-state.internal/vote-summary?roundId=${encodeURIComponent(context.activeRound.id)}&contributionId=${encodeURIComponent(item.contributionId)}&voterBeingId=${encodeURIComponent(context.being.id)}&voteKind=${encodeURIComponent(item.voteKind)}`,
    );
    const pendingVoteSummary = (await pendingVoteSummaryResponse.json()) as PendingVoteSummary;

    // Quota check
    const persistedVoteCountRow = await firstRow<VoteCountRow>(
      env.DB,
      `
        SELECT COUNT(*) AS count
        FROM votes
        WHERE round_id = ? AND voter_being_id = ?
      `,
      context.activeRound.id,
      context.being.id,
    );
    const requestedDirection = item.voteKind === "fabrication" ? -1 : 1;
    const totalVotesThisRound =
      Number(persistedVoteCountRow?.count ?? 0) + Number(pendingVoteSummary.pendingVoteCount ?? 0);
    const isPendingReplay =
      pendingVoteSummary.hasMatchingVoteKind && pendingVoteSummary.matchingDirection === requestedDirection;
    if (totalVotesThisRound >= policy.maxVotesPerActor && !isPendingReplay) {
      return { ...baseResult, status: "failed", code: "forbidden", message: "That being has already used all available votes for the active round." };
    }

    // 3-distinct: reject if this contribution is already targeted by a different vote kind
    if (pendingVoteSummary.contributionAlreadyTargeted && !isPendingReplay) {
      const existingVoteOnContribution = await firstRow<{ id: string }>(
        env.DB,
        `SELECT id FROM votes WHERE round_id = ? AND voter_being_id = ? AND contribution_id = ?`,
        context.activeRound.id,
        context.being.id,
        item.contributionId,
      );
      if (existingVoteOnContribution) {
        return { ...baseResult, status: "failed", code: "forbidden", message: "You have already voted on this contribution with a different vote kind." };
      }
    }
    // Also check D1 for the 3-distinct rule
    if (!isPendingReplay) {
      const existingD1VoteOnContribution = await firstRow<{ id: string }>(
        env.DB,
        `SELECT id FROM votes WHERE round_id = ? AND voter_being_id = ? AND contribution_id = ?`,
        context.activeRound.id,
        context.being.id,
        item.contributionId,
      );
      if (existingD1VoteOnContribution) {
        return { ...baseResult, status: "failed", code: "forbidden", message: "You have already voted on this contribution with a different vote kind." };
      }
    }

    // Submit to DO
    const doResponse = await submitVote(env, {
      topicId,
      templateId: context.topic.template_id,
      activeRoundId: context.activeRound.id,
      activeRoundSequenceIndex: context.activeRound.sequence_index,
      voterBeingId: context.being.id,
      voterTrustTier: context.being.trust_tier,
      roundConfig: context.roundConfig,
      contributionId: item.contributionId,
      voteKind: item.voteKind,
      idempotencyKey: item.idempotencyKey,
      resolvedTargets,
    });

    const payload = await doResponse.json() as Record<string, unknown>;

    if (doResponse.status === 409) {
      return { ...baseResult, status: "failed", code: "conflict", message: String(payload.message ?? "Conflict from DO"), details: payload, doPayload: payload, doStatus: 409 };
    }

    // Archive protocol event for newly accepted votes
    if (doResponse.ok && payload.replayed !== true) {
      try {
        await archiveProtocolEvent(env, {
          occurredAt: new Date().toISOString(),
          kind: "vote_cast",
          topicId,
          roundId: context.activeRound.id,
          targetRoundId: resolvedTargets.targetRoundId,
          contributionId: item.contributionId,
          voterBeingId: context.being.id,
          voteKind: item.voteKind,
          direction: requestedDirection as -1 | 1,
          weight: Number(payload.weight ?? 0),
        });
      } catch (error) {
        console.error("vote event archive failed", error);
      }
    }

    return {
      ...baseResult,
      status: payload.replayed ? "replayed" : "accepted",
      voteId: String(payload.id ?? ""),
      doPayload: payload,
      doStatus: doResponse.status,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ...baseResult, status: "failed", code: error.code, message: error.message, details: error.details };
    }
    throw error;
  }
}

export const voteRoutes = new Hono<{ Bindings: ApiEnv }>();

// --- Singular vote endpoint (thin adapter over processSingleVote) ---

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

    const resolved: ResolvedBatchContext = {
      topicId: pathTopicId,
      context,
      resolvedTargets,
      policy: resolvedTargets.policy,
    };

    const result = await processSingleVote(c.env, resolved, {
      contributionId: body.contributionId,
      voteKind: body.voteKind,
      idempotencyKey: body.idempotencyKey,
    });

    // Translate helper result back into the singular endpoint's existing HTTP response shape.
    if (result.status === "replayed" && result.replayResponse) {
      // D1 replay path — use the replay response built by the helper.
      return jsonData(c, result.replayResponse);
    }
    if (result.doStatus === 409 && result.doPayload) {
      // DO 409 passthrough — return the raw DO payload verbatim at HTTP 409.
      return c.json(result.doPayload, 409);
    }
    if (result.status === "failed") {
      throw new ApiError(
        result.code === "forbidden" ? 403 : result.code === "conflict" ? 409 : 400,
        result.code ?? "unknown",
        result.message ?? "Vote failed.",
        result.details,
      );
    }
    // accepted or DO-side replayed — preserve the original DO status code (e.g. 201 for created)
    return jsonData(c, result.doPayload ?? result, result.doStatus ?? 200);
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

// --- Bulk vote endpoint ---

voteRoutes.post("/:topicId/votes/batch", async (c) => {
  try {
    const body = parseJsonBody(VoteBatchSubmissionSchema, await c.req.json());
    const pathTopicId = c.req.param("topicId");

    // Whole-batch pre-check: duplicate voteKind in the batch
    const seenKinds = new Set<string>();
    for (const item of body.votes) {
      if (seenKinds.has(item.voteKind)) {
        badRequest("duplicate_vote_kind", `Duplicate voteKind "${item.voteKind}" in the batch. Each vote kind may appear at most once.`);
      }
      seenKinds.add(item.voteKind);
    }

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

    const resolved: ResolvedBatchContext = {
      topicId: pathTopicId,
      context,
      resolvedTargets,
      policy: resolvedTargets.policy,
    };

    // Process items sequentially to preserve in-batch ordering guarantees (see processSingleVote JSDoc).
    const results: Array<{ voteKind: string; contributionId: string; status: string; voteId?: string; code?: string; message?: string; details?: unknown }> = [];
    for (const item of body.votes) {
      const result = await processSingleVote(c.env, resolved, {
        contributionId: item.contributionId,
        voteKind: item.voteKind,
        idempotencyKey: item.idempotencyKey,
      });
      results.push({
        voteKind: result.voteKind,
        contributionId: result.contributionId,
        status: result.status,
        ...(result.voteId ? { voteId: result.voteId } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.message ? { message: result.message } : {}),
        ...(result.details !== undefined ? { details: result.details } : {}),
      });
    }

    return jsonData(c, { results });
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
