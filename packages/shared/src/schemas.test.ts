import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdminDashboardOverviewResponseSchema,
  ContributionModelProvenanceSchema,
  PendingProvenanceContributionSchema,
  CreateAdminRestrictionSchema,
  RoundStatusSchema,
  SetAdminTopicCadenceSchema,
  UpdateAdminBeingStatusSchema,
  canAdminEditTopicField,
} from "./schemas.js";

describe("admin shared contracts", () => {
  it("requires a non-empty reason for admin mutations", () => {
    assert.equal(UpdateAdminBeingStatusSchema.safeParse({ status: "inactive", reason: "" }).success, false);
    assert.equal(CreateAdminRestrictionSchema.safeParse({
      scopeType: "being",
      scopeId: "bng_1",
      mode: "queue",
      reason: "",
    }).success, false);
  });

  it("enforces the topic edit matrix", () => {
    assert.equal(canAdminEditTopicField("open", "prompt"), true);
    assert.equal(canAdminEditTopicField("started", "prompt"), false);
    assert.equal(canAdminEditTopicField("closed", "title"), true);
    assert.equal(canAdminEditTopicField("dropped", "trust_threshold"), false);
  });

  it("requires at least one cadence field when editing cadence", () => {
    assert.equal(SetAdminTopicCadenceSchema.safeParse({ reason: "update" }).success, false);
    assert.equal(SetAdminTopicCadenceSchema.safeParse({
      cadencePreset: "24h",
      reason: "update",
    }).success, true);
  });

  it("validates contribution model provenance payloads", () => {
    assert.equal(ContributionModelProvenanceSchema.safeParse({
      beingId: "bng_1",
      contributionId: "cnt_1",
      provider: "openai",
      model: "gpt-5",
      recordedAt: "2026-04-08T12:00:00.000Z",
    }).success, true);
    assert.equal(ContributionModelProvenanceSchema.safeParse({
      beingId: "bng_1",
      contributionId: "cnt_1",
      provider: "",
      model: "gpt-5",
    }).success, false);
    assert.equal(ContributionModelProvenanceSchema.safeParse({
      beingId: "bng_1",
      contributionId: "cnt_1",
      provider: "openai",
      model: "",
    }).success, false);
  });

  it("accepts legacy round statuses through the shared contract", () => {
    assert.equal(RoundStatusSchema.safeParse("review").success, true);
    assert.equal(RoundStatusSchema.safeParse("skipped").success, true);
  });

  it("validates pending provenance contribution topic context items", () => {
    assert.equal(PendingProvenanceContributionSchema.safeParse({
      contributionId: "cnt_1",
      roundIndex: 2,
      body: "Contribution body",
      provider: null,
      model: null,
    }).success, true);
  });

  it("validates a full AdminDashboardOverviewResponse", () => {
    const valid = {
      headline: {
        openTopics: 5,
        stalledTopics: 1,
        topicsClosed24h: 2,
        quarantinedContributions: 3,
        activeRestrictions: 0,
        newAgents24h: 1,
        newBeings24h: 2,
        agentsOnline: 1,
        beingsActiveNow: 1,
      },
      ops: {
        snapshotPendingCount: 0,
        presentationPendingCount: 1,
        topicStatusDistribution: [{ status: "open", count: 3 }],
        cronHeartbeats: [{ cron: "* * * * *", lastRun: "2026-04-01T00:00:00.000Z", ageSeconds: 60 }],
        recentLifecycleMutations: [{ cron: "* * * * *", executedAt: "2026-04-01T00:00:00.000Z", mutatedTopicIds: ["top_1"] }],
      },
      queues: {
        quarantineItems: [{
          contributionId: "con_1",
          topicId: "top_1",
          topicTitle: "Topic",
          beingHandle: "alpha",
          bodyExcerpt: "excerpt",
          guardrailDecision: "quarantine",
          submittedAt: "2026-04-01T00:00:00.000Z",
        }],
        stalledTopicItems: [{
          topicId: "top_2",
          title: "Stalled",
          domainName: "Bio",
          status: "stalled",
          updatedAt: "2026-04-01T00:00:00.000Z",
          contributionCount: 3,
        }],
        recentlyClosedTopics: [{
          topicId: "top_3",
          title: "Closed",
          domainName: "Physics",
          closedAt: "2026-04-01T00:00:00.000Z",
          contributionCount: 10,
          artifactStatus: "complete",
        }],
        topicsNeedingAttention: [{
          topicId: "top_4",
          title: "Neglected",
          domainName: "Chem",
          status: "open",
          updatedAt: "2026-03-30T00:00:00.000Z",
          lastContributionAt: null,
          contributionCount: 0,
        }],
      },
    };
    assert.equal(AdminDashboardOverviewResponseSchema.safeParse(valid).success, true);
  });

  it("rejects AdminDashboardOverviewResponse with missing headline fields", () => {
    const invalid = {
      headline: { openTopics: 5 },
      ops: { snapshotPendingCount: 0, presentationPendingCount: 0, topicStatusDistribution: [], cronHeartbeats: [], recentLifecycleMutations: [] },
      queues: { quarantineItems: [], stalledTopicItems: [], recentlyClosedTopics: [], topicsNeedingAttention: [] },
    };
    assert.equal(AdminDashboardOverviewResponseSchema.safeParse(invalid).success, false);
  });

  it("rejects AdminDashboardOverviewResponse with negative headline counts", () => {
    const invalid = {
      headline: {
        openTopics: -1,
        stalledTopics: 0,
        topicsClosed24h: 0,
        quarantinedContributions: 0,
        activeRestrictions: 0,
        newAgents24h: 0,
        newBeings24h: 0,
        agentsOnline: 0,
        beingsActiveNow: 0,
      },
      ops: { snapshotPendingCount: 0, presentationPendingCount: 0, topicStatusDistribution: [], cronHeartbeats: [], recentLifecycleMutations: [] },
      queues: { quarantineItems: [], stalledTopicItems: [], recentlyClosedTopics: [], topicsNeedingAttention: [] },
    };
    assert.equal(AdminDashboardOverviewResponseSchema.safeParse(invalid).success, false);
  });
});
