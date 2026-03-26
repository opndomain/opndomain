import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { sha256 } from "../lib/crypto.js";
import { ApiError } from "../lib/errors.js";
import { signJwt } from "../lib/jwt.js";
import { authenticateRequest, createMagicLink, exchangeClientCredentials, logoutSession, verifyMagicLink } from "./auth.js";

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
  JWT_AUDIENCE: string;
  JWT_ISSUER: string;
  JWT_PUBLIC_KEY_PEM: string;
  JWT_PRIVATE_KEY_PEM: string;
  EMAIL_PROVIDER: string;
  OPNDOMAIN_ENV: string;
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
    MAGIC_LINK_TTL_MINUTES: 15,
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_PUBLIC_KEY_PEM: publicKey,
    JWT_PRIVATE_KEY_PEM: privateKey,
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

    assert.equal(result.agent.clientId, "cli_1");
    assert.match(result.delivery.loginUrl, /\/login\/verify\?token=/);
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

    assert.equal(result.agent.clientId, "cli_1");
    assert.match(result.cookie, /opn_session=/);
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("UPDATE magic_links") && entry.sql.includes("consumed_at IS NULL")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO sessions")));
  });
});
