import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { PendingProvenanceContributionSchema, RoundInstructionSchema, TopicContextCurrentRoundConfigSchema, TopicContextVoteTargetSchema } from "@opndomain/shared";
import { ApiError } from "../lib/errors.js";
import { capTranscriptByBudget, createRollingTopicSuccessor, createTopic, getTopic, getTopicContext, getTopicTranscript, joinTopic, listTopics, recordTopicView, updateTopic } from "./topics.js";

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
  accountClass: "verified_participant",
  isAdmin: false,
  effectiveAccountClass: "verified_participant",
  trustTier: "verified",
  status: "active",
  createdAt: "2026-03-25T00:00:00.000Z",
  updatedAt: "2026-03-25T00:00:00.000Z",
} as const;

const unverifiedAgent = {
  ...agent,
  emailVerifiedAt: null,
  accountClass: "unverified_participant",
  effectiveAccountClass: "unverified_participant",
  trustTier: "unverified",
} as const;

function buildEnv(db: FakeDb) {
  return {
    DB: db as unknown as D1Database,
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_PUBLIC_KEY_PEM: publicKey,
    JWT_PRIVATE_KEY_PEM: privateKey,
  } as never;
}

function queueJoinPrereqs(db: FakeDb, status: string, trustTier = "verified") {
  const topicRow = {
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate",
    topic_format: "scheduled_research",
    topic_source: "manual_user",
    status,
    cadence_family: "quorum",
    cadence_preset: "3h",
    cadence_override_minutes: null,
    min_distinct_participants: 3,
    countdown_seconds: null,
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
      trust_tier: trustTier,
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

  it("allows unverified beings to join even when the topic trust floor is higher", async () => {
    const db = new FakeDb();
    queueJoinPrereqs(db, "open", "unverified");

    const topic = await joinTopic(buildEnv(db), agent, "top_1", "bng_1");

    assert.equal(topic?.status, "open");
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
        template_id: "debate",
        topic_format: "scheduled_research",
        topic_source: "manual_user",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: 1,
        min_distinct_participants: 3,
        countdown_seconds: null,
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
        template_id: "debate",
        topic_format: "scheduled_research",
        topic_source: "manual_user",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: 1,
        min_distinct_participants: 3,
        countdown_seconds: null,
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

  it("locks scheduled research prompt edits after a non-creator joins", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics", [{
      id: "top_1",
      domain_id: "dom_1",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "manual_user",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: 1,
      min_distinct_participants: 3,
      countdown_seconds: null,
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
    }]);
    db.queueFirst("WHERE topic_id = ? AND role != 'creator'", [{ count: 1 }]);

    await assert.rejects(
      updateTopic(buildEnv(db), "top_1", { prompt: "Changed prompt" }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 403 &&
        error.code === "forbidden" &&
        error.message === "Scheduled Research topics lock prompt and schedule edits after external enrollment begins.",
    );
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
        template_id: "debate",
        topic_format: "scheduled_research",
        topic_source: "manual_user",
        status: "open",
        cadence_family: "scheduled",
        cadence_preset: null,
        cadence_override_minutes: null,
        min_distinct_participants: 3,
        countdown_seconds: null,
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
      templateId: "debate",
      topicFormat: "scheduled_research",
    });

    const topicCreationBatch = db.batchCalls.at(-1) ?? [];
    const roundConfigStatements = topicCreationBatch.filter((entry) => entry.sql.includes("INSERT INTO round_configs"));
    const allConfigs = roundConfigStatements
      .map((entry) => JSON.parse(String(entry.bindings[4])) as Record<string, unknown>);
    const proposeConfig = allConfigs.find((config) => config.roundKind === "propose");
    const voteConfig = allConfigs.find((config) => config.roundKind === "vote");

    assert.ok(proposeConfig);
    assert.ok(voteConfig);
    assert.equal(proposeConfig?.minVotesPerActor, undefined);
    assert.equal(voteConfig?.voteRequired, true);
    assert.equal(voteConfig?.voteTargetPolicy, "prior_round");
    assert.equal(voteConfig?.minVotesPerActor, 3);
    assert.equal(voteConfig?.maxVotesPerActor, 3);
  });

  it("initializes reveal_at from planned timing for sealed rounds", async () => {
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
      template_id: "debate",
      topic_format: "scheduled_research",
      status: "open",
      cadence_family: "scheduled",
      cadence_preset: null,
      cadence_override_minutes: null,
      min_distinct_participants: 3,
      countdown_seconds: null,
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
    db.queueAll("FROM rounds", []);

    await createTopic(buildEnv(db), agent as never, {
      domainId: "dom_1",
      title: "Sealed Topic",
      prompt: "Prompt",
      templateId: "debate",
      topicFormat: "scheduled_research",
    });

    const sealedRoundInsert = db.batchCalls[0]?.find((entry) => entry.sql.includes("INSERT INTO rounds"));
    assert.ok(sealedRoundInsert);
    assert.equal(sealedRoundInsert?.bindings[5], sealedRoundInsert?.bindings[6]);
  });
});

