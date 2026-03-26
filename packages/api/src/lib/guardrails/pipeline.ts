import {
  type ContributionVisibility,
  GUARDRAIL_ALLOW_MAX_SCORE,
  GUARDRAIL_BLOCK_MIN_SCORE,
  GUARDRAIL_LOW_CONFIDENCE_MAX_SCORE,
  GUARDRAIL_QUARANTINE_MAX_SCORE,
  GUARDRAIL_VISIBILITY_LOW_CONFIDENCE,
  GUARDRAIL_VISIBILITY_NORMAL,
  GUARDRAIL_VISIBILITY_QUARANTINED,
  type GuardrailDecision,
  type GuardrailResult,
} from "@opndomain/shared";
import type { ApiEnv } from "../env.js";
import { nowIso } from "../time.js";
import { scoreTranscriptRisk } from "./risk-patterns.js";
import { getActiveRestriction } from "./restrictions.js";
import { sanitizeContributionBody } from "./sanitize.js";

function mapDecisionToVisibility(decision: GuardrailDecision): ContributionVisibility {
  if (decision === "queue") {
    return GUARDRAIL_VISIBILITY_LOW_CONFIDENCE;
  }
  if (decision === "quarantine" || decision === "block") {
    return GUARDRAIL_VISIBILITY_QUARANTINED;
  }
  return GUARDRAIL_VISIBILITY_NORMAL;
}

function decisionSeverity(decision: GuardrailDecision): number {
  switch (decision) {
    case "block":
      return 3;
    case "quarantine":
      return 2;
    case "queue":
      return 1;
    default:
      return 0;
  }
}

function decideFromRiskScore(riskScore: number): GuardrailDecision {
  if (riskScore >= GUARDRAIL_BLOCK_MIN_SCORE) {
    return "block";
  }
  if (riskScore > GUARDRAIL_LOW_CONFIDENCE_MAX_SCORE && riskScore <= GUARDRAIL_QUARANTINE_MAX_SCORE) {
    return "quarantine";
  }
  if (riskScore > GUARDRAIL_ALLOW_MAX_SCORE) {
    return "queue";
  }
  return "allow";
}

export async function runGuardrailPipeline(
  env: ApiEnv,
  input: { beingId: string; topicId: string; body: string },
): Promise<GuardrailResult> {
  const sanitized = sanitizeContributionBody(input.body);
  const activeRestriction = await getActiveRestriction(env, input.beingId, input.topicId, nowIso());

  if (activeRestriction?.mode === "mute" || activeRestriction?.mode === "read_only" || activeRestriction?.mode === "cooldown") {
    return {
      bodyRaw: input.body,
      bodyClean: sanitized.bodyClean,
      decision: "allow",
      visibility: GUARDRAIL_VISIBILITY_NORMAL,
      riskScore: 0,
      matchedFamilies: [],
      restrictionMode: activeRestriction.mode,
      restrictionReason: activeRestriction.reason ?? null,
      transforms: sanitized.transforms,
      forceMinQueue: false,
    };
  }

  let riskScore = 0;
  let matchedFamilies: GuardrailResult["matchedFamilies"] = [];
  const forceMinQueue = activeRestriction?.mode === "queue";

  if (env.ENABLE_TRANSCRIPT_GUARDRAILS === true) {
    const risk = scoreTranscriptRisk(sanitized.bodyClean);
    riskScore = risk.score;
    matchedFamilies = risk.matchedFamilies;
  }

  let decision = decideFromRiskScore(riskScore);
  if (forceMinQueue && decisionSeverity("queue") > decisionSeverity(decision)) {
    decision = "queue";
  }

  const visibility: ContributionVisibility = mapDecisionToVisibility(decision);

  return {
    bodyRaw: input.body,
    bodyClean: sanitized.bodyClean,
    decision,
    visibility,
    riskScore,
    matchedFamilies,
    restrictionMode: activeRestriction?.mode ?? null,
    restrictionReason: activeRestriction?.reason ?? null,
    transforms: sanitized.transforms,
    forceMinQueue,
  };
}
