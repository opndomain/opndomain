import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
});
