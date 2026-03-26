import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../lib/errors.js";
import { createTopic, joinTopic } from "./topics.js";

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
    return { success: true };
  }
}

class FakeDb {
  readonly executedRuns: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly batchCalls: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  private readonly firstQueue = new Map<string, unknown[]>();
  private readonly allQueue = new Map<string, unknown[]>();

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
    this.batchCalls.push(statements.map((statement) => ({ sql: statement.sql, bindings: statement.bindings })));
    return statements.map(() => ({ success: true }));
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

const agent = {
  id: "agt_1",
  clientId: "cli_1",
  name: "Agent",
  email: "agent@example.com",
  emailVerifiedAt: "2026-03-25T00:00:00.000Z",
  trustTier: "verified",
  status: "active",
  createdAt: "2026-03-25T00:00:00.000Z",
  updatedAt: "2026-03-25T00:00:00.000Z",
};

function buildEnv(db: FakeDb) {
  return {
    DB: db as unknown as D1Database,
  } as never;
}

function queueJoinPrereqs(db: FakeDb, status: string) {
  const topicRow = {
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate",
    status,
    cadence_family: "quorum",
    cadence_preset: "3h",
    cadence_override_minutes: null,
    min_trust_tier: "supervised",
    visibility: "public",
    current_round_index: 0,
    starts_at: "2026-03-25T00:30:00.000Z",
    join_until: "2026-03-25T00:15:00.000Z",
    countdown_started_at: null,
    stalled_at: null,
    closed_at: null,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
  };
  db.queueFirst("FROM topics", [topicRow, topicRow]);
  db.queueFirst("FROM beings b", [
    {
      id: "bng_1",
      agent_id: "agt_1",
      trust_tier: "verified",
      status: "active",
      can_join_topics: 1,
    },
  ]);
  db.queueAll("FROM rounds", []);
}

async function expectForbidden(promise: Promise<unknown>, message: string) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof ApiError && error.status === 403 && error.code === "forbidden" && error.message === message,
  );
}

describe("joinTopic lifecycle enforcement", () => {
  it("allows joins while a topic is open", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "open");

    const topic = await joinTopic(buildEnv(db), agent, "top_1", "bng_1");

    assert.equal(topic?.status, "open");
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT OR REPLACE INTO topic_members")));
  });

  it("allows joins while a topic is in countdown", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "countdown");

    const topic = await joinTopic(buildEnv(db), agent, "top_1", "bng_1");

    assert.equal(topic?.status, "countdown");
    assert.ok(db.executedRuns.some((entry) => entry.sql.includes("INSERT OR REPLACE INTO topic_members")));
  });

  it("rejects joins after a topic has started", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "started");

    await expectForbidden(joinTopic(buildEnv(db), agent, "top_1", "bng_1"), "This topic is no longer accepting participants.");
    assert.equal(db.executedRuns.length, 0);
  });

  it("rejects joins for stalled topics", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "stalled");

    await expectForbidden(joinTopic(buildEnv(db), agent, "top_1", "bng_1"), "This topic is no longer accepting participants.");
    assert.equal(db.executedRuns.length, 0);
  });

  it("rejects joins for closed topics", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "closed");

    await expectForbidden(joinTopic(buildEnv(db), agent, "top_1", "bng_1"), "This topic is no longer accepting participants.");
    assert.equal(db.executedRuns.length, 0);
  });
});

describe("createTopic round config persistence", () => {
  it("persists per-round vote min/max fields into round_configs.config_json", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM domains", [
      {
        id: "dom_1",
        slug: "database-architecture",
        name: "Database Architecture",
        description: null,
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueFirst("WHERE b.agent_id = ?", [
      {
        id: "bng_creator",
        agent_id: "agt_1",
        handle: "creator",
        display_name: "Creator",
        bio: null,
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
        can_open_topics: 1,
      },
    ]);
    db.queueFirst("FROM topics", [
      {
        id: "top_created",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate_v2",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_trust_tier: "supervised",
        visibility: "public",
        current_round_index: 0,
        starts_at: "2026-03-25T00:30:00.000Z",
        join_until: "2026-03-25T00:15:00.000Z",
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds", [
      {
        id: "rnd_1",
        topic_id: "top_created",
        sequence_index: 0,
        round_kind: "propose",
        status: "pending",
        starts_at: null,
        ends_at: null,
        reveal_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);

    await createTopic(buildEnv(db), agent as never, {
      domainId: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      templateId: "debate_v2",
      minTrustTier: "supervised",
    });

    const topicCreationBatch = db.batchCalls.at(-1) ?? [];
    const roundConfigStatements = topicCreationBatch.filter((entry) => entry.sql.includes("INSERT INTO round_configs"));
    const critiqueConfig = roundConfigStatements
      .map((entry) => JSON.parse(String(entry.bindings[4])) as Record<string, unknown>)
      .find((config) => config.roundKind === "critique");

    assert.ok(critiqueConfig);
    assert.equal(critiqueConfig?.voteRequired, true);
    assert.equal(critiqueConfig?.voteTargetPolicy, "prior_round");
    assert.equal(critiqueConfig?.minVotesPerActor, 1);
    assert.equal(critiqueConfig?.maxVotesPerActor, 1);
  });

  it("initializes reveal_at from planned timing for sealed and open rounds", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM domains", [
      {
        id: "dom_1",
        slug: "database-architecture",
        name: "Database Architecture",
        description: null,
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "dom_1",
        slug: "database-architecture",
        name: "Database Architecture",
        description: null,
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueFirst("WHERE b.agent_id = ?", [
      {
        id: "bng_creator",
        agent_id: "agt_1",
        handle: "creator",
        display_name: "Creator",
        bio: null,
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
        can_open_topics: 1,
      },
      {
        id: "bng_creator",
        agent_id: "agt_1",
        handle: "creator",
        display_name: "Creator",
        bio: null,
        trust_tier: "verified",
        status: "active",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
        can_open_topics: 1,
      },
    ]);
    db.queueFirst("FROM topics", [
      {
        id: "top_created_1",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate_v2",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_trust_tier: "supervised",
        visibility: "public",
        current_round_index: 0,
        starts_at: "2026-03-25T00:30:00.000Z",
        join_until: "2026-03-25T00:15:00.000Z",
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "top_created_2",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "chaos",
        status: "open",
        cadence_family: "rolling",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_trust_tier: "supervised",
        visibility: "unlisted",
        current_round_index: 0,
        starts_at: "2026-03-25T00:30:00.000Z",
        join_until: "2026-03-25T00:15:00.000Z",
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds", []);

    await createTopic(buildEnv(db), agent as never, {
      domainId: "dom_1",
      title: "Sealed Topic",
      prompt: "Prompt",
      templateId: "debate_v2",
      minTrustTier: "supervised",
    });

    await createTopic(buildEnv(db), agent as never, {
      domainId: "dom_1",
      title: "Open Topic",
      prompt: "Prompt",
      templateId: "chaos",
      minTrustTier: "supervised",
    });

    const sealedRoundInsert = db.batchCalls[0]?.find((entry) => entry.sql.includes("INSERT INTO rounds"));
    const openRoundInsert = db.batchCalls[1]?.find((entry) => entry.sql.includes("INSERT INTO rounds"));
    assert.ok(sealedRoundInsert);
    assert.ok(openRoundInsert);
    assert.equal(sealedRoundInsert?.bindings[5], sealedRoundInsert?.bindings[6]);
    assert.equal(openRoundInsert?.bindings[4], openRoundInsert?.bindings[6]);
  });
});
