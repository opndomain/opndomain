#!/usr/bin/env node

/**
 * run-debate.mjs — Offline 10-round, 5-agent structured debate runner.
 *
 * No API, no account, no internet required (with Ollama).
 * Reads a scenario JSON, drives 5 agents through 10 rounds of structured
 * debate, and writes a full transcript + LLM-as-judge verdict to output/.
 *
 * Usage:
 *   node run-debate.mjs scenarios/tiger-woods.json
 *   node run-debate.mjs scenarios/tiger-woods.json --provider openai --model gpt-4o
 *   node run-debate.mjs scenarios/tiger-woods.json --context-dir ./my-research/
 *   node run-debate.mjs scenarios/tiger-woods.json --provider ollama --model llama3.1
 *
 * Scenario JSON shape:
 *   {
 *     "title": "Is Tiger Woods the Best Golfer Ever?",
 *     "prompt": "Evaluate Tiger Woods's claim to...",
 *     "agents": [
 *       {
 *         "displayName": "The Statistician",
 *         "bio": "Numbers-first golf analyst...",
 *         "stance": "support",
 *         "provider": "anthropic",   // optional per-agent override
 *         "model": "claude-sonnet-4-20250514"  // optional per-agent override
 *       }
 *     ]
 *   }
 */

import fs from "node:fs";
import path from "node:path";
import { DEBATE_ROUNDS, VOTE_KINDS } from "./templates.mjs";
import { resolveDefaultRoundInstruction } from "./round-instructions.mjs";

// ---- CLI parsing ----

function readFlag(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const scenarioPath = process.argv[2];
if (!scenarioPath || scenarioPath.startsWith("--")) {
  console.error(`
Usage: node run-debate.mjs <scenario.json> [options]

Options:
  --provider PROVIDER   Default LLM provider: anthropic, openai, ollama (default: from .env or anthropic)
  --model MODEL         Default model override (default: provider-specific)
  --context-dir DIR     Directory of reference files to inject into agent prompts
  --output-dir DIR      Output directory (default: ./output)
  --verbose             Show full LLM prompts and responses
`);
  process.exit(1);
}

// Load .env if present (simple key=value, no dependency needed)
try {
  const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch {}

const scenario = JSON.parse(fs.readFileSync(path.resolve(scenarioPath), "utf-8"));
const DEFAULT_PROVIDER = readFlag("--provider", process.env.DEFAULT_PROVIDER ?? "anthropic");
const DEFAULT_MODEL = readFlag("--model", process.env.DEFAULT_MODEL ?? undefined);
const CONTEXT_DIR = readFlag("--context-dir", null);
const OUTPUT_DIR = readFlag("--output-dir", path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "output"));
const VERBOSE = process.argv.includes("--verbose");

// ---- Provider loading ----

const providerCache = {};

async function loadProvider(providerName) {
  if (providerCache[providerName]) return providerCache[providerName];
  const modulePath = `./providers/${providerName}.mjs`;
  try {
    const mod = await import(modulePath);
    providerCache[providerName] = mod;
    return mod;
  } catch (err) {
    throw new Error(`Cannot load provider "${providerName}": ${err.message}\nAvailable: anthropic, openai, ollama`);
  }
}

async function callLLM(providerName, model, systemPrompt, userPrompt) {
  const mod = await loadProvider(providerName);
  const provider = model ? mod.createProvider({ model }) : mod;
  return provider.generate(systemPrompt, userPrompt);
}

// ---- Context injection ----

let referenceContext = "";
if (CONTEXT_DIR) {
  const contextPath = path.resolve(CONTEXT_DIR);
  if (fs.existsSync(contextPath) && fs.statSync(contextPath).isDirectory()) {
    const files = fs.readdirSync(contextPath).filter((f) => /\.(txt|md|json|csv)$/i.test(f)).sort();
    const parts = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(contextPath, file), "utf-8").trim();
      if (content) parts.push(`--- ${file} ---\n${content}`);
    }
    if (parts.length > 0) {
      referenceContext = `\nREFERENCE MATERIAL (provided by the operator):\n${parts.join("\n\n")}\n`;
      console.log(`Loaded ${parts.length} reference files from ${CONTEXT_DIR}`);
    }
  } else {
    console.error(`Warning: --context-dir "${CONTEXT_DIR}" not found or not a directory`);
  }
}

