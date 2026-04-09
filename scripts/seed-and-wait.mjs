#!/usr/bin/env node

/**
 * seed-and-wait.mjs — Variant of run-debate.mjs that seats 4 AI agents and
 * waits for a 5th HUMAN participant to join via MCP before driving the rounds.
 *
 * Usage:
 *   node scripts/seed-and-wait.mjs scripts/scenarios/foo.json
 *   node scripts/seed-and-wait.mjs scripts/scenarios/foo.json --model sonnet --cadence 2 --max-wait-hours 12
 *
 * Scenario JSON is identical to run-debate.mjs scenarios EXCEPT it must
 * contain exactly 4 agents. The 5th participant is a human who joins via MCP.
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

const scenarioPath = process.argv[2];
if (!scenarioPath || scenarioPath.startsWith("--")) {
  console.error(`
Usage: node scripts/seed-and-wait.mjs <scenario.json> [options]

Options:
  --api-base-url URL      API base URL (default: https://api.opndomain.com)
  --domain-id ID          Domain ID (default: dom_game-theory)
  --cadence MINUTES       Round duration in minutes (default: 2)
  --model MODEL           Claude model: haiku, sonnet, opus (default: sonnet)
  --max-wait-hours HOURS  Hours to wait for the 5th human joiner (default: 12)
`);
  process.exit(1);
}

const scenario = JSON.parse(fs.readFileSync(path.resolve(scenarioPath), "utf-8"));

if (!Array.isArray(scenario.agents) || scenario.agents.length !== 4) {
  console.error(`ERROR: seed-and-wait scenarios must contain exactly 4 agents (found ${scenario.agents?.length ?? 0}).`);
  console.error("The 5th participant is a human who joins via MCP.");
  process.exit(1);
}

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const DOMAIN_ID = scenario.domainId ?? readFlag("--domain-id", "dom_game-theory");
const TEMPLATE_ID = scenario.templateId ?? "debate";
const CADENCE_MINUTES = Number(readFlag("--cadence", scenario.cadenceMinutes ?? 2));
const LLM_MODEL = readFlag("--model", "sonnet");
const MAX_WAIT_HOURS = Number(readFlag("--max-wait-hours", 12));

const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = path.resolve("logs");
const scenarioSlug = path.basename(scenarioPath, ".json").replace(/[^a-z0-9-]/gi, "-");
const LOG_PATH = path.join(LOG_DIR, `seed-and-wait-${scenarioSlug}-${RUN_ID}.log`);

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const REQUIRED_PARTICIPANTS = 5;

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

// ---- Token refresh ----
// Long debates exceed the 1h access-token TTL. Without refresh, every API
// call after expiry returns "Token is expired", beings miss rounds, and
// the topic stalls. Each holder tracks its own refreshToken and expiry.
// Critical for seed-and-wait because the daemon may sit in Phase 2 for
// hours before Phase 3 even starts.

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
    logRequest: true,
    logLabel: `token-refresh:${holder.displayName ?? holder.label ?? "admin"}`,
  });
  attachTokenState(holder, refreshed);
  return holder.accessToken;
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

async function callClaude(systemPrompt, userPrompt) {
  const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), "debate-agent-"));
  const systemPromptFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, systemPrompt);

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
    proc.stdin.write(userPrompt);
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 200)}`));
      else resolve(stdout.trim());
    });
    proc.on("error", reject);
  });

  try { fs.rmSync(cleanCwd, { recursive: true }); } catch {}
  return content;
}

async function generateVoteDecisions(agent, context, targetTexts) {
  const roundInstruction = context.currentRoundConfig?.roundInstruction;
  const votingGuidance = roundInstruction?.votingGuidance ?? "";

  const systemPrompt = `You are "${agent.displayName}" casting votes in a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

You must evaluate the contributions below and select exactly 3 different contributions to vote on, one for each category:

1. most_interesting — the contribution that adds the most novel insight or reframes the debate most productively
2. most_correct — the contribution with the strongest evidence and most defensible reasoning
3. fabrication — the contribution with the most unsupported claims, logical errors, or fabricated evidence (penalty vote)

Each vote MUST target a DIFFERENT contribution. Vote based on argument quality, not agreement.

OUTPUT FORMAT — CRITICAL:
Respond with exactly 3 lines, each in this format:
most_interesting: CONTRIBUTION_ID
most_correct: CONTRIBUTION_ID
fabrication: CONTRIBUTION_ID

Where CONTRIBUTION_ID is the exact ID from the list below. Nothing else — no explanations, no prose.`;

  const contributionList = targetTexts.map((t) =>
    `ID: ${t.contributionId}\nAuthor: @${t.beingHandle}\nText: ${t.body}`
  ).join("\n\n---\n\n");

  const userPrompt = [
    `TOPIC: ${context.title}`,
    `ROUND: ${context.currentRound?.roundKind} (round ${(context.currentRound?.sequenceIndex ?? 0) + 1})`,
    votingGuidance ? `\nVOTING GUIDANCE: ${votingGuidance}` : "",
    `\nCONTRIBUTIONS TO EVALUATE:\n\n${contributionList}`,
    `\nRespond with exactly 3 lines — one per vote kind — using the exact contribution IDs above:`,
  ].filter(Boolean).join("\n");

  log("vote-llm-call", { who: agent.displayName, targets: targetTexts.length });
  const raw = await callClaude(systemPrompt, userPrompt);
  log("vote-llm-done", { who: agent.displayName, raw: raw.slice(0, 200) });

  const decisions = {};
  const validIds = new Set(targetTexts.map((t) => t.contributionId));
  for (const line of raw.split("\n")) {
    const match = line.match(/^(most_interesting|most_correct|fabrication)\s*:\s*(\S+)/i);
    if (match) {
      const kind = match[1].toLowerCase();
      const id = match[2].trim();
      if (validIds.has(id) && !Object.values(decisions).includes(id)) {
        decisions[kind] = id;
      }
    }
  }

  const usedIds = new Set(Object.values(decisions));
  const remaining = targetTexts.filter((t) => !usedIds.has(t.contributionId));
  for (const kind of ["most_interesting", "most_correct", "fabrication"]) {
    if (!decisions[kind] && remaining.length > 0) {
      decisions[kind] = remaining.shift().contributionId;
    }
  }

  return decisions;
}

async function generateContribution(agent, context) {
  const roundKind = context.currentRound?.roundKind ?? "unknown";
  const roundInstruction = context.currentRoundConfig?.roundInstruction;

  const priorContributions = (context.transcript ?? [])
    .filter((c) => c.bodyClean)
    .map((c) => `[@${c.beingHandle}] ${c.bodyClean}`)
    .slice(-20);

  const isFinalVoteRound = roundKind === "vote" && context.currentRound?.sequenceIndex === 9;

  let mapRoundBlock = "";
  let mapPositionList = "";
  if (roundKind === "final_argument" || isFinalVoteRound) {
    const mapContribs = (context.transcript ?? []).filter((c) => c.roundKind === "map" && c.bodyClean);
    if (mapContribs.length > 0) {
      const sorted = [...mapContribs].sort((a, b) => (Number(b.finalScore ?? 0)) - (Number(a.finalScore ?? 0)));
      const best = sorted[0];
      mapRoundBlock = `\n\nMAP ROUND POSITIONS (from @${best.beingHandle}, the highest-scored map of this debate):\n${best.bodyClean}`;
      try {
        const parsed = JSON.parse(best.bodyClean);
        if (Array.isArray(parsed?.positions)) {
          mapPositionList = parsed.positions
            .map((p, i) => `  ${i + 1}. ${p.statement ?? p.label ?? "(unnamed)"}`)
            .join("\n");
        }
      } catch {}
    }
  }

  // For round 9 (final vote), inject all final_argument contributions in full
  // so voters can audit each contributor's actual position.
  let finalArgsBlock = "";
  if (isFinalVoteRound) {
    const finalArgContribs = (context.transcript ?? []).filter(
      (c) => c.roundKind === "final_argument" && c.bodyClean
    );
    if (finalArgContribs.length > 0) {
      const entries = finalArgContribs
        .map((c) => `[@${c.beingHandle}] ${c.bodyClean}`)
        .join("\n\n");
      finalArgsBlock = `\nFINAL ARGUMENTS TO AUDIT (full text):\n${entries}`;
    }
  }

  const isJsonRound = roundKind === "map";
  const isStructuredRound = roundKind === "map" || roundKind === "final_argument";

  const formatBlock = isJsonRound
    ? `OUTPUT FORMAT:
Output a single valid JSON object. No prose before or after. No markdown fences. The JSON must match the schema described in the GUIDANCE below.
The JSON must also include a top-level "kicker" field: one sentence, ≤180 characters. A sharp contestable CLAIM about the debate landscape — your strongest assertion about which positions matter or where the real disagreement lies. Take a side. Do NOT use phrases like "five contributors" or "the debate shows". Read as a claim, not a summary.`
    : roundKind === "final_argument"
    ? `OUTPUT FORMAT:
Follow the GUIDANCE below precisely. Your contribution MUST contain both PART A — MY POSITION and PART B — IMPARTIAL SYNTHESIS sections in that exact order, with the exact labels specified (MAP_POSITION, MY THESIS, WHY I HOLD IT, STRONGEST OBJECTION I CAN'T FULLY ANSWER, WHAT THIS DEBATE SETTLED, WHAT REMAINS CONTESTED, NEUTRAL VERDICT, KICKER).
Between labels, write plain prose. No markdown: no # headers, no **bold**, no *italic*, no bullet points, no code blocks.
PART A is your advocacy — you take a side and defend it. PART B is impartial — you drop your persona and write as a third-party reader. Doing both well is what wins the peer vote.`
    : isFinalVoteRound
    ? `OUTPUT FORMAT — THIS IS CRITICAL:
Write your vote reasoning as plain prose paragraphs. No markdown formatting.

After your prose, on a new line, append:
KICKER: <one sentence, ≤180 characters — your sharpest claim about the debate outcome.>

Then on a new line, append your position audit:
MAP_POSITION_AUDIT:
@handle1: N
@handle2: N
@handle3: N

For each final-argument contributor, write their @handle followed by the position number (from the MAP ROUND POSITIONS list) that their argument ACTUALLY argues for. Judge by the substance of their thesis and evidence, not by what they self-declared. List every final-argument contributor with exactly one number each.`
    : `OUTPUT FORMAT — THIS IS CRITICAL:
You must write plain prose paragraphs only. Your output will be displayed directly on a web page that does not render markdown.
NEVER use: # headers, ## subheaders, **bold**, *italic*, bullet points (- or *), numbered lists, block quotes, code blocks, or any markdown syntax whatsoever.
Do not write a title, label, or thesis header. Start directly with your argument.

After your prose, on a new line, append:
KICKER: <one sentence, ≤180 characters. This must be a verbatim or near-verbatim distillation of the single sharpest CLAIM you wrote in the prose above — the most contestable, side-taking sentence in your own contribution. Start with a noun or strong verb. The line must take a position someone could disagree with. DO NOT summarize the round, do NOT describe the debate, do NOT use phrases like "five contributors", "this debate", "the question is", "the contributions show", or "in conclusion". The kicker must read as YOUR claim, not commentary about the room.>`;

  const systemPrompt = `You are "${agent.displayName}" writing a contribution for a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

${formatBlock}

Write 2-3 paragraphs, 150-350 words (structured rounds may be longer to accommodate required sections). Stay in character. Engage with prior contributions by name when they exist. Cite specific data, examples, or reasoning.`;

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

  if (mapRoundBlock) {
    userPrompt.push(mapRoundBlock);
    if (mapPositionList) {
      const posLabel = isFinalVoteRound
        ? `\nMAP ROUND POSITIONS — use these numbers in your MAP_POSITION_AUDIT block:\n${mapPositionList}`
        : `\nMAP_POSITION OPTIONS — pick exactly one of these numbers when you write your MAP_POSITION line:\n${mapPositionList}`;
      userPrompt.push(posLabel);
    }
  }

  if (finalArgsBlock) {
    userPrompt.push(finalArgsBlock);
  }

  if (isJsonRound) {
    userPrompt.push(`\nREMINDER: Output a single JSON object. Use exact @handles from the opening round. Begin now:`);
  } else if (isStructuredRound) {
    userPrompt.push(`\nREMINDER: Use the exact section labels specified in the guidance. Write plain prose between labels. No markdown formatting. Begin your contribution now:`);
  } else {
    userPrompt.push(`\nREMINDER: Write your response as plain prose paragraphs. Do not use any markdown formatting whatsoever — no headers, no bold, no italic, no bullet points, no numbered lists, no horizontal rules. Begin your contribution now:`);
  }

  const content = await callClaude(systemPrompt, userPrompt.join("\n"));
  if (!content) throw new Error("claude CLI returned empty output");

  if (isJsonRound) {
    return content
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  if (content.length > 7500) {
    const truncated = content.slice(0, 7500).replace(/\s\S*$/, "");
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
    maxWaitHours: MAX_WAIT_HOURS,
    requiredParticipants: REQUIRED_PARTICIPANTS,
  });

  // Step 1: Admin token
  logStep("Step 1: Authenticate admin");
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true, logLabel: "admin-auth",
  });
  const adminAuth = attachTokenState({ label: "admin" }, adminTokenData);
  log("admin", { agentId: adminTokenData.agent.id });

  // Step 2: Create 4 guest agents
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
    const participant = attachTokenState({
      index: i,
      agentId: guest.agent.id,
      beingId: guest.being.id,
      handle: guest.being.handle,
      displayName: agentDef.displayName,
      stance: agentDef.stance,
      bio: agentDef.bio,
    }, guest);
    participants.push(participant);
    log(`agent-${i + 1}`, { displayName: agentDef.displayName, beingId: guest.being.id, stance: agentDef.stance });
  }

  // Step 3: Create rolling_research topic with a long join window. The global
  // default min_distinct_participants is now 5, so the matchmaking sweep will
  // transition open → countdown the moment a 5th participant joins. We pre-join
  // 4 AI agents and wait for a human to push us over the threshold.
  logStep("Step 3: Create topic (awaiting human)");
  const maxWaitMs = MAX_WAIT_HOURS * 60 * 60 * 1000;
  const joinUntilIso = new Date(Date.now() + maxWaitMs).toISOString();

  const topic = await api("/v1/internal/topics", {
    method: "POST", token: await freshToken(adminAuth), expectedStatus: 201,
    body: {
      domainId: DOMAIN_ID,
      title: scenario.title,
      prompt: scenario.prompt,
      templateId: TEMPLATE_ID,
      topicFormat: "rolling_research",
      cadenceOverrideMinutes: CADENCE_MINUTES,
      topicSource: "cron_auto",
      reason: `Seed-and-wait — ${scenario.title}`,
      countdownSeconds: 0,
    },
    logRequest: true, logLabel: "topic-create",
  });
  log("topic", { id: topic.id, status: topic.status, rounds: topic.rounds?.length ?? 0 });

  // Step 4: Extend join window far into the future. For rolling_research the
  // sweep transitions on participant count, not on startsAt — but we still set
  // joinUntil so the topic doesn't auto-close before the human shows up.
  logStep("Step 4: Extend join window for human participant");
  await api(`/v1/topics/${topic.id}`, {
    method: "PATCH",
    token: await freshToken(adminAuth),
    body: { joinUntil: joinUntilIso },
  });
  log("timing", { joinUntil: joinUntilIso, format: "rolling_research" });

  // Join all 4 AI agents
  for (const p of participants) {
    try {
      await api(`/v1/topics/${topic.id}/join`, { method: "POST", token: await freshToken(p), body: { beingId: p.beingId } });
      log("joined", p.displayName);
    } catch (err) {
      log("join-failed", { who: p.displayName, error: renderError(err) });
    }
  }

  const topicUrl = `${API_BASE_URL.replace("api.", "")}/topics/${topic.id}`;
  logStep("Topic ready — waiting for 5th HUMAN participant");
  writeLine(`
HAND THIS URL TO THE HUMAN (they must join via MCP):
  ${topicUrl}

Topic ID: ${topic.id}
Required participants: ${REQUIRED_PARTICIPANTS} (4 AI seated, 1 human pending)
Join window closes: ${joinUntilIso}
Max wait: ${MAX_WAIT_HOURS} hours
`);

  // Phase 2: Wait loop — poll sweep + status every 15s, heartbeat every 60s
  logStep("Phase 2: Waiting for human joiner");
  const waitDeadline = Date.now() + maxWaitMs;
  let waitLoop = 0;
  let lastHeartbeat = 0;
  let started = false;

  while (Date.now() < waitDeadline) {
    waitLoop++;
    try {
      const sweep = await api("/v1/internal/topics/sweep", { method: "POST", token: await freshToken(adminAuth), body: {} });
      if (sweep?.mutatedTopicIds?.includes(topic.id)) {
        log("sweep-mutated", { topicId: topic.id });
      }
    } catch (err) {
      log("sweep-error", { error: renderError(err) });
    }

    let ctx;
    try {
      ctx = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(participants[0].beingId)}`, { token: await freshToken(participants[0]) });
    } catch (err) {
      log("context-error", { error: renderError(err) });
      await wait(15_000);
      continue;
    }

    const participantCount = Array.isArray(ctx.participants)
      ? ctx.participants.length
      : (ctx.participantCount ?? ctx.distinctParticipantCount ?? null);
    const status = ctx.status;

    const now = Date.now();
    if (now - lastHeartbeat >= 60_000) {
      lastHeartbeat = now;
      const elapsedMin = ((now - startedAt) / 60_000).toFixed(1);
      log("heartbeat", { status, participants: participantCount, elapsedMin, loop: waitLoop });
    }

    if (status === "started" || status === "countdown") {
      log("transition-detected", { status, participants: participantCount });
      started = true;
      break;
    }
    if (status === "closed" || status === "stalled" || status === "cancelled") {
      log("unexpected-terminal", { status });
      console.error(`Topic reached terminal state '${status}' before the human joined. Exiting.`);
      process.exitCode = 1;
      return;
    }

    await wait(15_000);
  }

  if (!started) {
    logStep("TIMEOUT");
    console.error(`No 5th human joiner within ${MAX_WAIT_HOURS} hours. Giving up.`);
    log("wait-timeout", { hours: MAX_WAIT_HOURS });
    process.exitCode = 1;
    return;
  }

  // Phase 3: Drive debate — mirror run-debate.mjs main loop, but only for the 4 AI agents.
  logStep("Phase 3: Drive debate (4 AI agents; 5th is human)");
  const contributionKeys = new Set();
  const voteKeys = new Set();
  let lastTransitionKey = null;
  const deadlineMs = Date.now() + 60 * 60_000; // 60 minute max
  let sweepCount = 0;
  const allVotes = [];
  const allContributions = [];
  let loopCount = 0;

  while (Date.now() < deadlineMs) {
    loopCount++;

    const sweep = await api("/v1/internal/topics/sweep", { method: "POST", token: await freshToken(adminAuth), body: {} });
    sweepCount++;
    if (sweep?.mutatedTopicIds?.length > 0) log("sweep", { count: sweepCount, mutated: sweep.mutatedTopicIds });

    const contexts = [];
    for (const p of participants) {
      try {
        const context = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(p.beingId)}`, { token: await freshToken(p) });
        contexts.push({ participant: p, context });
      } catch (err) {
        // Agent may have been dropped (e.g., inactivity) — log and skip.
        log("context-skip", { who: p.displayName, error: renderError(err) });
      }
    }

    if (contexts.length === 0) {
      log("no-active-agents", "all AI agents appear to be dropped; exiting drive loop");
      break;
    }

    const canonical = contexts[0].context;
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
            method: "POST", token: await freshToken(participant), expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["seedwait", "contrib", topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
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

    // Vote round — again, only for the 4 AI agents.
    const pendingVoters = contexts.filter(({ participant, context }) => {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") return false;
      const voteKey = `${participant.beingId}:${currentRound.id}:voted`;
      return !voteKeys.has(voteKey);
    });

    if (pendingVoters.length > 0) {
      const voterContexts = [];
      for (const { participant } of pendingVoters) {
        try {
          const ctx = await api(`/v1/topics/${topic.id}/context?beingId=${participant.beingId}`, { token: await freshToken(participant) });
          voterContexts.push({ participant, context: ctx });
        } catch (err) {
          log("voter-context-skip", { who: participant.displayName, error: renderError(err) });
        }
      }

      const voteResults = await Promise.allSettled(
        voterContexts.map(async ({ participant, context: ctx }) => {
          const voteRequired = Boolean(ctx.currentRoundConfig?.voteRequired);
          const voteTargets = Array.isArray(ctx.voteTargets) ? ctx.voteTargets : [];
          if (!voteRequired || voteTargets.length === 0) return null;

          const othersTargets = voteTargets.filter((t) => t.beingId !== participant.beingId);
          if (othersTargets.length < 3) return null;

          const transcript = ctx.transcript ?? [];
          const targetTexts = othersTargets.map((t) => {
            const contrib = transcript.find((c) => c.id === t.contributionId);
            return {
              contributionId: t.contributionId,
              beingHandle: t.beingHandle ?? t.beingId,
              body: contrib?.bodyClean?.slice(0, 600) ?? "[contribution not visible]",
            };
          });

          const voteDecisions = await generateVoteDecisions(participant, ctx, targetTexts);
          return { participant, context: ctx, voteDecisions, othersTargets };
        }),
      );

      for (const result of voteResults) {
        if (result.status === "rejected") {
          log("vote-llm-error", { error: renderError(result.reason) });
          continue;
        }
        if (!result.value) continue;
        const { participant, context: ctx, voteDecisions, othersTargets } = result.value;
        const currentRound = ctx.currentRound;

        for (const [voteKind, contributionId] of Object.entries(voteDecisions)) {
          const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
          if (voteKeys.has(voteKey)) continue;

          const target = othersTargets.find((t) => t.contributionId === contributionId) ?? othersTargets[0];
          try {
            await api(`/v1/topics/${topic.id}/votes`, {
              method: "POST", token: await freshToken(participant), expectedStatus: [200, 201],
              body: {
                beingId: participant.beingId,
                contributionId: target.contributionId,
                voteKind,
                idempotencyKey: idempotencyKey(["seedwait", voteKind, topic.id.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
              },
            });
            voteKeys.add(voteKey);
            allVotes.push({ roundKind: currentRound.roundKind, roundIndex: currentRound.sequenceIndex, voter: participant.displayName, voteKind });
            log("vote", { who: participant.displayName, kind: voteKind, target: target.beingHandle ?? target.beingId });
          } catch (err) {
            log("vote-blocked", { who: participant.displayName, kind: voteKind, error: err.message?.slice(0, 120) });
          }
        }
        voteKeys.add(`${participant.beingId}:${currentRound.id}:voted`);
      }
    }

    await wait(3_000);
  }

  // Phase 3 complete — fetch verdict
  logStep("Phase 3 complete: Results");
  let finalContext;
  try {
    finalContext = await api(`/v1/topics/${topic.id}/context?beingId=${encodeURIComponent(participants[0].beingId)}`, { token: await freshToken(participants[0]) });
  } catch (err) {
    log("final-context-error", { error: renderError(err) });
    finalContext = { status: "unknown" };
  }
  log("final-status", finalContext.status);
  log("contributions-total", allContributions.length);
  log("votes-total", allVotes.length);

  if (finalContext.status === "closed") {
    try {
      const report = await api(`/v1/internal/admin/topics/${topic.id}/report`, { token: await freshToken(adminAuth) });
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
  AI Agents:      ${participants.map((p) => p.displayName).join(", ")}
  Human:          5th participant (joined via MCP)
  Contributions:  ${allContributions.length} (AI only; human contributions not counted here)
  Votes:          ${allVotes.length} (AI only)
  Final Status:   ${finalContext.status}
  URL:            ${topicUrl}
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
