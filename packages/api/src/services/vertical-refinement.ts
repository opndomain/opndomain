import {
  MAX_REFINEMENT_DEPTH,
  RefinementStatusSchema,
  RoundInstructionSchema,
  type RefinementPositionSummary,
  type RefinementStatus,
  type RoundInstruction,
  type VerdictConfidence,
  type VerdictOutcome,
  type VerdictPosition,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { firstRow, runStatement } from "../lib/db.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";

type ParsedFinalArgumentLike = {
  whatSettled?: string | null;
  whatContested?: string | null;
  strongestObjection?: string | null;
  neutralVerdict?: string | null;
};

type BothSidesSummaryLike = {
  majorityCase?: string | null;
  counterArgument?: string | null;
  finalVerdict?: string | null;
};

type TopicRefinementBase = {
  refinement_depth: number | null;
};

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim().slice(0, 500);
  }
  return String(error ?? "unknown refinement error").slice(0, 500);
}

export async function archiveRefinementFailure(
  env: ApiEnv,
  details: {
    topicId: string;
    domainId?: string | null;
    stage: "overlay_context" | "compute_status" | "link_child";
    message: string;
    parentTopicId?: string | null;
    sequenceIndex?: number;
  },
): Promise<void> {
  try {
    await archiveProtocolEvent(env, {
      occurredAt: new Date().toISOString(),
      kind: "refinement_failure",
      topicId: details.topicId,
      ...(details.domainId ? { domainId: details.domainId } : {}),
      stage: details.stage,
      message: details.message,
      ...(details.parentTopicId ? { parentTopicId: details.parentTopicId } : {}),
      ...(typeof details.sequenceIndex === "number" ? { sequenceIndex: details.sequenceIndex } : {}),
    });
  } catch (archiveError) {
    console.error("refinement failure archive failed", {
      topicId: details.topicId,
      stage: details.stage,
      error: archiveError,
    });
  }
}

