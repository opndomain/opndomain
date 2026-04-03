import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErrorEnvelopeSchema } from "@opndomain/shared";
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

function buildEnv(db: FakeDb, doHandler: (request: Request) => Promise<Response>) {
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
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    ENABLE_SEMANTIC_SCORING: false,
  } as never;
}

function queueAuthenticatedVotePath(
  db: FakeDb,
  options?: {
    activeRoundConfig?: Record<string, unknown>;
    eligibleContributionIds?: string[];
    contributionOwnerId?: string;
    persistedVote?: Record<string, unknown> | null;
    maxVoteCount?: number;
  },
) {
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
    id: "bng_1",
    agent_id: "agt_1",
    trust_tier: "verified",
    status: "active",
    can_publish: 1,
  }]);
  db.queueFirst("FROM topics", [{
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    topic_source: "manual_user",
    min_trust_tier: "supervised",
    status: "started",
    template_id: "debate_v2",
  }]);
  db.queueFirst("FROM topic_members", [{ id: "tm_1", status: "active" }]);
  db.queueFirst("FROM rounds", [
    {
      id: "rnd_active",
      topic_id: "top_1",
      status: "active",
      sequence_index: 1,
      round_kind: "critique",
    },
    {
      id: "rnd_prior",
      sequence_index: 0,
    },
    {
      id: "rnd_prior",
      sequence_index: 0,
    },
  ]);
  db.queueFirst("JOIN round_configs", [{
    id: "rnd_active",
    topic_id: "top_1",
    status: "active",
    sequence_index: 1,
    round_kind: "critique",
    config_json: JSON.stringify({
      roundKind: "critique",
      sequenceIndex: 1,
      enrollmentType: "open",
      visibility: "sealed",
      completionStyle: "aggressive",
      voteRequired: true,
      voteTargetPolicy: "prior_round",
      minVotesPerActor: 3,
      maxVotesPerActor: 3,
      fallbackChain: [],
      terminal: false,
      phase2Execution: {
        completionMode: "deadline_only",
        enrollmentMode: "topic_members_only",
        note: "Phase 4 vote route test config",
      },
      ...(options?.activeRoundConfig ?? {}),
    }),
  }]);
  db.queueAll("FROM contributions c", (options?.eligibleContributionIds ?? ["cnt_1"]).map((id) => ({
    id,
    round_id: "rnd_prior",
    sequence_index: 0,
    being_id: id === "cnt_1" ? (options?.contributionOwnerId ?? "bng_author") : "bng_other",
    visibility: "normal",
  })));
  db.queueFirst("SELECT being_id FROM contributions WHERE id = ?", [{ being_id: options?.contributionOwnerId ?? "bng_author" }]);
  db.queueFirst("FROM votes", [options?.persistedVote ?? null]);
  db.queueFirst("COUNT(*) AS count", [{ count: options?.maxVoteCount ?? 0 }]);
  db.queueFirst("FROM vote_reliability", [{ reliability: 1.2 }]);
}

async function postVote(
  db: FakeDb,
  doHandler: (request: Request) => Promise<Response>,
  body?: Record<string, unknown>,
) {
  return createApiApp().fetch(
    new Request("https://api.opndomain.com/v1/topics/top_1/votes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "opn_session=ses_1",
      },
      body: JSON.stringify({
        beingId: "bng_1",
        contributionId: "cnt_1",
        voteKind: "most_interesting",
        idempotencyKey: "idem_vote_123456",
        ...(body ?? {}),
      }),
    }),
    buildEnv(db, doHandler) as never,
    {} as never,
  );
}

