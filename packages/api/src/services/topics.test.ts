import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TopicContextCurrentRoundConfigSchema, TopicContextVoteTargetSchema } from "@opndomain/shared";
import { ApiError } from "../lib/errors.js";
import { createTopic, getTopic, getTopicContext, joinTopic, listTopics, updateTopic } from "./topics.js";

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
    this.db.executedRuns.push({ sql: this.sql, bindings: this.bindings });
    return { success: true };
  }
}

class FakeDb {
  readonly executedRuns: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly batchCalls: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  readonly firstCalls: Array<{ sql: string; bindings: unknown[] }> = [];
  readonly allCalls: Array<{ sql: string; bindings: unknown[] }> = [];
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

  consumeFirst<T>(sql: string, bindings: unknown[] = []): T | null {
    this.firstCalls.push({ sql, bindings });
    const entry = Array.from(this.firstQueue.entries()).find(([fragment]) => sql.includes(fragment));
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

describe("updateTopic schedule rewrites", () => {
  it("rewrites pending round timings when startsAt changes before start", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics", [
      {
        id: "top_1",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate_v2",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: 1,
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
        id: "top_1",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate_v2",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: 1,
        min_trust_tier: "supervised",
        visibility: "public",
        current_round_index: 0,
        starts_at: "2026-03-25T00:02:00.000Z",
        join_until: "2026-03-25T00:01:00.000Z",
        countdown_started_at: null,
        stalled_at: null,
        closed_at: null,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds r\n      INNER JOIN round_configs rc", [
      {
        id: "rnd_1",
        sequence_index: 0,
        status: "pending",
        starts_at: "2026-03-25T00:30:00.000Z",
        ends_at: "2026-03-25T00:31:00.000Z",
        config_json: JSON.stringify({
          roundKind: "propose",
          sequenceIndex: 0,
          enrollmentType: "open",
          visibility: "sealed",
          completionStyle: "aggressive",
          voteRequired: false,
          fallbackChain: [],
          terminal: false,
          phase2Execution: {
            completionMode: "deadline_only",
            enrollmentMode: "topic_members_only",
            note: "test",
          },
        }),
      },
      {
        id: "rnd_2",
        sequence_index: 1,
        status: "pending",
        starts_at: "2026-03-25T00:31:00.000Z",
        ends_at: "2026-03-25T00:32:00.000Z",
        config_json: JSON.stringify({
          roundKind: "critique",
          sequenceIndex: 1,
          enrollmentType: "open",
          visibility: "open",
          completionStyle: "aggressive",
          voteRequired: true,
          voteTargetPolicy: "prior_round",
          minVotesPerActor: 1,
          maxVotesPerActor: 1,
          fallbackChain: [],
          terminal: false,
          phase2Execution: {
            completionMode: "deadline_only",
            enrollmentMode: "topic_members_only",
            note: "test",
          },
        }),
      },
    ]);
    db.queueAll("FROM rounds\n      WHERE topic_id = ?", []);

    await updateTopic(buildEnv(db), "top_1", {
      startsAt: "2026-03-25T00:02:00.000Z",
      joinUntil: "2026-03-25T00:01:00.000Z",
    });

    const roundUpdates = db.executedRuns.filter((entry) => entry.sql.includes("UPDATE rounds SET starts_at = ?, ends_at = ?, reveal_at = ?"));
    assert.equal(roundUpdates.length, 2);
    assert.deepEqual(roundUpdates[0]?.bindings, [
      "2026-03-25T00:02:00.000Z",
      "2026-03-25T00:03:00.000Z",
      "2026-03-25T00:03:00.000Z",
      "rnd_1",
    ]);
    assert.deepEqual(roundUpdates[1]?.bindings, [
      "2026-03-25T00:03:00.000Z",
      "2026-03-25T00:04:00.000Z",
      "2026-03-25T00:03:00.000Z",
      "rnd_2",
    ]);
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
    const proposeConfig = roundConfigStatements
      .map((entry) => JSON.parse(String(entry.bindings[4])) as Record<string, unknown>)
      .find((config) => config.roundKind === "propose");

    assert.ok(proposeConfig);
    assert.ok(critiqueConfig);
    assert.equal(proposeConfig?.minVotesPerActor, undefined);
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

describe("topic read contracts", () => {
  it("applies status and domain filters when listing topics", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      status: "started",
      cadence_family: "quorum",
      cadence_preset: "3h",
      cadence_override_minutes: null,
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

    const topics = await listTopics(buildEnv(db), { status: "started", domainSlug: "ai-safety" });

    assert.equal(topics.length, 1);
    assert.equal(topics[0]?.domainSlug, "ai-safety");
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.status = ? AND d.slug = ?"));
    assert.deepEqual(query?.bindings, ["started", "ai-safety"]);
  });

  it("returns populated domain metadata for topic detail", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      status: "started",
      cadence_family: "quorum",
      cadence_preset: "3h",
      cadence_override_minutes: null,
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
    db.queueAll("FROM rounds", []);

    const topic = await getTopic(buildEnv(db), "top_1");

    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.domainName, "AI Safety");
  });

  it("returns populated domain metadata for topic context", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      status: "started",
      cadence_family: "quorum",
      cadence_preset: "3h",
      cadence_override_minutes: null,
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
    db.queueAll("FROM rounds", []);
    db.queueAll("FROM topic_members", []);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", []);
    db.queueAll("FROM contributions c", []);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1");

    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.domainName, "AI Safety");
  });