function normalizeText(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeClassification(value: string | undefined): RefinementPositionSummary["classification"] | null {
  if (value === "majority" || value === "runner_up" || value === "minority" || value === "noise") {
    return value;
  }
  return null;
}

export async function overlayRefinementContext(
  env: ApiEnv,
  topicId: string | null | undefined,
  sequenceIndex: number,
  baseInstruction: RoundInstruction | null,
): Promise<RoundInstruction | null> {
  if (!topicId || !baseInstruction) {
    return baseInstruction;
  }

  try {
    const refinementCtx = await firstRow<{ prior_round_context: string }>(
      env.DB,
      `
        SELECT prior_round_context
        FROM topic_refinement_context
        WHERE sequence_index = ? AND topic_id = ?
      `,
      sequenceIndex,
      topicId,
    );
    if (!refinementCtx?.prior_round_context) {
      return baseInstruction;
    }

    const merged = {
      ...baseInstruction,
      priorRoundContext: refinementCtx.prior_round_context,
    };
    return RoundInstructionSchema.parse(merged);
  } catch (error) {
    await archiveRefinementFailure(env, {
      topicId,
      stage: "overlay_context",
      message: formatErrorMessage(error),
      sequenceIndex,
    });
    return baseInstruction;
  }
}

export function computeRefinementStatus(
  topic: TopicRefinementBase,
  verdictOutcome: VerdictOutcome,
  parsedFinalArgument: ParsedFinalArgumentLike | null,
  positions: VerdictPosition[],
  confidence: VerdictConfidence | "insufficient_signal",
  bothSidesSummary?: BothSidesSummaryLike | null,
): RefinementStatus {
  const whatSettled = normalizeText(parsedFinalArgument?.whatSettled) ?? normalizeText(bothSidesSummary?.majorityCase);
  const whatContested = normalizeText(parsedFinalArgument?.whatContested) ?? normalizeText(bothSidesSummary?.counterArgument);
  const strongestObjection = normalizeText(parsedFinalArgument?.strongestObjection);
  const neutralVerdict = normalizeText(parsedFinalArgument?.neutralVerdict) ?? normalizeText(bothSidesSummary?.finalVerdict);
  const positionSummaries = positions
    .map((position) => {
      const classification = normalizeClassification(position.classification);
      const label = normalizeText(position.label);
      if (!classification || !label) {
        return null;
      }
      return { label, classification };
    })
    .filter((value): value is RefinementPositionSummary => value !== null);

  if ((topic.refinement_depth ?? 0) >= MAX_REFINEMENT_DEPTH) {
    return RefinementStatusSchema.parse({
      eligible: false,
      reason: "max_depth",
      whatSettled,
      whatContested,
      strongestObjection,
      neutralVerdict,
      ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
    });
  }

  if (confidence === "insufficient_signal") {
    return RefinementStatusSchema.parse({
      eligible: false,
      reason: "insufficient_signal",
      whatSettled,
      whatContested,
      strongestObjection,
      neutralVerdict,
      ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
    });
  }

  if (verdictOutcome === "contested_synthesis") {
    return RefinementStatusSchema.parse({
      eligible: true,
      reason: "contested",
      whatSettled,
      whatContested,
      strongestObjection,
      neutralVerdict,
      ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
    });
  }

  if ((whatContested?.length ?? 0) > 50) {
    return RefinementStatusSchema.parse({
      eligible: true,
      reason: "substantive_contested_claims",
      whatSettled,
      whatContested,
      strongestObjection,
      neutralVerdict,
      ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
    });
  }

  const disagreementCount = positionSummaries.filter((position) => (
    position.classification === "runner_up" || position.classification === "minority"
  )).length;
  if (disagreementCount >= 2) {
    return RefinementStatusSchema.parse({
      eligible: true,
      reason: "deep_disagreement",
      whatSettled,
      whatContested,
      strongestObjection,
      neutralVerdict,
      ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
    });
  }

  return RefinementStatusSchema.parse({
    eligible: false,
    reason: "clear_synthesis",
    whatSettled,
    whatContested,
    strongestObjection,
    neutralVerdict,
    ...(positionSummaries.length > 0 ? { positionSummaries } : {}),
  });
}

export async function linkRefinementChild(
  env: ApiEnv,
  parentTopicId: string,
  childTopicId: string,
) {
  const parent = await firstRow<{ refinement_depth: number | null; title: string }>(
    env.DB,
    "SELECT refinement_depth, title FROM topics WHERE id = ?",
    parentTopicId,
  );
  if (!parent) {
    return;
  }

  await runStatement(
    env.DB.prepare(
      `
        UPDATE topics
        SET parent_topic_id = ?, refinement_depth = ?
        WHERE id = ? AND parent_topic_id IS NULL
      `,
    ).bind(parentTopicId, Math.min((parent.refinement_depth ?? 0) + 1, MAX_REFINEMENT_DEPTH), childTopicId),
  );

  const verdict = await firstRow<{ refinement_status_json: string | null }>(
    env.DB,
    "SELECT refinement_status_json FROM verdicts WHERE topic_id = ?",
    parentTopicId,
  );
  if (!verdict?.refinement_status_json) {
    return;
  }

  const refinementStatus = RefinementStatusSchema.parse(JSON.parse(verdict.refinement_status_json));
  if (!refinementStatus.whatSettled && !refinementStatus.whatContested && !refinementStatus.neutralVerdict) {
    return;
  }

  const priorContext = [
    `This is a follow-up investigation. The prior debate "${parent.title}" concluded:`,
    refinementStatus.whatSettled ? `SETTLED: ${refinementStatus.whatSettled}` : null,
    refinementStatus.whatContested ? `UNRESOLVED: ${refinementStatus.whatContested}` : null,
    refinementStatus.neutralVerdict ? `PRIOR VERDICT: ${refinementStatus.neutralVerdict}` : null,
    "Address the unresolved question with fresh arguments. Do not relitigate settled ground.",
  ].filter((value): value is string => Boolean(value)).join("\n");

  await runStatement(
    env.DB.prepare(
      `
        INSERT OR IGNORE INTO topic_refinement_context (topic_id, sequence_index, prior_round_context)
        VALUES (?, 0, ?)
      `,
    ).bind(childTopicId, priorContext),
  );
}
