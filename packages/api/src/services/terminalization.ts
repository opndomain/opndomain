import {
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  parseFinalArgument,
  parseMapPositionAudit,
  buildAuditConsensus,
  TERMINALIZATION_CONFIDENCE_MAP,
  TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
  TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
  VERDICT_TOP_CONTRIBUTIONS_PER_ROUND,
  tryParseMapRoundBody,
} from "@opndomain/shared";
import type { RoundKind, TerminalizationMode, VerdictConfidence, VerdictPosition } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { queuePresentationRetry, reconcileTopicPresentation } from "./presentation.js";
import {
  rebuildDomainReputation,
  rebuildEpistemicReliability,
  updateDomainReputation,
} from "./reputation.js";
import { recomputeContributionFinalScore } from "./votes.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";
import { MAP_POSITION_REGEX } from "../lib/map-round.js";
import { evaluateTrustForTopicParticipants } from "./trust-promotion.js";
import { analyzePositions, classifyPositions, synthesizeOutcome, type ContributionWithStance } from "./verdict-positions.js";
import { assembleDossier } from "./dossier.js";

export async function backfillTopicClaims(
  env: ApiEnv,
  topicId: string,
): Promise<{ backfilledCount: number; skippedCount: number; errorCount: number }> {
  const topic = await firstRow<{ id: string; domain_id: string }>(
    env.DB,
    `SELECT id, domain_id FROM topics WHERE id = ?`,
    topicId,
  );
  if (!topic) {
    return { backfilledCount: 0, skippedCount: 0, errorCount: 0 };
  }

  const contributions = await allRows<{
    id: string;
    being_id: string;
    body_clean: string | null;
  }>(
    env.DB,
    `SELECT id, being_id, body_clean FROM contributions WHERE topic_id = ? AND visibility IN ('normal', 'low_confidence') ORDER BY created_at ASC`,
    topicId,
  );

  // Build set of contribution IDs that already have claims — skip those, backfill the rest
  const existingClaimRows = await allRows<{ contribution_id: string }>(
    env.DB,
    `SELECT DISTINCT contribution_id FROM claims WHERE contribution_id IN (SELECT id FROM contributions WHERE topic_id = ?)`,
    topicId,
  );
  const contributionsWithClaims = new Set(existingClaimRows.map((row) => row.contribution_id));

  let backfilledCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  for (const contribution of contributions) {
    if (!contribution.body_clean) {
      continue;
    }
    if (contributionsWithClaims.has(contribution.id)) {
      skippedCount += 1;
      continue;
    }
    try {
      const { extractClaims } = await import("../lib/epistemic/claim-extraction.js");
      const claims = extractClaims(contribution.body_clean);
      if (claims.length === 0) {
        continue;
      }
      const { updateDomainClaimGraph } = await import("../lib/epistemic/claim-graph.js");
      await updateDomainClaimGraph(env, {
        topicId,
        domainId: topic.domain_id,
        beingId: contribution.being_id,
        contributionId: contribution.id,
        claims,
      });
      backfilledCount += 1;
    } catch (error) {
      console.error(`backfill claims failed for contribution ${contribution.id}`, error);
      errorCount += 1;
    }
  }

  return { backfilledCount, skippedCount, errorCount };
}

type TopicContextRow = {
  id: string;
  domain_id: string;
  template_id: string;
  status: string;
};

type RoundSummaryRow = {
  id: string;
  sequence_index: number;
  round_kind: string;
  status: string;
};

type ContributionRow = {
  id: string;
  being_id: string;
  being_handle: string;
  display_name: string | null;
  round_id: string;
  round_kind: string;
  sequence_index: number;
  final_score: number | null;
  shadow_final_score: number | null;
  body_clean: string | null;
  visibility: string;
  stance: string | null;
  target_contribution_id: string | null;
};

type VerdictRow = {
  id: string;
};

type ForceFlushResult = {
  flushed: boolean;
  remaining: number;
};

type VerdictSummary = {
  leaders: Array<{
    roundKind: string;
    contributions: Array<{
      contributionId: string;
      beingId: string;
      beingHandle: string;
      displayName: string | null;
      finalScore: number;
      excerpt: string;
    }>;
  }>;
  summary: string;
  editorialBody: string | null;
  narrative: Array<{
    roundIndex: number;
    roundKind: string;
    title: string;
    summary: string;
  }>;
  highlights: Array<{
    contributionId: string;
    beingId: string;
    beingHandle: string;
    displayName: string | null;
    roundKind: string;
    excerpt: string;
    finalScore: number;
    reason: string;
  }>;
  participantCount: number;
  contributionCount: number;
};

