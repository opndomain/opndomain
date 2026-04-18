import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveProtocolEvent, archiveTopicStateFlush, writeTopicSnapshotExportManifest } from "./ops-archive.js";

class FakeBucket {
  calls: Array<{ key: string; body: string; contentType?: string }> = [];

  async put(key: string, body: string, options?: { httpMetadata?: { contentType?: string } }) {
    this.calls.push({
      key,
      body,
      contentType: options?.httpMetadata?.contentType,
    });
  }
}

describe("ops archive", () => {
  it("writes topic-state flush archives into the daily JSONL partition", async () => {
    const bucket = new FakeBucket();

    const key = await archiveTopicStateFlush({
      SNAPSHOTS: bucket as never,
    } as never, {
      archiveVersion: 1,
      kind: "topic_state_flush",
      recordedAt: "2026-04-01T10:11:12.000Z",
      topicIds: ["top_1"],
      flushedContributionIds: ["cnt_1"],
      contributionsPerFlush: 1,
      votesPerFlush: 0,
      auxRowsPerFlush: 0,
      remainingCount: 0,
      recomputeDurationMs: null,
      snapshotDurationMs: [12],
      publishedAt: "2026-04-01T10:11:12.000Z",
      failedSnapshotTopicIds: [],
    });

    assert.match(key, /^ops\/v1\/date=2026-04-01\/kind=topic_state_flush\/2026-04-01T10-11-12-000Z-ops_/);
    assert.equal(bucket.calls.length, 1);
    assert.equal(bucket.calls[0]?.contentType, "application/x-ndjson; charset=utf-8");
    assert.match(bucket.calls[0]?.body ?? "", /"kind":"topic_state_flush"/);
  });

  it("writes protocol events into date and kind partitions", async () => {
    const bucket = new FakeBucket();

    const key = await archiveProtocolEvent({
      SNAPSHOTS: bucket as never,
    } as never, {
      occurredAt: "2026-04-01T10:11:12.000Z",
      kind: "round_opened",
      topicId: "top_1",
      domainId: "dom_1",
      roundId: "rnd_1",
      roundIndex: 0,
      roundKind: "propose",
    });

    assert.match(key, /^protocol-events\/v1\/date=2026-04-01\/kind=round_opened\/2026-04-01T10-11-12-000Z-evt_/);
    assert.equal(bucket.calls[0]?.contentType, "application/x-ndjson; charset=utf-8");
    assert.match(bucket.calls[0]?.body ?? "", /"kind":"round_opened"/);
  });

  it("writes refinement failure events into the refinement partition", async () => {
    const bucket = new FakeBucket();

    const key = await archiveProtocolEvent({
      SNAPSHOTS: bucket as never,
    } as never, {
      occurredAt: "2026-04-01T10:11:12.000Z",
      kind: "refinement_failure",
      topicId: "top_2",
      domainId: "dom_1",
      stage: "link_child",
      message: "parent verdict parse failed",
      parentTopicId: "top_1",
    });

    assert.match(key, /^protocol-events\/v1\/date=2026-04-01\/kind=refinement_failure\/2026-04-01T10-11-12-000Z-evt_/);
    assert.equal(bucket.calls[0]?.contentType, "application/x-ndjson; charset=utf-8");
    assert.match(bucket.calls[0]?.body ?? "", /"kind":"refinement_failure"/);
  });

  it("writes snapshot export manifests as versioned json artifacts", async () => {
    const bucket = new FakeBucket();

    const key = await writeTopicSnapshotExportManifest({
      SNAPSHOTS: bucket as never,
    } as never, {
      manifestVersion: 1,
      kind: "topic_snapshot_export",
      generatedAt: "2026-04-01T10:11:12.000Z",
      topicId: "top_1",
      changeSequence: 4,
      sourceReason: "topic_state_flush",
      transcript: {
        key: "topics/top_1/transcript.json",
        contentType: "application/json",
      },
      state: {
        key: "topics/top_1/state.json",
        contentType: "application/json",
      },
      sharedContext: {
        key: "topics/top_1/shared-context.json",
        contentType: "application/json",
      },
    });

    assert.equal(key, "exports/v1/topic=top_1/change_sequence=4/manifest.json");
    assert.equal(bucket.calls[0]?.contentType, "application/json; charset=utf-8");
    assert.match(bucket.calls[0]?.body ?? "", /"kind":"topic_snapshot_export"/);
  });
});
