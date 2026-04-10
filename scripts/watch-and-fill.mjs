#!/usr/bin/env node

/**
 * watch-and-fill.mjs — Watches for open topics with 1-4 members and fills
 * them to 5 with CLI-powered bot agents. Once filled, drives the bots through
 * the debate exactly like run-debate.mjs.
 *
 * Usage:
 *   node scripts/watch-and-fill.mjs
 *   node scripts/watch-and-fill.mjs --model sonnet
 *   node scripts/watch-and-fill.mjs --api-base-url http://localhost:8787
 *   node scripts/watch-and-fill.mjs --poll-interval 15
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
const LLM_MODEL = readFlag("--model", "sonnet");
const POLL_INTERVAL_S = Number(readFlag("--poll-interval", "30"));
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

// ---- LLM via claude CLI ----

async function callClaudeOnce(systemPrompt, userPrompt, cleanCwd) {
  const systemPromptFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, systemPrompt);
  const shellCmd = `claude -p --model ${LLM_MODEL} --system-prompt "$(cat ${JSON.stringify(systemPromptFile).replace(/\\/g, "/")})" --tools "" --no-session-persistence`;
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
    log("llm-retry", { error: firstError.message?.slice(0, 120) });
    await wait(3_000);
    try {
      return await callClaudeOnce(systemPrompt, userPrompt, cleanCwd);
    } finally {
      try { fs.rmSync(cleanCwd, { recursive: true }); } catch {}
    }
  }
}

// ---- Persona generation ----

async function generatePersonas(topicTitle, topicPrompt, count) {
  const systemPrompt = `You generate debate participant personas for a structured research protocol. Each persona is a distinct expert or stakeholder who brings a unique perspective to the topic.

OUTPUT FORMAT — CRITICAL:
Respond with a JSON array of exactly ${count} objects. No prose before or after. No markdown fences.
Each object must have:
- "displayName": A descriptive role title (e.g. "The Labor Economist", "The Skeptical Engineer")
- "bio": 1-2 sentences describing their expertise and perspective (50-100 words)
- "stance": one of "support", "oppose", or "neutral"

Ensure a mix of stances. At least one support, one oppose, and one neutral if count >= 3.`;

  const userPrompt = `Generate ${count} debate personas for this topic:

TITLE: ${topicTitle}
QUESTION: ${topicPrompt}

Respond with a JSON array only:`;

  const raw = await callClaude(systemPrompt, userPrompt);
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  const personas = JSON.parse(cleaned);
  if (!Array.isArray(personas) || personas.length !== count) {
    throw new Error(`Expected ${count} personas, got ${Array.isArray(personas) ? personas.length : typeof personas}`);
  }
  return personas;
}

// ---- Contribution + vote generation (copied from run-debate.mjs) ----

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

For each final-argument contributor, write their @handle followed by the position number (from the MAP ROUND POSITIONS list) that their argument ACTUALLY argues for. Judge by the substance of their thesis and evidence, not by what they self-declared.${mapPositionCount > 0 ? ` There are exactly ${mapPositionCount} positions. Use ONLY the numbers 1 through ${mapPositionCount} — no other numbers are valid.` : ""} Multiple contributors often argue for the SAME position; assign them the same number.`
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
    userPrompt.push("\nREMINDER: Output a single JSON object. Use exact @handles from the opening round. Begin now:");
  } else if (isStructuredRound) {
    userPrompt.push("\nREMINDER: Use the exact section labels specified in the guidance. Write plain prose between labels. No markdown formatting. Begin your contribution now:");
  } else {
    userPrompt.push("\nREMINDER: Write your response as plain prose paragraphs. Do not use any markdown formatting whatsoever — no headers, no bold, no italic, no bullet points, no numbered lists, no horizontal rules. Begin your contribution now:");
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

// ---- Drive a single topic (runs concurrently) ----

async function driveTopic(topicId, adminAuth) {
  const topicLog = `[${topicId.slice(-8)}]`;
  log("drive-start", { topicId });

  // Fetch topic details
  const topicDetail = await api(`/v1/internal/admin/topics/${topicId}`, {
    token: await freshToken(adminAuth),
  });

  const existingCount = topicDetail.activeMemberCount ?? 0;
  const botsNeeded = TARGET_MEMBERS - existingCount;

  if (botsNeeded <= 0) {
    log("drive-skip", { topicId, reason: "already full", members: existingCount });
    activeTopics.delete(topicId);
    return;
  }

  // Generate personas for the bots
  log("persona-gen", { topicId, count: botsNeeded, title: topicDetail.title });
  let personas;
  try {
    personas = await generatePersonas(topicDetail.title, topicDetail.prompt, botsNeeded);
  } catch (err) {
    log("persona-gen-failed", { topicId, error: renderError(err) });
    activeTopics.delete(topicId);
    return;
  }

  // Create guest agents and join
  const participants = [];
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    try {
      const guest = await api("/v1/auth/guest", { method: "POST", expectedStatus: 201 });
      await api(`/v1/beings/${guest.being.id}`, {
        method: "PATCH",
        token: guest.accessToken,
        body: { displayName: persona.displayName, bio: persona.bio },
      });
      const participant = attachTokenState({
        index: i,
        agentId: guest.agent.id,
        beingId: guest.being.id,
        handle: guest.being.handle,
        displayName: persona.displayName,
        stance: persona.stance,
        bio: persona.bio,
      }, guest);

      await api(`/v1/topics/${topicId}/join`, {
        method: "POST", token: guest.accessToken, body: { beingId: guest.being.id },
      });
      participants.push(participant);
      log("bot-joined", { topicId: topicId.slice(-8), who: persona.displayName, stance: persona.stance });
    } catch (err) {
      log("bot-join-failed", { topicId: topicId.slice(-8), who: persona.displayName, error: renderError(err) });
    }
  }

  if (participants.length === 0) {
    log("drive-abort", { topicId, reason: "no bots joined" });
    activeTopics.delete(topicId);
    return;
  }

  log("drive-active", {
    topicId: topicId.slice(-8),
    title: topicDetail.title,
    bots: participants.map((p) => p.displayName),
    model: LLM_MODEL,
  });

  // Drive the debate loop — bots only (human participates through the web UI)
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

    await api("/v1/internal/topics/sweep", { method: "POST", token: await freshToken(adminAuth), body: {} });
    sweepCount++;

    const contexts = await Promise.all(
      participants.map(async (p) => {
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
      } else if (Date.now() - stalledSince >= STALL_CONFIRM_MS) {
        log("terminal", { topic: topicId.slice(-8), status: "stalled" });
        break;
      }
    } else if (stalledSince) {
      stalledSince = null;
    }

    // Generate contributions for bots only
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
      log("llm-batch", { topic: topicId.slice(-8), round: roundKind, agents: pendingContributions.length });

      const results = await Promise.allSettled(
        pendingContributions.map(async ({ participant, context }) => {
          const currentRound = context.currentRound;
          log("llm-call", { who: participant.displayName, round: currentRound.roundKind });
          const body = await generateContribution(participant, context);
          log("llm-done", { who: participant.displayName, round: currentRound.roundKind, length: body.length });
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

        if (refreshedContext.status !== "started" || !refreshedContext.currentRound || refreshedContext.currentRound.id !== currentRound.id) return;
        if (!isBeingActiveInContext(refreshedContext, participant.beingId)) return;
        if (Array.isArray(refreshedContext.ownContributionStatus) && refreshedContext.ownContributionStatus.length > 0) {
          contributionKeys.add(contributionKey);
          return;
        }

        try {
          await api(`/v1/topics/${topicId}/contributions`, {
            method: "POST", token: await freshToken(participant), expectedStatus: [200, 201],
            body: {
              beingId: participant.beingId,
              body,
              stance: participant.stance,
              idempotencyKey: idempotencyKey(["fill", "contrib", topicId.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
            },
          });
          contributionKeys.add(contributionKey);
          allContributions.push({ roundKind: currentRound.roundKind, displayName: participant.displayName });
          log("contribution", { who: participant.displayName, round: currentRound.roundKind });
        } catch (err) {
          log("contribution-failed", { who: participant.displayName, error: err.message?.slice(0, 120) });
        }
      }));
    }

    // Cast votes for bots
    const voteRoundRequired = canonical.status === "started" && Boolean(canonical.currentRoundConfig?.voteRequired);
    const pendingVoters = voteRoundRequired ? contexts.filter(({ participant, context }) => {
      const currentRound = context.currentRound;
      if (!currentRound || context.status !== "started") return false;
      if (!isBeingActiveInContext(context, participant.beingId)) return false;
      return !context.votingObligation?.fulfilled;
    }) : [];

    if (pendingVoters.length > 0 && canonical.currentRound) {
      await wait(2_000);
      log("vote-block-start", { topic: topicId.slice(-8), voterCount: pendingVoters.length });

      await Promise.allSettled(pendingVoters.map(async ({ participant, context }) => {
        const currentRound = context.currentRound;
        const refreshedContext = await api(`/v1/topics/${topicId}/context?beingId=${encodeURIComponent(participant.beingId)}`, {
          token: await freshToken(participant),
        });
        if (refreshedContext.status !== "started" || !refreshedContext.currentRound || refreshedContext.currentRound.id !== currentRound.id) return;
        if (!isBeingActiveInContext(refreshedContext, participant.beingId)) return;
        if (refreshedContext.votingObligation?.fulfilled) return;

        const voteTargets = Array.isArray(refreshedContext.voteTargets) ? refreshedContext.voteTargets : [];
        if (voteTargets.length === 0) return;
        const othersTargets = voteTargets.filter((t) => t.beingId !== participant.beingId);
        if (othersTargets.length < 3) return;

        const transcript = refreshedContext.transcript ?? [];
        const targetTexts = othersTargets.map((t) => {
          const contrib = transcript.find((c) => c.id === t.contributionId);
          return {
            contributionId: t.contributionId,
            beingHandle: t.beingHandle ?? t.beingId,
            body: contrib?.bodyClean?.slice(0, 600) ?? "[contribution not visible]",
          };
        });

        const voteDecisions = await generateVoteDecisions(participant, refreshedContext, targetTexts);
        const batchVotes = [];
        for (const [voteKind, contributionId] of Object.entries(voteDecisions)) {
          const voteKey = `${participant.beingId}:${currentRound.id}:${voteKind}`;
          if (voteKeys.has(voteKey)) continue;
          const target = othersTargets.find((t) => t.contributionId === contributionId) ?? othersTargets[0];
          batchVotes.push({
            contributionId: target.contributionId,
            voteKind,
            idempotencyKey: idempotencyKey(["fill", voteKind, topicId.slice(-12), currentRound.id.slice(-12), participant.beingId.slice(-12)]),
          });
        }
        if (batchVotes.length === 0) return;

        try {
          const batchResult = await api(`/v1/topics/${topicId}/votes/batch`, {
            method: "POST", token: await freshToken(participant), expectedStatus: [200],
            body: { beingId: participant.beingId, votes: batchVotes },
          });
          for (const item of (batchResult.results ?? [])) {
            const voteKey = `${participant.beingId}:${currentRound.id}:${item.voteKind}`;
            if (item.status === "accepted" || item.status === "replayed") {
              voteKeys.add(voteKey);
              allVotes.push({ voter: participant.displayName, voteKind: item.voteKind });
              log("vote", { who: participant.displayName, kind: item.voteKind, status: item.status });
            }
          }
        } catch (err) {
          log("vote-error", { who: participant.displayName, error: err.message?.slice(0, 120) });
        }
      }));
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
  log("config", {
    apiBaseUrl: API_BASE_URL,
    model: LLM_MODEL,
    pollIntervalSeconds: POLL_INTERVAL_S,
    targetMembers: TARGET_MEMBERS,
    logPath: LOG_PATH,
  });

  // Authenticate admin
  const adminTokenData = await api("/v1/auth/token", {
    method: "POST",
    body: { grantType: "client_credentials", clientId: ADMIN_CLIENT_ID, clientSecret: ADMIN_CLIENT_SECRET },
    logRequest: true, logLabel: "admin-auth",
  });
  const adminAuth = attachTokenState({ label: "admin" }, adminTokenData);
  log("admin", { agentId: adminTokenData.agent.id });

  log("polling", `Watching for open topics with 1-${TARGET_MEMBERS - 1} members every ${POLL_INTERVAL_S}s...`);

  while (true) {
    try {
      // Refresh admin token if needed
      await freshToken(adminAuth);

      // List open topics
      const topics = await api("/v1/internal/admin/topics?status=open&pageSize=50", {
        token: await freshToken(adminAuth),
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
          driveTopic(topic.id, adminAuth).catch((err) => {
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
  console.error("FATAL:", err);
  process.exitCode = 1;
});
