import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { createId } from "../lib/ids.js";
import { computeInstanceFingerprint, type CanonicalSlot } from "@opndomain/shared";
import { performMergeAliasing, getTopicSlots, resolveCanonicalSlotId } from "./canonical-slots.js";

type InstanceVerdictPackageRow = {
  instance_id: string;
  verdict_json: string;
  confidence: string;
  terminalization_mode: string;
  participant_count: number;
  [key: string]: unknown;
};

type MergeRevisionRow = {
  id: string;
  topic_id: string;
  revision: number;
  instance_fingerprint: string;
  instance_ids_json: string;
  merge_method: string;
  merge_output_json: string | null;
  created_at: string;
  [key: string]: unknown;
};

export interface MergeOutput {
  topicId: string;
  revision: number;
  instanceFingerprint: string;
  mergedVerdict: MergedVerdict;
  mergedSlotVoteTallies: MergedSlotVoteTally[];
  instanceCount: number;
  totalParticipants: number;
}

interface MergedVerdict {
  confidence: string;
  participantWeightedSummary: string;
  instancePackages: Array<{
    instanceId: string;
    confidence: string;
    participantCount: number;
    topContributions: unknown[];
  }>;
}

export interface MergedSlotVoteTally {
  canonicalSlotId: string;
  slotKind: string;
  slotLabel: string;
  accurateNet: number;
  interestingNet: number;
  hallucinatedNet: number;
  totalVotes: number;
}

/**
 * Execute a merge across all finalized instances for a topic.
 *
 * Key invariants:
 * - same instance set -> same fingerprint -> no-op if already merged
 * - different instance set -> new revision
 * - merged claim vote tallies are always recomputed from raw claim_votes
 * - revisions are append-only snapshots
 */
export async function executeMerge(
  env: ApiEnv,
  topicId: string,
): Promise<MergeOutput | null> {
  // Get all finalized instances with no error class
  const instances = await allRows<{ id: string; participant_count: number }>(
    env.DB,
    `SELECT ti.id, ti.participant_count
     FROM topic_instances ti
     JOIN instance_finalization_steps ifs
       ON ifs.instance_id = ti.id AND ifs.phase = 'merge_ready' AND ifs.status = 'completed'
     WHERE ti.topic_id = ? AND ti.status = 'finalized' AND ti.error_class IS NULL
     ORDER BY ti.instance_index`,
    topicId,
  );

  if (instances.length === 0) return null;

  const instanceIds = instances.map((i) => i.id);
  const fingerprint = await computeInstanceFingerprint(instanceIds);

  // Check if this exact instance set has already been merged
  const existingRevision = await firstRow<MergeRevisionRow>(
    env.DB,
    `SELECT * FROM topic_merge_revisions
     WHERE topic_id = ? AND instance_fingerprint = ?`,
    topicId,
    fingerprint,
  );

  if (existingRevision) {
    // Already merged this exact set — return existing
    const output = existingRevision.merge_output_json
      ? JSON.parse(existingRevision.merge_output_json) as MergeOutput
      : null;
    return output;
  }

  // Perform merge-time aliasing for each instance's slots
  for (const instance of instances) {
    await performMergeAliasing(env, topicId, instance.id);
  }

  // Load all verdict packages
  const verdictPackages = await allRows<InstanceVerdictPackageRow>(
    env.DB,
    `SELECT * FROM instance_verdict_packages WHERE instance_id IN (${instanceIds.map(() => "?").join(",")})`,
    ...instanceIds,
  );

  // Build participant-weighted merged verdict
  const totalParticipants = instances.reduce((sum, i) => sum + i.participant_count, 0);
  const mergedVerdict = buildMergedVerdict(verdictPackages, totalParticipants);

  // Recompute vote tallies from raw claim_votes, resolving through current alias topology
  const mergedTallies = await recomputeMergedVoteTallies(env, topicId, instanceIds);

  // Atomic revision assignment + insert in one statement
  // Uses INSERT...SELECT to assign revision = COALESCE(MAX(revision),0)+1
  // within the same statement, preventing concurrent revision collisions.
  const revisionId = createId("mrv");
  const mergeMethod = instances.length === 1 ? "identity" : "participant_weighted";

  // We need the revision number for the output, so we use a preliminary merge output
  // and then read back the assigned revision.
  await runStatement(
    env.DB
      .prepare(
        `INSERT INTO topic_merge_revisions
         (id, topic_id, revision, instance_fingerprint, instance_ids_json, merge_method, merge_output_json)
         SELECT ?, ?, COALESCE(MAX(revision), 0) + 1, ?, ?, ?, NULL
         FROM topic_merge_revisions WHERE topic_id = ?`,
      )
      .bind(
        revisionId,
        topicId,
        fingerprint,
        JSON.stringify(instanceIds),
        mergeMethod,
        topicId,
      ),
  );

  // Read back the assigned revision
  const assignedRow = await firstRow<{ revision: number }>(
    env.DB,
    `SELECT revision FROM topic_merge_revisions WHERE id = ?`,
    revisionId,
  );
  const revision = assignedRow?.revision ?? 1;

  const mergeOutput: MergeOutput = {
    topicId,
    revision,
    instanceFingerprint: fingerprint,
    mergedVerdict,
    mergedSlotVoteTallies: mergedTallies,
    instanceCount: instances.length,
    totalParticipants,
  };

  // Update with full merge output JSON
  await runStatement(
    env.DB
      .prepare(
        `UPDATE topic_merge_revisions SET merge_output_json = ? WHERE id = ?`,
      )
      .bind(JSON.stringify(mergeOutput), revisionId),
  );

  // Update topic merge_revision pointer
  await runStatement(
    env.DB
      .prepare(`UPDATE topics SET merge_revision = ? WHERE id = ?`)
      .bind(revision, topicId),
  );

  return mergeOutput;
}

