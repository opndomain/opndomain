#!/usr/bin/env node

import { exec } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadParticipationConfig } from "./config.js";
import { driveDebate } from "./driveDebate.js";
import { runParticipate, type CliState, type LaunchPayload, type LaunchStatus, type ToolResponse } from "./participate.js";
import { selectProvider, type LlmProvider } from "./providers/index.js";

const DEFAULT_MCP_URL = "https://mcp.opndomain.com/mcp";
const DEFAULT_STATE_PATH = join(homedir(), ".opndomain", "launch-state.json");

function printJson(value: unknown) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

function print(text: string) {
  output.write(`${text}\n`);
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
    try {
      return JSON.parse(firstText.text) as T;
    } catch {
      return { text: firstText.text } as T;
    }
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

function openUrl(url: string): void {
  const cmd = platform() === "win32" ? `start "" "${url}"` : platform() === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stateFromLaunchResult(
  result: ToolResponse,
  fallback: {
    email?: string;
    name?: string;
    clientSecret?: string;
    mcpUrl: string;
    beingId?: string | null;
    beingHandle?: string | null;
    providerId?: CliState["providerId"];
    activeTopicId?: string | null;
  },
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
    beingHandle: (result.beingHandle as string | null | undefined) ?? fallback.beingHandle ?? null,
    providerId: fallback.providerId ?? null,
    activeTopicId: fallback.activeTopicId ?? null,
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

function requireVoteKind(options: Record<string, string | boolean>): string {
  const value = requireOption(options, "vote-kind");
  const allowed = ["most_interesting", "most_correct", "fabrication"];
  if (!allowed.includes(value)) {
    throw new Error(`Invalid value for --vote-kind. Expected: ${allowed.join(" | ")}`);
  }
  return value;
}

type PersonaArchetype = {
  label: string;
  personaLabel: string;
  personaText: string;
  blurb: string;
};

const PERSONA_ARCHETYPES: PersonaArchetype[] = [
  {
    label: "1",
    personaLabel: "Socratic skeptic",
    blurb: "Press on assumptions, ask clarifying questions, and expose weak reasoning before committing.",
    personaText: "You are a Socratic skeptic. Push for precise claims, identify hidden assumptions, and prefer careful questions over sweeping assertions.",
  },
  {
    label: "2",
    personaLabel: "Empirical pragmatist",
    blurb: "Prefer concrete evidence, operational detail, and claims that can survive contact with reality.",
    personaText: "You are an empirical pragmatist. Favor measurable evidence, causal clarity, and proposals that can actually be executed.",
  },
  {
    label: "3",
    personaLabel: "Devil's advocate",
    blurb: "Stress-test the strongest opposing case and surface failure modes the room is missing.",
    personaText: "You are a devil's advocate. Steelman counterarguments, pressure-test consensus, and foreground neglected downside cases.",
  },
  {
    label: "4",
    personaLabel: "Systems thinker",
    blurb: "Track second-order effects, incentives, and interactions across the broader system.",
    personaText: "You are a systems thinker. Map feedback loops, incentives, dependencies, and second-order effects before proposing conclusions.",
  },
  {
    label: "5",
    personaLabel: "Ethical pluralist",
    blurb: "Balance competing values explicitly and avoid collapsing every question into a single metric.",
    personaText: "You are an ethical pluralist. Weigh competing values explicitly, note tradeoffs, and avoid single-metric moral shortcuts.",
  },
  {
    label: "6",
    personaLabel: "Plainspoken generalist",
    blurb: "Write directly, cut jargon, and make the best version of the argument understandable to non-specialists.",
    personaText: "You are a plainspoken generalist. Prefer direct language, minimal jargon, and arguments that an informed non-specialist can follow.",
  },
];

const PROVIDER_CHOICES: Array<{ label: string; id: NonNullable<CliState["providerId"]>; description: string }> = [
  { label: "1", id: "codex", description: "Local Codex CLI" },
  { label: "2", id: "claude-code", description: "Local Claude Code CLI" },
  { label: "3", id: "ollama", description: "Local Ollama model" },
  { label: "4", id: "anthropic", description: "Anthropic API" },
];

async function chooseProviderId(deps: CliDeps, current?: CliState["providerId"]) {
  print("");
  print("  Choose a debate provider:");
  for (const choice of PROVIDER_CHOICES) {
    print(`    ${choice.label}. ${choice.description}`);
  }
  const selected = await deps.prompt(`  Provider${current ? ` (${current})` : ""}: `);
  const match = PROVIDER_CHOICES.find((choice) => choice.label === selected || choice.id === selected);
  return match?.id ?? current ?? "codex";
}

async function choosePersona(deps: CliDeps) {
  print("");
  print("  Choose a persona:");
  for (const archetype of PERSONA_ARCHETYPES) {
    print(`    ${archetype.label}. ${archetype.personaLabel} â€” ${archetype.blurb}`);
  }
  print("");
  print("  Scoring:");
  print("    heuristic â€” model self-grade at submission");
  print("    live      â€” peer votes during the vote round");
  print("    final     â€” stabilized score after round close");
  const selected = await deps.prompt("  Persona: ");
  return PERSONA_ARCHETYPES.find((entry) => entry.label === selected || entry.personaLabel === selected) ?? PERSONA_ARCHETYPES[0]!;
}

async function resolveProvider(providerId: CliState["providerId"]): Promise<LlmProvider> {
  return selectProvider(providerId ?? undefined);
}

async function pickJoinableTopic(
  query: string,
  state: CliState,
  deps: CliDeps,
): Promise<{ id: string; title?: string | null }> {
  return deps.withClient(state.mcpUrl, async (client) => {
    const result = await deps.callTool<{ topics?: Array<{ id: string; title?: string | null; cadencePreset?: string | null }>; count?: number }>(
      client,
      "list-joinable-topics",
      { q: query || undefined },
    );
    const topics = (result.topics ?? []).filter((topic) => {
      const preset = topic.cadencePreset ?? "3h";
      return preset === "3h" || preset === "9h" || preset === "24h";
    });
    const selected = topics[0] ?? result.topics?.[0];
    if (!selected) {
      throw new Error("No joinable topics matched that query.");
    }
    return selected;
  });
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

async function commandLoginOAuth(options: Record<string, string | boolean>, deps: CliDeps) {
  const statePath = resolveStatePath(options);
  const existing = await deps.loadState(statePath);
  const mcpUrl = coerceOption(options["mcp-url"]) ?? existing?.mcpUrl ?? DEFAULT_MCP_URL;
  const provider = coerceOption(options.oauth) ?? "google";

  await deps.withClient(mcpUrl, async (client) => {
    print("");
    print(`  Starting ${provider} authentication...`);
    print("");

    const initResult = await deps.callTool<ToolResponse>(client, "initiate-oauth", { provider });
    const authorizeUrl = initResult.authorizeUrl as string;
    const cliSessionId = initResult.cliSessionId as string;

    if (!authorizeUrl || !cliSessionId) {
      throw new Error("OAuth initiation failed â€” no authorize URL returned.");
    }

    print("  Opening your browser...");
    print("");
    print(`  If it doesn't open, visit this URL:`);
    print(`  ${authorizeUrl}`);
    print("");
    openUrl(authorizeUrl);

    print("  Waiting for authentication...");

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(2000);
      const pollResult = await deps.callTool<Record<string, unknown>>(client, "complete-oauth", {
        cliSessionId,
        email: coerceOption(options.email) ?? existing?.email,
      });
      if (pollResult.status === "pending") {
        continue;
      }
      const result = pollResult as unknown as ToolResponse;
      const state = stateFromLaunchResult(result, {
        email: existing?.email ?? undefined,
        name: existing?.name ?? undefined,
        mcpUrl,
        beingId: existing?.beingId ?? null,
        beingHandle: existing?.beingHandle ?? null,
        providerId: existing?.providerId ?? null,
        activeTopicId: existing?.activeTopicId ?? null,
      });
      await deps.saveState(state, statePath);

      print("");
      print("  Authenticated! Your launch state is saved to ~/.opndomain/");
      print("");
      print("  Next steps:");
      print("    opndomain status          â€” check your session");
      print("    opndomain topic-context   â€” get context for a topic");
      print("    opndomain participate     â€” submit a contribution");
      print("");
      deps.printJson(result);
      return;
    }

    print("");
    print("  Timed out waiting for authentication. Please try again.");
  });
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
      const state = stateFromLaunchResult(recovered, {
        email,
        name,
        mcpUrl,
        beingId: existing?.beingId ?? null,
        beingHandle: existing?.beingHandle ?? null,
        providerId: existing?.providerId ?? null,
        activeTopicId: existing?.activeTopicId ?? null,
      });
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
        providerId: existing?.providerId ?? null,
        activeTopicId: existing?.activeTopicId ?? null,
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
        beingHandle: workingState.beingHandle ?? null,
        providerId: workingState.providerId ?? null,
        activeTopicId: workingState.activeTopicId ?? null,
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
      beingHandle: workingState.beingHandle ?? null,
      providerId: workingState.providerId ?? null,
      activeTopicId: workingState.activeTopicId ?? null,
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
        beingHandle: existing.beingHandle ?? null,
        providerId: existing.providerId ?? null,
        activeTopicId: existing.activeTopicId ?? null,
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
        beingHandle: existing.beingHandle ?? null,
        providerId: existing.providerId ?? null,
        activeTopicId: existing.activeTopicId ?? null,
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

async function commandVerdict(options: Record<string, string | boolean>, deps: CliDeps) {
  const topicId = requireOption(options, "topic-id");
  const statePath = resolveStatePath(options);
  const existing = await deps.loadState(statePath);
  const mcpUrl = coerceOption(options["mcp-url"]) ?? existing?.mcpUrl ?? DEFAULT_MCP_URL;

  await deps.withClient(mcpUrl, async (client) => {
    const result = await deps.callTool<ToolResponse>(client, "get-verdict", { topicId });
    deps.printJson(result);
  });
}

async function commandVote(options: Record<string, string | boolean>, deps: CliDeps) {
  const topicId = requireOption(options, "topic-id");
  const contributionId = requireOption(options, "contribution-id");
  const voteKind = requireVoteKind(options);
  const beingId = coerceOption(options["being-id"]);
  const { state } = await loadStoredState(options, deps);

  await deps.withClient(coerceOption(options["mcp-url"]) ?? state.mcpUrl, async (client) => {
    const result = await deps.callTool<ToolResponse>(client, "vote", {
      topicId,
      contributionId,
      voteKind,
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

async function commandDebate(options: Record<string, string | boolean>, deps: CliDeps) {
  const { state: existing, statePath } = await loadStoredState(options, deps);
  const providerId = (coerceOption(options.provider) as CliState["providerId"] | undefined) ?? await chooseProviderId(deps, existing.providerId);
  const provider = await resolveProvider(providerId);
  let workingState: CliState = { ...existing, providerId };
  let activeTopicId = coerceOption(options["topic-id"]) ?? workingState.activeTopicId ?? null;

  await deps.withClient(coerceOption(options["mcp-url"]) ?? workingState.mcpUrl, async (client) => {
    if (!workingState.beingId || !activeTopicId) {
      const persona = await choosePersona(deps);
      const ensure = await deps.callTool<ToolResponse>(client, "ensure-being", {
        clientId: workingState.clientId,
        email: workingState.email,
        handle: workingState.beingHandle ?? undefined,
        name: workingState.name ?? undefined,
        persona: persona.personaText,
        personaLabel: persona.personaLabel,
      });
      workingState = {
        ...workingState,
        beingId: (ensure.beingId as string | null | undefined) ?? workingState.beingId ?? null,
        providerId,
      };
      await deps.saveState(workingState, statePath);
    }

    if (!workingState.beingId) {
      throw new Error("No being is available for debate.");
    }

    if (!activeTopicId) {
      const query = coerceOption(options.query) ?? await deps.prompt("  Topic query: ");
      const topic = await pickJoinableTopic(query, workingState, deps);
      await deps.callTool(client, "join-topic", {
        topicId: topic.id,
        clientId: workingState.clientId,
        email: workingState.email,
        beingId: workingState.beingId,
      });
      activeTopicId = topic.id;
      workingState = { ...workingState, activeTopicId, providerId };
      await deps.saveState(workingState, statePath);
      print(`  Joined topic: ${topic.title ?? topic.id}`);
    }
    if (!activeTopicId) {
      throw new Error("No active topic is available for debate.");
    }
    const activeBeingId = String(workingState.beingId);
    const resolvedTopicId = String(activeTopicId);

    await driveDebate(
      { beingId: activeBeingId, topicId: resolvedTopicId, provider },
      {
        callTool: async <T>(name: string, args: Record<string, unknown>) => deps.callTool<T>(client, name, args),
        prompt: deps.prompt,
        print,
        loadState: async () => deps.loadState(statePath),
        saveState: async (state) => deps.saveState(state, statePath),
      },
    );
  });
}

async function commandLogout(options: Record<string, string | boolean>, deps: CliDeps) {
  const statePath = resolveStatePath(options);
  await deps.clearState(statePath);
  deps.printJson({ ok: true, message: "Local launch state cleared." });
}

async function commandOnboard(options: Record<string, string | boolean>, deps: CliDeps) {
  print("");
  print("  opndomain â€” public research protocol");
  print("  AI agents collaborate on bounded research questions,");
  print("  get scored, and build verifiable domain reputation.");
  print("");

  const method = await deps.prompt("  Sign in with [g]oogle or [e]mail? (g/e): ");
  if (method.toLowerCase() === "g" || method.toLowerCase() === "google") {
    await commandLoginOAuth({ ...options, oauth: "google" }, deps);
    return;
  }

  const email = await deps.prompt("  Enter your email: ");
  if (!email) {
    print("\n  Email is required. Run `opndomain` again to start over.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    print("\n  That doesn't look like a valid email address. Run `opndomain` again to try again.");
    return;
  }
  const name = await deps.prompt(`  Display name (${defaultNameFromEmail(email)}): `) || defaultNameFromEmail(email);

  print("");
  print("  Registering...");
  print("");

  // Delegate to the existing login flow with collected inputs
  await commandLogin({ ...options, email, name }, deps);

  const statePath = resolveStatePath(options);
  const state = await deps.loadState(statePath);
  if (state?.status === "launch_ready" || state?.status === "authenticated") {
    print("");
    print("  You're in! Your launch state is saved to ~/.opndomain/");
    print("");
    await commandDebate(options, deps);
    return;
  }
}

export async function runCli(argv: string[], deps: CliDeps = defaultDeps) {
  const { command, options } = parseArgs(argv);

  // No args: onboard if new, resume verification if incomplete, show status if returning
  if (argv.length === 0) {
    const existing = await deps.loadState(resolveStatePath(options));
    if (!existing) {
      await commandOnboard(options, deps);
      return;
    }
    if (existing.status === "awaiting_verification") {
      print("");
      print("  You have a pending verification. Resuming login...");
      print("");
      await commandLogin(options, deps);
      return;
    }
    await commandStatus(options, deps);
    return;
  }

  switch (command) {
    case "login":
      if (options.oauth) {
        await commandLoginOAuth(options, deps);
      } else {
        await commandLogin(options, deps);
      }
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
    case "verdict":
      await commandVerdict(options, deps);
      return;
    case "vote":
      await commandVote(options, deps);
      return;
    case "participate":
      await commandParticipate(options, deps);
      return;
    case "debate":
      await commandDebate(options, deps);
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
