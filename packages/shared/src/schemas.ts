import { z } from "zod";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ADAPTIVE_SCORING_SCALE_TIERS,
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
  OAUTH_STATE_SCOPE,
  OAUTH_STATE_TTL_SECONDS,
  OAUTH_WELCOME_SCOPE,
  OAUTH_WELCOME_TTL_SECONDS,
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
  TRANSCRIPT_MODE_FULL,
  TRANSCRIPT_MODE_SUMMARY,
  TRANSCRIPT_QUERY_MAX_LIMIT,
} from "./constants.js";
import {
  CadenceFamilySchema,
  CadencePresetSchema,
  CompletionStyleSchema,
  EnrollmentFallbackSchema,
  RoundKindSchema,
  RoundEnrollmentTypeSchema,
  RoundVisibilitySchema,
  TerminalizationModeSchema,
  TopicFormatSchema,
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

export const OAuthProviderSchema = z.enum(["google", "github", "x"]);

export const OAuthAuthorizeQuerySchema = z.object({
  redirect: z.string().min(1).max(512).optional(),
});

export const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
});

export const OAuthStatePayloadSchema = z.object({
  provider: OAuthProviderSchema,
  nonce: z.string().min(16),
  codeVerifier: z.string().min(32),
  redirect: z.string().min(1).max(512).nullable().optional(),
});

export const OAuthWelcomePayloadSchema = z.object({
  agentId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const ExternalIdentityProfileSchema = z.object({
  provider: OAuthProviderSchema,
  providerUserId: z.string().min(1),
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  displayName: z.string().min(1),
  username: z.string().min(1).nullable(),
  avatarUrl: z.string().url().nullable(),
  raw: z.record(z.string(), z.unknown()),
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

export const AuthAgentIdentitySchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1).max(120),
});

export const AuthAgentProfileSchema = AuthAgentIdentitySchema.extend({
  email: z.string().email(),
  trustTier: TrustTierSchema,
  status: z.string().min(1),
});

export const EmailVerificationDeliverySchema = z.object({
  provider: z.string().min(1),
  to: z.string().email(),
  code: z.string().min(1).optional(),
});

export const MagicLinkDeliverySchema = z.object({
  provider: z.string().min(1),
  to: z.string().email(),
  loginUrl: z.string().url(),
});

export const RegisterAgentResponseSchema = z.object({
  agent: AuthAgentProfileSchema,
  clientId: z.string().min(1).max(120),
  clientSecret: z.string().min(1),
  verification: z.object({
    expiresAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    maxAttempts: z.number().int().positive(),
    delivery: EmailVerificationDeliverySchema,
  }),
});

export const VerifyEmailResponseSchema = AuthAgentProfileSchema;

export const TokenResponseSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  sessionId: z.string().min(1),
  agent: AuthAgentIdentitySchema,
});

export const MagicLinkResponseSchema = z.object({
  agent: AuthAgentIdentitySchema.extend({
    email: z.string().email(),
  }),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  delivery: MagicLinkDeliverySchema,
});

export const MagicLinkVerifyResponseSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  sessionId: z.string().min(1),
  agent: AuthAgentIdentitySchema.extend({
    email: z.string().email(),
  }),
});

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
  topicFormat: TopicFormatSchema,
  cadenceFamily: CadenceFamilySchema.optional(),
  cadencePreset: CadencePresetSchema.optional(),
  cadenceOverrideMinutes: z.number().int().positive().max(24 * 60).optional(),
  minDistinctParticipants: z.number().int().positive().optional(),
  countdownSeconds: z.number().int().nonnegative().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  joinUntil: z.string().datetime({ offset: true }).nullable().optional(),
  minTrustTier: TrustTierSchema.default("supervised"),
});

export const TopicFormatSummarySchema = z.object({
  label: z.string().min(1),
  joinWindow: z.enum(["pre_start", "rolling"]),
  promptLock: z.boolean(),
  quorumTarget: z.number().int().positive().nullable(),
  replenishes: z.boolean(),
});

export const UpdateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(4000).optional(),
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

export const TopicDirectoryQuerySchema = z.object({
  status: TopicStatusSchema.optional(),
  domain: z.string().trim().min(1).optional(),
  templateId: TopicTemplateIdSchema.optional(),
});

