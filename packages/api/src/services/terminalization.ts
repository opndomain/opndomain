import {
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  TERMINALIZATION_CONFIDENCE_MAP,
  TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING,
  TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS,
  VERDICT_TOP_CONTRIBUTIONS_PER_ROUND,
} from "@opndomain/shared";
import type { TerminalizationMode, VerdictConfidence } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { queuePresentationRetry, reconcileTopicPresentation } from "./presentation.js";
import { rebuildDomainReputation, updateDomainReputation } from "./reputation.js";
import { recomputeContributionFinalScore } from "./votes.js";

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

  return { leaders, summary };
}

async function loadTopicContributions(env: ApiEnv, topicId: string): Promise<ContributionRow[]> {
  return allRows<ContributionRow>(
    env.DB,
    `
      SELECT
        c.id,
        c.being_id,
        c.round_id,
        r.round_kind,
        r.sequence_index,
        cs.final_score,
        cs.shadow_final_score,
        c.body_clean,
        c.visibility
      FROM contributions c
      INNER JOIN rounds r ON r.id = c.round_id
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
) {
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
      .bind(createId("vrd"), topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning))
      .run();
    return;
  }
  await env.DB
    .prepare(
      `
        INSERT INTO verdicts (
          id, topic_id, confidence, terminalization_mode, summary, reasoning_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(createId("vrd"), topicId, confidence, terminalizationMode, summary, JSON.stringify(reasoning))
    .run();
}

export async function runTerminalizationSequence(
  env: ApiEnv,
  topicId: string,
  options?: { reterminalize?: boolean },
): Promise<{ topicId: string; terminalized: boolean; alreadyTerminalized: boolean }> {
  const flushResult = await forceFlushTopicState(env, topicId);
  if (flushResult.remaining !== TERMINALIZATION_FORCE_FLUSH_EMPTY_REMAINING) {
    await queuePresentationRetry(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN, new Error("force_flush_not_drained"));
    throw new Error(`Force flush did not drain topic ${topicId} after ${TERMINALIZATION_FORCE_FLUSH_MAX_ATTEMPTS} attempts.`);
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
  const verdictPresentation = await buildVerdictSummary(rounds, refreshedContributions);

  await writeVerdict(
    env,
    topicId,
    confidence,
    terminalizationMode,
    verdictPresentation.summary,
    {
      topContributionsPerRound: verdictPresentation.leaders,
      completedRounds,
      totalRounds: rounds.length,
    },
    Boolean(options?.reterminalize),
  );

  await reconcileTopicPresentation(env, topicId, PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN);

  return { topicId, terminalized: true, alreadyTerminalized: false };
}
