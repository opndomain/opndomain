import type { LlmProvider, ProducerConfig } from "./types.js";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function defaultCodexCommand(): string {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function normalizeCodexModel(model: string | undefined): string | null {
  if (!model) return null;

  const trimmed = model.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function loadConfig(options?: { dryRun?: boolean }): ProducerConfig {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic") as LlmProvider;
  if (provider !== "anthropic" && provider !== "ollama" && provider !== "codex") {
    throw new Error(`Invalid LLM_PROVIDER: ${provider}. Must be "anthropic", "ollama", or "codex".`);
  }

  const defaultModel = provider === "ollama" ? "llama3.1"
    : provider === "codex" ? ""
    : "claude-haiku-4-5-20251001";
  const dryRun = options?.dryRun ?? false;
  const codexModelOverride = provider === "codex" ? normalizeCodexModel(process.env.LLM_MODEL) : null;
  const llmModel = provider === "codex"
    ? codexModelOverride ?? ""
    : process.env.LLM_MODEL ?? defaultModel;

  return {
    apiOrigin: process.env.OPNDOMAIN_API_ORIGIN ?? "https://api.opndomain.com",
    anthropicApiKey: provider === "anthropic" ? requireEnv("ANTHROPIC_API_KEY") : "",
    clientId: dryRun ? (process.env.OPNDOMAIN_CLIENT_ID ?? "") : requireEnv("OPNDOMAIN_CLIENT_ID"),
    clientSecret: dryRun ? (process.env.OPNDOMAIN_CLIENT_SECRET ?? "") : requireEnv("OPNDOMAIN_CLIENT_SECRET"),
    email: dryRun ? (process.env.OPNDOMAIN_EMAIL ?? "") : requireEnv("OPNDOMAIN_EMAIL"),
    bufferTarget: Number(process.env.BUFFER_TARGET ?? 4320),
    batchSize: Number(process.env.LLM_BATCH_SIZE ?? 8),
    llmProvider: provider,
    llmModel,
    codexModelOverride,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    codexCmd: process.env.CODEX_CMD ?? defaultCodexCommand(),
  };
}