function buildMergedVerdict(
  packages: InstanceVerdictPackageRow[],
  totalParticipants: number,
): MergedVerdict {
  if (packages.length === 0) {
    return {
      confidence: "emerging",
      participantWeightedSummary: "",
      instancePackages: [],
    };
  }

  // Single-instance fast path
  if (packages.length === 1) {
    const pkg = packages[0];
    const parsed = JSON.parse(pkg.verdict_json);
    return {
      confidence: pkg.confidence,
      participantWeightedSummary: `Single instance with ${pkg.participant_count} participants`,
      instancePackages: [
        {
          instanceId: pkg.instance_id,
          confidence: pkg.confidence,
          participantCount: pkg.participant_count,
          topContributions: parsed.topContributions ?? [],
        },
      ],
    };
  }

  // Multi-instance: participant-weighted confidence
  const confidenceOrder = ["strong", "moderate", "emerging"];
  let weightedConfidenceIndex = 0;
  for (const pkg of packages) {
    const index = confidenceOrder.indexOf(pkg.confidence);
    const weight = pkg.participant_count / totalParticipants;
    weightedConfidenceIndex += index * weight;
  }
  const mergedConfidence = confidenceOrder[Math.round(weightedConfidenceIndex)] ?? "emerging";

  return {
    confidence: mergedConfidence,
    participantWeightedSummary: `Merged from ${packages.length} instances with ${totalParticipants} total participants`,
    instancePackages: packages.map((pkg) => {
      const parsed = JSON.parse(pkg.verdict_json);
      return {
        instanceId: pkg.instance_id,
        confidence: pkg.confidence,
        participantCount: pkg.participant_count,
        topContributions: parsed.topContributions ?? [],
      };
    }),
  };
}

/**
 * Recompute merged vote tallies from raw claim_votes.
 * Always regroups through current alias topology — never inherits from prior revisions.
 */
async function recomputeMergedVoteTallies(
  env: ApiEnv,
  topicId: string,
  instanceIds: string[],
): Promise<MergedSlotVoteTally[]> {
  // Get all slots for this topic
  const allSlots = await getTopicSlots(env, topicId);

  // Build canonical slot map (resolve aliases)
  const canonicalSlotMap = new Map<string, { slotKind: string; slotLabel: string }>();
  for (const slot of allSlots) {
    const canonicalId = resolveCanonicalSlotId(slot);
    if (!canonicalSlotMap.has(canonicalId)) {
      // Find the canonical slot itself
      const canonicalSlot = allSlots.find((s) => s.id === canonicalId);
      if (canonicalSlot) {
        canonicalSlotMap.set(canonicalId, {
          slotKind: canonicalSlot.slot_kind,
          slotLabel: canonicalSlot.slot_label,
        });
      }
    }
  }

  // Build alias resolution: slotId -> canonicalSlotId
  const aliasResolution = new Map<string, string>();
  for (const slot of allSlots) {
    aliasResolution.set(slot.id, resolveCanonicalSlotId(slot));
  }

  // Query raw claim_votes for these instances
  const placeholders = instanceIds.map(() => "?").join(",");
  const rawVotes = await allRows<{
    canonical_slot_id: string;
    axis: string;
    direction: number;
  }>(
    env.DB,
    `SELECT canonical_slot_id, axis, direction FROM claim_votes
     WHERE instance_id IN (${placeholders})`,
    ...instanceIds,
  );

  // Aggregate through alias resolution
  const tallies = new Map<
    string,
    { accurateNet: number; interestingNet: number; hallucinatedNet: number; totalVotes: number }
  >();

  for (const vote of rawVotes) {
    const canonicalId = aliasResolution.get(vote.canonical_slot_id) ?? vote.canonical_slot_id;
    if (!tallies.has(canonicalId)) {
      tallies.set(canonicalId, {
        accurateNet: 0,
        interestingNet: 0,
        hallucinatedNet: 0,
        totalVotes: 0,
      });
    }
    const tally = tallies.get(canonicalId)!;
    tally.totalVotes += 1;
    if (vote.axis === "accurate") tally.accurateNet += vote.direction;
    else if (vote.axis === "interesting") tally.interestingNet += vote.direction;
    else if (vote.axis === "hallucinated") tally.hallucinatedNet += vote.direction;
  }

  // Build output
  const results: MergedSlotVoteTally[] = [];
  for (const [canonicalId, tally] of tallies) {
    const slotInfo = canonicalSlotMap.get(canonicalId);
    if (!slotInfo) continue;
    results.push({
      canonicalSlotId: canonicalId,
      slotKind: slotInfo.slotKind,
      slotLabel: slotInfo.slotLabel,
      ...tally,
    });
  }

  // Sort by total votes descending
  results.sort((a, b) => b.totalVotes - a.totalVotes);
  return results;
}

/**
 * Get the latest merge revision for a topic.
 */
export async function getLatestMergeRevision(
  env: ApiEnv,
  topicId: string,
): Promise<MergeRevisionRow | null> {
  return firstRow<MergeRevisionRow>(
    env.DB,
    `SELECT * FROM topic_merge_revisions
     WHERE topic_id = ?
     ORDER BY revision DESC
     LIMIT 1`,
    topicId,
  );
}

/**
 * Get a specific merge revision.
 */
export async function getMergeRevision(
  env: ApiEnv,
  topicId: string,
  revision: number,
): Promise<MergeRevisionRow | null> {
  return firstRow<MergeRevisionRow>(
    env.DB,
    `SELECT * FROM topic_merge_revisions
     WHERE topic_id = ? AND revision = ?`,
    topicId,
    revision,
  );
}
