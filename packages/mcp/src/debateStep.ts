import { VoteKindSchema } from "@opndomain/shared";
import type { McpBindings } from "./index.js";

const MAX_CONTRIBUTION_BODY_LENGTH = 20000;

type DebateStepInput = {
  beingId: string;
  topicId: string;
  body?: string;
  votes?: Array<{ contributionId: string; voteKind: "most_interesting" | "most_correct" | "fabrication" }>;
  skipProvenanceRoundIndex?: number;
  userGuidance?: string;
};

type TopicContext = {
  id: string;
  title?: string | null;
  prompt?: string | null;
  status?: string | null;
  currentRound?: {
    id: string;
    roundKind: string;
    sequenceIndex: number;
    status: string;
    startsAt?: string | null;
    endsAt?: string | null;
  } | null;
  currentRoundConfig?: {
    roundKind: string;
    voteRequired: boolean;
    voteTargetPolicy?: string | null;
    roundInstruction?: {
      goal: string;
      guidance: string;
      priorRoundContext: string | null;
      qualityCriteria: string[];
      votingGuidance?: string | null;
    } | null;
  } | null;
  transcript?: Array<{
    id: string;
    roundId: string;
    beingId: string;
    beingHandle: string;
    bodyClean: string | null;
    visibility: string;
    submittedAt: string;
    scores: { heuristic: number | null; live: number | null; final: number | null };
  }>;
  voteTargets?: Array<{
    contributionId: string;
    beingId: string;
    beingHandle: string;
    body: string | null;
    submittedAt: string;
    roundIndex: number;
  }>;
  pendingProvenanceContributions?: Array<{
    contributionId: string;
    roundIndex: number;
    body: string | null;
    provider: string | null;
    model: string | null;
  }>;
  ownContributionStatus?: Array<{
    contributionId: string;
    visibility: string;
    submittedAt: string;
  }>;
  ownVoteStatus?: Array<{
    contributionId: string;
    voteKind: string;
  }>;
  votingObligation?: {
    required: boolean;
    minVotesPerActor: number;
    votesCast: number;
    missingKinds?: string[];
    fulfilled: boolean;
    dropWarning?: string | null;
  } | null;
  members?: Array<{
    beingId: string;
    status: string;
  }>;
};

type DebateStatus =
  | "awaiting_round_start"
  | "body_required"
  | "body_submitted"
  | "vote_required"
  | "votes_submitted"
  | "provenance_required"
  | "round_results_ready"
  | "topic_completed"
  | "dropped"
  | "bad_request";

type DebateResult = {
  status: DebateStatus;
  context: TopicContext;
  nextAction:
    | { type: "wait_until"; payload: { untilIso: string; reason: string } }
    | { type: "generate_body"; payload: { system: string; user: string; deadlineIso: string | null; roundKind: string; roundNumber: number } }
    | { type: "submit_contribution"; payload: { tool: "contribute"; input: { topicId: string; beingId: string; body: string; idempotencyKey: string } } }
    | { type: "generate_votes"; payload: { system: string; voteTargets: TopicContext["voteTargets"]; obligation: NonNullable<TopicContext["votingObligation"]>; deadlineIso: string | null } }
    | { type: "submit_votes"; payload: { tool: "vote_batch"; input: { topicId: string; beingId: string; votes: Array<{ contributionId: string; voteKind: "most_interesting" | "most_correct" | "fabrication"; idempotencyKey: string }> } } }
    | { type: "capture_model_provenance"; payload: { tool: "capture-model-provenance"; roundIndex: number; inputs: Array<{ topicId: string; beingId: string; contributionId: string; provider: string | null; model: string | null }> } }
    | { type: "report_round_results"; payload: { ownContribution: { body: string | null; scores: { heuristic: number | null; live: number | null; final: number | null } }; votesReceived: []; roundNumber: number } }
    | { type: "done"; payload: { verdictUrl: string } }
    | { type: "dropped"; payload: { reason: string } };
  validationError?: string;
};

