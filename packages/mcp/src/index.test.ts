import { mcpBootstrapKey, mcpSessionKey } from "@opndomain/shared";
import { MCP_PUBLIC_TOOL_NAMES, MCP_TOOL_NAMES, createMcpApp, createToolHandlers, type McpBindings } from "./index.js";

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
    ENABLE_EPISTEMIC_SCORING: false,
    ENABLE_ADAPTIVE_SCORING: false,
    ENABLE_TRANSCRIPT_DELTAS: false,
    ENABLE_ELASTIC_ROUNDS: false,
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
  assertDeepEqual(payload.tools, [...MCP_PUBLIC_TOOL_NAMES]);
}

async function testDiscoveryMetadata() {
  const { env } = buildEnv(() => {
    throw new Error("No API request expected.");
  });
  const app = createMcpApp();

  const infoResponse = await app.request("http://mcp.local/.well-known/mcp.json", {}, env);
  assertEqual(infoResponse.status, 200);
  const info = await infoResponse.json() as {
    mcpUrl: string;
    tools: string[];
    onboardOptions: string[];
    actOptions: string[];
    readOptions: string[];
    participateStatuses: string[];
    credentialModel: {
      clientId: string;
      agentId: string;
      note: string;
    };
  };
  assertEqual(info.mcpUrl, "https://mcp.opndomain.com/mcp");
  assertDeepEqual(info.onboardOptions, ["continue-as-guest", "register", "initiate-oauth"]);
  assertDeepEqual(info.actOptions, ["list-joinable-topics", "create-topic", "participate", "debate-step"]);
  assertDeepEqual(info.readOptions, ["get-topic-context", "get-verdict"]);
  assertEqual(info.tools.length, 17);
  assertOk(info.tools.includes("participate"));
  assertOk(info.tools.includes("debate-step"));
  assertOk(!info.tools.includes("recover-launch-state"));
  assertOk(info.participateStatuses.includes("awaiting_magic_link"));
  assertOk(info.participateStatuses.includes("contributed"));
  assertOk(info.participateStatuses.includes("vote_required"));
  assertOk(info.participateStatuses.includes("body_required"));
  assertOk(info.credentialModel.clientId.toLowerCase().includes("operator account identifier"));
  assertOk(info.credentialModel.agentId.toLowerCase().includes("specific agent record"));
  assertOk(info.credentialModel.note.toLowerCase().includes("multiple agents"));
}

async function testHomepageHighlightsParticipate() {
  const { env } = buildEnv(() => {
    throw new Error("No API request expected.");
  });
  const app = createMcpApp();

  const response = await app.request("http://mcp.local/", {}, env);
  assertEqual(response.status, 200);
  const body = await response.text();
  assertOk(body.includes("<strong>Credential model:</strong>"));
  assertOk(body.includes("clientId</code> is the operator account identifier"));
  assertOk(body.includes("agentId</code> is the specific agent record"));
  assertOk(body.includes("Recommended entry point"));
  assertOk(body.includes("onboarding and first-contribution tool"));
  assertOk(body.includes("round-by-round walkthrough reducer"));
  assertOk(body.includes("Canonical transport URL:"));
  assertOk(body.includes("Participate statuses: <code>"));
  assertOk(body.includes("vote_required"));
  assertOk(body.includes("Onboard:"));
  assertOk(body.includes("continue-as-guest"));
}

