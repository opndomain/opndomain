#!/usr/bin/env node
/**
 * dual-agent — state-machine orchestrator for Claude + Codex
 *
 * The script owns:
 *   - turn-taking (STATE.json)
 *   - evidence capture (git diffs, typecheck, tests)
 *   - handoff briefs (HANDOFF.md)
 *   - ownership enforcement
 *
 * The agents own:
 *   - PLAN.md (Claude only — the execution contract)
 *   - code files (Codex only during execute/debug)
 *   - their stdout (archived to rounds/)
 *
 * Usage:
 *   node scripts/dual-agent.mjs "fix the topics page filter bug"
 *   node scripts/dual-agent.mjs --plan-rounds 4 --debug-rounds 3 "rebuild the sidebar"
 */

import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  appendFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  planRounds: 3,
  debugRounds: 2,
  claudeModel: "",
  codexModel: "",
  maxRetries: 2, // same plan item fails this many times → escalate
};

// ── ANSI ────────────────────────────────────────────────────────────────────

const A = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[38;5;75m",
  green: "\x1b[38;5;114m",
  yellow: "\x1b[38;5;220m",
  red: "\x1b[38;5;203m",
  cyan: "\x1b[38;5;80m",
  bgBlue: "\x1b[48;5;24m",
  bgGreen: "\x1b[48;5;22m",
  bgYellow: "\x1b[48;5;58m",
  bgRed: "\x1b[48;5;52m",
};

function banner(bg, fg, label, detail) {
  const pad = " ".repeat(Math.max(0, 60 - label.length - detail.length));
  console.log(
    `\n${bg}${fg}${A.bold} ${label} ${A.reset}${bg}${A.dim} ${detail}${pad}${A.reset}`
  );
}

function agentLine(agent, phase, round, total) {
  const isC = agent === "claude";
  const color = isC ? A.blue : A.green;
  const icon = isC ? "◆" : "▲";
  const name = isC ? "CLAUDE" : "CODEX";
  console.log(
    `\n${color}${A.bold}${icon} ${name}${A.reset} ${A.dim}| ${phase} | round ${round}/${total}${A.reset}`
  );
  console.log(`${color}${"─".repeat(64)}${A.reset}`);
}

function streamLine(agent, text) {
  const color = agent === "claude" ? A.blue : A.green;
  for (const line of text.split("\n")) {
    console.log(`${color}|${A.reset} ${line}`);
  }
}

function endBlock(agent) {
  const color = agent === "claude" ? A.blue : A.green;
  console.log(`${color}└${"─".repeat(63)}${A.reset}`);
}

function info(msg) {
  console.log(`${A.yellow}${A.bold}→${A.reset} ${msg}`);
}

function err(msg) {
  console.log(`${A.red}${A.bold}✗${A.reset} ${msg}`);
}

function dim(msg) {
  console.log(`${A.dim}${msg}${A.reset}`);
}

// ── CLI parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { ...DEFAULTS };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const v = args[i];
    if (v === "--plan-rounds" && args[i + 1])
      opts.planRounds = parseInt(args[++i], 10);
    else if (v === "--debug-rounds" && args[i + 1])
      opts.debugRounds = parseInt(args[++i], 10);
    else if (v === "--claude-model" && args[i + 1])
      opts.claudeModel = args[++i];
    else if (v === "--codex-model" && args[i + 1])
      opts.codexModel = args[++i];
    else if (v === "--max-retries" && args[i + 1])
      opts.maxRetries = parseInt(args[++i], 10);
    else if (v === "-h" || v === "--help") {
      console.log(`
dual-agent — state-machine orchestrator (Claude + Codex)

Usage:  node scripts/dual-agent.mjs [opts] "<task>"

Options:
  --plan-rounds N    Review/refine iterations   (default: ${DEFAULTS.planRounds})
  --debug-rounds N   Audit/debug iterations     (default: ${DEFAULTS.debugRounds})
  --claude-model M   Claude model override
  --codex-model M    Codex model override
  --max-retries N    Same-item fail limit before escalate (default: ${DEFAULTS.maxRetries})
  -h, --help         Show this help
`);
      process.exit(0);
    } else if (!v.startsWith("--")) {
      positional.push(v);
    }
  }

  opts.task = positional.join(" ");
  if (!opts.task) {
    err('No task. Usage: node scripts/dual-agent.mjs "<task>"');
    process.exit(1);
  }
  return opts;
}