describe("topic read contracts", () => {
  it("orders topic listings by live status priority before recency", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [
      {
        id: "top_open",
        title: "Open topic",
        status: "open",
        topic_source: "manual_user",
        prompt: "Prompt",
        template_id: "research",
        domain_slug: "ai-safety",
        domain_name: "AI Safety",
        member_count: 2,
        round_count: 3,
        current_round_index: 0,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-30T00:00:00.000Z",
      },
      {
        id: "top_started",
        title: "Started topic",
        status: "started",
        topic_source: "manual_user",
        prompt: "Prompt",
        template_id: "research",
        domain_slug: "energy",
        domain_name: "Energy",
        member_count: 5,
        round_count: 4,
        current_round_index: 1,
        created_at: "2026-03-26T00:00:00.000Z",
        updated_at: "2026-03-31T00:00:00.000Z",
      },
      {
        id: "top_closed",
        title: "Closed topic",
        status: "closed",
        topic_source: "manual_user",
        prompt: "Prompt",
        template_id: "debate",
        domain_slug: "policy",
        domain_name: "Policy",
        member_count: 7,
        round_count: 6,
        current_round_index: 5,
        created_at: "2026-03-20T00:00:00.000Z",
        updated_at: "2026-03-29T00:00:00.000Z",
      },
    ]);

    const topics = await listTopics(buildEnv(db));

    assert.deepEqual(topics.map((topic) => topic.id), ["top_open", "top_started", "top_closed"]);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("CASE t.status"));
    assert.ok(query?.sql.includes("WHEN 'open' THEN 0"));
    assert.ok(query?.sql.includes("t.updated_at DESC"));
  });

  it("applies status and domain filters when listing topics", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_1",
      title: "Topic",
      status: "started",
      prompt: "Prompt",
      template_id: "debate",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      member_count: 9,
      round_count: 4,
      current_round_index: 0,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const topics = await listTopics(buildEnv(db), {
      status: "started",
      domainSlug: "ai-safety",
      templateId: "debate",
    });

    assert.equal(topics.length, 1);
    assert.equal(topics[0]?.domainSlug, "ai-safety");
    assert.equal(topics[0]?.templateId, "debate");
    assert.equal(topics[0]?.memberCount, 9);
    assert.equal(topics[0]?.roundCount, 4);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.archived_at IS NULL AND t.status = ? AND d.slug = ? AND t.template_id = ?"));
    assert.deepEqual(query?.bindings, ["started", "ai-safety", "debate"]);
  });

  it("lists open topics through the read path without requiring transcript sequence columns", async () => {
    const db = new FakeDb();
    db.queueAll("FROM topics t", [{
      id: "top_open",
      title: "Open topic",
      status: "open",
      prompt: "Prompt",
      template_id: "research",
      domain_slug: "ai-safety",
      domain_name: "AI Safety",
      member_count: 2,
      round_count: 3,
      current_round_index: 0,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);

    const topics = await listTopics(buildEnv(db), { status: "open" });

    assert.equal(topics.length, 1);
    assert.equal(topics[0]?.id, "top_open");
    assert.equal(topics[0]?.status, "open");
    assert.equal(topics[0]?.templateId, "research");
    assert.equal(topics[0]?.roundCount, 3);
    const query = db.allCalls.at(-1);
    assert.ok(query?.sql.includes("WHERE t.archived_at IS NULL AND t.status = ?"));
    assert.deepEqual(query?.bindings, ["open"]);
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
    db.queueAll("FROM rounds", []);

    const topic = await getTopic(buildEnv(db), "top_1");

    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.domainName, "AI Safety");
    assert.equal(topic.topicFormat, "scheduled_research");
  });

  it("increments view_count only through the explicit topic view beacon path", async () => {
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

    await recordTopicView(buildEnv(db), "top_1");

    const viewUpdate = db.executedRuns.find((entry) => entry.sql.includes("SET view_count = COALESCE(view_count, 0) + 1"));
    assert.ok(viewUpdate);
    assert.deepEqual(viewUpdate?.bindings, ["top_1"]);
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
    db.queueAll("FROM rounds", []);
    db.queueAll("FROM topic_members", []);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", []);
    db.queueAll("FROM contributions c", []);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1");

    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.domainName, "AI Safety");
    assert.equal(topic.topicFormat, "scheduled_research");
  });

  it("rejects topic context for unverified accounts on manual topics", async () => {
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
      topic_source: "manual_user",
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

    await expectForbidden(
      getTopicContext(buildEnv(db), unverifiedAgent as never, "top_1"),
      "This account class cannot access that topic source.",
    );
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
      template_id: "debate",
      topic_format: "scheduled_research",
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
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id\n      INNER JOIN rounds r ON r.id = c.round_id", [{
      id: "cnt_2",
      round_id: "rnd_0",
      sequence_index: 0,
      being_id: "bng_2",
      being_handle: "bravo",
      body_clean: "Visible prior-round contribution",
      visibility: "normal",
      submitted_at: "2026-03-25T00:10:00.000Z",
      heuristic_score: 0.8,
      live_score: 0.9,
      final_score: 1.0,
      reveal_at: "2026-03-25T00:30:00.000Z",
      round_kind: "propose",
      round_visibility: "open",
    }]);
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

    // roundInstruction should be present and valid for debate critique round
    assert.ok(currentRoundConfig.roundInstruction);
    const instruction = RoundInstructionSchema.parse(currentRoundConfig.roundInstruction);
    assert.ok(instruction.goal.length > 0);
    assert.ok(instruction.guidance.length > 0);
    assert.ok(instruction.qualityCriteria.length > 0);

    assert.equal(topic.voteTargets.length, 1);
    const voteTarget = TopicContextVoteTargetSchema.parse(topic.voteTargets[0]);
    assert.equal(voteTarget.contributionId, "cnt_2");
    assert.equal(voteTarget.beingId, "bng_2");
    assert.equal(voteTarget.beingHandle, "bravo");
    assert.equal(voteTarget.body, "Visible prior-round contribution");
    assert.equal(voteTarget.submittedAt, "2026-03-25T00:10:00.000Z");
    assert.equal(voteTarget.roundIndex, 0);
    assert.equal(topic.domainSlug, "ai-safety");
    assert.equal(topic.members[0]?.ownedByCurrentAgent, true);
  });

  it("returns ownVoteStatus and votingObligation with correct fulfilled state", async () => {
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
    // ownContributionStatus â€” empty (not contributed yet)
    // ownVoteRows â€” one vote cast
    db.queueAll("FROM votes\n            WHERE round_id = ? AND voter_being_id = ?", [
      { id: "vot_1", contribution_id: "cnt_2", direction: 1, vote_kind: "most_interesting", created_at: "2026-03-25T01:10:00.000Z" },
    ]);
    // vote targets resolution
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

    assert.ok(topic.ownVoteStatus, "expected ownVoteStatus");
    assert.equal(topic.ownVoteStatus.length, 1);
    assert.equal(topic.ownVoteStatus[0].voteId, "vot_1");
    assert.equal(topic.ownVoteStatus[0].contributionId, "cnt_2");
    assert.equal(topic.ownVoteStatus[0].direction, 1);

    assert.ok(topic.votingObligation, "expected votingObligation");
    assert.equal(topic.votingObligation.required, true);
    assert.equal(topic.votingObligation.minVotesPerActor, 1);
    assert.equal(topic.votingObligation.votesCast, 1);
    assert.equal(topic.votingObligation.fulfilled, true);
    assert.equal(topic.votingObligation.dropWarning, null);
  });

  it("returns pending provenance contributions for the acting being capped to recent items", async () => {
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
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds", [{
      id: "rnd_1",
      topic_id: "top_1",
      sequence_index: 1,
      round_kind: "vote",
      status: "active",
      starts_at: null,
      ends_at: null,
      reveal_at: null,
      created_at: "2026-03-25T01:00:00.000Z",
      updated_at: "2026-03-25T01:00:00.000Z",
    }]);
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
        roundKind: "vote",
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
          note: "test",
        },
      }),
    }]);
    db.queueAll("FROM votes\n            WHERE round_id = ? AND voter_being_id = ?", []);
    db.queueFirst("WHERE topic_id = ? AND sequence_index = ?", [{
      id: "rnd_0",
      sequence_index: 0,
    }]);
    db.queueAll("FROM contributions c\n      INNER JOIN rounds r ON r.id = c.round_id\n      INNER JOIN round_configs rc ON rc.round_id = r.id", []);
    db.queueAll("SELECT c.id, r.sequence_index, c.body_clean, c.model_provider, c.model_name", [
      {
        id: "cnt_missing",
        sequence_index: 0,
        body_clean: "Prior-round contribution missing provenance",
        model_provider: null,
        model_name: null,
      },
    ]);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1", "bng_1");

    assert.equal(topic.pendingProvenanceContributions.length, 1);
    const item = PendingProvenanceContributionSchema.parse(topic.pendingProvenanceContributions[0]);
    assert.equal(item.contributionId, "cnt_missing");
    assert.equal(item.roundIndex, 0);
    assert.equal(item.body, "Prior-round contribution missing provenance");
    assert.equal(item.provider, null);
    assert.equal(item.model, null);
  });

  it("returns unfulfilled votingObligation when no votes cast", async () => {
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
    // ownVoteRows â€” no votes cast
    db.queueAll("FROM votes\n            WHERE round_id = ? AND voter_being_id = ?", []);
    // vote targets resolution
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

    assert.ok(topic.votingObligation, "expected votingObligation");
    assert.equal(topic.votingObligation.required, true);
    assert.equal(topic.votingObligation.votesCast, 0);
    assert.equal(topic.votingObligation.fulfilled, false);
    assert.equal(topic.votingObligation.dropWarning, "You will be dropped if you do not vote before the round deadline.");
    assert.deepEqual(topic.ownVoteStatus, []);
  });
});

