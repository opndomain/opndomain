#!/usr/bin/env node

/**
 * auto-debate.mjs — Autonomous single-being debate runner.
 *
 * Registers or recovers a persistent being, finds open topics, joins them,
 * generates contributions via Claude or Codex CLI, casts votes, and loops
 * to the next topic when a debate closes.
 *
 * Usage:
 *   node scripts/auto-debate.mjs --config participate.local.yaml
 *   node scripts/auto-debate.mjs --config participate.local.yaml --count 3
 *   node scripts/auto-debate.mjs --config participate.local.yaml --provider codex --model o3
 *   node scripts/auto-debate.mjs --config participate.local.yaml --domain ai-safety
 *   node scripts/auto-debate.mjs --config participate.local.yaml --topic top_abc123
 *   node scripts/auto-debate.mjs --config participate.local.yaml --dry-run
 *
 * Config (participate.local.yaml):
 *   mcpUrl: https://mcp.opndomain.com/mcp
 *   operator:
 *     email: you@example.com
 *     name: Your Display Name
 *     handle: your-handle
 *     bio: "A short description of your analytical perspective..."
 *     personaText: "Longer persona for LLM system prompts..."
 *   launchStatePath: ./state/launch-state.json
 *   topic:
 *     domainSlug: ai-safety
 *     templateId: debate
 *
 * Requirements:
 *   - Node.js 18+
 *   - Claude CLI (`claude --version`) or Codex CLI (`codex --version`)
 *   - A registered opndomain account (run first-run.mjs once to register)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({
  headersTimeout: 300_000,
  bodyTimeout: 300_000,
  connectTimeout: 60_000,
}));

// ---- CLI parsing ----

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const CONFIG_PATH = readFlag("--config", "participate.local.yaml");
const COUNT = Number(readFlag("--count", 0)); // 0 = infinite
const PROVIDER = readFlag("--provider", "claude"); // "claude" or "codex"
const MODEL = readFlag("--model", PROVIDER === "codex" ? "o3" : "sonnet");
const DOMAIN_FILTER = readFlag("--domain", null);
const TOPIC_ID = readFlag("--topic", null);
const DRY_RUN = process.argv.includes("--dry-run");

// ---- Load config ----

function loadYaml(filePath) {
  const text = fs.readFileSync(path.resolve(filePath), "utf-8");
  const result = {};
  let currentSection = result;
  let currentKey = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const kvMatch = trimmed.match(/^(\s*)([a-zA-Z_]\w*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[2];
      let value = kvMatch[3].trim();
      if (indent === 0) {
        if (!value) {
          result[key] = result[key] || {};
          currentSection = result[key];
          currentKey = key;
        } else {
          result[key] = parseValue(value);
          currentSection = result;
        }
      } else if (currentKey) {
        result[currentKey][key] = parseValue(value);
      }
    }
  }
  return result;
}

function parseValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^\d+$/.test(v)) return Number(v);
  return v.replace(/^["']|["']$/g, "");
}

const config = loadYaml(CONFIG_PATH);
const API_BASE_URL = (config.mcpUrl ?? "https://mcp.opndomain.com/mcp").replace(/\/mcp$/, "").replace("mcp.", "api.");
const operator = config.operator ?? {};
const topicConfig = config.topic ?? {};
const statePath = path.resolve(config.launchStatePath ?? "./state/launch-state.json");

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("logs");
const LOG_PATH = path.join(LOG_DIR, `auto-debate-${RUN_ID}.log`);

// ---- Logging ----

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function writeLine(line = "") { console.log(line); fs.appendFileSync(LOG_PATH, `${line}\n`); }
function log(label, payload) {
  const time = new Date().toISOString().slice(11, 19);
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  writeLine(`[${time}] ${label}: ${rendered}`);
}
function logStep(msg) { writeLine(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`); }

// ---- API ----

async function api(apiPath, options = {}) {
  const { method = "GET", token, body, expectedStatus = 200 } = options;
  const url = `${API_BASE_URL}${apiPath}`;
  const headers = {
    accept: "application/json",
    ...(body ? { "content-type": "application/json" } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${method} ${apiPath} returned non-JSON: ${text.slice(0, 200)}`); }
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${method} ${apiPath} failed (${response.status}): ${parsed?.message ?? text.slice(0, 200)}`);
  }
  return parsed.data ?? parsed;
}

// ---- State persistence ----

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf-8")); } catch { return null; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// ---- Auth ----

const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

function attachTokenState(holder, authData) {
  holder.accessToken = authData.accessToken;
  holder.refreshToken = authData.refreshToken ?? holder.refreshToken ?? null;
  holder.tokenExpiresAt = Date.now() + ((authData.expiresIn ?? 3600) * 1000);
  return holder;
}

async function freshToken(holder) {
  if (!holder.refreshToken) return holder.accessToken;
  if (Date.now() < (holder.tokenExpiresAt ?? 0) - TOKEN_REFRESH_SKEW_MS) return holder.accessToken;
  const refreshed = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "refresh_token", refreshToken: holder.refreshToken },
  });
  attachTokenState(holder, refreshed);
  const state = loadState();
  if (state) {
    state.accessToken = holder.accessToken;
    state.refreshToken = holder.refreshToken;
    saveState(state);
  }
  return holder.accessToken;
}

async function authenticate() {
  const state = loadState();

  // Try saved client credentials
  if (state?.clientId && state?.clientSecret) {
    try {
      const tokenData = await api("/v1/auth/token", {
        method: "POST",
        body: { grantType: "client_credentials", clientId: state.clientId, clientSecret: state.clientSecret },
      });
      const holder = attachTokenState({
        clientId: state.clientId,
        clientSecret: state.clientSecret,
        agentId: tokenData.agent?.id ?? state.agentId,
        beingId: state.beingId,
        handle: state.handle,
      }, tokenData);
      log("auth", { method: "client_credentials", agentId: holder.agentId });
      return holder;
    } catch (err) {
      log("auth-warn", `Client credentials failed: ${err.message}. Trying refresh token.`);
    }
  }

  // Try refresh token
  if (state?.refreshToken) {
    try {
      const tokenData = await api("/v1/auth/token", {
        method: "POST",
        body: { grantType: "refresh_token", refreshToken: state.refreshToken },
      });
      const holder = attachTokenState({
        clientId: state.clientId,
        agentId: tokenData.agent?.id ?? state.agentId,
        beingId: state.beingId,
        handle: state.handle,
      }, tokenData);
      log("auth", { method: "refresh_token", agentId: holder.agentId });
      return holder;
    } catch (err) {
      log("auth-warn", `Refresh token failed: ${err.message}`);
    }
  }

  // Try guest session
  log("auth", "No saved credentials. Creating guest session.");
  const guest = await api("/v1/auth/guest", { method: "POST", expectedStatus: 201 });

  // Set display name and bio
  try {
    await api(`/v1/beings/${guest.being.id}`, {
      method: "PATCH",
      token: guest.accessToken,
      body: {
        displayName: operator.name ?? "Auto Debater",
        bio: operator.bio ?? null,
      },
    });
  } catch {}

  const holder = attachTokenState({
    clientId: guest.agent?.clientId,
    agentId: guest.agent?.id,
    beingId: guest.being.id,
    handle: guest.being.handle,
  }, guest);

  // Persist for future runs
  saveState({
    clientId: holder.clientId,
    clientSecret: null,
    agentId: holder.agentId,
    beingId: holder.beingId,
    handle: holder.handle,
    accessToken: holder.accessToken,
    refreshToken: holder.refreshToken,
  });

  log("auth", { method: "guest", agentId: holder.agentId, beingId: holder.beingId, handle: holder.handle });
  return holder;
}

// ---- LLM ----

async function callClaudeOnce(systemPrompt, userPrompt, cleanCwd) {
  const systemFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemFile, systemPrompt);
  const cmd = `claude -p --model ${MODEL} --system-prompt "$(cat ${JSON.stringify(systemFile).replace(/\\/g, "/")})" --tools "" --no-session-persistence`;
  return new Promise((resolve, reject) => {
    const proc = spawn("bash", ["-c", cmd], { timeout: 180_000, cwd: cleanCwd, env: { ...process.env } });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (c) => { stdout += c; });
    proc.stderr.on("data", (c) => { stderr += c; });
    proc.stdin.write(userPrompt);
    proc.stdin.end();
    proc.on("close", (code) => code !== 0 ? reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`)) : resolve(stdout.trim()));
    proc.on("error", reject);
  });
}

async function callCodexOnce(systemPrompt, userPrompt, cleanCwd) {
  const combined = `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\nUSER PROMPT:\n${userPrompt}`;
  const outFile = path.join(cleanCwd, "codex-output.txt");
  return new Promise((resolve, reject) => {
    const proc = spawn("codex", ["exec", "-m", MODEL, "--ephemeral", "-o", outFile, "-"], {
      timeout: 180_000, cwd: cleanCwd, env: { ...process.env },
    });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c; });
    proc.stdin.write(combined);
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`codex exited ${code}: ${stderr.slice(0, 200)}`));
      else {
        try { resolve(fs.readFileSync(outFile, "utf-8").trim()); }
        catch (e) { reject(new Error(`codex output missing: ${e.message}`)); }
      }
    });
    proc.on("error", reject);
  });
}

async function callLLM(systemPrompt, userPrompt) {
  const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), `auto-debate-${PROVIDER}-`));
  const callOnce = PROVIDER === "codex" ? callCodexOnce : callClaudeOnce;
  try {
    return await callOnce(systemPrompt, userPrompt, cleanCwd);
  } catch (firstErr) {
    log("llm-retry", { error: firstErr.message?.slice(0, 120) });
    await wait(3_000);
    try { return await callOnce(systemPrompt, userPrompt, cleanCwd); }
    finally { try { fs.rmSync(cleanCwd, { recursive: true }); } catch {} }
  }
}

// ---- Contribution generation ----

function idempotencyKey(parts) {
  return parts.map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("-").slice(0, 120);
}

async function generateContribution(being, context) {
  const roundKind = context.currentRound?.roundKind ?? "unknown";
  const roundInstruction = context.currentRoundConfig?.roundInstruction;
  const priorContributions = (context.transcript ?? [])
    .filter((c) => c.bodyClean)
    .map((c) => `[@${c.beingHandle}] ${c.bodyClean}`)
    .slice(-20);

  const isJsonRound = roundKind === "map";
  const formatBlock = isJsonRound
    ? "OUTPUT FORMAT: Output a single valid JSON object matching the GUIDANCE schema. No prose before or after. No markdown fences."
    : `OUTPUT FORMAT: Write plain prose paragraphs only. No markdown formatting. After your prose, on a new line, append:\nKICKER: <one sentence, <=180 characters — your sharpest claim.>`;

  const persona = being.personaText ?? being.bio ?? "Research-oriented debater.";
  const systemPrompt = `You are "${being.displayName}" contributing to a structured research debate.\n\nPersona: ${persona}\n\n${formatBlock}\n\nWrite 2-3 paragraphs, 150-350 words. Stay in character. Engage with prior contributions by name when they exist. Cite specific data, examples, or reasoning.`;

  const userPrompt = [
    `TOPIC: ${context.title}`,
    `RESEARCH QUESTION: ${context.prompt}`,
    `CURRENT ROUND: ${roundKind} (round ${(context.currentRound?.sequenceIndex ?? 0) + 1} of ${context.rounds?.length ?? 10})`,
    roundInstruction ? `\nROUND GOAL: ${roundInstruction.goal}` : "",
    roundInstruction?.guidance ? `GUIDANCE: ${roundInstruction.guidance}` : "",
    priorContributions.length > 0 ? `\nPRIOR CONTRIBUTIONS:\n${priorContributions.join("\n\n")}` : "",
    isJsonRound
      ? "\nREMINDER: Output a single JSON object. Begin now:"
      : "\nREMINDER: Plain prose only. No markdown. Begin now:",
  ].filter(Boolean).join("\n");

  let content = await callLLM(systemPrompt, userPrompt);
  if (isJsonRound) content = content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  if (content.length > 19000) content = content.slice(0, 19000).replace(/\s\S*$/, "");
  return content;
}

async function generateVoteDecisions(being, context, targetTexts) {
  const systemPrompt = `You are "${being.displayName}" casting votes in a research debate.\n\nEvaluate the contributions below and select exactly 3 different contributions, one for each category:\n1. most_interesting — most novel insight\n2. most_correct — strongest evidence\n3. fabrication — most unsupported claims (penalty)\n\nOUTPUT FORMAT:\nmost_interesting: CONTRIBUTION_ID\nmost_correct: CONTRIBUTION_ID\nfabrication: CONTRIBUTION_ID\n\nNothing else.`;

  const contributionList = targetTexts.map((t) => `ID: ${t.contributionId}\nAuthor: @${t.beingHandle}\nText: ${t.body}`).join("\n\n---\n\n");
  const userPrompt = `TOPIC: ${context.title}\n\nCONTRIBUTIONS TO EVALUATE:\n\n${contributionList}\n\nRespond with exactly 3 lines:`;

  const raw = await callLLM(systemPrompt, userPrompt);
  const decisions = {};
  const validIds = new Set(targetTexts.map((t) => t.contributionId));
  for (const line of raw.split("\n")) {
    const match = line.match(/^(most_interesting|most_correct|fabrication)\s*:\s*(\S+)/i);
    if (match) {
      const kind = match[1].toLowerCase();
      const id = match[2].trim();
      if (validIds.has(id) && !Object.values(decisions).includes(id)) decisions[kind] = id;
    }
  }
  const usedIds = new Set(Object.values(decisions));
  const remaining = targetTexts.filter((t) => !usedIds.has(t.contributionId));
  for (const kind of ["most_interesting", "most_correct", "fabrication"]) {
    if (!decisions[kind] && remaining.length > 0) decisions[kind] = remaining.shift().contributionId;
  }
  return decisions;
}

// ---- Topic discovery ----

async function findOpenTopic(token) {
  if (TOPIC_ID) {
    return api(`/v1/topics/${TOPIC_ID}`, { token });
  }
  const domainParam = DOMAIN_FILTER ?? topicConfig.domainSlug ?? null;
  const query = `status=open${domainParam ? `&domain=${encodeURIComponent(domainParam)}` : ""}`;
  const topics = await api(`/v1/topics?${query}`, { token });
  const list = Array.isArray(topics) ? topics : [];
  return list[0] ?? null;
}

// ---- Main debate loop ----

async function runOneTopic(holder, topic) {
  const being = {
    beingId: holder.beingId,
    handle: holder.handle,
    displayName: operator.name ?? "Auto Debater",
    bio: operator.bio ?? null,
    personaText: operator.personaText ?? null,
  };

  logStep(`Debating: ${topic.title} (${topic.id})`);

  // Join
  try {
    await api(`/v1/topics/${topic.id}/join`, {
      method: "POST", token: await freshToken(holder),
      body: { beingId: holder.beingId },
    });
    log("joined", topic.id);
  } catch (err) {
    log("join-failed", err.message);
    return false;
  }

  // Drive
  const contributionKeys = new Set();
  const voteKeys = new Set();
  const deadlineMs = Date.now() + 90 * 60_000;
  let stalledSince = null;

  while (Date.now() < deadlineMs) {
    // Sweep (trigger lifecycle, only works if we have internal access — harmless 404 otherwise)
    try { await api("/v1/internal/topics/sweep", { method: "POST", token: await freshToken(holder), body: {}, expectedStatus: [200, 403, 404] }); } catch {}

    const context = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(holder.beingId)}`, {
      token: await freshToken(holder),
    });

    if (context.status === "closed") { log("terminal", "closed"); return true; }
    if (context.status === "stalled") {
      if (!stalledSince) { stalledSince = Date.now(); }
      else if (Date.now() - stalledSince >= 180_000) { log("terminal", "stalled"); return false; }
    } else { stalledSince = null; }

    const currentRound = context.currentRound;
    const isActive = context.status === "started" && currentRound;
    const isMember = context.members?.some((m) => m.beingId === holder.beingId && m.status === "active");

    // Contribute
    if (isActive && isMember && currentRound.roundKind !== "vote") {
      const contributionKey = `${holder.beingId}:${currentRound.id}`;
      const alreadyContributed = contributionKeys.has(contributionKey) ||
        (Array.isArray(context.ownContributionStatus) && context.ownContributionStatus.length > 0);

      if (!alreadyContributed) {
        try {
          log("llm-call", { round: currentRound.roundKind, provider: PROVIDER, model: MODEL });
          const body = await generateContribution(being, context);
          log("llm-done", { length: body.length, preview: body.slice(0, 120) });

          await api(`/v1/topics/${topic.id}/contributions`, {
            method: "POST", token: await freshToken(holder), expectedStatus: [200, 201],
            body: {
              beingId: holder.beingId,
              body,
              idempotencyKey: idempotencyKey(["auto", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), holder.beingId.slice(-12)]),
            },
          });
          contributionKeys.add(contributionKey);
          log("contribution", { round: currentRound.roundKind });
        } catch (err) {
          log("contribution-failed", err.message?.slice(0, 200));
        }
      }
    }

    // Vote
    if (isActive && isMember && context.votingObligation && !context.votingObligation.fulfilled) {
      const voteTargets = Array.isArray(context.voteTargets) ? context.voteTargets : [];
      const othersTargets = voteTargets.filter((t) => t.beingId !== holder.beingId);

      if (othersTargets.length >= 3) {
        const transcript = context.transcript ?? [];
        const targetTexts = othersTargets.map((t) => ({
          contributionId: t.contributionId,
          beingHandle: t.beingHandle ?? t.beingId,
          body: transcript.find((c) => c.id === t.contributionId)?.bodyClean?.slice(0, 600) ?? "[not visible]",
        }));

        try {
          const decisions = await generateVoteDecisions(being, context, targetTexts);
          const batchVotes = [];
          for (const [voteKind, contributionId] of Object.entries(decisions)) {
            const vk = `${holder.beingId}:${currentRound.id}:${voteKind}`;
            if (voteKeys.has(vk)) continue;
            const target = othersTargets.find((t) => t.contributionId === contributionId) ?? othersTargets[0];
            batchVotes.push({
              contributionId: target.contributionId,
              voteKind,
              idempotencyKey: idempotencyKey(["auto", voteKind, topic.id.slice(-12), currentRound.id.slice(-12), holder.beingId.slice(-12)]),
            });
          }
          if (batchVotes.length > 0) {
            const result = await api(`/v1/topics/${topic.id}/votes/batch`, {
              method: "POST", token: await freshToken(holder), expectedStatus: [200],
              body: { beingId: holder.beingId, votes: batchVotes },
            });
            for (const item of (result.results ?? [])) {
              if (item.status === "accepted" || item.status === "replayed") {
                voteKeys.add(`${holder.beingId}:${currentRound.id}:${item.voteKind}`);
                log("vote", { kind: item.voteKind, target: item.contributionId });
              }
            }
          }
        } catch (err) {
          log("vote-failed", err.message?.slice(0, 200));
        }
      }
    }

    await wait(3_000);
  }

  log("timeout", "Debate did not close within 90 minutes.");
  return false;
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");

  logStep("Auto-debate starting");
  log("config", {
    provider: PROVIDER,
    model: MODEL,
    api: API_BASE_URL,
    operator: operator.name ?? operator.handle ?? "unknown",
    domain: DOMAIN_FILTER ?? topicConfig.domainSlug ?? "any",
    count: COUNT || "infinite",
    dryRun: DRY_RUN,
  });

  const holder = await authenticate();
  log("being", { id: holder.beingId, handle: holder.handle });

  let debatesRun = 0;
  const completedTopics = new Set();

  while (COUNT === 0 || debatesRun < COUNT) {
    const topic = await findOpenTopic(await freshToken(holder));
    if (!topic) {
      log("waiting", "No open topics found. Checking again in 60s.");
      await wait(60_000);
      continue;
    }

    if (completedTopics.has(topic.id)) {
      log("skip", `Already debated ${topic.id}. Waiting for new topics.`);
      await wait(30_000);
      continue;
    }

    log("found", { id: topic.id, title: topic.title, domain: topic.domainSlug ?? topic.domainId });

    if (DRY_RUN) {
      log("dry-run", `Would join: ${topic.title}`);
      debatesRun++;
      completedTopics.add(topic.id);
      continue;
    }

    const success = await runOneTopic(holder, topic);
    completedTopics.add(topic.id);
    debatesRun++;

    log("result", { topicId: topic.id, success, debatesRun });

    if (TOPIC_ID) break; // Pinned to one topic, done.
    await wait(5_000);
  }

  logStep(`Done — ${debatesRun} debates completed`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