// ---- Logging ----

function log(label, payload) {
  const time = new Date().toISOString().slice(11, 19);
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload);
  console.log(`[${time}] ${label}: ${rendered}`);
}

function logStep(msg) {
  console.log(`\n${"=".repeat(60)}\n  ${msg}\n${"=".repeat(60)}`);
}

// ---- Local state ----

const transcript = [];   // Array of { roundIndex, roundKind, agentIndex, displayName, handle, body, stance }
const votes = [];         // Array of { roundIndex, roundKind, voterIndex, voterHandle, voteKind, targetHandle }

// Assign stable handles to agents
const agents = scenario.agents.map((a, i) => ({
  ...a,
  index: i,
  handle: a.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  provider: a.provider ?? DEFAULT_PROVIDER,
  model: a.model ?? DEFAULT_MODEL,
}));

// ---- Contribution generation ----

function buildContributionPrompt(agent, roundDef, roundInstruction) {
  const roundKind = roundDef.roundKind;
  const roundIndex = roundDef.sequenceIndex;
  const isFinalVoteRound = roundKind === "vote" && roundIndex === 9;

  // Build prior contributions from transcript
  const priorContributions = transcript
    .filter((c) => c.body)
    .map((c) => `[@${c.handle}] ${c.body}`)
    .slice(-20);

  // For final_argument and final vote round, inject map-round contributions
  let mapRoundBlock = "";
  let mapPositionList = "";
  if (roundKind === "final_argument" || isFinalVoteRound) {
    const mapContribs = transcript.filter((c) => c.roundKind === "map" && c.body);
    if (mapContribs.length > 0) {
      // Use first map contribution (offline doesn't have scores)
      const best = mapContribs[0];
      mapRoundBlock = `\n\nMAP ROUND POSITIONS (from @${best.handle}):\n${best.body}`;
      try {
        const parsed = JSON.parse(best.body);
        if (Array.isArray(parsed?.positions)) {
          mapPositionList = parsed.positions
            .map((p, i) => `  ${i + 1}. ${p.statement ?? p.label ?? "(unnamed)"}`)
            .join("\n");
        }
      } catch {}
    }
  }

  // For round 9 (final vote), inject all final_argument contributions
  let finalArgsBlock = "";
  if (isFinalVoteRound) {
    const finalArgContribs = transcript.filter((c) => c.roundKind === "final_argument" && c.body);
    if (finalArgContribs.length > 0) {
      const entries = finalArgContribs.map((c) => `[@${c.handle}] ${c.body}`).join("\n\n");
      finalArgsBlock = `\nFINAL ARGUMENTS TO AUDIT (full text):\n${entries}`;
    }
  }

  const isJsonRound = roundKind === "map";
  const mapPositionCount = mapPositionList ? mapPositionList.split("\n").filter((l) => l.trim()).length : 0;

  const formatBlock = isJsonRound
    ? `OUTPUT FORMAT:
Output a single valid JSON object. No prose before or after. No markdown fences. The JSON must match the schema described in the GUIDANCE below.
The JSON must also include a top-level "kicker" field: one sentence, \u2264180 characters. A sharp contestable CLAIM about the debate landscape \u2014 your strongest assertion about which positions matter or where the real disagreement lies. Take a side. Do NOT use phrases like "five contributors" or "the debate shows". Read as a claim, not a summary.`
    : roundKind === "final_argument"
    ? `OUTPUT FORMAT:
Follow the GUIDANCE below precisely. Your contribution MUST contain both PART A \u2014 MY POSITION and PART B \u2014 IMPARTIAL SYNTHESIS sections in that exact order, with the exact labels specified (MAP_POSITION, MY THESIS, WHY I HOLD IT, STRONGEST OBJECTION I CAN'T FULLY ANSWER, WHAT THIS DEBATE SETTLED, WHAT REMAINS CONTESTED, NEUTRAL VERDICT, KICKER).
Between labels, write plain prose. No markdown: no # headers, no **bold**, no *italic*, no bullet points, no code blocks.
PART A is your advocacy \u2014 you take a side and defend it. PART B is impartial \u2014 you drop your persona and write as a third-party reader. Doing both well is what wins the peer vote.`
    : isFinalVoteRound
    ? `OUTPUT FORMAT \u2014 THIS IS CRITICAL:
Write your vote reasoning as plain prose paragraphs. No markdown formatting.

After your prose, on a new line, append:
KICKER: <one sentence, \u2264180 characters \u2014 your sharpest claim about the debate outcome.>

Then on a new line, append your position audit:
MAP_POSITION_AUDIT:
@handle1: N
@handle2: N
@handle3: N

For each final-argument contributor, write their @handle followed by the position number (from the MAP ROUND POSITIONS list) that their argument ACTUALLY argues for. Judge by the substance of their thesis and evidence, not by what they self-declared.${mapPositionCount > 0 ? ` There are exactly ${mapPositionCount} positions. Use ONLY the numbers 1 through ${mapPositionCount} \u2014 no other numbers are valid.` : ""} Multiple contributors often argue for the SAME position; assign them the same number.`
    : `OUTPUT FORMAT \u2014 THIS IS CRITICAL:
You must write plain prose paragraphs only. Your output will be displayed directly on a web page that does not render markdown.
NEVER use: # headers, ## subheaders, **bold**, *italic*, bullet points (- or *), numbered lists, block quotes, code blocks, or any markdown syntax whatsoever.
Do not write a title, label, or thesis header. Start directly with your argument.

After your prose, on a new line, append:
KICKER: <one sentence, \u2264180 characters. This must be a verbatim or near-verbatim distillation of the single sharpest CLAIM you wrote in the prose above \u2014 the most contestable, side-taking sentence in your own contribution. Start with a noun or strong verb. The line must take a position someone could disagree with. DO NOT summarize the round, do NOT describe the debate, do NOT use phrases like "five contributors", "this debate", "the question is", "the contributions show", or "in conclusion". The kicker must read as YOUR claim, not commentary about the room.>`;

  const systemPrompt = `You are "${agent.displayName}" writing a contribution for a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}
${referenceContext}
${formatBlock}

Write 2-3 paragraphs, 150-350 words (structured rounds may be longer to accommodate required sections). Stay in character. Engage with prior contributions by name when they exist. Cite specific data, examples, or reasoning.`;

  const userPrompt = [
    `TOPIC: ${scenario.title}`,
    `RESEARCH QUESTION: ${scenario.prompt}`,
    `CURRENT ROUND: ${roundKind} (round ${roundIndex + 1} of ${DEBATE_ROUNDS.length})`,
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
        ? `\nMAP ROUND POSITIONS \u2014 use these numbers in your MAP_POSITION_AUDIT block:\n${mapPositionList}`
        : `\nMAP_POSITION OPTIONS \u2014 pick exactly one of these numbers when you write your MAP_POSITION line:\n${mapPositionList}`;
      userPrompt.push(posLabel);
    }
  }

  if (finalArgsBlock) {
    userPrompt.push(finalArgsBlock);
  }

  if (isJsonRound) {
    userPrompt.push(`\nREMINDER: Output a single JSON object. Use exact @handles from the opening round. The handles are: ${agents.map((a) => "@" + a.handle).join(", ")}. Begin now:`);
  } else if (roundKind === "final_argument") {
    userPrompt.push(`\nREMINDER: Use the exact section labels specified in the guidance. Write plain prose between labels. No markdown formatting. Begin your contribution now:`);
  } else {
    userPrompt.push(`\nREMINDER: Write your response as plain prose paragraphs. Do not use any markdown formatting whatsoever \u2014 no headers, no bold, no italic, no bullet points, no numbered lists, no horizontal rules. Begin your contribution now:`);
  }

  return { systemPrompt, userPrompt: userPrompt.join("\n") };
}

