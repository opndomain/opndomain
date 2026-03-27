import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_MIGRATIONS,
  LAUNCH_CORE_SCHEMA_SQL,
  PHASE2_INTEGRITY_SQL,
  PHASE3_ALIGNMENT_SQL,
  PHASE6_AUTH_SQL,
  PHASE7_EXTERNAL_OAUTH_SQL,
  PHASE8_ADMIN_SUITE_SQL,
} from "./schema.js";

describe("schema migrations", () => {
  it("exposes the canonical migration list in order", () => {
    assert.deepEqual(API_MIGRATIONS.map((migration) => migration.tag), [
      "001_launch_core",
      "002_phase2_integrity",
      "003_phase3_alignment",
      "004_phase6_auth",
      "005_phase7_external_oauth",
      "006_admin_suite",
    ]);
  });

  it("keeps foreign keys and lifecycle columns in the canonical core schema", () => {
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /REFERENCES agents\(id\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS topics/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /countdown_started_at TEXT/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /stalled_at TEXT/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /revoked_at TEXT/);
  });

  it("has canonical scoring columns in the launch core schema", () => {
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /substance_score REAL/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /final_score REAL/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /shadow_final_score REAL/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /shadow_recorded_at TEXT/);
  });

  it("adds email verification and updated_at triggers in phase 2 integrity", () => {
    assert.match(PHASE2_INTEGRITY_SQL, /CREATE TABLE IF NOT EXISTS email_verifications/);
    assert.match(PHASE2_INTEGRITY_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_email/);
    assert.match(PHASE2_INTEGRITY_SQL, /CREATE TRIGGER IF NOT EXISTS trg_topics_updated_at/);
    assert.match(PHASE2_INTEGRITY_SQL, /CREATE TRIGGER IF NOT EXISTS trg_email_verifications_updated_at/);
  });

  it("aligns topics quorum columns and votes direction\/weight shape in phase 3", () => {
    assert.match(PHASE3_ALIGNMENT_SQL, /ALTER TABLE topics ADD COLUMN min_distinct_participants INTEGER NOT NULL DEFAULT 3;/);
    assert.match(PHASE3_ALIGNMENT_SQL, /ALTER TABLE topics ADD COLUMN countdown_seconds INTEGER;/);
    assert.match(PHASE3_ALIGNMENT_SQL, /direction INTEGER NOT NULL CHECK \(direction IN \(-1, 0, 1\)\)/);
    assert.match(PHASE3_ALIGNMENT_SQL, /weight REAL/);
    assert.match(PHASE3_ALIGNMENT_SQL, /WHEN 'up' THEN 1/);
    assert.match(PHASE3_ALIGNMENT_SQL, /WHEN 'down' THEN -1/);
    assert.match(PHASE3_ALIGNMENT_SQL, /CREATE TRIGGER IF NOT EXISTS trg_votes_updated_at/);
  });

  it("adds magic-link auth storage in phase 6", () => {
    assert.match(PHASE6_AUTH_SQL, /CREATE TABLE IF NOT EXISTS magic_links/);
    assert.match(PHASE6_AUTH_SQL, /CREATE TRIGGER IF NOT EXISTS trg_magic_links_updated_at/);
  });

  it("adds external OAuth identity storage in phase 7", () => {
    assert.match(PHASE7_EXTERNAL_OAUTH_SQL, /CREATE TABLE IF NOT EXISTS external_identities/);
    assert.match(PHASE7_EXTERNAL_OAUTH_SQL, /CHECK \(provider IN \('google', 'github', 'x'\)\)/);
    assert.match(PHASE7_EXTERNAL_OAUTH_SQL, /UNIQUE\(provider, provider_user_id\)/);
    assert.match(PHASE7_EXTERNAL_OAUTH_SQL, /CREATE INDEX IF NOT EXISTS idx_external_identities_agent_id/);
  });

  it("adds admin audit log storage and topic archive columns in phase 8", () => {
    assert.match(PHASE8_ADMIN_SUITE_SQL, /CREATE TABLE IF NOT EXISTS admin_audit_log/);
    assert.match(PHASE8_ADMIN_SUITE_SQL, /ALTER TABLE topics ADD COLUMN archived_at TEXT;/);
    assert.match(PHASE8_ADMIN_SUITE_SQL, /ALTER TABLE topics ADD COLUMN archived_by_agent_id TEXT REFERENCES agents\(id\)/);
    assert.match(PHASE8_ADMIN_SUITE_SQL, /ALTER TABLE topics ADD COLUMN archive_reason TEXT;/);
    assert.match(PHASE8_ADMIN_SUITE_SQL, /CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_created/);
    assert.match(PHASE8_ADMIN_SUITE_SQL, /CREATE INDEX IF NOT EXISTS idx_topics_archived_at/);
  });
});
