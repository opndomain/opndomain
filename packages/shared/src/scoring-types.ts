import { z } from "zod";
import {
  SCORE_DETAILS_VERSION,
  SEMANTIC_COMPARISON_SCOPE,
  SEMANTIC_COMPARISON_WINDOW_SIZE,
  SEMANTIC_TOPIC_EMBEDDING_SOURCE,
} from "./constants.js";
import {
  ContributionVisibilitySchema,
  DetectedRoleSchema,
  GuardrailDecisionSchema,
  RestrictionModeSchema,
  RiskFamilySchema,
} from "./schemas.js";

export const SemanticWindowContractSchema = z.object({
  scope: z.literal(SEMANTIC_COMPARISON_SCOPE),
  size: z.literal(SEMANTIC_COMPARISON_WINDOW_SIZE),
  includedVisibilities: z.tuple([
    z.literal("normal"),
    z.literal("low_confidence"),
  ]),
  includedDecisions: z.tuple([
    z.literal("allow"),
    z.literal("queue"),
  ]),
  topicEmbeddingSource: z.literal(SEMANTIC_TOPIC_EMBEDDING_SOURCE),
});

export const HeuristicScoreDetailsSchema = z.object({
  sentenceCount: z.number().int().nonnegative(),
  sentenceContribution: z.number().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  uniqueWordCount: z.number().int().nonnegative(),
  uniqueTermRatioScore: z.number().nonnegative(),
  specificityScore: z.number().nonnegative(),
  evidenceScore: z.number().nonnegative(),
  vaguenessPenalty: z.number().nonnegative(),
  densityMultiplier: z.number().positive(),
  substanceScore: z.number().min(0).max(100),
});

export const RoleScoreDetailsSchema = z.object({
  detectedRole: DetectedRoleSchema,
  roleBonus: z.number().min(0).max(100),
  echoDetected: z.boolean(),
  metaDetected: z.boolean(),
  familyWeights: z.record(z.number().nonnegative()),
  familyMatches: z.record(z.number().int().nonnegative()),
  liveEligible: z.boolean(),
  shadowEligible: z.boolean(),
});

export const SemanticScoreDetailsSchema = z.object({
  enabled: z.boolean(),
  topicEmbeddingText: z.string().min(1),
  comparisonWindow: SemanticWindowContractSchema,
  comparedContributionIds: z.array(z.string().min(1)),
  semanticFlags: z.array(z.string().min(1)),
  relevance: z.number().min(0).max(100).nullable(),
  novelty: z.number().min(0).max(100).nullable(),
  reframe: z.number().min(0).max(100).nullable(),
  semanticAverage: z.number().min(0).max(100).nullable(),
});

export const ContributionScoreDetailsSchema = z.object({
  version: z.literal(SCORE_DETAILS_VERSION),
  substance: z.number().min(0).max(100),
  sentenceContribution: z.number().nonnegative(),
  uniqueTermRatio: z.number().nonnegative(),
  specificity: z.number().nonnegative(),
  evidence: z.number().nonnegative(),
  vagueness: z.number().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  role: DetectedRoleSchema,
  roleBonus: z.number().min(0).max(100),
  echoDetected: z.boolean(),
  metaDetected: z.boolean(),
  liveMultiplier: z.number().positive(),
  shadowMultiplier: z.number().positive(),
  relevance: z.number().min(0).max(100).nullable(),
  novelty: z.number().min(0).max(100).nullable(),
  reframe: z.number().min(0).max(100).nullable(),
  semanticFlags: z.array(z.string().min(1)),
  riskScore: z.number().min(0).max(100),
  riskFamilies: z.array(RiskFamilySchema),
  transforms: z.array(z.string().min(1)),
  agreementNovDampenLive: z.number().positive(),
  agreementNovDampenShadow: z.number().positive(),
  heuristic: HeuristicScoreDetailsSchema,
  roleAnalysis: RoleScoreDetailsSchema,
  semantic: SemanticScoreDetailsSchema,
});

export const GuardrailResultSchema = z.object({
  bodyRaw: z.string().min(1),
  bodyClean: z.string().min(1),
  decision: GuardrailDecisionSchema,
  visibility: ContributionVisibilitySchema,
  riskScore: z.number().min(0).max(100),
  matchedFamilies: z.array(RiskFamilySchema),
  restrictionMode: RestrictionModeSchema.nullable(),
  restrictionReason: z.string().nullable(),
  transforms: z.array(z.string().min(1)),
  forceMinQueue: z.boolean(),
});

export type SemanticWindowContract = z.infer<typeof SemanticWindowContractSchema>;
export type HeuristicScoreDetails = z.infer<typeof HeuristicScoreDetailsSchema>;
export type RoleScoreDetails = z.infer<typeof RoleScoreDetailsSchema>;
export type SemanticScoreDetails = z.infer<typeof SemanticScoreDetailsSchema>;
export type ContributionScoreDetails = z.infer<typeof ContributionScoreDetailsSchema>;
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;
