import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { topicVerdictPresentationArtifactKey, verdictJsonCacheKey } from "@opndomain/shared";
import { createApiApp } from "../index.js";
import { signJwt, verifyJwt } from "../lib/jwt.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

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
    return this.db.consumeFirst<T>(this.sql, this.bindings);
  }

  async all<T>() {
    return { results: this.db.consumeAll<T>(this.sql, this.bindings) };
  }

  async run() {
    this.db.runs.push({ sql: this.sql, bindings: this.bindings });
    return { success: true };
  }
}

class FakeDb {
  readonly allCalls: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly runs: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly batches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
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

  consumeFirst<T>(sql: string, _bindings: unknown[] = []): T | null {
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

  consumeAll<T>(sql: string, bindings: unknown[] = []): T[] {
    this.allCalls.push({ sql, bindings });
    const entry = Array.from(this.allQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((a, b) => b[0].length - a[0].length)[0];
    return (entry?.[1] as T[]) ?? [];
  }
}

class FakeKv {
  readonly values = new Map<string, string>();

  async get(key: string, type?: "text" | "json") {
    const value = this.values.get(key) ?? null;
    if (value === null) {
      return null;
    }
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

class FakeR2Bucket {
  readonly objects = new Map<string, string>();

  async get(key: string) {
    const value = this.objects.get(key);
    if (value === undefined) {
      return null;
    }
    return {
      async json() {
        return JSON.parse(value);
      },
    };
  }
}

function buildEnv(db: FakeDb, options?: { cache?: FakeKv; artifacts?: FakeR2Bucket }) {
  return {
    DB: db as never,
    PUBLIC_CACHE: (options?.cache ?? new FakeKv()) as never,
    PUBLIC_ARTIFACTS: (options?.artifacts ?? new FakeR2Bucket()) as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {} as never,
    SESSION_COOKIE_NAME: "opn_session",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_PUBLIC_KEY_PEM: publicKey,
    JWT_PRIVATE_KEY_PEM: privateKey,
    ADMIN_ALLOWED_EMAILS_SET: new Set<string>(),
    ADMIN_ALLOWED_CLIENT_IDS_SET: new Set<string>(),
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: false,
    API_ORIGIN: "https://api.opndomain.com",
  } as never;
}

function queueAuthenticatedTopicCreator(db: FakeDb, options?: {
  accountClass?: string;
  canOpenTopics?: number;
  trustTier?: string;
  requestCount?: number;
}) {
  const requestCount = options?.requestCount ?? 1;
  db.queueFirst("FROM sessions", Array.from({ length: requestCount }, () => ({
    id: "ses_1",
    agent_id: "agt_1",
    scope: "web_session",
    refresh_token_hash: null,
    access_token_id: "atk_1",
    expires_at: "3026-01-01T00:00:00.000Z",
    revoked_at: null,
  })));
  db.queueFirst("FROM agents", Array.from({ length: requestCount }, () => ({
    id: "agt_1",
    client_id: "cli_1",
    name: "Agent",
    email: "agent@example.com",
    email_verified_at: "2026-03-25T00:00:00.000Z",
    account_class: options?.accountClass ?? "verified_participant",
    trust_tier: "verified",
    status: "active",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  })));
  db.queueFirst("FROM beings b", [{
    id: "bng_1",
    agent_id: "agt_1",
    handle: "alpha",
    display_name: "Alpha",
    bio: null,
    trust_tier: options?.trustTier ?? "verified",
    status: "active",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    can_open_topics: options?.canOpenTopics ?? 1,
  }]);
}

function queueCreatedTopicReadback(db: FakeDb, templateId: string) {
  db.queueFirst("FROM domains\n     WHERE id = ?", [{
    id: "dom_1",
    slug: "ai-safety",
    name: "AI Safety",
    description: null,
    status: "active",
    parent_domain_id: null,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  }]);
  db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", [{
    id: "top_created",
    domain_id: "dom_1",
    domain_slug: "ai-safety",
    domain_name: "AI Safety",
    title: "New Topic",
    prompt: "Debate this.",
    template_id: templateId,
    topic_format: "scheduled_research",
    topic_source: "manual_user",
    status: "open",
    cadence_family: "scheduled",
    cadence_preset: null,
    cadence_override_minutes: 60,
    min_distinct_participants: 3,
    countdown_seconds: null,
    min_trust_tier: "supervised",
    visibility: "public",
    current_round_index: 0,
    starts_at: "2026-03-25T01:00:00.000Z",
    join_until: "2026-03-25T00:45:00.000Z",
    countdown_started_at: null,
    stalled_at: null,
    closed_at: null,
    change_sequence: 0,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  }]);
  db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
    {
      id: "rnd_1",
      topic_id: "top_created",
      sequence_index: 0,
      round_kind: "propose",
      status: "pending",
      starts_at: "2026-03-25T01:00:00.000Z",
      ends_at: "2026-03-25T02:00:00.000Z",
      reveal_at: "2026-03-25T02:00:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    },
  ]);
}

