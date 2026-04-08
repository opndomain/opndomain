import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface LlmProvider {
  id: "ollama" | "codex" | "claude-code" | "anthropic";
  label: string;
  available(): Promise<boolean>;
  generate(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
  provenance(): { provider: string; model: string | null };
}

type SpawnResult = {
  stdout: string;
  stderr: string;
};

function wrapExecutable(command: string, args: string[]) {
  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", command, ...args] };
  }
  return { command, args };
}

export async function runCommand(command: string, args: string[], input?: string, timeoutMs = 120_000): Promise<SpawnResult> {
  const wrapped = wrapExecutable(command, args);
  return await new Promise<SpawnResult>((resolve, reject) => {
    const proc = spawn(wrapped.command, wrapped.args, {
      stdio: "pipe",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => { stdout += String(chunk); });
    proc.stderr.on("data", (chunk) => { stderr += String(chunk); });
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}.`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });
}

export async function commandExists(command: string, helpArgs: string[] = ["--help"]): Promise<boolean> {
  try {
    await runCommand(command, helpArgs, undefined, 15_000);
    return true;
  } catch {
    return false;
  }
}

export async function withTempFile<T>(prefix: string, fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function runCodexPrompt(prompt: string) {
  return withTempFile("opndomain-codex-", async (dir) => {
    const outFile = join(dir, "last-message.txt");
    await runCommand("codex", ["exec", "-", "--skip-git-repo-check", "--color", "never", "--output-last-message", outFile], prompt);
    if (!(await fileExists(outFile))) {
      throw new Error("Codex did not write a final message.");
    }
    return (await readFile(outFile, "utf8")).trim();
  });
}

export async function runClaudePrompt(system: string, user: string) {
  return withTempFile("opndomain-claude-", async (dir) => {
    const systemFile = join(dir, "system.txt");
    await writeFile(systemFile, system, "utf8");
    const { stdout } = await runCommand(
      "claude",
      ["-p", "--model", process.env.OPNDOMAIN_CLAUDE_MODEL ?? "sonnet", "--system-prompt", system, "--tools", "", "--no-session-persistence"],
      user,
    );
    return stdout.trim();
  });
}

async function selectProviderModule(preferred?: string): Promise<LlmProvider | null> {
  const modules = await Promise.all([
    import("./ollama.js"),
    import("./codex.js"),
    import("./claudeCode.js"),
    import("./anthropic.js"),
  ]);
  const providers = modules.map((mod) => mod.provider);
  if (preferred) {
    const match = providers.find((provider) => provider.id === preferred);
    if (match && await match.available()) {
      return match;
    }
  }
  for (const provider of providers) {
    if (await provider.available()) {
      return provider;
    }
  }
  return null;
}

export async function selectProvider(preferred?: string): Promise<LlmProvider> {
  const provider = await selectProviderModule(preferred);
  if (!provider) {
    throw new Error("No available LLM provider was found. Configure Ollama, Codex CLI, Claude Code CLI, or ANTHROPIC_API_KEY.");
  }
  return provider;
}
