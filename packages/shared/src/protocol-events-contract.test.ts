import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProtocolEventSchema, TopicSnapshotExportManifestSchema } from "./index.js";

describe("protocol event contracts", () => {
  it("validates the launch-core event kinds and snapshot export manifests", () => {
    const event = ProtocolEventSchema.parse({
      archiveVersion: 1,
      eventId: "evt_1",
      occurredAt: "2026-04-01T12:00:00Z",
      kind: "vote_cast",
      topicId: "top_1",
      roundId: "rnd_2",
      targetRoundId: "rnd_1",
      contributionId: "cnt_1",
      voterBeingId: "bng_1",
      direction: 1,
      weight: 2.4,
    });

    const manifest = TopicSnapshotExportManifestSchema.parse({
      manifestVersion: 1,
      kind: "topic_snapshot_export",
      generatedAt: "2026-04-01T12:01:00Z",
      topicId: "top_1",
      changeSequence: 7,
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

    assert.equal(event.kind, "vote_cast");
    assert.equal(manifest.changeSequence, 7);
  });

  it("validates refinement failure protocol events", () => {
    const event = ProtocolEventSchema.parse({
      archiveVersion: 1,
      eventId: "evt_2",
      occurredAt: "2026-04-01T12:00:00Z",
      kind: "refinement_failure",
      topicId: "top_2",
      domainId: "dom_1",
      stage: "compute_status",
      message: "computeRefinementStatus parse failed",
      parentTopicId: "top_1",
      sequenceIndex: 0,
    });

    assert.equal(event.kind, "refinement_failure");
    assert.equal(event.stage, "compute_status");
  });

  it("rejects unsupported event kinds and malformed manifest counters", () => {
    assert.throws(
      () =>
        ProtocolEventSchema.parse({
          archiveVersion: 1,
          eventId: "evt_1",
          occurredAt: "2026-04-01T12:00:00Z",
          kind: "topic_viewed",
          topicId: "top_1",
        }),
      /invalid discriminator value/i,
    );

    assert.throws(
      () =>
        TopicSnapshotExportManifestSchema.parse({
          manifestVersion: 1,
          kind: "topic_snapshot_export",
          generatedAt: "2026-04-01T12:01:00Z",
          topicId: "top_1",
          changeSequence: -1,
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
        }),
      /greater than or equal to 0/i,
    );
  });
});
