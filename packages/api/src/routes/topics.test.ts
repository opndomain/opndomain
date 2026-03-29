import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
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
    return { success: true };
  }
}

class FakeDb {
  readonly allCalls: Array<{ sql: string; bindings: unknown[] }> = [];
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

function buildEnv(db: FakeDb) {
  return {
    DB: db as never,
    PUBLIC_CACHE: {} as never,
    PUBLIC_ARTIFACTS: {} as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {} as never,
    SESSION_COOKIE_NAME: "opn_session",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_PUBLIC_KEY_PEM: publicKey,
    JWT_PRIVATE_KEY_PEM: privateKey,
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: false,
  } as never;
}

describe("topic routes", () => {
  it("passes validated status and domain filters into listTopics", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      status: "started",
      cadence_family: "quorum",
      cadence_preset: "3h",
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
      new Request("https://api.opndomain.com/v1/topics?status=started&domain=ai-safety&topicFormat=scheduled_research"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { data: Array<{ id: string }> };

    assert.equal(response.status, 200);
    assert.equal(payload.data.length, 1);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.status = ? AND d.slug = ? AND t.topic_format = ?"));
    assert.deepEqual(query?.bindings, ["started", "ai-safety", "scheduled_research"]);
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

  it("rejects invalid topic format filters", async () => {
    const db = new FakeDb();

    const response = await createApiApp().fetch(
      new Request("https://api.opndomain.com/v1/topics?topicFormat=invalid"),
      buildEnv(db),
      {} as never,
    );
    const payload = await response.json() as { code: string };

    assert.equal(response.status, 400);
    assert.equal(payload.code, "invalid_topic_format");
    assert.equal(db.allCalls.length, 0);
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
        template_id: "debate_v2",
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
        template_id: "debate_v2",
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
});
