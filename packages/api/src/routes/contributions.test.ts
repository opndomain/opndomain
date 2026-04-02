import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErrorEnvelopeSchema } from "@opndomain/shared";
import { createApiApp } from "../index.js";
import { resolveContributionContext } from "./contributions.js";

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
    return { success: true };
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

function buildEnv(
  db: FakeDb,
  doHandler: (request: Request) => Promise<Response>,
  options?: { enableEpistemicScoring?: boolean },
) {
  const embed = (text: string) => {
    const normalized = text.toLowerCase();
    return [
      normalized.includes("prompt") ? 1 : 0,
      normalized.includes("trade-off") ? 1 : 0,
      normalized.includes("results") ? 1 : 0,
      normalized.includes("durable") ? 1 : 0,
      normalized.includes("object") ? 1 : 0,
    ];
  };
  return {
    DB: db as never,
    PUBLIC_CACHE: {} as never,
    PUBLIC_ARTIFACTS: {} as never,
    SNAPSHOTS: {} as never,
    TOPIC_STATE_DO: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : new Request(String(input), init);
          return doHandler(request);
        },
      }),
    },
    SESSION_COOKIE_NAME: "opn_session",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    ADMIN_ALLOWED_EMAILS_SET: new Set<string>(),
    ADMIN_ALLOWED_CLIENT_IDS_SET: new Set<string>(),
    ENABLE_EPISTEMIC_SCORING: options?.enableEpistemicScoring ?? false,
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: true,
    AI: {
      run: async (_model: string, input: { text: string[] }) => ({
        data: input.text.map(embed),
      }),
    } as never,
  } as never;
}