function queueAuthenticatedTopicContextReader(db: FakeDb, requestCount = 1) {
  db.queueFirst("FROM sessions", Array.from({ length: requestCount }, () => ({
    id: "ses_1",
    agent_id: "agt_1",
    scope: "web_session",
    refresh_token_hash: null,
    access_token_id: "atk_1",
    expires_at: "3026-01-01T00:00:00.000Z",
    revoked_at: null,
  })));
  db.queueFirst("FROM agents", Array.from({ length: requestCount }, () => ({
    id: "agt_1",
    client_id: "cli_1",
    name: "Agent",
    email: "agent@example.com",
    email_verified_at: "2026-03-25T00:00:00.000Z",
    account_class: "verified_participant",
    trust_tier: "verified",
    status: "active",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  })));
  db.queueAll("SELECT id FROM beings WHERE agent_id = ?", [{ id: "bng_1" }]);
}

function queueTopicContextReadback(db: FakeDb, requestCount = 1) {
  db.queueFirst("FROM topics t\n      INNER JOIN domains d ON d.id = t.domain_id", Array.from({ length: requestCount }, () => ({
    id: "top_1",
    domain_id: "dom_1",
    domain_slug: "ai-safety",
    domain_name: "AI Safety",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate",
    topic_format: "scheduled_research",
    topic_source: "manual_user",
    status: "started",
    cadence_family: "quality_gated",
    cadence_preset: "3h",
    cadence_override_minutes: null,
    min_distinct_participants: 3,
    countdown_seconds: null,
    min_trust_tier: "supervised",
    visibility: "public",
    current_round_index: 1,
    starts_at: null,
    join_until: null,
    countdown_started_at: null,
    stalled_at: null,
    closed_at: null,
    change_sequence: 9,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  })));
  db.queueAll("FROM rounds\n      WHERE topic_id = ?", [
    {
      id: "rnd_0",
      topic_id: "top_1",
      sequence_index: 0,
      round_kind: "propose",
      status: "completed",
      starts_at: "2026-03-25T00:00:00.000Z",
      ends_at: "2026-03-25T00:30:00.000Z",
      reveal_at: "2026-03-25T00:30:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:30:00.000Z",
    },
    {
      id: "rnd_1",
      topic_id: "top_1",
      sequence_index: 1,
      round_kind: "vote",
      status: "active",
      starts_at: "2026-03-25T00:30:00.000Z",
      ends_at: "2026-03-25T01:00:00.000Z",
      reveal_at: "2026-03-25T01:00:00.000Z",
      created_at: "2026-03-25T00:30:00.000Z",
      updated_at: "2026-03-25T00:30:00.000Z",
    },
  ]);
  db.queueAll("FROM topic_members tm", [{
    being_id: "bng_1",
    handle: "alpha",
    display_name: "Alpha",
    role: "participant",
    status: "active",
  }]);
  db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id", [{
    id: "cnt_1",
    round_id: "rnd_0",
    sequence_index: 0,
    being_id: "bng_1",
    being_handle: "alpha",
    body_clean: "Visible transcript entry",
    visibility: "normal",
    submitted_at: "2026-03-25T00:10:00.000Z",
    heuristic_score: 0.5,
    live_score: 0.5,
    final_score: 0.5,
    reveal_at: "2026-03-25T00:30:00.000Z",
    round_kind: "propose",
    round_visibility: "open",
  }]);
  db.queueFirst("FROM round_configs", [{
    config_json: JSON.stringify({
      roundKind: "vote",
      sequenceIndex: 1,
      enrollmentType: "open",
      visibility: "sealed",
      completionStyle: "aggressive",
      voteRequired: false,
      voteTargetPolicy: "prior_round",
      minVotesPerActor: 0,
      maxVotesPerActor: 1,
      fallbackChain: [],
      terminal: false,
      phase2Execution: {
        completionMode: "deadline_only",
        enrollmentMode: "topic_members_only",
        note: "test",
      },
    }),
  }]);
  db.queueAll("WHERE topic_id = ?\n                AND round_id = ?", []);
  db.queueAll("FROM votes\n              WHERE round_id = ? AND voter_being_id = ?", []);
  db.queueAll("SELECT c.id, r.sequence_index, c.body_clean, c.model_provider, c.model_name", []);
}

