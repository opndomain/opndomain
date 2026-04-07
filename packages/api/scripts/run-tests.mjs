import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import { buildClearedSessionCookie, buildSessionCookie } from "../test-dist/api/src/lib/cookies.js";
import { meetsTrustTier } from "../test-dist/api/src/lib/trust.js";
import { parseBaseEnv } from "../test-dist/shared/src/env.js";

function testSchemaContracts() {
  const schemaModuleSource = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
  const launchCoreSql = readFileSync(new URL("../src/db/001_launch_core.sql", import.meta.url), "utf8");
  const phase2Sql = readFileSync(new URL("../src/db/002_phase2_integrity.sql", import.meta.url), "utf8");
  const phase3Sql = readFileSync(new URL("../src/db/003_phase3_alignment.sql", import.meta.url), "utf8");
  const phase6Sql = readFileSync(new URL("../src/db/004_phase6_auth.sql", import.meta.url), "utf8");
  const phase7Sql = readFileSync(new URL("../src/db/005_phase7_external_oauth.sql", import.meta.url), "utf8");
  const phase8Sql = readFileSync(new URL("../src/db/006_admin_suite.sql", import.meta.url), "utf8");
  const phase9Sql = readFileSync(new URL("../src/db/007_epistemic_core.sql", import.meta.url), "utf8");
  const phase10Sql = readFileSync(new URL("../src/db/008_topic_formats.sql", import.meta.url), "utf8");
  const phase11Sql = readFileSync(new URL("../src/db/009_adaptive_scoring.sql", import.meta.url), "utf8");
  const phase12Sql = readFileSync(new URL("../src/db/010_platform_analytics.sql", import.meta.url), "utf8");
  const phase13Sql = readFileSync(new URL("../src/db/011_topic_view_reputation_history_vote_timing.sql", import.meta.url), "utf8");
  const phase14Sql = readFileSync(new URL("../src/db/012_topic_member_drop_tracking.sql", import.meta.url), "utf8");
  const phase15Sql = readFileSync(new URL("../src/db/013_topic_candidates.sql", import.meta.url), "utf8");
  const phase16Sql = readFileSync(new URL("../src/db/014_account_classes_topic_sources.sql", import.meta.url), "utf8");
  const phase17Sql = readFileSync(new URL("../src/db/015_stance_and_verdicts.sql", import.meta.url), "utf8");
  const phase18Sql = readFileSync(new URL("../src/db/016_behavioral_and_trust.sql", import.meta.url), "utf8");
  const phase19Sql = readFileSync(new URL("../src/db/017_round_instruction_overrides.sql", import.meta.url), "utf8");
  const phase20Sql = readFileSync(new URL("../src/db/018_vote_categories.sql", import.meta.url), "utf8");
  const phase21Sql = readFileSync(new URL("../src/db/019_dossier_core.sql", import.meta.url), "utf8");
  const phase22Sql = readFileSync(new URL("../src/db/020_autonomous_rolling.sql", import.meta.url), "utf8");
  const phase23Sql = readFileSync(new URL("../src/db/021_domain_groups.sql", import.meta.url), "utf8");
  const phase24Sql = readFileSync(new URL("../src/db/022_rename_debate_v2.sql", import.meta.url), "utf8");
  assert.deepEqual(
    Array.from(schemaModuleSource.matchAll(/tag: "([^"]+)"/g), (match) => match[1]),
    [
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
      "019_dossier_core",
      "020_autonomous_rolling",
      "021_domain_groups",
      "022_rename_debate_v2",
    ],
  );
  assert.match(launchCoreSql, /REFERENCES agents\(id\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
  assert.match(launchCoreSql, /account_class TEXT NOT NULL DEFAULT 'unverified_participant'/);
  assert.match(launchCoreSql, /topic_source TEXT NOT NULL DEFAULT 'manual_user'/);
  assert.match(launchCoreSql, /countdown_started_at TEXT/);
  assert.match(launchCoreSql, /stalled_at TEXT/);
  assert.match(launchCoreSql, /revoked_at TEXT/);
  assert.match(launchCoreSql, /substance_score REAL/);
  assert.match(launchCoreSql, /shadow_final_score REAL/);
  assert.match(phase2Sql, /CREATE TABLE IF NOT EXISTS email_verifications/);
  assert.match(phase2Sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_email/);
  assert.match(phase2Sql, /CREATE TRIGGER IF NOT EXISTS trg_topics_updated_at/);
  assert.match(phase3Sql, /ALTER TABLE topics ADD COLUMN min_distinct_participants INTEGER NOT NULL DEFAULT 3/);
  assert.match(phase3Sql, /direction INTEGER NOT NULL CHECK \(direction IN \(-1, 0, 1\)\)/);
  assert.match(phase3Sql, /weight REAL/);
  assert.match(phase6Sql, /CREATE TABLE IF NOT EXISTS magic_links/);
  assert.match(phase6Sql, /CREATE TRIGGER IF NOT EXISTS trg_magic_links_updated_at/);
  assert.match(phase7Sql, /CREATE TABLE IF NOT EXISTS external_identities/);
  assert.match(phase7Sql, /UNIQUE\(provider, provider_user_id\)/);
  assert.match(phase8Sql, /CREATE TABLE IF NOT EXISTS admin_audit_log/);
  assert.match(phase8Sql, /ALTER TABLE topics ADD COLUMN archived_at TEXT/);
  assert.match(phase8Sql, /ALTER TABLE topics ADD COLUMN archived_by_agent_id TEXT REFERENCES agents\(id\)/);
  assert.match(phase8Sql, /ALTER TABLE topics ADD COLUMN archive_reason TEXT/);
  assert.match(phase9Sql, /CREATE TABLE IF NOT EXISTS claims/);
  assert.match(phase9Sql, /CREATE TABLE IF NOT EXISTS claim_relations/);
  assert.match(phase9Sql, /CREATE TABLE IF NOT EXISTS claim_resolutions/);
  assert.match(phase9Sql, /CREATE TABLE IF NOT EXISTS claim_resolution_evidence/);
  assert.match(phase9Sql, /CREATE TABLE IF NOT EXISTS epistemic_reliability/);
  assert.match(phase10Sql, /ALTER TABLE topics ADD COLUMN topic_format TEXT NOT NULL DEFAULT 'scheduled_research'/);
  assert.match(phase10Sql, /ELSE 'rolling_research'/);
  assert.match(phase11Sql, /ALTER TABLE topics ADD COLUMN change_sequence INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase11Sql, /ALTER TABLE topics ADD COLUMN active_participant_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase12Sql, /CREATE TABLE IF NOT EXISTS platform_daily_rollups/);
  assert.match(phase12Sql, /rollup_date TEXT NOT NULL UNIQUE/);
  assert.match(phase12Sql, /active_agents INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase12Sql, /CREATE TRIGGER IF NOT EXISTS trg_platform_daily_rollups_updated_at/);
  assert.match(phase13Sql, /ALTER TABLE topics ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase13Sql, /CREATE TABLE IF NOT EXISTS domain_reputation_history/);
  assert.match(phase13Sql, /ALTER TABLE votes ADD COLUMN vote_position_pct REAL/);
  assert.match(phase13Sql, /ALTER TABLE votes ADD COLUMN round_elapsed_pct REAL/);
  assert.match(phase14Sql, /ALTER TABLE topic_members ADD COLUMN dropped_at TEXT/);
  assert.match(phase14Sql, /ALTER TABLE beings ADD COLUMN drop_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(phase15Sql, /CREATE TABLE IF NOT EXISTS topic_candidates/);
  assert.match(phase15Sql, /status IN \('approved', 'consumed', 'failed'\)/);
  assert.match(phase15Sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_candidates_source_id/);
  assert.match(phase16Sql, /ALTER TABLE agents ADD COLUMN account_class TEXT NOT NULL DEFAULT 'unverified_participant'/);
  assert.match(phase16Sql, /ALTER TABLE topics ADD COLUMN topic_source TEXT NOT NULL DEFAULT 'manual_user'/);
  assert.match(phase16Sql, /WHEN 'cron_auto' THEN 'unverified'/);
  assert.match(phase17Sql, /ALTER TABLE contributions ADD COLUMN stance TEXT/);
  assert.match(phase17Sql, /ALTER TABLE contributions ADD COLUMN target_contribution_id TEXT/);
  assert.match(phase17Sql, /ALTER TABLE verdicts ADD COLUMN verdict_outcome TEXT/);
  assert.match(phase17Sql, /ALTER TABLE verdicts ADD COLUMN positions_json TEXT/);
  assert.match(phase17Sql, /idx_contributions_target/);
  assert.match(phase17Sql, /idx_contributions_topic_stance/);
  assert.match(phase18Sql, /CREATE TABLE IF NOT EXISTS being_behavioral_scores/);
  assert.match(phase18Sql, /UNIQUE\(being_id, dimension, round_kind\)/);
  assert.match(phase18Sql, /CREATE TABLE IF NOT EXISTS trust_promotion_log/);
  assert.match(phase18Sql, /idx_trust_promotion_log_being/);
  assert.match(phase19Sql, /CREATE TABLE IF NOT EXISTS round_instruction_overrides/);
  assert.match(phase19Sql, /PRIMARY KEY \(template_id, sequence_index\)/);
  assert.match(phase20Sql, /vote_kind TEXT NOT NULL DEFAULT 'legacy'/);
  assert.match(phase20Sql, /UNIQUE\(round_id, vote_kind, contribution_id, voter_being_id\)/);
  assert.match(phase20Sql, /CREATE TABLE IF NOT EXISTS fabrication_flags/);
  assert.match(phase20Sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_kind_per_voter_per_round/);
  assert.match(phase24Sql, /UPDATE topics/);
  assert.match(phase24Sql, /UPDATE topic_candidates/);
  assert.match(phase24Sql, /UPDATE round_instruction_overrides/);
}

function testBaseEnvParsing() {
  const defaults = parseBaseEnv({});
  assert.equal(defaults.ENABLE_EPISTEMIC_SCORING, false);

  const enabled = parseBaseEnv({ ENABLE_EPISTEMIC_SCORING: "true" });
  assert.equal(enabled.ENABLE_EPISTEMIC_SCORING, true);
}

function testTrustAndCookies() {
  assert.equal(meetsTrustTier("supervised", "supervised"), true);
  assert.equal(meetsTrustTier("trusted", "verified"), true);
  assert.equal(meetsTrustTier("unverified", "supervised"), false);

  const env = {
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    WEB_SESSION_TTL_SECONDS: 604800,
  };
  const cookie = buildSessionCookie(env, "session_123");
  assert.match(cookie, /opn_session=session_123/);
  assert.match(cookie, /Domain=.opndomain.com/);
  assert.match(cookie, /Max-Age=604800/);
  assert.match(cookie, /SameSite=Lax/);

  const clearedCookie = buildClearedSessionCookie(env);
  assert.match(clearedCookie, /Max-Age=0/);
  assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
}

class FakePreparedStatement {
  constructor(sql, db) {
    this.sql = sql;
    this.db = db;
    this.bound = [];
  }

  bind(...bindings) {
    this.bound = bindings;
    return this;
  }

  async all() {
    return { results: this.db.consumeAll(this.sql) };
  }

  async first() {
    return this.db.consumeFirst(this.sql);
  }
}

class FakeDb {
  constructor() {
    this.executedBatches = [];
    this.allQueue = new Map();
    this.firstQueue = new Map();
  }

  queueAll(sqlFragment, rows) {
    this.allQueue.set(sqlFragment, rows);
  }

  queueFirst(sqlFragment, rows) {
    this.firstQueue.set(sqlFragment, rows);
  }

  prepare(sql) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(statements) {
    this.executedBatches.push(
      statements.map((statement) => ({ sql: statement.sql, bindings: statement.bound })),
    );
    return [];
  }

  consumeAll(sql) {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return [];
    }
    this.allQueue.delete(entry[0]);
    return entry[1];
  }

  consumeFirst(sql) {
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows;
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }
}

function testLifecycleSourceContracts() {
  const lifecycleSource = readFileSync(new URL("../src/services/lifecycle.ts", import.meta.url), "utf8");
  const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.match(lifecycleSource, /status IN \('open', 'countdown'\)/);
  assert.match(lifecycleSource, /DEFAULT_TOPIC_MIN_DISTINCT_PARTICIPANTS/);
  assert.match(lifecycleSource, /COUNT\(\*\) AS participant_count/);
  assert.match(lifecycleSource, /UPDATE topics SET status = 'countdown'/);
  assert.match(lifecycleSource, /UPDATE topics SET status = 'started', current_round_index = 0/);
  assert.match(lifecycleSource, /UPDATE topics SET status = 'closed', closed_at = \?/);
  assert.match(lifecycleSource, /UPDATE topics SET status = 'stalled', stalled_at = \?/);
  assert.match(lifecycleSource, /mutatedTopicIds/);
  assert.match(indexSource, /MATCHMAKING_SWEEP_CRON/);
  assert.match(indexSource, /ROUND_AUTO_ADVANCE_SWEEP_CRON/);
  assert.match(indexSource, /PHASE5_MAINTENANCE_STUB_CRON/);
  assert.match(indexSource, /syncTopicSnapshots\(env, topicId, "lifecycle_sweep"\)/);
  assert.match(indexSource, /queueSnapshotRetry\(env, topicId, "lifecycle_sweep"\)/);
}

function collectTestFiles(rootDir) {
  const paths = [];
  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      paths.push(...collectTestFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".test.js")) {
      paths.push(fullPath);
    }
  }
  return paths;
}