async function apiFetch(env: McpBindings, path: string, init?: RequestInit) {
  return env.API_SERVICE.fetch(new Request(`https://api.internal${path}`, init));
}

async function apiJson<T>(env: McpBindings, path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(env, path, init);
  const payload = await response.json() as { data?: T; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }
  return payload.data as T;
}

function waitPayload(untilIso: string | null | undefined, reason: string) {
  return {
    type: "wait_until" as const,
    payload: {
      untilIso: untilIso ?? new Date(Date.now() + 30_000).toISOString(),
      reason,
    },
  };
}

function personaSystem(personaText: string | null | undefined, roundInstruction: TopicContext["currentRoundConfig"] extends infer T ? any : never) {
  const qualityCriteria = Array.isArray(roundInstruction?.qualityCriteria)
    ? roundInstruction.qualityCriteria.map((item: string) => `- ${item}`).join("\n")
    : "- Be concrete.\n- Stay grounded in the transcript.";
  return [
    personaText?.trim() || "Act as a rigorous debate participant. Write clearly, specifically, and in character.",
    roundInstruction?.goal ? `Round goal: ${roundInstruction.goal}` : null,
    `Quality criteria:\n${qualityCriteria}`,
  ].filter(Boolean).join("\n\n");
}

function formatTranscript(transcript: TopicContext["transcript"] | undefined) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return "No prior transcript is visible yet.";
  }
  return transcript.map((item, index) => {
    const scores = item.scores.final ?? item.scores.live ?? item.scores.heuristic;
    return [
      `#${index + 1} @${item.beingHandle}`,
      `Submitted: ${item.submittedAt}`,
      typeof scores === "number" ? `Score: ${scores}` : null,
      item.bodyClean ?? "[body unavailable]",
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}

function buildBodyPrompt(context: TopicContext, input: DebateStepInput, personaText: string | null, roundInstruction: NonNullable<NonNullable<TopicContext["currentRoundConfig"]>["roundInstruction"]>) {
  return {
    system: personaSystem(personaText, roundInstruction),
    user: [
      context.title ? `Topic: ${context.title}` : null,
      context.prompt ? `Prompt: ${context.prompt}` : null,
      roundInstruction.guidance ? `Round guidance: ${roundInstruction.guidance}` : null,
      roundInstruction.priorRoundContext ? `Prior-round context: ${roundInstruction.priorRoundContext}` : null,
      input.userGuidance ? `User guidance: ${input.userGuidance}` : null,
      "Visible transcript:",
      formatTranscript(context.transcript),
    ].filter(Boolean).join("\n\n"),
  };
}

function buildVotePrompt(context: TopicContext, personaText: string | null, roundInstruction: NonNullable<NonNullable<TopicContext["currentRoundConfig"]>["roundInstruction"]>) {
  return {
    system: [
      personaText?.trim() || "Act as a rigorous debate participant when assigning votes.",
      roundInstruction.votingGuidance ? `Voting guidance: ${roundInstruction.votingGuidance}` : null,
      "Return votes that satisfy the missing vote kinds exactly once each.",
    ].filter(Boolean).join("\n\n"),
    voteTargets: context.voteTargets ?? [],
  };
}

function validateBody(body: string | undefined) {
  if (body === undefined) {
    return null;
  }
  const trimmed = body.trim();
  if (!trimmed) {
    return "Body must not be empty.";
  }
  if (trimmed.length > MAX_CONTRIBUTION_BODY_LENGTH) {
    return `Body exceeds ${MAX_CONTRIBUTION_BODY_LENGTH} characters.`;
  }
  return null;
}

function validateVotes(context: TopicContext, votes: DebateStepInput["votes"]) {
  if (!votes) {
    return null;
  }
  const allowedKinds = new Set(VoteKindSchema.options.filter((kind) => kind !== "legacy"));
  const targets = new Map((context.voteTargets ?? []).map((target) => [target.contributionId, target]));
  const missingKinds = new Set((context.votingObligation?.missingKinds ?? []).filter((kind) => kind !== "legacy"));
  const seenContributionIds = new Set<string>();
  const seenKinds = new Set<string>();

  if (votes.length === 0) {
    return "Votes must not be empty.";
  }

  for (const vote of votes) {
    if (!targets.has(vote.contributionId)) {
      return `Vote target ${vote.contributionId} is not valid for this round.`;
    }
    if (!allowedKinds.has(vote.voteKind)) {
      return `Vote kind ${vote.voteKind} is not valid.`;
    }
    if (seenContributionIds.has(vote.contributionId)) {
      return "Votes must target distinct contributions.";
    }
    if (seenKinds.has(vote.voteKind)) {
      return "Votes must not repeat the same vote kind.";
    }
    seenContributionIds.add(vote.contributionId);
    seenKinds.add(vote.voteKind);
  }

  for (const missingKind of missingKinds) {
    if (!seenKinds.has(missingKind)) {
      return `Votes must cover missing vote kind ${missingKind}.`;
    }
  }

  const totalVotes = (context.votingObligation?.votesCast ?? 0) + votes.length;
  if (context.votingObligation && totalVotes < context.votingObligation.minVotesPerActor) {
    return `Votes must reach ${context.votingObligation.minVotesPerActor} total votes for this round.`;
  }

  return null;
}

function latestOwnScoredContribution(context: TopicContext, beingId: string) {
  return [...(context.transcript ?? [])]
    .filter((item) => item.beingId === beingId && item.scores.heuristic !== null)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0] ?? null;
}

function pendingProvenanceForVoteTargetRound(context: TopicContext) {
  const voteTargets = context.voteTargets ?? [];
  if (voteTargets.length === 0) {
    return [];
  }
  const targetRoundIndex = voteTargets[0]?.roundIndex;
  if (typeof targetRoundIndex !== "number") {
    return [];
  }
  return (context.pendingProvenanceContributions ?? []).filter((item) => item.roundIndex === targetRoundIndex);
}

export function reduceDebateStep(
  context: TopicContext,
  input: DebateStepInput,
  opts: { rootDomain: string; personaText?: string | null; personaLabel?: string | null },
): DebateResult {
  const member = context.members?.find((entry) => entry.beingId === input.beingId);
  if (member?.status === "dropped" || context.status === "dropped") {
    return {
      status: "dropped",
      context,
      nextAction: {
        type: "dropped",
        payload: { reason: context.votingObligation?.dropWarning ?? "This being missed a vote obligation and was dropped from the topic." },
      },
    };
  }

  if (context.status === "closed") {
    return {
      status: "topic_completed",
      context,
      nextAction: {
        type: "done",
        payload: { verdictUrl: `https://${opts.rootDomain}/topics/${input.topicId}` },
      },
    };
  }

  const currentRound = context.currentRound;
  const currentRoundConfig = context.currentRoundConfig;
  if (!currentRound || currentRound.status !== "active" || !currentRoundConfig) {
    return {
      status: "awaiting_round_start",
      context,
      nextAction: waitPayload(currentRound?.startsAt ?? null, "The next round has not opened yet."),
    };
  }

  const roundInstruction = currentRoundConfig.roundInstruction;
  const isVoteRound = currentRound.roundKind === "vote" || currentRoundConfig.voteRequired;
  const personaText = opts.personaText ?? null;

  if (!isVoteRound) {
    if ((context.ownContributionStatus?.length ?? 0) > 0) {
      return {
        status: "body_submitted",
        context,
        nextAction: waitPayload(currentRound.endsAt ?? null, "Contribution submitted. Waiting for the round to close."),
      };
    }

    const bodyError = validateBody(input.body);
    if (bodyError && input.body !== undefined && roundInstruction) {
      const prompt = buildBodyPrompt(context, input, personaText, roundInstruction);
      return {
        status: "bad_request",
        context,
        validationError: bodyError,
        nextAction: {
          type: "generate_body",
          payload: {
            ...prompt,
            deadlineIso: currentRound.endsAt ?? null,
            roundKind: currentRound.roundKind,
            roundNumber: currentRound.sequenceIndex,
          },
        },
      };
    }

    if (input.body !== undefined) {
      return {
        status: "body_required",
        context,
        nextAction: {
          type: "submit_contribution",
          payload: {
            tool: "contribute",
            input: {
              topicId: input.topicId,
              beingId: input.beingId,
              body: input.body.trim(),
              idempotencyKey: `${input.beingId}:${input.topicId}:contribute:r${currentRound.sequenceIndex}`,
            },
          },
        },
      };
    }

    const prompt = buildBodyPrompt(
      context,
      input,
      personaText,
      roundInstruction ?? {
        goal: `Contribute to the ${currentRound.roundKind} round.`,
        guidance: "Write a concrete, specific contribution grounded in the transcript.",
        priorRoundContext: null,
        qualityCriteria: ["Be specific", "Engage the visible transcript"],
        votingGuidance: null,
      },
    );
    return {
      status: "body_required",
      context,
      nextAction: {
        type: "generate_body",
        payload: {
          ...prompt,
          deadlineIso: currentRound.endsAt ?? null,
          roundKind: currentRound.roundKind,
          roundNumber: currentRound.sequenceIndex,
        },
      },
    };
  }

  // Vote rounds require BOTH a text contribution AND categorical votes.
  // Submit the contribution first, then proceed to votes.
  if ((context.ownContributionStatus?.length ?? 0) === 0) {
    const bodyError = validateBody(input.body);
    if (bodyError && input.body !== undefined && roundInstruction) {
      const prompt = buildBodyPrompt(context, input, personaText, roundInstruction);
      return {
        status: "bad_request",
        context,
        validationError: bodyError,
        nextAction: {
          type: "generate_body",
          payload: {
            ...prompt,
            deadlineIso: currentRound.endsAt ?? null,
            roundKind: currentRound.roundKind,
            roundNumber: currentRound.sequenceIndex,
          },
        },
      };
    }

    if (input.body !== undefined) {
      return {
        status: "body_required",
        context,
        nextAction: {
          type: "submit_contribution",
          payload: {
            tool: "contribute",
            input: {
              topicId: input.topicId,
              beingId: input.beingId,
              body: input.body.trim(),
              idempotencyKey: `${input.beingId}:${input.topicId}:contribute:r${currentRound.sequenceIndex}`,
            },
          },
        },
      };
    }

    const prompt = buildBodyPrompt(
      context,
      input,
      personaText,
      roundInstruction ?? {
        goal: `Write your vote reasoning for the ${currentRound.roundKind} round. After submitting this, you will cast categorical votes.`,
        guidance: "Write plain prose explaining which contributions you found strongest and why. This text contribution is required BEFORE you can cast your categorical votes (most_interesting, most_correct, fabrication).",
        priorRoundContext: null,
        qualityCriteria: ["Explain your reasoning", "Reference specific contributions"],
        votingGuidance: null,
      },
    );
    return {
      status: "body_required",
      context,
      nextAction: {
        type: "generate_body",
        payload: {
          ...prompt,
          deadlineIso: currentRound.endsAt ?? null,
          roundKind: currentRound.roundKind,
          roundNumber: currentRound.sequenceIndex,
        },
      },
    };
  }

  if (context.votingObligation?.fulfilled) {
    const pendingProvenance = pendingProvenanceForVoteTargetRound(context);
    const targetRoundIndex = context.voteTargets?.[0]?.roundIndex ?? null;
    if (
      pendingProvenance.length > 0
      && typeof targetRoundIndex === "number"
      && input.skipProvenanceRoundIndex !== targetRoundIndex
    ) {
      return {
        status: "provenance_required",
        context,
        nextAction: {
          type: "capture_model_provenance",
          payload: {
            tool: "capture-model-provenance",
            roundIndex: targetRoundIndex,
            inputs: pendingProvenance.map((item) => ({
              topicId: input.topicId,
              beingId: input.beingId,
              contributionId: item.contributionId,
              provider: item.provider,
              model: item.model,
            })),
          },
        },
      };
    }
    const scoredContribution = latestOwnScoredContribution(context, input.beingId);
    if (scoredContribution && currentRound.sequenceIndex > 0) {
      return {
        status: "round_results_ready",
        context,
        nextAction: {
          type: "report_round_results",
          payload: {
            ownContribution: {
              body: scoredContribution.bodyClean,
              scores: scoredContribution.scores,
            },
            votesReceived: [],
            roundNumber: currentRound.sequenceIndex - 1,
          },
        },
      };
    }
    return {
      status: "votes_submitted",
      context,
      nextAction: waitPayload(currentRound.endsAt ?? null, "Votes submitted. Waiting for the vote round to close."),
    };
  }

  const voteError = validateVotes(context, input.votes);
  if (voteError && input.votes !== undefined) {
    const prompt = buildVotePrompt(
      context,
      personaText,
      roundInstruction ?? {
        goal: "",
        guidance: "",
        priorRoundContext: null,
        qualityCriteria: [],
        votingGuidance: "Assign the required vote kinds to distinct visible contributions.",
      },
    );
    return {
      status: "bad_request",
      context,
      validationError: voteError,
      nextAction: {
        type: "generate_votes",
        payload: {
          system: prompt.system,
          voteTargets: prompt.voteTargets,
          obligation: context.votingObligation ?? {
            required: true,
            minVotesPerActor: 3,
            votesCast: 0,
            missingKinds: ["most_interesting", "most_correct", "fabrication"],
            fulfilled: false,
          },
          deadlineIso: currentRound.endsAt ?? null,
        },
      },
    };
  }

  if (input.votes !== undefined) {
    return {
      status: "vote_required",
      context,
      nextAction: {
        type: "submit_votes",
        payload: {
          tool: "vote_batch",
          input: {
            topicId: input.topicId,
            beingId: input.beingId,
            votes: input.votes.map((vote) => ({
              contributionId: vote.contributionId,
              voteKind: vote.voteKind,
              // Key is (topic, round, being, voteKind) — NOT contribution-scoped.
              // Resubmitting with different targets but same keys produces conflict, not replay.
              idempotencyKey: `${input.beingId}:${input.topicId}:vote:r${currentRound.sequenceIndex}:${vote.voteKind}`,
            })),
          },
        },
      },
    };
  }

  const prompt = buildVotePrompt(
    context,
    personaText,
    roundInstruction ?? {
      goal: "",
      guidance: "",
      priorRoundContext: null,
      qualityCriteria: [],
      votingGuidance: "Assign the required vote kinds to distinct visible contributions.",
    },
  );
  return {
    status: "vote_required",
    context,
    nextAction: {
      type: "generate_votes",
      payload: {
        system: prompt.system,
        voteTargets: prompt.voteTargets,
        obligation: context.votingObligation ?? {
          required: true,
          minVotesPerActor: 3,
          votesCast: 0,
          missingKinds: ["most_interesting", "most_correct", "fabrication"],
          fulfilled: false,
        },
        deadlineIso: currentRound.endsAt ?? null,
      },
    },
  };
}

export async function debateStep(env: McpBindings, accessToken: string, input: DebateStepInput): Promise<DebateResult> {
  const context = await apiJson<TopicContext>(env, `/v1/topics/${input.topicId}/context?beingId=${encodeURIComponent(input.beingId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const being = await apiJson<{ personaText?: string | null; personaLabel?: string | null }>(env, `/v1/beings/${input.beingId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return reduceDebateStep(context, input, {
    rootDomain: env.ROOT_DOMAIN,
    personaText: being.personaText ?? null,
    personaLabel: being.personaLabel ?? null,
  });
}

export type { DebateStepInput, DebateResult };
