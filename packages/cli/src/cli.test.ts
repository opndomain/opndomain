import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./cli.js";
import { loadParticipationConfig } from "./config.js";
import { runParticipate, type CliState, type ToolResponse } from "./participate.js";

function buildCliState(overrides: Partial<CliState> = {}): CliState {
  return {
    version: 1,
    status: "launch_ready",
    email: "agent@example.com",
    name: "Agent",
    clientId: "cli_1",
    clientSecret: "sec_1",
    agentId: "agt_1",
    beingId: "bng_state",
    accessToken: "access_1",
    refreshToken: "refresh_1",
    expiresAt: "2026-03-28T00:15:00.000Z",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    apiOrigin: "https://api.opndomain.com",
    rootDomain: "opndomain.com",
    ...overrides,
  };
}

test("loadParticipationConfig resolves relative file paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "opn-cli-config-"));
  const promptsDir = join(root, "prompts");
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, "body.md"), "Contribution body");
  await writeFile(
    join(root, "participate.json"),
    JSON.stringify({
      mcpUrl: "https://mcp.opndomain.com/mcp",
      operator: {
        email: "agent@example.com",
        name: "Agent",
      },
      launchStatePath: "./state/custom.json",
      contribution: {
        bodyPath: "./prompts/body.md",
      },
    }),
  );

  const config = await loadParticipationConfig(join(root, "participate.json"));
  assert.equal(config.contribution.body, "Contribution body");
  assert.equal(config.contribution.bodyPath, join(promptsDir, "body.md"));
  assert.equal(config.launchStatePath, join(root, "state", "custom.json"));
});

test("loadParticipationConfig accepts yaml files", async () => {
  const root = await mkdtemp(join(tmpdir(), "opn-cli-config-yaml-"));
  const promptsDir = join(root, "prompts");
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, "body.md"), "Contribution body from yaml");
  await writeFile(
    join(root, "participate.yaml"),
    [
      "mcpUrl: https://mcp.opndomain.com/mcp",
      "operator:",
      "  email: agent@example.com",
      "  name: Agent",
      "contribution:",
      "  bodyPath: ./prompts/body.md",
      "",
    ].join("\n"),
  );

  const config = await loadParticipationConfig(join(root, "participate.yaml"));
  assert.equal(config.contribution.body, "Contribution body from yaml");
  assert.equal(config.contribution.bodyPath, join(promptsDir, "body.md"));
});

test("runParticipate registers and returns awaiting_verification when no code is configured", async () => {
  let savedState: CliState | null = null;
  const config = {
    configPath: "participate.json",
    configDir: ".",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    operator: { email: "new@example.com", name: "New Agent" },
    contribution: { bodyPath: "body.md", body: "hello world" },
    output: { format: "json" as const },
  };

  const result = await runParticipate(config, {
    loadState: async () => null,
    saveState: async (state) => {
      savedState = state;
    },
    callTool: async <T>(name: string) => {
      assert.equal(name, "register");
      return {
        clientId: "cli_new",
        clientSecret: "sec_new",
        agent: { id: "agt_new" },
        verification: { expiresAt: "2026-03-27T00:15:00.000Z" },
      } as T;
    },
  });

  assert.equal(result.status, "awaiting_verification");
  assert.deepEqual(result.verification, {
    expiresAt: "2026-03-27T00:15:00.000Z",
    delivery: null,
  });
  if (savedState === null) {
    throw new Error("Expected state to be saved.");
  }
  const persisted = savedState as CliState;
  assert.equal(persisted.clientId, "cli_new");
  assert.equal(persisted.clientSecret, "sec_new");
});

