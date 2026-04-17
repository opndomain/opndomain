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
    this.db.executedRuns.push({ sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  batches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  executedRuns: Array<{ sql: string; bindings: unknown[] }> = [];
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

  async batch(statements: FakePreparedStatement[]) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
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

class FakeBucket {
  writes: Array<{ key: string; body: unknown; options?: { httpMetadata?: { contentType?: string } } }> = [];
  deletes: string[] = [];

  async put(key: string, body: unknown, options?: { httpMetadata?: { contentType?: string } }) {
    this.writes.push({ key, body, options });
  }

  async delete(key: string) {
    this.deletes.push(key);
  }
}

class FakeCache {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async list({ prefix }: { prefix: string }) {
    return {
      keys: Array.from(this.values.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
  }
}

class FakeTopicStateStub {
  constructor(private readonly payload: unknown) {}

  async fetch(_url: string) {
    return new Response(JSON.stringify(this.payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

class FakeTopicStateNamespace {
  constructor(private readonly payloadByTopicId: Record<string, unknown>) {}

  idFromName(name: string) {
    return name;
  }

  get(id: string) {
    return new FakeTopicStateStub(this.payloadByTopicId[id] ?? {
      acceptLatencyMsSamples: [],
      recomputeDurationMsSamples: [],
      snapshotDurationMsSamples: [],
      drainThroughputSamples: [],
      pendingContributionBacklog: 0,
      pendingVoteBacklog: 0,
      pendingAuxBacklog: 0,
      semanticBacklog: 0,
      publicationFreshnessLagMs: 0,
    });
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

function buildEnv(db: FakeDb, overrides: Record<string, unknown> = {}) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {
      get: async () => null,
      put: async () => undefined,
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
    ...overrides,
  } as never;
}

function queuePresentationRepairReads(db: FakeDb) {
  db.queueFirst("FROM topics", [{
    id: "top_1",
    domain_id: "dom_1",
    domain_slug: "energy",
    title: "Topic",
    prompt: "Prompt",
    status: "closed",
    closed_at: "2026-03-25T02:00:00.000Z",
  }]);
  db.queueFirst("FROM topics\n      WHERE id = ?", [{
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate",
    status: "closed",
    current_round_index: 0,
    updated_at: "2026-03-25T00:00:00.000Z",
  }]);
  db.queueAll("FROM rounds r\n      LEFT JOIN round_configs", [{
    id: "rnd_1",
    sequence_index: 0,
    round_kind: "propose",
    status: "completed",
    starts_at: "2026-03-25T00:00:00.000Z",
    ends_at: "2026-03-25T01:00:00.000Z",
    reveal_at: "2026-03-25T01:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueAll("FROM contributions c", [{
    id: "cnt_1",
    round_id: "rnd_1",
    being_id: "bng_1",
    being_handle: "alpha",
    body_clean: "Body",
    visibility: "normal",
    submitted_at: "2026-03-25T00:10:00.000Z",
    heuristic_score: 70,
    live_score: 70,
    final_score: 75,
    reveal_at: "2026-03-25T01:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueFirst("FROM verdicts", [{
    confidence: "moderate",
    terminalization_mode: "degraded_template",
    summary: "summary",
    reasoning_json: JSON.stringify({
      topContributionsPerRound: [
        {
          roundKind: "propose",
          contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 75, excerpt: "Body" }],
        },
      ],
      completedRounds: 1,
      totalRounds: 1,
    }),
  }, {
    confidence: "moderate",
    terminalization_mode: "degraded_template",
    summary: "summary",
    reasoning_json: JSON.stringify({
      topContributionsPerRound: [
        {
          roundKind: "propose",
          contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 75, excerpt: "Body" }],
        },
      ],
      completedRounds: 1,
      totalRounds: 1,
    }),
  }]);
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", [{ count: 1 }]);
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", [{ count: 1 }]);
}

describe("internal routes", () => {
  it("extends internal health with aggregated scale telemetry", async () => {
    const db = new FakeDb();
    const cache = new FakeCache();
    queueAuthenticatedAgent(db);
    db.queueAll("SELECT status, COUNT(*) AS count FROM topics GROUP BY status ORDER BY status ASC", [
      { status: "started", count: 2 },
    ]);
    db.queueAll("SELECT id FROM topics WHERE status = 'started' ORDER BY updated_at DESC", [
      { id: "top_1" },
      { id: "top_2" },
    ]);
    cache.values.set("snapshot-pending:top_9", JSON.stringify({ topicId: "top_9" }));
    cache.values.set("presentation-pending:top_7", JSON.stringify({ topicId: "top_7" }));
    cache.values.set("cron/last-run/* * * * *", "2026-03-25T00:00:00.000Z");
    cache.values.set("cron/last-run/0 2 * * *", "2026-03-25T02:00:00.000Z");
    cache.values.set("cron/last-run/0 3 * * *", "2026-03-25T03:00:00.000Z");
    cache.values.set("cron/last-run/0 4 * * *", "2026-03-25T04:00:00.000Z");
    cache.values.set(
      "cron/lifecycle-mutations/2026-03-25T00:00:05.000Z__* * * * *",
      JSON.stringify({
        cron: "* * * * *",
        executedAt: "2026-03-25T00:00:05.000Z",
        mutatedTopicIds: ["top_1", "top_2"],
      }),
    );

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/health", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db, {
        PUBLIC_CACHE: cache as never,
        TOPIC_STATE_DO: new FakeTopicStateNamespace({
          top_1: {
            acceptLatencyMsSamples: [8, 12],
            recomputeDurationMsSamples: [15],
            snapshotDurationMsSamples: [20],
            drainThroughputSamples: [{ contributionsPerFlush: 2, votesPerFlush: 1, auxRowsPerFlush: 0 }],
            pendingContributionBacklog: 3,
            pendingVoteBacklog: 2,
            pendingAuxBacklog: 1,
            semanticBacklog: 2,
            publicationFreshnessLagMs: 25,
          },
          top_2: {
            acceptLatencyMsSamples: [10],
            recomputeDurationMsSamples: [25],
            snapshotDurationMsSamples: [40],
            drainThroughputSamples: [{ contributionsPerFlush: 4, votesPerFlush: 3, auxRowsPerFlush: 2 }],
            pendingContributionBacklog: 4,
            pendingVoteBacklog: 5,
            pendingAuxBacklog: 0,
            semanticBacklog: 1,
            publicationFreshnessLagMs: 45,
          },
        }) as never,
      }),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        snapshotPendingTopics: string[];
        presentationPendingTopics: string[];
        cronHeartbeats: Array<{ cron: string; lastRun: string | null; ageSeconds: number | null }>;
        recentLifecycleMutations: Array<{ cron: string; executedAt: string; mutatedTopicIds: string[] }>;
        scaleTelemetry: {
          acceptLatencyMs: { p50: number; p95: number; max: number };
          pendingContributionBacklog: number;
          pendingVoteBacklog: number;
          pendingAuxBacklog: number;
          drainThroughput: { contributionsPerFlush: number; votesPerFlush: number; auxRowsPerFlush: number };
          recomputeDurationMs: { p50: number; p95: number; max: number };
          semanticBacklog: number;
          snapshotDurationMs: { p50: number; p95: number; max: number };
          publicationFreshnessLagMs: { p95: number; max: number };
        };
      };
    };

    assert.deepEqual(payload.data.snapshotPendingTopics, ["top_9"]);
    assert.deepEqual(payload.data.presentationPendingTopics, ["top_7"]);
    assert.equal(payload.data.cronHeartbeats.length, 5);
    assert.deepEqual(payload.data.recentLifecycleMutations, [{
      cron: "* * * * *",
      executedAt: "2026-03-25T00:00:05.000Z",
      mutatedTopicIds: ["top_1", "top_2"],
    }]);
    assert.deepEqual(payload.data.scaleTelemetry, {
      acceptLatencyMs: { p50: 10, p95: 12, max: 12 },
      pendingContributionBacklog: 7,
      pendingVoteBacklog: 7,
      pendingAuxBacklog: 1,
      drainThroughput: { contributionsPerFlush: 3, votesPerFlush: 2, auxRowsPerFlush: 1 },
      recomputeDurationMs: { p50: 15, p95: 25, max: 25 },
      semanticBacklog: 3,
      snapshotDurationMs: { p50: 20, p95: 40, max: 40 },
      publicationFreshnessLagMs: { p95: 45, max: 45 },
    });
  });

  it("returns admin cron observability with heartbeats and recent lifecycle mutations", async () => {
    const db = new FakeDb();
    const cache = new FakeCache();
    queueAuthenticatedAgent(db);
    cache.values.set("cron/last-run/* * * * *", "2026-03-25T00:00:00.000Z");
    cache.values.set("cron/last-run/*/1 * * * *", "2026-03-25T00:00:30.000Z");
    cache.values.set(
      "cron/lifecycle-mutations/2026-03-25T00:00:05.000Z__* * * * *",
      JSON.stringify({
        cron: "* * * * *",
        executedAt: "2026-03-25T00:00:05.000Z",
        mutatedTopicIds: ["top_1"],
      }),
    );

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/cron", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db, {
        PUBLIC_CACHE: cache as never,
      }),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        heartbeats: Array<{ cron: string; lastRun: string | null; ageSeconds: number | null }>;
        recentLifecycleMutations: Array<{ cron: string; executedAt: string; mutatedTopicIds: string[] }>;
      };
    };
    assert.equal(payload.data.heartbeats[0]?.cron, "* * * * *");
    assert.equal(payload.data.heartbeats[0]?.lastRun, "2026-03-25T00:00:00.000Z");
    assert.equal(payload.data.heartbeats[1]?.cron, "*/1 * * * *");
    assert.deepEqual(payload.data.recentLifecycleMutations, [{
      cron: "* * * * *",
      executedAt: "2026-03-25T00:00:05.000Z",
      mutatedTopicIds: ["top_1"],
    }]);
  });

  it("allows admins to upsert, list, and inspect topic candidates", async () => {
    const app = createApiApp();

    const createDb = new FakeDb();
    queueAuthenticatedAgent(createDb);
    const createResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/topic-candidates", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          items: [{
            id: "ignored",
            source: "arxiv",
            sourceId: "1234.5678",
            sourceUrl: "https://arxiv.org/abs/1234.5678",
            domainId: "dom_1",
            title: "Candidate",
            prompt: "Prompt",
            templateId: "debate",
            topicFormat: "scheduled_research",
            cadenceFamily: "scheduled",
            cadenceOverrideMinutes: 60,
            minTrustTier: "supervised",
            priorityScore: 9,
            publishedAt: "2026-03-31T00:00:00.000Z",
          }],
        }),
      }),
      buildEnv(createDb),
      { waitUntil() {} } as never,
    );
    assert.equal(createResponse.status, 200);
    const createPayload = await createResponse.json() as {
      data: { createdCount: number; updatedCount: number; duplicates: unknown[] };
    };
    assert.deepEqual(createPayload.data, {
      createdCount: 1,
      updatedCount: 0,
      duplicates: [],
    });

    const listDb = new FakeDb();
    queueAuthenticatedAgent(listDb, { requestCount: 2 });
    listDb.queueAll("FROM topic_candidates", [{
      id: "tcand_1",
      source: "arxiv",
      source_id: "1234.5678",
      source_url: "https://arxiv.org/abs/1234.5678",
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 9,
      published_at: "2026-03-31T00:00:00.000Z",
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    listDb.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "arxiv",
      source_id: "1234.5678",
      source_url: "https://arxiv.org/abs/1234.5678",
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 9,
      published_at: "2026-03-31T00:00:00.000Z",
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);

    const listResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/topic-candidates?status=approved", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(listDb),
      { waitUntil() {} } as never,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json() as {
      data: Array<{ id: string; status: string; topicFormat: string }>;
    };
    assert.deepEqual(listPayload.data, [{
      id: "tcand_1",
      source: "arxiv",
      sourceId: "1234.5678",
      sourceUrl: "https://arxiv.org/abs/1234.5678",
      domainId: "dom_1",
      title: "Candidate",
      topicFormat: "scheduled_research",
      cadenceFamily: "scheduled",
      cadenceOverrideMinutes: 60,
      minTrustTier: "supervised",
      status: "approved",
      priorityScore: 9,
      publishedAt: "2026-03-31T00:00:00.000Z",
      promotedTopicId: null,
      promotionError: null,
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    }]);

    const detailResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/topic-candidates/tcand_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(listDb),
      { waitUntil() {} } as never,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      data: { id: string; prompt: string; templateId: string };
    };
    assert.deepEqual(detailPayload.data, {
      id: "tcand_1",
      source: "arxiv",
      sourceId: "1234.5678",
      sourceUrl: "https://arxiv.org/abs/1234.5678",
      domainId: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      templateId: "debate",
      topicFormat: "scheduled_research",
      cadenceFamily: "scheduled",
      cadenceOverrideMinutes: 60,
      minTrustTier: "supervised",
      status: "approved",
      priorityScore: 9,
      publishedAt: "2026-03-31T00:00:00.000Z",
      promotedTopicId: null,
      promotionError: null,
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    });
  });

  it("allows admins to create internal topics with non-debate templates", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 1 });
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "ai-safety",
      name: "AI Safety",
      description: null,
      status: "active",
      parent_domain_id: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t", [{
      id: "top_internal",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Internal Topic",
      prompt: "Investigate this.",
      template_id: "research",
      topic_format: "rolling_research",
      topic_source: "manual_admin",
      status: "open",
      cadence_family: "rolling",
      cadence_preset: null,
      cadence_override_minutes: 60,
      min_distinct_participants: 3,
      countdown_seconds: 120,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      change_sequence: 0,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds", []);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/topics", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "Internal Topic",
          prompt: "Investigate this.",
          templateId: "research",
          topicFormat: "rolling_research",
          cadenceFamily: "rolling",
          cadenceOverrideMinutes: 60,
          countdownSeconds: 120,
          reason: "manual triage",
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    const payload = await response.json() as { data: { templateId: string } };

    assert.equal(response.status, 201);
    assert.equal(payload.data.templateId, "research");
    const topicInsert = db.batches.flat().find((entry) => entry.sql.includes("INSERT INTO topics"));
    assert.equal(topicInsert?.bindings[4], "research");
  });

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

  it("reconcile-presentation republishes redesigned verdict artifacts through the admin repair route", async () => {
    const db = new FakeDb();
    const cache = new FakeCache();
    const artifacts = new FakeBucket();
    const snapshots = new FakeBucket();
    queueAuthenticatedAgent(db);
    queuePresentationRepairReads(db);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/topics/top_1/reconcile-presentation", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "reconcile_unknown" }),
      }),
      buildEnv(db, {
        PUBLIC_CACHE: cache as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        SNAPSHOTS: snapshots as never,
        ENABLE_EPISTEMIC_SCORING: true,
      }),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        topicId: string;
        artifact: {
          artifactStatus: string;
          verdictHtmlKey: string | null;
          ogImageKey: string | null;
        };
      };
    };
    assert.equal(payload.data.topicId, "top_1");
    assert.equal(payload.data.artifact.artifactStatus, "published");
    assert.equal(payload.data.artifact.verdictHtmlKey, "artifacts/topics/top_1/verdict.html");
    assert.equal(payload.data.artifact.ogImageKey, "artifacts/topics/top_1/og.png");
    assert.ok(artifacts.writes.some((write) => write.key.endsWith("/verdict-presentation.json")));
    assert.ok(artifacts.writes.some((write) => write.key.endsWith("/verdict.html")));
    assert.ok(artifacts.writes.some((write) => write.key.endsWith("/og.png")));
    const presentationWrite = artifacts.writes.find((write) => write.key.endsWith("/verdict-presentation.json"));
    assert.ok(presentationWrite);
    const presentationPayload = JSON.parse(String(presentationWrite?.body ?? "{}")) as {
      claimGraph: { available: boolean; fallbackNote: string | null };
    };
    assert.equal(presentationPayload.claimGraph.available, false);
    assert.equal(
      presentationPayload.claimGraph.fallbackNote,
      "Claim graph unavailable because no claim rows were published for this topic.",
    );
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
      template_id: "debate",
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

  it("returns dashboard metrics for the requested date window", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    db.queueAll("FROM beings\n       WHERE substr(created_at, 1, 10) BETWEEN ? AND ?", [
      { metric_date: "2026-04-01", value: 2 },
    ]);
    db.queueAll("SELECT rollup_date, active_beings AS value", [
      { rollup_date: "2026-04-01", value: 3 },
    ]);
    db.queueAll("SELECT rollup_date, active_agents AS value", [
      { rollup_date: "2026-04-01", value: 4 },
    ]);
    db.queueAll("SELECT rollup_date, topics_created_count AS value", [
      { rollup_date: "2026-04-01", value: 5 },
    ]);
    db.queueAll("SELECT rollup_date, contributions_created_count AS value", [
      { rollup_date: "2026-04-01", value: 6 },
    ]);
    db.queueAll("SELECT rollup_date, verdicts_created_count AS value", [
      { rollup_date: "2026-04-01", value: 7 },
    ]);
    db.queueFirst("SELECT active_topics AS value", [{ value: 8 }]);
    db.queueAll("FROM topics\n       GROUP BY status", [{ status: "open", count: 2 }]);
    db.queueFirst("FROM text_restrictions", [{ value: 1 }]);
    db.queueFirst("FROM beings\n       WHERE status = 'inactive'", [{ value: 9 }]);
    db.queueFirst("FROM sessions\n       WHERE revoked_at IS NOT NULL", [{ value: 10 }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/dashboard/metrics?from=2026-04-01&to=2026-04-01", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { window: { from: string; to: string }; daily: { registrations: { points: Array<{ value: number }> } }; pointInTime: { activeTopics: { value: number } } } };
    assert.equal(payload.data.window.from, "2026-04-01");
    assert.equal(payload.data.window.to, "2026-04-01");
    assert.equal(payload.data.daily.registrations.points[0]?.value, 2);
    assert.equal(payload.data.pointInTime.activeTopics.value, 8);
  });

  it("creates and clears admin restrictions", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { requestCount: 2 });
    db.queueFirst("SELECT id, agent_id FROM beings WHERE id = ?", [{ id: "bng_1", agent_id: "agt_2" }]);
    db.queueFirst("FROM text_restrictions\n     WHERE id = ?", [
      {
        id: "rst_1",
        scope_type: "being",
        scope_id: "bng_1",
        mode: "queue",
        reason: "manual review",
        expires_at: null,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "rst_1",
        scope_type: "being",
        scope_id: "bng_1",
        mode: "queue",
        reason: "manual review",
        expires_at: null,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const app = createApiApp();
    const createResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/restrictions", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scopeType: "being",
          scopeId: "bng_1",
          mode: "queue",
          reason: "manual review",
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(createResponse.status, 201);
    assert.ok(db.executedRuns.some((run) => run.sql.includes("INSERT INTO text_restrictions")));
    assert.ok(db.executedRuns.some((run) => run.sql.includes("INSERT INTO admin_audit_log")));

    const clearResponse = await app.fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/restrictions/rst_1/clear", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "expired" }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(clearResponse.status, 200);
    assert.ok(db.executedRuns.some((run) => run.sql.includes("UPDATE text_restrictions SET expires_at = ?")));
  });

  it("updates being status through the admin endpoint", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    db.queueFirst("SELECT id, agent_id FROM beings WHERE id = ?", [{ id: "bng_1", agent_id: "agt_2" }]);
    db.queueFirst("SELECT\n        b.id,\n        b.agent_id,\n        a.name AS agent_name,", [
      {
        id: "bng_1",
        agent_id: "agt_2",
        agent_name: "Operator",
        handle: "alpha",
        display_name: "Alpha",
        bio: "Researcher",
        trust_tier: "trusted",
        status: "inactive",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z",
        can_publish: 1,
        can_join_topics: 1,
        can_suggest_topics: 1,
        can_open_topics: 0,
        owner_agent_email: "operator@example.com",
        owner_agent_active_session_count: 0,
        owner_agent_linked_external_identity_count: 0,
      },
      {
        id: "bng_1",
        agent_id: "agt_2",
        agent_name: "Operator",
        handle: "alpha",
        display_name: "Alpha",
        bio: "Researcher",
        trust_tier: "trusted",
        status: "inactive",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z",
        can_publish: 1,
        can_join_topics: 1,
        can_suggest_topics: 1,
        can_open_topics: 0,
        owner_agent_email: "operator@example.com",
        owner_agent_active_session_count: 0,
        owner_agent_linked_external_identity_count: 0,
      },
    ]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/beings/bng_1/status", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "inactive", reason: "manual hold" }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 200);
    assert.ok(db.executedRuns.some((run) => run.sql.includes("UPDATE beings SET status = ? WHERE id = ?")));
  });
});

