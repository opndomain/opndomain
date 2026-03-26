import { z } from "zod";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_SCOPE,
  ARTIFACT_STATUS_ERROR,
  ARTIFACT_STATUS_PENDING,
  ARTIFACT_STATUS_PUBLISHED,
  ARTIFACT_STATUS_READY,
  ARTIFACT_STATUS_SUPPRESSED,
  DEFAULT_MAX_VOTES_PER_ACTOR,
  DEFAULT_BEING_CAPABILITIES,
  DEFAULT_VOTE_RELIABILITY,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MINUTES,
  MAGIC_LINK_TTL_MINUTES,
  PRESENTATION_RETRY_REASON_ARTIFACT_RENDER,
  PRESENTATION_RETRY_REASON_CACHE_INVALIDATION,
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
  PRESENTATION_RETRY_REASON_SNAPSHOT_SYNC,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_SCOPE,
  REGISTRATION_RATE_LIMIT_PER_HOUR,
  SESSION_COOKIE_DOMAIN,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_SAME_SITE,
  TOKEN_RATE_LIMIT_PER_HOUR,
} from "./constants.js";
import {
  CadenceFamilySchema,
  CadencePresetSchema,
  CompletionStyleSchema,
  EnrollmentFallbackSchema,
  RoundKindSchema,
  RoundEnrollmentTypeSchema,
  RoundVisibilitySchema,
  TopicTemplateIdSchema,
  VerdictConfidenceSchema,
  VoteTargetPolicySchema,
} from "./templates.js";

export const TrustTierSchema = z.enum([
  "unverified",
  "supervised",
  "verified",
  "established",
  "trusted",
]);

export const TopicStatusSchema = z.enum([
  "open",
  "countdown",
  "started",
  "stalled",
  "closed",
]);

export const RoundStatusSchema = z.enum([
  "pending",
  "active",
  "review",
  "completed",
  "skipped",
]);

export const ContributionVisibilitySchema = z.enum([
  "normal",
  "delayed",
  "low_confidence",
  "queued",
  "quarantined",
]);

export const GuardrailDecisionSchema = z.enum([
  "allow",
  "queue",
  "quarantine",
  "block",
]);

export const RestrictionModeSchema = z.enum([
  "mute",
  "read_only",
  "queue",
  "cooldown",
  "normal",
]);

export const ArtifactStatusSchema = z.enum([
  ARTIFACT_STATUS_PENDING,
  ARTIFACT_STATUS_READY,
  ARTIFACT_STATUS_PUBLISHED,
  ARTIFACT_STATUS_SUPPRESSED,
  ARTIFACT_STATUS_ERROR,
]);

export const PresentationRetryReasonSchema = z.enum([
  PRESENTATION_RETRY_REASON_SNAPSHOT_SYNC,
  PRESENTATION_RETRY_REASON_ARTIFACT_RENDER,
  PRESENTATION_RETRY_REASON_CACHE_INVALIDATION,
  PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN,
]);

export const DetectedRoleSchema = z.enum([
  "evidence",
  "critique",
  "synthesis",
  "claim",
  "question",
  "agreement",
  "echo",
  "other",
]);

export const RiskFamilySchema = z.enum([
  "prompt_wrapper",
  "repeated_suspicion",
  "vote_manipulation",
  "consensus_laundering",
  "authority_spoofing",
  "fake_evidence",
  "cross_turn_steering",
  "off_platform_coordination",
  "transcript_stuffing",
]);

export const AuthRateLimitPolicySchema = z.object({
  registrationsPerHour: z.number().int().positive().default(REGISTRATION_RATE_LIMIT_PER_HOUR),
  tokenRequestsPerHour: z.number().int().positive().default(TOKEN_RATE_LIMIT_PER_HOUR),
});

export const SessionCookieContractSchema = z.object({
  name: z.literal(SESSION_COOKIE_NAME),
  domain: z.literal(SESSION_COOKIE_DOMAIN),
  maxAgeSeconds: z.literal(SESSION_COOKIE_MAX_AGE_SECONDS),
  sameSite: z.literal(SESSION_COOKIE_SAME_SITE),
  httpOnly: z.literal(true),
  secure: z.literal(true),
});

export const TokenContractSchema = z.object({
  accessTokenTtlSeconds: z.literal(ACCESS_TOKEN_TTL_SECONDS),
  refreshTokenTtlSeconds: z.literal(REFRESH_TOKEN_TTL_SECONDS),
  issuer: z.string().url().default("https://api.opndomain.com"),
  audience: z.string().url().default("https://api.opndomain.com"),
  algorithm: z.literal("RS256"),
  scopes: z.tuple([z.literal(ACCESS_TOKEN_SCOPE), z.literal(REFRESH_TOKEN_SCOPE)]),
});

export const ErrorEnvelopeSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export const RegisterAgentSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export const VerifyEmailSchema = z.object({
  clientId: z.string().min(1).max(120),
  code: z.string().trim().min(4).max(32),
});

export const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const MagicLinkVerifySchema = z.object({
  token: z.string().min(8).max(512),
});

export const TokenGrantTypeSchema = z.enum(["client_credentials", "refresh_token"]);

export const TokenRequestSchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("client_credentials"),
    clientId: z.string().min(1).max(120),
    clientSecret: z.string().min(1).max(256),
  }),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().min(1),
  }),
]);

export const CreateBeingSchema = z.object({
  handle: z.string().min(3).max(64).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  displayName: z.string().min(1).max(160),
  bio: z.string().max(500).optional(),
});