test("runParticipate verifies, establishes launch state, and forwards explicit topic targeting", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let state: CliState | null = {
    version: 1,
    status: "awaiting_verification",
    email: "agent@example.com",
    name: "Agent",
    clientId: "cli_1",
    clientSecret: "sec_1",
    agentId: "agt_1",
    accessToken: null,
    refreshToken: null,
    expiresAt: "2026-03-27T00:15:00.000Z",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    apiOrigin: null,
    rootDomain: null,
  };

  const result = await runParticipate({
    configPath: "participate.json",
    configDir: ".",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    operator: {
      email: "agent@example.com",
      name: "Agent",
      handle: "agent-handle",
    },
    auth: {
      verificationCode: "123456",
    },
    topic: {
      topicId: "top_started",
    },
    contribution: {
      bodyPath: "body.md",
      body: "Contribution body",
    },
    output: {
      format: "json",
    },
  }, {
    loadState: async () => state,
    saveState: async (nextState) => {
      state = nextState;
    },
    callTool: async <T>(name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "verify-email") {
        return {} as T;
      }
      if (name === "establish-launch-state") {
        return {
          status: "launch_ready",
          clientId: "cli_1",
          agentId: "agt_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_1",
            refreshToken: "refresh_1",
            expiresAt: "2026-03-28T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
            clientSecret: "sec_1",
          },
        } as T;
      }
      if (name === "participate") {
        return {
          status: "contributed",
          clientId: "cli_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_1",
            refreshToken: "refresh_1",
            expiresAt: "2026-03-28T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
          },
          transcript: [{ id: "cnt_1" }],
        } as T;
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  });

  assert.equal(result.status, "contributed");
  assert.deepEqual(calls.map((entry) => entry.name), ["verify-email", "establish-launch-state", "participate"]);
  assert.equal(calls[2]?.args.topicId, "top_started");
  assert.equal(calls[2]?.args.body, "Contribution body");
  assert.equal((state as CliState).accessToken, "access_1");
});

test("runParticipate preserves discovery-filter participation branches", async () => {
  let state: CliState | null = {
    version: 1,
    status: "launch_ready",
    email: "agent@example.com",
    name: "Agent",
    clientId: "cli_1",
    clientSecret: "sec_1",
    agentId: "agt_1",
    accessToken: "access_1",
    refreshToken: "refresh_1",
    expiresAt: "2026-03-28T00:15:00.000Z",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    apiOrigin: "https://api.opndomain.com",
    rootDomain: "opndomain.com",
  };

  const result = await runParticipate({
    configPath: "participate.json",
    configDir: ".",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    operator: {
      email: "agent@example.com",
      name: "Agent",
    },
    topic: {
      domainSlug: "ai-safety",
      templateId: "debate_v2",
    },
    contribution: {
      bodyPath: "body.md",
      body: "Contribution body",
    },
    output: {
      format: "json",
    },
  }, {
    loadState: async () => state,
    saveState: async (nextState) => {
      state = nextState;
    },
    callTool: async <T>(name: string, args: Record<string, unknown>) => {
      if (name === "establish-launch-state") {
        return {
          status: "launch_ready",
          clientId: "cli_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_1",
            refreshToken: "refresh_1",
            expiresAt: "2026-03-28T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
          },
        } as T;
      }
      if (name === "participate") {
        assert.equal(args.domainSlug, "ai-safety");
        assert.equal(args.templateId, "debate_v2");
        assert.equal(args.topicId, undefined);
        return {
          status: "joined_awaiting_start",
          topicId: "top_open",
          topicStatus: "open",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_1",
            refreshToken: "refresh_1",
            expiresAt: "2026-03-28T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
          },
        } as T;
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  });

  assert.equal(result.status, "joined_awaiting_start");
  assert.equal(state?.status, "joined_awaiting_start");
});

test("onboard rejects invalid email addresses", async () => {
  const printed: string[] = [];
  const deps = {
    printJson: () => undefined,
    loadState: async () => null,
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async () => undefined as never,
    callTool: async () => undefined as never,
    prompt: async () => "jarvisquant",
  };

  // Capture stdout
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    printed.push(chunk);
    return true;
  }) as typeof process.stdout.write;

  await runCli([], deps);

  process.stdout.write = originalWrite;
  const output = printed.join("");
  assert.match(output, /doesn't look like a valid email/);
});

test("no-arg run resumes verification flow when state is awaiting_verification", async () => {
  const calls: Array<{ name: string }> = [];
  const printed: unknown[] = [];
  const stdoutParts: string[] = [];

  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    stdoutParts.push(chunk);
    return true;
  }) as typeof process.stdout.write;

  await runCli([], {
    printJson: (value) => {
      printed.push(value);
    },
    loadState: async () => buildCliState({ status: "awaiting_verification" }),
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async (_mcpUrl, fn) => fn({} as never),
    callTool: async <T>(_client: unknown, name: string) => {
      calls.push({ name });
      if (name === "verify-email") return {} as T;
      if (name === "establish-launch-state") {
        return {
          status: "launch_ready",
          clientId: "cli_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_1",
            refreshToken: "refresh_1",
            expiresAt: "2026-03-28T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
            clientSecret: "sec_1",
          },
        } as T;
      }
      throw new Error(`Unexpected tool ${name}`);
    },
    prompt: async () => "123456",
  });

  process.stdout.write = originalWrite;
  const stdoutText = stdoutParts.join("");
  assert.match(stdoutText, /pending verification/);
  assert.deepEqual(calls.map((c) => c.name), ["verify-email", "establish-launch-state"]);
});

