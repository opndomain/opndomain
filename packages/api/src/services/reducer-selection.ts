import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";

/**
 * Select one reducer per pod based on highest cumulative weighted score
 * through the synthesize round, scoped to instance-owned rounds only.
 *
 * Eligibility: participant must have contributed in at least 3 of 4
 * pre-verdict rounds (propose, critique, refine, synthesize).
 *
 * Tiebreak: most completed rounds, then highest synthesize score,
 * then earliest first contribution timestamp.
 */
export async function selectPodReducers(
  env: ApiEnv,
  instanceId: string,
): Promise<Map<string, string>> {
  const pods = await allRows<{ id: string; pod_index: number }>(
    env.DB,
    `SELECT id, pod_index FROM instance_pods WHERE instance_id = ?`,
    instanceId,
  );

  const reducerMap = new Map<string, string>();

  for (const pod of pods) {
    const participants = await allRows<{ being_id: string }>(
      env.DB,
      `SELECT being_id FROM instance_participants
       WHERE instance_id = ? AND pod_id = ?`,
      instanceId,
      pod.id,
    );

    if (participants.length === 0) continue;

    let bestBeingId: string | null = null;
    let bestScore = -Infinity;
    let bestRoundCount = 0;
    let bestSynthScore = -Infinity;
    let bestFirstContrib = "";

    for (const participant of participants) {
      // Count distinct pre-verdict rounds with contributions in this instance
      const roundCountRow = await firstRow<{ round_count: number }>(
        env.DB,
        `SELECT COUNT(DISTINCT r.round_kind) as round_count
         FROM contributions c
         JOIN rounds r ON r.id = c.round_id
         WHERE r.instance_id = ?
           AND c.being_id = ?
           AND r.round_kind IN ('propose', 'critique', 'refine', 'synthesize')
           AND c.visibility = 'normal'`,
        instanceId,
        participant.being_id,
      );
      const roundCount = roundCountRow?.round_count ?? 0;

      // Require at least 3 of 4 pre-verdict rounds
      if (roundCount < 3) continue;

      // Cumulative weighted score through pre-verdict rounds
      const scoreRow = await firstRow<{ total_score: number }>(
        env.DB,
        `SELECT COALESCE(SUM(cs.final_score), 0) as total_score
         FROM contributions c
         JOIN contribution_scores cs ON cs.contribution_id = c.id
         JOIN rounds r ON r.id = c.round_id
         WHERE r.instance_id = ?
           AND c.being_id = ?
           AND r.round_kind IN ('propose', 'critique', 'refine', 'synthesize')
           AND c.visibility = 'normal'`,
        instanceId,
        participant.being_id,
      );
      const totalScore = scoreRow?.total_score ?? 0;

      // Synthesize-specific score for tiebreak
      const synthScoreRow = await firstRow<{ synth_score: number }>(
        env.DB,
        `SELECT COALESCE(SUM(cs.final_score), 0) as synth_score
         FROM contributions c
         JOIN contribution_scores cs ON cs.contribution_id = c.id
         JOIN rounds r ON r.id = c.round_id
         WHERE r.instance_id = ?
           AND c.being_id = ?
           AND r.round_kind = 'synthesize'
           AND c.visibility = 'normal'`,
        instanceId,
        participant.being_id,
      );
      const synthScore = synthScoreRow?.synth_score ?? 0;

      // Earliest first contribution for tiebreak
      const firstContribRow = await firstRow<{ first_at: string }>(
        env.DB,
        `SELECT MIN(c.submitted_at) as first_at
         FROM contributions c
         JOIN rounds r ON r.id = c.round_id
         WHERE r.instance_id = ? AND c.being_id = ? AND c.visibility = 'normal'`,
        instanceId,
        participant.being_id,
      );
      const firstAt = firstContribRow?.first_at ?? "";

      // Compare: score > round count > synth score > earliest first contribution
      const isBetter =
        totalScore > bestScore ||
        (totalScore === bestScore && roundCount > bestRoundCount) ||
        (totalScore === bestScore && roundCount === bestRoundCount && synthScore > bestSynthScore) ||
        (totalScore === bestScore && roundCount === bestRoundCount && synthScore === bestSynthScore && firstAt < bestFirstContrib);

      if (isBetter) {
        bestScore = totalScore;
        bestBeingId = participant.being_id;
        bestRoundCount = roundCount;
        bestSynthScore = synthScore;
        bestFirstContrib = firstAt;
      }
    }

    if (bestBeingId) {
      reducerMap.set(pod.id, bestBeingId);
      await runStatement(
        env.DB.prepare(`UPDATE instance_pods SET reducer_being_id = ? WHERE id = ?`)
          .bind(bestBeingId, pod.id),
      );
    }
  }

  return reducerMap;
}

/**
 * Get the reducer for a specific pod.
 */
export async function getPodReducer(
  env: ApiEnv,
  podId: string,
): Promise<string | null> {
  const pod = await firstRow<{ reducer_being_id: string | null }>(
    env.DB,
    `SELECT reducer_being_id FROM instance_pods WHERE id = ?`,
    podId,
  );
  return pod?.reducer_being_id ?? null;
}
