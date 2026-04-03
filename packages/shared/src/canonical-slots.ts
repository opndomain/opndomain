import { z } from "zod";

export const SlotKindSchema = z.enum(["position", "claim", "objection", "unresolved"]);
export type SlotKind = z.infer<typeof SlotKindSchema>;

export const SlotPhaseSchema = z.enum(["synthesize", "verdict"]);
export type SlotPhase = z.infer<typeof SlotPhaseSchema>;

export const ClaimVoteAxisSchema = z.enum(["accurate", "interesting", "hallucinated"]);
export type ClaimVoteAxis = z.infer<typeof ClaimVoteAxisSchema>;

export const ClaimVoteDirectionSchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(1),
]);
export type ClaimVoteDirection = z.infer<typeof ClaimVoteDirectionSchema>;

export const ProvenanceRoleSchema = z.enum([
  "author",
  "support",
  "objection",
  "refinement",
  "carry_forward",
]);
export type ProvenanceRole = z.infer<typeof ProvenanceRoleSchema>;

export const PROVENANCE_ROLE_WEIGHTS: Record<ProvenanceRole, number> = {
  author: 1.0,
  refinement: 0.4,
  carry_forward: 0.3,
  support: 0.15,
  objection: 0.0,
};

export const CREDIT_WEIGHT_CAP_PER_SLOT = 1.0;
export const EPISTEMIC_ADJUSTMENT_CLAMP = 5;
export const DEFAULT_BALLOT_ELIGIBILITY_CAP = 12;
export const DEFAULT_BALLOT_DISPLAY_CAP = 8;
export const DEFAULT_MIN_SLOT_LABEL_LENGTH = 8;

export const CanonicalSlotSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  slotKind: SlotKindSchema,
  slotLabel: z.string().min(1),
  introducedByInstanceId: z.string().min(1),
  introducedAtPhase: SlotPhaseSchema,
  aliasOfSlotId: z.string().nullable().default(null),
  ballotEligible: z.boolean().default(true),
  frozenAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type CanonicalSlot = z.infer<typeof CanonicalSlotSchema>;

export const ClaimVoteSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  instanceId: z.string().min(1),
  canonicalSlotId: z.string().min(1),
  voterBeingId: z.string().min(1),
  axis: ClaimVoteAxisSchema,
  direction: ClaimVoteDirectionSchema,
  weight: z.number().nullable().default(null),
  createdAt: z.string(),
});
export type ClaimVote = z.infer<typeof ClaimVoteSchema>;

export const ClaimProvenanceSchema = z.object({
  id: z.string().min(1),
  canonicalSlotId: z.string().min(1),
  instanceId: z.string().min(1),
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  role: ProvenanceRoleSchema,
  roundKind: z.string().min(1),
  createdAt: z.string(),
});
export type ClaimProvenance = z.infer<typeof ClaimProvenanceSchema>;

export const InstanceStatusSchema = z.enum([
  "open",
  "running",
  "finalizing",
  "finalized",
  "error",
]);
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;

export const InstanceErrorClassSchema = z.enum([
  "retryable",
  "terminal",
  "excluded",
]);
export type InstanceErrorClass = z.infer<typeof InstanceErrorClassSchema>;

export const FinalizationPhaseSchema = z.enum([
  "flush_complete",
  "scores_recomputed",
  "reputation_provisional",
  "verdict_written",
  "epistemic_applied",
  "dossier_assembled",
  "merge_ready",
]);
export type FinalizationPhase = z.infer<typeof FinalizationPhaseSchema>;

export const FinalizationStepStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
]);
export type FinalizationStepStatus = z.infer<typeof FinalizationStepStatusSchema>;

export const FINALIZATION_PHASE_SEQUENCE: FinalizationPhase[] = [
  "flush_complete",
  "scores_recomputed",
  "reputation_provisional",
  "verdict_written",
  "epistemic_applied",
  "dossier_assembled",
  "merge_ready",
];

export const MergeRevisionSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  revision: z.number().int().positive(),
  instanceFingerprint: z.string().min(1),
  instanceIdsJson: z.string().min(1),
  mergeMethod: z.string().min(1),
  mergeOutputJson: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type MergeRevision = z.infer<typeof MergeRevisionSchema>;

export const AutonomousConfigSchema = z.object({
  minParticipantsPerInstance: z.number().int().positive().default(5),
  maxParticipantsPerInstance: z.number().int().positive().default(40),
  maxConcurrentInstances: z.number().int().positive().default(1),
  podSize: z.number().int().positive().default(8),
  roundDurationSeconds: z.number().int().positive().default(300),
  instanceTimeoutSeconds: z.number().int().positive().default(86400),
  ballotEligibilityCap: z.number().int().positive().default(DEFAULT_BALLOT_ELIGIBILITY_CAP),
  ballotDisplayCap: z.number().int().positive().default(DEFAULT_BALLOT_DISPLAY_CAP),
  minSlotLabelLength: z.number().int().positive().default(DEFAULT_MIN_SLOT_LABEL_LENGTH),
});
export type AutonomousConfig = z.infer<typeof AutonomousConfigSchema>;

/** Normalize a slot label for alias comparison */
export function normalizeSlotLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/** Compute instance fingerprint from a sorted set of instance IDs */
export async function computeInstanceFingerprint(instanceIds: string[]): Promise<string> {
  const sorted = [...instanceIds].sort();
  const data = sorted.join(":");
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compute epistemic adjustment for a being in an instance */
export function computeEpistemicAdjustment(
  slotCredits: Array<{
    creditWeight: number;
    accurateNet: number;
    interestingNet: number;
    hallucinatedNet: number;
  }>,
): number {
  let total = 0;
  for (const slot of slotCredits) {
    total +=
      slot.creditWeight *
      (slot.accurateNet * 0.7 + slot.interestingNet * 0.3 - slot.hallucinatedNet * 1.0);
  }
  return Math.max(-EPISTEMIC_ADJUSTMENT_CLAMP, Math.min(EPISTEMIC_ADJUSTMENT_CLAMP, total));
}
