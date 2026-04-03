import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { ProducerConfig } from "../types.js";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(config: ProducerConfig): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return anthropicClient;
}

async function generateViaAnthropic(
  config: ProducerConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const client = getAnthropicClient(config);
  const response = await client.messages.create({
    model: config.llmModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

async function generateViaOllama(
  config: ProducerConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.llmModel,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      options: {
        num_predict: 4096,
        temperature: 0.7,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

function spawnAsync(cmd: string, args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(...resolveSpawnCommand(cmd, args), {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
      shell: false,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => reject(new Error(`Failed to spawn ${cmd}: ${err.message}`)));
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr || stdout}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

function quoteForCmd(arg: string): string {
  if (arg.length === 0) return "\"\"";
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replace(/"/g, "\"\"")}"`;
}

function resolveSpawnCommand(cmd: string, args: string[]): [string, string[]] {
  if (process.platform === "win32" && /\.cmd$/i.test(cmd)) {
    const comspec = process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
    const commandLine = [cmd, ...args].map(quoteForCmd).join(" ");
    return [comspec, ["/d", "/s", "/c", commandLine]];
  }

  return [cmd, args];
}

function isUnsupportedChatgptCodexModelError(error: unknown): error is Error {
  return error instanceof Error
    && error.message.includes("is not supported when using Codex with a ChatGPT account");
}

function formatCodexError(error: unknown, modelOverride: string | null): Error {
  if (isUnsupportedChatgptCodexModelError(error)) {
    const modelMessage = modelOverride
      ? `The configured Codex model override "${modelOverride}" is not available for the current Codex login.`
      : "The configured Codex model is not available for the current Codex login.";
    return new Error(
      `${modelMessage} Clear LLM_MODEL in scripts/producer/.env to let Codex choose its default model, or switch Codex to an API-backed login that supports explicit model selection.`,
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

async function generateViaCodex(
  config: ProducerConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const outputFile = join(tmpdir(), `opn-producer-output-${Date.now()}.txt`);
  const stdinPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}\n\nRespond with ONLY a raw JSON array. No markdown fences, no explanation.`;

  try {
    const args = [
      "exec",
      "--full-auto",
      "--ephemeral",
      "--skip-git-repo-check",
      "-o", outputFile,
      "-",  // read prompt from stdin
    ];
    if (config.codexModelOverride) {
      args.splice(1, 0, "-m", config.codexModelOverride);
    }

    try {
      await spawnAsync(config.codexCmd, args, stdinPrompt);
    } catch (error) {
      if (!config.codexModelOverride || !isUnsupportedChatgptCodexModelError(error)) {
        throw formatCodexError(error, config.codexModelOverride);
      }

      const fallbackArgs = args.filter((arg, index) => !(index === 1 && arg === "-m") && !(index === 2 && arg === config.codexModelOverride));

      await spawnAsync(config.codexCmd, fallbackArgs, stdinPrompt);
    }

    const output = await readFile(outputFile, "utf-8");
    return output;
  } finally {
    await unlink(outputFile).catch(() => {});
  }
}

function extractJsonArray(text: string): unknown[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array found in LLM response: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error("LLM response parsed but is not an array");
  }

  return parsed;
}

export async function generateJson(
  config: ProducerConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<unknown[]> {
  let text: string;

  switch (config.llmProvider) {
    case "ollama":
      text = await generateViaOllama(config, systemPrompt, userPrompt);
      break;
    case "codex":
      text = await generateViaCodex(config, systemPrompt, userPrompt);
      break;
    default:
      text = await generateViaAnthropic(config, systemPrompt, userPrompt);
      break;
  }

  return extractJsonArray(text);
}
