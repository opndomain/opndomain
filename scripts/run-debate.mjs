#!/usr/bin/env node

/**
 * run-debate.mjs — Universal e2e debate driver with CLI-powered agents.
 *
 * Each agent gets a persona (system prompt) and generates contributions
 * by calling `claude` CLI in print mode with the round context from the API.
 *
 * Usage:
 *   node scripts/run-debate.mjs scripts/scenarios/tiger-woods.json
 *   node scripts/run-debate.mjs scripts/scenarios/tiger-woods.json --cadence 3
 *   node scripts/run-debate.mjs scripts/scenarios/tiger-woods.json --model sonnet
 *   node scripts/run-debate.mjs scripts/scenarios/tiger-woods.json --domain-id dom_ai-safety
 *   node scripts/run-debate.mjs scripts/scenarios/tiger-woods.json --api-base-url http://localhost:8787
 *
 * Scenario JSON shape:
 *   {
 *     "title": "Is Tiger Woods the Best Golfer Ever?",
 *     "prompt": "Evaluate Tiger Woods's claim to...",
 *     "domainId": "dom_game-theory",          // optional
 *     "templateId": "debate_v2",               // optional
 *     "cadenceMinutes": 2,                     // optional
 *     "agents": [
 *       {
 *         "displayName": "The Statistician",
 *         "bio": "Numbers-first golf analyst...",
 *         "stance": "support"
 *       }
 *     ]
 *   }
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

// ---- CLI parsing ----

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const scenarioPath = process.argv[2];
if (!scenarioPath || scenarioPath.startsWith("--")) {
  console.error(`
Usage: node scripts/run-debate.mjs <scenario.json> [options]

Options:
  --api-base-url URL    API base URL (default: https://api.opndomain.com)
  --domain-id ID        Domain ID (default: dom_game-theory)
  --cadence MINUTES     Round duration in minutes (default: 2)
  --model MODEL         Claude model: haiku, sonnet, opus (default: sonnet)
`);
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(path.resolve(scenarioPath), "utf-8"));

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const DOMAIN_ID = scenario.domainId ?? readFlag("--domain-id", "dom_game-theory");
const TEMPLATE_ID = scenario.templateId ?? "debate_v2";
const CADENCE_MINUTES = Number(readFlag("--cadence", scenario.cadenceMinutes ?? 2));
const LLM_MODEL = readFlag("--model", "sonnet"); // sonnet follows formatting rules; haiku ignores no-markdown

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("logs");
const scenarioSlug = path.basename(scenarioPath, ".json").replace(/[^a-z0-9-]/gi, "-");
const LOG_PATH = path.join(LOG_DIR, `debate-${scenarioSlug}-${RUN_ID}.log`);

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

// ---- Logging ----

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function writeLine(line = "") { console.log(line); fs.appendFileSync(LOG_PATH, `${line}\n`); }
function log(label, payload) {
  const time = new Date().toISOString().slice(11, 19);
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  writeLine(`[${time}] ${label}: ${rendered}`);
}
function logStep(msg) { writeLine(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`); }
function renderError(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") };
  return { message: String(error) };
}

// ---- API helper ----

async function api(apiPath, options = {}) {
  const { method = "GET", token, body, expectedStatus = 200, logRequest = false, logLabel = null } = options;
  const url = `${API_BASE_URL}${apiPath}`;
  const headers = {
    accept: "application/json",
    ...(body ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const startedAt = Date.now();
  if (logRequest) log(logLabel ?? "api-request", { method, path: apiPath });

  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${method} ${apiPath} returned non-JSON: ${text.slice(0, 200)}`); }

  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    const code = parsed?.code ?? parsed?.error ?? "unknown";
    const message = parsed?.message ?? `HTTP ${response.status}`;
    log(logLabel ?? "api-error", { method, path: apiPath, status: response.status, durationMs: Date.now() - startedAt, code, message });
    throw new Error(`${method} ${apiPath} failed (${response.status}) ${code}: ${message}`);
  }
  if (logRequest) log(logLabel ?? "api-response", { method, path: apiPath, status: response.status, durationMs: Date.now() - startedAt });
  return parsed.data ?? parsed;
}

function idempotencyKey(parts) {
  return parts.map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("-").slice(0, 120);
}

// ---- LLM via claude CLI ----

async function generateContribution(agent, context) {
  const roundKind = context.currentRound?.roundKind ?? "unknown";
  const roundInstruction = context.currentRoundConfig?.roundInstruction;

  // Build prior contributions from transcript
  const priorContributions = (context.transcript ?? [])
    .filter((c) => c.bodyClean)
    .map((c) => `[@${c.beingHandle}] ${c.bodyClean}`)
    .slice(-20);

  const systemPrompt = `You are "${agent.displayName}" writing a contribution for a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

OUTPUT FORMAT — THIS IS CRITICAL:
You must write plain prose paragraphs only. Your output will be displayed directly on a web page that does not render markdown.

NEVER use: # headers, ## subheaders, **bold**, *italic*, bullet points (- or *), numbered lists, block quotes, code blocks, or any markdown syntax whatsoever.

Do not write a title, label, or thesis header. Start directly with your argument.

Write 2-3 paragraphs, 150-350 words. Stay in character. Engage with prior contributions by name when they exist. Cite specific data, examples, or reasoning.`;

  const userPrompt = [
    `TOPIC: ${context.title}`,
    `RESEARCH QUESTION: ${context.prompt}`,
    `CURRENT ROUND: ${roundKind} (round ${(context.currentRound?.sequenceIndex ?? 0) + 1} of ${context.rounds?.length ?? 5})`,
  ];

  if (roundInstruction) {
    userPrompt.push(`\nROUND GOAL: ${roundInstruction.goal}`);
    if (roundInstruction.guidance) userPrompt.push(`GUIDANCE: ${roundInstruction.guidance}`);
    if (roundInstruction.qualityCriteria?.length) {
      userPrompt.push(`QUALITY CRITERIA:\n${roundInstruction.qualityCriteria.map((c) => `  - ${c}`).join("\n")}`);
    }
    if (roundInstruction.priorRoundContext) userPrompt.push(`PRIOR ROUND CONTEXT: ${roundInstruction.priorRoundContext}`);
  }

  if (priorContributions.length > 0) {
    userPrompt.push(`\nPRIOR CONTRIBUTIONS:\n${priorContributions.join("\n\n")}`);
  }

  userPrompt.push(`\nREMINDER: Write your response as plain prose paragraphs. Do not use any markdown formatting whatsoever — no headers, no bold, no italic, no bullet points, no numbered lists, no horizontal rules. Begin your contribution now:`);

  // Run claude from a clean temp dir (no CLAUDE.md) so the default
  // system prompt doesn't inject Claude Code identity/instructions.
  // Write system prompt to a temp file to avoid shell escaping issues
  // with quotes, parentheses, and newlines in agent bios.
  const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), "debate-agent-"));
  const systemPromptFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, systemPrompt);

  // Build a shell command that reads the system prompt from a file via subshell.
  // This avoids shell escaping issues with complex agent bios.
  const shellCmd = `claude -p --model ${LLM_MODEL} --system-prompt "$(cat ${JSON.stringify(systemPromptFile).replace(/\\/g, "/")})" --tools "" --no-session-persistence`;

  const content = await new Promise((resolve, reject) => {
    const proc = spawn("bash", ["-c", shellCmd], {
      timeout: 120_000,
      cwd: cleanCwd,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.stdin.write(userPrompt.join("\n"));
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
    proc.on("error", reject);
  });

  try { fs.rmSync(cleanCwd, { recursive: true }); } catch {}
  if (!content) throw new Error("claude CLI returned empty output");

  // Hard cap at 5500 chars to stay within the 6000 char API limit
  if (content.length > 5500) {
    const truncated = content.slice(0, 5500).replace(/\s\S*$/, ""); // cut at last word boundary
    log("llm-truncated", { who: agent.displayName, original: content.length, truncated: truncated.length });
    return truncated;
  }
  return content;
}

// ---- Main ----

async function main() {
  const startedAt = Date.now();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");

  logStep("Run metadata");
  log("run", {
    runId: RUN_ID,
    scenario: scenarioPath,
    title: scenario.title,
    logPath: LOG_PATH,
    apiBaseUrl: API_BASE_URL,
    domainId: DOMAIN_ID,
    templateId: TEMPLATE_ID,
    cadenceMinutes: CADENCE_MINUTES,
    model: LLM_MODEL,
    agentCount: scenario.agents.length,
  });

  // Step 1: Admin token
  logStep("Step 1: Authenticate admin");
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true, logLabel: "admin-auth",
  });
  const adminToken = adminTokenData.accessToken;
  log("admin", { agentId: adminTokenData.agent.id });

  // Step 2: Create guest agents
  logStep(`Step 2: Create ${scenario.agents.length} guest agents`);
  const participants = [];
  for (let i = 0; i < scenario.agents.length; i++) {
    const agentDef = scenario.agents[i];
    const guest = await api("/v1/auth/guest", { method: "POST", expectedStatus: 201 });
    await api(`/v1/beings/${guest.being.id}`, {
      method: "PATCH",
      token: guest.accessToken,
      body: { displayName: agentDef.displayName, bio: agentDef.bio },
    });
    participants.push({
      index: i,
      agentId: guest.agent.id,
      beingId: guest.being.id,
      handle: guest.being.handle,
      displayName: agentDef.displayName,
      stance: agentDef.stance,
      bio: agentDef.bio,
      accessToken: guest.accessToken,
    });
    log(`agent-${i + 1}`, { displayName: agentDef.displayName, beingId: guest.being.id, stance: agentDef.stance });
  }

  // Step 3: Create topic
  logStep("Step 3: Create topic");
  const topic = await api("/v1/internal/topics", {
    method: "POST", token: adminToken, expectedStatus: 201,
    body: {
      domainId: DOMAIN_ID,
      title: scenario.title,
      prompt: scenario.prompt,
      templateId: TEMPLATE_ID,
      topicFormat: "scheduled_research",
      cadenceOverrideMinutes: CADENCE_MINUTES,
      topicSource: "cron_auto",
      reason: `Debate — ${scenario.title}`,
    },
    logRequest: true, logLabel: "topic-create",
  });
  log("topic", { id: topic.id, status: topic.status, rounds: topic.rounds.length });

  // Step 4: Set timing and join
  logStep("Step 4: Timing + join");
  const joinUntil = new Date(Date.now() + 30_000).toISOString();
  const startsAt = new Date(Date.now() + 45_000).toISOString();
  await api(`/v1/topics/${topic.id}`, { method: "PATCH", token: adminToken, body: { startsAt, joinUntil } });
  log("timing", { startsAt, joinUntil });

  for (const p of participants) {
    await api(`/v1/topics/${topic.id}/join`, { method: "POST", token: p.accessToken, body: { beingId: p.beingId } });
    log("joined", p.displayName);
  }

  // Step 5: Drive debate loop
  logStep("Step 5: Drive debate");
  const contributionKeys = new Set();
  const voteKeys = new Set();
  let lastTransitionKey = null;
  const deadlineMs = Date.now() + 30 * 60_000;
  let sweepCount = 0;
  const allVotes = [];
  const allContributions = [];
  let loopCount = 0;

  while (Date.now() < deadlineMs) {
    loopCount++;

    const sweep = await api("/v1/internal/topics/sweep", { method: "POST", token: adminToken, body: {} });
    sweepCount++;
    if (sweep?.mutatedTopicIds?.length > 0) log("sweep", { count: sweepCount, mutated: sweep.mutatedTopicIds });

    const contexts = await Promise.all(
      participants.map((p) =>
        api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(p.beingId)}`, { token: p.accessToken })
          .then((context) => ({ participant: p, context })),
      ),
    );

    const canonical = contexts[0]?.context;
    if (!canonical || typeof canonical.status !== "string") throw new Error("Context response missing status");

    const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}`;
    if (transitionKey !== lastTransitionKey) {
      lastTransitionKey = transitionKey;
      log("transition", {
        status: canonical.status,
        roundIndex: canonical.currentRound?.sequenceIndex ?? null,
        roundKind: canonical.currentRound?.roundKind ?? null,
      });
    }

    if (loopCount % 10 === 0) {
      log("heartbeat", { loop: loopCount, sweeps: sweepCount, contributions: allContributions.length, votes: allVotes.length });
    }

    if (canonical.status === "closed" || canonical.status === "stalled") {
      log("terminal", canonical.status);
      break;
    }

    // Generate all contributions in PARALLEL so agents don't get dropped for timeout
    const pendingContributions = contexts
      .filter(({ participant, context }) => {
        const currentRound = context.currentRound;
        if (!currentRound || context.status !== "started") return false;
        const contributionKey = `${participant.beingId}:${currentRound.id}`;
        if (contributionKeys.has(contributionKey)) return false;
        if (Array.isArray(context.ownContributionStatus) && context.ownContributionStatus.length > 0) return false;
        return true;
      });

    if (pendingContributions.length > 0) {
      const roundKind = pendingContributions[0].context.currentRound.roundKind;
      log("llm-batch", { round: roundKind, agents: pendingContributions.length, model: LLM_MODEL });

      const results = await Promise.allSettled(
        pendingContributions.map(async ({ participant, context }) => {
          const currentRound = context.currentRound;
          log("llm-call", { who: participant.displayName, round: currentRound.roundKind, model: LLM_MODEL });
          const body = await generateContribution(participant, context);
          log("llm-done", { who: participant.displayName, round: currentRound.roundKind, length: body.length, preview: body.slice(0, 120) });
          return { participant, context, body };
        }),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          log("llm-error", { error: renderError(result.reason) });
          continue;
        }
        const { participant, context, body } = result.value;
        const currentRound = context.currentRound;
        const contributionKey = `${participant.beingId}:${currentRound.id}`;

        try {
          await api(`/v1/topics/${topic.id}/contributions`, {
            method: "POST", token: participant.accessToken, expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["debate", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          contributionKeys.add(contributionKey);
          allContributions.push({ roundKind: currentRound.roundKind, roundIndex: currentRound.sequenceIndex, displayName: participant.displayName, stance: participant.stance });
          log("contribution", { who: participant.displayName, round: currentRound.roundKind, stance: participant.stance });
        } catch (err) {
          log("contribution-failed", { who: participant.displayName, round: currentRound.roundKind, error: renderError(err) });
          contributionKeys.add(contributionKey);
        }
      }
    }

    // Cast categorical votes
    for (const { participant, context } of contexts) {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") continue;

      const refreshedContext = await api(`/v1/topics/${topic.id}/context?beingId=${participant.beingId}`, { token: participant.accessToken });
      const voteRequired = Boolean(refreshedContext.currentRoundConfig?.voteRequired);
      const voteTargets = Array.isArray(refreshedContext.voteTargets) ? refreshedContext.voteTargets : [];
      if (!voteRequired || voteTargets.length === 0) continue;

      const othersTargets = voteTargets.filter((t) => t.beingId !== participant.beingId);
      if (othersTargets.length === 0) continue;

      const voteKinds = ["most_interesting", "most_correct", "fabrication"];
      for (let ki = 0; ki < voteKinds.length; ki++) {
        const voteKind = voteKinds[ki];
        const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
        if (voteKeys.has(voteKey)) continue;

        const target = othersTargets[ki % othersTargets.length];
        try {
          await api(`/v1/topics/${topic.id}/votes`, {
            method: "POST", token: participant.accessToken, expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              contributionId: target.contributionId,
              voteKind,
              idempotencyKey: idempotencyKey(["debate", voteKind, topic.id.slice(-12), refreshedContext.currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          voteKeys.add(voteKey);
          allVotes.push({ roundKind: currentRound.roundKind, roundIndex: currentRound.sequenceIndex, voter: participant.displayName, voteKind });
          log("vote", { who: participant.displayName, kind: voteKind, target: target.beingHandle ?? target.beingId });
        } catch (err) {
          log("vote-blocked", { who: participant.displayName, kind: voteKind, error: err.message?.slice(0, 120) });
        }
      }
    }

    await wait(3_000);
  }

  // Step 6: Results
  logStep("Step 6: Results");
  const finalContext = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(participants[0].beingId)}`, { token: participants[0].accessToken });
  log("final-status", finalContext.status);
  log("contributions-total", allContributions.length);
  log("votes-total", allVotes.length);

  if (finalContext.status === "closed") {
    try {
      const report = await api(`/v1/internal/admin/topics/${topic.id}/report`, { token: adminToken });
      log("report-verdict", report?.verdict?.verdictOutcome ?? "no verdict");
      log("report-confidence", report?.verdict?.confidence ?? "unknown");
    } catch (err) { log("report-error", err.message); }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logStep(`Complete — ${elapsed}s elapsed`);
  writeLine(`
SUMMARY:
  Topic:          ${topic.id}
  Title:          ${scenario.title}
  Template:       ${TEMPLATE_ID}
  Domain:         ${DOMAIN_ID}
  Model:          ${LLM_MODEL}
  Agents:         ${participants.map((p) => p.displayName).join(", ")}
  Contributions:  ${allContributions.length}
  Votes:          ${allVotes.length}
  Final Status:   ${finalContext.status}
  URL:            ${API_BASE_URL.replace("api.", "")}/topics/${topic.id}
  Log:            ${LOG_PATH}
  `);

  if (finalContext.status !== "closed") {
    console.error("WARNING: Topic did not reach closed state within timeout.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(LOG_PATH, `[FATAL] ${JSON.stringify(renderError(err), null, 2)}\n`); } catch {}
  console.error("FATAL:", err);
  process.exitCode = 1;
});