function copySchemaSqlFixtures() {
  const targetDir = fileURLToPath(new URL("../test-dist/api/src/db", import.meta.url));
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(
    fileURLToPath(new URL("../src/db/001_launch_core.sql", import.meta.url)),
    join(targetDir, "001_launch_core.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/002_phase2_integrity.sql", import.meta.url)),
    join(targetDir, "002_phase2_integrity.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/003_phase3_alignment.sql", import.meta.url)),
    join(targetDir, "003_phase3_alignment.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/004_phase6_auth.sql", import.meta.url)),
    join(targetDir, "004_phase6_auth.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/005_phase7_external_oauth.sql", import.meta.url)),
    join(targetDir, "005_phase7_external_oauth.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/006_admin_suite.sql", import.meta.url)),
    join(targetDir, "006_admin_suite.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/007_epistemic_core.sql", import.meta.url)),
    join(targetDir, "007_epistemic_core.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/008_topic_formats.sql", import.meta.url)),
    join(targetDir, "008_topic_formats.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/009_adaptive_scoring.sql", import.meta.url)),
    join(targetDir, "009_adaptive_scoring.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/010_platform_analytics.sql", import.meta.url)),
    join(targetDir, "010_platform_analytics.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/011_topic_view_reputation_history_vote_timing.sql", import.meta.url)),
    join(targetDir, "011_topic_view_reputation_history_vote_timing.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/012_topic_member_drop_tracking.sql", import.meta.url)),
    join(targetDir, "012_topic_member_drop_tracking.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/013_topic_candidates.sql", import.meta.url)),
    join(targetDir, "013_topic_candidates.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/014_account_classes_topic_sources.sql", import.meta.url)),
    join(targetDir, "014_account_classes_topic_sources.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/015_stance_and_verdicts.sql", import.meta.url)),
    join(targetDir, "015_stance_and_verdicts.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/016_behavioral_and_trust.sql", import.meta.url)),
    join(targetDir, "016_behavioral_and_trust.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/017_round_instruction_overrides.sql", import.meta.url)),
    join(targetDir, "017_round_instruction_overrides.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/018_vote_categories.sql", import.meta.url)),
    join(targetDir, "018_vote_categories.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/019_dossier_core.sql", import.meta.url)),
    join(targetDir, "019_dossier_core.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/020_autonomous_rolling.sql", import.meta.url)),
    join(targetDir, "020_autonomous_rolling.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/021_domain_groups.sql", import.meta.url)),
    join(targetDir, "021_domain_groups.sql"),
  );
  copyFileSync(
    fileURLToPath(new URL("../src/db/022_rename_debate_v2.sql", import.meta.url)),
    join(targetDir, "022_rename_debate_v2.sql"),
  );
}

function copyCompiledSharedRuntimeFiles() {
  const compiledSharedDir = fileURLToPath(new URL("../test-dist/shared/src", import.meta.url));
  const sharedSourceDir = fileURLToPath(new URL("../../shared/src", import.meta.url));
  const copiedFiles = [];
  for (const entry of readdirSync(compiledSharedDir)) {
    if (!entry.endsWith(".js")) {
      continue;
    }
    const targetPath = join(sharedSourceDir, entry);
    copyFileSync(join(compiledSharedDir, entry), targetPath);
    copiedFiles.push(targetPath);
  }
  return copiedFiles;
}

async function run() {
  testSchemaContracts();
  testBaseEnvParsing();
  testTrustAndCookies();
  testLifecycleSourceContracts();
  copySchemaSqlFixtures();
  const copiedFiles = copyCompiledSharedRuntimeFiles();
  try {
    const testFiles = collectTestFiles(fileURLToPath(new URL("../test-dist/api/src", import.meta.url)));
    for (const testFile of testFiles) {
      await import(pathToFileURL(testFile).href);
    }
  } finally {
    for (const copiedFile of copiedFiles) {
      unlinkSync(copiedFile);
    }
  }
  console.log("Phase 3 API self-tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
