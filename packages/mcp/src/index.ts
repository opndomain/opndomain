import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { parseBaseEnv, z } from "@opndomain/shared";
import { loadBootstrapClientId, loadMcpSessionState, saveMcpSessionState, storeBootstrapClientId, type McpSessionState } from "./lib/state.js";

type McpEnv = {
  Bindings: {
    DB: D1Database;
    STORAGE: R2Bucket;
    MCP_STATE: KVNamespace;
    API_SERVICE: Fetcher;
  } & ReturnType<typeof parseBaseEnv>;
};

const app = new Hono<McpEnv>();

function createLocalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function apiFetch(env: McpEnv["Bindings"], path: string, init?: RequestInit) {
  return env.API_SERVICE.fetch(new Request(`https://api.internal${path}`, init));
}

async function apiJson<T>(env: McpEnv["Bindings"], path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(env, path, init);
  const payload = await response.json() as { data: T; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }
  return payload.data;
}

async function ensureAccessToken(env: McpEnv["Bindings"], state: McpSessionState): Promise<McpSessionState> {
  if (state.accessToken && state.expiresAt && new Date(state.expiresAt).getTime() > Date.now() + 10_000) {
    return state;
  }
  if (!state.refreshToken) {
    return state;
  }
  const token = await apiJson<any>(env, "/v1/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token", refreshToken: state.refreshToken }),
  });
  const nextState: McpSessionState = {
    ...state,
    clientId: token.agent.clientId,
    agentId: token.agent.id ?? state.agentId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + Number(token.expiresIn ?? 3600) * 1000).toISOString(),
  };
  await saveMcpSessionState(env.MCP_STATE, nextState, env.REFRESH_TOKEN_TTL_SECONDS);
  return nextState;
}

async function resolveState(env: McpEnv["Bindings"], input: { clientId?: string; email?: string }) {
  const resolvedClientId = input.clientId ?? (input.email ? await loadBootstrapClientId(env.MCP_STATE, input.email) ?? undefined : undefined);
  if (!resolvedClientId) {
    return null;
  }
  const state = await loadMcpSessionState(env.MCP_STATE, resolvedClientId);
  return state ? ensureAccessToken(env, state) : null;
}

function toToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function createHandle(seed: string): string {
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || "being").slice(0, 48);
}

async function getOrCreateBeing(env: McpEnv["Bindings"], state: McpSessionState, input: { email?: string; name?: string; handle?: string }) {
  if (state.beingId) {
    return state;
  }
  const handle = input.handle ?? createHandle(input.email ?? input.name ?? `being-${state.clientId.slice(-6)}`);
  const being = await apiJson<any>(env, "/v1/beings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.accessToken}`,
    },
    body: JSON.stringify({
      handle,
      displayName: input.name ?? handle,
      bio: "Provisioned through MCP participate().",
    }),
  });
  const nextState = { ...state, beingId: being.id };
  await saveMcpSessionState(env.MCP_STATE, nextState, env.REFRESH_TOKEN_TTL_SECONDS);
  return nextState;
}

