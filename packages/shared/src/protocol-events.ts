import { z } from "zod";

const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().min(1));

export const ProtocolEventKindSchema = z.enum([
  "topic_joined",
  "contribution_submitted",
  "vote_cast",
  "round_opened",
  "round_closed",
  "verdict_published",
]);

const ProtocolEventBaseSchema = z.object({
  archiveVersion: z.literal(1),
  eventId: z.string().min(1),
  occurredAt: TimestampSchema,
  kind: ProtocolEventKindSchema,
  topicId: z.string().min(1),
});

export const TopicJoinedEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("topic_joined"),
  domainId: z.string().min(1),
  beingId: z.string().min(1),
});

export const ContributionSubmittedEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("contribution_submitted"),
  domainId: z.string().min(1),
  roundId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  contributionId: z.string().min(1),
  beingId: z.string().min(1),
});

export const VoteCastEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("vote_cast"),
  roundId: z.string().min(1),
  targetRoundId: z.string().min(1),
  contributionId: z.string().min(1),
  voterBeingId: z.string().min(1),
  voteKind: z.string().min(1),
  direction: z.union([z.literal(-1), z.literal(1)]),
  weight: z.number().finite().nonnegative(),
});

export const RoundOpenedEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("round_opened"),
  domainId: z.string().min(1),
  roundId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  roundKind: z.string().min(1),
});

export const RoundClosedEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("round_closed"),
  domainId: z.string().min(1),
  roundId: z.string().min(1),
  roundIndex: z.number().int().nonnegative(),
  roundKind: z.string().min(1),
});

export const VerdictPublishedEventSchema = ProtocolEventBaseSchema.extend({
  kind: z.literal("verdict_published"),
  domainId: z.string().min(1),
  verdictId: z.string().min(1),
  confidence: z.string().min(1),
  terminalizationMode: z.string().min(1),
});

export const ProtocolEventSchema = z.discriminatedUnion("kind", [
  TopicJoinedEventSchema,
  ContributionSubmittedEventSchema,
  VoteCastEventSchema,
  RoundOpenedEventSchema,
  RoundClosedEventSchema,
  VerdictPublishedEventSchema,
]);

export const TopicSnapshotExportManifestSchema = z.object({
  manifestVersion: z.literal(1),
  kind: z.literal("topic_snapshot_export"),
  generatedAt: TimestampSchema,
  topicId: z.string().min(1),
  changeSequence: z.number().int().nonnegative(),
  sourceReason: z.string().min(1),
  transcript: z.object({
    key: z.string().min(1),
    contentType: z.literal("application/json"),
  }),
  state: z.object({
    key: z.string().min(1),
    contentType: z.literal("application/json"),
  }),
});

export type ProtocolEvent = z.infer<typeof ProtocolEventSchema>;
export type TopicSnapshotExportManifest = z.infer<typeof TopicSnapshotExportManifestSchema>;
