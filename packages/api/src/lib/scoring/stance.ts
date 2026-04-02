import type { ContributionStance, DetectedRole } from "@opndomain/shared";

export type StanceInferenceResult = {
  stance: ContributionStance | null;
  source: "explicit" | "strong_inferred" | "weak_inferred";
  signals: string[];
};

const SUPPORT_PATTERNS = [
  /\bi agree\b/i,
  /\bagree with\b/i,
  /\bthat matches\b/i,
  /\bexactly right\b/i,
  /\bco-signed\b/i,
  /\b\+1\b/i,
  /\bsupport(?:s|ing)?\b/i,
  /\bin favor\b/i,
  /\bendorse\b/i,
] as const;

const OPPOSE_PATTERNS = [
  /\bhowever\b/i,
  /\bcounterexample\b/i,
  /\bweakness\b/i,
  /\bfails when\b/i,
  /\bdrawback\b/i,
  /\blimitation\b/i,
  /\bdoes not hold\b/i,
  /\bdisagree\b/i,
  /\boppose\b/i,
  /\brejected?\b/i,
] as const;

const ROLE_STANCE_MAP: Partial<Record<DetectedRole, ContributionStance>> = {
  agreement: "support",
  critique: "oppose",
};

export function inferStance(
  bodyClean: string,
  roundKind: string,
  explicitStance?: ContributionStance,
  detectedRole?: DetectedRole,
): StanceInferenceResult {
  if (explicitStance) {
    return { stance: explicitStance, source: "explicit", signals: ["explicit_submission"] };
  }

  const supportMatches = SUPPORT_PATTERNS.filter((p) => p.test(bodyClean)).length;
  const opposeMatches = OPPOSE_PATTERNS.filter((p) => p.test(bodyClean)).length;
  const signals: string[] = [];

  if (supportMatches > 0) signals.push(`support_lexical:${supportMatches}`);
  if (opposeMatches > 0) signals.push(`oppose_lexical:${opposeMatches}`);

  const roleStance = detectedRole ? ROLE_STANCE_MAP[detectedRole] ?? null : null;
  if (roleStance) signals.push(`role:${detectedRole}`);

  // Strong role + supporting lexical cues -> strong_inferred
  if (roleStance && (
    (roleStance === "support" && supportMatches > 0) ||
    (roleStance === "oppose" && opposeMatches > 0)
  )) {
    return { stance: roleStance, source: "strong_inferred", signals };
  }

  // Single strong non-conflicting cue -> strong_inferred
  if (supportMatches > 0 && opposeMatches === 0) {
    return { stance: "support", source: "strong_inferred", signals };
  }
  if (opposeMatches > 0 && supportMatches === 0) {
    return { stance: "oppose", source: "strong_inferred", signals };
  }

  // Role-only with no conflicting lexical -> strong_inferred
  if (roleStance && supportMatches === 0 && opposeMatches === 0) {
    return { stance: roleStance, source: "strong_inferred", signals };
  }

  // Mixed/weak/contradictory -> weak_inferred, stance = null
  if (supportMatches > 0 || opposeMatches > 0) {
    signals.push("conflicting_signals");
  }
  return { stance: null, source: "weak_inferred", signals };
}
