import { createId } from "./ids.js";
import type { ApiEnv } from "./env.js";
import { ProtocolEventSchema, type ProtocolEvent, TopicSnapshotExportManifestSchema, type TopicSnapshotExportManifest } from "@opndomain/shared";

export type TopicStateFlushArchiveRecord = {
  archiveVersion: 1;
  kind: "topic_state_flush";
  recordedAt: string;
  topicIds: string[];
  flushedContributionIds: string[];
  contributionsPerFlush: number;
  votesPerFlush: number;
  auxRowsPerFlush: number;
  remainingCount: number;
  recomputeDurationMs: number | null;
  snapshotDurationMs: number[];
  publishedAt: string | null;
  failedSnapshotTopicIds: string[];
};

type ProtocolEventArchiveInput =
  ProtocolEvent extends infer T
    ? T extends ProtocolEvent
      ? Omit<T, "archiveVersion" | "eventId"> & { eventId?: string }
      : never
    : never;

function dayPartition(isoTimestamp: string) {
  return isoTimestamp.slice(0, 10);
}

function pathTimestamp(isoTimestamp: string) {
  return isoTimestamp.replaceAll(":", "-").replaceAll(".", "-");
}

export function topicStateFlushArchiveKey(recordedAt: string) {
  return `ops/v1/date=${dayPartition(recordedAt)}/kind=topic_state_flush/${pathTimestamp(recordedAt)}-${createId("ops")}.jsonl`;
}

export async function archiveTopicStateFlush(
  env: ApiEnv,
  record: TopicStateFlushArchiveRecord,
): Promise<string> {
  const key = topicStateFlushArchiveKey(record.recordedAt);
  if (typeof (env.SNAPSHOTS as Partial<R2Bucket> | undefined)?.put !== "function") {
    return key;
  }
  await env.SNAPSHOTS.put(key, `${JSON.stringify(record)}\n`, {
    httpMetadata: { contentType: "application/x-ndjson; charset=utf-8" },
  });
  return key;
}

export function protocolEventArchiveKey(kind: ProtocolEvent["kind"], occurredAt: string) {
  return `protocol-events/v1/date=${dayPartition(occurredAt)}/kind=${kind}/${pathTimestamp(occurredAt)}-${createId("evt")}.jsonl`;
}

export async function archiveProtocolEvent(env: ApiEnv, input: ProtocolEventArchiveInput): Promise<string> {
  const record = ProtocolEventSchema.parse({
    archiveVersion: 1,
    eventId: input.eventId ?? createId("evt"),
    ...input,
  });
  const key = protocolEventArchiveKey(record.kind, record.occurredAt);
  if (typeof (env.SNAPSHOTS as Partial<R2Bucket> | undefined)?.put !== "function") {
    return key;
  }
  await env.SNAPSHOTS.put(key, `${JSON.stringify(record)}\n`, {
    httpMetadata: { contentType: "application/x-ndjson; charset=utf-8" },
  });
  return key;
}

export function topicSnapshotExportManifestKey(topicId: string, changeSequence: number) {
  return `exports/v1/topic=${topicId}/change_sequence=${changeSequence}/manifest.json`;
}

export async function writeTopicSnapshotExportManifest(
  env: ApiEnv,
  manifest: TopicSnapshotExportManifest,
): Promise<string> {
  const parsed = TopicSnapshotExportManifestSchema.parse(manifest);
  const key = topicSnapshotExportManifestKey(parsed.topicId, parsed.changeSequence);
  if (typeof (env.SNAPSHOTS as Partial<R2Bucket> | undefined)?.put !== "function") {
    return key;
  }
  await env.SNAPSHOTS.put(key, JSON.stringify(parsed), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return key;
}
