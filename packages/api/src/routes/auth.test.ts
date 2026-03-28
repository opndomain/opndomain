import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { createApiApp } from "../index.js";

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

  async batch(statements: FakePreparedStatement[]) {
    for (const statement of statements) {
      await statement.run();
    }
    return [];
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
    return (entry?.[1] as T[]) ?? [];
  }
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function buildEnv(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {
      get: async () => null,
      getWithMetadata: async () => ({ value: null, metadata: null }),
      put: async () => undefined,
      delete: async () => undefined,
      list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    } as never,
    PUBLIC_ARTIFACTS: {} as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {} as never,
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    WEB_SESSION_TTL_SECONDS: 604800,
    ACCESS_TOKEN_TTL_SECONDS: 3600,
    REFRESH_TOKEN_TTL_SECONDS: 2592000,
    REGISTRATION_RATE_LIMIT_PER_HOUR: 5,
    TOKEN_RATE_LIMIT_PER_HOUR: 30,
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
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GITHUB_OAUTH_CLIENT_ID: "",
    GITHUB_OAUTH_CLIENT_SECRET: "",
    X_OAUTH_CLIENT_ID: "",
    X_OAUTH_CLIENT_SECRET: "",
    EMAIL_PROVIDER: "stub",
    EMAIL_FROM: "noreply@opndomain.com",
    EMAIL_REPLY_TO: "support@opndomain.com",
    OPNDOMAIN_ENV: "development",
    ROOT_DOMAIN: "opndomain.com",
    ROUTER_HOST: "opndomain.com",
    API_HOST: "api.opndomain.com",
    MCP_HOST: "mcp.opndomain.com",
    MCP_ORIGIN: "https://mcp.opndomain.com",
    ADMIN_ALLOWED_EMAILS: "",
    ADMIN_ALLOWED_CLIENT_IDS: "",
    ADMIN_ALLOWED_EMAILS_SET: new Set<string>(),
    ADMIN_ALLOWED_CLIENT_IDS_SET: new Set<string>(),
    ENABLE_SEMANTIC_SCORING: false,
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    CURATED_OPEN_KEY: "curated/open.json",
    TOPIC_TRANSCRIPT_PREFIX: "topics",
    ARTIFACTS_PREFIX: "artifacts",
    ADMIN_BASE_PATH: "/admin",
    LOG_LEVEL: "debug",
    EMAIL_PROVIDER_API_KEY: "",
    AWS_SES_ACCESS_KEY_ID: "",
    AWS_SES_SECRET_ACCESS_KEY: "",
    AWS_SES_REGION: "us-east-2",
    AWS_SES_SESSION_TOKEN: "",
    EMAIL_VERIFICATION_BASE_URL: "https://api.opndomain.com",
    ...overrides,
  } as never;
}

describe("auth routes", () => {
  it("returns a canonical 401 envelope for missing session auth", async () => {
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/auth/session"),
      buildEnv(new FakeDb()),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 401);
    const payload = await response.json() as { code: string; message: string };
    assert.equal(payload.code, "unauthorized");
    assert.match(payload.message, /authentication is required/i);
  });

  it("returns a canonical 502 envelope when verification email delivery fails", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT id FROM agents WHERE lower(email) = ?", [null]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Sim Alpha",
          email: "sim.alpha@example.com",
        }),
      }),
      buildEnv(db, {
        EMAIL_PROVIDER: "ses",
        AWS_SES_ACCESS_KEY_ID: "",
        AWS_SES_SECRET_ACCESS_KEY: "",
      }),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 502);
    const payload = await response.json() as { code: string; message: string; details?: { error?: string } };
    assert.equal(payload.code, "email_delivery_failed");
    assert.match(payload.message, /verification email delivery failed/i);
    assert.equal(payload.details?.error, "ses_not_configured");
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO agents")));
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT INTO email_verifications")));
  });
});
