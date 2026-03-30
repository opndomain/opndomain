import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AnalyticsBackfillResponseSchema,
  AnalyticsDomainsResponseSchema,
  AnalyticsLeaderboardResponseSchema,
  AnalyticsOverviewResponseSchema,
  AnalyticsTopicResponseSchema,
  AnalyticsVoteReliabilityResponseSchema,
} from "@opndomain/shared";
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
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(sqlFragment: string, rows: unknown[]) {
    this.firstQueue.set(sqlFragment, [...rows]);
  }

  queueAll(sqlFragment: string, rows: unknown[]) {
    this.allQueue.set(sqlFragment, [...rows]);
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

function queueAuthenticatedAdmin(db: FakeDb, requestCount = 1) {
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
      client_id: "cli_1",
      name: "Admin",
      email: "admin@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    })),
  );
}

function buildEnv(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
      list: async () => ({ keys: [] }),
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
    ...overrides,
  } as never;
}

describe("analytics routes", () => {
  it("returns an empty overview payload that matches the shared schema", async () => {
    const db = new FakeDb();
    db.queueAll("FROM platform_daily_rollups", []);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/overview"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsOverviewResponseSchema.parse(payload.data);
    assert.deepEqual(parsed.totals, {
      totalTopics: 0,
      totalContributions: 0,
      totalVerdicts: 0,
      activeBeings: 0,
      activeAgents: 0,
    });
    assert.deepEqual(parsed.series, []);
  });

  it("returns domain analytics that match the shared schema", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT rollup_date FROM domain_daily_rollups", [{ rollup_date: "2026-03-29" }]);
    db.queueAll("FROM domain_daily_rollups ddr", [{
      domain_id: "dom_1",
      domain_slug: "energy",
      domain_name: "Energy",
      active_topics: 3,
      active_beings: 8,
      contribution_count: 21,
      verdict_count: 2,
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/domains"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsDomainsResponseSchema.parse(payload.data);
    assert.equal(parsed.rollupDate, "2026-03-29");
    assert.equal(parsed.domains[0]?.domainSlug, "energy");
  });

  it("preserves cumulative overview totals when a from window is provided", async () => {
    const db = new FakeDb();
    db.queueFirst("COALESCE(SUM(topics_created_count), 0) AS topics_created_count", [{
      topics_created_count: 5,
      contributions_created_count: 12,
      verdicts_created_count: 2,
    }]);
    db.queueAll("FROM platform_daily_rollups", [
      {
        rollup_date: "2026-03-28",
        topics_created_count: 2,
        contributions_created_count: 3,
        verdicts_created_count: 1,
        active_topics: 4,
        active_beings: 6,
        active_agents: 3,
      },
      {
        rollup_date: "2026-03-29",
        topics_created_count: 1,
        contributions_created_count: 4,
        verdicts_created_count: 0,
        active_topics: 5,
        active_beings: 8,
        active_agents: 4,
      },
    ]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/overview?from=2026-03-28"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsOverviewResponseSchema.parse(payload.data);
    assert.equal(parsed.series[0]?.cumulativeTopics, 7);
    assert.equal(parsed.series[0]?.cumulativeContributions, 15);
    assert.equal(parsed.series[1]?.cumulativeTopics, 8);
    assert.equal(parsed.totals.totalTopics, 8);
    assert.equal(parsed.totals.totalContributions, 19);
    assert.equal(parsed.totals.totalVerdicts, 3);
  });

  it("returns leaderboard analytics that match the shared schema", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT id, slug, name FROM domains WHERE id = ?", [{
      id: "dom_1",
      slug: "energy",
      name: "Energy",
    }]);
    db.queueAll("FROM domain_reputation dr", [{
      being_id: "bng_1",
      handle: "grid-analyst",
      display_name: "Grid Analyst",
      decayed_score: 92.4,
      average_score: 89.7,
      consistency_score: 0.82,
      sample_count: 17,
      last_active_at: "2026-03-29T18:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/leaderboard/dom_1"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsLeaderboardResponseSchema.parse(payload.data);
    assert.equal(parsed.domain.slug, "energy");
    assert.equal(parsed.leaderboard[0]?.beingId, "bng_1");
  });

  it("returns not_found for an unknown leaderboard domain id", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT id, slug, name FROM domains WHERE id = ?", [null]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/leaderboard/dom_missing"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 404);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "not_found");
  });

  it("returns topic analytics with zero claim density when no claims exist", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics\n      WHERE id = ?", [{
      id: "top_1",
      domain_id: "dom_1",
      title: "Should storage mandates expand?",
      status: "started",
      current_round_index: 2,
    }]);
    db.queueFirst("FROM contributions\n        WHERE topic_id = ?", [{
      participant_count: 2,
      contribution_count: 4,
    }]);
    db.queueFirst("SELECT COUNT(*) AS count FROM claims WHERE topic_id = ?", [{ count: 0 }]);
    db.queueAll("GROUP BY bucket_index", [{ bucket_index: 1, round_kind: "propose", count: 4 }]);
    db.queueAll("COALESCE(c.body_clean, c.body) AS excerpt", [{
      contribution_id: "ctr_1",
      being_id: "bng_1",
      being_handle: "grid-analyst",
      round_id: "rnd_1",
      round_kind: "propose",
      final_score: 12,
      excerpt: "Storage targets stabilize the grid during peak demand.",
      substance_score: 72,
      relevance: 81,
      novelty: 44,
      reframe: 38,
      role_bonus: 10,
    }]);
    db.queueFirst("COALESCE(AVG(cs.substance_score), 0) AS substance_score", [{
      substance_score: 72,
      relevance: 81,
      novelty: 44,
      reframe: 38,
      role_bonus: 10,
    }]);
    db.queueAll("FROM rounds r\n        LEFT JOIN contributions c ON c.round_id = r.id", [{
      round_id: "rnd_1",
      round_index: 0,
      round_kind: "propose",
      participant_count: 2,
      contribution_count: 4,
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/topic/top_1"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsTopicResponseSchema.parse(payload.data);
    assert.equal(parsed.summary.claimCount, 0);
    assert.equal(parsed.summary.claimDensity, 0);
    assert.equal(parsed.scoreDistribution[1]?.totalCount, 4);
    assert.equal(parsed.scoreDistribution[1]?.roundCounts.propose, 4);
    assert.equal(parsed.bucketDetails[0]?.contributions[0]?.contributionId, "ctr_1");
    assert.equal(parsed.averageDimensionBreakdown.substance, 72);
  });

  it("returns not_found for an unknown topic id", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics\n      WHERE id = ?", [null]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/topic/top_missing"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 404);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "not_found");
  });

  it("returns vote reliability analytics that match the shared schema", async () => {
    const db = new FakeDb();
    db.queueAll("FROM vote_reliability vr", [{
      being_id: "bng_1",
      handle: "grid-analyst",
      display_name: "Grid Analyst",
      trust_tier: "verified",
      reliability: 7.6,
      votes_count: 9,
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/vote-reliability?minVotes=5"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsVoteReliabilityResponseSchema.parse(payload.data);
    assert.equal(parsed.minVotes, 5);
    assert.equal(parsed.histogram[7]?.trustTierCounts.verified, 1);
    assert.equal(parsed.scatter[0]?.reliability, 76);
  });

  it("rejects invalid vote reliability query parameters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/analytics/vote-reliability?minVotes=0"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "invalid_request");
  });

  it("accepts admin-authenticated platform rollup backfill requests", async () => {
    const db = new FakeDb();
    queueAuthenticatedAdmin(db);
    db.queueFirst("SELECT id FROM platform_daily_rollups WHERE rollup_date = ?", [null]);
    db.queueFirst("SELECT COUNT(*) AS count FROM topics WHERE substr(created_at, 1, 10) = ?", [{ count: 1 }]);
    db.queueFirst("SELECT COUNT(*) AS count FROM contributions WHERE substr(created_at, 1, 10) = ?", [{ count: 3 }]);
    db.queueFirst("SELECT COUNT(*) AS count FROM verdicts WHERE substr(created_at, 1, 10) = ?", [{ count: 1 }]);
    db.queueFirst("FROM topics\n        WHERE created_at < ?", [{ count: 2 }]);
    db.queueFirst("COUNT(DISTINCT tm.being_id) AS count", [{ count: 4 }]);
    db.queueFirst("COUNT(DISTINCT a.id) AS count", [{ count: 2 }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/analytics/platform-rollups/backfill", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: "2026-03-29",
          to: "2026-03-29",
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: unknown };
    const parsed = AnalyticsBackfillResponseSchema.parse(payload.data);
    assert.equal(parsed.daysProcessed, 1);
    assert.equal(parsed.rowsWritten, 1);
    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO platform_daily_rollups")));
  });
});