async function testJoinableTopicsMerge() {
  const { env } = buildEnv(({ url }) => {
    if (url.pathname === "/v1/topics" && url.searchParams.get("status") === "open") {
      assertEqual(url.searchParams.get("topicFormat"), "scheduled_research");
      return jsonResponse([{ id: "top_open", templateId: "debate", topicFormat: "scheduled_research" }]);
    }
    if (url.pathname === "/v1/topics" && url.searchParams.get("status") === "countdown") {
      assertEqual(url.searchParams.get("topicFormat"), "scheduled_research");
      return jsonResponse([{ id: "top_countdown", templateId: "debate", topicFormat: "scheduled_research" }]);
    }
    throw new Error(`Unhandled request: ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["list-joinable-topics"]({
    templateId: "debate",
    topicFormat: "scheduled_research",
  }));
  assertEqual(result.count, 2);
  assertDeepEqual((result.topics as unknown as Array<{ id: string }>).map((topic) => topic.id), ["top_open", "top_countdown"]);
}

async function testCreateTopicHardcodesDebateTemplate() {
  const { env, kv, fetcher } = buildEnv(({ method, url, body, headers }) => {
    if (method === "POST" && url.pathname === "/v1/topics") {
      assertEqual(headers.get("authorization"), "Bearer access");
      assertEqual(body.templateId, "debate");
      assertEqual(body.minTrustTier, undefined);
      return jsonResponse({
        id: "top_new",
        domainId: "dom_1",
        title: "New Topic",
        prompt: "Debate this.",
        templateId: "debate",
        topicFormat: "scheduled_research",
      }, 201);
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

  const result = structured(await createToolHandlers(env)["create-topic"]({
    clientId: "cli_1",
    domainId: "dom_1",
    title: "New Topic",
    prompt: "Debate this.",
    topicFormat: "scheduled_research",
    cadenceOverrideMinutes: 60,
  }));
  assertEqual(result.templateId, "debate");
  assertOk(fetcher.requests.some((request) => request.method === "POST" && request.pathname === "/v1/topics"));
}

async function testCreateTopicSurfacesCreationGateErrors() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/topics") {
      return Response.json({
        code: "forbidden",
        message: "Only verified-trust beings can open user-created topics.",
      }, { status: 403 });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  await assertRejects(
    () => createToolHandlers(env)["create-topic"]({
      clientId: "cli_1",
      domainId: "dom_1",
      title: "New Topic",
      prompt: "Debate this.",
      topicFormat: "scheduled_research",
    }),
    /verified-trust beings can open user-created topics/i,
  );
}

async function testListTopicsWrapsArrayResults() {
  const { env } = buildEnv(({ url }) => {
    if (url.pathname === "/v1/topics") {
      assertEqual(url.searchParams.get("status"), "started");
      assertEqual(url.searchParams.get("domain"), "ai-safety");
      return jsonResponse([{ id: "top_started" }]);
    }
    throw new Error(`Unhandled request: ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["list-topics"]({
    status: "started",
    domain: "ai-safety",
  }));
  assertEqual(result.count, 1);
  assertEqual((result.data as Array<{ id: string }>)[0]?.id, "top_started");
}

async function testGetVerdictReadsPublicEndpoint() {
  const { env } = buildEnv(({ method, url, headers }) => {
    if (method === "GET" && url.pathname === "/v1/topics/top_1/verdict") {
      assertEqual(headers.get("authorization"), null);
      return jsonResponse({ status: "published", verdict: { topicId: "top_1" } });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["get-verdict"]({ topicId: "top_1" }));
  assertEqual(result.status, "published");
  assertEqual((result.verdict as { topicId: string }).topicId, "top_1");
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
  assertEqual(result.count, 1);
  assertEqual((result.data as Array<{ id: string }>)[0]?.id, "bng_1");
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

async function testAccountNotFoundBranch() {
  const { env } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/account-lookup") {
      return jsonResponse({
        status: "account_not_found",
        email: "new@example.com",
        nextActions: ["register", "continue_as_guest"],
        loginMethods: [],
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env).participate({
    email: "new@example.com",
    body: "hello world",
  }));
  assertEqual(result.status, "account_not_found");
  assertEqual((result.nextAction as { tool: string }).tool, "continue-as-guest");
}

async function testAwaitingVerificationBranch() {
  const { env } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/account-lookup") {
      return jsonResponse({
        status: "awaiting_verification",
        email: "new@example.com",
        nextActions: ["send_magic_link"],
        accountClass: "unverified_participant",
        emailVerified: false,
        loginMethods: ["magic_link"],
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env).participate({
    email: "new@example.com",
    body: "hello world",
  }));
  assertEqual(result.status, "awaiting_verification");
  assertEqual((result.nextAction as { tool: string }).tool, "initiate-oauth");
}

async function testLoginRequiredBranch() {
  const { env } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/account-lookup") {
      return jsonResponse({
        status: "login_required",
        email: "agent@example.com",
        nextActions: ["send_magic_link"],
        accountClass: "verified_participant",
        emailVerified: true,
        loginMethods: ["magic_link", "oauth"],
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env).participate({
    email: "agent@example.com",
    body: "hello world",
  }));
  assertEqual(result.status, "login_required");
  assertEqual((result.nextAction as { tool: string }).tool, "initiate-oauth");
}

async function testContinueAsGuest() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/guest") {
      return jsonResponse({
        tokenType: "Bearer",
        agent: {
          id: "agt_guest",
          clientId: "cli_guest",
          email: null,
          emailVerified: false,
          isGuest: true,
          trustTier: "unverified",
          accountClass: "guest_participant",
          isAdmin: false,
          effectiveAccountClass: "guest_participant",
          status: "active",
        },
        being: {
          id: "bng_guest",
          handle: "guest-alpha",
          displayName: "Guest Alpha",
          trustTier: "unverified",
          status: "active",
        },
        accessToken: "access-guest",
        refreshToken: "refresh-guest",
        expiresIn: 3600,
        sessionId: "ses_guest",
      }, 201);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["continue-as-guest"]({}));
  assertEqual(result.status, "guest_ready");
  assertEqual(result.beingId, "bng_guest");
  const persisted = await kv.get(mcpSessionKey("cli_guest"), "json") as any;
  assertEqual(persisted.isGuest, true);
}

async function testRecoveryMagicLinkParticipationPath() {
  const { env } = buildEnv(({ method, url }) => {
    if (method === "POST" && url.pathname === "/v1/auth/magic-link") {
      return jsonResponse({
        agent: {
          id: "agt_1",
          clientId: "cli_1",
          email: "recover@example.com",
        },
        expiresAt: "2026-03-26T00:15:00.000Z",
        delivery: {
          provider: "stub",
          to: "recover@example.com",
          loginUrl: "https://opndomain.com/login?token=magic-token",
        },
      });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });

  const result = structured(await createToolHandlers(env)["request-magic-link"]({
    email: "recover@example.com",
  }));
  assertEqual(result.status, "awaiting_magic_link");
  assertEqual((result.delivery as { loginUrl: string }).loginUrl, "https://opndomain.com/login?token=magic-token");
  assertEqual((result.nextAction as { tool: string }).tool, "recover-launch-state");
}

async function testRefreshTokenParticipationPath() {
  const { env } = buildEnv(({ method, url, body }) => {
    if (method === "POST" && url.pathname === "/v1/auth/token") {
      assertEqual(body.grantType, "refresh_token");
      assertEqual(body.refreshToken, "refresh-token");
      return jsonResponse({
        tokenType: "Bearer",
        agent: { clientId: "cli_1", id: "agt_1" },
        accessToken: "access",
        refreshToken: "refresh-rotated",
        expiresIn: 3600,
        sessionId: "ses_1",
      });
    }
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      return jsonResponse({ id: "bng_1" });
    }
    if (method === "GET" && url.pathname === "/v1/topics" && url.searchParams.get("status") === "open") {
      return jsonResponse([{ id: "top_open", title: "Open Topic", status: "open" }]);
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

  const result = structured(await createToolHandlers(env).participate({
    email: "refresh@example.com",
    refreshToken: "refresh-token",
    body: "body",
  }));
  assertEqual(result.status, "joined_awaiting_start");
  assertEqual(result.clientId, "cli_1");
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
      return jsonResponse([{ id: "top_open", title: "Open Topic", status: "open", templateId: "debate" }]);
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
    topicFormat: "scheduled_research",
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
  assertOk(Boolean(result.nextAction));
  assertEqual((result.nextAction as { tool?: string }).tool, "debate-step");
  assertOk((result.transcript as unknown as Array<{ id: string }>).some((entry) => entry.id === "cnt_1"));
  assertOk(fetcher.requests.some((request) => request.pathname === "/v1/topics/top_started/contributions"));
}

async function testExplicitHandleResolvesExistingOwnedBeing() {
  const { env, kv, fetcher } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([
        { id: "bng_alpha", handle: "agent-alpha" },
        { id: "bng_beta", handle: "agent-beta" },
      ]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_alpha",
    beingHandle: "agent-alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
    handle: "agent-beta",
  }));
  assertEqual(result.beingId, "bng_beta");
  // created=true because beingId changed (from bng_alpha to bng_beta), even though no new being was created via API
  assertEqual(result.created, true);
  // Session state should be rebound to agent-beta
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.beingId, "bng_beta");
  assertEqual(persisted.beingHandle, "agent-beta");
  // No POST to /v1/beings â€” resolved from existing owned beings
  assertEqual(fetcher.requests.filter((r) => r.method === "POST" && r.pathname === "/v1/beings").length, 0);
}

async function testExplicitHandleCreatesWhenNotOwned() {
  const { env, kv, fetcher } = buildEnv(({ method, url, body }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_alpha", handle: "agent-alpha" }]);
    }
    if (method === "POST" && url.pathname === "/v1/beings") {
      assertEqual(body.handle, "agent-new");
      return jsonResponse({ id: "bng_new", handle: "agent-new" });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_alpha",
    beingHandle: "agent-alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
    handle: "agent-new",
  }));
  assertEqual(result.beingId, "bng_new");
  assertEqual(result.created, true);
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.beingId, "bng_new");
  assertEqual(persisted.beingHandle, "agent-new");
}

async function testHandleResolutionInReadOnlyToolRejectsUnknownHandle() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_alpha", handle: "agent-alpha" }]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  // get-topic-context with unknown handle should fail (read-only tools don't create)
  await assertRejects(
    () => createToolHandlers(env)["get-topic-context"]({
      topicId: "top_1",
      clientId: "cli_1",
      handle: "nonexistent",
    }),
    /No owned being found with handle "nonexistent"/,
  );
}

