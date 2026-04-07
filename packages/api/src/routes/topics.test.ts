import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { topicVerdictPresentationArtifactKey, verdictJsonCacheKey } from "@opndomain/shared";
import { createApiApp } from "../index.js";

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
    assert.ok(query?.sql.includes("WHERE t.status = ? AND d.slug = ? AND t.template_id = ?"));
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
    assert.ok(query?.sql.includes("WHERE t.status = ?"));
    assert.deepEqual(query?.bindings, ["open"]);
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