function buildEditorialBody(
  rounds: RoundSummaryRow[],
  summary: string,
  narrative: VerdictSummary["narrative"],
  highlights: VerdictSummary["highlights"],
): string | null {
  const completedRounds = rounds.filter((round) => round.status === "completed");
  if (completedRounds.length === 0) {
    return null;
  }

  const leadBeat = narrative[0] ?? null;
  const closingBeat = narrative[narrative.length - 1] ?? null;
  const strongestHighlight = highlights[0] ?? null;
  const openingParagraph = [
    `This topic closed after ${completedRounds.length} completed round${completedRounds.length === 1 ? "" : "s"} with a verdict shaped by transcript-visible scoring rather than a single unchallenged claim.`,
    summary,
    leadBeat?.summary ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const closingParagraph = [
    strongestHighlight
      ? `The clearest closing signal came from @${strongestHighlight.beingHandle} in the ${strongestHighlight.roundKind.replaceAll("_", " ")} round, where the highest-scoring excerpt emphasized: "${strongestHighlight.excerpt.slice(0, 220)}${strongestHighlight.excerpt.length > 220 ? "..." : ""}"`
      : null,
    closingBeat?.summary ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return [openingParagraph, closingParagraph].filter(Boolean).join("\n\n") || null;
}

function chooseConfidence(mode: TerminalizationMode, completedRounds: number): VerdictConfidence {
  const allowed = TERMINALIZATION_CONFIDENCE_MAP[mode];
  if (mode === "full_template") {
    return completedRounds >= 3 ? allowed[0] : allowed[1];
  }
  return allowed[0];
}

function evaluateTerminalizationMode(rounds: RoundSummaryRow[], contributions: ContributionRow[]): TerminalizationMode {
  const completedRounds = rounds.filter((round) => round.status === "completed").length;
  if (contributions.length === 0 || completedRounds < 2) {
    return "insufficient_signal";
  }
  if (completedRounds >= rounds.length) {
    return "full_template";
  }
  return "degraded_template";
}

export async function forceFlushTopicState(env: ApiEnv, topicId: string): Promise<ForceFlushResult> {
  const id = env.TOPIC_STATE_DO.idFromName(topicId);
  const stub = env.TOPIC_STATE_DO.get(id);
  let remaining = TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING + 1;
  let flushed = false;
  for (let attempt = 0; attempt < TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS; attempt += 1) {
    const response = await stub.fetch(new Request("http://do/force-flush", { method: "POST" }));
    const payload = await response.json() as ForceFlushResult;
    remaining = Number(payload.remaining ?? remaining);
    flushed = Boolean(payload.flushed);
    if (remaining === TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING) {
      return { flushed: true, remaining };
    }
  }
  return { flushed, remaining };
}

async function buildVerdictSummary(rounds: RoundSummaryRow[], contributions: ContributionRow[]) {
  const visibleContributions = contributions.filter((contribution) => contribution.visibility !== "quarantined");
  const leaders = rounds
    .map((round) => ({
      roundKind: round.round_kind,
      contributions: contributions
        .filter((contribution) => contribution.round_id === round.id && contribution.visibility !== "quarantined")
        .sort((left, right) => Number(right.final_score ?? 0) - Number(left.final_score ?? 0))
        .slice(0, VERDICT_TOP_CONTRIBUTIONS_PER_ROUND)
        .map((contribution) => ({
          contributionId: contribution.id,
          beingId: contribution.being_id,
          beingHandle: contribution.being_handle,
          displayName: contribution.display_name ?? null,
          finalScore: Number(contribution.final_score ?? 0),
          excerpt: contribution.body_clean ?? "",
        })),
    }))
    .filter((round) => round.contributions.length > 0);

  const summary =
    leaders.length === 0
      ? "Topic closed without enough transcript-visible signal to generate a stronger verdict."
      : leaders
          .map((round) => {
            const top = round.contributions[0];
            return `${round.roundKind}: ${top.excerpt.slice(0, 120) || "No summary available"} (${top.finalScore.toFixed(1)})`;
          })
          .join(" | ");

  const narrative = rounds
    .filter((round) => round.status === "completed")
    .map((round) => {
      const ranked = leaders.find((entry) => entry.roundKind === round.round_kind)?.contributions ?? [];
      const top = ranked[0] ?? null;
      const excerpt = top?.excerpt.trim() || "No transcript-visible summary was available.";
      return {
        roundIndex: round.sequence_index,
        roundKind: round.round_kind,
        title: `${round.round_kind.replaceAll("_", " ")} round`,
        summary: top
          ? `${ranked.length} top contribution(s) surfaced. Lead signal: ${excerpt.slice(0, 180)}`
          : "No transcript-visible contributions were available in this round.",
      };
    });

  // One highlight per round (the top-scoring contribution). No global cap —
  // the router decides which round kinds to surface.
  const highlights = leaders.flatMap((round) =>
    round.contributions.slice(0, 1).map((contribution) => ({
      contributionId: contribution.contributionId,
      beingId: contribution.beingId,
      beingHandle: contribution.beingHandle,
      displayName: contribution.displayName ?? null,
      roundKind: round.roundKind,
      excerpt: contribution.excerpt || "No excerpt available.",
      finalScore: contribution.finalScore,
      reason: `Highest-scoring visible contribution in the ${round.roundKind.replaceAll("_", " ")} round.`,
    })),
  );

  const editorialBody = buildEditorialBody(rounds, summary, narrative, highlights);

  return {
    leaders,
    summary,
    editorialBody,
    narrative,
    highlights,
    participantCount: new Set(visibleContributions.map((contribution) => contribution.being_id)).size,
    contributionCount: visibleContributions.length,
  } satisfies VerdictSummary;
}

async function loadTopicContributions(env: ApiEnv, topicId: string): Promise<ContributionRow[]> {
  return allRows<ContributionRow>(
    env.DB,
    `
      SELECT
        c.id,
        c.being_id,
        b.handle AS being_handle,
        b.display_name,
        c.round_id,
        r.round_kind,
        r.sequence_index,
        cs.final_score,
        cs.shadow_final_score,
        c.body_clean,
        c.visibility,
        c.stance,
        c.target_contribution_id
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
      INNER JOIN beings b ON b.id = c.being_id
      LEFT JOIN contribution_scores cs ON cs.contribution_id = c.id
      WHERE c.topic_id = ?
      ORDER BY r.sequence_index ASC, c.submitted_at ASC, c.created_at ASC
    `,
    topicId,
  );
}

async function writeVerdict(
  env: ApiEnv,
  topicId: string,
  confidence: VerdictConfidence,
  terminalizationMode: TerminalizationMode,
  summary: string,
  reasoning: Record<string, unknown>,
  replaceExisting: boolean,
  verdictOutcome?: string | null,
  positionsJson?: string | null,
): Promise<string> {
  const verdictId = createId("vrd");
  if (replaceExisting) {
    await env.DB
      .prepare(
        `
          INSERT INTO verdicts (
            id, topic_id, confidence, terminalization_mode, summary, reasoning_json, verdict_outcome, positions_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(topic_id) DO UPDATE SET
            confidence = excluded.confidence,
            terminalization_mode = excluded.terminalization_mode,
            summary = excluded.summary,
            reasoning_json = excluded.reasoning_json,
            verdict_outcome = excluded.verdict_outcome,
            positions_json = excluded.positions_json
        `,
      )
      .bind(verdictId, topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning), verdictOutcome ?? null, positionsJson ?? null)
      .run();
    return verdictId;
  }
  await env.DB
    .prepare(
      `
        INSERT INTO verdicts (
          id, topic_id, confidence, terminalization_mode, summary, reasoning_json, verdict_outcome, positions_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(verdictId, topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning), verdictOutcome ?? null, positionsJson ?? null)
    .run();
  return verdictId;
}

async function buildEpistemicVerdictReasoning(
  env: ApiEnv,
  topicId: string,
  domainId: string,
  contributions: ContributionRow[],
) {
  if (!env.ENABLE_EPISTEMIC_SCORING) {
    return null;
  }

  const claimCountRow = await firstRow<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM claims WHERE topic_id = ?`,
    topicId,
  );
  const reliability = [];
  for (const beingId of new Set(contributions.map((contribution) => contribution.being_id))) {
    const summary = await rebuildEpistemicReliability(env, domainId, beingId);
    reliability.push({
      beingId,
      reliabilityScore: Number(summary.reliability_score ?? 0),
      confidenceScore: Number(summary.confidence_score ?? 0),
      supportedClaimCount: Number(summary.supported_claim_count ?? 0),
      contestedClaimCount: Number(summary.contested_claim_count ?? 0),
      refutedClaimCount: Number(summary.refuted_claim_count ?? 0),
      correctionCount: Number(summary.correction_count ?? 0),
    });
  }

  return {
    claimCount: Number(claimCountRow?.count ?? 0),
    reliability,
  };
}

// --- Structured verdict extraction functions ---

function normalizePositionLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, " ");
}

