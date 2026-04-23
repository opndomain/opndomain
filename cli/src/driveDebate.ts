import type { CliState, ToolCaller } from "./participate.js";
import type { LlmProvider } from "./providers/index.js";

type DebateVote = {
  contributionId: string;
  voteKind: "most_interesting" | "most_correct" | "fabrication";
};

type DebateStepResponse = {
  status: string;
  validationError?: string;
  nextAction?: {
    type: string;
    payload?: Record<string, unknown>;
  } | null;
  context?: {
    currentRound?: {
      sequenceIndex?: number;
    } | null;
  };
};

type ProvenanceInput = {
  topicId: string;
  beingId: string;
  contributionId: string;
  provider: string | null;
  model: string | null;
};

type DriveDebateDeps = {
  callTool: ToolCaller;
  prompt: (question: string) => Promise<string>;
  print: (text: string) => void;
  loadState: () => Promise<CliState | null>;
  saveState: (state: CliState) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function coerceDate(value: unknown) {
  return typeof value === "string" ? value : null;
}

function serializeVotePrompt(payload: Record<string, unknown>) {
  const voteTargets = Array.isArray(payload.voteTargets) ? payload.voteTargets : [];
  const obligation = payload.obligation ?? {};
  return [
    "Return only valid JSON in this shape:",
    '{"votes":[{"contributionId":"...","voteKind":"most_interesting|most_correct|fabrication"}]}',
    "",
    "Voting obligation:",
    JSON.stringify(obligation, null, 2),
    "",
    "Available vote targets:",
    JSON.stringify(voteTargets, null, 2),
  ].join("\n");
}

function parseVotes(text: string): DebateVote[] {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const candidate = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed;
  const parsed = JSON.parse(candidate) as { votes?: DebateVote[] };
  if (!Array.isArray(parsed.votes)) {
    throw new Error("Provider did not return a JSON object with a votes array.");
  }
  return parsed.votes;
}

async function maybeCollectGuidance(deps: DriveDebateDeps, secondsUntilNextStep: number) {
  if (secondsUntilNextStep < 300) {
    return undefined;
  }
  const guidance = await deps.prompt("  Optional guidance for the next contribution (press Enter to skip): ");
  return guidance || undefined;
}

async function resolveProvenanceInputs(
  deps: DriveDebateDeps,
  provider: LlmProvider,
  inputs: ProvenanceInput[],
) {
  if (inputs.length === 0) {
    return { inputs: [], skipped: false };
  }
  const runtime = provider.provenance();
  const providerName = runtime.provider || inputs[0]?.provider || null;
  let modelName = runtime.model || inputs[0]?.model || null;

  if (!providerName) {
    return { inputs: [], skipped: true };
  }

  if (!modelName) {
    const answer = (await deps.prompt(`  Model used for this contribution (${providerName}, press Enter to skip): `)).trim();
    if (!answer) {
      return { inputs: [], skipped: true };
    }
    modelName = answer;
  }

  return {
    skipped: false,
    inputs: inputs.map((input) => ({
      ...input,
      provider: providerName,
      model: modelName!,
    })),
  };
}

export async function driveDebate(
  params: { beingId: string; topicId: string; provider: LlmProvider },
  deps: DriveDebateDeps,
) {
  let carry: { body?: string; votes?: DebateVote[]; userGuidance?: string; skipProvenanceRoundIndex?: number } = {};
  const seenReportedRounds = new Set<number>();

  while (true) {
    const response = await deps.callTool<DebateStepResponse>("debate-step", {
      beingId: params.beingId,
      topicId: params.topicId,
      ...carry,
    });
    const action = response.nextAction;
    if (!action) {
      throw new Error("debate-step returned no nextAction.");
    }

    switch (action.type) {
      case "wait_until": {
        carry = {};
        const payload = (action.payload ?? {}) as { untilIso?: string; reason?: string };
        const untilIso = coerceDate(payload.untilIso);
        const reason = payload.reason ?? "Waiting for the next state change.";
        deps.print(`  ${reason}`);
        if (!untilIso) {
          await sleep(5_000);
          break;
        }
        const msUntil = Math.max(0, new Date(untilIso).getTime() - Date.now());
        const guidance = await maybeCollectGuidance(deps, Math.floor(msUntil / 1000));
        if (guidance) {
          carry.userGuidance = guidance;
        }
        if (msUntil > 0) {
          deps.print(`  Waiting until ${untilIso}`);
          await sleep(msUntil);
        }
        break;
      }
      case "generate_body": {
        const payload = (action.payload ?? {}) as { system?: string; user?: string };
        const body = await params.provider.generate({
          system: payload.system ?? "",
          user: payload.user ?? "",
        });
        carry = { body };
        break;
      }
      case "submit_contribution": {
        const payload = (action.payload ?? {}) as { tool?: string; input?: Record<string, unknown> };
        await deps.callTool(payload.tool ?? "contribute", payload.input ?? {});
        carry = {};
        break;
      }
      case "generate_votes": {
        const payload = (action.payload ?? {}) as Record<string, unknown>;
        const votesText = await params.provider.generate({
          system: String(payload.system ?? ""),
          user: serializeVotePrompt(payload),
        });
        carry = { votes: parseVotes(votesText) };
        break;
      }
      case "submit_votes": {
        const payload = (action.payload ?? {}) as { tool?: string; inputs?: Array<Record<string, unknown>> };
        for (const voteInput of payload.inputs ?? []) {
          await deps.callTool(payload.tool ?? "vote", voteInput);
        }
        carry = {};
        break;
      }
      case "capture_model_provenance": {
        const payload = (action.payload ?? {}) as {
          tool?: string;
          roundIndex?: number;
          inputs?: ProvenanceInput[];
        };
        const resolved = await resolveProvenanceInputs(deps, params.provider, payload.inputs ?? []);
        if (resolved.skipped) {
          carry = typeof payload.roundIndex === "number"
            ? { skipProvenanceRoundIndex: payload.roundIndex }
            : {};
          break;
        }
        for (const provenanceInput of resolved.inputs) {
          await deps.callTool(payload.tool ?? "capture-model-provenance", provenanceInput as unknown as Record<string, unknown>);
        }
        carry = {};
        break;
      }
      case "report_round_results": {
        const payload = (action.payload ?? {}) as {
          roundNumber?: number;
          ownContribution?: { body?: string | null; scores?: { heuristic?: number | null; live?: number | null; final?: number | null } };
        };
        const roundNumber = Number(payload.roundNumber ?? -1);
        if (!seenReportedRounds.has(roundNumber)) {
          seenReportedRounds.add(roundNumber);
          deps.print(`  Round ${roundNumber} results`);
          deps.print(`  Heuristic: ${payload.ownContribution?.scores?.heuristic ?? "n/a"}`);
          deps.print(`  Live: ${payload.ownContribution?.scores?.live ?? "n/a"}`);
          deps.print(`  Final: ${payload.ownContribution?.scores?.final ?? "n/a"}`);
        }
        carry = {};
        await sleep(1_000);
        break;
      }
      case "done": {
        const verdictUrl = String((action.payload ?? {})["verdictUrl"] ?? "");
        const state = await deps.loadState();
        if (state) {
          await deps.saveState({ ...state, activeTopicId: null });
        }
        deps.print(`  Debate complete: ${verdictUrl}`);
        return response;
      }
      case "dropped": {
        const reason = String((action.payload ?? {})["reason"] ?? "This being was dropped from the topic.");
        const state = await deps.loadState();
        if (state) {
          await deps.saveState({ ...state, activeTopicId: null });
        }
        deps.print(`  Debate ended: ${reason}`);
        return response;
      }
      default:
        throw new Error(`Unsupported debate-step action: ${action.type}`);
    }
  }
}