// ── State machine ───────────────────────────────────────────────────────────

// Phases: plan → review → refine → (loop) → execute → audit → debug → (loop) → done
// Modes:  plan_review (planning loop) | execute_audit (implementation loop)

function makeState(opts) {
  return {
    sessionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    task: opts.task,
    mode: "plan_review",
    phase: "plan",
    round: 0,
    agent: null,
    planRounds: opts.planRounds,
    debugRounds: opts.debugRounds,
    maxRetries: opts.maxRetries,
    claudeModel: opts.claudeModel,
    codexModel: opts.codexModel,
    baseCommit: null,
    artifacts: {
      rounds: [],   // [{round, phase, agent, file}]
      diffs: [],    // [{round, file}]
      checks: [],   // [{round, type, file, passed}]
    },
    failCounts: {},   // planItemId → count
    terminated: false,
    terminationReason: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}

// ── Session directory ───────────────────────────────────────────────────────

function initSession(state, opts) {
  const slug = state.task
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+$/, "");

  const dir = resolve(`.dual-agent`, `${state.sessionId}_${slug}`);
  mkdirSync(join(dir, "rounds"), { recursive: true });
  mkdirSync(join(dir, "diffs"), { recursive: true });
  mkdirSync(join(dir, "checks"), { recursive: true });

  const paths = {
    dir,
    state: join(dir, "STATE.json"),
    task: join(dir, "TASK.md"),
    plan: join(dir, "PLAN.md"),
    handoff: join(dir, "HANDOFF.md"),
    transcript: join(dir, "transcript.md"),
  };

  // TASK.md — immutable
  writeFileSync(paths.task, `# Task\n\n${state.task}\n`);

  // PLAN.md — empty, Claude will write it
  writeFileSync(paths.plan, "");

  // HANDOFF.md — script writes before each turn
  writeFileSync(paths.handoff, "");

  // STATE.json
  writeState(paths, state);

  // transcript
  writeFileSync(
    paths.transcript,
    `# dual-agent transcript\n\n` +
      `**Task:** ${state.task}\n` +
      `**Session:** ${state.sessionId}\n` +
      `**Started:** ${state.startedAt}\n\n---\n\n`
  );

  // Capture base commit
  try {
    state.baseCommit = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();
  } catch {
    state.baseCommit = null;
  }
  writeState(paths, state);

  return paths;
}

function writeState(paths, state) {
  writeFileSync(paths.state, JSON.stringify(state, null, 2));
}

function readState(paths) {
  return JSON.parse(readFileSync(paths.state, "utf-8"));
}

// ── Evidence capture ────────────────────────────────────────────────────────

function captureGitDiff(paths, state) {
  const label = `round-${String(state.round).padStart(2, "0")}-${state.phase}`;
  try {
    const diff = execSync("git diff", {
      encoding: "utf-8",
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });
    if (diff.trim()) {
      const file = join(paths.dir, "diffs", `${label}.patch`);
      writeFileSync(file, diff);
      state.artifacts.diffs.push({ round: state.round, file });
      return { path: `diffs/${label}.patch`, summary: diffSummary(diff) };
    }
  } catch {
    // not a git repo
  }
  return null;
}

function diffSummary(diff) {
  const files = [];
  let adds = 0;
  let dels = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git")) {
      const m = line.match(/b\/(.+)$/);
      if (m) files.push(m[1]);
    } else if (line.startsWith("+") && !line.startsWith("+++")) adds++;
    else if (line.startsWith("-") && !line.startsWith("---")) dels++;
  }
  return `${files.length} file(s) changed, +${adds} -${dels}\nFiles: ${files.join(", ")}`;
}

