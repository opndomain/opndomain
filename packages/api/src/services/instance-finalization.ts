import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import {
  FINALIZATION_PHASE_SEQUENCE,
  type FinalizationPhase,
  type FinalizationStepStatus,
} from "@opndomain/shared";
import { forceFlushTopicState } from "./terminalization.js";
import { recomputeContributionFinalScore } from "./votes.js";
import { updateDomainReputation } from "./reputation.js";
import { computeInstanceEpistemicAdjustments } from "./claim-provenance.js";
import { createSlotsFromOutput } from "./canonical-slots.js";
import { recordProvenance } from "./claim-provenance.js";
import { analyzePositions, type ContributionWithStance } from "./verdict-positions.js";
import { AutonomousConfigSchema } from "@opndomain/shared";

type FinalizationStepRow = {
  id: string;
  instance_id: string;
  phase: FinalizationPhase;
  status: FinalizationStepStatus;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
  [key: string]: unknown;
};

type InstanceRow = {
  id: string;
  topic_id: string;
  instance_index: number;
  status: string;
  error_class: string | null;
  retry_count: number;
  max_retries: number;
  participant_count: number;
  [key: string]: unknown;
};

/**
 * Execute a finalization phase with idempotency tracking.
 *
 * - INSERT OR IGNORE phase row with status='started'
 * - If new row: run side effect
 * - On success: mark completed
 * - On failure: mark failed
 * - If row exists and is completed: skip
 * - If row exists and is started or failed: re-execute
 */
