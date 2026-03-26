#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type LaunchStatus =
  | "awaiting_verification"
  | "authenticated"
  | "launch_ready"
  | "reauth_required"
  | "recovery_required"
  | "awaiting_magic_link";

type LaunchPayload = {
  agentId: string | null;
  clientId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  mcpUrl: string;
  apiOrigin: string;
  rootDomain: string;
  clientSecret?: string;
};

type CliState = {
  version: 1;
  status: LaunchStatus;
  email: string | null;
  name: string | null;
  clientId: string | null;
  clientSecret: string | null;
  agentId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  mcpUrl: string;
  apiOrigin: string | null;
  rootDomain: string | null;
};

type ToolResponse = {
  status?: LaunchStatus;
  clientId?: string | null;
  agentId?: string | null;
  email?: string | null;
  launch?: LaunchPayload | null;
  delivery?: unknown;
  expiresAt?: string | null;
  message?: string | null;
  verification?: {
    expiresAt?: string | null;
  };
  clientSecret?: string;
};

const DEFAULT_MCP_URL = "https://mcp.opndomain.com/mcp";
const STATE_PATH = join(homedir(), ".opndomain", "launch-state.json");

function printJson(value: unknown) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function loadState(): Promise<CliState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as CliState;
  } catch {
    return null;
  }
}

async function saveState(state: CliState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function clearState(): Promise<void> {
  await rm(STATE_PATH, { force: true });
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

function defaultNameFromEmail(email: string): string {
  return email.split("@")[0] || "agent";
}

function coerceOption(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function stateFromLaunchResult(result: ToolResponse, fallback: { email?: string; name?: string; clientSecret?: string; mcpUrl: string }): CliState {
  return {
    version: 1,
    status: result.status ?? "launch_ready",
    email: result.email ?? fallback.email ?? null,
    name: fallback.name ?? null,
    clientId: result.launch?.clientId ?? result.clientId ?? null,
    clientSecret: result.launch?.clientSecret ?? fallback.clientSecret ?? null,
    agentId: result.launch?.agentId ?? result.agentId ?? null,
    accessToken: result.launch?.accessToken ?? null,
    refreshToken: result.launch?.refreshToken ?? null,
    expiresAt: result.launch?.expiresAt ?? result.expiresAt ?? null,
    mcpUrl: result.launch?.mcpUrl ?? fallback.mcpUrl,
    apiOrigin: result.launch?.apiOrigin ?? null,
    rootDomain: result.launch?.rootDomain ?? null,
  };
}

async function commandLogin(options: Record<string, string | boolean>) {
  const existing = await loadState();
  const mcpUrl = coerceOption(options["mcp-url"]) ?? existing?.mcpUrl ?? DEFAULT_MCP_URL;
  const email = coerceOption(options.email) ?? existing?.email ?? await prompt("Email: ");
  const name = coerceOption(options.name) ?? existing?.name ?? defaultNameFromEmail(email);
  const codeOption = coerceOption(options.code);
  const recover = options.recover === true;

  await withClient(mcpUrl, async (client) => {
    if (recover) {
      const request = await callTool<ToolResponse>(client, "request-magic-link", { email });
      printJson(request);
      const tokenOrUrl = coerceOption(options.token) ?? await prompt("Paste the magic link URL or token: ");
      const recovered = await callTool<ToolResponse>(client, "recover-launch-state", { tokenOrUrl, email });
      const state = stateFromLaunchResult(recovered, { email, name, mcpUrl });
      await saveState(state);
      printJson(recovered);
      return;
    }

    let workingState = existing;
    if (!workingState || (workingState.status !== "awaiting_verification" && workingState.status !== "launch_ready" && workingState.status !== "authenticated")) {
      const registration = await callTool<any>(client, "register", { email, name });
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
      await saveState(workingState);
      printJson({
        status: "awaiting_verification",
        clientId: workingState.clientId,
        expiresAt: registration.verification?.expiresAt ?? null,
        message: "Check your email for the verification code, then finish login.",
      });
    }

    if (workingState.status === "awaiting_verification") {
      const code = codeOption ?? await prompt("Verification code: ");
      await callTool(client, "verify-email", {
        clientId: workingState.clientId,
        email,
        code,
      });
      const launch = await callTool<ToolResponse>(client, "establish-launch-state", {
        clientId: workingState.clientId,
        clientSecret: workingState.clientSecret,
        email,
      });
      const nextState = stateFromLaunchResult(launch, {
        email,
        name,
        clientSecret: workingState.clientSecret ?? undefined,
        mcpUrl,
      });
      await saveState(nextState);
      printJson(launch);
      return;
    }

    const launch = await callTool<ToolResponse>(client, "establish-launch-state", {
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
    });
    await saveState(nextState);
    printJson(launch);
  });
}

async function commandStatus(options: Record<string, string | boolean>) {
  const existing = await loadState();
  if (!existing) {
    printJson({ status: "recovery_required", message: "No local launch state found." });
    return;
  }

  if (existing.status === "awaiting_verification") {
    printJson(existing);
    return;
  }

  await withClient(coerceOption(options["mcp-url"]) ?? existing.mcpUrl, async (client) => {
    try {
      const launch = await callTool<ToolResponse>(client, "establish-launch-state", {
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
      });
      await saveState(nextState);
      printJson(launch);
    } catch (error) {
      printJson({
        status: "reauth_required",
        clientId: existing.clientId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function commandLaunch(options: Record<string, string | boolean>) {
  const existing = await loadState();
  if (!existing) {
    throw new Error("No local launch state found. Run `opndomain login` first.");
  }

  let launchPayload: LaunchPayload | null = null;
  if (existing.status === "launch_ready" && existing.clientId) {
    await withClient(coerceOption(options["mcp-url"]) ?? existing.mcpUrl, async (client) => {
      const launch = await callTool<ToolResponse>(client, "establish-launch-state", {
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
      });
      await saveState(nextState);
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
  printJson(launchPayload);
}

async function commandLogout() {
  await clearState();
  printJson({ ok: true, message: "Local launch state cleared." });
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "login":
      await commandLogin(options);
      return;
    case "status":
      await commandStatus(options);
      return;
    case "launch":
      await commandLaunch(options);
      return;
    case "logout":
      await commandLogout();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