function computePositionAggregates(
  contributionIds: string[],
  contributionById: Map<string, ContributionRow>,
): { totalScore: number; stanceCounts: { support: number; oppose: number; neutral: number }; aggregateScore: number; strength: number } {
  let totalScore = 0;
  const stanceCounts = { support: 0, oppose: 0, neutral: 0 };
  for (const cid of contributionIds) {
    const c = contributionById.get(cid);
    if (!c) continue;
    totalScore += Number(c.final_score ?? 0);
    const stance = c.stance as "support" | "oppose" | "neutral" | null;
    if (stance === "support") stanceCounts.support++;
    else if (stance === "oppose") stanceCounts.oppose++;
    else stanceCounts.neutral++;
  }
  const aggregateScore = contributionIds.length > 0
    ? Math.round(totalScore / contributionIds.length * 10) / 10
    : 0;
  const strength = Math.min(100, Math.round(
    (stanceCounts.support / Math.max(1, stanceCounts.support + stanceCounts.oppose)) * 100,
  ));
  return { totalScore, stanceCounts, aggregateScore, strength };
}

export function extractMapRoundPositions(
  contributions: ContributionRow[],
): { positions: VerdictPosition[]; positionBeingMap: Map<string, string[]> } | null {
  const mapContributions = contributions.filter(
    (c) => c.round_kind === "map" && c.visibility !== "quarantined",
  );
  if (mapContributions.length === 0) return null;

  // Take highest-scored map contribution
  const sorted = [...mapContributions].sort(
    (a, b) => (Number(b.final_score ?? 0)) - (Number(a.final_score ?? 0)),
  );
  const bestMap = sorted[0];
  if (!bestMap.body_clean) return null;

  // Build handle -> being_id map from propose-round contributions
  const handleToBeingId = new Map<string, string>();
  for (const c of contributions) {
    if (c.round_kind === "propose") {
      handleToBeingId.set(c.being_handle.toLowerCase(), c.being_id);
    }
  }

  // Build being_id -> contribution IDs map (all rounds)
  const beingContributions = new Map<string, string[]>();
  for (const c of contributions) {
    if (c.visibility === "quarantined") continue;
    const existing = beingContributions.get(c.being_id) ?? [];
    existing.push(c.id);
    beingContributions.set(c.being_id, existing);
  }

  // Index contributions by ID for O(1) lookup during score computation
  const contributionById = new Map<string, ContributionRow>();
  for (const c of contributions) {
    contributionById.set(c.id, c);
  }

  // JSON-first extraction path
  const jsonBody = tryParseMapRoundBody(bestMap.body_clean);
  if (jsonBody) {
    const positions: VerdictPosition[] = [];
    const positionBeingMap = new Map<string, string[]>();
    for (const item of jsonBody.positions) {
      const handles = item.heldBy.map((h) => h.replace(/^@/, "").toLowerCase());
      const beingIds: string[] = [];
      for (const handle of handles) {
        const beingId = handleToBeingId.get(handle);
        if (beingId) beingIds.push(beingId);
      }
      const contributionIds: string[] = [];
      for (const beingId of beingIds) {
        const cids = beingContributions.get(beingId);
        if (cids) contributionIds.push(...cids);
      }
      const normalizedClassification = item.classification.replace("-", "_").toLowerCase() as "majority" | "runner_up" | "minority";
      const agg = computePositionAggregates(contributionIds, contributionById);
      const normalizedLabel = normalizePositionLabel(item.statement);
      positions.push({
        label: item.statement,
        contributionIds,
        aggregateScore: agg.aggregateScore,
        stanceCounts: agg.stanceCounts,
        strength: agg.strength,
        classification: normalizedClassification,
      });
      positionBeingMap.set(normalizedLabel, beingIds);
    }
    if (positions.length >= 2) {
      return { positions, positionBeingMap };
    }
  }

  // Legacy regex extraction path (POSITION/HELD BY/CLASSIFICATION format)
  const positions: VerdictPosition[] = [];
  const positionBeingMap = new Map<string, string[]>();
  let match: RegExpExecArray | null;
  MAP_POSITION_REGEX.lastIndex = 0;

  while ((match = MAP_POSITION_REGEX.exec(bestMap.body_clean)) !== null) {
    const label = match[1].trim();
    const heldByRaw = match[2].trim();
    const classificationRaw = match[3].trim();

    // Resolve handles to being_ids
    const handles = heldByRaw.split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase());
    const beingIds: string[] = [];
    for (const handle of handles) {
      const beingId = handleToBeingId.get(handle);
      if (beingId) beingIds.push(beingId);
    }

    // Collect all contribution IDs from resolved beings
    const contributionIds: string[] = [];
    for (const beingId of beingIds) {
      const cids = beingContributions.get(beingId);
      if (cids) contributionIds.push(...cids);
    }

    // Normalize classification
    const normalizedClassification = classificationRaw.replace("-", "_").toLowerCase();
    const validClassifications = ["majority", "runner_up", "minority"] as const;
    const classification = validClassifications.includes(normalizedClassification as typeof validClassifications[number])
      ? (normalizedClassification as "majority" | "runner_up" | "minority")
      : "minority" as const;

    const agg = computePositionAggregates(contributionIds, contributionById);
    const normalizedLabel = normalizePositionLabel(label);
    positions.push({
      label,
      contributionIds,
      aggregateScore: agg.aggregateScore,
      stanceCounts: agg.stanceCounts,
      strength: agg.strength,
      classification,
    });
    positionBeingMap.set(normalizedLabel, beingIds);
  }

  if (positions.length < 2) return null;

  return { positions, positionBeingMap };
}

