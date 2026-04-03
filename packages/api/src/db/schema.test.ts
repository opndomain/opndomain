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
  PHASE9_EPISTEMIC_CORE_SQL,
  PHASE10_TOPIC_FORMATS_SQL,
  PHASE11_ADAPTIVE_SCORING_SQL,
  PHASE12_PLATFORM_ANALYTICS_SQL,
  PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL,
  PHASE14_TOPIC_MEMBER_DROP_TRACKING_SQL,
  PHASE15_TOPIC_CANDIDATES_SQL,
  PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL,
  PHASE19_ROUND_INSTRUCTION_OVERRIDES_SQL,
  PHASE20_VOTE_CATEGORIES_SQL,
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
      "007_epistemic_core",
      "008_topic_formats",
      "009_adaptive_scoring",
      "010_platform_analytics",
      "011_topic_view_reputation_history_vote_timing",
      "012_topic_member_drop_tracking",
      "013_topic_candidates",
      "014_account_classes_topic_sources",
      "015_stance_and_verdicts",
      "016_behavioral_and_trust",
      "017_round_instruction_overrides",
      "018_vote_categories",
    ]);
  });

  it("keeps foreign keys and lifecycle columns in the canonical core schema", () => {
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /REFERENCES agents\(id\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS topics/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /account_class TEXT NOT NULL DEFAULT 'unverified_participant'/);
    assert.match(LAUNCH_CORE_SCHEMA_SQL, /topic_source TEXT NOT NULL DEFAULT 'manual_user'/);
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

  it("adds the epistemic foundation tables in phase 9", () => {
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TABLE IF NOT EXISTS claims/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /UNIQUE\(contribution_id, ordinal\)/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TABLE IF NOT EXISTS claim_relations/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /relation_kind IN \('support', 'contradiction', 'refinement', 'supersession'\)/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TABLE IF NOT EXISTS claim_resolutions/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /status IN \('unresolved', 'contested', 'supported', 'refuted', 'mixed'\)/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TABLE IF NOT EXISTS claim_resolution_evidence/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TABLE IF NOT EXISTS epistemic_reliability/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE INDEX IF NOT EXISTS idx_epistemic_reliability_domain/);
    assert.match(PHASE9_EPISTEMIC_CORE_SQL, /CREATE TRIGGER IF NOT EXISTS trg_epistemic_reliability_updated_at/);
  });

  it("adds authoritative topic-format persistence in phase 10", () => {
    assert.match(PHASE10_TOPIC_FORMATS_SQL, /ALTER TABLE topics ADD COLUMN topic_format TEXT NOT NULL DEFAULT 'scheduled_research';/);
    assert.match(PHASE10_TOPIC_FORMATS_SQL, /WHEN cadence_family = 'scheduled' THEN 'scheduled_research'/);
    assert.match(PHASE10_TOPIC_FORMATS_SQL, /ELSE 'rolling_research'/);
    assert.match(PHASE10_TOPIC_FORMATS_SQL, /CREATE INDEX IF NOT EXISTS idx_topics_format_status/);
  });

  it("adds adaptive scoring topic counters in phase 11", () => {
    assert.match(PHASE11_ADAPTIVE_SCORING_SQL, /ALTER TABLE topics ADD COLUMN change_sequence INTEGER NOT NULL DEFAULT 0;/);
    assert.match(PHASE11_ADAPTIVE_SCORING_SQL, /ALTER TABLE topics ADD COLUMN active_participant_count INTEGER NOT NULL DEFAULT 0;/);
  });

  it("adds platform analytics daily rollup storage in phase 12", () => {
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /CREATE TABLE IF NOT EXISTS platform_daily_rollups/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /rollup_date TEXT NOT NULL UNIQUE/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /topics_created_count INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /contributions_created_count INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /verdicts_created_count INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /active_topics INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /active_beings INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /active_agents INTEGER NOT NULL DEFAULT 0/);
    assert.match(PHASE12_PLATFORM_ANALYTICS_SQL, /CREATE TRIGGER IF NOT EXISTS trg_platform_daily_rollups_updated_at/);
  });

  it("adds topic views, reputation history, and vote timing support in phase 13", () => {
    assert.match(PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL, /ALTER TABLE topics ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;/);
    assert.match(PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL, /CREATE TABLE IF NOT EXISTS domain_reputation_history/);
    assert.match(PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL, /CREATE INDEX IF NOT EXISTS idx_domain_reputation_history_domain_being_recorded/);
    assert.match(PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL, /ALTER TABLE votes ADD COLUMN vote_position_pct REAL;/);
    assert.match(PHASE13_TOPIC_VIEW_REPUTATION_HISTORY_VOTE_TIMING_SQL, /ALTER TABLE votes ADD COLUMN round_elapsed_pct REAL;/);
  });

  it("adds topic member drop tracking in phase 14", () => {
    assert.match(PHASE14_TOPIC_MEMBER_DROP_TRACKING_SQL, /ALTER TABLE topic_members ADD COLUMN dropped_at TEXT;/);
    assert.match(PHASE14_TOPIC_MEMBER_DROP_TRACKING_SQL, /ALTER TABLE topic_members ADD COLUMN drop_reason TEXT;/);
    assert.match(PHASE14_TOPIC_MEMBER_DROP_TRACKING_SQL, /ALTER TABLE beings ADD COLUMN drop_count INTEGER NOT NULL DEFAULT 0;/);
  });

  it("adds topic candidate supply storage in phase 15", () => {
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CREATE TABLE IF NOT EXISTS topic_candidates/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /status IN \('approved', 'consumed', 'failed'\)/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CHECK \(source_id IS NOT NULL OR source_url IS NOT NULL\)/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CREATE INDEX IF NOT EXISTS idx_topic_candidates_promotable/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_id/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_url/);
    assert.match(PHASE15_TOPIC_CANDIDATES_SQL, /CREATE TRIGGER IF NOT EXISTS trg_topic_candidates_updated_at/);
  });

  it("adds round instruction overrides table in phase 19", () => {
    assert.match(PHASE19_ROUND_INSTRUCTION_OVERRIDES_SQL, /CREATE TABLE IF NOT EXISTS round_instruction_overrides/);
    assert.match(PHASE19_ROUND_INSTRUCTION_OVERRIDES_SQL, /PRIMARY KEY \(template_id, sequence_index\)/);
    assert.match(PHASE19_ROUND_INSTRUCTION_OVERRIDES_SQL, /quality_criteria_json TEXT NOT NULL DEFAULT '\[\]'/);
    assert.match(PHASE19_ROUND_INSTRUCTION_OVERRIDES_SQL, /CREATE TRIGGER IF NOT EXISTS trg_round_instruction_overrides_updated_at/);
  });

  it("adds vote_kind column and fabrication_flags table in phase 20", () => {
    assert.match(PHASE20_VOTE_CATEGORIES_SQL, /vote_kind TEXT NOT NULL DEFAULT 'legacy'/);
    assert.match(PHASE20_VOTE_CATEGORIES_SQL, /UNIQUE\(round_id, vote_kind, contribution_id, voter_being_id\)/);
    assert.match(PHASE20_VOTE_CATEGORIES_SQL, /CREATE TABLE IF NOT EXISTS fabrication_flags/);
    assert.match(PHASE20_VOTE_CATEGORIES_SQL, /CREATE INDEX IF NOT EXISTS idx_fabrication_flags_contribution/);
    assert.match(PHASE20_VOTE_CATEGORIES_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_kind_per_voter_per_round/);
  });

  it("adds persisted account classes and topic sources in phase 16", () => {
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /ALTER TABLE agents ADD COLUMN account_class TEXT NOT NULL DEFAULT 'unverified_participant';/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /WHEN email_verified_at IS NULL THEN 'unverified_participant'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /ELSE 'verified_participant'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /ALTER TABLE topics ADD COLUMN topic_source TEXT NOT NULL DEFAULT 'manual_user';/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /FROM admin_audit_log aal/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /THEN 'manual_admin'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /WHEN min_trust_tier = 'unverified' THEN 'cron_auto'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /ELSE 'manual_user'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /WHEN 'cron_auto' THEN 'unverified'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /WHEN 'manual_user' THEN 'supervised'/);
    assert.match(PHASE16_ACCOUNT_CLASSES_TOPIC_SOURCES_SQL, /WHEN 'manual_admin' THEN 'supervised'/);
  });
});
