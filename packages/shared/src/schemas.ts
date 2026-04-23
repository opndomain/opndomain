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

export const AccountClassSchema = z.enum([
  "guest_participant",
  "unverified_participant",
  "verified_participant",
]);

export const EffectiveAccountClassSchema = z.enum([
  "guest_participant",
  "unverified_participant",
  "verified_participant",
  "admin_operator",
]);

export const TopicSourceSchema = z.enum([
  "cron_auto",
  "manual_user",
  "manual_admin",
]);

export const TopicStatusSchema = z.enum([
  "open",
  "countdown",
  "started",
  "stalled",
  "closed",
  "dropped",
]);

export const RoundStatusSchema = z.enum([
  "pending",
  "active",
  "completed",
  "review",
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

export const AccountLookupSchema = z.object({
  email: z.string().email(),
});

export const EmailLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const MagicLinkVerifySchema = z.object({
  token: z.string().min(8).max(512),
});

export const OAuthProviderSchema = z.enum(["google", "github", "x"]);

export const OAuthAuthorizeQuerySchema = z.object({
  redirect: z.string().min(1).max(512).optional(),
  source: z.enum(["web", "cli"]).optional(),
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
  cliSessionId: z.string().min(16).nullable().optional(),
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
  email: z.string().email().nullable(),
  emailVerified: z.boolean(),
  isGuest: z.boolean(),
  trustTier: TrustTierSchema,
  accountClass: AccountClassSchema,
  isAdmin: z.boolean(),
  effectiveAccountClass: EffectiveAccountClassSchema,
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
  agent: AuthAgentProfileSchema,
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
  agent: AuthAgentProfileSchema,
});

export const AccountLookupStatusSchema = z.enum([
  "login_required",
  "account_not_found",
  "awaiting_verification",
]);

export const AccountLookupNextActionSchema = z.enum([
  "send_magic_link",
  "register",
  "continue_as_guest",
]);

export const AccountLookupResponseSchema = z.object({
  status: AccountLookupStatusSchema,
  email: z.string().email(),
  nextActions: z.array(AccountLookupNextActionSchema),
  accountClass: AccountClassSchema.optional(),
  emailVerified: z.boolean().optional(),
  loginMethods: z.array(z.enum(["magic_link", "client_credentials", "oauth"])).default([]),
});

export const GuestBootstrapResponseSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  sessionId: z.string().min(1),
  agent: AuthAgentProfileSchema,
  being: z.object({
    id: z.string().min(1),
    handle: z.string().min(1),
    displayName: z.string().min(1),
    trustTier: TrustTierSchema,
    status: z.string().min(1),
  }),
});

export const CreateBeingSchema = z.object({
  handle: z.string().min(3).max(64).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  displayName: z.string().min(1).max(160),
  bio: z.string().max(500).optional(),
  personaText: z.string().max(8000).optional(),
  personaLabel: z.string().max(160).optional(),
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
  personaText: z.string().max(8000).nullable().optional(),
  personaLabel: z.string().max(160).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

export const BeingSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().nullable(),
  personaText: z.string().nullable(),
  personaLabel: z.string().nullable(),
  trustTier: TrustTierSchema,
  status: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const CreateDomainSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  name: z.string().min(1).max(160),
  description: z.string().max(400).optional(),
  parentDomainId: z.string().min(1).optional(),
});

const CreateTopicBaseSchema = z.object({
  domainId: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  topicFormat: TopicFormatSchema,
  cadenceFamily: CadenceFamilySchema.optional(),
  cadencePreset: CadencePresetSchema.optional(),
  cadenceOverrideMinutes: z.number().int().positive().max(24 * 60).optional(),
  minDistinctParticipants: z.number().int().positive().optional(),
  countdownSeconds: z.number().int().nonnegative().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  joinUntil: z.string().datetime({ offset: true }).nullable().optional(),
});

export const CreateTopicSchema = CreateTopicBaseSchema.extend({
  templateId: z.literal("debate"),
  beingId: z.string().min(1).optional(),
});

export const CreateInternalTopicSchema = CreateTopicBaseSchema.extend({
  templateId: TopicTemplateIdSchema,
  reason: z.string().min(1).max(500).optional(),
  topicSource: TopicSourceSchema.optional(),
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
  q: z.string().trim().min(1).optional(),
});

export const TopicDirectoryListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: TopicStatusSchema,
  topicSource: TopicSourceSchema,
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

export const ContributionStanceSchema = z.enum(["support", "oppose", "neutral"]);
export type ContributionStance = z.infer<typeof ContributionStanceSchema>;

export const VoteKindSchema = z.enum(["most_interesting", "most_correct", "fabrication", "legacy"]);
export type VoteKind = z.infer<typeof VoteKindSchema>;

export const ContributionSubmissionSchema = z.object({
  beingId: z.string().min(1),
  body: z.string().min(1).max(20000),
  idempotencyKey: z.string().min(8).max(120),
  stance: ContributionStanceSchema.optional(),
  targetContributionId: z.string().min(1).optional(),
});

export const VoteSubmissionSchema = z.object({
  beingId: z.string().min(1),
  contributionId: z.string().min(1),
  voteKind: VoteKindSchema.exclude(["legacy"]),
  idempotencyKey: z.string().min(8).max(120),
});

export const VoteBatchItemSchema = z.object({
  contributionId: z.string().min(1),
  voteKind: VoteKindSchema.exclude(["legacy"]),
  idempotencyKey: z.string().min(8).max(120),
});

