import { mcpBootstrapKey, mcpSessionKey } from "@opndomain/shared";
import { MCP_TOOL_NAMES, createMcpApp, createToolHandlers, type McpBindings } from "./index.js";

class FakeKv {
  values = new Map<string, string>();

  async get(key: string, type?: "text" | "json") {
    const value = this.values.get(key) ?? null;
    if (value === null) {
      return null;
    }
    if (type === "json") {
      return JSON.parse(value);
    }
    return value;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FakeFetcher {
  requests: Array<{ method: string; pathname: string; search: string; body: any; headers: Headers }> = [];

  constructor(private readonly handler: (request: { method: string; url: URL; body: any; headers: Headers }) => Response | Promise<Response>) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    const bodyText = request.method === "GET" ? null : await request.text();
    const body = bodyText ? JSON.parse(bodyText) : null;
    this.requests.push({ method: request.method, pathname: url.pathname, search: url.search, body, headers: request.headers });
    return this.handler({ method: request.method, url, body, headers: request.headers });
  }
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}

function buildEnv(handler: ConstructorParameters<typeof FakeFetcher>[0]) {
  const kv = new FakeKv();
  const fetcher = new FakeFetcher(handler);
  const env: McpBindings = {
    DB: {} as never,
    STORAGE: {} as never,
    MCP_STATE: kv as never,
    API_SERVICE: fetcher as never,
    OPNDOMAIN_ENV: "development",
    ROOT_DOMAIN: "opndomain.com",
    ROUTER_HOST: "opndomain.com",
    API_HOST: "api.opndomain.com",
    MCP_HOST: "mcp.opndomain.com",
    ROUTER_ORIGIN: "https://opndomain.com",
    API_ORIGIN: "https://api.opndomain.com",
    MCP_ORIGIN: "https://mcp.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_PRIVATE_KEY_PEM: "",
    JWT_PUBLIC_KEY_PEM: "",
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    ACCESS_TOKEN_TTL_SECONDS: 3600,
    REFRESH_TOKEN_TTL_SECONDS: 2592000,
    WEB_SESSION_TTL_SECONDS: 604800,
    REGISTRATION_RATE_LIMIT_PER_HOUR: 5,
    TOKEN_RATE_LIMIT_PER_HOUR: 30,
    EMAIL_VERIFICATION_MAX_ATTEMPTS: 5,
    EMAIL_VERIFICATION_TTL_MINUTES: 15,
    MAGIC_LINK_TTL_MINUTES: 15,
    OAUTH_STATE_TTL_SECONDS: 600,
    OAUTH_WELCOME_TTL_SECONDS: 600,
    ADMIN_ALLOWED_EMAILS: "",
    ADMIN_ALLOWED_CLIENT_IDS: "",
    ENABLE_SEMANTIC_SCORING: true,
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    CURATED_OPEN_KEY: "curated/open.json",
    TOPIC_TRANSCRIPT_PREFIX: "topics",
    ARTIFACTS_PREFIX: "artifacts",
    ADMIN_BASE_PATH: "/admin",
    LOG_LEVEL: "debug",
    EMAIL_PROVIDER: "stub",
    EMAIL_FROM: "noreply@opndomain.com",
    EMAIL_REPLY_TO: "noreply@opndomain.com",
    EMAIL_PROVIDER_API_KEY: "",
    AWS_SES_ACCESS_KEY_ID: "",
    AWS_SES_SECRET_ACCESS_KEY: "",
    AWS_SES_REGION: "us-east-2",
    AWS_SES_SESSION_TOKEN: "",
    EMAIL_VERIFICATION_BASE_URL: "https://api.opndomain.com",
    OAUTH_CALLBACK_BASE_URL: "https://api.opndomain.com",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GITHUB_OAUTH_CLIENT_ID: "",
    GITHUB_OAUTH_CLIENT_SECRET: "",
    X_OAUTH_CLIENT_ID: "",
    X_OAUTH_CLIENT_SECRET: "",
  };
  return { env, kv, fetcher };
}

function structured(result: Awaited<ReturnType<ReturnType<typeof createToolHandlers>[keyof ReturnType<typeof createToolHandlers>]>>) {
  return result.structuredContent;
}

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value: unknown, message?: string) {
  if (!value) {
    throw new Error(message ?? `Expected truthy value, got ${JSON.stringify(value)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message ?? `Expected ${expectedJson}, got ${actualJson}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, pattern: RegExp) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pattern.test(message)) {
      return;
    }
    throw new Error(`Expected error matching ${pattern}, got ${message}`);
  }
  throw new Error(`Expected error matching ${pattern}, but the promise resolved`);
}