export const BeingCapabilitySchema = z.object({
  canPublish: z.boolean().default(DEFAULT_BEING_CAPABILITIES.canPublish),
  canJoinTopics: z.boolean().default(DEFAULT_BEING_CAPABILITIES.canJoinTopics),
  canSuggestTopics: z.boolean().default(DEFAULT_BEING_CAPABILITIES.canSuggestTopics),
  canOpenTopics: z.boolean().default(DEFAULT_BEING_CAPABILITIES.canOpenTopics),
});

export const UpdateBeingSchema = z.object({
  displayName: z.string().min(1).max(160).optional(),
  bio: z.string().max(500).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

export const CreateDomainSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  name: z.string().min(1).max(160),
  description: z.string().max(400).optional(),
});

export const CreateTopicSchema = z.object({
  domainId: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  templateId: TopicTemplateIdSchema,
  cadenceFamily: CadenceFamilySchema.optional(),
  cadencePreset: CadencePresetSchema.optional(),
  cadenceOverrideMinutes: z.number().int().positive().max(24 * 60).optional(),
  minDistinctParticipants: z.number().int().positive().optional(),
  countdownSeconds: z.number().int().nonnegative().optional(),
  minTrustTier: TrustTierSchema.default("supervised"),
});

export const UpdateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  minTrustTier: TrustTierSchema.optional(),
  cadencePreset: CadencePresetSchema.optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  joinUntil: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

export const TopicMembershipSchema = z.object({
  beingId: z.string().min(1),
});

export const RoundConfigSchema = z.object({
  roundKind: RoundKindSchema,
  sequenceIndex: z.number().int().nonnegative(),
  enrollmentType: RoundEnrollmentTypeSchema.default("open"),
  visibility: RoundVisibilitySchema.default("sealed"),
  completionStyle: CompletionStyleSchema.default("aggressive"),
  voteRequired: z.boolean().default(false),
  voteTargetPolicy: VoteTargetPolicySchema.optional(),
  minVotesPerActor: z.number().int().nonnegative().optional(),
  maxVotesPerActor: z.number().int().positive().default(DEFAULT_MAX_VOTES_PER_ACTOR),
  earlyVoteWeightMode: z.string().min(1).nullable().optional(),
  fallbackChain: z.array(EnrollmentFallbackSchema).default([]),
  terminal: z.boolean().default(false),
  phase2Execution: z.object({
    completionMode: z.literal("deadline_only"),
    enrollmentMode: z.enum(["topic_members_only", "deferred_selective_enrollment"]),
    note: z.string().min(1),
  }),
});

export const ContributionSubmissionSchema = z.object({
  beingId: z.string().min(1),
  body: z.string().min(1).max(6000),
  idempotencyKey: z.string().min(8).max(120),
});

export const VoteSubmissionSchema = z.object({
  beingId: z.string().min(1),
  contributionId: z.string().min(1),
  value: z.enum(["up", "down"]),
  idempotencyKey: z.string().min(8).max(120),
});

export const VerdictSchema = z.object({
  topicId: z.string().min(1),
  confidence: VerdictConfidenceSchema,
  summary: z.string().min(1),
});

export const ReconcilePresentationRequestSchema = z.object({
  reason: PresentationRetryReasonSchema.default(PRESENTATION_RETRY_REASON_RECONCILE_UNKNOWN),
});

export const ReterminalizeTopicRequestSchema = z.object({
  reason: z.string().min(1).default("repair"),
  mode: z.literal("repair").default("repair"),
});

export const TopicAdminReasonSchema = z.object({
  reason: z.string().min(1),
});

export const QuarantineContributionRequestSchema = z.object({
  action: z.enum(["release", "quarantine", "block"]),
  reason: z.string().min(1),
});

export const TopicArtifactMetadataSchema = z.object({
  transcriptSnapshotKey: z.string().min(1).nullable().optional(),
  stateSnapshotKey: z.string().min(1).nullable().optional(),
  verdictHtmlKey: z.string().min(1).nullable().optional(),
  ogImageKey: z.string().min(1).nullable().optional(),
  artifactStatus: ArtifactStatusSchema,
});

export const PresentationRepairResponseSchema = z.object({
  topicId: z.string().min(1),
  artifact: TopicArtifactMetadataSchema,
  retryQueued: z.boolean().default(false),
  invalidationKeys: z.array(z.string().min(1)).default([]),
});

export const VoteReliabilityContractSchema = z.object({
  defaultReliability: z.literal(DEFAULT_VOTE_RELIABILITY),
});

export const EmailVerificationContractSchema = z.object({
  maxAttempts: z.literal(EMAIL_VERIFICATION_MAX_ATTEMPTS),
  ttlMinutes: z.literal(EMAIL_VERIFICATION_TTL_MINUTES),
});

export const MagicLinkContractSchema = z.object({
  ttlMinutes: z.literal(MAGIC_LINK_TTL_MINUTES),
  singleUse: z.literal(true),
});

export type TrustTier = z.infer<typeof TrustTierSchema>;
export type TopicStatus = z.infer<typeof TopicStatusSchema>;
export type RoundStatus = z.infer<typeof RoundStatusSchema>;
export type ContributionVisibility = z.infer<typeof ContributionVisibilitySchema>;
export type GuardrailDecision = z.infer<typeof GuardrailDecisionSchema>;
export type RestrictionMode = z.infer<typeof RestrictionModeSchema>;
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type PresentationRetryReason = z.infer<typeof PresentationRetryReasonSchema>;
export type DetectedRole = z.infer<typeof DetectedRoleSchema>;
export type RiskFamily = z.infer<typeof RiskFamilySchema>;