async function testHandleResolutionRebindsMcpSession() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([
        { id: "bng_alpha", handle: "agent-alpha" },
        { id: "bng_beta", handle: "agent-beta" },
      ]);
    }
    if (method === "GET" && url.pathname === "/v1/topics/top_1/context") {
      return jsonResponse({ topicId: "top_1", currentRound: null });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_alpha",
    beingHandle: "agent-alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  // Explicitly switch to agent-beta via handle in get-topic-context
  const result = structured(await createToolHandlers(env)["get-topic-context"]({
    topicId: "top_1",
    clientId: "cli_1",
    handle: "agent-beta",
  }));
  assertEqual(result.topicId, "top_1");
  // MCP session should now be rebound to agent-beta
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.beingId, "bng_beta");
  assertEqual(persisted.beingHandle, "agent-beta");
}

async function testNoExplicitHandleReusesStateBeing() {
  const { env, kv, fetcher } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_alpha", handle: "agent-alpha" }]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_alpha",
    beingHandle: "agent-alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  // No explicit handle: should reuse state.beingId without creating
  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
  }));
  assertEqual(result.beingId, "bng_alpha");
  assertEqual(result.created, false);
  // No POST to /v1/beings
  assertEqual(fetcher.requests.filter((r) => r.method === "POST" && r.pathname === "/v1/beings").length, 0);
}

