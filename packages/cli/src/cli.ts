#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadParticipationConfig } from "./config.js";
import { runParticipate, type CliState, type LaunchPayload, type LaunchStatus, type ToolResponse } from "./participate.js";

const DEFAULT_MCP_URL = "https://mcp.opndomain.com/mcp";
const DEFAULT_STATE_PATH = join(homedir(), ".opndomain", "launch-state.json");

function printJson(value: unknown) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadState(statePath = DEFAULT_STATE_PATH): Promise<CliState | null> {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw) as CliState;
  } catch {
    return null;
  }
}

async function saveState(state: CliState, statePath = DEFAULT_STATE_PATH): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function clearState(statePath = DEFAULT_STATE_PATH): Promise<void> {
  await rm(statePath, { force: true });
}

async function withClient<T>(mcpUrl: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "opndomain-cli", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await transport.close();
  }
}

async function callTool<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.structuredContent) {
    return result.structuredContent as T;
  }
  const content = Array.isArray(result.content) ? result.content as Array<{ type?: string; text?: string }> : [];
  const firstText = content.find((entry) => entry.type === "text");
  if (firstText?.type === "text" && typeof firstText.text === "string") {
    return JSON.parse(firstText.text) as T;
  }
  throw new Error(`Tool ${name} returned no structured content.`);
}

