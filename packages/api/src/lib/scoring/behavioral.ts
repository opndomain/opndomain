import type { BehavioralDimensionWeight } from "@opndomain/shared";

export type BehavioralScoringInput = {
  bodyClean: string;
  roundKind: string;
  dimensions: BehavioralDimensionWeight[];
  behavioralReferenceContributions: Array<{ bodyClean: string; contributionId: string }>;
  targetContributionId?: string;
};

export type BehavioralScoringResult = {
  scores: Record<string, number>;
  weightedScore: number;
  multiplier: number;
};

function extractTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function termOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const term of a) {
    if (b.has(term)) shared++;
  }
  return shared / Math.max(a.size, b.size);
}

function scoreResponsiveness(
  bodyClean: string,
  references: Array<{ bodyClean: string; contributionId: string }>,
  targetContributionId?: string,
): number {
  if (references.length === 0) return 50;

  const bodyTerms = extractTerms(bodyClean);
  let totalOverlap = 0;
  let targetOverlap = 0;

  for (const ref of references) {
    const refTerms = extractTerms(ref.bodyClean);
    const overlap = termOverlap(bodyTerms, refTerms);
    totalOverlap += overlap;
    if (targetContributionId && ref.contributionId === targetContributionId) {
      targetOverlap = overlap;
    }
  }

  const avgOverlap = totalOverlap / references.length;
  // Weight explicit target 2x
  const weighted = targetContributionId
    ? avgOverlap * 0.4 + targetOverlap * 0.6
    : avgOverlap;

  return Math.min(100, Math.round(weighted * 200));
}

const CONSTRUCTIVENESS_PATTERNS = [
  /\binstead\b/i,
  /\balternative\b/i,
  /\bimprove\b/i,
  /\bbuild on\b/i,
  /\bextend\b/i,
  /\brefine\b/i,
  /\bwe could\b/i,
  /\bpropose\b/i,
  /\bsolution\b/i,
  /\baddress(?:es|ing)?\b/i,
] as const;

const PURE_NEGATION_PATTERNS = [
  /\bwrong\b/i,
  /\bno\b/i,
  /\bnot\b/i,
  /\bnever\b/i,
  /\bfail(?:s|ed)?\b/i,
  /\bbad\b/i,
] as const;

function scoreConstructiveness(
  bodyClean: string,
  references: Array<{ bodyClean: string; contributionId: string }>,
  targetContributionId?: string,
): number {
  const constructiveMatches = CONSTRUCTIVENESS_PATTERNS.filter((p) => p.test(bodyClean)).length;
  const negationMatches = PURE_NEGATION_PATTERNS.filter((p) => p.test(bodyClean)).length;

  const constructiveScore = Math.min(50, constructiveMatches * 12);
  const negationPenalty = Math.min(30, negationMatches * 6);

  // Meaningful delta from target
  let deltaBonus = 0;
  if (targetContributionId && references.length > 0) {
    const target = references.find((r) => r.contributionId === targetContributionId);
    if (target) {
      const bodyTerms = extractTerms(bodyClean);
      const targetTerms = extractTerms(target.bodyClean);
      let newTerms = 0;
      for (const term of bodyTerms) {
        if (!targetTerms.has(term)) newTerms++;
      }
      deltaBonus = Math.min(30, Math.round((newTerms / Math.max(bodyTerms.size, 1)) * 60));
    }
  }

  return Math.min(100, Math.max(0, 20 + constructiveScore + deltaBonus - negationPenalty));
}

function scoreSpecificity(bodyClean: string): number {
  // Reuse heuristic patterns from scoreHeuristics
  const properNounCount = (bodyClean.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) ?? []).length;
  const numberCount = (bodyClean.match(/\b\d+(?:\.\d+)?(?:\s*(?:%|percent|ms|seconds?|minutes?|hours?|days?|bytes?|MB|GB|TB|km|mi|USD|\$))/gi) ?? []).length;
  const evidencePatterns = [/\bbecause\b/i, /\bevidence\b/i, /\bmeasured\b/i, /\bdata\b/i, /\bresults show\b/i];
  const evidenceMatches = evidencePatterns.filter((p) => p.test(bodyClean)).length;

  const words = bodyClean.split(/\s+/).length;
  const wordBonus = Math.min(20, Math.round(words / 10) * 4);

  return Math.min(100, Math.max(0,
    properNounCount * 8 +
    numberCount * 10 +
    evidenceMatches * 10 +
    wordBonus,
  ));
}

const DIMENSION_SCORERS: Record<string, (
  bodyClean: string,
  references: Array<{ bodyClean: string; contributionId: string }>,
  targetContributionId?: string,
) => number> = {
  responsiveness: scoreResponsiveness,
  specificity: (bodyClean) => scoreSpecificity(bodyClean),
  constructiveness: scoreConstructiveness,
};

export function scoreBehavioralDimensions(input: BehavioralScoringInput): BehavioralScoringResult {
  if (input.dimensions.length === 0) {
    return { scores: {}, weightedScore: 0, multiplier: 1.0 };
  }

  const scores: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const { dimension, weight } of input.dimensions) {
    const scorer = DIMENSION_SCORERS[dimension];
    if (!scorer) continue;
    const score = scorer(input.bodyClean, input.behavioralReferenceContributions, input.targetContributionId);
    scores[dimension] = score;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  // 0.85 + (weightedScore / 100) * 0.3 — yields 0.85x to 1.15x
  const multiplier = 0.85 + (weightedScore / 100) * 0.3;

  return { scores, weightedScore, multiplier };
}