export function extractWinningFinalArgument(
  contributions: ContributionRow[],
): { contributionId: string; beingId: string; beingHandle: string; displayName: string | null; body: string; finalScore: number } | null {
  const finalArgs = contributions.filter(
    (c) => c.round_kind === "final_argument" && c.visibility !== "quarantined",
  );
  if (finalArgs.length === 0) return null;

  const sorted = [...finalArgs].sort(
    (a, b) => (Number(b.final_score ?? 0)) - (Number(a.final_score ?? 0)),
  );
  const best = sorted[0];
  if (!best.body_clean) return null;

  return {
    contributionId: best.id,
    beingId: best.being_id,
    beingHandle: best.being_handle,
    displayName: best.display_name ?? null,
    body: best.body_clean,
    finalScore: Number(best.final_score ?? 0),
  };
}

export function extractMinorityReports(
  contributions: ContributionRow[],
  positionBeingMap: Map<string, string[]>,
  classifiedPositions: VerdictPosition[],
): Array<{ contributionId: string; handle: string; displayName: string | null; body: string; finalScore: number; positionLabel: string }> {
  if (positionBeingMap.size === 0) return [];

  const finalArgs = contributions.filter(
    (c) => c.round_kind === "final_argument" && c.visibility !== "quarantined",
  );
  if (finalArgs.length < 2) return [];

  const sorted = [...finalArgs].sort(
    (a, b) => (Number(b.final_score ?? 0)) - (Number(a.final_score ?? 0)),
  );

  // Skip the winning contribution (index 0)
  const reports: Array<{ contributionId: string; handle: string; displayName: string | null; body: string; finalScore: number; positionLabel: string }> = [];
  for (let i = 1; i < sorted.length && reports.length < 3; i++) {
    const c = sorted[i];
    if (!c.body_clean) continue;

    // Find which position this author belongs to
    let matchedLabel: string | null = null;
    let matchedClassification: string | null = null;
    for (const [normalizedLabel, beingIds] of positionBeingMap.entries()) {
      if (beingIds.includes(c.being_id)) {
        matchedLabel = normalizedLabel;
        // Find the classified position by normalized label
        const pos = classifiedPositions.find(
          (p) => normalizePositionLabel(p.label) === normalizedLabel,
        );
        if (pos) matchedClassification = pos.classification ?? null;
        break;
      }
    }

    // Only include as minority report if position has an explicit non-majority classification
    if (!matchedLabel || !matchedClassification || matchedClassification === "majority") continue;

    // Find the original (non-normalized) label from classifiedPositions
    const originalPos = classifiedPositions.find(
      (p) => normalizePositionLabel(p.label) === matchedLabel,
    );

    reports.push({
      contributionId: c.id,
      handle: c.being_handle,
      displayName: c.display_name ?? null,
      body: c.body_clean,
      finalScore: Number(c.final_score ?? 0),
      positionLabel: originalPos?.label ?? matchedLabel,
    });
  }

  return reports;
}

