import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncTopicSnapshots } from "./snapshot-sync.js";

class FakeBucket {
  readonly failKeys = new Set<string>();
  readonly writes: Array<{
    bucket: string;
    key: string;
    body: string;
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } };
  }> = [];

  constructor(private readonly name: string) {}

  async put(key: string, value: string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
    if (this.failKeys.has(key)) {
      throw new Error(`forced failure for ${key}`);
    }
    this.writes.push({ bucket: this.name, key, body: value, options });
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
    return { success: true };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
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
    return entry[1][0] as T;
  }

  consumeAll<T>(sql: string): T[] {
    const entry = Array.from(this.allQueue.entries()).find(([fragment]) => sql.includes(fragment));
    if (!entry) {
      return [];
    }
    return entry[1] as T[];
  }
}

describe("snapshot sync", () => {
  it("writes transcript, state, manifest, and curated artifacts with Phase 4 scores and verdict metadata", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket("SNAPSHOTS");
    const curated = new FakeBucket("PUBLIC_ARTIFACTS");

    db.queueFirst("FROM topics", [
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
        status: "closed",
        cadence_family: "quality_gated",
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
        closed_at: "2026-03-25T02:00:00.000Z",
        change_sequence: 4,
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueFirst("FROM domains", [{
      slug: "ai-safety",
      name: "AI Safety",
    }]);
    db.queueAll("FROM contributions", [
      {
        id: "cnt_best",
        round_id: "rnd_1",
        being_id: "bng_1",
        being_handle: "alpha",
        display_name: "Alpha",
        body_clean: "Higher scored body",
        visibility: "normal",
        submitted_at: "2026-03-25T00:01:00.000Z",
        heuristic_score: 81,
        live_score: null,
        final_score: 88,
        reveal_at: "2026-03-25T01:00:00.000Z",
        round_visibility: "open",
        round_kind: "propose",
        sequence_index: 0,
      },
      {
        id: "cnt_low_conf",
        round_id: "rnd_1",
        being_id: "bng_2",
        being_handle: "beta",
        display_name: "Beta",
        body_clean: "Needs review",
        visibility: "low_confidence",
        submitted_at: "2026-03-25T00:00:00.000Z",
        heuristic_score: 55,
        live_score: null,
        final_score: 61,
        reveal_at: "2026-03-25T01:00:00.000Z",
        round_visibility: "open",
        round_kind: "propose",
        sequence_index: 0,
      },
      {
        id: "cnt_round_2",
        round_id: "rnd_2",
        being_id: "bng_3",
        being_handle: "gamma",
        display_name: "Gamma",
        body_clean: "Round two body",
        visibility: "normal",
        submitted_at: "2026-03-25T00:02:00.000Z",
        heuristic_score: 42,
        live_score: null,
        final_score: 49,
        reveal_at: null,
        round_visibility: "sealed",
        round_kind: "vote",
        sequence_index: 1,
      },
    ]);
    db.queueFirst("FROM verdicts", [{
      confidence: "moderate",
      terminalization_mode: "degraded_template",
      summary: "Phase 4 verdict summary",
      reasoning_json: JSON.stringify({ topContributionsPerRound: [{ contributionId: "cnt_best" }] }),
    }]);
    db.queueAll("WHERE status IN ('open', 'started')", [
      {
        id: "top_1",
        title: "Topic",
        status: "started",
        updated_at: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "top_2",
        title: "Open Topic",
        status: "open",
        updated_at: "2026-03-25T00:01:00.000Z",
      },
    ]);
    db.queueAll("FROM rounds", [
      {
        id: "rnd_1",
        topic_id: "top_1",
        sequence_index: 0,
        round_kind: "propose",
        status: "closed",
        starts_at: "2026-03-25T00:00:00.000Z",
        ends_at: "2026-03-25T01:00:00.000Z",
        reveal_at: "2026-03-25T01:00:00.000Z",
        round_visibility: "open",
        config_json: JSON.stringify({
          roundKind: "propose",
          sequenceIndex: 0,
          enrollmentType: "open",
          visibility: "open",
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
        created_at: "2026-03-25T00:00:00.000Z",
        updated_at: "2026-03-25T01:00:00.000Z",
      },
      {
        id: "rnd_2",
        topic_id: "top_1",
        sequence_index: 1,
        round_kind: "vote",
        status: "active",
        starts_at: "2026-03-25T01:00:00.000Z",
        ends_at: "2026-03-25T02:00:00.000Z",
        reveal_at: null,
        round_visibility: "sealed",
        config_json: JSON.stringify({
          roundKind: "vote",
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
        created_at: "2026-03-25T01:00:00.000Z",
        updated_at: "2026-03-25T01:00:00.000Z",
      },
    ]);
    db.queueAll("FROM topic_members tm", [
      {
        being_id: "bng_1",
        handle: "alpha",
        display_name: "Alpha",
        role: "participant",
        status: "active",
      },
      {
        being_id: "bng_2",
        handle: "beta",
        display_name: "Beta",
        role: "participant",
        status: "active",
      },
    ]);
    db.queueFirst("FROM topic_members", [{ count: 4 }]);
    db.queueFirst("FROM contributions", [{ count: 3 }]);

    await syncTopicSnapshots(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: curated as never,
        PUBLIC_CACHE: { delete: async () => undefined } as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
      "test",
    );

    assert.equal(snapshots.writes[0]?.key, "topics/top_1/transcript.json");
    assert.equal(snapshots.writes[1]?.key, "topics/top_1/state.json");
    assert.equal(snapshots.writes[2]?.key, "topics/top_1/shared-context.json");
    assert.equal(snapshots.writes[3]?.key, "exports/v1/topic=top_1/change_sequence=4/manifest.json");
    assert.equal(curated.writes[0]?.key, "curated/open.json");
    assert.equal(snapshots.writes[0]?.options?.httpMetadata?.cacheControl, "public, s-maxage=0, max-age=30");
    assert.equal(snapshots.writes[1]?.options?.httpMetadata?.cacheControl, "public, s-maxage=0, max-age=10");
    assert.equal(snapshots.writes[2]?.options?.httpMetadata?.cacheControl, "public, s-maxage=0, max-age=10");
    assert.equal(curated.writes[0]?.options?.httpMetadata?.cacheControl, "public, s-maxage=0, max-age=10");

    const transcriptPayload = JSON.parse(snapshots.writes[0]?.body ?? "{}");
    assert.equal(transcriptPayload.topicId, "top_1");
    assert.equal(transcriptPayload.topicPrompt, "Prompt");
    assert.equal(transcriptPayload.templateId, "debate");
    assert.equal(transcriptPayload.transcriptVersion, 1);
    assert.equal(transcriptPayload.changeSequence, 4);
    assert.deepEqual(transcriptPayload.rounds.map((round: { roundId: string }) => round.roundId), ["rnd_1"]);
    assert.deepEqual(
      transcriptPayload.rounds[0].contributions.map((item: { id: string }) => item.id),
      ["cnt_best", "cnt_low_conf"],
    );
    assert.equal(transcriptPayload.rounds[0].contributions[0].bodyClean, "Higher scored body");
    assert.equal(transcriptPayload.rounds[0].contributions[0].beingHandle, "alpha");
    assert.equal(transcriptPayload.rounds[0].contributions[0].scores.final, 88);

    const statePayload = JSON.parse(snapshots.writes[1]?.body ?? "{}");
    assert.equal(statePayload.topicFormat, "scheduled_research");
    assert.equal(statePayload.formatSummary.label, "Scheduled Research");
    assert.equal(statePayload.memberCount, 4);
    assert.equal(statePayload.contributionCount, 3);
    assert.equal(statePayload.transcriptVersion, 1);
    assert.equal(statePayload.changeSequence, 4);
    assert.equal(statePayload.verdict.summary, "Phase 4 verdict summary");
    assert.equal(statePayload.verdict.confidence, "moderate");

    const sharedPayload = JSON.parse(snapshots.writes[2]?.body ?? "{}");
    assert.equal(sharedPayload.id, "top_1");
    assert.equal(sharedPayload.changeSequence, 4);
    assert.equal(sharedPayload.currentRound.id, "rnd_2");
    assert.equal(sharedPayload.currentRoundConfig.voteRequired, true);
    assert.equal(sharedPayload.transcript.length, 2);
    assert.equal(sharedPayload.transcriptCapped, false);
    assert.equal(sharedPayload.members[0].ownedByCurrentAgent, undefined);

    const manifestPayload = JSON.parse(snapshots.writes[3]?.body ?? "{}");
    assert.equal(manifestPayload.kind, "topic_snapshot_export");
    assert.equal(manifestPayload.sourceReason, "test");
    assert.equal(manifestPayload.transcript.key, "topics/top_1/transcript.json");
    assert.equal(manifestPayload.state.key, "topics/top_1/state.json");
    assert.equal(manifestPayload.sharedContext.key, "topics/top_1/shared-context.json");

    const curatedPayload = JSON.parse(curated.writes[0]?.body ?? "{}");
    assert.deepEqual(
      curatedPayload.topics.map((topic: { id: string }) => topic.id),
      ["top_1", "top_2"],
    );

    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO topic_artifacts")));
  });

  it("logs shared-context snapshot write failures and still writes the manifest", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket("SNAPSHOTS");
    const curated = new FakeBucket("PUBLIC_ARTIFACTS");
    const errors: unknown[][] = [];
    const info: unknown[][] = [];
    const originalError = console.error;
    const originalInfo = console.info;
    console.error = (...args: unknown[]) => { errors.push(args); };
    console.info = (...args: unknown[]) => { info.push(args); };

    db.queueFirst("FROM topics", [{
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
      current_round_index: 0,
      starts_at: null,
      join_until: null,
      countdown_started_at: null,
      stalled_at: null,
      closed_at: null,
      change_sequence: 9,
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueFirst("FROM domains", [{
      slug: "ai-safety",
      name: "AI Safety",
    }]);
    db.queueAll("FROM rounds", [{
      id: "rnd_1",
      topic_id: "top_1",
      sequence_index: 0,
      round_kind: "propose",
      status: "active",
      starts_at: "2026-03-25T00:00:00.000Z",
      ends_at: "2026-03-25T01:00:00.000Z",
      reveal_at: null,
      round_visibility: "sealed",
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
      created_at: "2026-03-25T00:00:00.000Z",
      updated_at: "2026-03-25T00:00:00.000Z",
    }]);
    db.queueAll("FROM topic_members tm", []);
    db.queueAll("FROM contributions", []);
    db.queueFirst("FROM topic_members", [{ count: 0 }]);
    db.queueFirst("FROM contributions", [{ count: 0 }]);
    db.queueAll("WHERE status IN ('open', 'started')", []);

    snapshots.failKeys.add("topics/top_1/shared-context.json");

    try {
      await syncTopicSnapshots(
        {
          DB: db as never,
          SNAPSHOTS: snapshots as never,
          PUBLIC_ARTIFACTS: curated as never,
          PUBLIC_CACHE: { delete: async () => undefined } as never,
          TOPIC_TRANSCRIPT_PREFIX: "topics",
          CURATED_OPEN_KEY: "curated/open.json",
        } as never,
        "top_1",
        "test",
      );
    } finally {
      console.error = originalError;
      console.info = originalInfo;
    }

    assert.equal(snapshots.writes.some((write) => write.key === "exports/v1/topic=top_1/change_sequence=9/manifest.json"), true);
    assert.equal(errors.some((entry) => String(entry[0]).includes("snapshot sync: shared context write failed")), true);
    assert.equal(info.some((entry) => String(entry[0]).includes("shared context write completed")), false);
  });
});
