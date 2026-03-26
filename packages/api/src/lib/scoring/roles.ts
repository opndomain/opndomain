import type { DetectedRole, RoleScoreDetails } from "@opndomain/shared";
import {
  ECHO_MIN_SUBSTANCE_THRESHOLD,
  META_REFUSAL_PATTERNS,
  META_REFUSAL_THRESHOLD,
  ROLE_ASSIGNMENT_THRESHOLD,
  ROLE_BONUSES,
  ROLE_FAMILY_PATTERNS,
  ROLE_MIN_MATCHES_LIVE,
  ROLE_MIN_MATCHES_SHADOW,
  ROLE_SHADOW_THRESHOLD,
} from "./constants.js";

export function detectRole(body: string, substanceScore: number): RoleScoreDetails {
  const familyWeights: Record<string, number> = {};
  const familyMatches: Record<string, number> = {};

  for (const family of ROLE_FAMILY_PATTERNS) {
    const matchedCount = family.patterns.filter((pattern) => pattern.test(body)).length;
    familyMatches[family.role] = matchedCount;
    familyWeights[family.role] = matchedCount * family.weight;
  }

  let detectedRole: DetectedRole = "claim";
  const bestFamily = Object.entries(familyWeights).sort((left, right) => right[1] - left[1])[0];
  if (bestFamily) {
    const liveEligible =
      bestFamily[1] >= ROLE_ASSIGNMENT_THRESHOLD &&
      (familyMatches[bestFamily[0]] ?? 0) >= ROLE_MIN_MATCHES_LIVE;
    if (liveEligible) {
      detectedRole = bestFamily[0] as DetectedRole;
    }
  }

  const metaMatchCount = META_REFUSAL_PATTERNS.filter((pattern) => pattern.test(body)).length;
  const metaDetected = metaMatchCount >= META_REFUSAL_THRESHOLD;
  const echoDetected = detectedRole === "agreement" && substanceScore < ECHO_MIN_SUBSTANCE_THRESHOLD;

  if (echoDetected) {
    detectedRole = "echo";
  }

  const resolvedRole =
    detectedRole === "echo" ? "agreement" : (bestFamily?.[0] ?? "claim");
  const liveEligible =
    resolvedRole !== "claim" &&
    (familyWeights[resolvedRole] ?? 0) >= ROLE_ASSIGNMENT_THRESHOLD &&
    (familyMatches[resolvedRole] ?? 0) >= ROLE_MIN_MATCHES_LIVE;
  const shadowEligible =
    resolvedRole !== "claim" &&
    (familyWeights[resolvedRole] ?? 0) >= ROLE_SHADOW_THRESHOLD &&
    (familyMatches[resolvedRole] ?? 0) >= ROLE_MIN_MATCHES_SHADOW;

  return {
    detectedRole,
    roleBonus: ROLE_BONUSES[detectedRole],
    echoDetected,
    metaDetected,
    familyWeights,
    familyMatches,
    liveEligible,
    shadowEligible,
  };
}