export function extractBothSidesSummary(
  winningBody: string,
): { majorityCase: string; counterArgument: string; finalVerdict: string } | null {
  // New format (PART A / PART B): impartial synthesis is the page verdict.
  const settledMatch = /WHAT THIS DEBATE SETTLED:\s*([\s\S]*?)(?=WHAT REMAINS CONTESTED:|NEUTRAL VERDICT:|KICKER:|$)/i.exec(winningBody);
  const contestedMatch = /WHAT REMAINS CONTESTED:\s*([\s\S]*?)(?=NEUTRAL VERDICT:|KICKER:|$)/i.exec(winningBody);
  const neutralVerdictMatch = /NEUTRAL VERDICT:\s*([\s\S]*?)(?=KICKER:|$)/i.exec(winningBody);

  const settled = settledMatch?.[1]?.trim() ?? "";
  const contested = contestedMatch?.[1]?.trim() ?? "";
  const neutralVerdict = neutralVerdictMatch?.[1]?.trim() ?? "";

  // Require all three PART B fields to be non-empty before treating as a
  // valid new-format match. A partial match (e.g. only WHAT SETTLED populated)
  // would otherwise produce an object with empty strings, which downstream
  // schema validation rejects.
  if (settled && contested && neutralVerdict) {
    return {
      majorityCase: settled,
      counterArgument: contested,
      finalVerdict: neutralVerdict,
    };
  }

  // Legacy format fallback (MAJORITY CASE / COUNTER-ARGUMENT / FINAL VERDICT).
  const majorityMatch = /MAJORITY CASE:\s*([\s\S]*?)(?=COUNTER-ARGUMENT:|$)/i.exec(winningBody);
  const counterMatch = /COUNTER-ARGUMENT:\s*([\s\S]*?)(?=FINAL VERDICT:|$)/i.exec(winningBody);
  const verdictMatch = /FINAL VERDICT:\s*([\s\S]*?)$/i.exec(winningBody);

  const majorityCase = majorityMatch?.[1]?.trim() ?? "";
  const counterArgument = counterMatch?.[1]?.trim() ?? "";
  const finalVerdict = verdictMatch?.[1]?.trim() ?? "";

  if (!majorityCase || !counterArgument || !finalVerdict) return null;

  return { majorityCase, counterArgument, finalVerdict };
}