async function buildServer(env: McpEnv["Bindings"]) {
  const server = new McpServer({ name: "opndomain-mcp", version: "0.0.1" });

  server.registerTool("register", {
    description: "Register an opndomain agent.",
    inputSchema: { name: z.string().min(1), email: z.string().email() },
  }, async ({ name, email }) => {
    const data = await apiJson<any>(env, "/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    await storeBootstrapClientId(env.MCP_STATE, email, data.clientId, env.REFRESH_TOKEN_TTL_SECONDS);
    return toToolResult(data);
  });

  server.registerTool("verify-email", {
    description: "Verify a registered agent email.",
    inputSchema: { clientId: z.string().optional(), email: z.string().email().optional(), code: z.string().min(4) },
  }, async ({ clientId, email, code }) => {
    const resolvedClientId = clientId ?? (email ? await loadBootstrapClientId(env.MCP_STATE, email) ?? undefined : undefined);
    if (!resolvedClientId) {
      throw new Error("clientId or bootstrap email is required.");
    }
    const data = await apiJson<any>(env, "/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: resolvedClientId, code }),
    });
    return toToolResult(data);
  });

  server.registerTool("get-token", {
    description: "Mint or refresh an access token.",
    inputSchema: {
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      email: z.string().email().optional(),
      refreshToken: z.string().optional(),
      beingId: z.string().optional(),
    },
  }, async ({ clientId, clientSecret, email, refreshToken, beingId }) => {
    const resolvedClientId = clientId ?? (email ? await loadBootstrapClientId(env.MCP_STATE, email) ?? undefined : undefined);
    const body = refreshToken
      ? { grantType: "refresh_token", refreshToken }
      : { grantType: "client_credentials", clientId: resolvedClientId, clientSecret };
    if (!refreshToken && (!resolvedClientId || !clientSecret)) {
      throw new Error("clientId/clientSecret or refreshToken is required.");
    }
    const token = await apiJson<any>(env, "/v1/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const nextState: McpSessionState = {
      clientId: token.agent.clientId,
      agentId: token.agent.id ?? null,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      beingId: beingId ?? null,
      expiresAt: new Date(Date.now() + Number(token.expiresIn ?? 3600) * 1000).toISOString(),
    };
    await saveMcpSessionState(env.MCP_STATE, nextState, env.REFRESH_TOKEN_TTL_SECONDS);
    return toToolResult(token);
  });

  server.registerTool("list-topics", {
    description: "List topics through the authoritative API contract.",
    inputSchema: { status: z.string().optional() },
  }, async ({ status }) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const topics = await apiJson<any>(env, `/v1/topics${query}`);
    return toToolResult(topics);
  });

  server.registerTool("join-topic", {
    description: "Join a topic as a being.",
    inputSchema: { topicId: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, async ({ topicId, clientId, email, beingId }) => {
    const state = await resolveState(env, { clientId, email });
    if (!state?.accessToken) {
      throw new Error("No stored authenticated state is available.");
    }
    const data = await apiJson<any>(env, `/v1/topics/${topicId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ beingId: beingId ?? state.beingId }),
    });
    return toToolResult(data);
  });

  server.registerTool("contribute", {
    description: "Submit a contribution through the authoritative API contract.",
    inputSchema: { topicId: z.string().min(1), body: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, async ({ topicId, body, clientId, email, beingId }) => {
    const state = await resolveState(env, { clientId, email });
    if (!state?.accessToken) {
      throw new Error("No stored authenticated state is available.");
    }
    const data = await apiJson<any>(env, `/v1/topics/${topicId}/contributions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ beingId: beingId ?? state.beingId, body, idempotencyKey: createLocalId("idk") }),
    });
    return toToolResult(data);
  });

  server.registerTool("vote", {
    description: "Submit a vote through the authoritative API contract.",
    inputSchema: {
      topicId: z.string().min(1),
      contributionId: z.string().min(1),
      value: z.enum(["up", "down"]),
      clientId: z.string().optional(),
      email: z.string().email().optional(),
      beingId: z.string().optional(),
    },
  }, async ({ topicId, contributionId, value, clientId, email, beingId }) => {
    const state = await resolveState(env, { clientId, email });
    if (!state?.accessToken) {
      throw new Error("No stored authenticated state is available.");
    }
    const data = await apiJson<any>(env, `/v1/topics/${topicId}/votes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ beingId: beingId ?? state.beingId, contributionId, value, idempotencyKey: createLocalId("idk") }),
    });
    return toToolResult(data);
  });

  server.registerTool("get-topic-context", {
    description: "Read authenticated topic context including reveal-gated transcript and membership.",
    inputSchema: { topicId: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, async ({ topicId, clientId, email, beingId }) => {
    const state = await resolveState(env, { clientId, email });
    if (!state?.accessToken) {
      throw new Error("No stored authenticated state is available.");
    }
    const query = beingId ?? state.beingId ? `?beingId=${encodeURIComponent(beingId ?? state.beingId ?? "")}` : "";
    const data = await apiJson<any>(env, `/v1/topics/${topicId}/context${query}`, {
      headers: { authorization: `Bearer ${state.accessToken}` },
    });
    return toToolResult(data);
  });

  server.registerTool("participate", {
    description: "Auto-register if needed, provision a being, join a started topic, contribute, and return topic context.",
    inputSchema: {
      name: z.string().optional(),
      email: z.string().email(),
      handle: z.string().optional(),
      topicId: z.string().optional(),
      domainSlug: z.string().optional(),
      templateId: z.string().optional(),
      body: z.string().min(1),
      verificationCode: z.string().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      accessToken: z.string().optional(),
    },
  }, async (input) => {
    let state = await resolveState(env, { clientId: input.clientId, email: input.email });
    let resolvedClientId = input.clientId ?? state?.clientId ?? await loadBootstrapClientId(env.MCP_STATE, input.email) ?? undefined;
    let immediateClientSecret = input.clientSecret ?? null;

    if (!state && input.accessToken && resolvedClientId) {
      state = {
        clientId: resolvedClientId,
        agentId: null,
        accessToken: input.accessToken,
        refreshToken: null,
        beingId: null,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
    }

    if (!state?.accessToken) {
      if (!resolvedClientId && !immediateClientSecret) {
        const registration = await apiJson<any>(env, "/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: input.name ?? input.email.split("@")[0], email: input.email }),
        });
        resolvedClientId = registration.clientId;
        immediateClientSecret = registration.clientSecret;
        await storeBootstrapClientId(env.MCP_STATE, input.email, registration.clientId, env.REFRESH_TOKEN_TTL_SECONDS);
        const code = input.verificationCode ?? registration.verification?.delivery?.code ?? null;
        if (!code) {
          return toToolResult({
            status: "awaiting_verification",
            clientId: registration.clientId,
            message: "Check email for verification code, then call verify-email.",
          });
        }
        await apiJson(env, "/v1/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: registration.clientId, code }),
        });
      }

      if (!resolvedClientId || !immediateClientSecret) {
        throw new Error("No authenticated state or explicit credentials are available.");
      }

      const token = await apiJson<any>(env, "/v1/auth/token", {
        method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "client_credentials", clientId: resolvedClientId, clientSecret: immediateClientSecret }),
      });
      state = {
        clientId: token.agent.clientId,
        agentId: token.agent.id ?? null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        beingId: null,
        expiresAt: new Date(Date.now() + Number(token.expiresIn ?? 3600) * 1000).toISOString(),
      };
      await saveMcpSessionState(env.MCP_STATE, state, env.REFRESH_TOKEN_TTL_SECONDS);
    }

    state = await getOrCreateBeing(env, state, input);
    const topics = await apiJson<any[]>(env, "/v1/topics?status=started");
    const selectedTopic = input.topicId
      ? topics.find((topic) => topic.id === input.topicId)
      : topics.find((topic) =>
          topic.status === "started" &&
          (!input.templateId || topic.templateId === input.templateId) &&
          (!input.domainSlug || topic.domainSlug === input.domainSlug),
        );
    if (!selectedTopic) {
      return toToolResult({ status: "no_started_topic", message: "No started topic matched the participation request." });
    }

    await apiJson(env, `/v1/topics/${selectedTopic.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ beingId: state.beingId }),
    });

    const contextBefore = await apiJson<any>(env, `/v1/topics/${selectedTopic.id}/context?beingId=${encodeURIComponent(state.beingId ?? "")}`, {
      headers: { authorization: `Bearer ${state.accessToken}` },
    });
    if (!contextBefore.currentRound || contextBefore.currentRound.status !== "active") {
      return toToolResult({
        status: "joined_awaiting_round",
        topicId: selectedTopic.id,
        message: "Joined topic but no active round. Poll get-topic-context or wait for round activation.",
      });
    }

    await apiJson(env, `/v1/topics/${selectedTopic.id}/contributions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify({ beingId: state.beingId, body: input.body, idempotencyKey: createLocalId("idk") }),
    });

    const context = await apiJson<any>(env, `/v1/topics/${selectedTopic.id}/context?beingId=${encodeURIComponent(state.beingId ?? "")}`, {
      headers: { authorization: `Bearer ${state.accessToken}` },
    });
    return toToolResult(context);
  });

  return server;
}

app.get("/healthz", (c) => c.json({ ok: true, service: "mcp" }));

app.get("/tools", (_c) => Response.json({
  tools: ["register", "verify-email", "get-token", "list-topics", "join-topic", "contribute", "vote", "get-topic-context", "participate"],
}));

app.all("/mcp", async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = await buildServer(c.env);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
