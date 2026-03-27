import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import {
  MagicLinkResponseSchema,
  MagicLinkVerifyResponseSchema,
  RegisterAgentResponseSchema,
  TokenResponseSchema,
  VerifyEmailResponseSchema,
} from "@opndomain/shared";
import { sha256 } from "../lib/crypto.js";
import { ApiError } from "../lib/errors.js";
import { signJwt } from "../lib/jwt.js";
import {
  authenticateRequest,
  createMagicLink,
  exchangeClientCredentials,
  logoutSession,
  registerAgent,
  verifyAgentEmail,
  verifyMagicLink,
} from "./auth.js";
import { beginOAuthAuthorize, completeOAuthCallback } from "./oauth.js";

class FakePreparedStatement {
  constructor(
    readonly sql: string,
    private readonly db: FakeDb,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new FakePreparedStatement(this.sql, this.db, bindings);
  }

  async first<T>() {
    return this.db.consumeFirst<T>(this.sql);
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql) };
  }

  async run() {
    this.db.executedRuns.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  readonly executedRuns: Array<{ sql: string; bindings: unknown[] }> = [];
  private readonly firstQueue = new Map<string, unknown[]>();
  private readonly allQueue = new Map<string, unknown[]>();

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, rows);
  }

  async batch(statements: FakePreparedStatement[]) {
    for (const statement of statements) {
      await statement.run();
    }
    return [];
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return [];
    }
    return entry[1] as T[];
  }
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

type TestEnv = {
  DB: D1Database;
  PUBLIC_CACHE: KVNamespace;
  SESSION_COOKIE_NAME: string;
  SESSION_COOKIE_DOMAIN: string;
  WEB_SESSION_TTL_SECONDS: number;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  TOKEN_RATE_LIMIT_PER_HOUR: number;
  MAGIC_LINK_TTL_MINUTES: number;
  OAUTH_STATE_TTL_SECONDS: number;
  OAUTH_WELCOME_TTL_SECONDS: number;
  JWT_AUDIENCE: string;
  JWT_ISSUER: string;
  JWT_PUBLIC_KEY_PEM: string;
  JWT_PRIVATE_KEY_PEM: string;
  API_ORIGIN: string;
  ROUTER_ORIGIN: string;
  OAUTH_CALLBACK_BASE_URL: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  X_OAUTH_CLIENT_ID: string;
  X_OAUTH_CLIENT_SECRET: string;
  EMAIL_PROVIDER: string;
  OPNDOMAIN_ENV: string;
  REGISTRATION_RATE_LIMIT_PER_HOUR: number;
  EMAIL_VERIFICATION_MAX_ATTEMPTS: number;
  EMAIL_VERIFICATION_TTL_MINUTES: number;
};

function buildEnv(db: FakeDb): TestEnv {
  return {
    DB: db as unknown as D1Database,
    PUBLIC_CACHE: {
      get: async () => null,
      getWithMetadata: async () => ({ value: null, metadata: null }),
      list: async () => ({ keys: [], list_complete: true, cursor: "" }),
      put: async () => undefined,
      delete: async () => undefined,
    } as unknown as KVNamespace,
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    WEB_SESSION_TTL_SECONDS: 60 * 60 * 24 * 7,
    ACCESS_TOKEN_TTL_SECONDS: 60 * 15,
    REFRESH_TOKEN_TTL_SECONDS: 60 * 60 * 24 * 30,
    TOKEN_RATE_LIMIT_PER_HOUR: 100,
    REGISTRATION_RATE_LIMIT_PER_HOUR: 20,
    EMAIL_VERIFICATION_MAX_ATTEMPTS: 5,
    EMAIL_VERIFICATION_TTL_MINUTES: 15,
    MAGIC_LINK_TTL_MINUTES: 15,
    OAUTH_STATE_TTL_SECONDS: 600,
    OAUTH_WELCOME_TTL_SECONDS: 600,
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_PUBLIC_KEY_PEM: publicKey,
    JWT_PRIVATE_KEY_PEM: privateKey,
    API_ORIGIN: "https://api.opndomain.com",
    ROUTER_ORIGIN: "https://opndomain.com",
    OAUTH_CALLBACK_BASE_URL: "https://api.opndomain.com",
    GOOGLE_OAUTH_CLIENT_ID: "google-client",
    GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
    GITHUB_OAUTH_CLIENT_ID: "github-client",
    GITHUB_OAUTH_CLIENT_SECRET: "github-secret",
    X_OAUTH_CLIENT_ID: "x-client",
    X_OAUTH_CLIENT_SECRET: "x-secret",
    EMAIL_PROVIDER: "stub",
    OPNDOMAIN_ENV: "development",
  };
}