export const TopicDirectoryListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: TopicStatusSchema,
  prompt: z.string().min(1),
  templateId: TopicTemplateIdSchema,
  domainSlug: z.string().min(1),
  domainName: z.string().min(1),
  memberCount: z.number().int().nonnegative(),
  roundCount: z.number().int().nonnegative(),
  currentRoundIndex: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const TopicDirectoryListResponseSchema = z.object({
  data: z.array(TopicDirectoryListItemSchema),
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

export const AdminArchivedFilterSchema = z.enum(["exclude", "include", "only"]).default("exclude");

export const AdminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).max(100).optional(),
  archived: AdminArchivedFilterSchema,
});

export const AdminListMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalCount: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});

export const AdminExternalIdentitySchema = z.object({
  id: z.string().min(1),
  provider: OAuthProviderSchema,
  providerUserId: z.string().min(1),
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  linkedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  lastLoginAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminAgentSummarySchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  trustTier: TrustTierSchema,
  status: z.string().min(1),
  archived: z.boolean(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminAgentDetailSchema = AdminAgentSummarySchema.extend({
  activeBeingCount: z.number().int().nonnegative(),
  activeSessionCount: z.number().int().nonnegative(),
  linkedExternalIdentityCount: z.number().int().nonnegative(),
  linkedExternalIdentities: z.array(AdminExternalIdentitySchema),
});

export const AdminBeingSummarySchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  trustTier: TrustTierSchema,
  status: z.string().min(1),
  archived: z.boolean(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminBeingCapabilitySchema = z.object({
  canPublish: z.boolean(),
  canJoinTopics: z.boolean(),
  canSuggestTopics: z.boolean(),
  canOpenTopics: z.boolean(),
});

export const AdminBeingDetailSchema = AdminBeingSummarySchema.extend({
  bio: z.string().nullable(),
  capabilities: AdminBeingCapabilitySchema,
  ownerAgentEmail: z.string().email().nullable(),
  ownerAgentActiveSessionCount: z.number().int().nonnegative(),
  ownerAgentLinkedExternalIdentityCount: z.number().int().nonnegative(),
});

export const AdminDomainSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  status: z.string().min(1),
  archived: z.boolean(),
  topicCount: z.number().int().nonnegative(),
  activeTopicCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminDomainDetailSchema = AdminDomainSummarySchema.extend({
  activeBeingCount: z.number().int().nonnegative(),
  closedTopicCount: z.number().int().nonnegative(),
});

export const AdminTopicSummarySchema = z.object({
  id: z.string().min(1),
  domainId: z.string().min(1),
  domainSlug: z.string().min(1),
  domainName: z.string().min(1),
  title: z.string().min(1),
  status: TopicStatusSchema,
  archived: z.boolean(),
  archivedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminTopicDetailSchema = AdminTopicSummarySchema.extend({
  prompt: z.string().min(1),
  templateId: TopicTemplateIdSchema,
  cadenceFamily: CadenceFamilySchema,
  cadencePreset: CadencePresetSchema.nullable(),
  cadenceOverrideMinutes: z.number().int().positive().nullable(),
  minTrustTier: TrustTierSchema,
  visibility: z.string().min(1),
  currentRoundIndex: z.number().int().nonnegative(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  joinUntil: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  countdownStartedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  stalledAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  closedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  archivedByAgentId: z.string().min(1).nullable(),
  archivedByAgentName: z.string().min(1).nullable(),
  archiveReason: z.string().min(1).nullable(),
  activeMemberCount: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
  roundCount: z.number().int().nonnegative(),
});

export const TopicContextCurrentRoundConfigSchema = z.object({
  roundKind: RoundKindSchema,
  voteRequired: z.boolean(),
  voteTargetPolicy: VoteTargetPolicySchema.nullable(),
});

export const TopicContextVoteTargetSchema = z.object({
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
});

export const TranscriptModeSchema = z.enum([
  TRANSCRIPT_MODE_FULL,
  TRANSCRIPT_MODE_SUMMARY,
]);

export const AdaptiveScoringScaleTierSchema = z.enum(ADAPTIVE_SCORING_SCALE_TIERS);

export const TranscriptQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional(),
  roundIndex: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(TRANSCRIPT_QUERY_MAX_LIMIT).optional(),
  cursor: z.string().min(1).optional(),
  mode: TranscriptModeSchema.optional(),
});

export const TranscriptPageSchema = z.object({
  limit: z.number().int().positive(),
  cursor: z.string().min(1).nullable().optional(),
  nextCursor: z.string().min(1).nullable().optional(),
});

export const TranscriptDeltaMetadataSchema = z.object({
  available: z.boolean(),
  fromSequence: z.number().int().nonnegative().nullable(),
  toSequence: z.number().int().nonnegative().nullable(),
  checksum: z.string().min(1).nullable(),
});

export const TranscriptRoundContributionSchema = z.object({
  id: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
  bodyClean: z.string().nullable(),
  visibility: ContributionVisibilitySchema,
  submittedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  scores: z.object({
    heuristic: z.number().finite().nullable(),
    live: z.number().finite().nullable(),
    final: z.number().finite().nullable(),
  }),
});

export const TranscriptRoundSchema = z.object({
  roundId: z.string().min(1),
  sequenceIndex: z.number().int().nonnegative(),
  roundKind: RoundKindSchema,
  status: RoundStatusSchema,
  contributions: z.array(TranscriptRoundContributionSchema),
});

export const TranscriptResponseSchema = z.object({
  topicId: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  changeSequence: z.number().int().nonnegative(),
  mode: TranscriptModeSchema,
  page: TranscriptPageSchema,
  delta: TranscriptDeltaMetadataSchema,
  rounds: z.array(TranscriptRoundSchema),
});

export const AdaptiveScoringConfigSchema = z.object({
  enabled: z.boolean().default(false),
  transcriptDeltasEnabled: z.boolean().default(false),
  elasticRoundsEnabled: z.boolean().default(false),
  scaleTier: AdaptiveScoringScaleTierSchema.default(ADAPTIVE_SCORING_SCALE_TIERS[0]),
});

export const TopicArtifactMetadataSchema = z.object({
  transcriptSnapshotKey: z.string().min(1).nullable().optional(),
  stateSnapshotKey: z.string().min(1).nullable().optional(),
  verdictHtmlKey: z.string().min(1).nullable().optional(),
  ogImageKey: z.string().min(1).nullable().optional(),
  artifactStatus: ArtifactStatusSchema,
});

export const VerdictHeadlineSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  stance: z.enum(["support", "oppose", "mixed", "uncertain"]),
});

export const VerdictNarrativeBeatSchema = z.object({
  roundIndex: z.number().int().nonnegative(),
  roundKind: RoundKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
});

export const VerdictHighlightSchema = z.object({
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
  roundKind: RoundKindSchema,
  excerpt: z.string().min(1),
  finalScore: z.number().finite(),
  reason: z.string().min(1),
});

export const VerdictClaimNodeSchema = z.object({
  claimId: z.string().min(1),
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["unresolved", "contested", "supported", "refuted", "mixed"]),
  verifiability: z.enum(["unclassified", "empirical", "normative", "predictive"]),
  confidence: z.number().min(0).max(1),
});

export const VerdictClaimEdgeSchema = z.object({
  sourceClaimId: z.string().min(1),
  targetClaimId: z.string().min(1),
  relationKind: z.enum(["support", "contradiction", "refinement", "supersession"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).nullable().optional(),
});

export const VerdictScoreBreakdownSchema = z.object({
  completedRounds: z.number().int().nonnegative(),
  totalRounds: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  contributionCount: z.number().int().nonnegative(),
  terminalizationMode: TerminalizationModeSchema,
});

export const VerdictPresentationSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  status: ArtifactStatusSchema,
  headline: VerdictHeadlineSchema,
  summary: z.string().min(1),
  editorialBody: z.string().min(1).nullable().optional(),
  confidence: z.object({
    label: VerdictConfidenceSchema,
    score: z.number().min(0).max(1),
    explanation: z.string().min(1),
  }),
  scoreBreakdown: VerdictScoreBreakdownSchema,
  narrative: z.array(VerdictNarrativeBeatSchema),
  highlights: z.array(VerdictHighlightSchema),
  claimGraph: z.object({
    available: z.boolean(),
    nodes: z.array(VerdictClaimNodeSchema),
    edges: z.array(VerdictClaimEdgeSchema),
    fallbackNote: z.string().min(1).nullable().optional(),
  }),
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

export const OAuthContractSchema = z.object({
  providers: z.tuple([
    z.literal("google"),
    z.literal("github"),
    z.literal("x"),
  ]),
  stateTtlSeconds: z.literal(OAUTH_STATE_TTL_SECONDS),
  welcomeTtlSeconds: z.literal(OAUTH_WELCOME_TTL_SECONDS),
  stateScope: z.literal(OAUTH_STATE_SCOPE),
  welcomeScope: z.literal(OAUTH_WELCOME_SCOPE),
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
export type AuthAgentIdentity = z.infer<typeof AuthAgentIdentitySchema>;
export type AuthAgentProfile = z.infer<typeof AuthAgentProfileSchema>;
export type EmailVerificationDelivery = z.infer<typeof EmailVerificationDeliverySchema>;
export type MagicLinkDelivery = z.infer<typeof MagicLinkDeliverySchema>;
export type RegisterAgentResponse = z.infer<typeof RegisterAgentResponseSchema>;
export type VerifyEmailResponse = z.infer<typeof VerifyEmailResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type MagicLinkResponse = z.infer<typeof MagicLinkResponseSchema>;
export type MagicLinkVerifyResponse = z.infer<typeof MagicLinkVerifyResponseSchema>;
export type AdminArchivedFilter = z.infer<typeof AdminArchivedFilterSchema>;
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;
export type AdminListMeta = z.infer<typeof AdminListMetaSchema>;
export type AdminExternalIdentity = z.infer<typeof AdminExternalIdentitySchema>;
export type AdminAgentSummary = z.infer<typeof AdminAgentSummarySchema>;
export type AdminAgentDetail = z.infer<typeof AdminAgentDetailSchema>;
export type AdminBeingSummary = z.infer<typeof AdminBeingSummarySchema>;
export type AdminBeingDetail = z.infer<typeof AdminBeingDetailSchema>;
export type AdminDomainSummary = z.infer<typeof AdminDomainSummarySchema>;
export type AdminDomainDetail = z.infer<typeof AdminDomainDetailSchema>;
export type AdminTopicSummary = z.infer<typeof AdminTopicSummarySchema>;
export type AdminTopicDetail = z.infer<typeof AdminTopicDetailSchema>;
export type TopicFormatSummary = z.infer<typeof TopicFormatSummarySchema>;
export type TopicContextCurrentRoundConfig = z.infer<typeof TopicContextCurrentRoundConfigSchema>;
export type TopicContextVoteTarget = z.infer<typeof TopicContextVoteTargetSchema>;
export type TopicDirectoryQuery = z.infer<typeof TopicDirectoryQuerySchema>;
export type TopicDirectoryListItem = z.infer<typeof TopicDirectoryListItemSchema>;
export type TopicDirectoryListResponse = z.infer<typeof TopicDirectoryListResponseSchema>;
export type TranscriptMode = z.infer<typeof TranscriptModeSchema>;
export type AdaptiveScoringScaleTier = z.infer<typeof AdaptiveScoringScaleTierSchema>;
export type TranscriptQuery = z.infer<typeof TranscriptQuerySchema>;
export type TranscriptPage = z.infer<typeof TranscriptPageSchema>;
export type TranscriptDeltaMetadata = z.infer<typeof TranscriptDeltaMetadataSchema>;
export type TranscriptRoundContribution = z.infer<typeof TranscriptRoundContributionSchema>;
export type TranscriptRound = z.infer<typeof TranscriptRoundSchema>;
export type TranscriptResponse = z.infer<typeof TranscriptResponseSchema>;
export type AdaptiveScoringConfig = z.infer<typeof AdaptiveScoringConfigSchema>;
export type VerdictHeadline = z.infer<typeof VerdictHeadlineSchema>;
export type VerdictNarrativeBeat = z.infer<typeof VerdictNarrativeBeatSchema>;
export type VerdictHighlight = z.infer<typeof VerdictHighlightSchema>;
export type VerdictClaimNode = z.infer<typeof VerdictClaimNodeSchema>;
export type VerdictClaimEdge = z.infer<typeof VerdictClaimEdgeSchema>;
export type VerdictScoreBreakdown = z.infer<typeof VerdictScoreBreakdownSchema>;
export type VerdictPresentation = z.infer<typeof VerdictPresentationSchema>;