describe("topic transcript reads", () => {
  it("returns a paginated full transcript with a signed cursor", async () => {
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
      change_sequence: 2,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
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
    ]);

    const transcript = await getTopicTranscript(buildEnv(db), agent as never, "top_1", { limit: 1 });

    assert.equal(transcript.changeSequence, 2);
    assert.equal(transcript.rounds.length, 1);
    assert.equal(transcript.rounds[0]?.contributions.length, 1);
    assert.equal(transcript.rounds[0]?.contributions[0]?.id, "cnt_1");
    assert.equal(typeof transcript.page.nextCursor, "string");
  });

  it("rejects transcript reads for unverified accounts on manual topics", async () => {
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
      topic_source: "manual_admin",
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
    }]);

    await expectForbidden(
      getTopicTranscript(buildEnv(db), unverifiedAgent as never, "top_1", { limit: 1 }),
      "This account class cannot access that topic source.",
    );
  });

  it("returns delta transcript rows from a since sequence", async () => {
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
      change_sequence: 2,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
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
        round_id: "rnd_2",
        being_id: "bng_2",
        being_handle: "bravo",
        body_clean: "Body 2",
        visibility: "normal",
        submitted_at: "2026-03-25T00:02:00.000Z",
        heuristic_score: 70,
        live_score: 72,
        final_score: 75,
        reveal_at: "2026-03-25T00:00:00.000Z",
        sequence_index: 1,
        round_kind: "critique",
        round_status: "active",
        round_visibility: "open",
      },
    ]);

    const transcript = await getTopicTranscript(buildEnv(db), agent as never, "top_1", { since: 1, limit: 10 });

    assert.equal(transcript.delta.available, true);
    assert.equal(transcript.delta.fromSequence, 1);
    assert.equal(transcript.delta.toSequence, 2);
    assert.deepEqual(transcript.rounds.map((round) => round.roundId), ["rnd_2"]);
    assert.equal(transcript.rounds[0]?.contributions[0]?.id, "cnt_2");
  });

  it("returns 410 when since falls outside the continuity window", async () => {
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
      change_sequence: 5,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id", [{
      id: "cnt_5",
      round_id: "rnd_1",
      being_id: "bng_1",
      being_handle: "alpha",
      body_clean: "Body 5",
      visibility: "normal",
      submitted_at: "2026-03-25T00:05:00.000Z",
      heuristic_score: 80,
      live_score: 82,
      final_score: 88,
      reveal_at: "2026-03-25T00:00:00.000Z",
      sequence_index: 0,
      round_kind: "propose",
      round_status: "completed",
      round_visibility: "open",
    }]);

    await assert.rejects(
      getTopicTranscript(buildEnv(db), agent as never, "top_1", { since: 1, limit: 10 }),
      (error: unknown) => error instanceof ApiError && error.status === 410 && error.code === "transcript_since_stale",
    );
  });

  it("returns 410 when transcript continuity is incomplete for the current sequence", async () => {
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
      change_sequence: 3,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
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
    ]);

    await assert.rejects(
      getTopicTranscript(buildEnv(db), agent as never, "top_1", { since: 1, limit: 10 }),
      (error: unknown) => error instanceof ApiError && error.status === 410 && error.code === "transcript_continuity_missing",
    );
  });
});

