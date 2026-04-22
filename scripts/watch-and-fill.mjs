#!/usr/bin/env node

/**
 * watch-and-fill.mjs — Watches for open topics with 1-4 members and fills
 * them with persistent roster beings running mixed models (Codex, Claude, Grok).
 * Once filled, drives the bots through the debate exactly like run-debate-codex.mjs.
 *
 * Usage:
 *   node scripts/watch-and-fill.mjs
 *   node scripts/watch-and-fill.mjs --roster scripts/roster.json
 *   node scripts/watch-and-fill.mjs --api-base-url http://localhost:8787
 *   node scripts/watch-and-fill.mjs --poll-interval 15
 *   node scripts/watch-and-fill.mjs --model gpt-5.4-mini --claude-model sonnet --grok-model grok-4-1-fast-reasoning
 *   node scripts/watch-and-fill.mjs --codex-agents 3
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

const API_BASE_URL = readFlag("--api-base-url", "https://api.opndomain.com");
const CODEX_MODEL = readFlag("--model", "gpt-5.4-mini");
const CLAUDE_MODEL = readFlag("--claude-model", "sonnet");
const GROK_MODEL = readFlag("--grok-model", "grok-4-1-fast-reasoning");
const GROK_API_KEY = process.env.XAI_API_KEY ?? readFlag("--grok-api-key", "");
const CODEX_AGENT_COUNT = Number(readFlag("--codex-agents", 3));
const POLL_INTERVAL_S = Number(readFlag("--poll-interval", "30"));
const ROSTER_PATH = readFlag("--roster", path.resolve("scripts/roster.json"));
const TARGET_MEMBERS = 5;

const ADMIN_CLIENT_ID = "cli_8308c04fc3a813a0e34435e08ec0c5f8";
const ADMIN_CLIENT_SECRET = "_1504zCRV7WRnBQ5dtZycHkcO7LxMsdC7P0Nkj5wTCM";

const LOG_DIR = path.resolve("logs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_PATH = path.join(LOG_DIR, `watch-${RUN_ID}.log`);

// Track topics we're already driving so we don't double-attach
const activeTopics = new Set();

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
    if (logRequest) log(logLabel ?? "api-error", { method, path: apiPath, status: response.status, durationMs: Date.now() - startedAt, code, message });
    throw new Error(`${method} ${apiPath} failed (${response.status}) ${code}: ${message}`);
  }
  if (logRequest) log(logLabel ?? "api-response", { method, path: apiPath, status: response.status, durationMs: Date.now() - startedAt });
  return parsed.data ?? parsed;
}

function idempotencyKey(parts) {
  return parts.map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean).join("-").slice(0, 120);
}

function isBeingActiveInContext(context, beingId) {
  return Array.isArray(context?.members)
    && context.members.some((member) => member.beingId === beingId && member.status === "active");
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

  // Try refresh token first
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

  // Fall back to client credentials re-auth
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

// ---- LLM via Codex CLI ----

async function runCodexPrompt(prompt) {
  return new Promise((resolve, reject) => {
    const args = ["exec", "--full-auto"];
    if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
    args.push("-");

    const proc = spawn("codex", args, {
      shell: true,
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`codex CLI exited ${code}: ${stderr.slice(0, 400)}`));
      else resolve(stdout.trim());
    });
    proc.on("error", reject);
  });
}

async function callCodex(systemPrompt, userPrompt) {
  const combinedPrompt = [
    "You are participating in a structured research debate through the Codex CLI.",
    "",
    "Follow the system instructions below as mandatory requirements.",
    "",
    "SYSTEM INSTRUCTIONS:",
    systemPrompt,
    "",
    "USER CONTEXT:",
    userPrompt,
  ].join("\n");
  return await runCodexPrompt(combinedPrompt);
}

// ---- LLM via Claude CLI ----

async function callClaudeOnce(systemPrompt, userPrompt, cleanCwd) {
  const systemPromptFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, systemPrompt);

  const shellCmd = `claude -p --model ${CLAUDE_MODEL} --system-prompt "$(cat ${JSON.stringify(systemPromptFile).replace(/\\/g, "/")})" --tools "" --no-session-persistence`;

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", ["-c", shellCmd], {
      timeout: 180_000,
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
}

async function callClaude(systemPrompt, userPrompt) {
  const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), "debate-agent-"));
  try {
    return await callClaudeOnce(systemPrompt, userPrompt, cleanCwd);
  } catch (firstError) {
    log("llm-retry", { runner: "claude", error: firstError.message?.slice(0, 120) });
    await wait(3_000);
    try {
      return await callClaudeOnce(systemPrompt, userPrompt, cleanCwd);
    } finally {
      try { fs.rmSync(cleanCwd, { recursive: true }); } catch {}
    }
  }
}

// ---- LLM via Grok (xAI) API ----

async function callGrok(systemPrompt, userPrompt) {
  if (!GROK_API_KEY) throw new Error("XAI_API_KEY not set. Export it or pass --grok-api-key.");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Grok API ${response.status}: ${text.slice(0, 200)}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Grok API returned empty content");
      return content;
    } catch (err) {
      if (attempt === 0) {
        log("llm-retry", { runner: "grok", error: err.message?.slice(0, 120) });
        await wait(3_000);
      } else {
        throw err;
      }
    }
  }
}

// ---- Unified LLM dispatcher ----

async function callLLM(runner, systemPrompt, userPrompt) {
  if (runner === "claude") return callClaude(systemPrompt, userPrompt);
  if (runner === "grok") return callGrok(systemPrompt, userPrompt);
  return callCodex(systemPrompt, userPrompt);
}

// ---- Contribution + vote generation ----

async function generateVoteDecisions(agent, context, targetTexts) {
  const roundInstruction = context.currentRoundConfig?.roundInstruction;
  const votingGuidance = roundInstruction?.votingGuidance ?? "";

  const systemPrompt = `You are "${agent.displayName}" casting votes in a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

You must evaluate the contributions below and select exactly 3 different contributions to vote on, one for each category:

1. most_interesting - the contribution that adds the most novel insight or reframes the debate most productively
2. most_correct - the contribution with the strongest evidence and most defensible reasoning
3. fabrication - the contribution with the most unsupported claims, logical errors, or fabricated evidence (penalty vote)

Each vote MUST target a DIFFERENT contribution. Vote based on argument quality, not agreement.

OUTPUT FORMAT - CRITICAL:
Respond with exactly 3 lines, each in this format:
most_interesting: CONTRIBUTION_ID
most_correct: CONTRIBUTION_ID
fabrication: CONTRIBUTION_ID

Where CONTRIBUTION_ID is the exact ID from the list below. Nothing else - no explanations, no prose.`;

  const contributionList = targetTexts.map((t) =>
    `ID: ${t.contributionId}\nAuthor: @${t.beingHandle}\nText: ${t.body}`
  ).join("\n\n---\n\n");

  const userPrompt = [
    `TOPIC: ${context.title}`,
    `ROUND: ${context.currentRound?.roundKind} (round ${(context.currentRound?.sequenceIndex ?? 0) + 1})`,
    votingGuidance ? `\nVOTING GUIDANCE: ${votingGuidance}` : "",
    `\nCONTRIBUTIONS TO EVALUATE:\n\n${contributionList}`,
    "\nRespond with exactly 3 lines - one per vote kind - using the exact contribution IDs above:",
  ].filter(Boolean).join("\n");

  const runner = agent.runner ?? "codex";
  const model = runner === "claude" ? CLAUDE_MODEL : runner === "grok" ? GROK_MODEL : CODEX_MODEL;
  log("vote-llm-call", { who: agent.displayName, targets: targetTexts.length, model, runner });
  const raw = await callLLM(runner, systemPrompt, userPrompt);
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
  const mapPositionCount = mapPositionList ? mapPositionList.split("\n").filter((l) => l.trim()).length : 0;

  const formatBlock = isJsonRound
    ? `OUTPUT FORMAT:
Output a single valid JSON object. No prose before or after. No markdown fences. The JSON must match the schema described in the GUIDANCE below.
The JSON must also include a top-level "kicker" field: one sentence, <=180 characters. A sharp contestable claim about the debate landscape - your strongest assertion about which positions matter or where the real disagreement lies. Take a side. Do NOT use phrases like "five contributors" or "the debate shows". Read as a claim, not a summary.`
    : roundKind === "final_argument"
    ? `OUTPUT FORMAT:
Follow the GUIDANCE below precisely. Your contribution MUST contain both PART A - MY POSITION and PART B - IMPARTIAL SYNTHESIS sections in that exact order, with the exact labels specified (MAP_POSITION, MY THESIS, WHY I HOLD IT, STRONGEST OBJECTION I CAN'T FULLY ANSWER, CHANGE-MY-MIND STATUS, WHAT THIS DEBATE SETTLED, WHAT REMAINS CONTESTED, NEUTRAL VERDICT, KICKER).
Between labels, write plain prose. No markdown: no headers, no bold, no italic, no bullet points, no code blocks.
PART A is your advocacy - you take a side and defend it. PART B is impartial - you drop your persona and write as a third-party reader. Doing both well is what wins the peer vote.`
    : isFinalVoteRound
    ? `OUTPUT FORMAT - THIS IS CRITICAL:
Write your vote reasoning as plain prose paragraphs. No markdown formatting.

After your prose, on a new line, append:
KICKER: <one sentence, <=180 characters - your sharpest claim about the debate outcome.>

Then on a new line, append your position audit:
MAP_POSITION_AUDIT:
@handle1: N
@handle2: N
@handle3: N

For each final-argument contributor, write their @handle followed by the position number (from the MAP ROUND POSITIONS list) that their argument ACTUALLY argues for. Judge by the substance of their thesis and evidence, not by what they self-declared.${mapPositionCount > 0 ? ` There are exactly ${mapPositionCount} positions. Use ONLY the numbers 1 through ${mapPositionCount} — no other numbers are valid.` : ""} Multiple contributors often argue for the SAME position; assign them the same number.`
    : `OUTPUT FORMAT - THIS IS CRITICAL:
You must write plain prose paragraphs only. Your output will be displayed directly on a web page that does not render markdown.
NEVER use: headers, bold, italic, bullet points, numbered lists, block quotes, code blocks, or any markdown syntax whatsoever.
Do not write a title, label, or thesis header. Start directly with your argument.

After your prose, on a new line, append:
KICKER: <one sentence, <=180 characters. This must be a verbatim or near-verbatim distillation of the single sharpest claim you wrote in the prose above - the most contestable, side-taking sentence in your own contribution. Start with a noun or strong verb. The line must take a position someone could disagree with. DO NOT summarize the round, do NOT describe the debate, do NOT use phrases like "five contributors", "this debate", "the question is", "the contributions show", or "in conclusion". The kicker must read as your claim, not commentary about the room.>`;

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
        ? `\nMAP ROUND POSITIONS - use these numbers in your MAP_POSITION_AUDIT block:\n${mapPositionList}`
        : `\nMAP_POSITION OPTIONS - pick exactly one of these numbers when you write your MAP_POSITION line:\n${mapPositionList}`;
      userPrompt.push(posLabel);
    }
  }

  if (finalArgsBlock) {
    userPrompt.push(finalArgsBlock);
  }

  if (isJsonRound) {
    userPrompt.push("\nREMINDER: Output a single JSON object. Use exact @handles from the opening round. Begin now:");
  } else if (isStructuredRound) {
    userPrompt.push("\nREMINDER: Use the exact section labels specified in the guidance. Write plain prose between labels. No markdown formatting. Begin your contribution now:");
  } else {
    userPrompt.push("\nREMINDER: Write your response as plain prose paragraphs. Do not use any markdown formatting whatsoever - no headers, no bold, no italic, no bullet points, no numbered lists, no horizontal rules. Begin your contribution now:");
  }

  const runner = agent.runner ?? "codex";
  const content = await callLLM(runner, systemPrompt, userPrompt.join("\n"));
  if (!content) throw new Error(`${runner} CLI returned empty output`);

  if (isJsonRound) {
    return content
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }

  if (content.length > 19000) {
    const truncated = content.slice(0, 19000).replace(/\s\S*$/, "");
    log("llm-truncated", { who: agent.displayName, original: content.length, truncated: truncated.length });
    return truncated;
  }
  return content;
}

// ---- Load roster ----

function loadRoster() {
  const rosterFile = path.resolve(ROSTER_PATH);
  if (!fs.existsSync(rosterFile)) {
    throw new Error(`Roster file not found: ${rosterFile}. Pass --roster <path> or create scripts/roster.json.`);
  }
  return JSON.parse(fs.readFileSync(rosterFile, "utf-8"));
}

// ---- Drive a single topic (runs concurrently) ----

async function driveTopic(topicId, rosterAuth, roster) {
  log("drive-start", { topicId });

  // Fetch topic details
  const topicDetail = await api(`/v1/internal/admin/topics/${topicId}`, {
    token: await freshToken(rosterAuth),
  });

  const existingCount = topicDetail.activeMemberCount ?? 0;
  const botsNeeded = TARGET_MEMBERS - existingCount;

  if (botsNeeded <= 0) {
    log("drive-skip", { topicId, reason: "already full", members: existingCount });
    activeTopics.delete(topicId);
    return;
  }

  // Pick roster beings to fill the topic (round-robin from roster, skip any already joined)
  const existingMembers = new Set();
  try {
    const topicContext = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(roster.agents[0].beingId)}`, {
      token: await freshToken(rosterAuth),
    });
    if (Array.isArray(topicContext.members)) {
      for (const m of topicContext.members) existingMembers.add(m.beingId);
    }
  } catch {}

  const availableRosterAgents = roster.agents.filter((r) => !existingMembers.has(r.beingId));
  const agentsToJoin = availableRosterAgents.slice(0, botsNeeded);

  if (agentsToJoin.length === 0) {
    log("drive-abort", { topicId, reason: "no available roster agents", existing: existingMembers.size, rosterSize: roster.agents.length });
    activeTopics.delete(topicId);
    return;
  }

  // Build participants from roster beings — all share the admin agent's credentials
  const participants = [];
  for (let i = 0; i < agentsToJoin.length; i++) {
    const rosterEntry = agentsToJoin[i];
    const runner = rosterEntry.runner ?? (i < CODEX_AGENT_COUNT ? "codex" : "claude");

    // Determine stance dynamically based on position
    const stances = ["support", "oppose", "neutral", "support", "oppose"];
    const stance = stances[i % stances.length];

    const participant = attachTokenState({
      index: i,
      agentId: roster.adminAgentId,
      beingId: rosterEntry.beingId,
      handle: rosterEntry.handle,
      displayName: rosterEntry.displayName,
      stance,
      bio: rosterEntry.bio,
      runner,
      _clientId: roster.adminClientId,
      _clientSecret: roster.adminClientSecret,
    }, rosterAuth);
    participants.push(participant);
  }

  // Join the topic
  for (const p of participants) {
    try {
      await api(`/v1/topics/${topicId}/join`, {
        method: "POST", token: await freshToken(p), body: { beingId: p.beingId },
      });
      log("bot-joined", { topicId: topicId.slice(-8), who: p.displayName, stance: p.stance, runner: p.runner });
    } catch (err) {
      log("bot-join-failed", { topicId: topicId.slice(-8), who: p.displayName, error: renderError(err) });
    }
  }

  // Filter to only participants that actually joined
  const joinedParticipants = [];
  for (const p of participants) {
    try {
      const ctx = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(p.beingId)}`, {
        token: await freshToken(p),
      });
      if (isBeingActiveInContext(ctx, p.beingId)) {
        joinedParticipants.push(p);
      }
    } catch {}
  }

  if (joinedParticipants.length === 0) {
    log("drive-abort", { topicId, reason: "no bots joined" });
    activeTopics.delete(topicId);
    return;
  }

  log("drive-active", {
    topicId: topicId.slice(-8),
    title: topicDetail.title,
    bots: joinedParticipants.map((p) => `@${p.handle} [${p.runner}]`),
    models: { codex: CODEX_MODEL, claude: CLAUDE_MODEL, grok: GROK_MODEL },
  });

  // Drive the debate loop
  const contributionKeys = new Set();
  const voteKeys = new Set();
  let lastTransitionKey = null;
  let stalledSince = null;
  const STALL_CONFIRM_MS = 180_000;
  const deadlineMs = Date.now() + 60 * 60_000;
  let sweepCount = 0;
  const allVotes = [];
  const allContributions = [];
  let loopCount = 0;

  while (Date.now() < deadlineMs) {
    loopCount++;

    try {
      const sweep = await api("/v1/internal/topics/sweep", { method: "POST", token: await freshToken(rosterAuth), body: {} });
      sweepCount++;
      if (sweep?.mutatedTopicIds?.length > 0) log("sweep", { topic: topicId.slice(-8), count: sweepCount, mutated: sweep.mutatedTopicIds });
    } catch (sweepErr) {
      if (loopCount % 20 === 1) log("sweep-error", { topic: topicId.slice(-8), error: sweepErr.message?.slice(0, 120) });
    }

    const contexts = await Promise.all(
      joinedParticipants.map(async (p) => {
        const token = await freshToken(p);
        const context = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(p.beingId)}`, { token });
        return { participant: p, context };
      }),
    );

    const canonical = contexts[0]?.context;
    if (!canonical || typeof canonical.status !== "string") {
      await wait(5_000);
      continue;
    }

    const transitionKey = `${canonical.status}:${canonical.currentRound?.id ?? "none"}`;
    if (transitionKey !== lastTransitionKey) {
      lastTransitionKey = transitionKey;
      log("transition", {
        topic: topicId.slice(-8),
        status: canonical.status,
        roundIndex: canonical.currentRound?.sequenceIndex ?? null,
        roundKind: canonical.currentRound?.roundKind ?? null,
      });
    }

    if (loopCount % 10 === 0) {
      log("heartbeat", { topic: topicId.slice(-8), loop: loopCount, contributions: allContributions.length, votes: allVotes.length });
    }

    if (canonical.status === "closed") {
      log("terminal", { topic: topicId.slice(-8), status: "closed" });
      break;
    }
    if (canonical.status === "stalled") {
      if (!stalledSince) {
        stalledSince = Date.now();
        log("stall-observed", { topic: topicId.slice(-8), willConfirmInMs: STALL_CONFIRM_MS });
      } else if (Date.now() - stalledSince >= STALL_CONFIRM_MS) {
        log("terminal", { topic: topicId.slice(-8), status: "stalled" });
        break;
      }
    } else if (stalledSince) {
      log("stall-cleared", { topic: topicId.slice(-8), recoveredAfterMs: Date.now() - stalledSince });
      stalledSince = null;
    }

    // Generate contributions for bots
    const pendingContributions = contexts.filter(({ participant, context }) => {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") return false;
      if (!isBeingActiveInContext(context, participant.beingId)) return false;
      const contributionKey = `${participant.beingId}:${currentRound.id}`;
      if (contributionKeys.has(contributionKey)) return false;
      if (Array.isArray(context.ownContributionStatus) && context.ownContributionStatus.length > 0) return false;
      return true;
    });

    if (pendingContributions.length > 0) {
      const roundKind = pendingContributions[0].context.currentRound.roundKind;
      const codexCount = pendingContributions.filter(({ participant }) => participant.runner === "codex").length;
      const claudeCount = pendingContributions.filter(({ participant }) => participant.runner === "claude").length;
      const grokCount = pendingContributions.filter(({ participant }) => participant.runner === "grok").length;
      log("llm-batch", { topic: topicId.slice(-8), round: roundKind, agents: pendingContributions.length, codex: codexCount, claude: claudeCount, grok: grokCount });

      const results = await Promise.allSettled(
        pendingContributions.map(async ({ participant, context }) => {
          const currentRound = context.currentRound;
          const model = participant.runner === "claude" ? CLAUDE_MODEL : participant.runner === "grok" ? GROK_MODEL : CODEX_MODEL;
          log("llm-call", { who: participant.displayName, round: currentRound.roundKind, model, runner: participant.runner });
          const body = await generateContribution(participant, context);
          log("llm-done", { who: participant.displayName, round: currentRound.roundKind, length: body.length, preview: body.slice(0, 120) });
          return { participant, context, body };
        }),
      );

      const submissionResults = await Promise.allSettled(results.map(async (result) => {
        if (result.status === "rejected") {
          log("llm-error", { error: renderError(result.reason) });
          return;
        }
        const { participant, context, body } = result.value;
        const currentRound = context.currentRound;
        const contributionKey = `${participant.beingId}:${currentRound.id}`;
        const refreshedContext = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(participant.beingId)}`, {
          token: await freshToken(participant),
        });

        if (refreshedContext.status !== "started" || !refreshedContext.currentRound || refreshedContext.currentRound.id !== currentRound.id) {
          log("contribution-skipped", { who: participant.displayName, reason: "round_changed_before_submit" });
          return;
        }
        if (!isBeingActiveInContext(refreshedContext, participant.beingId)) {
          log("contribution-skipped", { who: participant.displayName, reason: "member_not_active_before_submit" });
          return;
        }
        if (Array.isArray(refreshedContext.ownContributionStatus) && refreshedContext.ownContributionStatus.length > 0) {
          contributionKeys.add(contributionKey);
          log("contribution-replayed", { who: participant.displayName, round: currentRound.roundKind });
          return;
        }

        try {
          const contribResult = await api(`/v1/topics/${topicId}/contributions`, {
            method: "POST", token: await freshToken(participant), expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["fill", "contrib", topicId.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          contributionKeys.add(contributionKey);
          allContributions.push({ roundKind: currentRound.roundKind, displayName: participant.displayName, runner: participant.runner });
          log("contribution", { who: participant.displayName, round: currentRound.roundKind, runner: participant.runner });

          // Record model provenance
          if (contribResult?.id) {
            const model = participant.runner === "grok" ? "grok-4.1" : participant.runner === "claude" ? "sonnet-4.6" : CODEX_MODEL;
            const provider = participant.runner === "grok" ? "xai" : participant.runner === "claude" ? "anthropic" : "openai";
            try {
              await api(`/v1/topics/${topicId}/contributions/${contribResult.id}/provenance`, {
                method: "POST", token: await freshToken(participant), expectedStatus: [200],
                body: { beingId: participant.beingId, contributionId: contribResult.id, provider, model },
              });
            } catch (provErr) {
              log("provenance-failed", { who: participant.displayName, error: provErr.message?.slice(0, 120) });
            }
          }
        } catch (err) {
          log("contribution-failed", { who: participant.displayName, error: err.message?.slice(0, 120) });
        }
      }));
      for (const result of submissionResults) {
        if (result.status === "rejected") {
          log("contribution-submit-error", { error: renderError(result.reason) });
        }
      }
    }

    // Cast votes for bots
    const pendingVoters = contexts.filter(({ participant, context }) => {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") return false;
      if (!isBeingActiveInContext(context, participant.beingId)) return false;
      return !context.votingObligation?.fulfilled;
    });

    if (pendingVoters.length > 0) {
      const voterContexts = await Promise.all(
        pendingVoters.map(async ({ participant }) => {
          const ctx = await api(`/v1/topics/${topicId}/context?beingId=${participant.beingId}`, { token: await freshToken(participant) });
          return { participant, context: ctx };
        }),
      );

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

      const voteSubmissionResults = await Promise.allSettled(voteResults.map(async (result) => {
        if (result.status === "rejected") {
          log("vote-llm-error", { error: renderError(result.reason) });
          return;
        }
        if (!result.value) return;
        const { participant, context: ctx, voteDecisions, othersTargets } = result.value;
        const currentRound = ctx.currentRound;
        const refreshedContext = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(participant.beingId)}`, {
          token: await freshToken(participant),
        });

        if (refreshedContext.status !== "started" || !refreshedContext.currentRound || refreshedContext.currentRound.id !== currentRound.id) {
          log("vote-skipped", { who: participant.displayName, reason: "round_changed_before_submit" });
          return;
        }
        if (!isBeingActiveInContext(refreshedContext, participant.beingId)) {
          log("vote-skipped", { who: participant.displayName, reason: "member_not_active_before_submit" });
          return;
        }
        if (refreshedContext.votingObligation?.fulfilled) {
          log("vote-replayed", { who: participant.displayName, round: currentRound.roundKind });
          return;
        }

        const requiredVoteKinds = ["most_interesting", "most_correct", "fabrication"];
        const alreadyCastKinds = new Set(Object.keys(refreshedContext.votingObligation?.votesCastByKind ?? {}));
        const batchVotes = [];

        for (const voteKind of requiredVoteKinds) {
          const contributionId = voteDecisions[voteKind];
          if (!contributionId) {
            log("vote-batch-skipped", { who: participant.displayName, reason: "missing_vote_kind", voteKind });
            return;
          }
          const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
          if (voteKeys.has(voteKey) || alreadyCastKinds.has(voteKind)) continue;

          const target = othersTargets.find((t) => t.contributionId === contributionId) ?? othersTargets[0];
          batchVotes.push({
            contributionId: target.contributionId,
            voteKind,
            idempotencyKey: idempotencyKey(["fill", voteKind, topicId.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
          });
        }

        if (batchVotes.length === 0) {
          log("vote-replayed", { who: participant.displayName, round: currentRound.roundKind });
          return;
        }

        try {
          const batchResult = await api(`/v1/topics/${topicId}/votes/batch`, {
            method: "POST", token: await freshToken(participant), expectedStatus: [200],
            body: { beingId: participant.beingId, votes: batchVotes },
          });
          for (const item of (batchResult.results ?? [])) {
            const voteKey = `${participant.beingId}:${currentRound.id}:${item.voteKind}`;
            if (item.status === "accepted" || item.status === "replayed") {
              voteKeys.add(voteKey);
              allVotes.push({ voter: participant.displayName, voteKind: item.voteKind, runner: participant.runner });
              log("vote", { who: participant.displayName, kind: item.voteKind, target: item.contributionId, status: item.status });
            } else {
              log("vote-item-failed", { who: participant.displayName, kind: item.voteKind, code: item.code, message: item.message?.slice(0, 120) });
            }
          }
        } catch (err) {
          log("vote-batch-error", { who: participant.displayName, error: err.message?.slice(0, 120) });
        }
      }));
      for (const result of voteSubmissionResults) {
        if (result.status === "rejected") {
          log("vote-submit-error", { error: renderError(result.reason) });
        }
      }
    }

    await wait(3_000);
  }

  log("drive-complete", {
    topicId: topicId.slice(-8),
    title: topicDetail.title,
    contributions: allContributions.length,
    votes: allVotes.length,
    url: `${API_BASE_URL.replace("api.", "")}/topics/${topicId}`,
  });

  activeTopics.delete(topicId);
}

// ---- Main poll loop ----

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, "");

  logStep("watch-and-fill started");

  // Load roster
  const roster = loadRoster();
  log("roster", {
    path: ROSTER_PATH,
    agents: roster.agents.map((a) => `@${a.handle} [${a.runner ?? "codex"}]`),
  });

  log("config", {
    apiBaseUrl: API_BASE_URL,
    codexModel: CODEX_MODEL,
    claudeModel: CLAUDE_MODEL,
    grokModel: GROK_MODEL,
    pollIntervalSeconds: POLL_INTERVAL_S,
    targetMembers: TARGET_MEMBERS,
    rosterAgents: roster.agents.length,
    logPath: LOG_PATH,
  });

  // Authenticate using roster admin credentials
  const rosterTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: roster.adminClientId, clientSecret: roster.adminClientSecret },
    logRequest: true, logLabel: "roster-auth",
  });
  const rosterAuth = attachTokenState({
    label: "roster-admin",
    _clientId: roster.adminClientId,
    _clientSecret: roster.adminClientSecret,
  }, rosterTokenData);
  log("admin", { agentId: rosterTokenData.agent.id });

  log("polling", `Watching for open topics with 1-${TARGET_MEMBERS - 1} members every ${POLL_INTERVAL_S}s...`);

  while (true) {
    try {
      await freshToken(rosterAuth);

      // List open topics
      const topics = await api("/v1/internal/admin/topics?status=open&pageSize=50", {
        token: await freshToken(rosterAuth),
      });

      const topicList = Array.isArray(topics) ? topics : (topics.items ?? topics.topics ?? []);

      for (const topic of topicList) {
        const memberCount = topic.activeMemberCount ?? 0;
        if (memberCount >= 1 && memberCount < TARGET_MEMBERS && !activeTopics.has(topic.id)) {
          activeTopics.add(topic.id);
          log("topic-found", {
            id: topic.id,
            title: topic.title,
            members: memberCount,
            filling: TARGET_MEMBERS - memberCount,
          });
          // Drive in background — don't block the poll loop
          driveTopic(topic.id, rosterAuth, roster).catch((err) => {
            log("drive-error", { topicId: topic.id, error: renderError(err) });
            activeTopics.delete(topic.id);
          });
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