describe("vote routes", () => {
  it("accepts votes and forwards the Phase 4 payload", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db);
    let forwardedPayload: Record<string, unknown> | null = null;

    const response = await postVote(db, async (request) => {
      if (request.method === "GET") {
        return Response.json({ pendingVoteCount: 0, pendingVotesByKind: {}, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false });
      }
      forwardedPayload = await request.json() as Record<string, unknown>;
      return Response.json({
        id: "vot_1",
        topicId: "top_1",
        roundId: "rnd_active",
        contributionId: "cnt_1",
        voterBeingId: "bng_1",
        direction: 1,
        weight: 2.4,
        voteKind: "most_interesting",
        weightedValue: 2.4,
        acceptedAt: "2026-03-25T00:00:00.000Z",
        replayed: false,
        pendingFlush: true,
      });
    });

    assert.equal(response.status, 200);
    assert.equal(forwardedPayload?.["voteKind"], "most_interesting");
    assert.equal(forwardedPayload?.["idempotencyKey"], "idem_vote_123456");
    const payload = await response.json() as { data: { voteKind: string; weightedValue: number } };
    assert.equal(payload.data.voteKind, "most_interesting");
    assert.equal(payload.data.weightedValue, 2.4);
  });

  it("rejects self-votes", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db, { contributionOwnerId: "bng_1" });
    const response = await postVote(db, async () => Response.json({ pendingVoteCount: 0, pendingVotesByKind: {}, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false }));
    assert.equal(response.status, 403);
  });

  it("returns persisted canonical votes for idempotent replay", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db, {
      persistedVote: {
        id: "vot_existing",
        topic_id: "top_1",
        round_id: "rnd_active",
        contribution_id: "cnt_1",
        voter_being_id: "bng_1",
        direction: 1,
        weight: 2.4,
        vote_kind: "most_interesting",
        created_at: "2026-03-25T00:00:00.000Z",
      },
    });
    const response = await postVote(db, async () => Response.json({ pendingVoteCount: 0, pendingVotesByKind: {}, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false }));
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { replayed: boolean; id: string; voteKind: string } };
    assert.equal(payload.data.replayed, true);
    assert.equal(payload.data.id, "vot_existing");
    assert.equal(payload.data.voteKind, "most_interesting");
  });

  it("returns canonical trust-tier failures", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db);
    db.queueFirst("FROM topics", [{
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      topic_source: "manual_user",
      min_trust_tier: "trusted",
      status: "started",
      template_id: "debate_v2",
    }]);
    const response = await postVote(db, async () => Response.json({ pendingVoteCount: 0, pendingVotesByKind: {}, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false }));
    assert.equal(response.status, 403);
    const payload = ErrorEnvelopeSchema.parse(await response.json());
    assert.equal(payload.code, "forbidden");
  });

  it("rejects voting when the active round has no live vote policy", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db, {
      activeRoundConfig: {
        voteRequired: false,
        voteTargetPolicy: undefined,
      },
    });
    const response = await postVote(db, async () => Response.json({ ok: true }));
    assert.equal(response.status, 400);
  });

  it("rejects votes outside the policy-allowed target set", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db, { eligibleContributionIds: ["cnt_other"] });
    const response = await postVote(db, async () => Response.json({ ok: true }));
    assert.equal(response.status, 400);
  });

  it("enforces max votes per actor per active round across different contributions", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db, { maxVoteCount: 3, eligibleContributionIds: ["cnt_1", "cnt_2"] });
    const response = await postVote(
      db,
      async () => Response.json({ pendingVoteCount: 0, pendingVotesByKind: {}, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false }),
      { contributionId: "cnt_2" },
    );
    assert.equal(response.status, 403);
  });

  it("allows same-vote replay during flush lag but rejects a second distinct vote at the cap", async () => {
    const db = new FakeDb();
    queueAuthenticatedVotePath(db);
    let postCalls = 0;

    const replayResponse = await postVote(db, async (request) => {
      if (request.method === "GET") {
        return Response.json({ pendingVoteCount: 1, pendingVotesByKind: { most_interesting: 1 }, hasMatchingVoteKey: true, hasMatchingVoteKind: true, matchingDirection: 1, contributionAlreadyTargeted: false });
      }
      postCalls += 1;
      return Response.json({
        id: "vot_pending",
        topicId: "top_1",
        roundId: "rnd_active",
        contributionId: "cnt_1",
        voterBeingId: "bng_1",
        direction: 1,
        weight: 2.4,
        voteKind: "most_interesting",
        weightedValue: 2.4,
        acceptedAt: "2026-03-25T00:00:00.000Z",
        replayed: true,
        pendingFlush: true,
      });
    });

    assert.equal(replayResponse.status, 200);
    assert.equal(postCalls, 1);

    const dbSecond = new FakeDb();
    queueAuthenticatedVotePath(dbSecond, { maxVoteCount: 3, eligibleContributionIds: ["cnt_1", "cnt_2"] });
    const secondResponse = await postVote(
      dbSecond,
      async () => Response.json({ pendingVoteCount: 3, pendingVotesByKind: { most_interesting: 1, most_correct: 1, fabrication: 1 }, hasMatchingVoteKey: false, hasMatchingVoteKind: false, matchingDirection: null, contributionAlreadyTargeted: false }),
      { contributionId: "cnt_2" },
    );
    assert.equal(secondResponse.status, 403);
  });
});