export const VoteBatchSubmissionSchema = z.object({
  beingId: z.string().min(1),
  votes: z.array(VoteBatchItemSchema).min(1).max(3),
});
export type VoteBatchSubmission = z.infer<typeof VoteBatchSubmissionSchema>;

export const ContributionModelProvenanceSchema = z.object({
  beingId: z.string().min(1),
  contributionId: z.string().min(1),
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(200),
});

// --- Map round structured extraction schemas ---

export const MapPositionItemSchema = z.object({
  statement: z.string().min(1),
  heldBy: z.array(z.string().min(1)).min(1),
  classification: z.enum(["majority", "runner_up", "minority"]),
  evidenceStrength: z.string().min(1).optional(),
  keyWeakness: z.string().min(1).optional(),
}).passthrough();

export const MapRoundBodySchema = z.object({
  positions: z.array(MapPositionItemSchema).min(2).max(10),
  analysis: z.string().optional(),
}).passthrough();

export type MapPositionItem = z.infer<typeof MapPositionItemSchema>;
export type MapRoundBody = z.infer<typeof MapRoundBodySchema>;

/** Strip markdown code fences and attempt JSON → Zod parse of a map round body. */
export function tryParseMapRoundBody(text: string): MapRoundBody | null {
  try {
    const stripped = text
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
    const parsed = JSON.parse(stripped);
    const result = MapRoundBodySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const VerdictOutcomeSchema = z.enum([
  "clear_synthesis",
  "contested_synthesis",
  "emerging_synthesis",
  "insufficient_signal",
]);
export type VerdictOutcome = z.infer<typeof VerdictOutcomeSchema>;

export const VerdictPositionSchema = z.object({
  label: z.string().min(1),
  contributionIds: z.array(z.string().min(1)),
  aggregateScore: z.number(),
  stanceCounts: z.object({
    support: z.number().int().nonnegative(),
    oppose: z.number().int().nonnegative(),
    neutral: z.number().int().nonnegative(),
  }),
  strength: z.number().min(0).max(100),
  share: z.number().optional(),
  classification: z.enum(["majority", "runner_up", "minority", "noise"]).optional(),
  landingCount: z.number().int().nonnegative().optional(),
  landingHandles: z.array(z.string()).optional(),
});
export type VerdictPosition = z.infer<typeof VerdictPositionSchema>;

export const VerdictPositionsSchema = z.array(VerdictPositionSchema);

export const VerdictSchema = z.object({
  topicId: z.string().min(1),
  confidence: VerdictConfidenceSchema,
  summary: z.string().min(1),
  synthesisOutcome: VerdictOutcomeSchema.optional(),
  positions: VerdictPositionsSchema.optional(),
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

export const AdminReasonSchema = z.object({
  reason: z.string().trim().min(1).max(500),
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
  personaLabel: z.string().nullable().optional(),
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
  personaText: z.string().nullable().optional(),
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
  parentDomainId: z.string().nullable(),
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
  topicSource: TopicSourceSchema,
  archived: z.boolean(),
  archivedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  activeMemberCount: z.number().int().nonnegative().optional(),
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

export const AdminAuditLogTargetTypeSchema = z.enum([
  "being",
  "agent",
  "topic",
  "restriction",
  "session",
]);

export const AdminAuditLogQuerySchema = z.object({
  actor: z.string().trim().min(1).max(120).optional(),
  targetType: AdminAuditLogTargetTypeSchema.optional(),
  targetId: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().trim().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const AdminAuditCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  id: z.string().min(1),
});

export const AdminAuditLogEntrySchema = z.object({
  id: z.string().min(1),
  actorAgentId: z.string().min(1).nullable(),
  actorLabel: z.string().min(1).nullable(),
  action: z.string().min(1),
  targetType: AdminAuditLogTargetTypeSchema.or(z.string().min(1)),
  targetId: z.string().min(1),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminAuditMetadataSchema = z.object({
  reason: z.string().min(1),
  before: z.record(z.string(), z.unknown()).nullable().optional(),
  after: z.record(z.string(), z.unknown()).nullable().optional(),
  clearedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
}).passthrough();

export const AdminAuditLogListResponseSchema = z.object({
  items: z.array(AdminAuditLogEntrySchema),
  nextCursor: z.string().min(1).nullable(),
});

export const AdminRestrictionScopeSchema = z.enum(["being", "topic"]);

export const AdminRestrictionModeSchema = RestrictionModeSchema.exclude(["normal"]);

export const AdminRestrictionSchema = z.object({
  id: z.string().min(1),
  scopeType: AdminRestrictionScopeSchema,
  scopeId: z.string().min(1),
  mode: AdminRestrictionModeSchema,
  reason: z.string().nullable(),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const AdminRestrictionsQuerySchema = z.object({
  scopeType: AdminRestrictionScopeSchema,
  scopeId: z.string().trim().min(1).max(120),
});

export const CreateAdminRestrictionSchema = z.object({
  scopeType: AdminRestrictionScopeSchema,
  scopeId: z.string().trim().min(1).max(120),
  mode: AdminRestrictionModeSchema,
  reason: z.string().trim().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable().optional(),
});

export const ClearAdminRestrictionSchema = AdminReasonSchema;

export const AdminBeingStatusSchema = z.enum(["active", "inactive"]);

export const AdminCapabilityKeySchema = z.enum([
  "canPublish",
  "canJoinTopics",
  "canSuggestTopics",
  "canOpenTopics",
]);

export const UpdateAdminBeingCapabilitySchema = z.object({
  capability: AdminCapabilityKeySchema,
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export const UpdateAdminBeingStatusSchema = z.object({
  status: AdminBeingStatusSchema,
  reason: z.string().trim().min(1).max(500),
});

export const RevokeAdminBeingSessionsSchema = AdminReasonSchema;

export const AdminDashboardMetricsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const AdminMetricSourceSchema = z.enum(["rollup", "on_demand"]);

export const AdminDashboardSeriesPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().int().nonnegative(),
});

export const AdminDashboardSeriesMetricSchema = z.object({
  source: AdminMetricSourceSchema,
  points: z.array(AdminDashboardSeriesPointSchema),
});

export const AdminDashboardScalarMetricSchema = z.object({
  source: AdminMetricSourceSchema,
  value: z.number().int().nonnegative(),
});

export const AdminDashboardStatusCountSchema = z.object({
  status: TopicStatusSchema.or(z.string().min(1)),
  count: z.number().int().nonnegative(),
});

export const AdminDashboardMetricsResponseSchema = z.object({
  window: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  daily: z.object({
    registrations: AdminDashboardSeriesMetricSchema,
    activeBeings: AdminDashboardSeriesMetricSchema,
    activeAgents: AdminDashboardSeriesMetricSchema,
    topicsCreated: AdminDashboardSeriesMetricSchema,
    contributions: AdminDashboardSeriesMetricSchema,
    verdicts: AdminDashboardSeriesMetricSchema,
  }),
  pointInTime: z.object({
    activeTopics: AdminDashboardScalarMetricSchema,
    topicsByStatus: z.object({
      source: AdminMetricSourceSchema,
      items: z.array(AdminDashboardStatusCountSchema),
    }),
    quarantineVolume: AdminDashboardScalarMetricSchema,
    inactiveBeings: AdminDashboardScalarMetricSchema,
    revokedSessions24h: AdminDashboardScalarMetricSchema,
  }),
});

export const AdminDashboardOverviewHeadlineSchema = z.object({
  openTopics: z.number().int().nonnegative(),
  stalledTopics: z.number().int().nonnegative(),
  topicsClosed24h: z.number().int().nonnegative(),
  quarantinedContributions: z.number().int().nonnegative(),
  activeRestrictions: z.number().int().nonnegative(),
  newAgents24h: z.number().int().nonnegative(),
  newBeings24h: z.number().int().nonnegative(),
  agentsOnline: z.number().int().nonnegative(),
  beingsActiveNow: z.number().int().nonnegative(),
});

export const AdminDashboardOverviewCronHeartbeatSchema = z.object({
  cron: z.string(),
  lastRun: z.string().nullable(),
  ageSeconds: z.number().nullable(),
});

export const AdminDashboardOverviewLifecycleMutationSchema = z.object({
  cron: z.string(),
  executedAt: z.string(),
  mutatedTopicIds: z.array(z.string()),
});

export const AdminDashboardOverviewOpsSchema = z.object({
  snapshotPendingCount: z.number().int().nonnegative(),
  presentationPendingCount: z.number().int().nonnegative(),
  topicStatusDistribution: z.array(AdminDashboardStatusCountSchema),
  cronHeartbeats: z.array(AdminDashboardOverviewCronHeartbeatSchema),
  recentLifecycleMutations: z.array(AdminDashboardOverviewLifecycleMutationSchema),
});

export const AdminDashboardOverviewQuarantineItemSchema = z.object({
  contributionId: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  beingHandle: z.string(),
  bodyExcerpt: z.string(),
  guardrailDecision: z.string().nullable(),
  submittedAt: z.string(),
});

export const AdminDashboardOverviewStalledTopicSchema = z.object({
  topicId: z.string(),
  title: z.string(),
  domainName: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  contributionCount: z.number().int().nonnegative(),
});

export const AdminDashboardOverviewClosedTopicSchema = z.object({
  topicId: z.string(),
  title: z.string(),
  domainName: z.string(),
  closedAt: z.string(),
  contributionCount: z.number().int().nonnegative(),
  artifactStatus: z.string().nullable(),
});

export const AdminDashboardOverviewAttentionTopicSchema = z.object({
  topicId: z.string(),
  title: z.string(),
  domainName: z.string(),
  status: z.string(),
  updatedAt: z.string(),
  lastContributionAt: z.string().nullable(),
  contributionCount: z.number().int().nonnegative(),
});

export const AdminDashboardOverviewQueuesSchema = z.object({
  quarantineItems: z.array(AdminDashboardOverviewQuarantineItemSchema),
  stalledTopicItems: z.array(AdminDashboardOverviewStalledTopicSchema),
  recentlyClosedTopics: z.array(AdminDashboardOverviewClosedTopicSchema),
  topicsNeedingAttention: z.array(AdminDashboardOverviewAttentionTopicSchema),
});

export const AdminDashboardOverviewResponseSchema = z.object({
  headline: AdminDashboardOverviewHeadlineSchema,
  ops: AdminDashboardOverviewOpsSchema,
  queues: AdminDashboardOverviewQueuesSchema,
});

export const AdminTopicEditableFieldSchema = z.enum([
  "title",
  "prompt",
  "domain_id",
  "visibility",
  "trust_threshold",
  "cadence",
  "archive",
]);

export const AdminTopicLifecycleStatusSchema = z.enum([
  "open",
  "started",
  "countdown",
  "stalled",
  "closed",
  "dropped",
]);

const ADMIN_TOPIC_EDITABLE_FIELDS_BY_STATUS = {
  open: ["title", "prompt", "domain_id", "visibility", "trust_threshold", "cadence", "archive"],
  started: ["title", "visibility", "archive"],
  countdown: ["title", "visibility", "archive"],
  stalled: ["title", "visibility", "archive"],
  closed: ["title", "visibility", "archive"],
  dropped: ["title", "visibility", "archive"],
} as const satisfies Record<z.infer<typeof AdminTopicLifecycleStatusSchema>, readonly z.infer<typeof AdminTopicEditableFieldSchema>[]>;

export function canAdminEditTopicField(
  status: z.infer<typeof AdminTopicLifecycleStatusSchema>,
  field: z.infer<typeof AdminTopicEditableFieldSchema>,
): boolean {
  return ADMIN_TOPIC_EDITABLE_FIELDS_BY_STATUS[status].some((allowedField) => allowedField === field);
}

export const SetAdminTopicTitleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500),
});

export const SetAdminTopicVisibilitySchema = z.object({
  visibility: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
});

export const SetAdminTopicPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  reason: z.string().trim().min(1).max(500),
});

export const SetAdminTopicDomainSchema = z.object({
  domainId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
});

export const SetAdminTopicTrustThresholdSchema = z.object({
  minTrustTier: TrustTierSchema,
  reason: z.string().trim().min(1).max(500),
});

export const SetAdminTopicCadenceSchema = z.object({
  cadencePreset: CadencePresetSchema.nullable().optional(),
  cadenceOverrideMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable().optional(),
  joinUntil: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
}).refine((value) => (
  Object.prototype.hasOwnProperty.call(value, "cadencePreset")
  || Object.prototype.hasOwnProperty.call(value, "cadenceOverrideMinutes")
  || Object.prototype.hasOwnProperty.call(value, "startsAt")
  || Object.prototype.hasOwnProperty.call(value, "joinUntil")
), {
  message: "At least one cadence field must be provided.",
});

export const TopicCandidateStatusSchema = z.enum([
  "approved",
  "consumed",
  "failed",
]);

export const RefinementPositionSummarySchema = z.object({
  label: z.string().min(1),
  classification: z.enum(["majority", "runner_up", "minority", "noise"]),
});
export type RefinementPositionSummary = z.infer<typeof RefinementPositionSummarySchema>;

export const RefinementStatusSchema = z.object({
  eligible: z.boolean(),
  reason: z.string().min(1),
  whatSettled: z.string().optional(),
  whatContested: z.string().optional(),
  strongestObjection: z.string().optional(),
  neutralVerdict: z.string().optional(),
  positionSummaries: z.array(RefinementPositionSummarySchema).optional(),
});
export type RefinementStatus = z.infer<typeof RefinementStatusSchema>;

export const RefinementEligibleTopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  domainId: z.string().min(1),
  refinementDepth: z.number().int().nonnegative(),
  refinementStatus: RefinementStatusSchema,
});
export type RefinementEligibleTopic = z.infer<typeof RefinementEligibleTopicSchema>;

// A structured unresolved claim extracted from a closed verdict. Each claim
// gets a stable id so the producer can track which claims have been refined
// (promoted_topic_id is set) vs which remain open. classification is a free
// string (e.g. "contested", "minority", "methodological") so the extraction
// layer can emit whatever taxonomy it learns to produce.
export const RefinementClaimClassificationSchema = z.string().min(1).max(64);

export const ExtractedRefinementClaimSchema = z.object({
  claimText: z.string().min(1).max(2000),
  classification: RefinementClaimClassificationSchema.optional(),
  sourceQuote: z.string().min(1).max(2000).optional(),
});
export type ExtractedRefinementClaim = z.infer<typeof ExtractedRefinementClaimSchema>;

export const ExtractRefinementClaimsRequestSchema = z.object({
  topicId: z.string().min(1),
  claims: z.array(ExtractedRefinementClaimSchema).min(1).max(20),
});
export type ExtractRefinementClaimsRequest = z.infer<typeof ExtractRefinementClaimsRequestSchema>;

export const RefinementClaimRecordSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  claimText: z.string().min(1),
  classification: RefinementClaimClassificationSchema.nullable(),
  sourceQuote: z.string().nullable(),
  promotedTopicId: z.string().min(1).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});
export type RefinementClaimRecord = z.infer<typeof RefinementClaimRecordSchema>;

// An unrefined claim: parent-topic context bundled with the claim so producer
// can build a narrower prompt without a second round-trip. Returned by
// GET /v1/internal/refinement-claims/unrefined.
export const UnrefinedRefinementClaimSchema = z.object({
  claim: RefinementClaimRecordSchema,
  parentTopic: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string().min(1),
    domainId: z.string().min(1),
    refinementDepth: z.number().int().nonnegative(),
  }),
});
export type UnrefinedRefinementClaim = z.infer<typeof UnrefinedRefinementClaimSchema>;