function queueAgentLookup(db: FakeDb, agentId = "agt_1") {
  db.queueFirst("FROM agents", [
    {
      id: agentId,
      client_id: "cli_1",
      client_secret_hash: null,
      name: "Agent",
      email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z",
      trust_tier: "verified",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
}

async function expectUnauthorized(promise: Promise<unknown>) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "unauthorized",
  );
}

describe("authenticateRequest bearer hardening", () => {
  it("rejects bearer tokens whose backing session is expired", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const token = await signJwt(env as never, {
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      sub: "agt_1",
      scope: "access_token",
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
      jti: "atk_1",
      client_id: "cli_1",
      session_id: "ses_1",
      trust_tier: "verified",
    });

    db.queueFirst("FROM sessions", [
      {
        id: "ses_1",
        agent_id: "agt_1",
        scope: "web_session",
        refresh_token_hash: null,
        access_token_id: "atk_1",
        expires_at: "2026-03-24T00:00:00.000Z",
        revoked_at: null,
      },
    ]);

    await expectUnauthorized(
      authenticateRequest(
        env as never,
        new Request("https://api.opndomain.com/v1/session", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    );
  });

  it("rejects bearer tokens with a missing session_id claim", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const token = await signJwt(env as never, {
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      sub: "agt_1",
      scope: "access_token",
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
      jti: "atk_1",
      client_id: "cli_1",
      trust_tier: "verified",
    } as never);

    await expectUnauthorized(
      authenticateRequest(
        env as never,
        new Request("https://api.opndomain.com/v1/session", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    );
  });

  it("rejects bearer tokens with an empty session_id claim", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const token = await signJwt(env as never, {
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      sub: "agt_1",
      scope: "access_token",
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
      jti: "atk_1",
      client_id: "cli_1",
      session_id: "",
      trust_tier: "verified",
    });

    await expectUnauthorized(
      authenticateRequest(
        env as never,
        new Request("https://api.opndomain.com/v1/session", {
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    );
  });

  it("rejects a previously issued bearer token after logout revokes its session", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const clientSecret = "super-secret";

    db.queueFirst("FROM agents", [
      {
        id: "agt_1",
        client_id: "cli_1",
        client_secret_hash: await sha256(clientSecret),
        name: "Agent",
        email: "agent@example.com",
        email_verified_at: "2026-03-25T00:00:00.000Z",
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);

    const tokenSet = await exchangeClientCredentials(env as never, "127.0.0.1", {
      clientId: "cli_1",
      clientSecret,
    });
    const parsedTokenSet = TokenResponseSchema.parse({
      tokenType: "Bearer",
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      sessionId: tokenSet.sessionId,
      agent: tokenSet.agent,
    });
    assert.equal(parsedTokenSet.agent.clientId, "cli_1");

    await logoutSession(
      env as never,
      new Request("https://api.opndomain.com/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: tokenSet.cookie,
        },
      }),
    );

    db.queueFirst("FROM sessions", [
      {
        id: tokenSet.sessionId,
        agent_id: "agt_1",
        scope: "web_session",
        refresh_token_hash: null,
        access_token_id: "atk_revoked",
        expires_at: "3026-03-25T00:00:00.000Z",
        revoked_at: "2026-03-25T01:00:00.000Z",
      },
    ]);
    queueAgentLookup(db);

    await expectUnauthorized(
      authenticateRequest(
        env as never,
        new Request("https://api.opndomain.com/v1/session", {
          headers: {
            authorization: `Bearer ${tokenSet.accessToken}`,
          },
        }),
      ),
    );

    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO sessions")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE sessions")));
  });
});

describe("registration and email verification contracts", () => {
  it("returns the shared register contract with a verification code outside production", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    db.queueFirst("SELECT id FROM agents WHERE lower(email) = ?", [null]);
    db.queueFirst("FROM agents", [{
      id: "agt_1",
      client_id: "cli_1",
      client_secret_hash: "hash",
      name: "Agent",
      email: "agent@example.com",
      email_verified_at: null,
      trust_tier: "unverified",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const result = await registerAgent(env as never, "127.0.0.1", {
      name: "Agent",
      email: "Agent@Example.com",
    });

    const parsed = RegisterAgentResponseSchema.parse(result);
    assert.equal(parsed.agent.email, "agent@example.com");
    assert.equal(parsed.agent.trustTier, "unverified");
    assert.equal(parsed.agent.status, "active");
    assert.match(parsed.clientId, /^cli_/);
    assert.match(parsed.clientSecret, /^[a-f0-9]+$/);
    assert.equal(parsed.verification.delivery.to, "agent@example.com");
    assert.match(parsed.verification.delivery.code ?? "", /^\d{6}$/);
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO agents")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO email_verifications")));
  });

  it("returns the register contract without depending on a post-write agent lookup", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    db.queueFirst("SELECT id FROM agents WHERE lower(email) = ?", [null]);

    const result = await registerAgent(env as never, "127.0.0.1", {
      name: "Agent",
      email: "Agent@Example.com",
    });

    const parsed = RegisterAgentResponseSchema.parse(result);
    assert.match(parsed.agent.id, /^agt_/);
    assert.equal(parsed.agent.clientId, parsed.clientId);
    assert.equal(parsed.agent.email, "agent@example.com");
    assert.equal(parsed.agent.trustTier, "unverified");
    assert.equal(parsed.agent.status, "active");
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO agents")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO email_verifications")));
  });

  it("returns the shared verify-email contract when the code matches", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    db.queueFirst("FROM agents", [
      {
        id: "agt_1",
        client_id: "cli_1",
        name: "Agent",
        email: "agent@example.com",
        email_verified_at: null,
        trust_tier: "unverified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "agt_1",
        client_id: "cli_1",
        name: "Agent",
        email: "agent@example.com",
        email_verified_at: "2026-03-25T00:15:00.000Z",
        trust_tier: "supervised",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:15:00.000Z",
      },
    ]);
    db.queueFirst("FROM email_verifications", [{
      id: "ev_1",
      agent_id: "agt_1",
      email: "agent@example.com",
      code_hash: await sha256("123456"),
      attempts: 0,
      expires_at: "3026-03-25T00:00:00.000Z",
      consumed_at: null,
    }]);

    const result = await verifyAgentEmail(env as never, {
      clientId: "cli_1",
      code: "123456",
    });

    const parsed = VerifyEmailResponseSchema.parse(result);
    assert.equal(parsed.email, "agent@example.com");
    assert.equal(parsed.trustTier, "supervised");
    assert.equal(parsed.status, "active");
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE email_verifications SET consumed_at")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE agents SET email_verified_at")));
  });

});