describe("topic routes", () => {
  it("passes validated status and domain filters into listTopics", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_1",
      title: "Topic",
      status: "started",
      topic_source: "manual_user",
      prompt: "Prompt",
      template_id: "debate",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      member_count: 7,
      round_count: 4,
      current_round_index: 0,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?status=started&domain=ai-safety&templateId=debate"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: Array<{ id: string; templateId: string; memberCount: number }> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0]?.templateId, "debate");
    assert.equal(payload.data[0]?.memberCount, 7);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.archived_at IS NULL AND t.status = ? AND d.slug = ? AND t.template_id = ?"));
    assert.deepEqual(query?.bindings, ["started", "ai-safety", "debate"]);
  });

  it("lists open topics without transcript fields and applies the open status filter", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_open",
      title: "Open topic",
      status: "open",
      topic_source: "manual_user",
      prompt: "Prompt",
      template_id: "research",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      member_count: 3,
      round_count: 2,
      current_round_index: 0,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?status=open"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: Array<{ id: string; status: string }> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    assert.equal(payload.data[0]?.id, "top_open");
    assert.equal(payload.data[0]?.status, "open");
    assert.equal((payload.data[0] as { roundCount?: number }).roundCount, 2);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.archived_at IS NULL AND t.status = ?"));
    assert.deepEqual(query?.bindings, ["open"]);
  });

  it("mints a short-lived ws-ticket with correct scope and claims", async () => {
    const db = new FakeDb();
    // Auth: session + agent for authenticateRequest
    db.queueFirst("FROM sessions", [{
      id: "ses_1", agent_id: "agt_1", scope: "web_session",
      refresh_token_hash: null, access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z", revoked_at: null,
    }]);
    db.queueFirst("FROM agents", [{
      id: "agt_1", client_id: "cli_1", name: "Agent", email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z", account_class: "verified_participant",
      trust_tier: "verified", status: "active",
      created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    // assertAgentOwnsBeing
    db.queueFirst("FROM beings WHERE id = ?", [{ id: "bng_1" }]);
    // isActiveTopicMember
    db.queueFirst("FROM topic_members WHERE topic_id", [{ count: 1 }]);

    const env = buildEnv(db);
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/ws-ticket", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ beingId: "bng_1" }),
      }),
      env,
      {} as never,
    );
    const payload = await response.json() as { ticket: string; expiresIn: number; url: string };

    assert.equal(response.status, 200);
    assert.equal(payload.expiresIn, 30);
    assert.ok(payload.ticket);
    assert.ok(payload.url.includes("ws://") || payload.url.includes("wss://"));
    assert.ok(payload.url.includes("/v1/topics/top_1/ws?ticket="));

    const claims = await verifyJwt(env as never, payload.ticket);
    assert.equal(claims.scope, "ws_ticket");
    assert.equal(claims.topic_id, "top_1");
    assert.equal(claims.being_id, "bng_1");
    assert.equal(claims.sub, "agt_1");
    assert.ok(claims.exp - claims.iat <= 30);
  });

  it("rejects ws-ticket when being is not an active topic member", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM sessions", [{
      id: "ses_1", agent_id: "agt_1", scope: "web_session",
      refresh_token_hash: null, access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z", revoked_at: null,
    }]);
    db.queueFirst("FROM agents", [{
      id: "agt_1", client_id: "cli_1", name: "Agent", email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z", account_class: "verified_participant",
      trust_tier: "verified", status: "active",
      created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueFirst("FROM beings WHERE id = ?", [{ id: "bng_1" }]);
    // No membership row queued — isActiveTopicMember returns false

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/ws-ticket", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ beingId: "bng_1" }),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 403);
    assert.equal(payload.error, "not_a_member");
  });

  it("rejects ws-ticket when beingId is missing", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM sessions", [{
      id: "ses_1", agent_id: "agt_1", scope: "web_session",
      refresh_token_hash: null, access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z", revoked_at: null,
    }]);
    db.queueFirst("FROM agents", [{
      id: "agt_1", client_id: "cli_1", name: "Agent", email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z", account_class: "verified_participant",
      trust_tier: "verified", status: "active",
      created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/ws-ticket", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 400);
    assert.equal(payload.error, "missing_being_id");
  });

  it("rejects ws upgrade without a ticket", async () => {
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/ws", {
        headers: { upgrade: "websocket" },
      }),
      buildEnv(new FakeDb()),
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 401);
    assert.equal(payload.error, "missing_ticket");
  });

  it("rejects ws upgrade when ticket has wrong scope", async () => {
    const env = buildEnv(new FakeDb());
    const now = Math.floor(Date.now() / 1000);
    const ticket = await signJwt(env as never, {
      iss: "https://api.opndomain.com",
      aud: "https://api.opndomain.com",
      sub: "agt_1",
      scope: "web_session",
      exp: now + 30,
      iat: now,
      jti: "wst_wrong",
      topic_id: "top_1",
      being_id: "bng_1",
    });

    const response = await createApiApp().fetch(
      new Request(`https://api.opndomain.com/v1/topics/top_1/ws?ticket=${encodeURIComponent(ticket)}`, {
        headers: { upgrade: "websocket" },
      }),
      env,
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 403);
    assert.equal(payload.error, "invalid_ticket");
  });

  it("rejects ws upgrade when ticket topicId does not match route", async () => {
    const env = buildEnv(new FakeDb());
    const now = Math.floor(Date.now() / 1000);
    const ticket = await signJwt(env as never, {
      iss: "https://api.opndomain.com",
      aud: "https://api.opndomain.com",
      sub: "agt_1",
      scope: "ws_ticket",
      exp: now + 30,
      iat: now,
      jti: "wst_mismatch",
      topic_id: "top_other",
      being_id: "bng_1",
    });

    const response = await createApiApp().fetch(
      new Request(`https://api.opndomain.com/v1/topics/top_1/ws?ticket=${encodeURIComponent(ticket)}`, {
        headers: { upgrade: "websocket" },
      }),
      env,
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 403);
    assert.equal(payload.error, "invalid_ticket");
  });

  it("rejects ws upgrade without websocket upgrade header", async () => {
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/ws?ticket=foo"),
      buildEnv(new FakeDb()),
      {} as never,
    );
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 426);
    assert.equal(payload.error, "upgrade_required");
  });

  it("rejects invalid topic status filters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?status=invalid"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_topic_status");
    assert.equal(db.allCalls.length, 0);
  });

  it("rejects invalid template id filters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?templateId=invalid"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_template_id");
    assert.equal(db.allCalls.length, 0);
  });

  it("rejects empty domain filters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?domain=%20%20%20"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_domain");
    assert.equal(db.allCalls.length, 0);
  });

  it("rejects public topic creation for non-debate templates", async () => {
    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "New Topic",
          prompt: "Debate this.",
          templateId: "research",
          topicFormat: "scheduled_research",
        }),
      }),
      buildEnv(new FakeDb()),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_request");
  });

  it("creates public debate topics for authorized agents", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicCreator(db);
    queueCreatedTopicReadback(db, "debate");

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "New Topic",
          prompt: "Debate this.",
          templateId: "debate",
          topicFormat: "scheduled_research",
          cadenceOverrideMinutes: 60,
          startsAt: "2026-03-25T01:00:00.000Z",
          joinUntil: "2026-03-25T00:45:00.000Z",
        }),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: { templateId: string } };

    assert.equal(response.status, 201);
    assert.equal(payload.data.templateId, "debate");
    const topicInsert = db.batches.flat().find((entry) => entry.sql.includes("INSERT INTO topics"));
    assert.equal(topicInsert?.bindings[4], "debate");
  });

  it("creates a public debate topic with an explicit beingId owned by the agent", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicCreator(db);
    queueCreatedTopicReadback(db, "debate");

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "New Topic",
          prompt: "Debate this.",
          templateId: "debate",
          topicFormat: "scheduled_research",
          beingId: "bng_1",
        }),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: { templateId: string } };

    assert.equal(response.status, 201);
    assert.equal(payload.data.templateId, "debate");
  });

  it("rejects create-topic when beingId belongs to another agent", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM sessions", [{
      id: "ses_1",
      agent_id: "agt_1",
      scope: "web_session",
      refresh_token_hash: null,
      access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z",
      revoked_at: null,
    }]);
    db.queueFirst("FROM agents", [{
      id: "agt_1",
      client_id: "cli_1",
      name: "Agent",
      email: "agent@example.com",
      email_verified_at: "2026-03-25T00:00:00.000Z",
      account_class: "verified_participant",
      trust_tier: "verified",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueFirst("FROM beings b", [{
      id: "bng_other",
      agent_id: "agt_other",
      handle: "beta",
      display_name: "Beta",
      bio: null,
      trust_tier: "verified",
      status: "active",
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
      can_open_topics: 1,
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "New Topic",
          prompt: "Debate this.",
          templateId: "debate",
          topicFormat: "scheduled_research",
          beingId: "bng_other",
        }),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 403);
    assert.equal(payload.code, "being_not_eligible");
  });

  it("forbids public topic creation when the agent lacks a verified-trust opener being", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicCreator(db, { trustTier: "supervised" });

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics", {
        method: "POST",
        headers: {
          cookie: "opn_session=ses_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainId: "dom_1",
          title: "New Topic",
          prompt: "Debate this.",
          templateId: "debate",
          topicFormat: "scheduled_research",
        }),
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string; message: string };

    assert.equal(response.status, 403);
    assert.equal(payload.code, "forbidden");
    assert.match(payload.message, /verified-trust beings/i);
  });

  it("records a topic view only on the explicit beacon endpoint", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      status: "started",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: null,
      min_distinct_participants: 3,
      countdown_seconds: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 0,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/views", { method: "POST" }),
      buildEnv(db),
      {} as never,
    );

    assert.equal(response.status, 204);
    assert.ok(db.runs.some((entry) => entry.sql.includes("SET view_count = COALESCE(view_count, 0) + 1")));
  });

  it("requires authentication for transcript reads", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/transcript?limit=1"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 401);
    assert.equal(payload.code, "unauthorized");
  });

  it("returns split shared topic context", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicContextReader(db);
    queueTopicContextReadback(db);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/context/shared", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: { id: string; transcript: Array<{ id: string }>; currentRoundConfig: { roundKind: string }; ownVoteStatus?: unknown } };

    assert.equal(response.status, 200);
    assert.equal(payload.data.id, "top_1");
    assert.equal(payload.data.transcript.length, 1);
    assert.equal(payload.data.currentRoundConfig.roundKind, "vote");
    assert.equal("ownVoteStatus" in payload.data, false);
  });

  it("reuses cached shared topic context across requests for the same change sequence", async () => {
    const db = new FakeDb();
    const cache = new FakeKv();
    queueAuthenticatedTopicContextReader(db, 2);
    queueTopicContextReadback(db, 2);

    const first = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/context/shared", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db, { cache }),
      {} as never,
    );
    const second = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/context/shared", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db, { cache }),
      {} as never,
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(
      db.allCalls.filter((call) => call.sql.includes("FROM rounds\n      WHERE topic_id = ?")).length,
      1,
    );
    assert.ok(cache.values.has("topic-context-shared:top_1:seq:9"));
  });

  it("returns split per-being topic context", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicContextReader(db);
    queueTopicContextReadback(db);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/context/mine?beingId=bng_1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: { ownContributionStatus: unknown[]; ownVoteStatus: unknown[]; voteTargets: unknown[]; pendingProvenanceContributions: unknown[] } };

    assert.equal(response.status, 200);
    assert.deepEqual(payload.data.ownContributionStatus, []);
    assert.deepEqual(payload.data.ownVoteStatus, []);
    assert.deepEqual(payload.data.voteTargets, []);
    assert.deepEqual(payload.data.pendingProvenanceContributions, []);
  });

  it("requires beingId for split per-being topic context", async () => {
    const db = new FakeDb();
    queueAuthenticatedTopicContextReader(db);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/context/mine", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "missing_being_id");
  });

  it("rejects tampered transcript cursors", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM sessions", [
      {
        id: "ses_1",
        agent_id: "agt_1",
        scope: "web_session",
        refresh_token_hash: null,
        access_token_id: "atk_1",
        expires_at: "3026-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      {
        id: "ses_1",
        agent_id: "agt_1",
        scope: "web_session",
        refresh_token_hash: null,
        access_token_id: "atk_1",
        expires_at: "3026-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    ]);
    db.queueFirst("FROM agents", [
      {
        id: "agt_1",
        client_id: "cli_1",
        name: "Agent",
        email: "agent@example.com",
        email_verified_at: "2026-03-25T00:00:00.000Z",
        account_class: "verified_participant",
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "agt_1",
        client_id: "cli_1",
        name: "Agent",
        email: "agent@example.com",
        email_verified_at: "2026-03-25T00:00:00.000Z",
        account_class: "verified_participant",
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueFirst("FROM topics t", [
      {
        id: "top_1",
        domain_id: "dom_1",
        domain_slug: "ai-safety",
        domain_name: "AI Safety",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate",
        topic_format: "scheduled_research",
        topic_source: "manual_user",
        status: "started",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_distinct_participants: 3,
        countdown_seconds: null,
        min_trust_tier: "supervised",
        visibility: "public",
        current_round_index: 0,
        change_sequence: 2,
        starts_at: null,
        join_until: null,
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "top_1",
        domain_id: "dom_1",
        domain_slug: "ai-safety",
        domain_name: "AI Safety",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate",
        topic_format: "scheduled_research",
        topic_source: "manual_user",
        status: "started",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_distinct_participants: 3,
        countdown_seconds: null,
        min_trust_tier: "supervised",
        visibility: "public",
        current_round_index: 0,
        change_sequence: 2,
        starts_at: null,
        join_until: null,
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id", [
      {
        id: "cnt_1",
        round_id: "rnd_1",
        being_id: "bng_1",
        being_handle: "alpha",
        body_clean: "Body 1",
        visibility: "normal",
        submitted_at: "2026-03-25T00:01:00.000Z",
        heuristic_score: 80,
        live_score: 82,
        final_score: 88,
        reveal_at: "2026-03-25T00:00:00.000Z",
        sequence_index: 0,
        round_kind: "propose",
        round_status: "completed",
        round_visibility: "open",
      },
      {
        id: "cnt_2",
        round_id: "rnd_1",
        being_id: "bng_2",
        being_handle: "bravo",
        body_clean: "Body 2",
        visibility: "normal",
        submitted_at: "2026-03-25T00:02:00.000Z",
        heuristic_score: 70,
        live_score: 72,
        final_score: 75,
        reveal_at: "2026-03-25T00:00:00.000Z",
        sequence_index: 0,
        round_kind: "propose",
        round_status: "completed",
        round_visibility: "open",
      },
      {
        id: "cnt_1",
        round_id: "rnd_1",
        being_id: "bng_1",
        being_handle: "alpha",
        body_clean: "Body 1",
        visibility: "normal",
        submitted_at: "2026-03-25T00:01:00.000Z",
        heuristic_score: 80,
        live_score: 82,
        final_score: 88,
        reveal_at: "2026-03-25T00:00:00.000Z",
        sequence_index: 0,
        round_kind: "propose",
        round_status: "completed",
        round_visibility: "open",
      },
      {
        id: "cnt_2",
        round_id: "rnd_1",
        being_id: "bng_2",
        being_handle: "bravo",
        body_clean: "Body 2",
        visibility: "normal",
        submitted_at: "2026-03-25T00:02:00.000Z",
        heuristic_score: 70,
        live_score: 72,
        final_score: 75,
        reveal_at: "2026-03-25T00:00:00.000Z",
        sequence_index: 0,
        round_kind: "propose",
        round_status: "completed",
        round_visibility: "open",
      },
    ]);

    const first = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/transcript?limit=1", {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      {} as never,
    );
    const firstPayload = await first.json() as { data: { page: { nextCursor: string } } };
    const nextCursor = firstPayload.data.page.nextCursor;
    const tamperedCursor = `${nextCursor.slice(0, -1)}x`;

    const second = await createApiApp().fetch(
      new Request(`https://api.opndomain.com/v1/topics/top_1/transcript?cursor=${encodeURIComponent(tamperedCursor)}`, {
        headers: { cookie: "opn_session=ses_1" },
      }),
      buildEnv(db),
      {} as never,
    );
    const secondPayload = await second.json() as { code: string };

    assert.equal(first.status, 200);
    assert.equal(second.status, 400);
    assert.equal(secondPayload.code, "invalid_transcript_cursor");
  });

  it("returns a published verdict from KV cache", async () => {
    const db = new FakeDb();
    const cache = new FakeKv();
    await cache.put(verdictJsonCacheKey("top_1"), JSON.stringify({
      topicId: "top_1",
      title: "Topic",
      domain: "ai-safety",
      publishedAt: "2026-03-25T00:00:00.000Z",
      status: "published",
      headline: { label: "Verdict", text: "Result", stance: "mixed" },
      summary: "Result",
      editorialBody: null,
      confidence: { label: "moderate", score: 0.68, explanation: "Explanation" },
      scoreBreakdown: {
        completedRounds: 3,
        totalRounds: 3,
        participantCount: 4,
        contributionCount: 12,
        terminalizationMode: "full_template",
      },
      narrative: [],
      highlights: [],
      claimGraph: { available: false, nodes: [], edges: [], fallbackNote: "Unavailable" },
    }));

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/verdict"),
      buildEnv(db, { cache }),
      {} as never,
    );
    const payload = await response.json() as { data: { status: string; verdict: { topicId: string } } };

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, "published");
    assert.equal(payload.data.verdict.topicId, "top_1");
  });

  it("returns pending verdict status for active topics", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT t.status, ta.artifact_status", [{ status: "started", artifact_status: null }]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/verdict"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: { status: string; topicStatus: string; artifactStatus: null } };

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, "pending");
    assert.equal(payload.data.topicStatus, "started");
    assert.equal(payload.data.artifactStatus, null);
  });

  it("returns 404 for missing verdict topics", async () => {
    const db = new FakeDb();
    db.queueFirst("SELECT t.status, ta.artifact_status", [null]);

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/missing/verdict"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 404);
    assert.equal(payload.code, "not_found");
  });

  it("backfills KV from R2 when a published verdict cache entry is missing", async () => {
    const db = new FakeDb();
    const cache = new FakeKv();
    const artifacts = new FakeR2Bucket();
    db.queueFirst("SELECT t.status, ta.artifact_status", [{ status: "closed", artifact_status: "published" }]);
    artifacts.objects.set(topicVerdictPresentationArtifactKey("top_1"), JSON.stringify({
      topicId: "top_1",
      title: "Topic",
      domain: "ai-safety",
      publishedAt: "2026-03-25T00:00:00.000Z",
      status: "published",
      headline: { label: "Verdict", text: "Result", stance: "mixed" },
      summary: "Result",
      editorialBody: null,
      confidence: { label: "moderate", score: 0.68, explanation: "Explanation" },
      scoreBreakdown: {
        completedRounds: 3,
        totalRounds: 3,
        participantCount: 4,
        contributionCount: 12,
        terminalizationMode: "full_template",
      },
      narrative: [],
      highlights: [],
      claimGraph: { available: false, nodes: [], edges: [], fallbackNote: "Unavailable" },
    }));

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/verdict"),
      buildEnv(db, { cache, artifacts }),
      {} as never,
    );
    const payload = await response.json() as { data: { status: string; verdict: { topicId: string } } };

    assert.equal(response.status, 200);
    assert.equal(payload.data.status, "published");
    assert.equal(payload.data.verdict.topicId, "top_1");
    assert.ok(cache.values.has(verdictJsonCacheKey("top_1")));
  });
});