// -----------------------------------------------------------------------------
// Knowledge-graph: typed cross-topic edges + similarity + graph response shape
// -----------------------------------------------------------------------------

export const TopicLinkTypeSchema = z.enum(["cites", "addresses_claim", "semantic_similarity"]);
export type TopicLinkType = z.infer<typeof TopicLinkTypeSchema>;

// evidence column is a JSON string in D1. This schema describes the parsed
// object; callers should JSON.parse before validating. `source` is the
// authoritative origin tag — consumers should never infer link provenance
// from link_type alone.
export const TopicLinkEvidenceSchema = z.object({
  source: z.enum(["citation_parser", "vectorize_knn", "claim_match"]),
  claimId: z.string().min(1).optional(),
  quote: z.string().min(1).max(2000).optional(),
}).passthrough();
export type TopicLinkEvidence = z.infer<typeof TopicLinkEvidenceSchema>;

export const TopicLinkSchema = z.object({
  id: z.string().min(1),
  fromTopicId: z.string().min(1),
  toTopicId: z.string().min(1),
  linkType: TopicLinkTypeSchema,
  confidence: z.number().finite().nullable(),
  evidence: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});
export type TopicLink = z.infer<typeof TopicLinkSchema>;

// Condensed topic summary returned by k-NN similarity queries. The full
// topic record is not needed for the "similar-to" UI surface.
export const SimilarTopicSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1),
  domainId: z.string().min(1),
  status: z.string().min(1),
  score: z.number().finite(),
});
export type SimilarTopic = z.infer<typeof SimilarTopicSchema>;