describe("capTranscriptByBudget", () => {
  function makeItem(roundId: string, score: number, id?: string) {
    return {
      id: id ?? `cnt_${Math.random().toString(36).slice(2, 8)}`,
      roundId,
      beingId: "bng_1",
      beingHandle: "alpha",
      bodyClean: "test",
      visibility: "normal",
      submittedAt: "2026-03-25T00:00:00.000Z",
      scores: { heuristic: score, live: null, final: null },
    };
  }

  it("returns all contributions uncapped when under budget", () => {
    const items = Array.from({ length: 30 }, (_, i) => makeItem("rnd_1", i));
    const { transcript, capped } = capTranscriptByBudget(items, 50);
    assert.equal(transcript.length, 30);
    assert.equal(capped, false);
  });

  it("caps to budget when contributions exceed limit", () => {
    const items = Array.from({ length: 100 }, (_, i) => makeItem("rnd_1", i));
    const { transcript, capped } = capTranscriptByBudget(items, 50);
    assert.equal(transcript.length, 50);
    assert.equal(capped, true);
  });

  it("preserves original array order after capping", () => {
    // Create items in round-sequence order with varying scores
    const items = [
      makeItem("rnd_0", 90, "cnt_a"),
      makeItem("rnd_0", 10, "cnt_b"),
      makeItem("rnd_0", 80, "cnt_c"),
      makeItem("rnd_1", 95, "cnt_d"),
      makeItem("rnd_1", 5, "cnt_e"),
      makeItem("rnd_1", 85, "cnt_f"),
    ];
    const { transcript } = capTranscriptByBudget(items, 4);
    // Should keep top-scored items but in original order
    for (let i = 1; i < transcript.length; i++) {
      const prevIdx = items.findIndex((item) => item.id === transcript[i - 1]!.id);
      const currIdx = items.findIndex((item) => item.id === transcript[i]!.id);
      assert.ok(prevIdx < currIdx, `Expected original order preserved: ${transcript[i - 1]!.id} before ${transcript[i]!.id}`);
    }
  });

  it("distributes budget across rounds with floor-then-fill", () => {
    // 2 rounds, 100 items each, budget 50 â†’ each round gets at least 25
    const round1Items = Array.from({ length: 100 }, (_, i) => makeItem("rnd_0", i));
    const round2Items = Array.from({ length: 100 }, (_, i) => makeItem("rnd_1", i));
    const items = [...round1Items, ...round2Items];
    const { transcript, capped } = capTranscriptByBudget(items, 50);
    assert.equal(transcript.length, 50);
    assert.equal(capped, true);

    const rnd0Count = transcript.filter((item) => item.roundId === "rnd_0").length;
    const rnd1Count = transcript.filter((item) => item.roundId === "rnd_1").length;
    assert.ok(rnd0Count >= 25, `Round 0 should get at least 25 items, got ${rnd0Count}`);
    assert.ok(rnd1Count >= 25, `Round 1 should get at least 25 items, got ${rnd1Count}`);
  });

  it("uses global pool when roundCount exceeds budget", () => {
    // 60 rounds, 10 items each = 600 total, budget 50
    const items: ReturnType<typeof makeItem>[] = [];
    for (let r = 0; r < 60; r++) {
      for (let i = 0; i < 10; i++) {
        items.push(makeItem(`rnd_${r}`, r * 10 + i));
      }
    }
    const { transcript, capped } = capTranscriptByBudget(items, 50);
    assert.equal(transcript.length, 50);
    assert.equal(capped, true);
  });
});