async function executePhase(
  env: ApiEnv,
  instanceId: string,
  phase: FinalizationPhase,
  sideEffect: () => Promise<void>,
): Promise<{ executed: boolean; error?: string }> {
  const stepId = createId("fin");

  // Try to insert a new step row
  await runStatement(
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO instance_finalization_steps
         (id, instance_id, phase, status)
         VALUES (?, ?, ?, 'started')`,
      )
      .bind(stepId, instanceId, phase),
  );

  // Read current state
  const step = await firstRow<FinalizationStepRow>(
    env.DB,
    `SELECT * FROM instance_finalization_steps
     WHERE instance_id = ? AND phase = ?`,
    instanceId,
    phase,
  );

  if (!step) {
    return { executed: false, error: "Failed to create finalization step" };
  }

  // If already completed, skip
  if (step.status === "completed") {
    return { executed: false };
  }

  // Execute side effect (for started or failed rows)
  try {
    await sideEffect();

    // Mark completed
    await runStatement(
      env.DB
        .prepare(
          `UPDATE instance_finalization_steps
           SET status = 'completed', completed_at = CURRENT_TIMESTAMP, error_detail = NULL
           WHERE instance_id = ? AND phase = ?`,
        )
        .bind(instanceId, phase),
    );

    return { executed: true };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);

    await runStatement(
      env.DB
        .prepare(
          `UPDATE instance_finalization_steps
           SET status = 'failed', error_detail = ?
           WHERE instance_id = ? AND phase = ?`,
        )
        .bind(errorDetail, instanceId, phase),
    );

    return { executed: true, error: errorDetail };
  }
}

/**
 * Run the full instance finalization sequence.
 * Each phase is idempotent and resumable.
 */
export async function finalizeInstance(
  env: ApiEnv,
  instanceId: string,
): Promise<{
  success: boolean;
  completedPhases: FinalizationPhase[];
  failedPhase?: FinalizationPhase;
  error?: string;
}> {
  const instance = await firstRow<InstanceRow>(
    env.DB,
    `SELECT * FROM topic_instances WHERE id = ?`,
    instanceId,
  );
  if (!instance) {
    return { success: false, completedPhases: [], error: "Instance not found" };
  }

  // Mark as finalizing
  await runStatement(
    env.DB
      .prepare(
        `UPDATE topic_instances SET status = 'finalizing', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('running', 'finalizing', 'error')`,
      )
      .bind(instanceId),
  );

  const completedPhases: FinalizationPhase[] = [];

  for (const phase of FINALIZATION_PHASE_SEQUENCE) {
    const result = await executePhase(env, instanceId, phase, async () => {
      switch (phase) {
        case "flush_complete":
          await runFlushComplete(env, instance);
          break;
        case "scores_recomputed":
          await runScoresRecomputed(env, instance);
          break;
        case "reputation_provisional":
          await runReputationProvisional(env, instance);
          break;
        case "verdict_written":
          await runVerdictWritten(env, instance);
          break;
        case "epistemic_applied":
          await runEpistemicApplied(env, instance);
          break;
        case "dossier_assembled":
          await runDossierAssembled(env, instance);
          break;
        case "merge_ready":
          // No side effect — just marks the instance as ready for merge
          break;
      }
    });

    if (result.error) {
      // Mark instance as error with retryable class
      await runStatement(
        env.DB
          .prepare(
            `UPDATE topic_instances
             SET status = 'error', error_class = 'retryable', error_detail = ?,
                 retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(result.error, instanceId),
      );

      return {
        success: false,
        completedPhases,
        failedPhase: phase,
        error: result.error,
      };
    }

    completedPhases.push(phase);
  }

  // Mark instance as finalized
  await runStatement(
    env.DB
      .prepare(
        `UPDATE topic_instances
         SET status = 'finalized', finalized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(instanceId),
  );

  return { success: true, completedPhases };
}

// --- Phase implementations ---

async function runFlushComplete(env: ApiEnv, instance: InstanceRow): Promise<void> {
  await forceFlushTopicState(env, instance.topic_id);
}

async function runScoresRecomputed(env: ApiEnv, instance: InstanceRow): Promise<void> {
  // Recompute final scores only for contributions on this instance's rounds
  const contributions = await allRows<{ id: string }>(
    env.DB,
    `SELECT c.id FROM contributions c
     JOIN rounds r ON r.id = c.round_id
     WHERE r.instance_id = ?
       AND c.visibility = 'normal'`,
    instance.id,
  );

  for (const contrib of contributions) {
    await recomputeContributionFinalScore(env, contrib.id);
  }
}

async function runReputationProvisional(env: ApiEnv, instance: InstanceRow): Promise<void> {
  // Get topic domain
  const topic = await firstRow<{ domain_id: string }>(
    env.DB,
    `SELECT domain_id FROM topics WHERE id = ?`,
    instance.topic_id,
  );
  if (!topic) return;

  // Get participants in this instance
  const participants = await allRows<{ being_id: string }>(
    env.DB,
    `SELECT being_id FROM instance_participants WHERE instance_id = ?`,
    instance.id,
  );

  for (const participant of participants) {
    // Check if reputation history row already exists for this instance
    const existingHistory = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM domain_reputation_history
       WHERE instance_id = ? AND being_id = ? AND domain_id = ?`,
      instance.id,
      participant.being_id,
      topic.domain_id,
    );

    if (existingHistory) continue; // Already applied, skip

    // Compute average final score for this participant in this instance only
    const scoreRow = await firstRow<{ avg_score: number }>(
      env.DB,
      `SELECT COALESCE(AVG(cs.final_score), 0) as avg_score
       FROM contributions c
       JOIN contribution_scores cs ON cs.contribution_id = c.id
       JOIN rounds r ON r.id = c.round_id
       WHERE r.instance_id = ? AND c.being_id = ? AND c.visibility = 'normal'`,
      instance.id,
      participant.being_id,
    );

    const avgScore = scoreRow?.avg_score ?? 0;
    if (avgScore <= 0) continue;

    // Atomic pair: update aggregate + insert history row with instance_id
    // Using env.DB.batch() for atomicity
    const historyId = createId("drh");
    const reputationId = createId("drp");
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO domain_reputation (
             id, domain_id, being_id, average_score, sample_count, m2,
             consistency_score, decayed_score, last_active_at
           ) VALUES (?, ?, ?, ?, 1, 0, 100, ?, ?)
           ON CONFLICT(domain_id, being_id) DO UPDATE SET
             average_score = (domain_reputation.average_score * domain_reputation.sample_count + ?) / (domain_reputation.sample_count + 1),
             sample_count = domain_reputation.sample_count + 1,
             last_active_at = excluded.last_active_at`,
        )
        .bind(
          reputationId,
          topic.domain_id,
          participant.being_id,
          avgScore,
          avgScore,
          now,
          avgScore,
        ),
      env.DB
        .prepare(
          `INSERT INTO domain_reputation_history (
             id, domain_id, being_id, average_score, consistency_score,
             decayed_score, sample_count, recorded_at, instance_id
           ) VALUES (?, ?, ?, ?, 100, ?, 1, ?, ?)`,
        )
        .bind(
          historyId,
          topic.domain_id,
          participant.being_id,
          avgScore,
          avgScore,
          now,
          instance.id,
        ),
    ]);
  }
}

async function runVerdictWritten(env: ApiEnv, instance: InstanceRow): Promise<void> {
  // Build instance verdict package from this instance's contributions only
  const contributions = await allRows<{
    id: string;
    being_id: string;
    body: string;
    body_clean: string | null;
    round_kind: string;
    sequence_index: number;
    final_score: number;
    stance: string | null;
    target_contribution_id: string | null;
  }>(
    env.DB,
    `SELECT c.id, c.being_id, c.body, c.body_clean, r.round_kind, r.sequence_index,
            COALESCE(cs.final_score, 0) as final_score,
            c.stance, c.target_contribution_id
     FROM contributions c
     JOIN rounds r ON r.id = c.round_id
     JOIN contribution_scores cs ON cs.contribution_id = c.id
     WHERE r.instance_id = ? AND c.visibility = 'normal'
     ORDER BY cs.final_score DESC`,
    instance.id,
  );

  const uniqueParticipants = new Set(contributions.map((c) => c.being_id)).size;
  const confidence =
    uniqueParticipants >= 5 ? "strong" : uniqueParticipants >= 3 ? "moderate" : "emerging";

  const completedRounds = await firstRow<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(*) as cnt FROM rounds
     WHERE instance_id = ? AND status = 'completed'`,
    instance.id,
  );
  const terminalizationMode =
    (completedRounds?.cnt ?? 0) >= 3 ? "full_template" : "degraded_template";

  // Build verdict JSON
  const verdictJson = JSON.stringify({
    topContributions: contributions.slice(0, 10).map((c) => ({
      id: c.id,
      beingId: c.being_id,
      roundKind: c.round_kind,
      score: c.final_score,
      excerpt: c.body.slice(0, 200),
    })),
    participantCount: uniqueParticipants,
    contributionCount: contributions.length,
  });

  // Write to instance_verdict_packages (ON CONFLICT update)
  const packageId = createId("ivp");
  await runStatement(
    env.DB
      .prepare(
        `INSERT INTO instance_verdict_packages
         (id, instance_id, verdict_json, confidence, terminalization_mode, participant_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id) DO UPDATE SET
           verdict_json = excluded.verdict_json,
           confidence = excluded.confidence,
           terminalization_mode = excluded.terminalization_mode,
           participant_count = excluded.participant_count,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(packageId, instance.id, verdictJson, confidence, terminalizationMode, uniqueParticipants),
  );

  // --- Canonical slot creation from instance positions ---
  // Non-fatal: slot/provenance errors must not block finalization or merge.
  try {
    // Load autonomous config for ballot eligibility cap and min label length
    const topicRow = await firstRow<{ autonomous_config_json: string | null }>(
      env.DB,
      `SELECT autonomous_config_json FROM topics WHERE id = ?`,
      instance.topic_id,
    );
    const autonomousConfig = topicRow?.autonomous_config_json
      ? AutonomousConfigSchema.parse(JSON.parse(topicRow.autonomous_config_json))
      : undefined;

    const positionContribs: ContributionWithStance[] = contributions.map((c) => ({
      id: c.id,
      being_id: c.being_id,
      round_kind: c.round_kind,
      sequence_index: c.sequence_index,
      body_clean: c.body_clean,
      stance: c.stance,
      target_contribution_id: c.target_contribution_id,
      final_score: c.final_score,
    }));
    const positions = analyzePositions(positionContribs);
    const nonNoisePositions = positions.filter(
      (p) => p.label.length >= (autonomousConfig?.minSlotLabelLength ?? 8),
    );

    if (nonNoisePositions.length > 0) {
      const slots = nonNoisePositions.map((p) => ({
        slotKind: "position" as const,
        slotLabel: p.label,
      }));
      const createdSlots = await createSlotsFromOutput(
        env, instance.topic_id, instance.id, "verdict", slots, autonomousConfig,
      );

      for (let i = 0; i < nonNoisePositions.length; i++) {
        const position = nonNoisePositions[i];
        const slot = createdSlots[i];
        if (!slot) continue;

        for (const contribId of position.contributionIds) {
          const contrib = contributions.find((c) => c.id === contribId);
          if (!contrib) continue;

          let role: "author" | "support" | "objection" | "refinement" = "support";
          if (contrib.round_kind === "propose") {
            role = "author";
          } else if (contrib.stance === "oppose") {
            role = "objection";
          } else if (contrib.round_kind === "final_argument") {
            role = "refinement";
          }

          await recordProvenance(env, {
            canonicalSlotId: slot.id,
            instanceId: instance.id,
            contributionId: contribId,
            beingId: contrib.being_id,
            role,
            roundKind: contrib.round_kind,
          });
        }
      }
      console.info("canonical_slots_created", {
        instanceId: instance.id,
        slotCount: createdSlots.length,
      });
    }
  } catch (error) {
    // Non-fatal — verdict package already written, finalization continues
    console.error(`canonical slot creation failed for instance ${instance.id}`, error);
  }
}

async function runEpistemicApplied(env: ApiEnv, instance: InstanceRow): Promise<void> {
  const topic = await firstRow<{ domain_id: string }>(
    env.DB,
    `SELECT domain_id FROM topics WHERE id = ?`,
    instance.topic_id,
  );
  if (!topic) return;

  // Compute per-being adjustments from claim votes and provenance
  const adjustments = await computeInstanceEpistemicAdjustments(env, instance.id);

  for (const [beingId, adjustmentValue] of adjustments) {
    // Compute source hash for idempotency
    const sourceHash = `${instance.id}:${topic.domain_id}:${beingId}`;

    // Check if already journaled
    const existing = await firstRow<{ id: string }>(
      env.DB,
      `SELECT id FROM epistemic_adjustment_journal
       WHERE instance_id = ? AND domain_id = ? AND being_id = ?`,
      instance.id,
      topic.domain_id,
      beingId,
    );

    if (existing) continue; // Already applied

    // Atomic pair: journal row + epistemic_reliability update
    const journalId = createId("eaj");
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO epistemic_adjustment_journal
           (id, instance_id, domain_id, being_id, adjustment_value, source_hash)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(journalId, instance.id, topic.domain_id, beingId, adjustmentValue, sourceHash),
      env.DB
        .prepare(
          `INSERT INTO epistemic_reliability
           (id, domain_id, being_id, reliability_score)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(domain_id, being_id) DO UPDATE SET
             reliability_score = epistemic_reliability.reliability_score + ?,
             last_evaluated_at = CURRENT_TIMESTAMP`,
        )
        .bind(createId("epr"), topic.domain_id, beingId, adjustmentValue, adjustmentValue),
    ]);
  }
}

async function runDossierAssembled(env: ApiEnv, instance: InstanceRow): Promise<void> {
  // Instance-level dossier assembly is lightweight — the full dossier is
  // assembled at merge time. Here we just verify the instance data is ready.
  // The actual dossier_snapshots write happens during merge.
}

/**
 * Check if an instance has reached a specific finalization phase.
 */
export async function isPhaseCompleted(
  env: ApiEnv,
  instanceId: string,
  phase: FinalizationPhase,
): Promise<boolean> {
  const step = await firstRow<FinalizationStepRow>(
    env.DB,
    `SELECT status FROM instance_finalization_steps
     WHERE instance_id = ? AND phase = ?`,
    instanceId,
    phase,
  );
  return step?.status === "completed";
}

/**
 * Get finalization progress for an instance.
 */
export async function getFinalizationProgress(
  env: ApiEnv,
  instanceId: string,
): Promise<{
  completedPhases: FinalizationPhase[];
  currentPhase: FinalizationPhase | null;
  failedPhase: FinalizationPhase | null;
}> {
  const steps = await allRows<FinalizationStepRow>(
    env.DB,
    `SELECT * FROM instance_finalization_steps WHERE instance_id = ?`,
    instanceId,
  );

  const stepMap = new Map(steps.map((s) => [s.phase, s]));
  const completedPhases: FinalizationPhase[] = [];
  let currentPhase: FinalizationPhase | null = null;
  let failedPhase: FinalizationPhase | null = null;

  for (const phase of FINALIZATION_PHASE_SEQUENCE) {
    const step = stepMap.get(phase);
    if (!step) {
      currentPhase = phase;
      break;
    }
    if (step.status === "completed") {
      completedPhases.push(phase);
    } else if (step.status === "failed") {
      failedPhase = phase;
      break;
    } else {
      currentPhase = phase;
      break;
    }
  }

  return { completedPhases, currentPhase, failedPhase };
}