// ---- Vote generation ----

function buildVotePrompt(agent, roundDef, roundInstruction) {
  const roundIndex = roundDef.sequenceIndex;
  const isFinalVoteRound = roundIndex === 9;

  // Get contributions from the prior round (the round being voted on)
  const priorRoundIndex = roundIndex - 1;
  const priorContribs = transcript.filter(
    (c) => c.roundIndex === priorRoundIndex && c.agentIndex !== agent.index
  );

  if (priorContribs.length < 3) {
    log("vote-skip", { who: agent.displayName, reason: "fewer than 3 other contributions", count: priorContribs.length });
    return null;
  }

  const votingGuidance = roundInstruction?.votingGuidance ?? "";

  const systemPrompt = `You are "${agent.displayName}" casting votes in a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

You must evaluate the contributions below and select exactly 3 different contributions to vote on, one for each category:

1. most_interesting \u2014 the contribution that adds the most novel insight or reframes the debate most productively
2. most_correct \u2014 the contribution with the strongest evidence and most defensible reasoning
3. fabrication \u2014 the contribution with the most unsupported claims, logical errors, or fabricated evidence (penalty vote)

Each vote MUST target a DIFFERENT contribution. Vote based on argument quality, not agreement.

OUTPUT FORMAT \u2014 CRITICAL:
Respond with exactly 3 lines, each in this format:
most_interesting: HANDLE
most_correct: HANDLE
fabrication: HANDLE

Where HANDLE is the exact @handle from the list below. Nothing else \u2014 no explanations, no prose.`;

  const contributionList = priorContribs
    .map((c) => `Handle: @${c.handle}\nText: ${c.body?.slice(0, 600) ?? "[empty]"}`)
    .join("\n\n---\n\n");

  const userPrompt = [
    `TOPIC: ${scenario.title}`,
    `ROUND: vote (round ${roundIndex + 1})`,
    votingGuidance ? `\nVOTING GUIDANCE: ${votingGuidance}` : "",
    `\nCONTRIBUTIONS TO EVALUATE:\n\n${contributionList}`,
    `\nRespond with exactly 3 lines \u2014 one per vote kind \u2014 using the exact @handles above:`,
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

function parseVoteResponse(raw, validHandles) {
  const decisions = {};
  const validSet = new Set(validHandles);

  for (const line of raw.split("\n")) {
    const match = line.match(/^(most_interesting|most_correct|fabrication)\s*:\s*@?(\S+)/i);
    if (match) {
      const kind = match[1].toLowerCase();
      const handle = match[2].trim().replace(/^@/, "");
      if (validSet.has(handle) && !Object.values(decisions).includes(handle)) {
        decisions[kind] = handle;
      }
    }
  }

  // Fallback: if LLM didn't return valid structured output, assign mechanically
  const usedHandles = new Set(Object.values(decisions));
  const remaining = validHandles.filter((h) => !usedHandles.has(h));
  for (const kind of VOTE_KINDS) {
    if (!decisions[kind] && remaining.length > 0) {
      decisions[kind] = remaining.shift();
    }
  }

  return decisions;
}

// ---- Vote round contribution (written reasoning) ----

function buildVoteContributionPrompt(agent, roundDef, roundInstruction) {
  const roundIndex = roundDef.sequenceIndex;
  const priorRoundIndex = roundIndex - 1;
  const priorContribs = transcript.filter((c) => c.roundIndex === priorRoundIndex);

  const contributionList = priorContribs
    .map((c) => `[@${c.handle}] ${c.body?.slice(0, 600) ?? "[empty]"}`)
    .join("\n\n");

  // For final vote, inject map positions and final arguments
  let mapBlock = "";
  let finalArgsBlock = "";
  if (roundIndex === 9) {
    const mapContribs = transcript.filter((c) => c.roundKind === "map" && c.body);
    if (mapContribs.length > 0) {
      mapBlock = `\n\nMAP ROUND POSITIONS (from @${mapContribs[0].handle}):\n${mapContribs[0].body}`;
    }
    const finalArgContribs = transcript.filter((c) => c.roundKind === "final_argument" && c.body);
    if (finalArgContribs.length > 0) {
      finalArgsBlock = `\nFINAL ARGUMENTS (full text):\n${finalArgContribs.map((c) => `[@${c.handle}] ${c.body}`).join("\n\n")}`;
    }
  }

  const systemPrompt = `You are "${agent.displayName}" writing vote reasoning for a structured research debate.

Persona: ${agent.bio}
Stance: ${agent.stance}

Write 1-2 paragraphs of vote reasoning as plain prose. Explain which arguments you found strongest and why. No markdown formatting.`;

  const userPrompt = [
    `TOPIC: ${scenario.title}`,
    `ROUND: vote (round ${roundIndex + 1}) \u2014 write your vote reasoning`,
    roundInstruction?.guidance ? `\nGUIDANCE: ${roundInstruction.guidance}` : "",
    `\nCONTRIBUTIONS FROM PRIOR ROUND:\n${contributionList}`,
    mapBlock,
    finalArgsBlock,
    `\nWrite your vote reasoning as plain prose. No markdown.`,
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ---- Main ----

async function main() {
  const startedAt = Date.now();

  logStep("opndomain offline debate runner");
  log("scenario", { title: scenario.title, agents: agents.length, provider: DEFAULT_PROVIDER });
  log("agents", agents.map((a) => `${a.displayName} (${a.stance}, ${a.provider})`).join(", "));

  if (agents.length < 3) {
    console.error("Error: Need at least 3 agents for a meaningful debate. 5 is recommended.");
    process.exit(1);
  }

  // Validate providers upfront
  for (const agent of agents) {
    await loadProvider(agent.provider);
  }
  log("providers", "all providers loaded successfully");

  // Run through all 10 rounds
  for (const roundDef of DEBATE_ROUNDS) {
    const roundInstruction = resolveDefaultRoundInstruction("debate", roundDef.sequenceIndex, roundDef.roundKind);
    const isVoteRound = roundDef.roundKind === "vote";

    logStep(`Round ${roundDef.sequenceIndex + 1} of ${DEBATE_ROUNDS.length}: ${roundDef.roundKind.toUpperCase()}`);

    if (isVoteRound) {
      // Vote rounds: first generate written reasoning, then cast structured votes
      // Step 1: Written vote reasoning (in parallel)
      log("vote-reasoning", { round: roundDef.sequenceIndex + 1, agents: agents.length });
      const reasoningResults = await Promise.allSettled(
        agents.map(async (agent) => {
          const prompt = buildVoteContributionPrompt(agent, roundDef, roundInstruction);
          log("llm-call", { who: agent.displayName, round: "vote-reasoning", provider: agent.provider });
          const body = await callLLM(agent.provider, agent.model, prompt.systemPrompt, prompt.userPrompt);
          log("llm-done", { who: agent.displayName, length: body.length });
          if (VERBOSE) log("llm-response", body.slice(0, 300));
          return { agent, body };
        })
      );

      for (const result of reasoningResults) {
        if (result.status === "fulfilled") {
          const { agent, body } = result.value;
          transcript.push({
            roundIndex: roundDef.sequenceIndex,
            roundKind: "vote",
            agentIndex: agent.index,
            displayName: agent.displayName,
            handle: agent.handle,
            body,
            stance: agent.stance,
            type: "vote_reasoning",
          });
        } else {
          log("llm-error", { error: result.reason?.message?.slice(0, 200) });
        }
      }

      // Step 2: Structured votes (in parallel)
      log("vote-cast", { round: roundDef.sequenceIndex + 1, agents: agents.length });
      const voteResults = await Promise.allSettled(
        agents.map(async (agent) => {
          const prompt = buildVotePrompt(agent, roundDef, roundInstruction);
          if (!prompt) return { agent, decisions: {} };
          log("llm-call", { who: agent.displayName, round: "vote-cast", provider: agent.provider });
          const raw = await callLLM(agent.provider, agent.model, prompt.systemPrompt, prompt.userPrompt);
          log("llm-done", { who: agent.displayName, raw: raw.slice(0, 100) });

          const priorRoundIndex = roundDef.sequenceIndex - 1;
          const validHandles = transcript
            .filter((c) => c.roundIndex === priorRoundIndex && c.agentIndex !== agent.index)
            .map((c) => c.handle);
          const decisions = parseVoteResponse(raw, [...new Set(validHandles)]);
          return { agent, decisions };
        })
      );

      for (const result of voteResults) {
        if (result.status === "fulfilled") {
          const { agent, decisions } = result.value;
          for (const [voteKind, targetHandle] of Object.entries(decisions)) {
            votes.push({
              roundIndex: roundDef.sequenceIndex,
              roundKind: "vote",
              voterIndex: agent.index,
              voterHandle: agent.handle,
              voterDisplayName: agent.displayName,
              voteKind,
              targetHandle,
            });
            log("vote", { voter: agent.displayName, kind: voteKind, target: `@${targetHandle}` });
          }
        } else {
          log("vote-error", { error: result.reason?.message?.slice(0, 200) });
        }
      }

    } else {
      // Content rounds: generate contributions in parallel
      log("contribution-batch", { round: roundDef.roundKind, agents: agents.length });
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          const { systemPrompt, userPrompt } = buildContributionPrompt(agent, roundDef, roundInstruction);
          if (VERBOSE) log("llm-prompt", { who: agent.displayName, system: systemPrompt.slice(0, 200), user: userPrompt.slice(0, 200) });
          log("llm-call", { who: agent.displayName, round: roundDef.roundKind, provider: agent.provider });
          const body = await callLLM(agent.provider, agent.model, systemPrompt, userPrompt);
          log("llm-done", { who: agent.displayName, round: roundDef.roundKind, length: body.length });
          if (VERBOSE) log("llm-response", body.slice(0, 300));

          // Strip markdown fences for JSON rounds
          let cleanBody = body;
          if (roundDef.roundKind === "map") {
            cleanBody = body.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
          }

          // Truncate if needed
          if (cleanBody.length > 19000) {
            cleanBody = cleanBody.slice(0, 19000).replace(/\s\S*$/, "");
            log("truncated", { who: agent.displayName, original: body.length, truncated: cleanBody.length });
          }

          return { agent, body: cleanBody };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { agent, body } = result.value;
          transcript.push({
            roundIndex: roundDef.sequenceIndex,
            roundKind: roundDef.roundKind,
            agentIndex: agent.index,
            displayName: agent.displayName,
            handle: agent.handle,
            body,
            stance: agent.stance,
          });
          log("contribution", { who: agent.displayName, round: roundDef.roundKind, preview: body.slice(0, 80) });
        } else {
          log("llm-error", { who: "unknown", error: result.reason?.message?.slice(0, 200) });
        }
      }
    }

    log("round-complete", { round: roundDef.sequenceIndex + 1, roundKind: roundDef.roundKind, transcriptSize: transcript.length, votesSize: votes.length });
  }

  // ---- Tally votes ----
  logStep("Vote tally");
  const voteTally = {};
  for (const agent of agents) {
    voteTally[agent.handle] = { most_interesting: 0, most_correct: 0, fabrication: 0, net: 0 };
  }
  for (const v of votes) {
    if (voteTally[v.targetHandle]) {
      voteTally[v.targetHandle][v.voteKind]++;
      if (v.voteKind === "fabrication") {
        voteTally[v.targetHandle].net -= 1;
      } else {
        voteTally[v.targetHandle].net += 1;
      }
    }
  }

  const ranked = Object.entries(voteTally)
    .map(([handle, tally]) => ({ handle, ...tally }))
    .sort((a, b) => b.net - a.net);

  for (const entry of ranked) {
    const agent = agents.find((a) => a.handle === entry.handle);
    log("tally", `@${entry.handle} (${agent?.displayName}): net=${entry.net} interesting=${entry.most_interesting} correct=${entry.most_correct} fabrication=${entry.fabrication}`);
  }

  // ---- LLM-as-judge verdict ----
  logStep("Generating verdict (LLM-as-judge)");
  let verdict = null;
  try {
    verdict = await generateVerdict(ranked);
    log("verdict", "generated successfully");
  } catch (err) {
    log("verdict-error", err.message?.slice(0, 200));
  }

  // ---- Write output ----
  logStep("Writing output");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const slug = path.basename(scenarioPath, ".json").replace(/[^a-z0-9-]/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(OUTPUT_DIR, `${slug}-${timestamp}.json`);

  const output = {
    meta: {
      title: scenario.title,
      prompt: scenario.prompt,
      timestamp: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL ?? "provider default",
      contextDir: CONTEXT_DIR,
    },
    agents: agents.map((a) => ({
      displayName: a.displayName,
      handle: a.handle,
      bio: a.bio,
      stance: a.stance,
      provider: a.provider,
      model: a.model ?? "provider default",
    })),
    rounds: DEBATE_ROUNDS.map((rd) => ({
      sequenceIndex: rd.sequenceIndex,
      roundKind: rd.roundKind,
      contributions: transcript
        .filter((c) => c.roundIndex === rd.sequenceIndex && c.type !== "vote_reasoning")
        .map((c) => ({
          handle: c.handle,
          displayName: c.displayName,
          stance: c.stance,
          body: c.body,
        })),
      voteReasoning: transcript
        .filter((c) => c.roundIndex === rd.sequenceIndex && c.type === "vote_reasoning")
        .map((c) => ({
          handle: c.handle,
          displayName: c.displayName,
          body: c.body,
        })),
      votes: votes
        .filter((v) => v.roundIndex === rd.sequenceIndex)
        .map((v) => ({
          voter: v.voterHandle,
          voteKind: v.voteKind,
          target: v.targetHandle,
        })),
    })),
    voteTally: ranked,
    verdict,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  log("output", outputPath);

  // ---- Summary ----
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logStep(`Complete \u2014 ${elapsed}s elapsed`);
  console.log(`
SUMMARY:
  Title:          ${scenario.title}
  Agents:         ${agents.map((a) => a.displayName).join(", ")}
  Contributions:  ${transcript.length}
  Votes:          ${votes.length}
  Winner:         @${ranked[0]?.handle} (net score: ${ranked[0]?.net})
  Output:         ${outputPath}
  Duration:       ${elapsed}s
  `);
}

// ---- Verdict generation ----

async function generateVerdict(ranked) {
  // Use the first agent's provider for the judge, or default
  const judgeProvider = DEFAULT_PROVIDER;
  const judgeModel = DEFAULT_MODEL;

  // Build a condensed transcript for the judge
  const condensed = DEBATE_ROUNDS
    .filter((rd) => rd.roundKind !== "vote")
    .map((rd) => {
      const contribs = transcript
        .filter((c) => c.roundIndex === rd.sequenceIndex && c.type !== "vote_reasoning")
        .map((c) => `  [@${c.handle}]: ${c.body?.slice(0, 800) ?? "[empty]"}`)
        .join("\n\n");
      return `--- Round ${rd.sequenceIndex + 1}: ${rd.roundKind.toUpperCase()} ---\n${contribs}`;
    })
    .join("\n\n");

  const tallyText = ranked
    .map((r) => `@${r.handle}: net=${r.net} (interesting=${r.most_interesting}, correct=${r.most_correct}, fabrication=${r.fabrication})`)
    .join("\n");

  const systemPrompt = `You are an impartial judge evaluating a structured 10-round debate. You have no stake in the outcome. Your job is to produce a fair, evidence-based verdict.

OUTPUT FORMAT \u2014 respond with a JSON object, no prose wrapping, no markdown fences:
{
  "verdictOutcome": "one sentence \u2014 the debate's bottom-line conclusion",
  "confidence": "strong" | "moderate" | "emerging",
  "whatSettled": "1 paragraph \u2014 what the debaters actually agreed on",
  "whatContested": "1 paragraph \u2014 the genuine disagreement that survived all rounds",
  "winningPosition": "the position statement that won on the merits",
  "winnerHandle": "@handle of the strongest contributor",
  "synthesis": "2-3 paragraphs \u2014 a fair synthesis a newcomer could read to understand the debate",
  "kicker": "one sentence, \u2264180 characters \u2014 the sharpest claim from the debate"
}`;

  const userPrompt = `TOPIC: ${scenario.title}
RESEARCH QUESTION: ${scenario.prompt}

DEBATE TRANSCRIPT (content rounds only):
${condensed}

VOTE TALLY (peer votes across all vote rounds):
${tallyText}

Produce your verdict JSON now:`;

  log("verdict-llm-call", { provider: judgeProvider });
  const raw = await callLLM(judgeProvider, judgeModel, systemPrompt, userPrompt);

  // Parse JSON from response
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    log("verdict-parse-error", { raw: cleaned.slice(0, 200) });
    return { raw: cleaned };
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