describe("magic-link auth", () => {
  it("creates a magic link for a registered agent", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    db.queueFirst("WHERE lower(email) = ?", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Agent",
      email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z",
      trust_tier: "verified",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const result = await createMagicLink(env as never, "127.0.0.1", "agent@example.com");
    const parsed = MagicLinkResponseSchema.parse(result);

    assert.equal(parsed.agent.clientId, "cli_1");
    assert.equal(parsed.agent.email, "agent@example.com");
    assert.match(parsed.delivery.loginUrl, /\/login\/verify\?token=/);
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO magic_links")));
  });

  it("verifies a magic link and mints a session", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const token = "token_123";
    db.queueFirst("FROM magic_links", [{
      id: "mlk_1",
      agent_id: "agt_1",
      token_hash: await sha256(token),
      expires_at: "3026-03-25T00:00:00.000Z",
      consumed_at: null,
    }]);
    queueAgentLookup(db, "agt_1");

    const result = await verifyMagicLink(env as never, token);
    const parsed = MagicLinkVerifyResponseSchema.parse({
      tokenType: "Bearer",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      sessionId: result.sessionId,
      agent: result.agent,
    });

    assert.equal(parsed.agent.clientId, "cli_1");
    assert.equal(parsed.agent.email, "agent@example.com");
    assert.match(result.cookie, /opn_session=/);
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE magic_links") && entry.sql.includes("consumed_at IS NULL")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO sessions")));
  });
});