// Topic-graph payload assembled by the router for topic pages. Single fetch
// that bundles ancestry, children, unresolved claims, typed edges, and
// nearest-neighbor similar topics. UI-facing consumers should only read
// this shape through the shared schema.
export const TopicGraphNodeSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  refinementDepth: z.number().int().nonnegative(),
  domainId: z.string().min(1),
});
export type TopicGraphNodeSummary = z.infer<typeof TopicGraphNodeSummarySchema>;

export const TopicGraphResponseSchema = z.object({
  topic: TopicGraphNodeSummarySchema,
  ancestors: z.array(TopicGraphNodeSummarySchema),
  descendants: z.array(TopicGraphNodeSummarySchema),
  refinementClaims: z.array(RefinementClaimRecordSchema),
  links: z.object({
    outgoing: z.array(TopicLinkSchema),
    incoming: z.array(TopicLinkSchema),
  }),
  similar: z.array(SimilarTopicSchema),
});
export type TopicGraphResponse = z.infer<typeof TopicGraphResponseSchema>;

export const TopicCandidateSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(255).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  // For refinement candidates, sourceClaimId links back to the specific
  // refinement_claims row this candidate addresses. The producer sets it and
  // the promotion flow uses it to mark that claim as refined.
  sourceClaimId: z.string().min(1).max(64).nullable().optional(),
  // For refinement candidates, mergedClaimIds lists every refinement_claims
  // row this candidate covers — non-empty, includes sourceClaimId as the
  // primary, used by promotion to mark all merged siblings as refined.
  mergedClaimIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  domainId: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(4000),
  templateId: z.string().min(1).max(100),
  topicFormat: z.string().min(1).max(100).default("scheduled_research"),
  cadenceFamily: z.string().min(1).max(100),
  cadenceOverrideMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  minTrustTier: TrustTierSchema.default("supervised"),
  priorityScore: z.number().finite().default(0),
  publishedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.sourceId && !value.sourceUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceId or sourceUrl is required.",
      path: ["sourceId"],
    });
  }
  if (value.source === "vertical_refinement" && !value.sourceClaimId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceClaimId is required for refinement candidates.",
      path: ["sourceClaimId"],
    });
  }
});

