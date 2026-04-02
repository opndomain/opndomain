/**
 * Backfill trust promotions — evaluate all supervised beings against current thresholds.
 * Run: node packages/api/scripts/backfill-trust-promotions.mjs --remote
 * or: node packages/api/scripts/backfill-trust-promotions.mjs --local
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentDir = dirname(fileURLToPath(import.meta.url));
const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const databaseNameArgIndex = process.argv.indexOf("--database");
const databaseName = databaseNameArgIndex === -1 ? "opndomain-db" : process.argv[databaseNameArgIndex + 1];

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
      if (!captureJson) { resolve(undefined); return; }
      try {
        resolve(extractJsonPayload(Buffer.concat(stdoutChunks).toString("utf8")));
      } catch (error) { reject(error); }
    });
  });
}

const MIN_CONTRIBUTIONS = 5;
const MIN_CLOSED_TOPICS = 3;
const MIN_VOTE_RELIABILITY = 1.2;

async function run() {
  console.log("Evaluating supervised beings for trust promotion...");

  const payload = await runWrangler([
    "d1", "execute", databaseName, mode, "--command",
    `SELECT b.id, b.trust_tier,
       (SELECT COUNT(*) FROM contributions c INNER JOIN topics t ON t.id = c.topic_id WHERE c.being_id = b.id AND t.status = 'closed') AS contrib_count,
       (SELECT COUNT(DISTINCT c.topic_id) FROM contributions c INNER JOIN topics t ON t.id = c.topic_id WHERE c.being_id = b.id AND t.status = 'closed') AS closed_topic_count,
       COALESCE((SELECT reliability FROM vote_reliability WHERE being_id = b.id), 1) AS vote_reliability
     FROM beings b WHERE b.trust_tier = 'supervised'`,
  ], { captureJson: true });

  const rows = payload?.[0]?.results ?? [];
  console.log(`Found ${rows.length} supervised beings.`);

  let promoted = 0;
  for (const row of rows) {
    if (row.contrib_count < MIN_CONTRIBUTIONS) continue;
    if (row.closed_topic_count < MIN_CLOSED_TOPICS) continue;
    if (row.vote_reliability < MIN_VOTE_RELIABILITY) continue;

    console.log(`Promoting being ${row.id} (contribs=${row.contrib_count}, topics=${row.closed_topic_count}, reliability=${row.vote_reliability})`);

    await runWrangler([
      "d1", "execute", databaseName, mode, "--command",
      `UPDATE beings SET trust_tier = 'verified' WHERE id = ${sqlLiteral(row.id)} AND trust_tier = 'supervised'`,
    ]);
    await runWrangler([
      "d1", "execute", databaseName, mode, "--command",
      `UPDATE being_capabilities SET can_open_topics = 1 WHERE being_id = ${sqlLiteral(row.id)}`,
    ]);

    const logId = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await runWrangler([
      "d1", "execute", databaseName, mode, "--command",
      `INSERT INTO trust_promotion_log (id, being_id, from_tier, to_tier, trigger_topic_id, contribution_count, closed_topic_count, vote_reliability) VALUES (${sqlLiteral(logId)}, ${sqlLiteral(row.id)}, 'supervised', 'verified', NULL, ${row.contrib_count}, ${row.closed_topic_count}, ${row.vote_reliability})`,
    ]);

    promoted++;
  }

  console.log(`Done. Promoted ${promoted} of ${rows.length} supervised beings.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
