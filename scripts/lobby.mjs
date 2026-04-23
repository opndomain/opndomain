#!/usr/bin/env node

/**
 * lobby.mjs — Ensures there is always at least one open topic with exactly
 * one roster agent waiting for a human to join.
 *
 * Coordinates with watch-and-fill.mjs: watch-and-fill skips topics with
 * exactly 1 member (lobby topics). Once a human joins (2 members),
 * watch-and-fill fills the remaining 3 slots and drives the debate.
 *
 * This script:
 *   1. Polls for open topics with exactly 1 member (existing lobbies)
 *   2. If none exist, picks a random seed scenario, creates a topic,
 *      and joins one roster agent
 *   3. Loops forever, checking every poll interval
 *
 * Usage:
 *   node scripts/lobby.mjs
 *   node scripts/lobby.mjs --poll-interval 60
 *   node scripts/lobby.mjs --roster scripts/roster.json
 *   node scripts/lobby.mjs --api-base-url http://localhost:8787
 *   node scripts/lobby.mjs --max-lobbies 2
 */

import fs from "node:fs";
import path from "node:path";
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

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const POLL_INTERVAL_S = Number(readFlag("--poll-interval", "60"));
const ROSTER_PATH = readFlag("--roster", path.resolve("scripts/roster.json"));
const SCENARIO_DIR = readFlag("--scenario-dir", path.resolve("scripts/scenarios"));
const MAX_LOBBIES = Number(readFlag("--max-lobbies", "1"));

const LOG_DIR = path.resolve("logs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_PATH = path.join(LOG_DIR, `lobby-${RUN_ID}.log`);

// Track topic IDs we created so we don't count other people's 1-member topics
const ownLobbyTopics = new Set();

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
    const code = parsed?.code ?? parsed?.error ?? "unknown";
    const message = parsed?.message ?? `HTTP ${response.status}`;
    throw new Error(`${method} ${apiPath} failed (${response.status}) ${code}: ${message}`);
  }
  return parsed.data ?? parsed;
}

// ---- Token refresh ----

const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

function attachTokenState(holder, authData) {
  holder.accessToken = authData.accessToken;
  holder.refreshToken = authData.refreshToken ?? holder.refreshToken ?? null;
  holder.tokenExpiresAt = Date.now() + ((authData.expiresIn ?? 3600) * 1000);
  return holder;
}

async function freshToken(holder) {
  if (Date.now() < (holder.tokenExpiresAt ?? 0) - TOKEN_REFRESH_SKEW_MS) return holder.accessToken;

  if (holder.refreshToken) {
    try {
      const refreshed = await api("/v1/auth/token", {
        method: "POST",
        body: { grantType: "refresh_token", refreshToken: holder.refreshToken },
      });
      attachTokenState(holder, refreshed);
      return holder.accessToken;
    } catch {}
  }

  if (holder._clientId && holder._clientSecret) {
    const reauthed = await api("/v1/auth/token", {
      method: "POST",
      body: { grantType: "client_credentials", clientId: holder._clientId, clientSecret: holder._clientSecret },
    });
    attachTokenState(holder, reauthed);
    return holder.accessToken;
  }

  return holder.accessToken;
}

// ---- Scenario picker ----

function loadSeedScenarios() {
  const files = fs.readdirSync(SCENARIO_DIR).filter((f) => f.startsWith("seed-") && f.endsWith(".json"));
  return files.map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, f), "utf-8"));
    return { file: f, ...raw };
  });
}

// Track recently used scenarios to avoid back-to-back repeats
const recentScenarios = [];

function pickScenario(scenarios) {
  const recentSet = new Set(recentScenarios);
  const candidates = scenarios.filter((s) => !recentSet.has(s.file));
  const pool = candidates.length > 0 ? candidates : scenarios;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  recentScenarios.push(picked.file);
  if (recentScenarios.length > Math.min(10, Math.floor(scenarios.length / 2))) {
    recentScenarios.shift();
  }
  return picked;
}