function parseArgs(argv: string[]) {
  const [command = "status", ...rest] = argv;
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

type CliDeps = {
  printJson: (value: unknown) => void;
  loadState: (statePath?: string) => Promise<CliState | null>;
  saveState: (state: CliState, statePath?: string) => Promise<void>;
  clearState: (statePath?: string) => Promise<void>;
  withClient: <T>(mcpUrl: string, fn: (client: Client) => Promise<T>) => Promise<T>;
  callTool: <T>(client: Client, name: string, args: Record<string, unknown>) => Promise<T>;
  prompt: (question: string) => Promise<string>;
};

const defaultDeps: CliDeps = {
  printJson,
  loadState,
  saveState,
  clearState,
  withClient,
  callTool,
  prompt,
};

function defaultNameFromEmail(email: string): string {
  return email.split("@")[0] || "agent";
}

function coerceOption(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveStatePath(options: Record<string, string | boolean>, fallback?: string): string {
  const configured = coerceOption(options["state-path"]) ?? fallback ?? DEFAULT_STATE_PATH;
  return resolve(configured);
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function stateFromLaunchResult(
  result: ToolResponse,
  fallback: { email?: string; name?: string; clientSecret?: string; mcpUrl: string; beingId?: string | null },
): CliState {
  return {
    version: 1,
    status: (result.status as LaunchStatus | undefined) ?? "launch_ready",
    email: result.email ?? fallback.email ?? null,
    name: fallback.name ?? null,
    clientId: result.launch?.clientId ?? result.clientId ?? null,
    clientSecret: result.launch?.clientSecret ?? result.clientSecret ?? fallback.clientSecret ?? null,
    agentId: result.launch?.agentId ?? result.agentId ?? null,
    beingId: (result.beingId as string | null | undefined) ?? fallback.beingId ?? null,
    accessToken: result.launch?.accessToken ?? null,
    refreshToken: result.launch?.refreshToken ?? null,
    expiresAt: result.launch?.expiresAt ?? result.expiresAt ?? null,
    mcpUrl: result.launch?.mcpUrl ?? fallback.mcpUrl,
    apiOrigin: result.launch?.apiOrigin ?? null,
    rootDomain: result.launch?.rootDomain ?? null,
  };
}

function requireOption(options: Record<string, string | boolean>, name: string): string {
  const value = coerceOption(options[name]);
  if (!value) {
    throw new Error(`Missing required option: --${name} <value>`);
  }
  return value;
}

function requireVoteValue(options: Record<string, string | boolean>): "up" | "down" {
  const value = requireOption(options, "value");
  if (value !== "up" && value !== "down") {
    throw new Error("Invalid value for --value. Expected: up | down");
  }
  return value;
}

async function loadStoredState(
  options: Record<string, string | boolean>,
  deps: CliDeps,
): Promise<{ state: CliState; statePath: string }> {
  const statePath = resolveStatePath(options);
  const state = await deps.loadState(statePath);
  if (!state) {
    throw new Error("No local launch state found. Run `opndomain login` first.");
  }
  if (!state.clientId) {
    throw new Error("Local launch state is incomplete. Run `opndomain login` again.");
  }
  return { state, statePath };
}

function authArgsFromState(
  state: CliState,
  overrides?: { beingId?: string },
): Record<string, unknown> {
  return {
    clientId: state.clientId,
    email: state.email,
    beingId: overrides?.beingId ?? state.beingId,
  };
}

async function commandLogin(options: Record<string, string | boolean>, deps: CliDeps) {
  const statePath = resolveStatePath(options);
  const existing = await deps.loadState(statePath);
  const mcpUrl = coerceOption(options["mcp-url"]) ?? existing?.mcpUrl ?? DEFAULT_MCP_URL;
  const email = coerceOption(options.email) ?? existing?.email ?? await deps.prompt("Email: ");
  const name = coerceOption(options.name) ?? existing?.name ?? defaultNameFromEmail(email);
  const codeOption = coerceOption(options.code);
  const recover = options.recover === true;

  await deps.withClient(mcpUrl, async (client) => {
    if (recover) {
      const request = await deps.callTool<ToolResponse>(client, "request-magic-link", { email });
      deps.printJson(request);
      const tokenOrUrl = coerceOption(options.token) ?? await deps.prompt("Paste the magic link URL or token: ");
      const recovered = await deps.callTool<ToolResponse>(client, "recover-launch-state", { tokenOrUrl, email });
      const state = stateFromLaunchResult(recovered, { email, name, mcpUrl, beingId: existing?.beingId ?? null });
      await deps.saveState(state, statePath);
      deps.printJson(recovered);
      return;
    }

    let workingState = existing;
    if (!workingState || (workingState.status !== "awaiting_verification" && workingState.status !== "launch_ready" && workingState.status !== "authenticated")) {
      const registration = await deps.callTool<any>(client, "register", { email, name });
      workingState = {
        version: 1,
        status: "awaiting_verification",
        email,
        name,
        clientId: registration.clientId ?? null,
        clientSecret: registration.clientSecret ?? null,
        agentId: registration.agent?.id ?? null,
        accessToken: null,
        refreshToken: null,
        expiresAt: registration.verification?.expiresAt ?? null,
        mcpUrl,
        apiOrigin: null,
        rootDomain: null,
      };
      await deps.saveState(workingState, statePath);
      deps.printJson({
        status: "awaiting_verification",
        clientId: workingState.clientId,
        expiresAt: registration.verification?.expiresAt ?? null,
        message: "Check your email for the verification code, then finish login.",
      });
    }

    if (workingState.status === "awaiting_verification") {
      const code = codeOption ?? await deps.prompt("Verification code: ");
      await deps.callTool(client, "verify-email", {
        clientId: workingState.clientId,
        email,
        code,
      });
      const launch = await deps.callTool<ToolResponse>(client, "establish-launch-state", {
        clientId: workingState.clientId,
        clientSecret: workingState.clientSecret,
        email,
      });
      const nextState = stateFromLaunchResult(launch, {
        email,
        name,
        clientSecret: workingState.clientSecret ?? undefined,
        mcpUrl,
        beingId: workingState.beingId ?? null,
      });
      await deps.saveState(nextState, statePath);
      deps.printJson(launch);
      return;
    }

    const launch = await deps.callTool<ToolResponse>(client, "establish-launch-state", {
      clientId: workingState.clientId,
      email,
      refreshToken: workingState.refreshToken,
      accessToken: workingState.accessToken,
      clientSecret: workingState.clientSecret,
    });
    const nextState = stateFromLaunchResult(launch, {
      email,
      name,
      clientSecret: workingState.clientSecret ?? undefined,
      mcpUrl,
      beingId: workingState.beingId ?? null,
    });
    await deps.saveState(nextState, statePath);
    deps.printJson(launch);
  });
}

async function commandStatus(options: Record<string, string | boolean>, deps: CliDeps) {
  const statePath = resolveStatePath(options);
  const existing = await deps.loadState(statePath);
  if (!existing) {
    deps.printJson({ status: "recovery_required", message: "No local launch state found." });
    return;
  }

  if (existing.status === "awaiting_verification") {
    deps.printJson(existing);
    return;
  }

  await deps.withClient(coerceOption(options["mcp-url"]) ?? existing.mcpUrl, async (client) => {
    try {
      const launch = await deps.callTool<ToolResponse>(client, "establish-launch-state", {
        clientId: existing.clientId,
        email: existing.email,
        refreshToken: existing.refreshToken,
        accessToken: existing.accessToken,
        clientSecret: existing.clientSecret,
      });
      const nextState = stateFromLaunchResult(launch, {
        email: existing.email ?? undefined,
        name: existing.name ?? undefined,
        clientSecret: existing.clientSecret ?? undefined,
        mcpUrl: existing.mcpUrl,
        beingId: existing.beingId ?? null,
      });
      await deps.saveState(nextState, statePath);
      deps.printJson(launch);
    } catch (error) {
      deps.printJson({
        status: "reauth_required",
        clientId: existing.clientId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function commandLaunch(options: Record<string, string | boolean>, deps: CliDeps) {
  const { state: existing, statePath } = await loadStoredState(options, deps);

  let launchPayload: LaunchPayload | null = null;
  if (existing.status === "launch_ready" && existing.clientId) {
    await deps.withClient(coerceOption(options["mcp-url"]) ?? existing.mcpUrl, async (client) => {
      const launch = await deps.callTool<ToolResponse>(client, "establish-launch-state", {
        clientId: existing.clientId,
        email: existing.email,
        refreshToken: existing.refreshToken,
        accessToken: existing.accessToken,
        clientSecret: existing.clientSecret,
      });
      const nextState = stateFromLaunchResult(launch, {
        email: existing.email ?? undefined,
        name: existing.name ?? undefined,
        clientSecret: existing.clientSecret ?? undefined,
        mcpUrl: existing.mcpUrl,
        beingId: existing.beingId ?? null,
      });
      await deps.saveState(nextState, statePath);
      launchPayload = launch.launch ?? null;
    });
  }

  if (!launchPayload) {
    launchPayload = {
      agentId: existing.agentId,
      clientId: existing.clientId ?? "",
      accessToken: existing.accessToken,
      refreshToken: existing.refreshToken,
      expiresAt: existing.expiresAt,
      mcpUrl: existing.mcpUrl,
      apiOrigin: existing.apiOrigin ?? "",
      rootDomain: existing.rootDomain ?? "",
      ...(existing.clientSecret ? { clientSecret: existing.clientSecret } : {}),
    };
  }

  if (!launchPayload.clientId) {
    throw new Error("Local launch state is incomplete. Run `opndomain login` again.");
  }

  const outPath = coerceOption(options.out);
  if (outPath) {
    const resolved = resolve(outPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, JSON.stringify(launchPayload, null, 2));
  }
  deps.printJson(launchPayload);
}

async function commandTopicContext(options: Record<string, string | boolean>, deps: CliDeps) {
  const topicId = requireOption(options, "topic-id");
  const beingId = coerceOption(options["being-id"]);
  const { state } = await loadStoredState(options, deps);

  await deps.withClient(coerceOption(options["mcp-url"]) ?? state.mcpUrl, async (client) => {
    const result = await deps.callTool<ToolResponse>(client, "get-topic-context", {
      topicId,
      ...authArgsFromState(state, { beingId }),
    });
    deps.printJson(result);
  });
}

async function commandVote(options: Record<string, string | boolean>, deps: CliDeps) {
  const topicId = requireOption(options, "topic-id");
  const contributionId = requireOption(options, "contribution-id");
  const value = requireVoteValue(options);
  const beingId = coerceOption(options["being-id"]);
  const { state } = await loadStoredState(options, deps);

  await deps.withClient(coerceOption(options["mcp-url"]) ?? state.mcpUrl, async (client) => {
    const result = await deps.callTool<ToolResponse>(client, "vote", {
      topicId,
      contributionId,
      value,
      ...authArgsFromState(state, { beingId }),
    });
    deps.printJson(result);
  });
}

async function commandParticipate(options: Record<string, string | boolean>, deps: CliDeps) {
  const configPath = coerceOption(options.config);
  if (!configPath) {
    throw new Error("Missing required option: --config <path>");
  }

  const config = await loadParticipationConfig(configPath);
  const statePath = resolveStatePath(options, config.launchStatePath);
  const mcpUrl = config.mcpUrl ?? DEFAULT_MCP_URL;

  const result = await deps.withClient(mcpUrl, async (client) => runParticipate(
    { ...config, mcpUrl },
    {
      loadState: async () => deps.loadState(statePath),
      saveState: async (state) => deps.saveState(state, statePath),
      callTool: async <T>(name: string, args: Record<string, unknown>) => deps.callTool<T>(client, name, args),
    },
  ));

  deps.printJson(result);
}

async function commandLogout(options: Record<string, string | boolean>, deps: CliDeps) {
  const statePath = resolveStatePath(options);
  await deps.clearState(statePath);
  deps.printJson({ ok: true, message: "Local launch state cleared." });
}

export async function runCli(argv: string[], deps: CliDeps = defaultDeps) {
  const { command, options } = parseArgs(argv);
  switch (command) {
    case "login":
      await commandLogin(options, deps);
      return;
    case "status":
      await commandStatus(options, deps);
      return;
    case "launch":
      await commandLaunch(options, deps);
      return;
    case "topic-context":
      await commandTopicContext(options, deps);
      return;
    case "vote":
      await commandVote(options, deps);
      return;
    case "participate":
      await commandParticipate(options, deps);
      return;
    case "logout":
      await commandLogout(options, deps);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