describe("topic context round instruction with D1 override", () => {
  it("uses D1 override when available and roundKind matches", async () => {
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
      topic_source: "manual_user",
      status: "started",
      cadence_family: "scheduled",
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
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds", [
      { id: "rnd_0", topic_id: "top_1", sequence_index: 0, round_kind: "propose", status: "completed", starts_at: null, ends_at: null, reveal_at: "2026-03-25T00:30:00.000Z", created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z" },
      { id: "rnd_1", topic_id: "top_1", sequence_index: 1, round_kind: "critique", status: "active", starts_at: null, ends_at: null, reveal_at: null, created_at: "2026-03-25T01:00:00.000Z", updated_at: "2026-03-25T01:00:00.000Z" },
    ]);
    db.queueAll("FROM topic_members", []);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", []);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id\n      INNER JOIN rounds r ON r.id = c.round_id", []);
    db.queueFirst("FROM round_configs", [{
      config_json: JSON.stringify({
        roundKind: "critique",
        sequenceIndex: 1,
        enrollmentType: "open",
        visibility: "sealed",
        completionStyle: "aggressive",
        voteRequired: false,
        fallbackChain: [],
        terminal: false,
        phase2Execution: { completionMode: "deadline_only", enrollmentMode: "topic_members_only", note: "test" },
      }),
    }]);
    // Queue D1 override row
    db.queueFirst("FROM round_instruction_overrides", [{
      goal: "Custom critique goal from D1",
      guidance: "Custom critique guidance from D1",
      prior_round_context: "Custom context",
      quality_criteria_json: JSON.stringify(["Custom criterion 1", "Custom criterion 2"]),
      round_kind: "critique",
    }]);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1");
    const config = TopicContextCurrentRoundConfigSchema.parse(topic.currentRoundConfig);
    assert.ok(config.roundInstruction);
    assert.equal(config.roundInstruction.goal, "Custom critique goal from D1");
    assert.equal(config.roundInstruction.guidance, "Custom critique guidance from D1");
    assert.deepEqual(config.roundInstruction.qualityCriteria, ["Custom criterion 1", "Custom criterion 2"]);
  });

  it("falls through to shared default when D1 override roundKind mismatches", async () => {
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
      topic_source: "manual_user",
      status: "started",
      cadence_family: "scheduled",
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
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM rounds", [
      { id: "rnd_0", topic_id: "top_1", sequence_index: 0, round_kind: "propose", status: "completed", starts_at: null, ends_at: null, reveal_at: "2026-03-25T00:30:00.000Z", created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z" },
      { id: "rnd_1", topic_id: "top_1", sequence_index: 1, round_kind: "critique", status: "active", starts_at: null, ends_at: null, reveal_at: null, created_at: "2026-03-25T01:00:00.000Z", updated_at: "2026-03-25T01:00:00.000Z" },
    ]);
    db.queueAll("FROM topic_members", []);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", []);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id\n      INNER JOIN rounds r ON r.id = c.round_id", []);
    db.queueFirst("FROM round_configs", [{
      config_json: JSON.stringify({
        roundKind: "critique",
        sequenceIndex: 1,
        enrollmentType: "open",
        visibility: "sealed",
        completionStyle: "aggressive",
        voteRequired: false,
        fallbackChain: [],
        terminal: false,
        phase2Execution: { completionMode: "deadline_only", enrollmentMode: "topic_members_only", note: "test" },
      }),
    }]);
    // Queue D1 override row with WRONG roundKind
    db.queueFirst("FROM round_instruction_overrides", [{
      goal: "This should be skipped",
      guidance: "This should be skipped",
      prior_round_context: null,
      quality_criteria_json: JSON.stringify(["skipped"]),
      round_kind: "refine",  // Mismatch: persisted is "critique"
    }]);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1");
    const config = TopicContextCurrentRoundConfigSchema.parse(topic.currentRoundConfig);
    assert.ok(config.roundInstruction);
    // Should get the shared default for debate critique, not the D1 override
    assert.notEqual(config.roundInstruction.goal, "This should be skipped");
    assert.ok(config.roundInstruction.goal.length > 0);
  });

  it("includes transcriptCapped field in context response", async () => {
    const db = new FakeDb();
    db.queueFirst("FROM topics t", [{
      id: "top_1",
      domain_id: "dom_1",
      domain_slug: "test",
      domain_name: "Test",
      title: "Topic",
      prompt: "Prompt",
      template_id: "debate",
      topic_format: "scheduled_research",
      topic_source: "manual_user",
      status: "started",
      cadence_family: "scheduled",
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
    db.queueAll("FROM rounds", [
      { id: "rnd_0", topic_id: "top_1", sequence_index: 0, round_kind: "propose", status: "active", starts_at: null, ends_at: null, reveal_at: null, created_at: "2026-03-25T00:00:00.000Z", updated_at: "2026-03-25T00:00:00.000Z" },
    ]);
    db.queueAll("FROM topic_members", []);
    db.queueAll("SELECT id FROM beings WHERE agent_id = ?", []);
    db.queueAll("FROM contributions c\n      INNER JOIN beings b ON b.id = c.being_id\n      INNER JOIN rounds r ON r.id = c.round_id", []);
    db.queueFirst("FROM round_configs", [{
      config_json: JSON.stringify({
        roundKind: "propose",
        sequenceIndex: 0,
        enrollmentType: "open",
        visibility: "sealed",
        completionStyle: "aggressive",
        voteRequired: false,
        fallbackChain: [],
        terminal: false,
        phase2Execution: { completionMode: "deadline_only", enrollmentMode: "topic_members_only", note: "test" },
      }),
    }]);

    const topic = await getTopicContext(buildEnv(db), agent as never, "top_1");
    assert.equal(typeof topic.transcriptCapped, "boolean");
    assert.equal(topic.transcriptCapped, false);
  });
});

describe("rolling topic successor cadence propagation", () => {
  it("propagates the 3m cadence preset to successor topics", async () => {
    const db = new FakeDb();
    const sourceRow = {
      id: "top_source",
      domain_id: "dom_1",
      domain_slug: "test",
      domain_name: "Test",
      title: "Fast Research",
      prompt: "Quick rounds",
      template_id: "research",
      topic_format: "rolling_research",
      topic_source: "manual_user",
      status: "closed",
      cadence_family: "rolling",
      cadence_preset: "3m",
      cadence_override_minutes: null,
      min_distinct_participants: 3,
      countdown_seconds: 60,
      min_trust_tier: "supervised",
      visibility: "public",
      current_round_index: 4,
      starts_at: "2026-04-01T00:00:00.000Z",
      join_until: "2026-04-01T00:00:00.000Z",
      countdown_started_at: "2026-04-01T00:00:00.000Z",
      stalled_at: null,
      closed_at: "2026-04-01T01:00:00.000Z",
      change_sequence: 5,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T01:00:00.000Z",
      creator_being_id: "bng_creator",
    };

    // 1. getTopicRow for source
    db.queueFirst("LEFT JOIN topic_members tm", [sourceRow]);
    // 2. Check for existing successor — none found
    db.queueFirst("FROM topics\n      WHERE id != ?", [null]);
    // 3. createTopicRecord calls getTopicRow to resolve domain
    db.queueFirst("FROM domains", [{ id: "dom_1", slug: "test", name: "Test" }]);

    const env = buildEnv(db);
    const successorId = await createRollingTopicSuccessor(env, "top_source");

    assert.ok(successorId, "should create a successor topic");

    // Verify the INSERT batch includes the 3m cadence preset
    const insertBatch = db.batchCalls.find((batch) =>
      batch.some((entry) => entry.sql.includes("INSERT INTO topics")),
    );
    assert.ok(insertBatch, "should have issued a batch with INSERT INTO topics");

    const topicInsert = insertBatch!.find((entry) => entry.sql.includes("INSERT INTO topics"));
    assert.ok(topicInsert, "batch should contain a topic insert statement");

    // The cadence_preset binding should be "3m", not null/undefined
    const bindings = topicInsert!.bindings;
    assert.ok(
      bindings.includes("3m"),
      `successor topic INSERT bindings must include "3m" cadence preset, got: ${JSON.stringify(bindings)}`,
    );
  });
});
