import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MATCHMAKING_SWEEP_CRON, TOPIC_CANDIDATE_PROMOTION_CRON } from "@opndomain/shared";
import { parseApiEnv } from "./lib/env.js";
import worker from "./index.js";

class FakeBucket {
  constructor(private readonly log: string[]) {}

  async put(key: string, _body: string) {
    this.log.push(`bucket.put:${key}`);
  }

  async delete(key: string) {
    this.log.push(`bucket.delete:${key}`);
  }
}

class FakeCache {
  values = new Map<string, string>();

  constructor(private readonly log: string[]) {}

  async get(key: string) {
    this.log.push(`cache.get:${key}`);
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.log.push(`cache.put:${key}`);
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.log.push(`cache.delete:${key}`);
    this.values.delete(key);
  }

  async list({ prefix }: { prefix: string }) {
    this.log.push(`cache.list:${prefix}`);
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

  constructor(private readonly log: string[]) {}

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
  }

  prepare(sql: string) {
    return new FakePreparedStatement(sql, this);
  }

  async batch(_statements: FakePreparedStatement[]) {
    this.log.push("db.batch");
    return [];
  }

  consumeFirst<T>(sql: string): T | null {
    this.log.push(`db.first:${sql.slice(0, 48)}`);
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
    if (!entry) {
      return null;
    }
    const [fragment, rows] = entry;
    const [next, ...rest] = rows as T[];
    this.firstQueue.set(fragment, rest);
    return next ?? null;
  }

  consumeAll<T>(sql: string): T[] {
    this.log.push(`db.all:${sql.slice(0, 48)}`);
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    return (entry?.[1] as T[]) ?? [];
  }
}

