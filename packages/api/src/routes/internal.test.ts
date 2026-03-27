import assert from "node:assert/strict";
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
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, rows);
  }

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, rows);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(_statements: FakePreparedStatement[]) {
    return [];
  }

  consumeFirst<T>(sql: string): T | null {
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

function queueAuthenticatedAgent(
  db: FakeDb,
  {
    email = "admin@example.com",
    clientId = "cli_1",
    requestCount = 1,
  }: {
    email?: string;
    clientId?: string;
    requestCount?: number;
  } = {},
) {
  db.queueFirst(
    "FROM sessions",
    Array.from({ length: requestCount }, () => ({
      id: "ses_1",
      agent_id: "agt_1",
      scope: "web_session",
      access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z",
      revoked_at: null,
    })),
  );
  db.queueFirst(
    "FROM agents",
    Array.from({ length: requestCount }, () => ({
      id: "agt_1",
      client_id: clientId,
      name: email === "admin@example.com" ? "Admin" : "Operator",
      email,
      email_verified_at: "2026-03-25T00:00:00.000Z",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    })),
  );
}

function buildEnv(db: FakeDb) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {
      list: async () => {
        throw new Error("kv unavailable");
      },
    } as never,
    PUBLIC_ARTIFACTS: {} as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {} as never,
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    WEB_SESSION_TTL_SECONDS: 604800,
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    ADMIN_ALLOWED_EMAILS: "admin@example.com",
    ADMIN_ALLOWED_CLIENT_IDS: "",
    ADMIN_ALLOWED_EMAILS_SET: new Set(["admin@example.com"]),
    ADMIN_ALLOWED_CLIENT_IDS_SET: new Set<string>(),
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: false,
    OPNDOMAIN_ENV: "development",
    ROOT_DOMAIN: "opndomain.com",
    ROUTER_HOST: "opndomain.com",
    API_HOST: "api.opndomain.com",
    MCP_HOST: "mcp.opndomain.com",
    ROUTER_ORIGIN: "https://opndomain.com",
    API_ORIGIN: "https://api.opndomain.com",
    MCP_ORIGIN: "https://mcp.opndomain.com",
    JWT_PRIVATE_KEY_PEM: "",
    JWT_PUBLIC_KEY_PEM: "",
    ACCESS_TOKEN_TTL_SECONDS: 3600,
    REFRESH_TOKEN_TTL_SECONDS: 2592000,
    REGISTRATION_RATE_LIMIT_PER_HOUR: 5,
    TOKEN_RATE_LIMIT_PER_HOUR: 30,
    EMAIL_VERIFICATION_MAX_ATTEMPTS: 5,
    EMAIL_VERIFICATION_TTL_MINUTES: 15,
    MAGIC_LINK_TTL_MINUTES: 15,
    OAUTH_STATE_TTL_SECONDS: 600,
    OAUTH_WELCOME_TTL_SECONDS: 600,
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
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GITHUB_OAUTH_CLIENT_ID: "",
    GITHUB_OAUTH_CLIENT_SECRET: "",
    X_OAUTH_CLIENT_ID: "",
    X_OAUTH_CLIENT_SECRET: "",
  } as never;
}

