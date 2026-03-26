import { z } from "zod";

export const TopicTemplateIdSchema = z.enum([
  "debate_v1",
  "debate_v2",
  "research",
  "deep",
  "socratic",
  "chaos",
]);

export const CadenceFamilySchema = z.enum(["scheduled", "quorum", "rolling"]);
export const CadencePresetSchema = z.enum(["3h", "9h", "24h"]);

// Authority docs use these round kinds. New topics should emit only these values.
export const RoundKindSchema = z.enum([
  "propose",
  "critique",
  "refine",
  "synthesize",
  "predict",
  "vote",
]);
export const RoundEnrollmentTypeSchema = z.enum([
  "open",
  "top_n",
  "previous_participants",
  "invited",
]);
export const EnrollmentFallbackSchema = z.enum([
  "top_n",
  "previous_participants",
  "open_enrollment",
]);
export const RoundVisibilitySchema = z.enum(["sealed", "open"]);
export const CompletionStyleSchema = z.enum([
  "aggressive",
  "patient",
  "quality_gated",
]);
export const VoteTargetPolicySchema = z.enum([
  "prior_round",
  "latest_nonempty_prior",
]);
export const Phase2CompletionModeSchema = z.enum(["deadline_only"]);
export const Phase2EnrollmentModeSchema = z.enum([
  "topic_members_only",
  "deferred_selective_enrollment",
]);

export const VisibilityModeSchema = z.enum(["public", "unlisted", "private"]);
export const EnrollmentModeSchema = z.enum(["open", "curated", "invite_only"]);
export const ScoringProfileSchema = z.enum([
  "adversarial",
  "exploratory",
  "dialectical",
  "unscored",
]);
export const TerminalizationModeSchema = z.enum([
  "full_template",
  "degraded_template",
  "insufficient_signal",
]);
export const VerdictConfidenceSchema = z.enum(["strong", "moderate", "emerging"]);

const RoundVotePolicySchema = z.object({
  required: z.boolean(),
  targetPolicy: VoteTargetPolicySchema,
  minVotesPerActor: z.number().int().nonnegative().optional(),
  maxVotesPerActor: z.number().int().positive().optional(),
  earlyVoteWeightMode: z.string().min(1).optional(),
});

const Phase2RoundExecutionSchema = z.object({
  completionMode: Phase2CompletionModeSchema,
  enrollmentMode: Phase2EnrollmentModeSchema,
  note: z.string().min(1),
});

export const TemplateRoundSchema = z.object({
  roundKind: RoundKindSchema,
  enrollmentType: RoundEnrollmentTypeSchema,
  visibility: RoundVisibilitySchema,
  completionStyle: CompletionStyleSchema,
  votePolicy: RoundVotePolicySchema.nullable(),
  fallbackChain: z.array(EnrollmentFallbackSchema).default([]),
  topN: z.number().int().positive().optional(),
  terminal: z.boolean().default(false),
  phase2Execution: Phase2RoundExecutionSchema,
});

export const TERMINALIZATION_CONFIDENCE_MAP: Record<
  z.infer<typeof TerminalizationModeSchema>,
  readonly z.infer<typeof VerdictConfidenceSchema>[]
> = {
  full_template: ["strong", "moderate"],
  degraded_template: ["moderate", "emerging"],
  insufficient_signal: ["emerging"],
};

export const CADENCE_PRESETS = {
  "3h": { minDurationSeconds: 900, responseWindowSeconds: 3600, voteWindowSeconds: 1800 },
  "9h": { minDurationSeconds: 1800, responseWindowSeconds: 10800, voteWindowSeconds: 3600 },
  "24h": { minDurationSeconds: 3600, responseWindowSeconds: 28800, voteWindowSeconds: 10800 },
} as const;

const PHASE2_DEADLINE_ONLY_NOTE =
  "Phase 2 persists the authority completion style but advances rounds only on ends_at until contribution, score, and vote loops land.";
const PHASE2_SELECTIVE_ENROLLMENT_NOTE =
  "Phase 2 resolves only open topic-member enrollment. Selective enrollment and fallback-chain execution are deferred until contribution and score signals exist.";

function defineTemplate<const TRounds extends readonly z.infer<typeof TemplateRoundSchema>[]>(
  template: {
    templateId: z.infer<typeof TopicTemplateIdSchema>;
    scoringProfile: z.infer<typeof ScoringProfileSchema>;
    cadenceFamily: z.infer<typeof CadenceFamilySchema>;
    enrollmentMode: z.infer<typeof EnrollmentModeSchema>;
    visibility: z.infer<typeof VisibilityModeSchema>;
    voteRequired: boolean;
    terminalizationMode: z.infer<typeof TerminalizationModeSchema>;
    rounds: TRounds;
  },
) {
  return {
    ...template,
    roundSequence: template.rounds.map((round) => round.roundKind),
  } as const;
}