function queueSnapshotAndPresentationReads(db: FakeDb) {
  db.queueFirst("SELECT\n          topics.id,", [
    {
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "energy",
      title: "Topic",
      prompt: "Prompt",
      status: "closed",
      closed_at: "2026-03-25T02:00:00.000Z",
    },
  ]);
  db.queueFirst("FROM topics\n      WHERE id = ?", [
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      topic_format: "scheduled_research",
      status: "closed",
      current_round_index: 0,
      min_distinct_participants: 3,
      countdown_seconds: null,
      change_sequence: 1,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      topic_format: "scheduled_research",
      status: "closed",
      current_round_index: 0,
      min_distinct_participants: 3,
      countdown_seconds: null,
      change_sequence: 1,
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
  db.queueAll("FROM rounds r\n      LEFT JOIN round_configs", [{
    id: "rnd_1",
    sequence_index: 0,
    round_kind: "propose",
    status: "completed",
    starts_at: "2026-03-25T00:00:00.000Z",
    ends_at: "2026-03-25T01:00:00.000Z",
    reveal_at: "2026-03-25T00:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueAll("b.handle AS being_handle,\n        c.body_clean,", [{
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
    reveal_at: "2026-03-25T00:00:00.000Z",
    round_visibility: "open",
  }]);
  const verdictRow = {
    confidence: "moderate",
    terminalization_mode: "degraded_template",
    summary: "summary",
    verdict_outcome: null,
    positions_json: null,
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
  };
  // Queued twice: once consumed by syncTopicSnapshots, once by reconcileTopicPresentation
  db.queueFirst("FROM verdicts WHERE topic_id = ?", [verdictRow, verdictRow]);
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", [{ count: 1 }, { count: 1 }]);
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", [{ count: 1 }, { count: 1 }]);
  db.queueAll("FROM topics\n      WHERE status IN ('open', 'countdown')", []);
  db.queueAll("FROM rounds r\n      INNER JOIN topics t ON t.id = r.topic_id", []);
  db.queueAll("SELECT id FROM topics WHERE status = 'started'", []);
}

describe("scheduled worker", () => {
  it("drains snapshot and presentation retry queues before the lifecycle sweep", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);
    const snapshots = new FakeBucket(log);
    const artifacts = new FakeBucket(log);
    cache.values.set("snapshot-pending:top_1", JSON.stringify({ topicId: "top_1" }));
    cache.values.set("presentation-pending:top_1", JSON.stringify({ topicId: "top_1" }));
    queueSnapshotAndPresentationReads(db);

    const waits: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: MATCHMAKING_SWEEP_CRON, scheduledTime: new Date("2026-03-26T12:00:00.000Z").getTime() } as ScheduledController,
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: artifacts as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise);
        },
      } as ExecutionContext,
    );
    await Promise.all(waits);

    const snapshotDeleteIndex = log.indexOf("cache.delete:snapshot-pending:top_1");
    const presentationDeleteIndex = log.indexOf("cache.delete:presentation-pending:top_1");
    const lifecycleIndex = log.findIndex((entry) => entry.startsWith("db.all:\n      SELECT id, domain_id"));

    assert.ok(snapshotDeleteIndex >= 0);
    assert.ok(presentationDeleteIndex >= 0);
    assert.ok(lifecycleIndex >= 0);
    assert.ok(snapshotDeleteIndex < lifecycleIndex);
    assert.ok(presentationDeleteIndex < lifecycleIndex);
  });

  it("purges expired magic links during the maintenance cron", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);
    const waits: Promise<unknown>[] = [];

    await worker.scheduled(
      { cron: "0 2 * * *", scheduledTime: new Date("2026-03-26T02:00:00.000Z").getTime() } as ScheduledController,
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: new FakeBucket(log) as never,
        PUBLIC_ARTIFACTS: new FakeBucket(log) as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise);
        },
      } as ExecutionContext,
    );
    await Promise.all(waits);

    assert.ok(db.runs.some((entry) => entry.sql.includes("DELETE FROM magic_links")));
    assert.equal(cache.values.get("cron/phase5-maintenance-stub"), "2026-03-26T02:00:00.000Z");
  });

  it("runs topic candidate promotion on the dedicated promotion cron", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);
    db.queueAll("SELECT d.id", [{ id: "dom_1" }]);
    db.queueFirst("FROM topic_candidates", [{
      id: "tcand_1",
      source: "arxiv",
      source_id: "1234.5678",
      source_url: "https://arxiv.org/abs/1234.5678",
      domain_id: "dom_1",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate_v2",
      topic_format: "scheduled_research",
      cadence_family: "scheduled",
      cadence_override_minutes: 60,
      min_trust_tier: "supervised",
      status: "approved",
      priority_score: 10,
      published_at: null,
      promoted_topic_id: null,
      promotion_error: null,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM domains", [{
      id: "dom_1",
      slug: "energy",
      name: "Energy",
      description: null,
      status: "active",
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "energy",
      domain_name: "Energy",
      title: "Candidate",
      prompt: "Prompt",
      template_id: "debate_v2",
      topic_format: "scheduled_research",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 60,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: "2026-03-31T00:30:00.000Z",
      join_until: "2026-03-31T00:15:00.000Z",
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      change_sequence: 0,
      created_at: "2026-03-31T00:00:00.000Z",
      updated_at: "2026-03-31T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);

    const waits: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: TOPIC_CANDIDATE_PROMOTION_CRON, scheduledTime: new Date("2026-03-31T00:00:00.000Z").getTime() } as ScheduledController,
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: new FakeBucket(log) as never,
        PUBLIC_ARTIFACTS: new FakeBucket(log) as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise);
        },
      } as ExecutionContext,
    );
    await Promise.all(waits);

    assert.ok(log.includes("db.batch"));
    assert.equal(cache.values.get(`cron/last-run/${TOPIC_CANDIDATE_PROMOTION_CRON}`), "2026-03-31T00:00:00.000Z");
  });
});

