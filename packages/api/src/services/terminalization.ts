import {
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  TERMINALIZATION_CONFIDENCE_MAP,
  TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
  TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
  VERDICT_TOP_CONTRIBUTIONS_PER_ROUND,
} from "@opndomain/shared";
import type { RoundKind, TerminalizationMode, VerdictConfidence } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { queuePresentationRetry, reconcileTopicPresentation } from "./presentation.js";
import { VerdictEditorialError, generateVerdictEditorial } from "./verdict-editorial.js";
import {
  rebuildDomainReputation,
  rebuildEpistemicReliability,
  updateDomainReputation,
} from "./reputation.js";
import { recomputeContributionFinalScore } from "./votes.js";
import { archiveProtocolEvent } from "../lib/ops-archive.js";

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
  round_id: string;
  round_kind: string;
  sequence_index: number;
  final_score: number | null;
  shadow_final_score: number | null;
  body_clean: string | null;
  visibility: string;
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

  const highlights = leaders
    .flatMap((round) =>
      round.contributions.slice(0, 1).map((contribution) => ({
        contributionId: contribution.contributionId,
        beingId: contribution.beingId,
        beingHandle: contribution.beingHandle,
        roundKind: round.roundKind,
        excerpt: contribution.excerpt || "No excerpt available.",
        finalScore: contribution.finalScore,
        reason: `Highest-scoring visible contribution in the ${round.roundKind.replaceAll("_", " ")} round.`,
      })),
    )
    .slice(0, VERDICT_TOP_CONTRIBUTIONS_PER_ROUND);

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
        c.round_id,
        r.round_kind,
        r.sequence_index,
        cs.final_score,
        cs.shadow_final_score,
        c.body_clean,
        c.visibility
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
): Promise<string> {
  const verdictId = createId("vrd");
  if (replaceExisting) {
    await env.DB
      .prepare(
        `
          INSERT INTO verdicts (
            id, topic_id, confidence, terminalization_mode, summary, reasoning_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(topic_id) DO UPDATE SET
            confidence = excluded.confidence,
            terminalization_mode = excluded.terminalization_mode,
            summary = excluded.summary,
            reasoning_json = excluded.reasoning_json
        `,
      )
      .bind(verdictId, topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning))
      .run();
    return verdictId;
  }
  await env.DB
    .prepare(
      `
        INSERT INTO verdicts (
          id, topic_id, confidence, terminalization_mode, summary, reasoning_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(verdictId, topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning))
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
  try {
    const editorialResult = await generateVerdictEditorial(env, {
      rounds: rounds.map((round) => ({
        roundIndex: round.sequence_index,
        roundKind: round.round_kind as RoundKind,
        status: round.status,
      })),
      leaders: fallbackVerdictPresentation.leaders,
      summary: fallbackVerdictPresentation.summary,
      participantCount: fallbackVerdictPresentation.participantCount,
      contributionCount: fallbackVerdictPresentation.contributionCount,
    });
    if (editorialResult.failure) {
      console.warn("xai_verdict_editorial_failure", {
        topicId,
        provider: "xai",
        failureKind: editorialResult.failure.kind,
        statusCode: editorialResult.failure.statusCode ?? null,
        requestId: editorialResult.failure.requestId,
        details: editorialResult.failure.details ?? null,
      });
    }
    if (editorialResult.editorial) {
      verdictPresentation = {
        ...fallbackVerdictPresentation,
        summary: editorialResult.editorial.summary,
        editorialBody: editorialResult.editorial.editorialBody,
        narrative: editorialResult.editorial.narrative,
        highlights: editorialResult.editorial.highlights,
      };
    }
  } catch (error) {
    if (error instanceof VerdictEditorialError) {
      console.warn("xai verdict editorial generation failed", {
        topicId,
        failureKind: error.kind,
        statusCode: error.statusCode ?? null,
        requestId: error.requestId,
        details: error.details ?? null,
      });
    } else {
      console.warn("xai verdict editorial generation failed", {
        topicId,
        failureKind: "unexpected_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
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

  const verdictId = await writeVerdict(
    env,
    topicId,
    confidence,
    terminalizationMode,
    verdictPresentation.summary,
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
    },
    Boolean(options?.reterminalize),
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

  await reconcileTopicPresentation(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN);

  return { topicId, terminalized: true, alreadyTerminalized: false };
}
