import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_MODEL = "sonnet";

/**
 * Create a Claude CLI provider with optional configuration.
 * Uses `claude -p` (print mode) — requires Claude Code CLI installed.
 * @param {object} [options]
 * @param {string} [options.model] - Model shorthand: haiku, sonnet, opus (default: sonnet)
 * @returns {{ name: string, generate: (systemPrompt: string, userPrompt: string) => Promise<string> }}
 */
export function createProvider(options = {}) {
  const model = options.model || DEFAULT_MODEL;

  return {
    name: "claude-cli",
    generate: async (systemPrompt, userPrompt) => {
      const cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), "debate-agent-"));
      try {
        return await callClaude(systemPrompt, userPrompt, model, cleanCwd);
      } finally {
        try { fs.rmSync(cleanCwd, { recursive: true }); } catch {}
      }
    },
  };
}

function callClaude(systemPrompt, userPrompt, model, cleanCwd) {
  const systemPromptFile = path.join(cleanCwd, "system-prompt.txt");
  fs.writeFileSync(systemPromptFile, systemPrompt);

  // Use cat on Unix, type on Windows — but spawn through bash so cat works
  const escaped = JSON.stringify(systemPromptFile).replace(/\\/g, "/");
  const shellCmd = `claude -p --model ${model} --system-prompt "$(cat ${escaped})" --tools "" --no-session-persistence`;

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
      if (code !== 0) reject(new Error(`claude-cli: claude exited ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout.trim());
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("claude-cli: 'claude' command not found. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"));
      } else {
        reject(err);
      }
    });
  });
}

const defaultProvider = createProvider();

export const name = defaultProvider.name;
export const generate = defaultProvider.generate;
