import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const databaseNameArgIndex = process.argv.indexOf("--database");
const databaseName = databaseNameArgIndex === -1 ? "opndomain-db" : process.argv[databaseNameArgIndex + 1];
const migrationFiles = [
  { tag: "001_launch_core", fileName: "001_launch_core.sql" },
  { tag: "002_phase2_integrity", fileName: "002_phase2_integrity.sql" },
  { tag: "003_phase3_alignment", fileName: "003_phase3_alignment.sql" },
  { tag: "004_phase6_auth", fileName: "004_phase6_auth.sql" },
  { tag: "005_phase7_external_oauth", fileName: "005_phase7_external_oauth.sql" },
  { tag: "006_admin_suite", fileName: "006_admin_suite.sql" },
  { tag: "007_epistemic_core", fileName: "007_epistemic_core.sql" },
  { tag: "008_topic_formats", fileName: "008_topic_formats.sql" },
  { tag: "009_adaptive_scoring", fileName: "009_adaptive_scoring.sql" },
  { tag: "010_platform_analytics", fileName: "010_platform_analytics.sql" },
  { tag: "011_topic_view_reputation_history_vote_timing", fileName: "011_topic_view_reputation_history_vote_timing.sql" },
  { tag: "012_topic_member_drop_tracking", fileName: "012_topic_member_drop_tracking.sql" },
  { tag: "013_topic_candidates", fileName: "013_topic_candidates.sql" },
];
const migrationsTable = "schema_migrations";

if (databaseNameArgIndex !== -1 && !databaseName) {
  throw new Error("Missing value for --database. Example: --database opndomain-db-preview");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractJsonPayload(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not parse wrangler JSON output:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

async function runWrangler(args, options = {}) {
  const { captureJson = false } = options;
  return await new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const command = process.platform === "win32" ? "cmd.exe" : "wrangler";
    const commandArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", "wrangler", ...args]
      : args;
    const child = spawn(command, commandArgs, {
      cwd: join(currentDir, ".."),
      stdio: captureJson ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
      env: process.env,
    });

    if (captureJson) {
      child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    }

    child.on("exit", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        reject(new Error(stderr || `wrangler ${args.join(" ")} failed with exit code ${code ?? 1}.`));
        return;
      }

      if (!captureJson) {
        resolve(undefined);
        return;
      }

      try {
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        resolve(extractJsonPayload(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function ensureMigrationsTable() {
  await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `CREATE TABLE IF NOT EXISTS ${migrationsTable} (tag TEXT PRIMARY KEY, file_name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  ]);
}

async function migrationApplied(tag) {
  const payload = await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `SELECT tag FROM ${migrationsTable} WHERE tag = ${sqlLiteral(tag)} LIMIT 1`,
  ], { captureJson: true });
  const rows = payload?.[0]?.results ?? [];
  return rows.length > 0;
}

async function recordMigration(tag, fileName) {
  await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `INSERT INTO ${migrationsTable} (tag, file_name) VALUES (${sqlLiteral(tag)}, ${sqlLiteral(fileName)})`,
  ]);
}

async function tableExists(name) {
  const payload = await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlLiteral(name)} LIMIT 1`,
  ], { captureJson: true });
  return (payload?.[0]?.results ?? []).length > 0;
}

async function triggerExists(name) {
  const payload = await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ${sqlLiteral(name)} LIMIT 1`,
  ], { captureJson: true });
  return (payload?.[0]?.results ?? []).length > 0;
}

async function columnExists(tableName, columnName) {
  const payload = await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--command",
    `PRAGMA table_info(${tableName})`,
  ], { captureJson: true });
  return (payload?.[0]?.results ?? []).some((row) => row.name === columnName);
}

async function bootstrapKnownMigrations() {
  const knownMigrations = [
    {
      tag: "001_launch_core",
      fileName: "001_launch_core.sql",
      applied: () => tableExists("agents"),
    },
    {
      tag: "002_phase2_integrity",
      fileName: "002_phase2_integrity.sql",
      applied: () => tableExists("email_verifications"),
    },
    {
      tag: "003_phase3_alignment",
      fileName: "003_phase3_alignment.sql",
      applied: async () => await columnExists("topics", "min_distinct_participants") && await columnExists("votes", "direction"),
    },
    {
      tag: "004_phase6_auth",
      fileName: "004_phase6_auth.sql",
      applied: () => tableExists("magic_links"),
    },
    {
      tag: "005_phase7_external_oauth",
      fileName: "005_phase7_external_oauth.sql",
      applied: () => tableExists("external_identities"),
    },
    {
      tag: "006_admin_suite",
      fileName: "006_admin_suite.sql",
      applied: () => tableExists("admin_audit_log"),
    },
    {
      tag: "007_epistemic_core",
      fileName: "007_epistemic_core.sql",
      applied: () => tableExists("claims"),
    },
    {
      tag: "008_topic_formats",
      fileName: "008_topic_formats.sql",
      applied: () => columnExists("topics", "topic_format"),
    },
    {
      tag: "009_adaptive_scoring",
      fileName: "009_adaptive_scoring.sql",
      applied: async () => await columnExists("topics", "change_sequence") && await columnExists("topics", "active_participant_count"),
    },
    {
      tag: "010_platform_analytics",
      fileName: "010_platform_analytics.sql",
      applied: async () =>
        await tableExists("platform_daily_rollups")
        && await triggerExists("trg_platform_daily_rollups_updated_at"),
    },
    {
      tag: "011_topic_view_reputation_history_vote_timing",
      fileName: "011_topic_view_reputation_history_vote_timing.sql",
      applied: async () =>
        await columnExists("topics", "view_count")
        && await tableExists("domain_reputation_history")
        && await columnExists("votes", "vote_position_pct")
        && await columnExists("votes", "round_elapsed_pct"),
    },
    {
      tag: "012_topic_member_drop_tracking",
      fileName: "012_topic_member_drop_tracking.sql",
      applied: async () =>
        await columnExists("topic_members", "dropped_at")
        && await columnExists("topic_members", "drop_reason")
        && await columnExists("beings", "drop_count"),
    },
    {
      tag: "013_topic_candidates",
      fileName: "013_topic_candidates.sql",
      applied: async () =>
        await tableExists("topic_candidates")
        && await triggerExists("trg_topic_candidates_updated_at"),
    },
  ];

  for (const migration of knownMigrations) {
    if (await migrationApplied(migration.tag)) {
      continue;
    }
    if (await migration.applied()) {
      console.log(`Bootstrapping migration journal entry for ${migration.tag}.`);
      await recordMigration(migration.tag, migration.fileName);
    }
  }
}

async function run() {
  await ensureMigrationsTable();
  await bootstrapKnownMigrations();

  for (const migration of migrationFiles) {
    if (await migrationApplied(migration.tag)) {
      console.log(`Skipping already-applied migration ${migration.tag}.`);
      continue;
    }

    const sqlPath = join(currentDir, "..", "src", "db", migration.fileName);
    await runWrangler(["d1", "execute", databaseName, mode, "--file", sqlPath]);
    await recordMigration(migration.tag, migration.fileName);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