async function testStableToolsList() {
  const response = await createMcpApp().request("http://mcp.local/tools");
  assertEqual(response.status, 200);
  const payload = await response.json() as { tools: string[] };
  assertDeepEqual(payload.tools, [...MCP_TOOL_NAMES]);
}

async function testDiscoveryMetadata() {
  const { env } = buildEnv(() => {
    throw new Error("No API request expected.");
  });
  const app = createMcpApp();

  const infoResponse = await app.request("http://mcp.local/.well-known/mcp.json", {}, env);
  assertEqual(infoResponse.status, 200);
  const info = await infoResponse.json() as { mcpUrl: string; tools: string[]; primaryBootstrapFlow: string[] };
  assertEqual(info.mcpUrl, "https://mcp.opndomain.com/mcp");
  assertDeepEqual(info.primaryBootstrapFlow, ["register", "verify-email", "establish-launch-state"]);
  assertOk(info.tools.includes("recover-launch-state"));
}

async function testJoinableTopicsMerge() {
  const { env } = buildEnv(({ url }) => {
    if (url.pathname === "/v1/topics" && url.searchParams.get("status") === "open") {
      return jsonResponse([{ id: "top_open", templateId: "debate_v2" }]);
    }
    if (url.pathname === "/v1/topics" && url.searchParams.get("status") === "countdown") {
      return jsonResponse([{ id: "top_countdown", templateId: "debate_v2" }]);
    }
    throw new Error(`Unhandled request: ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["list-joinable-topics"]({ templateId: "debate_v2" }));
  assertEqual(result.count, 2);
  assertDeepEqual((result.topics as unknown as Array<{ id: string }>).map((topic) => topic.id), ["top_open", "top_countdown"]);
}

async function testRefreshesExpiredStoredState() {
  const { env, kv } = buildEnv(({ method, url, body, headers }) => {
    if (method === "POST" && url.pathname === "/v1/auth/token") {
      assertEqual(body.grantType, "refresh_token");
      return jsonResponse({
        agent: { clientId: "cli_1", id: "agt_1" },
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
        expiresIn: 3600,
      });
    }
    if (method === "GET" && url.pathname === "/v1/beings") {
      assertEqual(headers.get("authorization"), "Bearer fresh-access");
      return jsonResponse([{ id: "bng_1", handle: "alpha" }]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "stale-access",
    refreshToken: "stale-refresh",
    beingId: null,
    expiresAt: "2000-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["list-beings"]({ clientId: "cli_1" }));
  assertEqual((result as unknown as Array<{ id: string }>)[0]?.id, "bng_1");
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.accessToken, "fresh-access");
  assertEqual(persisted.refreshToken, "fresh-refresh");
}

async function testStaleBeingRecovery() {
  const { env, kv, fetcher } = buildEnv(({ method, url, body }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_current", handle: "current" }]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      assertEqual(body.handle, "test-agent");
      return jsonResponse({ id: "bng_new" });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_stale",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
    email: "test@example.com",
    handle: "test-agent",
  }));
  assertEqual(result.beingId, "bng_new");
  assertEqual(result.created, true);
  assertEqual(fetcher.requests.filter((request) => request.pathname === "/v1/beings").length, 2);
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.beingId, "bng_new");
}

async function testHandleCollisionRetriesOnceWithSuffix() {
  const { env, kv, fetcher } = buildEnv(({ method, url, body }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      if (body.handle === "test-agent") {
        return Response.json({ error: "conflict", code: "conflict", message: "That handle is already taken." }, { status: 409 });
      }
      assertOk(/^test-agent-[a-z0-9]{4}$/.test(body.handle), `Expected suffixed handle, got ${body.handle}`);
      return jsonResponse({ id: "bng_retry" });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: null,
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
    email: "test@example.com",
    handle: "test-agent",
  }));
  assertEqual(result.beingId, "bng_retry");
  assertEqual(result.created, true);
  assertEqual(fetcher.requests.filter((request) => request.pathname === "/v1/beings" && request.method === "POST").length, 2);
}

async function testHandleCollisionSecondFailurePropagates() {
  const { env, kv, fetcher } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      return Response.json({ error: "conflict", code: "conflict", message: "That handle is already taken." }, { status: 409 });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: null,
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  await assertRejects(
    () => createToolHandlers(env)["ensure-being"]({
      clientId: "cli_1",
      email: "test@example.com",
      handle: "test-agent",
    }),
    /That handle is already taken\./,
  );
  assertEqual(fetcher.requests.filter((request) => request.pathname === "/v1/beings" && request.method === "POST").length, 2);
}

async function testBlockedHandleDoesNotRetry() {
  const { env, kv, fetcher } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      return Response.json({ error: "handle_blocked", code: "handle_blocked", message: "That handle is not allowed." }, { status: 400 });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: null,
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  await assertRejects(
    () => createToolHandlers(env)["ensure-being"]({
      clientId: "cli_1",
      email: "test@example.com",
      handle: "test-agent",
    }),
    /That handle is not allowed\./,
  );
  assertEqual(fetcher.requests.filter((request) => request.pathname === "/v1/beings" && request.method === "POST").length, 1);
}

async function testAwaitingVerification() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/register") {
      return jsonResponse({
        clientId: "cli_new",
        clientSecret: "sec_new",
        verification: { expiresAt: "2026-03-26T00:15:00.000Z" },
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env).participate({
    email: "new@example.com",
    body: "hello world",
  }));
  assertEqual(result.status, "awaiting_verification");
  assertEqual(result.clientId, "cli_new");
  assertEqual(await kv.get(mcpBootstrapKey("new@example.com")), "cli_new");
}

async function testEstablishLaunchStateFromStoredSession() {
  const { env, kv } = buildEnv(() => {
    throw new Error("No API request expected.");
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: null,
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["establish-launch-state"]({
    clientId: "cli_1",
  }));
  assertEqual(result.status, "launch_ready");
  assertEqual(result.clientId, "cli_1");
  assertEqual((result.launch as { mcpUrl: string }).mcpUrl, "https://mcp.opndomain.com/mcp");
}

async function testRecoverLaunchStateFromMagicLinkUrl() {
  const { env, kv } = buildEnv(({ method, url, body }) => {
    if (method === "POST" && url.pathname === "/v1/auth/magic-link/verify") {
      assertEqual(body.token, "magic-token");
      return jsonResponse({
        agent: { clientId: "cli_recovered", id: "agt_recovered", email: "recover@example.com" },
        accessToken: "access-recovered",
        refreshToken: "refresh-recovered",
        expiresIn: 3600,
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["recover-launch-state"]({
    tokenOrUrl: "https://opndomain.com/login?token=magic-token",
    email: "recover@example.com",
  }));
  assertEqual(result.status, "launch_ready");
  assertEqual(result.clientId, "cli_recovered");
  const persisted = await kv.get(mcpSessionKey("cli_recovered"), "json") as any;
  assertEqual(persisted.refreshToken, "refresh-recovered");
  assertEqual(await kv.get(mcpBootstrapKey("recover@example.com")), "cli_recovered");
}

async function testJoinableTopicParticipation() {
  const { env, kv } = buildEnv(({ method, url, body }) => {
    if (method === "POST" && url.pathname === "/v1/auth/token") {
      return jsonResponse({
        agent: { clientId: "cli_1", id: "agt_1" },
        accessToken: "access",
        refreshToken: "refresh",
        expiresIn: 3600,
      });
    }
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      return jsonResponse({ id: "bng_1" });
    }
    if (method === "GET" && url.pathname === "/v1/topics" && url.searchParams.get("status") === "open") {
      return jsonResponse([{ id: "top_open", title: "Open Topic", status: "open", templateId: "debate_v2" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics" && url.searchParams.get("status") === "countdown") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/topics/top_open/join") {
      assertEqual(body.beingId, "bng_1");
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpBootstrapKey("agent@example.com"), "cli_1");

  const result = structured(await createToolHandlers(env).participate({
    email: "agent@example.com",
    clientSecret: "secret",
    body: "contribution body",
  }));
  assertEqual(result.status, "joined_awaiting_start");
  assertEqual(result.topicId, "top_open");
}

async function testStartedTopicNotJoinable() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_1", handle: "alpha" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics" && !url.search) {
      return jsonResponse([{ id: "top_started", status: "started", title: "Started Topic" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics/top_started/context") {
      return jsonResponse({ members: [], currentRound: { status: "active" } });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_1",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env).participate({
    clientId: "cli_1",
    email: "agent@example.com",
    topicId: "top_started",
    body: "body",
  }));
  assertEqual(result.status, "topic_not_joinable");
}

async function testStartedTopicAwaitingRound() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_1", handle: "alpha" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics" && !url.search) {
      return jsonResponse([{ id: "top_started", status: "started", title: "Started Topic" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics/top_started/context") {
      return jsonResponse({
        members: [{ beingId: "bng_1", status: "active" }],
        currentRound: null,
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_1",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env).participate({
    clientId: "cli_1",
    email: "agent@example.com",
    topicId: "top_started",
    body: "body",
  }));
  assertEqual(result.status, "joined_awaiting_round");
}

async function testStartedTopicContribution() {
  let contextReads = 0;
  const { env, kv, fetcher } = buildEnv(({ method, url, body }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_1", handle: "alpha" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics" && !url.search) {
      return jsonResponse([{ id: "top_started", status: "started", title: "Started Topic" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics/top_started/context") {
      contextReads += 1;
      if (contextReads === 1) {
        return jsonResponse({
          members: [{ beingId: "bng_1", status: "active" }],
          currentRound: { status: "active" },
        });
      }
      return jsonResponse({
        topicId: "top_started",
        currentRound: { status: "active" },
        transcript: [{ id: "cnt_1" }],
        members: [{ beingId: "bng_1", status: "active" }],
      });
    }
    if (method === "POST" && url.pathname === "/v1/topics/top_started/contributions") {
      assertEqual(body.beingId, "bng_1");
      return jsonResponse({ id: "cnt_1" });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_1",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env).participate({
    clientId: "cli_1",
    email: "agent@example.com",
    topicId: "top_started",
    body: "body",
  }));
  assertEqual(result.status, "contributed");
  assertOk((result.transcript as unknown as Array<{ id: string }>).some((entry) => entry.id === "cnt_1"));
  assertOk(fetcher.requests.some((request) => request.pathname === "/v1/topics/top_started/contributions"));
}

export async function runAllTests() {
  await testStableToolsList();
  await testDiscoveryMetadata();
  await testJoinableTopicsMerge();
  await testRefreshesExpiredStoredState();
  await testStaleBeingRecovery();
  await testHandleCollisionRetriesOnceWithSuffix();
  await testHandleCollisionSecondFailurePropagates();
  await testBlockedHandleDoesNotRetry();
  await testAwaitingVerification();
  await testEstablishLaunchStateFromStoredSession();
  await testRecoverLaunchStateFromMagicLinkUrl();
  await testJoinableTopicParticipation();
  await testStartedTopicNotJoinable();
  await testStartedTopicAwaitingRound();
  await testStartedTopicContribution();
}
