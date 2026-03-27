import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import { buildClearedSessionCookie, buildSessionCookie } from "../test-dist/api/src/lib/cookies.js";
import { meetsTrustTier } from "../test-dist/api/src/lib/trust.js";

function testSchemaContracts() {
  const schemaModuleSource = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
  const launchCoreSql = readFileSync(new URL("../src/db/001_launch_core.sql", import.meta.url), "utf8");
  const phase2Sql = readFileSync(new URL("../src/db/002_phase2_integrity.sql", import.meta.url), "utf8");
  const phase3Sql = readFileSync(new URL("../src/db/003_phase3_alignment.sql", import.meta.url), "utf8");
  const phase6Sql = readFileSync(new URL("../src/db/004_phase6_auth.sql", import.meta.url), "utf8");
  const phase7Sql = readFileSync(new URL("../src/db/005_phase7_external_oauth.sql", import.meta.url), "utf8");
  const phase8Sql = readFileSync(new URL("../src/db/006_admin_suite.sql", import.meta.url), "utf8");
  assert.deepEqual(
    Array.from(schemaModuleSource.matchAll(/tag: "([^"]+)"/g), (match) => match[1]),
    [
      "001_launch_core",
      "002_phase2_integrity",
      "003_phase3_alignment",
      "004_phase6_auth",
      "005_phase7_external_oauth",
      "006_admin_suite",
    ],
  );
  assert.match(launchCoreSql, /REFERENCES agents\(id\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
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