describe("round instruction override admin routes", () => {
  it("upserts a valid override via PUT", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/debate/4", {
        method: "PUT",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundKind: "critique",
          goal: "Custom goal",
          guidance: "Custom guidance",
          priorRoundContext: "Custom context",
          qualityCriteria: ["Criterion 1"],
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { goal: string; templateId: string } };
    assert.equal(payload.data.goal, "Custom goal");
    assert.equal(payload.data.templateId, "debate");
  });

  it("rejects PUT with invalid templateId", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/nonexistent_template/0", {
        method: "PUT",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundKind: "propose",
          goal: "Goal",
          guidance: "Guidance",
          priorRoundContext: null,
          qualityCriteria: ["Criterion"],
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "invalid_template_id");
  });

  it("rejects PUT with sequenceIndex beyond template round count", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/debate/99", {
        method: "PUT",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundKind: "propose",
          goal: "Goal",
          guidance: "Guidance",
          priorRoundContext: null,
          qualityCriteria: ["Criterion"],
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "sequence_index_out_of_range");
  });

  it("rejects PUT with mismatched roundKind", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/debate/1", {
        method: "PUT",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundKind: "refine",  // debate index 1 is "vote"
          goal: "Goal",
          guidance: "Guidance",
          priorRoundContext: null,
          qualityCriteria: ["Criterion"],
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string };
    assert.equal(payload.code, "round_kind_mismatch");
  });

  it("deletes an override via DELETE", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/debate/1", {
        method: "DELETE",
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { deleted: boolean } };
    assert.equal(typeof payload.data.deleted, "boolean");
  });

  it("rejects non-admin access for PUT", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { email: "member@example.com" });
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/round-instructions/debate/1", {
        method: "PUT",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          roundKind: "critique",
          goal: "Goal",
          guidance: "Guidance",
          priorRoundContext: null,
          qualityCriteria: ["Criterion"],
        }),
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 403);
  });

  it("returns admin dashboard overview with headline counts, ops, and queues", async () => {
    const db = new FakeDb();
    const cache = new FakeCache();
    queueAuthenticatedAgent(db);

    // Query 1: topic headline counts (SUM CASE WHEN)
    db.queueFirst("SUM(CASE WHEN status IN", [{ open_topics: 5, stalled_topics: 1, closed_24h: 2 }]);
    // Query 2: headline counts (contributions, restrictions, agents, beings)
    db.queueFirst("quarantined_contributions", [{ quarantined_contributions: 3, active_restrictions: 1, new_agents_24h: 2, new_beings_24h: 4 }]);
    // Query 3: session online counts
    db.queueFirst("COUNT(DISTINCT agent_id) AS agents_online", [{ agents_online: 2, beings_active_now: 1 }]);
    // Query 4: topic status distribution
    db.queueAll("SELECT status, COUNT(*) AS count FROM topics GROUP BY status ORDER BY status ASC", [
      { status: "open", count: 3 },
      { status: "started", count: 2 },
    ]);
    // Query 5: quarantine items
    db.queueAll("c.visibility = 'quarantined'", [{
      contribution_id: "con_1",
      topic_id: "top_1",
      topic_title: "Topic one",
      being_handle: "alpha",
      body: "Some quarantined body text",
      guardrail_decision: "quarantine",
      submitted_at: "2026-04-01T00:00:00.000Z",
    }]);
    // Query 6: stalled topics
    db.queueAll("t.status = 'stalled'", [{
      topic_id: "top_2",
      title: "Stalled topic",
      domain_name: "Biology",
      status: "stalled",
      updated_at: "2026-04-01T00:00:00.000Z",
      contribution_count: 5,
    }]);
    // Query 7: recently closed topics
    db.queueAll("t.closed_at >= datetime", [{
      topic_id: "top_3",
      title: "Closed topic",
      domain_name: "Physics",
      closed_at: "2026-04-02T00:00:00.000Z",
      contribution_count: 10,
      artifact_status: "complete",
    }]);
    // Query 8: topics needing attention
    db.queueAll("NOT EXISTS", [{
      topic_id: "top_4",
      title: "Neglected topic",
      domain_name: "Chemistry",
      status: "open",
      updated_at: "2026-03-30T00:00:00.000Z",
      last_contribution_at: null,
      contribution_count: 0,
    }]);

    // KV helpers
    cache.values.set("snapshot-pending:top_9", JSON.stringify({ topicId: "top_9" }));
    cache.values.set("presentation-pending:top_7", JSON.stringify({ topicId: "top_7" }));

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/dashboard/overview", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db, { PUBLIC_CACHE: cache as never }),
      { waitUntil() {} } as never,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { data: {
      headline: Record<string, number>;
      ops: { snapshotPendingCount: number; presentationPendingCount: number; topicStatusDistribution: Array<{ status: string; count: number }> };
      queues: {
        quarantineItems: Array<{ contributionId: string; topicId: string; bodyExcerpt: string }>;
        stalledTopicItems: Array<{ topicId: string }>;
        recentlyClosedTopics: Array<{ topicId: string; artifactStatus: string | null }>;
        topicsNeedingAttention: Array<{ topicId: string; lastContributionAt: string | null; contributionCount: number }>;
      };
    } };

    // Headline counts
    assert.equal(payload.data.headline.openTopics, 5);
    assert.equal(payload.data.headline.stalledTopics, 1);
    assert.equal(payload.data.headline.topicsClosed24h, 2);
    assert.equal(payload.data.headline.quarantinedContributions, 3);
    assert.equal(payload.data.headline.activeRestrictions, 1);
    assert.equal(payload.data.headline.newAgents24h, 2);
    assert.equal(payload.data.headline.newBeings24h, 4);
    assert.equal(payload.data.headline.agentsOnline, 2);
    assert.equal(payload.data.headline.beingsActiveNow, 1);

    // Ops
    assert.equal(payload.data.ops.snapshotPendingCount, 1);
    assert.equal(payload.data.ops.presentationPendingCount, 1);
    assert.deepEqual(payload.data.ops.topicStatusDistribution, [
      { status: "open", count: 3 },
      { status: "started", count: 2 },
    ]);

    // Queues
    assert.equal(payload.data.queues.quarantineItems.length, 1);
    assert.equal(payload.data.queues.quarantineItems[0].contributionId, "con_1");
    assert.equal(payload.data.queues.quarantineItems[0].bodyExcerpt, "Some quarantined body text");

    assert.equal(payload.data.queues.stalledTopicItems.length, 1);
    assert.equal(payload.data.queues.stalledTopicItems[0].topicId, "top_2");

    assert.equal(payload.data.queues.recentlyClosedTopics.length, 1);
    assert.equal(payload.data.queues.recentlyClosedTopics[0].topicId, "top_3");
    assert.equal(payload.data.queues.recentlyClosedTopics[0].artifactStatus, "complete");

    assert.equal(payload.data.queues.topicsNeedingAttention.length, 1);
    assert.equal(payload.data.queues.topicsNeedingAttention[0].topicId, "top_4");
    assert.equal(payload.data.queues.topicsNeedingAttention[0].lastContributionAt, null);
    assert.equal(payload.data.queues.topicsNeedingAttention[0].contributionCount, 0);
  });

  it("rejects unauthenticated requests to admin dashboard overview", async () => {
    const db = new FakeDb();
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/dashboard/overview"),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 401);
  });

  it("rejects non-admin requests to admin dashboard overview", async () => {
    const db = new FakeDb();
    queueAuthenticatedAgent(db, { email: "user@example.com" });
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/internal/admin/dashboard/overview", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      { waitUntil() {} } as never,
    );
    assert.equal(response.status, 403);
  });
});