async function testBeingHandleBackfilledOnExistingState() {
  const { env, kv } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_1", handle: "existing-handle" }]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  // State without beingHandle (legacy)
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_1",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env)["ensure-being"]({
    clientId: "cli_1",
  }));
  assertEqual(result.beingId, "bng_1");
  assertEqual(result.created, false);
  // beingHandle should be backfilled
  const persisted = await kv.get(mcpSessionKey("cli_1"), "json") as any;
  assertEqual(persisted.beingHandle, "existing-handle");
}

async function testParticipateBodyRequired() {
  const { env, kv, fetcher } = buildEnv(({ method, url }) => {
    if (method === "GET" && url.pathname === "/v1/topics" && !url.search) {
      return jsonResponse([{ id: "top_started", status: "started", title: "Started Topic" }]);
    }
    if (method === "GET" && url.pathname === "/v1/topics/top_started/context") {
      return jsonResponse({
        members: [{ beingId: "bng_1", status: "active" }],
        currentRound: { status: "active" },
      });
    }
    if (method === "GET" && url.pathname === "/v1/beings") {
      return jsonResponse([{ id: "bng_1", handle: "alpha" }]);
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}${url.search}`);
  });
  await kv.put(mcpSessionKey("cli_1"), JSON.stringify({
    clientId: "cli_1",
    agentId: "agt_1",
    accessToken: "access",
    refreshToken: "refresh",
    beingId: "bng_1",
    beingHandle: "alpha",
    expiresAt: "2999-01-01T00:00:00.000Z",
  }));

  const result = structured(await createToolHandlers(env).participate({
    clientId: "cli_1",
    topicId: "top_started",
  }));
  assertEqual(result.status, "body_required");
  // No POST to /contributions
  assertEqual(fetcher.requests.filter((r) => r.method === "POST" && r.pathname === "/v1/topics/top_started/contributions").length, 0);
}

// Note: tests below exercise handlers directly via createToolHandlers — this remains valid because
// non-public tools (lookup-account, ensure-being, list-topics, vote, etc.) still exist as internal
// handlers used by participate; only their MCP registration is gated by MCP_PUBLIC_TOOL_NAMES.
export async function runAllTests() {
  await testStableToolsList();
  await testDiscoveryMetadata();
  await testHomepageHighlightsParticipate();
  await testJoinableTopicsMerge();
  await testCreateTopicHardcodesDebateTemplate();
  await testCreateTopicSurfacesCreationGateErrors();
  await testListTopicsWrapsArrayResults();
  await testGetVerdictReadsPublicEndpoint();
  await testRefreshesExpiredStoredState();
  await testStaleBeingRecovery();
  await testHandleCollisionRetriesOnceWithSuffix();
  await testHandleCollisionSecondFailurePropagates();
  await testBlockedHandleDoesNotRetry();
  await testAccountNotFoundBranch();
  await testAwaitingVerificationBranch();
  await testLoginRequiredBranch();
  await testContinueAsGuest();
  await testEstablishLaunchStateFromStoredSession();
  await testRecoverLaunchStateFromMagicLinkUrl();
  await testRecoveryMagicLinkParticipationPath();
  await testRefreshTokenParticipationPath();
  await testJoinableTopicParticipation();
  await testStartedTopicNotJoinable();
  await testStartedTopicAwaitingRound();
  await testStartedTopicContribution();
  await testParticipateBodyRequired();
  await testExplicitHandleResolvesExistingOwnedBeing();
  await testExplicitHandleCreatesWhenNotOwned();
  await testHandleResolutionInReadOnlyToolRejectsUnknownHandle();
  await testHandleResolutionRebindsMcpSession();
  await testNoExplicitHandleReusesStateBeing();
  await testBeingHandleBackfilledOnExistingState();
}
