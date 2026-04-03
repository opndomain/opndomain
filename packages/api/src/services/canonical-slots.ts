import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import {
  normalizeSlotLabel,
  DEFAULT_BALLOT_ELIGIBILITY_CAP,
  DEFAULT_MIN_SLOT_LABEL_LENGTH,
  type SlotKind,
  type SlotPhase,
  type AutonomousConfig,
} from "@opndomain/shared";

export type CanonicalSlotRow = {
  id: string;
  topic_id: string;
  slot_kind: SlotKind;
  slot_label: string;
  introduced_by_instance_id: string;
  introduced_at_phase: SlotPhase;
  alias_of_slot_id: string | null;
  ballot_eligible: number;
  frozen_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

/**
 * Create a canonical slot, deduplicating by (instance_id, slot_kind, slot_label).
 * Returns the existing slot if one already exists for this instance.
 */
export async function createCanonicalSlot(
  env: ApiEnv,
  input: {
    topicId: string;
    slotKind: SlotKind;
    slotLabel: string;
    instanceId: string;
    phase: SlotPhase;
  },
): Promise<CanonicalSlotRow> {
  // Check for existing slot from this instance
  const existing = await firstRow<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots
     WHERE introduced_by_instance_id = ? AND slot_kind = ? AND slot_label = ?`,
    input.instanceId,
    input.slotKind,
    input.slotLabel,
  );
  if (existing) return existing;

  const id = createId("slot");
  await runStatement(
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO canonical_slots
         (id, topic_id, slot_kind, slot_label, introduced_by_instance_id, introduced_at_phase)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.topicId, input.slotKind, input.slotLabel, input.instanceId, input.phase),
  );

  // Return the row (may have been inserted by concurrent writer)
  const row = await firstRow<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots
     WHERE introduced_by_instance_id = ? AND slot_kind = ? AND slot_label = ?`,
    input.instanceId,
    input.slotKind,
    input.slotLabel,
  );
  return row!;
}

/**
 * Batch-create slots from a verdict or synthesize output.
 * Enforces ballot-eligibility cap per instance.
 */
export async function createSlotsFromOutput(
  env: ApiEnv,
  topicId: string,
  instanceId: string,
  phase: SlotPhase,
  slots: Array<{ slotKind: SlotKind; slotLabel: string }>,
  config?: AutonomousConfig,
): Promise<CanonicalSlotRow[]> {
  const cap = config?.ballotEligibilityCap ?? DEFAULT_BALLOT_ELIGIBILITY_CAP;
  const minLen = config?.minSlotLabelLength ?? DEFAULT_MIN_SLOT_LABEL_LENGTH;
  const results: CanonicalSlotRow[] = [];

  // Count existing ballot-eligible slots for this instance
  const countRow = await firstRow<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(*) as cnt FROM canonical_slots
     WHERE introduced_by_instance_id = ? AND ballot_eligible = 1`,
    instanceId,
  );
  let ballotCount = countRow?.cnt ?? 0;

  for (const slot of slots) {
    if (slot.slotLabel.length < minLen) continue;

    const row = await createCanonicalSlot(env, {
      topicId,
      slotKind: slot.slotKind,
      slotLabel: slot.slotLabel,
      instanceId,
      phase,
    });

    // If we've exceeded the cap, mark new slots as not ballot-eligible
    if (ballotCount >= cap && row.ballot_eligible === 1) {
      await runStatement(
        env.DB
          .prepare(`UPDATE canonical_slots SET ballot_eligible = 0 WHERE id = ?`)
          .bind(row.id),
      );
      row.ballot_eligible = 0;
    } else if (row.ballot_eligible === 1) {
      ballotCount++;
    }

    results.push(row);
  }

  return results;
}

/**
 * Find existing alias targets for a slot by comparing normalized labels.
 * Returns the canonical (non-alias) slot if a match is found.
 */
export async function findAliasTarget(
  env: ApiEnv,
  topicId: string,
  slotKind: SlotKind,
  slotLabel: string,
  excludeSlotId: string,
): Promise<CanonicalSlotRow | null> {
  const normalized = normalizeSlotLabel(slotLabel);
  const candidates = await allRows<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots
     WHERE topic_id = ? AND slot_kind = ? AND alias_of_slot_id IS NULL AND id != ?`,
    topicId,
    slotKind,
    excludeSlotId,
  );

  for (const candidate of candidates) {
    if (normalizeSlotLabel(candidate.slot_label) === normalized) {
      return candidate;
    }
  }
  return null;
}

/**
 * Set alias relationship. Alias depth is always 1 — if target is itself an alias,
 * resolve to its canonical target.
 */
export async function setSlotAlias(
  env: ApiEnv,
  slotId: string,
  targetSlotId: string,
): Promise<void> {
  // Resolve target to canonical (depth 1)
  const target = await firstRow<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots WHERE id = ?`,
    targetSlotId,
  );
  if (!target) return;

  const canonicalTarget = target.alias_of_slot_id ?? target.id;

  await runStatement(
    env.DB
      .prepare(`UPDATE canonical_slots SET alias_of_slot_id = ? WHERE id = ?`)
      .bind(canonicalTarget, slotId),
  );
}

/**
 * Perform merge-time aliasing: for each slot in a new instance, check if it
 * matches an existing canonical slot by normalized label. If so, alias it.
 */
export async function performMergeAliasing(
  env: ApiEnv,
  topicId: string,
  instanceId: string,
): Promise<{ aliasedCount: number }> {
  const instanceSlots = await allRows<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots
     WHERE introduced_by_instance_id = ? AND alias_of_slot_id IS NULL`,
    instanceId,
  );

  let aliasedCount = 0;
  for (const slot of instanceSlots) {
    const target = await findAliasTarget(env, topicId, slot.slot_kind, slot.slot_label, slot.id);
    if (target) {
      await setSlotAlias(env, slot.id, target.id);
      aliasedCount++;
    }
  }

  return { aliasedCount };
}

/**
 * Unalias a slot. Only affects future revisions — existing merge snapshots are immutable.
 */
export async function unaliasSlot(env: ApiEnv, slotId: string): Promise<boolean> {
  const slot = await firstRow<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots WHERE id = ?`,
    slotId,
  );
  if (!slot || !slot.alias_of_slot_id) return false;

  await runStatement(
    env.DB
      .prepare(`UPDATE canonical_slots SET alias_of_slot_id = NULL WHERE id = ?`)
      .bind(slotId),
  );
  return true;
}

/**
 * Get all slots for a topic, resolving alias groups.
 * Returns canonical slots with their aliases grouped.
 */
export async function getTopicSlots(
  env: ApiEnv,
  topicId: string,
): Promise<CanonicalSlotRow[]> {
  return allRows<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots WHERE topic_id = ? ORDER BY created_at`,
    topicId,
  );
}

/**
 * Get canonical (non-alias) ballot-eligible slots for display.
 */
export async function getBallotSlots(
  env: ApiEnv,
  topicId: string,
  displayCap: number,
): Promise<CanonicalSlotRow[]> {
  return allRows<CanonicalSlotRow>(
    env.DB,
    `SELECT * FROM canonical_slots
     WHERE topic_id = ? AND ballot_eligible = 1 AND alias_of_slot_id IS NULL
     ORDER BY created_at
     LIMIT ?`,
    topicId,
    displayCap,
  );
}

/**
 * Resolve a slot to its canonical ID (follow alias if set).
 */
export function resolveCanonicalSlotId(slot: CanonicalSlotRow): string {
  return slot.alias_of_slot_id ?? slot.id;
}