export const BatchUpsertTopicCandidatesSchema = z.object({
  items: z.array(TopicCandidateSchema).min(1).max(100),
});

export const TopicCandidateQuerySchema = z.object({
  domainId: z.string().trim().min(1).optional(),
  status: TopicCandidateStatusSchema.optional(),
});

export const TopicIdeaContextQuerySchema = z.object({
  domainId: z.string().trim().min(1),
});

export const TopicCandidateSummarySchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceClaimId: z.string().nullable(),
  // Always an array. Row mappers normalize NULL / malformed DB values to [].
  mergedClaimIds: z.array(z.string()),
  domainId: z.string().min(1),
  title: z.string().min(1),
  topicFormat: z.string().min(1),
  cadenceFamily: z.string().min(1),
  cadenceOverrideMinutes: z.number().int().positive().nullable(),
  minTrustTier: TrustTierSchema,
  status: TopicCandidateStatusSchema,
  priorityScore: z.number().finite(),
  publishedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  promotedTopicId: z.string().min(1).nullable(),
  promotionError: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const TopicCandidateDetailSchema = TopicCandidateSummarySchema.extend({
  prompt: z.string().min(1),
  templateId: z.string().min(1),
});

export const TopicIdeaContextRecordSchema = z.object({
  recordKind: z.enum(["topic", "candidate"]),
  id: z.string().min(1),
  domainId: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
});

export const TopicIdeaContextResponseSchema = z.object({
  items: z.array(TopicIdeaContextRecordSchema),
});

export const TopicCandidateSourceIdentityDuplicateSchema = z.object({
  kind: z.literal("source_identity_duplicate"),
  existingRecordKind: z.literal("candidate"),
  source: z.string().min(1),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  domainId: z.string().min(1),
  existingCandidateId: z.string().min(1),
  reason: z.literal("source_identity_match"),
  matchedTitle: z.string().min(1),
});

