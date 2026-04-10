import { z } from "zod";

export const TopicTemplateIdSchema = z.enum([
  "debate",
  "research",
  "autonomous_v1",
]);

export const TopicFormatSchema = z.enum([
  "scheduled_research",
  "rolling_research",
]);

export const CadenceFamilySchema = z.enum(["scheduled", "quorum", "rolling"]);
export const CadencePresetSchema = z.enum(["3m", "3h", "9h", "24h"]);

// Authority docs use these round kinds. New topics should emit only these values.
export const RoundKindSchema = z.enum([
  "propose",
  "map",
  "critique",
  "refine",
  "final_argument",
  "synthesize",
  "predict",
  "vote",
  "verdict",
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

export function buildTopicFormatSummary(
  topicFormat: z.infer<typeof TopicFormatSchema>,
  quorumTarget: number | null,
) {
  if (topicFormat === "rolling_research") {
    return {
      label: "Rolling Research",
      joinWindow: "rolling" as const,
      promptLock: false,
      quorumTarget,
      replenishes: true,
    };
  }

  return {
    label: "Scheduled Research",
    joinWindow: "pre_start" as const,
    promptLock: true,
    quorumTarget: null,
    replenishes: false,
  };
}

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

export const BehavioralDimensionSchema = z.enum(["responsiveness", "specificity", "constructiveness"]);
export type BehavioralDimension = z.infer<typeof BehavioralDimensionSchema>;

export const BehavioralDimensionWeightSchema = z.object({
  dimension: BehavioralDimensionSchema,
  weight: z.number().min(0).max(1),
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
  behavioralDimensions: z.array(BehavioralDimensionWeightSchema).optional(),
});

export type BehavioralDimensionWeight = z.infer<typeof BehavioralDimensionWeightSchema>;

export const BEHAVIORAL_DIMENSION_DEFAULTS: Record<string, BehavioralDimensionWeight[]> = {
  propose: [{ dimension: "specificity", weight: 1.0 }],
  critique: [
    { dimension: "responsiveness", weight: 0.6 },
    { dimension: "specificity", weight: 0.4 },
  ],
  refine: [
    { dimension: "constructiveness", weight: 0.5 },
    { dimension: "responsiveness", weight: 0.3 },
    { dimension: "specificity", weight: 0.2 },
  ],
  map: [
    { dimension: "constructiveness", weight: 0.5 },
    { dimension: "responsiveness", weight: 0.5 },
  ],
  synthesize: [
    { dimension: "constructiveness", weight: 0.6 },
    { dimension: "responsiveness", weight: 0.4 },
  ],
  predict: [{ dimension: "specificity", weight: 1.0 }],
  final_argument: [
    { dimension: "specificity", weight: 0.5 },
    { dimension: "constructiveness", weight: 0.5 },
  ],
  vote: [],
  verdict: [
    { dimension: "constructiveness", weight: 0.6 },
    { dimension: "specificity", weight: 0.4 },
  ],
};

export const TERMINALIZATION_CONFIDENCE_MAP: Record<
  z.infer<typeof TerminalizationModeSchema>,
  readonly z.infer<typeof VerdictConfidenceSchema>[]
> = {
  full_template: ["strong", "moderate"],
  degraded_template: ["moderate", "emerging"],
  insufficient_signal: ["emerging"],
};

export const CADENCE_PRESETS = {
  "3m": { minDurationSeconds: 60, responseWindowSeconds: 180, voteWindowSeconds: 120 },
  "3h": { minDurationSeconds: 900, responseWindowSeconds: 3600, voteWindowSeconds: 1800 },
  "9h": { minDurationSeconds: 1800, responseWindowSeconds: 10800, voteWindowSeconds: 3600 },
  "24h": { minDurationSeconds: 3600, responseWindowSeconds: 28800, voteWindowSeconds: 10800 },
} as const;

const PHASE2_DEADLINE_ONLY_NOTE =
  "Phase 2 persists the authority completion style but advances rounds only on ends_at until contribution, score, and vote loops land.";

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

// debate matches the worked launch-core example directly. The other templates
// preserve the documented round counts and canonical round vocabulary for Phase 2,
// while later phases can deepen per-round vote/enrollment semantics without
// reintroducing the old generalized labels.
export const TOPIC_TEMPLATES = {
  debate: defineTemplate({
    templateId: "debate",
    scoringProfile: "adversarial",
    cadenceFamily: "scheduled",
    enrollmentMode: "curated",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "full_template",
    rounds: [
      openRound("propose", "aggressive"),                                        // R0: raw positions
      openRound("vote", "aggressive", {                                          // R1: vote on proposals
        votePolicy: { required: true, targetPolicy: "prior_round", minVotesPerActor: 3, maxVotesPerActor: 3 },
      }),
      openRound("map", "aggressive"),                                            // R2: identify convergence
      openRound("vote", "aggressive", {                                          // R3: vote on maps
        votePolicy: { required: true, targetPolicy: "prior_round", minVotesPerActor: 3, maxVotesPerActor: 3 },
      }),
      openRound("critique", "aggressive"),                                       // R4: attack positions
      openRound("vote", "aggressive", {                                          // R5: vote on critiques
        votePolicy: { required: true, targetPolicy: "prior_round", minVotesPerActor: 3, maxVotesPerActor: 3, earlyVoteWeightMode: "downweight_early" },
      }),
      openRound("refine", "aggressive"),                                         // R6: update position
      openRound("vote", "aggressive", {                                          // R7: vote on refinements
        votePolicy: { required: true, targetPolicy: "prior_round", minVotesPerActor: 3, maxVotesPerActor: 3 },
      }),
      openRound("final_argument", "aggressive"),                                 // R8: final shot
      openRound("vote", "aggressive", {                                          // R9: vote on final arguments — terminal
        terminal: true,
        votePolicy: { required: true, targetPolicy: "prior_round", minVotesPerActor: 3, maxVotesPerActor: 3 },
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
  // Internal-only: drives the rolling-research worker (autonomous-lifecycle.ts).
  // Not exposed via user-facing topic creation (that path is narrowed to "debate").
  autonomous_v1: defineTemplate({
    templateId: "autonomous_v1",
    scoringProfile: "exploratory",
    cadenceFamily: "rolling",
    enrollmentMode: "open",
    visibility: "public",
    voteRequired: true,
    terminalizationMode: "full_template",
    rounds: [
      openRound("propose", "patient"),
      openRound("critique", "patient", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 3,
        },
      }),
      openRound("refine", "patient", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 3,
        },
      }),
      openRound("synthesize", "patient", {
        votePolicy: {
          required: true,
          targetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 3,
        },
      }),
      openRound("verdict", "patient", {
        votePolicy: {
          required: false,
          targetPolicy: "prior_round",
        },
      }),
      openRound("vote", "patient", { terminal: true }),
    ],
  }),
} as const;

/** Returns true if the round at sequenceIndex is followed by a vote round in the template. */
export function hasFollowingVoteRound(templateId: string, sequenceIndex: number): boolean {
  const template = TOPIC_TEMPLATES[templateId as keyof typeof TOPIC_TEMPLATES];
  if (!template) return false;
  const next = template.roundSequence[sequenceIndex + 1];
  return next === "vote";
}

export type TopicTemplateId = z.infer<typeof TopicTemplateIdSchema>;
export type TopicFormat = z.infer<typeof TopicFormatSchema>;
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
