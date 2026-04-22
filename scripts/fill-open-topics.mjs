#!/usr/bin/env node

/**
 * fill-open-topics.mjs — Discover open topics on the site and run roster
 * beings through them using run-debate-codex.mjs or run-debate.mjs.
 *
 * Usage:
 *   # Fill up to 3 open topics (default)
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json
 *
 *   # Fill a specific number
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --count 5
 *
 *   # Filter by domain
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --domain sports
 *
 *   # Fill specific topic IDs
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --topics top_abc123,top_def456
 *
 *   # Use run-debate.mjs instead of run-debate-codex.mjs
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --driver debate
 *
 *   # Dry run — list what would be filled
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --dry-run
 *
 *   # Point at local dev
 *   node scripts/fill-open-topics.mjs --roster scripts/roster.json --api-base-url http://localhost:8787
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const ROSTER_PATH = readFlag("--roster", "scripts/roster.json");
const COUNT = Number(readFlag("--count", 3));
const DOMAIN_FILTER = readFlag("--domain", null);
const TOPIC_IDS = readFlag("--topics", null);
const DRIVER = readFlag("--driver", "debate-codex"); // "debate-codex" or "debate"
const DRY_RUN = process.argv.includes("--dry-run");
const SEQUENTIAL = process.argv.includes("--sequential");
const CADENCE = readFlag("--cadence", null);
const CODEX_MODEL = readFlag("--model", null);
const CLAUDE_MODEL = readFlag("--claude-model", null);
const CODEX_AGENTS = readFlag("--codex-agents", null);

// Stances to assign to roster beings. Rotated per topic so debates
// aren't always the same configuration.
const STANCE_ROTATIONS = [
  ["support", "neutral", "oppose", "oppose", "support"],
  ["oppose", "support", "neutral", "support", "oppose"],
  ["neutral", "oppose", "support", "oppose", "neutral"],
  ["support", "oppose", "oppose", "neutral", "support"],
];

async function fetchJson(apiPath) {
  const url = `${API_BASE_URL}${apiPath}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`GET ${apiPath} returned non-JSON: ${text.slice(0, 200)}`); }
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed (${response.status}): ${parsed?.message ?? text.slice(0, 200)}`);
  }
  return parsed.data ?? parsed;
}

function buildScenario(roster, topic, stanceIndex) {
  const stances = STANCE_ROTATIONS[stanceIndex % STANCE_ROTATIONS.length];
  return {
    title: topic.title,
    prompt: topic.prompt ?? topic.title,
    domainId: topic.domainId,
    agents: roster.agents.map((agent, i) => ({
      handle: agent.handle,
      stance: stances[i % stances.length],
    })),
  };
}

function runDebate(scenarioPath, topicId) {
  const driverScript = DRIVER === "debate"
    ? "scripts/run-debate.mjs"
    : "scripts/run-debate-codex.mjs";

  const args = [driverScript, scenarioPath, "--roster", ROSTER_PATH, "--existing-topic", topicId, "--api-base-url", API_BASE_URL];
  if (CADENCE) args.push("--cadence", CADENCE);
  if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
  if (CLAUDE_MODEL) args.push("--claude-model", CLAUDE_MODEL);
  if (CODEX_AGENTS) args.push("--codex-agents", CODEX_AGENTS);

  return new Promise((resolve, reject) => {
    console.log(`  Running: node ${args.join(" ")}`);
    const proc = spawn("node", args, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env },
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`Debate driver exited with code ${code} for topic ${topicId}`));
      else resolve();
    });
    proc.on("error", reject);
  });
}

async function main() {
  // Load roster
  if (!fs.existsSync(path.resolve(ROSTER_PATH))) {
    console.error(`Roster not found at ${ROSTER_PATH}. Run setup-roster.mjs first.`);
    process.exit(1);
  }
  const roster = JSON.parse(fs.readFileSync(path.resolve(ROSTER_PATH), "utf-8"));
  console.log(`Roster: ${roster.agents.length} beings (${roster.agents.map((a) => `@${a.handle}`).join(", ")})`);
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Driver: ${DRIVER}`);
  console.log();

  // Discover topics
  let topics;
  if (TOPIC_IDS) {
    // Specific topic IDs
    const ids = TOPIC_IDS.split(",").map((s) => s.trim());
    topics = [];
    for (const id of ids) {
      try {
        const topic = await fetchJson(`/v1/topics/${id}`);
        topics.push(topic);
      } catch (err) {
        console.error(`  Failed to fetch topic ${id}: ${err.message}`);
      }
    }
  } else {
    // Discover open topics from the API
    const statusFilter = "open";
    const domainParam = DOMAIN_FILTER ? `&domain=${encodeURIComponent(DOMAIN_FILTER)}` : "";
    const result = await fetchJson(`/v1/topics?status=${statusFilter}${domainParam}`);
    topics = Array.isArray(result) ? result : [];
  }

  if (topics.length === 0) {
    console.log("No matching topics found.");
    return;
  }

  // Limit to --count
  const selected = TOPIC_IDS ? topics : topics.slice(0, COUNT);
  console.log(`Found ${topics.length} topics, selected ${selected.length}:\n`);
  for (const topic of selected) {
    const domain = topic.domainSlug ?? topic.domainId ?? "unknown";
    console.log(`  ${topic.id} [${topic.status}] ${domain} — ${topic.title}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("[DRY RUN] Would run debates for the topics above.");
    return;
  }

  // Generate temp scenario files and run debates
  const runId = Date.now().toString(36);
  const tempDir = path.resolve(`scripts/scenarios/.tmp-${runId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const jobs = [];
  for (let i = 0; i < selected.length; i++) {
    const topic = selected[i];
    const scenario = buildScenario(roster, topic, i);
    const scenarioPath = path.join(tempDir, `fill-${topic.id}.json`);
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2));
    jobs.push({ topic, scenarioPath });
  }

  if (SEQUENTIAL) {
    for (const job of jobs) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Starting: ${job.topic.title} (${job.topic.id})`);
      console.log("=".repeat(60));
      try {
        await runDebate(job.scenarioPath, job.topic.id);
        console.log(`Completed: ${job.topic.id}`);
      } catch (err) {
        console.error(`Failed: ${job.topic.id} — ${err.message}`);
      }
    }
  } else {
    console.log(`Running ${jobs.length} debates in parallel...\n`);
    const results = await Promise.allSettled(
      jobs.map((job) => runDebate(job.scenarioPath, job.topic.id)),
    );
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const topic = jobs[i].topic;
      if (result.status === "fulfilled") {
        console.log(`  ${topic.id} — completed`);
      } else {
        console.error(`  ${topic.id} — FAILED: ${result.reason?.message ?? result.reason}`);
      }
    }
  }

  // Cleanup temp scenarios after all jobs are done
  try { fs.rmSync(tempDir, { recursive: true }); } catch {}

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