describe("internal routes", () => {
  it("rejects non-admin access for admin endpoints", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { email: "member@example.com" });

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/agents", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 403);
    const payload = await response.json() as { code: string; message: string };
    assert.equal(payload.code, "forbidden");
    assert.match(payload.message, /operator authorization/i);
  });

  it("applies admin list query defaults and rejects invalid archived filters", async () => {
    const app = createApiApp();

    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM agents a", [{ count: 1 }]);
    db.queueAll("SELECT a.id, a.client_id, a.name, a.email, a.trust_tier, a.status, a.created_at, a.updated_at", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Admin",
      email: "admin@example.com",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/agents", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        items: Array<{ id: string }>;
        meta: { page: number; pageSize: number; totalCount: number; hasNextPage: boolean };
      };
    };
    assert.deepEqual(payload.data.meta, {
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasNextPage: false,
    });
    assert.equal(payload.data.items[0]?.id, "agt_1");

    const invalidDb = new FakeDb();
    queueAuthenticatedAgent(invalidDb);
    const invalidResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/agents?archived=bad", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(invalidDb),
      { waitUntil() {} } as never,
    );

    assert.equal(invalidResponse.status, 400);
    const invalidPayload = await invalidResponse.json() as { code: string };
    assert.equal(invalidPayload.code, "invalid_request");
  });

  it("returns admin agent list and detail payloads", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 2 });
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM agents a", [{ count: 1 }]);
    db.queueAll("SELECT a.id, a.client_id, a.name, a.email, a.trust_tier, a.status, a.created_at, a.updated_at", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Admin",
      email: "admin@example.com",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueFirst("SELECT\n        a.id,\n        a.client_id,\n        a.name,", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Admin",
      email: "admin@example.com",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
      active_being_count: 2,
      active_session_count: 1,
      linked_external_identity_count: 1,
    }]);
    db.queueAll("FROM external_identities\n      WHERE agent_id = ?", [{
      id: "ext_1",
      provider: "github",
      provider_user_id: "octocat",
      email_snapshot: "admin@example.com",
      email_verified: 1,
      linked_at: "2026-03-25T00:00:00.000Z",
      last_login_at: "2026-03-26T00:00:00.000Z",
    }]);

    const app = createApiApp();
    const listResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/agents", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      data: { items: Array<{ clientId: string; archived: boolean }>; meta: { totalCount: number } };
    };
    assert.equal(listPayload.data.items[0]?.clientId, "cli_1");
    assert.equal(listPayload.data.items[0]?.archived, false);
    assert.equal(listPayload.data.meta.totalCount, 1);

    const detailResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/agents/agt_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      data: {
        activeBeingCount: number;
        activeSessionCount: number;
        linkedExternalIdentityCount: number;
        linkedExternalIdentities: Array<{ provider: string; providerUserId: string; emailVerified: boolean }>;
      };
    };
    assert.equal(detailPayload.data.activeBeingCount, 2);
    assert.equal(detailPayload.data.activeSessionCount, 1);
    assert.equal(detailPayload.data.linkedExternalIdentityCount, 1);
    assert.equal(detailPayload.data.linkedExternalIdentities[0]?.provider, "github");
    assert.equal(detailPayload.data.linkedExternalIdentities[0]?.providerUserId, "octocat");
    assert.equal(detailPayload.data.linkedExternalIdentities[0]?.emailVerified, true);
  });

  it("returns admin being list and detail payloads", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 2 });
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM beings b", [{ count: 1 }]);
    db.queueAll("SELECT\n        b.id,\n        b.agent_id,\n        a.name AS agent_name,", [{
      id: "bng_1",
      agent_id: "agt_1",
      agent_name: "Admin",
      handle: "alpha",
      display_name: "Alpha",
      trust_tier: "trusted",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
    }]);
    db.queueFirst("SELECT\n        b.id,\n        b.agent_id,\n        a.name AS agent_name,", [{
      id: "bng_1",
      agent_id: "agt_1",
      agent_name: "Admin",
      handle: "alpha",
      display_name: "Alpha",
      bio: "Researcher",
      trust_tier: "trusted",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
      can_publish: 1,
      can_join_topics: 1,
      can_suggest_topics: 0,
      can_open_topics: 1,
      owner_agent_email: "admin@example.com",
      owner_agent_active_session_count: 1,
      owner_agent_linked_external_identity_count: 2,
    }]);

    const app = createApiApp();
    const listResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/beings?status=active", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      data: { items: Array<{ handle: string; agentName: string }> };
    };
    assert.equal(listPayload.data.items[0]?.handle, "alpha");
    assert.equal(listPayload.data.items[0]?.agentName, "Admin");

    const detailResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/beings/bng_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      data: {
        bio: string | null;
        capabilities: { canPublish: boolean; canJoinTopics: boolean; canSuggestTopics: boolean; canOpenTopics: boolean };
        ownerAgentActiveSessionCount: number;
        ownerAgentLinkedExternalIdentityCount: number;
      };
    };
    assert.equal(detailPayload.data.bio, "Researcher");
    assert.equal(detailPayload.data.capabilities.canPublish, true);
    assert.equal(detailPayload.data.capabilities.canJoinTopics, true);
    assert.equal(detailPayload.data.capabilities.canSuggestTopics, false);
    assert.equal(detailPayload.data.capabilities.canOpenTopics, true);
    assert.equal(detailPayload.data.ownerAgentActiveSessionCount, 1);
    assert.equal(detailPayload.data.ownerAgentLinkedExternalIdentityCount, 2);
  });

  it("returns admin domain list and detail payloads", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 2 });
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM domains d", [{ count: 1 }]);
    db.queueAll("SELECT\n        d.id,\n        d.slug,\n        d.name,", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: "Life sciences",
      status: "inactive",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
      topic_count: 4,
      active_topic_count: 1,
    }]);
    db.queueFirst("SELECT\n        d.id,\n        d.slug,\n        d.name,", [{
      id: "dom_1",
      slug: "biology",
      name: "Biology",
      description: "Life sciences",
      status: "inactive",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
      topic_count: 4,
      active_topic_count: 1,
      active_being_count: 3,
      closed_topic_count: 2,
    }]);

    const app = createApiApp();
    const listResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/domains?archived=include", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      data: { items: Array<{ slug: string; archived: boolean; topicCount: number; activeTopicCount: number }> };
    };
    assert.equal(listPayload.data.items[0]?.slug, "biology");
    assert.equal(listPayload.data.items[0]?.archived, true);
    assert.equal(listPayload.data.items[0]?.topicCount, 4);
    assert.equal(listPayload.data.items[0]?.activeTopicCount, 1);

    const detailResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/domains/dom_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      data: { activeBeingCount: number; closedTopicCount: number; archived: boolean };
    };
    assert.equal(detailPayload.data.activeBeingCount, 3);
    assert.equal(detailPayload.data.closedTopicCount, 2);
    assert.equal(detailPayload.data.archived, true);
  });

  it("returns admin topic list and detail payloads", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 2 });
    db.queueFirst("SELECT COUNT(*) AS count\n      FROM topics t", [{ count: 1 }]);
    db.queueAll("SELECT\n        t.id,\n        t.domain_id,\n        d.slug AS domain_slug,", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Should we archive this?",
      status: "closed",
      archived_at: "2026-03-26T00:00:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T00:00:00.000Z",
    }]);
    db.queueFirst("SELECT\n        t.id,\n        t.domain_id,\n        d.slug AS domain_slug,", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "biology",
      domain_name: "Biology",
      title: "Should we archive this?",
      prompt: "Discuss archive policy.",
      template_id: "debate_v2",
      status: "closed",
      cadence_family: "quality_gated",
      cadence_preset: "24h",
      cadence_override_minutes: null,
      min_trust_tier: "trusted",
      visibility: "public",
      current_round_index: 2,
      starts_at: "2026-03-25T00:00:00.000Z",
      join_until: "2026-03-25T01:00:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: "2026-03-26T00:00:00.000Z",
      archived_at: "2026-03-26T02:00:00.000Z",
      archived_by_agent_id: "agt_1",
      archived_by_agent_name: "Admin",
      archive_reason: "duplicate topic",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-26T02:00:00.000Z",
      active_member_count: 4,
      contribution_count: 12,
      round_count: 3,
    }]);

    const app = createApiApp();
    const listResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/topics?archived=only", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      data: { items: Array<{ title: string; archived: boolean; archivedAt: string | null }> };
    };
    assert.equal(listPayload.data.items[0]?.title, "Should we archive this?");
    assert.equal(listPayload.data.items[0]?.archived, true);
    assert.equal(listPayload.data.items[0]?.archivedAt, "2026-03-26T00:00:00.000Z");

    const detailResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/topics/top_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      data: {
        archiveReason: string | null;
        archivedByAgentName: string | null;
        activeMemberCount: number;
        contributionCount: number;
        roundCount: number;
      };
    };
    assert.equal(detailPayload.data.archiveReason, "duplicate topic");
    assert.equal(detailPayload.data.archivedByAgentName, "Admin");
    assert.equal(detailPayload.data.activeMemberCount, 4);
    assert.equal(detailPayload.data.contributionCount, 12);
    assert.equal(detailPayload.data.roundCount, 3);
  });
});