describe("oauth auth", () => {
  it("rejects a tampered state token", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const authorize = await beginOAuthAuthorize(env as never, "127.0.0.1", "google", "/account");
    const url = new URL(authorize.location);
    const state = `${url.searchParams.get("state") ?? ""}x`;

    await expectUnauthorized(
      completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/google/callback", {
          headers: { cookie: authorize.nonceCookie },
        }),
        "127.0.0.1",
        "google",
        { code: "code_1", state },
      ),
    );
  });

  it("rejects an expired state token", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const state = await signJwt(env as never, {
      iss: env.JWT_ISSUER,
      aud: env.JWT_AUDIENCE,
      sub: "google",
      scope: "oauth_state",
      exp: Math.floor(Date.now() / 1000) - 60,
      iat: Math.floor(Date.now() / 1000) - 120,
      jti: "ost_1",
      provider: "google",
      nonce: "nonce_1234567890123456",
      codeVerifier: "verifier_12345678901234567890123456789012",
      redirect: "/account",
    });

    await expectUnauthorized(
      completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/google/callback", {
          headers: { cookie: "opn_oauth_nonce_google=nonce_1234567890123456" },
        }),
        "127.0.0.1",
        "google",
        { code: "code_1", state },
      ),
    );
  });

  it("rejects a wrong-provider callback for a valid state", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const authorize = await beginOAuthAuthorize(env as never, "127.0.0.1", "google", "/account");
    const url = new URL(authorize.location);
    const state = url.searchParams.get("state") ?? "";
    const cookieValue = authorize.nonceCookie.match(/^[^=]+=([^;]+)/)?.[1] ?? "";

    await expectUnauthorized(
      completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/github/callback", {
          headers: { cookie: `opn_oauth_nonce_github=${cookieValue}` },
        }),
        "127.0.0.1",
        "github",
        { code: "code_1", state },
      ),
    );
  });

  it("rejects replay after the nonce cookie is gone", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const authorize = await beginOAuthAuthorize(env as never, "127.0.0.1", "github", "/account");
    const url = new URL(authorize.location);
    const state = url.searchParams.get("state") ?? "";

    await expectUnauthorized(
      completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/github/callback"),
        "127.0.0.1",
        "github",
        { code: "code_1", state },
      ),
    );
  });

  it("signs in an existing linked external identity", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const authorize = await beginOAuthAuthorize(env as never, "127.0.0.1", "google", "/account");
    const state = new URL(authorize.location).searchParams.get("state") ?? "";

    db.queueFirst("FROM external_identities", [{
      id: "eid_1",
      agent_id: "agt_1",
      provider: "google",
      provider_user_id: "google-user",
      email_snapshot: "agent@example.com",
      email_verified: 1,
      profile_json: "{}",
      linked_at: "2026-03-25T00:00:00.000Z",
      last_login_at: "2026-03-25T00:00:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    queueAgentLookup(db, "agt_1");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "google-access" });
      }
      if (url.includes("openidconnect.googleapis.com")) {
        return Response.json({
          sub: "google-user",
          email: "agent@example.com",
          email_verified: true,
          name: "Agent",
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const result = await completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/google/callback", {
          headers: { cookie: authorize.nonceCookie },
        }),
        "127.0.0.1",
        "google",
        { code: "code_1", state },
      );

      assert.equal(result.location, "https://opndomain.com/account");
      assert.ok(result.setCookies.some((value) => value.includes("opn_session=")));
      assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE external_identities")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("auto-creates an unverified X account with no email", async () => {
    const db = new FakeDb();
    const env = buildEnv(db);
    const authorize = await beginOAuthAuthorize(env as never, "127.0.0.1", "x", "/account");
    const state = new URL(authorize.location).searchParams.get("state") ?? "";
    queueAgentLookup(db, "agt_1");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.x.com/2/oauth2/token")) {
        return Response.json({ access_token: "x-access" });
      }
      if (url.includes("api.x.com/2/users/me")) {
        return Response.json({
          data: {
            id: "x-user-1",
            username: "x_agent",
            name: "X Agent",
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const result = await completeOAuthCallback(
        env as never,
        new Request("https://api.opndomain.com/v1/auth/oauth/x/callback", {
          headers: { cookie: authorize.nonceCookie },
        }),
        "127.0.0.1",
        "x",
        { code: "code_1", state },
      );

      assert.equal(result.location, "https://opndomain.com/welcome/credentials");
      assert.ok(result.setCookies.some((value) => value.includes("opn_oauth_welcome=")));
      assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO agents")));
      assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO external_identities")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