export const TopicCandidateIdeaDuplicateCandidateSchema = z.object({
  kind: z.literal("idea_duplicate_candidate"),
  existingRecordKind: z.literal("candidate"),
  domainId: z.string().min(1),
  existingCandidateId: z.string().min(1),
  reason: z.enum([
    "exact_title_match",
    "title_similarity",
    "title_prompt_similarity",
    "comparison_family_match",
  ]),
  matchedTitle: z.string().min(1),
});

export const TopicCandidateIdeaDuplicateTopicSchema = z.object({
  kind: z.literal("idea_duplicate_topic"),
  existingRecordKind: z.literal("topic"),
  domainId: z.string().min(1),
  existingTopicId: z.string().min(1),
  reason: z.enum([
    "exact_title_match",
    "title_similarity",
    "title_prompt_similarity",
    "comparison_family_match",
  ]),
  matchedTitle: z.string().min(1),
});

export const TopicCandidateDuplicateSchema = z.discriminatedUnion("kind", [
  TopicCandidateSourceIdentityDuplicateSchema,
  TopicCandidateIdeaDuplicateCandidateSchema,
  TopicCandidateIdeaDuplicateTopicSchema,
]);

export const BatchUpsertTopicCandidatesResponseSchema = z.object({
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  duplicates: z.array(TopicCandidateDuplicateSchema),
});

export const TopicCandidateInventoryItemSchema = z.object({
  domainId: z.string().min(1),
  domainSlug: z.string().min(1),
  approvedCount: z.number().int().nonnegative(),
});

export const TopicCandidateInventoryResponseSchema = z.object({
  items: z.array(TopicCandidateInventoryItemSchema),
});

export const TopicCandidateCleanupRequestSchema = z.object({
  maxAgeDays: z.number().int().min(1).max(365).default(7),
});

export const TopicCandidateCleanupResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
});

export const RoundInstructionSchema = z.object({
  goal: z.string(),
  guidance: z.string(),
  priorRoundContext: z.string().nullable(),
  qualityCriteria: z.array(z.string()),
  votingGuidance: z.string().nullable(),
});

export const RoundInstructionOverrideRequestSchema = z.object({
  roundKind: RoundKindSchema,
  goal: z.string().min(1).max(500),
  guidance: z.string().min(1).max(2000),
  priorRoundContext: z.string().min(1).max(1000).nullable(),
  qualityCriteria: z.array(z.string().min(1).max(300)).min(1).max(10),
  votingGuidance: z.string().min(1).max(2000).nullable().optional(),
});

export const TopicContextCurrentRoundConfigSchema = z.object({
  roundKind: RoundKindSchema,
  voteRequired: z.boolean(),
  voteTargetPolicy: VoteTargetPolicySchema.nullable(),
  roundInstruction: RoundInstructionSchema.nullable(),
});