test("runCli topic-context requires topic-id", async () => {
  await assert.rejects(
    () => runCli(["topic-context"], {
      printJson: () => undefined,
      loadState: async () => null,
      saveState: async () => undefined,
      clearState: async () => undefined,
      withClient: async () => undefined as never,
      callTool: async () => undefined as never,
      prompt: async () => "",
    }),
    /Missing required option: --topic-id <value>/,
  );
});

test("runCli verdict requires topic-id", async () => {
  await assert.rejects(
    () => runCli(["verdict"], {
      printJson: () => undefined,
      loadState: async () => null,
      saveState: async () => undefined,
      clearState: async () => undefined,
      withClient: async () => undefined as never,
      callTool: async () => undefined as never,
      prompt: async () => "",
    }),
    /Missing required option: --topic-id <value>/,
  );
});

test("runCli vote requires contribution-id and value", async () => {
  const deps = {
    printJson: () => undefined,
    loadState: async () => buildCliState(),
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async () => undefined as never,
    callTool: async () => undefined as never,
    prompt: async () => "",
  };

  await assert.rejects(() => runCli(["vote", "--topic-id", "top_1"], deps), /Missing required option: --contribution-id <value>/);
  await assert.rejects(() => runCli(["vote", "--topic-id", "top_1", "--contribution-id", "cnt_1"], deps), /Missing required option: --value <value>/);
  await assert.rejects(
    () => runCli(["vote", "--topic-id", "top_1", "--contribution-id", "cnt_1", "--value", "sideways"], deps),
    /Invalid value for --value. Expected: up \| down/,
  );
});

test("runCli topic-context uses stored launch state and explicit overrides", async () => {
  const printed: unknown[] = [];
  const calls: Array<{ mcpUrl: string; name: string; args: Record<string, unknown> }> = [];
  let loadedStatePath: string | undefined;

  await runCli([
    "topic-context",
    "--topic-id", "top_1",
    "--being-id", "bng_override",
    "--state-path", "./tmp/state.json",
    "--mcp-url", "https://example.com/mcp",
  ], {
    printJson: (value) => {
      printed.push(value);
    },
    loadState: async (statePath) => {
      loadedStatePath = statePath;
      return buildCliState();
    },
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async (mcpUrl, fn) => fn({ mcpUrl } as never),
    callTool: async <T>(client: unknown, name: string, args: Record<string, unknown>) => {
      calls.push({ mcpUrl: ((client as unknown) as { mcpUrl: string }).mcpUrl, name, args });
      return { topicId: "top_1", currentRound: { status: "active" } } as T;
    },
    prompt: async () => "",
  });

  assert.equal(loadedStatePath?.endsWith(join("tmp", "state.json")), true);
  assert.deepEqual(calls, [{
    mcpUrl: "https://example.com/mcp",
    name: "get-topic-context",
    args: {
      topicId: "top_1",
      clientId: "cli_1",
      email: "agent@example.com",
      beingId: "bng_override",
    },
  }]);
  assert.deepEqual(printed, [{ topicId: "top_1", currentRound: { status: "active" } }]);
});

test("runCli verdict works without stored launch state", async () => {
  const printed: unknown[] = [];
  const calls: Array<{ mcpUrl: string; name: string; args: Record<string, unknown> }> = [];

  await runCli([
    "verdict",
    "--topic-id", "top_1",
  ], {
    printJson: (value) => {
      printed.push(value);
    },
    loadState: async () => null,
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async (mcpUrl, fn) => fn({ mcpUrl } as never),
    callTool: async <T>(client: unknown, name: string, args: Record<string, unknown>) => {
      calls.push({ mcpUrl: ((client as unknown) as { mcpUrl: string }).mcpUrl, name, args });
      return { status: "published", verdict: { topicId: "top_1" } } as T;
    },
    prompt: async () => "",
  });

  assert.deepEqual(calls, [{
    mcpUrl: "https://mcp.opndomain.com/mcp",
    name: "get-verdict",
    args: {
      topicId: "top_1",
    },
  }]);
  assert.deepEqual(printed, [{ status: "published", verdict: { topicId: "top_1" } }]);
});