function openRound(
  roundKind: z.infer<typeof RoundKindSchema>,
  completionStyle: z.infer<typeof CompletionStyleSchema>,
  options?: {
    terminal?: boolean;
    votePolicy?: z.infer<typeof RoundVotePolicySchema> | null;
  },
): z.infer<typeof TemplateRoundSchema> {
  return {
    roundKind,
    enrollmentType: "open",
    visibility: "sealed",
    completionStyle,
    votePolicy: options?.votePolicy ?? null,
    fallbackChain: [],
    terminal: options?.terminal ?? false,
    phase2Execution: {
      completionMode: "deadline_only",
      enrollmentMode: "topic_members_only",
      note: PHASE2_DEADLINE_ONLY_NOTE,
    },
  };
}

// debate_v2 matches the worked launch-core example directly. The other templates
// preserve the documented round counts and canonical round vocabulary for Phase 2,
// while later phases can deepen per-round vote/enrollment semantics without
// reintroducing the old generalized labels.
export const TOPIC_TEMPLATES = {
  debate_v1: defineTemplate({
    templateId: "debate_v1",
    scoringProfile: "adversarial",
    cadenceFamily: "quorum",
    enrollmentMode: "curated",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "full_template",
    rounds: [
      openRound("propose", "aggressive"),
      openRound("critique", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("refine", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("critique", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("refine", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("synthesize", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("predict", "aggressive", { terminal: true }),
    ],
  }),
  debate_v2: defineTemplate({
    templateId: "debate_v2",
    scoringProfile: "adversarial",
    cadenceFamily: "scheduled",
    enrollmentMode: "curated",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "full_template",
    rounds: [
      openRound("propose", "aggressive"),
      openRound("critique", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
          earlyVoteWeightMode: "downweight_early",
        },
      }),
      openRound("refine", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("synthesize", "aggressive", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
      openRound("predict", "aggressive", {
        terminal: true,
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
        },
      }),
    ],
  }),
  research: defineTemplate({
    templateId: "research",
    scoringProfile: "exploratory",
    cadenceFamily: "rolling",
    enrollmentMode: "open",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "degraded_template",
    rounds: [
      openRound("propose", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("synthesize", "patient"),
      openRound("vote", "patient"),
      openRound("predict", "patient", { terminal: true }),
    ],
  }),
  deep: defineTemplate({
    templateId: "deep",
    scoringProfile: "exploratory",
    cadenceFamily: "scheduled",
    enrollmentMode: "curated",
    visibility: "unlisted",
    voteRequired: true,
    terminalizationMode: "full_template",
    rounds: [
      openRound("propose", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("critique", "patient"),
      openRound("refine", "patient"),
      openRound("synthesize", "patient"),
      openRound("predict", "patient", { terminal: true }),
    ],
  }),
  socratic: defineTemplate({
    templateId: "socratic",
    scoringProfile: "dialectical",
    cadenceFamily: "quorum",
    enrollmentMode: "open",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "degraded_template",
    rounds: [
      openRound("propose", "quality_gated"),
      openRound("critique", "quality_gated"),
      openRound("refine", "quality_gated"),
      openRound("critique", "quality_gated"),
      openRound("refine", "quality_gated"),
      openRound("synthesize", "quality_gated"),
      openRound("predict", "quality_gated", { terminal: true }),
    ],
  }),
  chaos: defineTemplate({
    templateId: "chaos",
    scoringProfile: "unscored",
    cadenceFamily: "rolling",
    enrollmentMode: "open",
    visibility: "unlisted",
    voteRequired: false,
    terminalizationMode: "insufficient_signal",
    rounds: [
      {
        roundKind: "propose",
        enrollmentType: "open",
        visibility: "open",
        completionStyle: "aggressive",
        votePolicy: null,
        fallbackChain: [],
        terminal: true,
        phase2Execution: {
          completionMode: "deadline_only",
          enrollmentMode: "topic_members_only",
          note: PHASE2_SELECTIVE_ENROLLMENT_NOTE,
        },
      },
    ],
  }),
} as const;

export type TopicTemplateId = z.infer<typeof TopicTemplateIdSchema>;
export type CadenceFamily = z.infer<typeof CadenceFamilySchema>;
export type CadencePreset = z.infer<typeof CadencePresetSchema>;
export type RoundKind = z.infer<typeof RoundKindSchema>;
export type RoundEnrollmentType = z.infer<typeof RoundEnrollmentTypeSchema>;
export type EnrollmentFallback = z.infer<typeof EnrollmentFallbackSchema>;
export type RoundVisibility = z.infer<typeof RoundVisibilitySchema>;
export type CompletionStyle = z.infer<typeof CompletionStyleSchema>;
export type VoteTargetPolicy = z.infer<typeof VoteTargetPolicySchema>;
export type Phase2CompletionMode = z.infer<typeof Phase2CompletionModeSchema>;
export type Phase2EnrollmentMode = z.infer<typeof Phase2EnrollmentModeSchema>;
export type VisibilityMode = z.infer<typeof VisibilityModeSchema>;
export type EnrollmentMode = z.infer<typeof EnrollmentModeSchema>;
export type ScoringProfile = z.infer<typeof ScoringProfileSchema>;
export type TerminalizationMode = z.infer<typeof TerminalizationModeSchema>;
export type VerdictConfidence = z.infer<typeof VerdictConfidenceSchema>;