export const TopicContextRoundSchema = z.object({
  id: z.string().min(1),
  topicId: z.string().min(1),
  sequenceIndex: z.number().int().nonnegative(),
  roundKind: RoundKindSchema.or(z.string().min(1)),
  status: RoundStatusSchema.or(z.string().min(1)),
  startsAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  endsAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  revealAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const TopicContextTranscriptEntrySchema = z.object({
  id: z.string().min(1),
  roundId: z.string().min(1),
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

export const TopicContextMemberSchema = z.object({
  beingId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().nullable(),
  role: z.string().min(1),
  status: z.string().min(1),
  ownedByCurrentAgent: z.boolean(),
});

export const TopicContextOwnContributionStatusSchema = z.object({
  contributionId: z.string().min(1),
  visibility: ContributionVisibilitySchema.or(z.string().min(1)),
  submittedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export const TopicContextVoteTargetSchema = z.object({
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
  beingHandle: z.string().min(1),
  body: z.string().nullable(),
  submittedAt: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
});

export const PendingProvenanceContributionSchema = z.object({
  contributionId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  body: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

export const OwnVoteStatusSchema = z.object({
  voteId: z.string().min(1),
  contributionId: z.string().min(1),
  direction: z.number().int(),
  voteKind: VoteKindSchema,
  createdAt: z.string().min(1),
});
export type OwnVoteStatus = z.infer<typeof OwnVoteStatusSchema>;
export type ContributionModelProvenance = z.infer<typeof ContributionModelProvenanceSchema>;
export type PendingProvenanceContribution = z.infer<typeof PendingProvenanceContributionSchema>;

export const VotingObligationSchema = z.object({
  required: z.boolean(),
  minVotesPerActor: z.number().int().nonnegative(),
  votesCast: z.number().int().nonnegative(),
  votesCastByKind: z.record(VoteKindSchema, z.number().int().nonnegative()).optional(),
  missingKinds: z.array(VoteKindSchema).optional(),
  fulfilled: z.boolean(),
  dropWarning: z.string().nullable(),
});
export type VotingObligation = z.infer<typeof VotingObligationSchema>;

export const TopicContextSharedSchema = z.object({
  id: z.string().min(1),
  domainId: z.string().min(1),
  domainSlug: z.string().nullable(),
  domainName: z.string().nullable(),
  title: z.string().min(1),
  prompt: z.string().min(1),
  templateId: TopicTemplateIdSchema,
  topicFormat: TopicFormatSchema,
  topicSource: TopicSourceSchema,
  formatSummary: TopicFormatSummarySchema,
  status: TopicStatusSchema.or(z.string().min(1)),
  cadenceFamily: z.string().min(1),
  cadencePreset: CadencePresetSchema.nullable(),
  cadenceOverrideMinutes: z.number().int().positive().nullable(),
  minDistinctParticipants: z.number().int().positive(),
  countdownSeconds: z.number().int().nonnegative().nullable(),
  minTrustTier: TrustTierSchema,
  visibility: z.string().min(1),
  currentRoundIndex: z.number().int().nonnegative(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  joinUntil: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  countdownStartedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  stalledAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  closedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable(),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  rounds: z.array(TopicContextRoundSchema),
  currentRound: TopicContextRoundSchema.nullable(),
  transcript: z.array(TopicContextTranscriptEntrySchema),
  transcriptCapped: z.boolean(),
  members: z.array(TopicContextMemberSchema),
  currentRoundConfig: TopicContextCurrentRoundConfigSchema.nullable(),
});

export const TopicContextMineSchema = z.object({
  ownContributionStatus: z.array(TopicContextOwnContributionStatusSchema),
  voteTargets: z.array(TopicContextVoteTargetSchema),
  pendingProvenanceContributions: z.array(PendingProvenanceContributionSchema),
  ownVoteStatus: z.array(OwnVoteStatusSchema),
  votingObligation: VotingObligationSchema.nullable(),
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
  displayName: z.string().nullable().optional(),
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
  displayName: z.string().nullable().optional(),
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
  verifiability: z.enum(["unclassified", "empirical", "comparative", "normative", "predictive"]),
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

// --- Dossier schemas ---

export const DossierClaimConfidenceSchema = z.object({
  label: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()),
});

export const DossierEvidenceSnippetSchema = z.object({
  contributionId: z.string(),
  beingHandle: z.string(),
  evidenceKind: z.enum(["support", "challenge", "context", "correction"]),
  excerpt: z.string(),
  finalScore: z.number(),
});

export const DossierClaimSchema = z.object({
  claimId: z.string(),
  body: z.string(),
  contributionId: z.string(),
  beingHandle: z.string(),
  verifiability: z.enum(["empirical", "comparative", "normative", "predictive", "unclassified"]),
  resolutionStatus: z.enum(["unresolved", "contested", "supported", "refuted", "mixed"]),
  confidence: DossierClaimConfidenceSchema,
  evidenceCount: z.number(),
  evidence: z.array(DossierEvidenceSnippetSchema),
});

export const DossierContestedClaimSchema = DossierClaimSchema.extend({
  strongestContradiction: z.object({
    claimId: z.string(),
    body: z.string(),
    confidence: z.number(),
  }).nullable(),
});

export const DossierDataSchema = z.object({
  assembledAt: z.string(),
  assemblyMethod: z.string(),
  revision: z.number(),
  executiveSummary: z.string(),
  bestSupportedClaims: z.array(DossierClaimSchema),
  mostContestedClaims: z.array(DossierContestedClaimSchema),
  claimSectionEmpty: z.boolean(),
});

export type DossierData = z.infer<typeof DossierDataSchema>;
export type DossierClaim = z.infer<typeof DossierClaimSchema>;
export type DossierContestedClaim = z.infer<typeof DossierContestedClaimSchema>;
export type DossierEvidenceSnippet = z.infer<typeof DossierEvidenceSnippetSchema>;
export type DossierClaimConfidence = z.infer<typeof DossierClaimConfidenceSchema>;

export const VerdictPresentationSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1),
  domain: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  status: ArtifactStatusSchema,
  headline: VerdictHeadlineSchema,
  summary: z.string().min(1),
  lede: z.string().min(1).nullable().optional(),
  kicker: z.string().min(1).optional(),
  winningThesis: z.string().min(1).optional(),
  strongestObjection: z.string().min(1).optional(),
  changeMyMindStatus: z.string().min(1).optional(),
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
  synthesisOutcome: VerdictOutcomeSchema.optional(),
  positions: VerdictPositionsSchema.optional(),
  dossier: DossierDataSchema.optional(),
  minorityReports: z.array(z.object({
    contributionId: z.string().min(1),
    handle: z.string().min(1),
    displayName: z.string().nullable().optional(),
    body: z.string().min(1),
    finalScore: z.number(),
    positionLabel: z.string().min(1),
  })).optional(),
  bothSidesSummary: z.object({
    majorityCase: z.string().min(1),
    counterArgument: z.string().min(1),
    finalVerdict: z.string().min(1),
  }).optional(),
});

export const VerdictFetchResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("published"), verdict: VerdictPresentationSchema }),
  z.object({ status: z.literal("pending"), topicStatus: TopicStatusSchema, artifactStatus: ArtifactStatusSchema.nullable() }),
  z.object({ status: z.literal("unavailable") }),
]);

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
export type AccountClass = z.infer<typeof AccountClassSchema>;
export type EffectiveAccountClass = z.infer<typeof EffectiveAccountClassSchema>;
export type TopicSource = z.infer<typeof TopicSourceSchema>;
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
export type AccountLookupStatus = z.infer<typeof AccountLookupStatusSchema>;
export type AccountLookupNextAction = z.infer<typeof AccountLookupNextActionSchema>;
export type AccountLookupResponse = z.infer<typeof AccountLookupResponseSchema>;
export type GuestBootstrapResponse = z.infer<typeof GuestBootstrapResponseSchema>;
export type Being = z.infer<typeof BeingSchema>;
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
export type AdminAuditLogQuery = z.infer<typeof AdminAuditLogQuerySchema>;
export type AdminAuditCursor = z.infer<typeof AdminAuditCursorSchema>;
export type AdminAuditLogEntry = z.infer<typeof AdminAuditLogEntrySchema>;
export type AdminAuditLogListResponse = z.infer<typeof AdminAuditLogListResponseSchema>;
export type AdminAuditLogTargetType = z.infer<typeof AdminAuditLogTargetTypeSchema>;
export type AdminAuditMetadata = z.infer<typeof AdminAuditMetadataSchema>;
export type AdminRestrictionScope = z.infer<typeof AdminRestrictionScopeSchema>;
export type AdminRestrictionMode = z.infer<typeof AdminRestrictionModeSchema>;
export type AdminRestriction = z.infer<typeof AdminRestrictionSchema>;
export type AdminRestrictionsQuery = z.infer<typeof AdminRestrictionsQuerySchema>;
export type CreateAdminRestriction = z.infer<typeof CreateAdminRestrictionSchema>;
export type AdminBeingStatus = z.infer<typeof AdminBeingStatusSchema>;
export type AdminCapabilityKey = z.infer<typeof AdminCapabilityKeySchema>;
export type UpdateAdminBeingCapability = z.infer<typeof UpdateAdminBeingCapabilitySchema>;
export type UpdateAdminBeingStatus = z.infer<typeof UpdateAdminBeingStatusSchema>;
export type AdminDashboardMetricsQuery = z.infer<typeof AdminDashboardMetricsQuerySchema>;
export type AdminDashboardSeriesPoint = z.infer<typeof AdminDashboardSeriesPointSchema>;
export type AdminDashboardMetricsResponse = z.infer<typeof AdminDashboardMetricsResponseSchema>;
export type AdminDashboardOverviewResponse = z.infer<typeof AdminDashboardOverviewResponseSchema>;
export type AdminDashboardOverviewHeadline = z.infer<typeof AdminDashboardOverviewHeadlineSchema>;
export type AdminDashboardOverviewOps = z.infer<typeof AdminDashboardOverviewOpsSchema>;
export type AdminDashboardOverviewQueues = z.infer<typeof AdminDashboardOverviewQueuesSchema>;
export type AdminDashboardOverviewQuarantineItem = z.infer<typeof AdminDashboardOverviewQuarantineItemSchema>;
export type AdminDashboardOverviewStalledTopic = z.infer<typeof AdminDashboardOverviewStalledTopicSchema>;
export type AdminDashboardOverviewClosedTopic = z.infer<typeof AdminDashboardOverviewClosedTopicSchema>;
export type AdminDashboardOverviewAttentionTopic = z.infer<typeof AdminDashboardOverviewAttentionTopicSchema>;
export type AdminTopicEditableField = z.infer<typeof AdminTopicEditableFieldSchema>;
export type AdminTopicLifecycleStatus = z.infer<typeof AdminTopicLifecycleStatusSchema>;
export type TopicCandidateStatus = z.infer<typeof TopicCandidateStatusSchema>;
export type TopicCandidate = z.infer<typeof TopicCandidateSchema>;
export type TopicCandidateQuery = z.infer<typeof TopicCandidateQuerySchema>;
export type TopicIdeaContextQuery = z.infer<typeof TopicIdeaContextQuerySchema>;
export type TopicCandidateSummary = z.infer<typeof TopicCandidateSummarySchema>;
export type TopicCandidateDetail = z.infer<typeof TopicCandidateDetailSchema>;
export type TopicIdeaContextRecord = z.infer<typeof TopicIdeaContextRecordSchema>;
export type TopicIdeaContextResponse = z.infer<typeof TopicIdeaContextResponseSchema>;
export type TopicCandidateDuplicate = z.infer<typeof TopicCandidateDuplicateSchema>;
export type BatchUpsertTopicCandidatesResponse = z.infer<typeof BatchUpsertTopicCandidatesResponseSchema>;
export type TopicCandidateInventoryItem = z.infer<typeof TopicCandidateInventoryItemSchema>;
export type TopicCandidateInventoryResponse = z.infer<typeof TopicCandidateInventoryResponseSchema>;
export type TopicCandidateCleanupRequest = z.infer<typeof TopicCandidateCleanupRequestSchema>;
export type TopicCandidateCleanupResponse = z.infer<typeof TopicCandidateCleanupResponseSchema>;
export type TopicFormatSummary = z.infer<typeof TopicFormatSummarySchema>;
export type TopicContextCurrentRoundConfig = z.infer<typeof TopicContextCurrentRoundConfigSchema>;
export type TopicContextRound = z.infer<typeof TopicContextRoundSchema>;
export type TopicContextTranscriptEntry = z.infer<typeof TopicContextTranscriptEntrySchema>;
export type TopicContextMember = z.infer<typeof TopicContextMemberSchema>;
export type TopicContextOwnContributionStatus = z.infer<typeof TopicContextOwnContributionStatusSchema>;
export type TopicContextVoteTarget = z.infer<typeof TopicContextVoteTargetSchema>;
export type TopicContextShared = z.infer<typeof TopicContextSharedSchema>;
export type TopicContextMine = z.infer<typeof TopicContextMineSchema>;
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
export type VerdictFetchResponse = z.infer<typeof VerdictFetchResponseSchema>;

export type TopicWebSocketEvent =
  | { type: "round_opened"; topicId: string; roundId: string; roundKind: string; sequenceIndex: number }
  | { type: "round_closed"; topicId: string; roundId: string; roundKind: string; sequenceIndex: number }
  | { type: "topic_closed"; topicId: string }
  | { type: "topic_stalled"; topicId: string }
  | { type: "pong" };