test("runCli vote uses stored state defaults when no being override is provided", async () => {
  const printed: unknown[] = [];
  const calls: Array<{ mcpUrl: string; name: string; args: Record<string, unknown> }> = [];

  await runCli([
    "vote",
    "--topic-id", "top_1",
    "--contribution-id", "cnt_1",
    "--value", "up",
  ], {
    printJson: (value) => {
      printed.push(value);
    },
    loadState: async () => buildCliState(),
    saveState: async () => undefined,
    clearState: async () => undefined,
    withClient: async (mcpUrl, fn) => fn({ mcpUrl } as never),
    callTool: async <T>(client: unknown, name: string, args: Record<string, unknown>) => {
      calls.push({ mcpUrl: ((client as unknown) as { mcpUrl: string }).mcpUrl, name, args });
      return { ok: true, voteId: "vot_1" } as T;
    },
    prompt: async () => "",
  });

  assert.deepEqual(calls, [{
    mcpUrl: "https://mcp.opndomain.com/mcp",
    name: "vote",
    args: {
      topicId: "top_1",
      contributionId: "cnt_1",
      value: "up",
      clientId: "cli_1",
      email: "agent@example.com",
      beingId: "bng_state",
    },
  }]);
  assert.deepEqual(printed, [{ ok: true, voteId: "vot_1" }]);
});

test("runCli status preserves stored beingId when launch refresh omits it", async () => {
  const savedStates: CliState[] = [];

  await runCli(["status"], {
    printJson: () => undefined,
    loadState: async () => buildCliState(),
    saveState: async (state) => {
      savedStates.push(state);
    },
    clearState: async () => undefined,
    withClient: async (mcpUrl, fn) => fn({ mcpUrl } as never),
    callTool: async <T>() => ({
      status: "launch_ready",
      clientId: "cli_1",
      agentId: "agt_1",
      email: "agent@example.com",
      launch: {
        clientId: "cli_1",
        agentId: "agt_1",
        accessToken: "access_2",
        refreshToken: "refresh_2",
        expiresAt: "2026-03-29T00:15:00.000Z",
        mcpUrl: "https://mcp.opndomain.com/mcp",
        apiOrigin: "https://api.opndomain.com",
        rootDomain: "opndomain.com",
        clientSecret: "sec_1",
      },
    } as T),
    prompt: async () => "",
  });

  assert.equal(savedStates[0]?.beingId, "bng_state");
});

test("runParticipate preserves stored beingId when launch refresh omits it", async () => {
  let state: CliState | null = buildCliState();

  const result = await runParticipate({
    configPath: "participate.json",
    configDir: ".",
    mcpUrl: "https://mcp.opndomain.com/mcp",
    operator: {
      email: "agent@example.com",
      name: "Agent",
    },
    contribution: {
      bodyPath: "body.md",
      body: "Contribution body",
    },
    output: {
      format: "json",
    },
  }, {
    loadState: async () => state,
    saveState: async (nextState) => {
      state = nextState;
    },
    callTool: async <T>(name: string) => {
      if (name === "establish-launch-state") {
        return {
          status: "launch_ready",
          clientId: "cli_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_2",
            refreshToken: "refresh_2",
            expiresAt: "2026-03-29T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
            clientSecret: "sec_1",
          },
        } as T;
      }
      if (name === "participate") {
        return {
          status: "contributed",
          clientId: "cli_1",
          launch: {
            clientId: "cli_1",
            agentId: "agt_1",
            accessToken: "access_3",
            refreshToken: "refresh_3",
            expiresAt: "2026-03-30T00:15:00.000Z",
            mcpUrl: "https://mcp.opndomain.com/mcp",
            apiOrigin: "https://api.opndomain.com",
            rootDomain: "opndomain.com",
          },
        } as T;
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  });

  assert.equal(result.status, "contributed");
  assert.equal(state?.beingId, "bng_state");
});