function queueAuthenticatedContributionPath(db: FakeDb, agentId = "agt_1", beingAgentId = "agt_1") {
  db.queueFirst("FROM sessions", [
    {
      id: "ses_1",
      agent_id: agentId,
      scope: "web_session",
      refresh_token_hash: null,
      access_token_id: "atk_1",
      expires_at: "3026-01-01T00:00:00.000Z",
      revoked_at: null,
    },
  ]);
  db.queueFirst("FROM agents", [
    {
      id: agentId,
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
  db.queueFirst("FROM beings b", [
    {
      id: "bng_1",
      agent_id: beingAgentId,
      trust_tier: "verified",
      status: "active",
      can_publish: 1,
    },
  ]);
  db.queueFirst("FROM topics", [
    {
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      topic_source: "manual_user",
      min_trust_tier: "supervised",
      status: "started",
      template_id: "debate_v2",
    },
  ]);
  db.queueFirst("FROM topic_members", [
    {
      id: "tm_1",
      status: "active",
    },
  ]);
  db.queueFirst("FROM rounds", [
    {
      id: "rnd_1",
      topic_id: "top_1",
      status: "active",
      sequence_index: 0,
      round_kind: "propose",
    },
  ]);
  db.queueFirst("FROM domain_reputation", [null]);
  db.queueFirst("FROM text_restrictions", [null]);
  db.queueAll("FROM contributions", []);
}

describe("contribution routes", () => {
  it("returns the DO response inside { data } for a valid authenticated contribution", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    let receivedRoundId = "";
    let receivedRecentWindow: unknown[] = [];

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice.",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async (request) => {
        const payload = (await request.json()) as Record<string, unknown>;
        receivedRoundId = String(payload.roundId);
        return Response.json({
          id: "cnt_1",
          visibility: "normal",
          guardrailDecision: "allow",
          scores: {
            substance: 70,
            role: "evidence",
            roleBonus: 12,
            echoDetected: false,
            metaDetected: false,
            relevance: 66,
            novelty: 62,
            reframe: 61,
            semanticFlags: [],
            initialScore: 68,
            finalScore: 68,
            shadowInitialScore: 67,
            shadowFinalScore: 67,
          },
        }, { status: 200 });
      }) as never,
      {} as never,
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { data: { id: string; scores: { finalScore: number } } };
    assert.equal(payload.data.id, "cnt_1");
    assert.equal(payload.data.scores.finalScore, 68);
    assert.equal(receivedRoundId, "rnd_1");
    assert.deepEqual(receivedRecentWindow, []);
  });

  it("enforces being ownership server-side", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db, "agt_1", "agt_other");
    await assert.rejects(
      () =>
        resolveContributionContext(
          buildEnv(db, async () => Response.json({ ok: true })) as never,
          {
            id: "agt_1",
            clientId: "cli_1",
            name: "Agent",
            email: "agent@example.com",
            emailVerifiedAt: "2026-03-25T00:00:00.000Z",
            accountClass: "verified_participant",
            isAdmin: false,
            effectiveAccountClass: "verified_participant",
            trustTier: "verified",
            status: "active",
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z",
          },
          "top_1",
          "bng_1",
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error as { status: number }).status === 403,
    );
  });

  it("rejects blocked contributions before sending them to the durable object", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    db.queueFirst("FROM text_restrictions", [
      {
        mode: "mute",
        reason: "operator mute",
        scope_type: "global",
        scope_id: "global",
        expires_at: null,
      },
    ]);
    let doCalled = false;

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Ordinary body",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async () => {
        doCalled = true;
        return Response.json({ ok: true });
      }) as never,
      {} as never,
    );

    assert.equal(response.status, 403);
    assert.equal(doCalled, false);
  });

  it("returns 404 when the topic has no active round", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    db.queueFirst("FROM rounds", [null]);

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice.",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async () => Response.json({ ok: true })) as never,
      {} as never,
    );

    assert.equal(response.status, 404);
    const payload = ErrorEnvelopeSchema.parse(await response.json());
    assert.equal(payload.error, "not_found");
    assert.equal(payload.code, "not_found");
  });

  it("returns a canonical error envelope for forbidden context failures", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db, "agt_1", "agt_other");

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice.",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async () => Response.json({ ok: true })) as never,
      {} as never,
    );

    assert.equal(response.status, 403);
    const payload = ErrorEnvelopeSchema.parse(await response.json());
    assert.equal(payload.error, "forbidden");
    assert.equal(payload.code, "forbidden");
  });

  it("returns a canonical error envelope for trust-tier failures", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    db.queueFirst("FROM topics", [
      {
        id: "top_1",
        title: "Topic",
        prompt: "Prompt",
        min_trust_tier: "trusted",
        status: "started",
        template_id: "debate_v2",
      },
    ]);

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice.",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async () => Response.json({ ok: true })) as never,
      {} as never,
    );

    assert.equal(response.status, 403);
    const payload = ErrorEnvelopeSchema.parse(await response.json());
    assert.equal(payload.error, "forbidden");
    assert.equal(payload.code, "forbidden");
    assert.equal(payload.message, "That being does not meet the topic trust tier requirement.");
  });

  it("fetches the recent transcript-visible contribution window in the route layer", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    db.queueAll("FROM contributions", [
      { id: "cnt_a", body_clean: "Visible prior contribution A." },
      { id: "cnt_b", body_clean: "Visible prior contribution B." },
      { id: "cnt_null", body_clean: null },
    ]);
    let semanticAverage: number | null = null;
    let receivedRecentWindow: string[] = [];

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice.",
          idempotencyKey: "idem_12345678",
        }),
      }),
      buildEnv(db, async (request) => {
        const payload = (await request.json()) as Record<string, unknown>;
        const score = payload.scores as { details: { semantic: { comparedContributionIds: string[]; semanticAverage: number | null } } };
        semanticAverage = score.details.semantic.semanticAverage;
        receivedRecentWindow = score.details.semantic.comparedContributionIds;
        return Response.json({
          id: "cnt_1",
          visibility: "normal",
          guardrailDecision: "allow",
          scores: {
            substance: 70,
            role: "evidence",
            roleBonus: 12,
            echoDetected: false,
            metaDetected: false,
            relevance: 66,
            novelty: 62,
            reframe: 61,
            semanticFlags: [],
            initialScore: 68,
            finalScore: 68,
            shadowInitialScore: 67,
            shadowFinalScore: 67,
          },
        }, { status: 200 });
      }) as never,
      {} as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(receivedRecentWindow, ["cnt_a", "cnt_b"]);
    assert.ok((semanticAverage ?? 0) >= 0);
  });

  it("includes deterministic epistemic claims only when the flag is enabled", async () => {
    const db = new FakeDb();
    queueAuthenticatedContributionPath(db);
    let claims: unknown = null;

    const app = createApiApp();
    const response = await app.fetch(
      new Request("https://api.opndomain.com/v1/topics/top_1/contributions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "opn_session=ses_1",
        },
        body: JSON.stringify({
          beingId: "bng_1",
          body: "Measured results show a trade-off in practice. Teams should publish the benchmark.",
          idempotencyKey: "idem_87654321",
        }),
      }),
      buildEnv(
        db,
        async (request) => {
          const payload = (await request.json()) as Record<string, unknown>;
          claims = payload.claims;
          return Response.json({
            id: "cnt_1",
            visibility: "normal",
            guardrailDecision: "allow",
            scores: {
              substance: 70,
              role: "evidence",
              roleBonus: 12,
              echoDetected: false,
              metaDetected: false,
              relevance: 66,
              novelty: 62,
              reframe: 61,
              semanticFlags: [],
              initialScore: 68,
              finalScore: 68,
              shadowInitialScore: 67,
              shadowFinalScore: 67,
            },
          }, { status: 200 });
        },
        { enableEpistemicScoring: true },
      ) as never,
      {} as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(claims, {
      domainId: "dom_1",
      items: [
        {
          ordinal: 1,
          body: "Measured results show a trade-off in practice.",
          normalizedBody: "measured results show a trade off in practice",
          verifiability: "empirical",
        },
        {
          ordinal: 2,
          body: "Teams should publish the benchmark.",
          normalizedBody: "teams should publish the benchmark",
          verifiability: "normative",
        },
      ],
    });
  });
});
