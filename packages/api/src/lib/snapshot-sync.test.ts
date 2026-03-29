import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncTopicSnapshots } from "./snapshot-sync.js";

class FakeBucket {
  readonly writes: Array<{
    bucket: string;
    key: string;
    body: string;
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } };
  }> = [];

  constructor(private readonly name: string) {}

  async put(key: string, value: string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
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
  it("writes transcript first, state second, curated third with Phase 4 scores and verdict metadata", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket("SNAPSHOTS");
    const curated = new FakeBucket("PUBLIC_ARTIFACTS");

    db.queueFirst("FROM topics", [
      {
        id: "top_1",
        domain_id: "dom_1",
        title: "Topic",
        prompt: "Prompt",
        template_id: "debate_v2",
        topic_format: "scheduled_research",
        status: "closed",
        min_distinct_participants: 3,
        countdown_seconds: null,
        current_round_index: 0,
        change_sequence: 4,
        updated_at: "2026-03-25T00:00:00.000Z",
      },
    ]);
    db.queueAll("FROM contributions", [
      {
        id: "cnt_best",
        round_id: "rnd_1",
        being_id: "bng_1",
        being_handle: "alpha",
        body_clean: "Higher scored body",
        visibility: "normal",
        submitted_at: "2026-03-25T00:01:00.000Z",
        heuristic_score: 81,
        live_score: null,
        final_score: 88,
      },
      {
        id: "cnt_low_conf",
        round_id: "rnd_1",
        being_id: "bng_2",
        being_handle: "beta",
        body_clean: "Needs review",
        visibility: "low_confidence",
        submitted_at: "2026-03-25T00:00:00.000Z",
        heuristic_score: 55,
        live_score: null,
        final_score: 61,
      },
      {
        id: "cnt_round_2",
        round_id: "rnd_2",
        being_id: "bng_3",
        being_handle: "gamma",
        body_clean: "Round two body",
        visibility: "normal",
        submitted_at: "2026-03-25T00:02:00.000Z",
        heuristic_score: 42,
        live_score: null,
        final_score: 49,
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
        sequence_index: 0,
        round_kind: "propose",
        status: "closed",
        starts_at: "2026-03-25T00:00:00.000Z",
        ends_at: "2026-03-25T01:00:00.000Z",
      },
      {
        id: "rnd_2",
        sequence_index: 1,
        round_kind: "refine",
        status: "active",
        starts_at: "2026-03-25T01:00:00.000Z",
        ends_at: "2026-03-25T02:00:00.000Z",
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
    assert.equal(curated.writes[0]?.key, "curated/open.json");
    assert.equal(snapshots.writes[0]?.options?.httpMetadata?.cacheControl, "public, max-age=30");
    assert.equal(snapshots.writes[1]?.options?.httpMetadata?.cacheControl, "public, max-age=10");
    assert.equal(curated.writes[0]?.options?.httpMetadata?.cacheControl, "public, max-age=10");

    const transcriptPayload = JSON.parse(snapshots.writes[0]?.body ?? "{}");
    assert.equal(transcriptPayload.topicId, "top_1");
    assert.equal(transcriptPayload.topicPrompt, "Prompt");
    assert.equal(transcriptPayload.templateId, "debate_v2");
    assert.equal(transcriptPayload.transcriptVersion, 2);
    assert.equal(transcriptPayload.changeSequence, 4);
    assert.deepEqual(transcriptPayload.rounds.map((round: { roundId: string }) => round.roundId), ["rnd_1", "rnd_2"]);
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
    assert.equal(statePayload.transcriptVersion, 2);
    assert.equal(statePayload.changeSequence, 4);
    assert.equal(statePayload.verdict.summary, "Phase 4 verdict summary");
    assert.equal(statePayload.verdict.confidence, "moderate");

    const curatedPayload = JSON.parse(curated.writes[0]?.body ?? "{}");
    assert.deepEqual(
      curatedPayload.topics.map((topic: { id: string }) => topic.id),
      ["top_1", "top_2"],
    );

    assert.ok(db.runs.some((run) => run.sql.includes("INSERT INTO topic_artifacts")));
  });
});