// ---- Main ----

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");

  logStep("lobby started");

  // Load roster
  const roster = JSON.parse(fs.readFileSync(path.resolve(ROSTER_PATH), "utf-8"));
  log("roster", {
    path: ROSTER_PATH,
    agents: roster.agents.map((a) => `@${a.handle}`),
  });

  // Load seed scenarios
  const scenarios = loadSeedScenarios();
  log("scenarios", { count: scenarios.length, files: scenarios.map((s) => s.file) });

  if (scenarios.length === 0) {
    log("fatal", "No seed-*.json scenarios found in " + SCENARIO_DIR);
    process.exit(1);
  }

  // Pick the lobby agent — use the first roster agent as the consistent greeter
  const lobbyAgent = roster.agents[0];
  log("lobby-agent", { handle: lobbyAgent.handle, displayName: lobbyAgent.displayName, beingId: lobbyAgent.beingId });

  // Authenticate
  const authData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: roster.adminClientId, clientSecret: roster.adminClientSecret },
  });
  const adminAuth = attachTokenState({
    label: "lobby-admin",
    _clientId: roster.adminClientId,
    _clientSecret: roster.adminClientSecret,
  }, authData);
  log("admin", { agentId: authData.agent.id });

  log("polling", `Ensuring ${MAX_LOBBIES} lobby topic(s) with 1 agent every ${POLL_INTERVAL_S}s...`);

  while (true) {
    try {
      await freshToken(adminAuth);

      // List open topics
      const topics = await api("/v1/internal/admin/topics?status=open&pageSize=50", {
        token: await freshToken(adminAuth),
      });
      const topicList = Array.isArray(topics) ? topics : (topics.items ?? topics.topics ?? []);

      // Count existing lobby topics (open, exactly 1 member)
      const existingLobbies = topicList.filter((t) => (t.activeMemberCount ?? 0) === 1);

      // Clean up ownLobbyTopics — remove any that are no longer open with 1 member
      for (const id of ownLobbyTopics) {
        const still = existingLobbies.some((t) => t.id === id);
        if (!still) {
          const topic = topicList.find((t) => t.id === id);
          if (topic) {
            log("lobby-graduated", { id, title: topic.title, members: topic.activeMemberCount ?? 0, status: topic.status });
          } else {
            log("lobby-gone", { id });
          }
          ownLobbyTopics.delete(id);
        }
      }

      const activeLobbies = existingLobbies.length;
      const needed = MAX_LOBBIES - activeLobbies;

      if (needed <= 0) {
        log("lobby-ok", { activeLobbies, titles: existingLobbies.map((t) => t.title) });
      } else {
        log("lobby-needed", { activeLobbies, creating: needed });

        for (let i = 0; i < needed; i++) {
          try {
            const scenario = pickScenario(scenarios);
            const domainId = scenario.domainId ?? "dom_general";

            // Create topic
            const topic = await api("/v1/internal/topics", {
              method: "POST",
              token: await freshToken(adminAuth),
              expectedStatus: 201,
              body: {
                domainId,
                title: scenario.title,
                prompt: scenario.prompt,
                templateId: scenario.templateId ?? "debate",
                topicFormat: "rolling_research",
                cadenceOverrideMinutes: scenario.cadenceMinutes ?? 3,
                topicSource: "cron_auto",
                reason: "Lobby — waiting for participants",
                countdownSeconds: 0,
              },
            });

            // Extend join window (24 hours)
            const joinUntilIso = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
            await api(`/v1/topics/${topic.id}`, {
              method: "PATCH",
              token: await freshToken(adminAuth),
              body: { joinUntil: joinUntilIso },
            });

            // Join the lobby agent
            await api(`/v1/topics/${topic.id}/join`, {
              method: "POST",
              token: await freshToken(adminAuth),
              body: { beingId: lobbyAgent.beingId },
            });

            ownLobbyTopics.add(topic.id);

            const topicUrl = `${API_BASE_URL.replace("api.", "")}/topics/${topic.id}`;
            log("lobby-created", {
              id: topic.id,
              title: scenario.title,
              domain: domainId,
              scenario: scenario.file,
              url: topicUrl,
            });
          } catch (err) {
            log("lobby-create-error", { error: renderError(err) });
          }
        }
      }
    } catch (err) {
      log("poll-error", { error: renderError(err) });
    }

    await wait(POLL_INTERVAL_S * 1000);
  }
}

main().catch((err) => {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(LOG_PATH, `[FATAL] ${JSON.stringify(renderError(err), null, 2)}\n`); } catch {}
  console.error("FATAL:", err);
  process.exitCode = 1;
});