  it("adds vote metadata and eligible targets when an owned being is supplied", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate_v2",
      status: "started",
      cadence_family: "quality_gated",
      cadence_preset: "3h",
      cadence_override_minutes: null,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 1,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds", [
      {
        id: "rnd_0",
        topic_id: "top_1",
        sequence_index: 0,
        round_kind: "propose",
        status: "completed",
        starts_at: null,
        ends_at: null,
        reveal_at: "2026-03-25T00:30:00.000Z",
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "rnd_1",
        topic_id: "top_1",
        sequence_index: 1,
        round_kind: "critique",
        status: "active",
        starts_at: null,
        ends_at: null,
        reveal_at: null,
        created_at: "2026-03-25T01:00:00.000Z",
        updated_at: "2026-03-25T01:00:00.000Z",
      },
    ]);
    db.queueAll("FROM topic_members", [{
      being_id: "bng_1",
      handle: "alpha",
      display_name: "Alpha",
      role: "participant",
      status: "active",
    }]);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", [{ id: "bng_1" }]);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id\n      INNER JOIN rounds r ON r.id = c.round_id", []);
    db.queueFirst("FROM round_configs", [{
      config_json: JSON.stringify({
        roundKind: "critique",
        sequenceIndex: 1,
        enrollmentType: "open",
        visibility: "sealed",
        completionStyle: "aggressive",
        voteRequired: true,
        voteTargetPolicy: "prior_round",
        minVotesPerActor: 1,
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
    db.queueFirst("WHERE topic_id = ? AND sequence_index = ?", [{
      id: "rnd_0",
      sequence_index: 0,
    }]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id\n      INNER JOIN round_configs rc ON rc.round_id = r.id", [{
      id: "cnt_2",
      round_id: "rnd_0",
      sequence_index: 0,
      being_id: "bng_2",
      visibility: "normal",
      round_visibility: "open",
      reveal_at: "2026-03-25T00:30:00.000Z",
    }]);
    db.queueAll("FROM contributions c\n              INNER JOIN beings b ON b.id = c.being_id", [{
      contribution_id: "cnt_2",
      being_id: "bng_2",
      being_handle: "bravo",
    }]);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1", "bng_1");

    const currentRoundConfig = TopicContextCurrentRoundConfigSchema.parse(topic.currentRoundConfig);
    assert.equal(currentRoundConfig.roundKind, "critique");
    assert.equal(currentRoundConfig.voteRequired, true);
    assert.equal(currentRoundConfig.voteTargetPolicy, "prior_round");

    assert.equal(topic.voteTargets.length, 1);
    const voteTarget = TopicContextVoteTargetSchema.parse(topic.voteTargets[0]);
    assert.equal(voteTarget.contributionId, "cnt_2");
    assert.equal(voteTarget.beingId, "bng_2");
    assert.equal(voteTarget.beingHandle, "bravo");
    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.members[0]?.ownedByCurrentAgent, true);
  });
});
