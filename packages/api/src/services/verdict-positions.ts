import type { VerdictOutcome, VerdictPosition } from "@opndomain/shared";

export type ContributionWithStance = {
  id: string;
  being_id: string;
  round_kind: string;
  sequence_index: number;
  body_clean: string | null;
  stance: string | null;
  target_contribution_id: string | null;
  final_score: number | null;
};

type PositionSeed = {
  label: string;
  seedContributionId: string;
  contributionIds: string[];
  totalScore: number;
  stanceCounts: { support: number; oppose: number; neutral: number };
};

function extractLabel(bodyClean: string | null): string {
  if (!bodyClean) return "Untitled position";
  const trimmed = bodyClean.slice(0, 80).replace(/\s+/g, " ").trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > 60) return trimmed.slice(0, lastSpace) + "…";
  if (bodyClean.length > 80) return trimmed + "…";
  return trimmed;
}

function extractTerms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2),
  );
}

function termOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const term of a) { if (b.has(term)) shared++; }
  return shared / Math.max(a.size, b.size);
}

export function analyzePositions(contributions: ContributionWithStance[]): VerdictPosition[] {
  // Propose-round contributions seed root positions
  const seeds: PositionSeed[] = [];
  const seedTerms: Map<string, Set<string>> = new Map();

  for (const c of contributions) {
    if (c.round_kind === "propose" && c.body_clean) {
      const seed: PositionSeed = {
        label: extractLabel(c.body_clean),
        seedContributionId: c.id,
        contributionIds: [c.id],
        totalScore: Number(c.final_score ?? 0),
        stanceCounts: { support: 1, oppose: 0, neutral: 0 },
      };
      seeds.push(seed);
      seedTerms.set(c.id, extractTerms(c.body_clean));
    }
  }

  if (seeds.length === 0) return [];

  // Attach non-propose contributions by: explicit target first, then stance affinity + lexical overlap
  for (const c of contributions) {
    if (c.round_kind === "propose") continue;
    if (!c.body_clean) continue;

    let bestSeed: PositionSeed | null = null;

    // Explicit target takes priority
    if (c.target_contribution_id) {
      bestSeed = seeds.find((s) => s.contributionIds.includes(c.target_contribution_id!)) ?? null;
    }

    // Fallback: lexical overlap with seed contributions
    if (!bestSeed) {
      const cTerms = extractTerms(c.body_clean);
      let bestOverlap = 0;
      for (const seed of seeds) {
        const sTerms = seedTerms.get(seed.seedContributionId);
        if (!sTerms) continue;
        const overlap = termOverlap(cTerms, sTerms);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestSeed = seed;
        }
      }
    }

    if (!bestSeed) bestSeed = seeds[0];

    bestSeed.contributionIds.push(c.id);
    bestSeed.totalScore += Number(c.final_score ?? 0);

    const stance = c.stance as "support" | "oppose" | "neutral" | null;
    if (stance === "support") bestSeed.stanceCounts.support++;
    else if (stance === "oppose") bestSeed.stanceCounts.oppose++;
    else bestSeed.stanceCounts.neutral++;
  }

  return seeds.map((seed) => ({
    label: seed.label,
    contributionIds: seed.contributionIds,
    aggregateScore: seed.contributionIds.length > 0
      ? Math.round(seed.totalScore / seed.contributionIds.length * 10) / 10
      : 0,
    stanceCounts: seed.stanceCounts,
    strength: Math.min(100, Math.round(
      (seed.stanceCounts.support / Math.max(1, seed.stanceCounts.support + seed.stanceCounts.oppose)) * 100,
    )),
  }));
}

export function classifyPositions(positions: VerdictPosition[], totalContributions: number) {
  const sorted = [...positions].sort((a, b) => b.contributionIds.length - a.contributionIds.length);
  return sorted.map((pos, i) => ({
    ...pos,
    share: Math.round((pos.contributionIds.length / Math.max(1, totalContributions)) * 100),
    classification: i === 0 ? "majority" as const
      : pos.aggregateScore >= 45 && pos.contributionIds.length >= 2 ? "runner_up" as const
      : pos.aggregateScore >= 40 ? "minority" as const
      : "noise" as const,
  }));
}

export function synthesizeOutcome(
  positions: VerdictPosition[],
  participantCount: number,
): VerdictOutcome {
  if (positions.length === 0 || participantCount < 2) {
    return "insufficient_signal";
  }

  const totalContributions = positions.reduce((sum, p) => sum + p.contributionIds.length, 0);
  if (totalContributions < 3) return "insufficient_signal";

  // Check for clear dominance
  const sorted = [...positions].sort((a, b) => b.strength - a.strength);
  const strongest = sorted[0];

  if (positions.length === 1 && strongest.strength >= 70) {
    return "clear_synthesis";
  }

  if (positions.length >= 2) {
    const secondStrongest = sorted[1];
    const gap = strongest.strength - secondStrongest.strength;
    if (gap >= 30 && strongest.strength >= 60) return "clear_synthesis";
    if (gap < 15) return "contested_synthesis";
  }

  return "emerging_synthesis";
}