function captureGitSnapshot(state) {
  const result = { commit: null, changedFiles: [] };
  try {
    result.commit = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();
    const nameStatus = execSync("git diff --name-status", {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();
    if (nameStatus) {
      result.changedFiles = nameStatus.split("\n");
    }
  } catch {
    // not a git repo
  }
  return result;
}

function runCheck(type, command, paths, state) {
  const label = `round-${String(state.round).padStart(2, "0")}-${type}`;
  const file = join(paths.dir, "checks", `${label}.txt`);
  let output = "";
  let passed = false;
  try {
    output = execSync(command, {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    passed = true;
  } catch (e) {
    output = e.stdout || e.message || "check failed";
    passed = false;
  }
  writeFileSync(file, output);
  state.artifacts.checks.push({
    round: state.round,
    type,
    file,
    passed,
  });
  return { type, passed, path: `checks/${label}.txt`, output: truncate(output, 2000) };
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, full output in file)`;
}

function runChecks(paths, state) {
  const results = [];

  // TypeScript check
  if (existsSync("tsconfig.json") || existsSync("packages")) {
    results.push(runCheck("typecheck", "npx tsc --noEmit 2>&1", paths, state));
  }

  // Test (non-blocking — just capture results)
  try {
    const pkgJson = JSON.parse(readFileSync("package.json", "utf-8"));
    if (pkgJson.scripts && pkgJson.scripts.test) {
      results.push(
        runCheck("test", "npm test -- --run 2>&1", paths, state)
      );
    }
  } catch {
    // no package.json
  }

  return results;
}

// ── Ownership enforcement ───────────────────────────────────────────────────

function checkOwnership(state, paths) {
  const violations = [];

  // After Claude runs: check if any non-PLAN.md files were modified
  if (state.agent === "claude" && (state.phase === "audit" || state.phase === "refine")) {
    const snapshot = captureGitSnapshot(state);
    for (const f of snapshot.changedFiles) {
      // f is like "M\tpackages/foo/bar.ts"
      const parts = f.split("\t");
      const filePath = parts[parts.length - 1];
      if (filePath && !filePath.includes("PLAN.md") && !filePath.startsWith(".dual-agent")) {
        violations.push(`Claude modified ${filePath} (ownership: Codex-only during implementation)`);
      }
    }
  }

  // After Codex runs: check if PLAN.md was modified
  if (state.agent === "codex" && (state.phase === "execute" || state.phase === "debug")) {
    try {
      const planDiff = execSync("git diff -- .dual-agent/*/PLAN.md", {
        encoding: "utf-8",
        cwd: process.cwd(),
      }).trim();
      if (planDiff) {
        violations.push("Codex modified PLAN.md (ownership: Claude-only)");
        // Restore PLAN.md
        execSync("git checkout -- .dual-agent/*/PLAN.md", {
          cwd: process.cwd(),
        });
      }
    } catch {
      // PLAN.md not tracked or no git
    }
  }

  return violations;
}

// ── HANDOFF.md builders ─────────────────────────────────────────────────────

function handoffPlan(state, paths) {
  return `## Role: PLANNER (Claude)
## Phase: plan | Round: 1

You are the planning agent. Your job is to create the execution contract.

**Read:** \`.dual-agent/${state.sessionId}_*/TASK.md\` for the task.
**Read the codebase** to understand what exists before planning.
**Write:** \`.dual-agent/${state.sessionId}_*/PLAN.md\` — the execution contract.

### PLAN.md format

Every item must follow this structure:

\`\`\`
## P<N>: <short title>

**Acceptance:** <what must be true when this is done>
**Status:** pending
**Evidence:** (none yet)
**Files:** <paths to create or modify>

<description of what to do>
\`\`\`

Rules:
- Use IDs: P1, P2, P3...
- Status is one of: pending, done, failed
- Evidence must reference a concrete artifact: test name, file path, check output
- Be specific about file paths — read the project first
- Order items by dependency (later items can depend on earlier ones)

Write the file directly to disk. Your stdout will be archived.
`;
}

function handoffReview(state, lastOutput) {
  return `## Role: REVIEWER (Codex)
## Phase: review | Round: ${state.round}/${state.planRounds}

You are reviewing the plan created by Claude.

**Read:** PLAN.md in the session directory.
**Read the codebase** to verify file paths and assumptions.

Review for:
1. Are the file paths correct? Do the files exist?
2. Are acceptance criteria specific and testable?
3. Missing steps or wrong ordering?
4. Is each step concrete enough to execute without guessing?

**Do NOT modify PLAN.md.** Write your feedback to stdout only.
Be direct — list what's wrong and what's right.

### Previous agent output (Claude, plan):
${truncate(lastOutput, 4000)}
`;
}

function handoffRefine(state, lastOutput) {
  return `## Role: PLANNER (Claude)
## Phase: refine | Round: ${state.round}/${state.planRounds}

The reviewer gave feedback on your plan. Update PLAN.md.

**Read:** PLAN.md (your current plan) and the reviewer feedback below.
**Write:** updated PLAN.md to disk. Keep the same format (P<N>, acceptance, status, evidence, files).

Rules:
- Incorporate valid feedback
- If you disagree with a point, explain why in stdout but still ensure the plan is correct
- Do NOT modify any code files — only PLAN.md

### Reviewer feedback (Codex):
${truncate(lastOutput, 4000)}
`;
}

function handoffExecute(state, paths) {
  const plan = existsSync(paths.plan)
    ? readFileSync(paths.plan, "utf-8")
    : "(no plan found)";

  return `## Role: EXECUTOR (Codex)
## Phase: execute | Round: 1

The plan is finalized. Execute it.

**Read:** PLAN.md below for the full contract.
**Implement** every pending item. Make the code changes directly.
**Do NOT modify PLAN.md** — that is Claude's file.

After you're done, describe what you did in stdout: which plan items you completed, what files you changed, any deviations from the plan.

### PLAN.md contents:
${plan}
`;
}

function handoffAudit(state, paths, diffInfo, checks, lastOutput) {
  const plan = existsSync(paths.plan)
    ? readFileSync(paths.plan, "utf-8")
    : "(no plan found)";

  let checksSection = "No automated checks ran.\n";
  if (checks.length > 0) {
    checksSection = checks
      .map(
        (c) =>
          `- **${c.type}:** ${c.passed ? "PASSED" : "FAILED"} (see \`${c.path}\`)\n${c.passed ? "" : "```\n" + truncate(c.output, 1000) + "\n```\n"}`
      )
      .join("\n");
  }

  let diffSection = "No code changes detected.\n";
  if (diffInfo) {
    diffSection = `${diffInfo.summary}\nFull diff: \`${diffInfo.path}\`\n`;
  }

  return `## Role: AUDITOR (Claude)
## Phase: audit | Round: ${state.round}/${state.debugRounds}

Codex executed the plan. Verify the work against ground truth.

**Read the actual changed files** — do not trust the executor's self-report alone.
**Read:** PLAN.md for what should have been done.
**Write:** updated PLAN.md — set status to \`done\` for verified items, \`failed\` for broken ones.
  Add the evidence field (test name, file check, etc).
**Do NOT modify any code files** — only PLAN.md.

### Ground truth — git diff
${diffSection}

### Automated checks
${checksSection}

### Executor self-report (Codex):
${truncate(lastOutput, 4000)}

### Current PLAN.md:
${plan}

If all items are \`done\` and checks pass, say "ALL_COMPLETE" in your output.
If items are \`failed\`, be specific about what's wrong (file, line, issue).
`;
}

function handoffDebug(state, paths, lastOutput) {
  const plan = existsSync(paths.plan)
    ? readFileSync(paths.plan, "utf-8")
    : "(no plan found)";

  return `## Role: DEBUGGER (Codex)
## Phase: debug | Round: ${state.round}/${state.debugRounds}

Claude audited your work and found issues. Fix them.

**Read:** PLAN.md for items marked \`failed\` and their descriptions.
**Fix** the code issues described in the audit findings below.
**Do NOT modify PLAN.md** — that is Claude's file.

When done, describe what you fixed in stdout.

### Audit findings (Claude):
${truncate(lastOutput, 4000)}

### Current PLAN.md:
${plan}
`;
}

// ── Termination logic ───────────────────────────────────────────────────────

function shouldTerminate(state, auditOutput) {
  // 1. All items complete
  if (auditOutput.includes("ALL_COMPLETE")) {
    return { terminate: true, reason: "All plan items verified complete." };
  }

  // 2. Max debug rounds exhausted
  if (state.round >= state.debugRounds) {
    return { terminate: true, reason: `Max debug rounds (${state.debugRounds}) reached.` };
  }

  // 3. Same item failed too many times
  const plan = existsSync(state._paths?.plan)
    ? readFileSync(state._paths.plan, "utf-8")
    : "";
  const failedItems = [...plan.matchAll(/## (P\d+):[^\n]*\n[\s\S]*?Status:\s*failed/gi)];
  for (const match of failedItems) {
    const id = match[1];
    state.failCounts[id] = (state.failCounts[id] || 0) + 1;
    if (state.failCounts[id] >= state.maxRetries) {
      return {
        terminate: true,
        reason: `Item ${id} failed ${state.failCounts[id]} times — escalating to human.`,
      };
    }
  }

  return { terminate: false, reason: null };
}

// ── Prompt file resolution ───────────────────────────────────────────────────

const PROMPT_DIR = resolve(".dual-agent", "prompts");

function promptFile(role) {
  const p = join(PROMPT_DIR, `${role}.md`);
  if (!existsSync(p)) {
    err(`Missing prompt file: ${p}`);
    process.exit(1);
  }
  return p;
}

// Map (phase) → { claudePrompt, codexPrompt }
const ROLE_MAP = {
  plan:    { claude: "planner" },
  refine:  { claude: "planner" },
  audit:   { claude: "auditor" },
  review:  { codex: "reviewer" },
  execute: { codex: "builder" },
  debug:   { codex: "debugger" },
};

// ── Agent invocation ────────────────────────────────────────────────────────

function callClaude(sessionDir, phase, state, opts) {
  const handoffPath = join(sessionDir, "HANDOFF.md").replace(/\\/g, "/");
  const role = ROLE_MAP[phase]?.claude || "planner";
  const rolePrompt = readFileSync(promptFile(role), "utf-8");

  // Write combined system prompt to a temp file — avoids shell quoting hell
  const systemPrompt = rolePrompt + "\n\n" +
    "Session directory: " + sessionDir.replace(/\\/g, "/") + "\n" +
    "Phase: " + phase + " | Round: " + state.round;
  const sysFile = join(sessionDir, `_sys_${phase}.md`);
  writeFileSync(sysFile, systemPrompt);

  // Pipe the user prompt via stdin, reference system prompt via file
  const userPrompt = `Read ${handoffPath} and follow the instructions in it.`;
  const args = [
    "-p",
    "--output-format", "text",
    "--add-dir", ".",
    "--append-system-prompt-file", sysFile,
  ];
  if (opts.claudeModel) args.push("--model", opts.claudeModel);
  return runCliWithStdin("claude", args, userPrompt);
}

function callCodex(sessionDir, phase, state, opts) {
  const handoffPath = join(sessionDir, "HANDOFF.md").replace(/\\/g, "/");
  const role = ROLE_MAP[phase]?.codex || "builder";
  const rolePrompt = readFileSync(promptFile(role), "utf-8");

  // Build the full prompt: role instructions + handoff pointer
  const prompt =
    rolePrompt + "\n\n---\n\n" +
    `Session directory: ${sessionDir.replace(/\\/g, "/")}\n` +
    `Phase: ${phase} | Round: ${state.round}\n\n` +
    `Read the file at ${handoffPath} for your current brief and context from the previous agent.`;

  // Output file for -o flag
  const label = `${String(state.round).padStart(2, "0")}-codex-${phase}`;
  const outputFile = join(sessionDir, "rounds", `${label}.txt`);

  const args = [
    "exec",
    "--full-auto",
    "-o", outputFile,
    "-",
  ];
  if (opts.codexModel) args.push("--model", opts.codexModel);
  return runCliWithStdin("codex", args, prompt, outputFile);
}

function runCliWithStdin(cmd, args, input, outputFile) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    // shell:true needed on Windows for .cmd shim resolution.
    // All complex content goes through stdin or file references — never as args.
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      cwd: process.cwd(),
    });

    child.stdin.write(input);
    child.stdin.end();

    child.stdout.on("data", (d) => {
      const t = d.toString();
      chunks.push(t);
      process.stdout.write(t);
    });
    child.stderr.on("data", (d) =>
      process.stderr.write(`${A.dim}${d.toString()}${A.reset}`)
    );
    child.on("error", (e) =>
      reject(new Error(`spawn ${cmd}: ${e.message}`))
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited ${code}`));
        return;
      }
      let result = chunks.join("").trim();
      // Prefer -o output file (Codex final message) over raw stdout
      if (outputFile && existsSync(outputFile)) {
        const fo = readFileSync(outputFile, "utf-8").trim();
        if (fo) result = fo;
      }
      resolve(result);
    });
  });
}

// ── Archive ─────────────────────────────────────────────────────────────────

function archiveRound(paths, state, agent, phase, output) {
  const label = `${String(state.round).padStart(2, "0")}-${agent}-${phase}`;
  const file = join(paths.dir, "rounds", `${label}.txt`);
  // Codex -o flag may have already written the file; write/overwrite with full output
  writeFileSync(file, output);
  state.artifacts.rounds.push({
    round: state.round,
    phase,
    agent,
    file,
  });
  writeState(paths, state);
  appendFileSync(
    paths.transcript,
    `## ${phase} — ${agent} (round ${state.round})\n\n${output}\n\n---\n\n`
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const state = makeState(opts);
  const paths = initSession(state, opts);
  state._paths = paths;

  console.log(
    `\n${A.bold}${A.yellow}╔══════════════════════════════════════════════════════════════╗${A.reset}`
  );
  console.log(
    `${A.bold}${A.yellow}║${A.reset}  ${A.bold}dual-agent${A.reset} ${A.dim}— Claude × Codex state machine${A.reset}                  ${A.bold}${A.yellow}║${A.reset}`
  );
  console.log(
    `${A.bold}${A.yellow}╚══════════════════════════════════════════════════════════════╝${A.reset}`
  );
  dim(`Session:  ${state.sessionId}`);
  dim(`Dir:      ${paths.dir}`);
  dim(`Task:     ${state.task}`);
  dim(`Plan rounds: ${opts.planRounds} | Debug rounds: ${opts.debugRounds} | Max retries: ${opts.maxRetries}`);
  if (state.baseCommit) dim(`Base commit: ${state.baseCommit}`);
  dim(`Files: STATE.json  TASK.md  PLAN.md  HANDOFF.md`);

  let lastOutput = "";

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: PLAN
  // ══════════════════════════════════════════════════════════════════════════
  banner(A.bgBlue, A.blue, "PHASE 1", "PLAN");
  state.phase = "plan";
  state.round = 1;
  state.agent = "claude";
  writeState(paths, state);
  writeFileSync(paths.handoff, handoffPlan(state, paths));

  agentLine("claude", "PLAN", 1, 1);
  info("Claude is reading the codebase and creating the plan...");
  try {
    lastOutput = await callClaude(paths.dir, "plan", state, opts);
    endBlock("claude");
    archiveRound(paths, state, "claude", "plan", lastOutput);
  } catch (e) {
    err(`Claude plan failed: ${e.message}`);
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: REVIEW + REFINE LOOP
  // ══════════════════════════════════════════════════════════════════════════
  banner(A.bgGreen, A.green, "PHASE 2", "REVIEW & REFINE");

  for (let i = 1; i <= opts.planRounds; i++) {
    // ── Codex reviews ───────────────────────────────────────────────────
    state.phase = "review";
    state.round = i;
    state.agent = "codex";
    state.mode = "plan_review";
    writeState(paths, state);
    writeFileSync(paths.handoff, handoffReview(state, lastOutput));

    agentLine("codex", "REVIEW", i, opts.planRounds);
    info("Codex is reviewing the plan...");
    try {
      lastOutput = await callCodex(paths.dir, "review", state, opts);
      endBlock("codex");
      archiveRound(paths, state, "codex", "review", lastOutput);
    } catch (e) {
      err(`Codex review failed: ${e.message}`);
      break;
    }

    // ── Claude refines ──────────────────────────────────────────────────
    state.phase = "refine";
    state.agent = "claude";
    writeState(paths, state);
    writeFileSync(paths.handoff, handoffRefine(state, lastOutput));

    agentLine("claude", "REFINE", i, opts.planRounds);
    info("Claude is updating the plan...");

    // Snapshot PLAN.md before refine to detect changes
    const planBefore = existsSync(paths.plan)
      ? readFileSync(paths.plan, "utf-8")
      : "";

    try {
      lastOutput = await callClaude(paths.dir, "refine", state, opts);
      endBlock("claude");
      archiveRound(paths, state, "claude", "refine", lastOutput);

      // Log whether plan actually changed
      const planAfter = existsSync(paths.plan)
        ? readFileSync(paths.plan, "utf-8")
        : "";
      if (planAfter === planBefore) {
        info("Plan unchanged this round (Claude may not have written to disk).");
      } else {
        info("PLAN.md updated on disk.");
      }
    } catch (e) {
      err(`Claude refine failed: ${e.message}`);
      break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: EXECUTE
  // ══════════════════════════════════════════════════════════════════════════
  banner(A.bgYellow, A.yellow, "PHASE 3", "EXECUTE");
  state.phase = "execute";
  state.round = 1;
  state.agent = "codex";
  state.mode = "execute_audit";
  writeState(paths, state);

  // Snapshot before execution
  const preExecSnapshot = captureGitSnapshot(state);
  info(`Pre-execution snapshot: ${preExecSnapshot.commit || "(no git)"}`);

  writeFileSync(paths.handoff, handoffExecute(state, paths));

  agentLine("codex", "EXECUTE", 1, 1);
  info("Codex is implementing the plan...");
  try {
    lastOutput = await callCodex(paths.dir, "execute", state, opts);
    endBlock("codex");
    archiveRound(paths, state, "codex", "execute", lastOutput);

    // Capture evidence
    const diffInfo = captureGitDiff(paths, state);
    if (diffInfo) info(`Diff captured: ${diffInfo.summary}`);
    else info("No git diff detected.");

    // Ownership check
    const violations = checkOwnership(state, paths);
    if (violations.length > 0) {
      err("Ownership violations:");
      violations.forEach((v) => err(`  - ${v}`));
    }
  } catch (e) {
    err(`Codex execute failed: ${e.message}`);
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4: AUDIT + DEBUG LOOP
  // ══════════════════════════════════════════════════════════════════════════
  banner(A.bgBlue, A.blue, "PHASE 4", "AUDIT & DEBUG");

  for (let i = 1; i <= opts.debugRounds; i++) {
    // ── Run automated checks ────────────────────────────────────────────
    info("Running automated checks...");
    const checks = runChecks(paths, state);
    for (const c of checks) {
      const icon = c.passed ? `${A.green}✓${A.reset}` : `${A.red}✗${A.reset}`;
      console.log(`  ${icon} ${c.type}: ${c.passed ? "passed" : "FAILED"} → ${c.path}`);
    }

    // ── Capture current diff for audit ──────────────────────────────────
    const diffInfo = captureGitDiff(paths, state);

    // ── Claude audits ───────────────────────────────────────────────────
    state.phase = "audit";
    state.round = i;
    state.agent = "claude";
    writeState(paths, state);
    writeFileSync(
      paths.handoff,
      handoffAudit(state, paths, diffInfo, checks, lastOutput)
    );

    agentLine("claude", "AUDIT", i, opts.debugRounds);
    info("Claude is auditing against ground truth...");
    try {
      lastOutput = await callClaude(paths.dir, "audit", state, opts);
      endBlock("claude");
      archiveRound(paths, state, "claude", "audit", lastOutput);

      // Ownership check
      const violations = checkOwnership(state, paths);
      if (violations.length > 0) {
        err("Ownership violations:");
        violations.forEach((v) => err(`  - ${v}`));
      }
    } catch (e) {
      err(`Claude audit failed: ${e.message}`);
      break;
    }

    // ── Check termination ───────────────────────────────────────────────
    const term = shouldTerminate(state, lastOutput);
    if (term.terminate) {
      state.terminated = true;
      state.terminationReason = term.reason;
      writeState(paths, state);

      if (lastOutput.includes("ALL_COMPLETE")) {
        info(`${A.green}${A.bold}${term.reason}${A.reset}`);
      } else {
        err(term.reason);
      }
      break;
    }

    // ── Codex debugs ────────────────────────────────────────────────────
    state.phase = "debug";
    state.agent = "codex";
    writeState(paths, state);

    // Snapshot before debug
    info(`Pre-debug snapshot: ${captureGitSnapshot(state).commit || "(no git)"}`);
    writeFileSync(paths.handoff, handoffDebug(state, paths, lastOutput));

    agentLine("codex", "DEBUG", i, opts.debugRounds);
    info("Codex is fixing audit issues...");
    try {
      lastOutput = await callCodex(paths.dir, "debug", state, opts);
      endBlock("codex");
      archiveRound(paths, state, "codex", "debug", lastOutput);

      // Capture evidence
      const debugDiff = captureGitDiff(paths, state);
      if (debugDiff) info(`Debug diff: ${debugDiff.summary}`);

      // Ownership check
      const violations = checkOwnership(state, paths);
      if (violations.length > 0) {
        err("Ownership violations:");
        violations.forEach((v) => err(`  - ${v}`));
      }
    } catch (e) {
      err(`Codex debug failed: ${e.message}`);
      break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  state.phase = "done";
  state.endedAt = new Date().toISOString();
  writeState(paths, state);

  console.log(
    `\n${A.bold}${A.yellow}╔══════════════════════════════════════════════════════════════╗${A.reset}`
  );
  console.log(
    `${A.bold}${A.yellow}║${A.reset}  ${A.bold}SESSION COMPLETE${A.reset}                                               ${A.bold}${A.yellow}║${A.reset}`
  );
  console.log(
    `${A.bold}${A.yellow}╚══════════════════════════════════════════════════════════════╝${A.reset}`
  );
  dim(`Session:      ${state.sessionId}`);
  dim(`Dir:          ${paths.dir}`);
  dim(`Plan:         ${paths.plan}`);
  dim(`Transcript:   ${paths.transcript}`);
  dim(`State:        ${paths.state}`);
  if (state.terminationReason) {
    dim(`Termination:  ${state.terminationReason}`);
  }
  dim(`Duration:     ${state.startedAt} → ${state.endedAt}`);
  dim(`Rounds:       ${state.artifacts.rounds.length}`);
  dim(`Diffs:        ${state.artifacts.diffs.length}`);
  dim(`Checks:       ${state.artifacts.checks.length}`);
  console.log();

  appendFileSync(
    paths.transcript,
    `\n## Session Complete\n\n**Ended:** ${state.endedAt}\n**Reason:** ${state.terminationReason || "all rounds completed"}\n`
  );
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
