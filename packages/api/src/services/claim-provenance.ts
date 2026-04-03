import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import {
  PROVENANCE_ROLE_WEIGHTS,
  CREDIT_WEIGHT_CAP_PER_SLOT,
  computeEpistemicAdjustment,
  type ProvenanceRole,
} from "@opndomain/shared";

export type ClaimProvenanceRow = {
  id: string;
  canonical_slot_id: string;
  instance_id: string;
  contribution_id: string;
  being_id: string;
  role: ProvenanceRole;
  round_kind: string;
  created_at: string;
  [key: string]: unknown;
}

/**
 * Record a provenance entry for a contribution's role in a canonical slot.
 * Idempotent via UNIQUE(canonical_slot_id, instance_id, contribution_id, role).
 */
export async function recordProvenance(
  env: ApiEnv,
  input: {
    canonicalSlotId: string;
    instanceId: string;
    contributionId: string;
    beingId: string;
    role: ProvenanceRole;
    roundKind: string;
  },
): Promise<ClaimProvenanceRow> {
  const existing = await firstRow<ClaimProvenanceRow>(
    env.DB,
    `SELECT * FROM claim_provenance
     WHERE canonical_slot_id = ? AND instance_id = ? AND contribution_id = ? AND role = ?`,
    input.canonicalSlotId,
    input.instanceId,
    input.contributionId,
    input.role,
  );
  if (existing) return existing;

  const id = createId("prov");
  await runStatement(
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO claim_provenance
         (id, canonical_slot_id, instance_id, contribution_id, being_id, role, round_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.canonicalSlotId,
        input.instanceId,
        input.contributionId,
        input.beingId,
        input.role,
        input.roundKind,
      ),
  );

  const row = await firstRow<ClaimProvenanceRow>(
    env.DB,
    `SELECT * FROM claim_provenance
     WHERE canonical_slot_id = ? AND instance_id = ? AND contribution_id = ? AND role = ?`,
    input.canonicalSlotId,
    input.instanceId,
    input.contributionId,
    input.role,
  );
  return row!;
}

/**
 * Get all provenance entries for a canonical slot within an instance.
 */
export async function getSlotProvenance(
  env: ApiEnv,
  canonicalSlotId: string,
  instanceId: string,
): Promise<ClaimProvenanceRow[]> {
  return allRows<ClaimProvenanceRow>(
    env.DB,
    `SELECT * FROM claim_provenance
     WHERE canonical_slot_id = ? AND instance_id = ?`,
    canonicalSlotId,
    instanceId,
  );
}

/**
 * Compute per-being credit weight for a slot within an instance.
 * Returns a map of being_id -> capped credit weight.
 */
export async function computeSlotCreditWeights(
  env: ApiEnv,
  canonicalSlotId: string,
  instanceId: string,
): Promise<Map<string, number>> {
  const entries = await getSlotProvenance(env, canonicalSlotId, instanceId);
  const weights = new Map<string, number>();

  for (const entry of entries) {
    const roleWeight = PROVENANCE_ROLE_WEIGHTS[entry.role];
    const current = weights.get(entry.being_id) ?? 0;
    weights.set(
      entry.being_id,
      Math.min(current + roleWeight, CREDIT_WEIGHT_CAP_PER_SLOT),
    );
  }

  return weights;
}

/**
 * Compute full epistemic adjustments for all beings in an instance.
 * Uses claim_votes and claim_provenance to derive per-being adjustments.
 *
 * Vote grouping: raw claim_votes are keyed by their source slot ID.
 * We resolve each source slot through the current alias topology to find
 * the canonical slot, then aggregate tallies per canonical slot.
 * This ensures votes are correctly grouped even when aliases cross instances.
 */
export async function computeInstanceEpistemicAdjustments(
  env: ApiEnv,
  instanceId: string,
): Promise<Map<string, number>> {
  // Get all slots introduced by this instance
  const slots = await allRows<{ id: string; alias_of_slot_id: string | null }>(
    env.DB,
    `SELECT id, alias_of_slot_id FROM canonical_slots
     WHERE introduced_by_instance_id = ?`,
    instanceId,
  );

  // Build alias resolution for all slots in this instance's topic
  // We need the full topic slot set to resolve aliases across instances
  const instanceRow = await firstRow<{ topic_id: string }>(
    env.DB,
    `SELECT topic_id FROM topic_instances WHERE id = ?`,
    instanceId,
  );
  if (!instanceRow) return new Map();

  const allTopicSlots = await allRows<{ id: string; alias_of_slot_id: string | null }>(
    env.DB,
    `SELECT id, alias_of_slot_id FROM canonical_slots WHERE topic_id = ?`,
    instanceRow.topic_id,
  );
  const aliasResolution = new Map<string, string>();
  for (const s of allTopicSlots) {
    aliasResolution.set(s.id, s.alias_of_slot_id ?? s.id);
  }

  // Get all claim votes for this instance — these are keyed by raw source slot ID
  const votes = await allRows<{
    canonical_slot_id: string;
    axis: string;
    direction: number;
  }>(
    env.DB,
    `SELECT canonical_slot_id, axis, direction FROM claim_votes
     WHERE instance_id = ?`,
    instanceId,
  );

  // Aggregate vote tallies by RESOLVED canonical slot ID (through aliases)
  const slotVoteTallies = new Map<
    string,
    { accurateNet: number; interestingNet: number; hallucinatedNet: number }
  >();

  for (const vote of votes) {
    // Resolve the raw source slot through alias topology
    const canonicalId = aliasResolution.get(vote.canonical_slot_id) ?? vote.canonical_slot_id;
    if (!slotVoteTallies.has(canonicalId)) {
      slotVoteTallies.set(canonicalId, {
        accurateNet: 0,
        interestingNet: 0,
        hallucinatedNet: 0,
      });
    }
    const tally = slotVoteTallies.get(canonicalId)!;
    if (vote.axis === "accurate") tally.accurateNet += vote.direction;
    else if (vote.axis === "interesting") tally.interestingNet += vote.direction;
    else if (vote.axis === "hallucinated") tally.hallucinatedNet += vote.direction;
  }

  // Compute per-being adjustment by summing credit-weighted slot contributions
  const beingSlotCredits = new Map<
    string,
    Array<{
      creditWeight: number;
      accurateNet: number;
      interestingNet: number;
      hallucinatedNet: number;
    }>
  >();

  for (const slot of slots) {
    // This slot's provenance credits apply to the canonical tally
    const canonicalId = aliasResolution.get(slot.id) ?? slot.id;
    const tally = slotVoteTallies.get(canonicalId);
    if (!tally) continue;

    const creditWeights = await computeSlotCreditWeights(env, slot.id, instanceId);
    for (const [beingId, creditWeight] of creditWeights) {
      if (!beingSlotCredits.has(beingId)) {
        beingSlotCredits.set(beingId, []);
      }
      beingSlotCredits.get(beingId)!.push({
        creditWeight,
        ...tally,
      });
    }
  }

  const beingAdjustments = new Map<string, number>();
  for (const [beingId, credits] of beingSlotCredits) {
    beingAdjustments.set(beingId, computeEpistemicAdjustment(credits));
  }

  return beingAdjustments;
}