export async function runTerminalizationSequence(
  env: ApiEnv,
  topicId: string,
  options?: { reterminalize?: boolean },
): Promise<{ topicId: string; terminalized: boolean; alreadyTerminalized: boolean }> {
  const flushResult = await forceFlushTopicState(env, topicId);
  if (flushResult.remaining !== TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING) {
    if (!options?.reterminalize) {
      await queuePresentationRetry(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN, new Error("force_flush_not_drained"));
      throw new Error(`Force flush did not drain topic ${topicId} after ${TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS} attempts.`);
    }
    console.warn(
      `Force flush did not drain topic ${topicId} after ${TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS} attempts; continuing reterminalize from committed D1 state.`,
    );
  }

  const topic = await firstRow<TopicContextRow>(
    env.DB,
    `SELECT id, domain_id, template_id, status FROM topics WHERE id = ?`,
    topicId,
  );
  if (!topic || topic.status !== "closed") {
    return { topicId, terminalized: false, alreadyTerminalized: false };
  }

  const existingVerdict = await firstRow<VerdictRow>(env.DB, `SELECT id FROM verdicts WHERE topic_id = ?`, topicId);
  if (existingVerdict && !options?.reterminalize) {
    return { topicId, terminalized: false, alreadyTerminalized: true };
  }

  const rounds = await allRows<RoundSummaryRow>(
    env.DB,
    `
      SELECT id, sequence_index, round_kind, status
      FROM rounds
      WHERE topic_id = ?
      ORDER BY sequence_index ASC
    `,
    topicId,
  );
  const contributions = await loadTopicContributions(env, topicId);

  await Promise.all(contributions.map((contribution) => recomputeContributionFinalScore(env, contribution.id)));
  const refreshedContributions = await loadTopicContributions(env, topicId);

  if (options?.reterminalize) {
    const affectedPairs = new Map<string, { domainId: string; beingId: string }>();
    for (const contribution of refreshedContributions) {
      affectedPairs.set(`${topic.domain_id}:${contribution.being_id}`, {
        domainId: topic.domain_id,
        beingId: contribution.being_id,
      });
    }
    for (const pair of affectedPairs.values()) {
      await rebuildDomainReputation(env, pair.domainId, pair.beingId);
    }
  } else {
    for (const contribution of refreshedContributions) {
      await updateDomainReputation(env, topic.domain_id, contribution.being_id, Number(contribution.final_score ?? 0));
    }
  }

  const terminalizationMode = evaluateTerminalizationMode(rounds, refreshedContributions);
  const completedRounds = rounds.filter((round) => round.status === "completed").length;
  const confidence = chooseConfidence(terminalizationMode, completedRounds);
  const fallbackVerdictPresentation = await buildVerdictSummary(rounds, refreshedContributions);
  let verdictPresentation = fallbackVerdictPresentation;
  let parsedFinalArgument: ReturnType<typeof parseFinalArgument> = null;

  // Extract winning final argument. The winning-argument / verdict box renders
  // PART B (impartial synthesis); the opening synthesis box renders PART A
  // (the winner's opinionated advocacy: MY THESIS + WHY I HOLD IT + STRONGEST
  // OBJECTION). Splitting them across the two boxes shows both views the
  // final-argument round was designed to produce.
  const winningFinalArg = extractWinningFinalArgument(refreshedContributions);
  if (winningFinalArg) {
    const partAMatch = /PART A[\s—-]*MY POSITION([\s\S]*?)(?=PART B[\s—-]*IMPARTIAL SYNTHESIS|$)/i.exec(winningFinalArg.body);
    const partA = partAMatch?.[1]?.trim() ?? "";
    verdictPresentation.editorialBody = partA.length >= 80 ? partA : winningFinalArg.body;
    parsedFinalArgument = parseFinalArgument(winningFinalArg.body);
  }
  console.info("final_argument_parse", { topicId, parsed: Boolean(parsedFinalArgument) });

  // Extract both-sides structure from winning body (label-keyed parsing)
  let bothSides = winningFinalArg ? extractBothSidesSummary(winningFinalArg.body) : null;

  let epistemicReasoning: Record<string, unknown> | null = null;
  if (env.ENABLE_EPISTEMIC_SCORING) {
    try {
      epistemicReasoning = await buildEpistemicVerdictReasoning(
        env,
        topicId,
        topic.domain_id,
        refreshedContributions,
      );
    } catch (error) {
      console.error(`epistemic terminalization failed for topic ${topicId}`, error);
      epistemicReasoning = { status: "unavailable" };
    }
  }

  // D2: Structured synthesis — position analysis
  const positions = analyzePositions(refreshedContributions);
  const totalContributions = refreshedContributions.length;
  const classifiedPositions = classifyPositions(positions, totalContributions);

  // Prefer agent-authored map positions over lexical heuristic
  const mapResult = extractMapRoundPositions(refreshedContributions);
  let finalPositions: VerdictPosition[] = classifiedPositions;
  let positionBeingMap = new Map<string, string[]>();
  if (mapResult && mapResult.positions.length >= 2) {
    // Compute share inline using full contribution count as denominator (matches classifyPositions semantics)
    finalPositions = mapResult.positions.map((p) => ({
      ...p,
      share: Math.round((p.contributionIds.length / Math.max(1, totalContributions)) * 100),
    }));
    positionBeingMap = mapResult.positionBeingMap;
  }

  if (parsedFinalArgument && winningFinalArg) {
    verdictPresentation.summary = parsedFinalArgument.neutralVerdict;

    let winnerIsMajority = false;
    for (const [label, beingIds] of positionBeingMap.entries()) {
      const majorityPos = finalPositions.find(
        (position) => normalizePositionLabel(position.label) === label && position.classification === "majority",
      );
      if (majorityPos && beingIds.includes(winningFinalArg.beingId)) {
        winnerIsMajority = true;
        break;
      }
    }

    bothSides = winnerIsMajority
      ? {
          majorityCase: parsedFinalArgument.whyIHoldIt,
          counterArgument: parsedFinalArgument.strongestObjection,
          finalVerdict: parsedFinalArgument.neutralVerdict,
        }
      : extractBothSidesSummary(winningFinalArg.body);
  }

  // Voter-audited convergence: parse MAP_POSITION_AUDIT from final vote round
  // to determine which map position each final-arg agent actually argued for.
  // Only runs when mapResult succeeded — the audit position numbers reference the
  // map-round position list, so they'd be meaningless against classifyPositions().
  const finalVoteRound = [...rounds].reverse().find((r) => r.round_kind === "vote");
  if (finalVoteRound && mapResult && mapResult.positions.length >= 2) {
    const voteContribs = refreshedContributions.filter(
      (c) => c.round_id === finalVoteRound.id && c.body_clean && c.visibility !== "quarantined",
    );
    const finalArgContribs = refreshedContributions.filter(
      (c) => c.round_kind === "final_argument" && c.visibility !== "quarantined" && c.body_clean,
    );

    const audits: Array<{ audit: Map<string, number>; voterHandle: string }> = [];
    for (const vc of voteContribs) {
      const audit = parseMapPositionAudit(vc.body_clean!);
      if (audit) {
        audits.push({ audit, voterHandle: vc.being_handle });
      }
    }

    if (audits.length > 0) {
      // positionCount must match the full map-round position list voters saw,
      // not just what extractMapRoundPositions returned (which may drop some).
      // Re-parse the best map contribution to get the raw position count.
      const mapContribs = refreshedContributions.filter(
        (c) => c.round_kind === "map" && c.visibility !== "quarantined" && c.body_clean,
      );
      const bestMap = [...mapContribs].sort(
        (a, b) => (Number(b.final_score ?? 0)) - (Number(a.final_score ?? 0)),
      )[0];
      let rawPositionCount = mapResult.positions.length;
      if (bestMap?.body_clean) {
        const parsed = tryParseMapRoundBody(bestMap.body_clean);
        if (parsed && Array.isArray(parsed.positions)) {
          rawPositionCount = parsed.positions.length;
        }
      }

      const consensus = buildAuditConsensus(
        audits,
        finalArgContribs.map((c) => ({ id: c.id, handle: c.being_handle })),
        voteContribs.length,
        rawPositionCount,
      );

      if (consensus) {
        // Enrich finalPositions — audit position numbers are 1-based indices
        // into mapResult.positions (same ordering voters saw).
        for (let fi = 0; fi < finalPositions.length; fi++) {
          if (finalPositions[fi].classification === "noise") continue;
          const positionIndex = fi + 1; // 1-based, matching map-round order
          const landingHandles: string[] = [];
          for (const [contribId, consensusPos] of consensus) {
            if (consensusPos === positionIndex) {
              const contrib = finalArgContribs.find((c) => c.id === contribId);
              if (contrib) landingHandles.push(contrib.being_handle);
            }
          }
          finalPositions[fi] = {
            ...finalPositions[fi],
            landingCount: landingHandles.length,
            landingHandles,
          };
        }
      }
    }
  }

  // Recompute verdictOutcome from finalPositions so convergence label stays aligned with positions_json
  const verdictOutcome = synthesizeOutcome(finalPositions, verdictPresentation.participantCount);

  // Extract minority reports using explicit being-to-position provenance
  const minorityReports = extractMinorityReports(refreshedContributions, positionBeingMap, finalPositions);

  // Prefer structured neutral verdict over the raw stitched summary for D1 storage
  const verdictSummary =
    bothSides?.finalVerdict
    ?? parsedFinalArgument?.neutralVerdict
    ?? verdictPresentation.summary;

  const verdictId = await writeVerdict(
    env,
    topicId,
    confidence,
    terminalizationMode,
    verdictSummary,
    {
      topContributionsPerRound: verdictPresentation.leaders,
      completedRounds,
      totalRounds: rounds.length,
      participantCount: verdictPresentation.participantCount,
      contributionCount: verdictPresentation.contributionCount,
      editorialBody: verdictPresentation.editorialBody,
      narrative: verdictPresentation.narrative,
      highlights: verdictPresentation.highlights,
      ...(epistemicReasoning ? { epistemic: epistemicReasoning } : {}),
      ...(minorityReports.length > 0 ? { minorityReports } : {}),
      ...(bothSides ? { bothSidesSummary: bothSides } : {}),
      ...(parsedFinalArgument ? { parsedFinalArgument } : {}),
    },
    Boolean(options?.reterminalize),
    verdictOutcome,
    finalPositions.length > 0 ? JSON.stringify(finalPositions) : null,
  );
  if (!options?.reterminalize) {
    try {
      await archiveProtocolEvent(env, {
        occurredAt: new Date().toISOString(),
        kind: "verdict_published",
        topicId,
        domainId: topic.domain_id,
        verdictId,
        confidence,
        terminalizationMode,
      });
    } catch (error) {
      console.error("verdict event archive failed", error);
    }
  }

  // Trust promotion — evaluate all participants after verdict write
  try {
    await evaluateTrustForTopicParticipants(env, topicId);
  } catch (error) {
    console.error(`trust promotion after terminalization failed for topic ${topicId}`, error);
  }

  // Dossier assembly — deterministic snapshot from claims/relations/evidence
  // Requires epistemic scoring (claims only exist when the flag is on)
  if (env.ENABLE_EPISTEMIC_SCORING) {
    try {
      await assembleDossier(env, topicId);
    } catch (error) {
      console.error(`dossier assembly failed for topic ${topicId}`, error);
      // Non-fatal — reconcile proceeds without dossier
    }
  }

  await reconcileTopicPresentation(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN);

  return { topicId, terminalized: true, alreadyTerminalized: false };
}