describe("worker fetch env parsing", () => {
  it("exposes public cron heartbeat metadata through /meta/cron", async () => {
    const log: string[] = [];
    const cache = new FakeCache(log);
    cache.values.set("cron/last-run/* * * * *", "2026-03-25T00:00:00.000Z");
    cache.values.set("cron/last-run/*/1 * * * *", "2026-03-25T00:00:30.000Z");
    cache.values.set("cron/last-run/0 2 * * *", "2026-03-25T02:00:00.000Z");
    cache.values.set("cron/last-run/0 3 * * *", "2026-03-25T03:00:00.000Z");
    cache.values.set("cron/last-run/0 4 * * *", "2026-03-25T04:00:00.000Z");

    const response = await worker.fetch(
      new Request("https://api.opndomain.com/meta/cron"),
      {
        DB: new FakeDb(log) as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: new FakeBucket(log) as never,
        PUBLIC_ARTIFACTS: new FakeBucket(log) as never,
        TOPIC_STATE_DO: new FakeTopicStateNamespace({}) as never,
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
        ADMIN_ALLOWED_EMAILS: "admin@example.com",
        ADMIN_ALLOWED_CLIENT_IDS: "",
        ENABLE_SEMANTIC_SCORING: false,
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
        GOOGLE_OAUTH_CLIENT_ID: "",
        GOOGLE_OAUTH_CLIENT_SECRET: "",
        GITHUB_OAUTH_CLIENT_ID: "",
        GITHUB_OAUTH_CLIENT_SECRET: "",
        X_OAUTH_CLIENT_ID: "",
        X_OAUTH_CLIENT_SECRET: "",
        JWT_PRIVATE_KEY_PEM: "",
        JWT_PUBLIC_KEY_PEM: "",
      } as never,
      {
        waitUntil() {},
        passThroughOnException() {},
        props: {},
      } as unknown as ExecutionContext,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        heartbeats: Array<{ cron: string; lastRun: string | null }>;
      };
    };
    assert.deepEqual(
      payload.data.heartbeats.map((entry) => entry.cron),
      ["* * * * *", "*/1 * * * *", "0 2 * * *", "0 3 * * *", "0 4 * * *"],
    );
    assert.equal(payload.data.heartbeats[0]?.lastRun, "2026-03-25T00:00:00.000Z");
  });

  it("parses admin allowlist sets before routing requests", async () => {
    const log: string[] = [];
    const db = new FakeDb(log);
    const cache = new FakeCache(log);

    db.queueFirst("FROM sessions", [{
      id: "ses_1",
      agent_id: "agt_1",
      scope: "web_session",
      access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z",
      revoked_at: null,
    }]);
    db.queueFirst("FROM agents", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Admin",
      email: "admin@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z",
      trust_tier: "supervised",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM topics GROUP BY status", [{ status: "started", count: 1 }]);
    db.queueAll("SELECT id FROM topics WHERE status = 'started' ORDER BY updated_at DESC", [{ id: "top_1" }]);

    const response = await worker.fetch(
      new Request("https://api.opndomain.com/v1/internal/health", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      {
        DB: db as never,
        PUBLIC_CACHE: cache as never,
        SNAPSHOTS: new FakeBucket(log) as never,
        PUBLIC_ARTIFACTS: new FakeBucket(log) as never,
        TOPIC_STATE_DO: new FakeTopicStateNamespace({
          top_1: {
            acceptLatencyMsSamples: [9, 11],
            recomputeDurationMsSamples: [14],
            snapshotDurationMsSamples: [22],
            drainThroughputSamples: [{ contributionsPerFlush: 3, votesPerFlush: 1, auxRowsPerFlush: 0 }],
            pendingContributionBacklog: 2,
            pendingVoteBacklog: 1,
            pendingAuxBacklog: 0,
            semanticBacklog: 1,
            publicationFreshnessLagMs: 18,
          },
        }) as never,
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
        ADMIN_ALLOWED_EMAILS: "admin@example.com",
        ADMIN_ALLOWED_CLIENT_IDS: "",
        ENABLE_SEMANTIC_SCORING: false,
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
        GOOGLE_OAUTH_CLIENT_ID: "",
        GOOGLE_OAUTH_CLIENT_SECRET: "",
        GITHUB_OAUTH_CLIENT_ID: "",
        GITHUB_OAUTH_CLIENT_SECRET: "",
        X_OAUTH_CLIENT_ID: "",
        X_OAUTH_CLIENT_SECRET: "",
        JWT_PRIVATE_KEY_PEM: "",
        JWT_PUBLIC_KEY_PEM: "",
      } as never,
      {
        waitUntil() {},
        passThroughOnException() {},
        props: {},
      } as unknown as ExecutionContext,
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      data: {
        topicStatusDistribution: Array<{ status: string; count: number }>;
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
    assert.deepEqual(payload.data.topicStatusDistribution, [{ status: "started", count: 1 }]);
    assert.deepEqual(payload.data.scaleTelemetry, {
      acceptLatencyMs: { p50: 9, p95: 11, max: 11 },
      pendingContributionBacklog: 2,
      pendingVoteBacklog: 1,
      pendingAuxBacklog: 0,
      drainThroughput: { contributionsPerFlush: 3, votesPerFlush: 1, auxRowsPerFlush: 0 },
      recomputeDurationMs: { p50: 14, p95: 14, max: 14 },
      semanticBacklog: 1,
      snapshotDurationMs: { p50: 22, p95: 22, max: 22 },
      publicationFreshnessLagMs: { p95: 18, max: 18 },
    });
  });

});
