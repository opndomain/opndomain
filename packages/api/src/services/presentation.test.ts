import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileTopicPresentation } from "./presentation.js";

class FakeBucket {
  writes: Array<{ key: string; body: unknown; options?: { httpMetadata?: { contentType?: string } } }> = [];
  deletes: string[] = [];
  failOnPut = false;

  async put(key: string, body: unknown, options?: { httpMetadata?: { contentType?: string } }) {
    if (this.failOnPut) {
      throw new Error("bucket failed");
    }
    this.writes.push({ key, body, options });
  }

  async delete(key: string) {
    this.deletes.push(key);
  }
}

class FakeCache {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async list({ prefix }: { prefix: string }) {
    return {
      keys: Array.from(this.values.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
    };
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
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDb {
  runs: Array<{ sql: string; bindings: unknown[] }> = [];
  private firstQueue = new Map<string, unknown[]>();
  private allQueue = new Map<string, unknown[]>();

  queueFirst(fragment: string, rows: unknown[]) {
    this.firstQueue.set(fragment, [...rows]);
  }

  queueAll(fragment: string, rows: unknown[]) {
    this.allQueue.set(fragment, [...rows]);
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
    return (entry?.[1] as T[]) ?? [];
  }
}

function queueSnapshotReads(db: FakeDb, status = "closed") {
  db.queueFirst("FROM topics WHERE id = ?", [{
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    status,
  }]);
  db.queueFirst("FROM topics\n      WHERE id = ?", [{
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate_v2",
    status,
    current_round_index: 0,
    updated_at: "2026-03-25T00:00:00.000Z",
  }]);
  db.queueAll("FROM rounds r\n      LEFT JOIN round_configs", [{
    id: "rnd_1",
    sequence_index: 0,
    round_kind: "propose",
    status: "completed",
    starts_at: "2026-03-25T00:00:00.000Z",
    ends_at: "2026-03-25T01:00:00.000Z",
    reveal_at: "2026-03-25T01:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueAll("FROM contributions c", [{
    id: "cnt_1",
    round_id: "rnd_1",
    being_id: "bng_1",
    being_handle: "alpha",
    body_clean: "Body",
    visibility: "normal",
    submitted_at: "2026-03-25T00:10:00.000Z",
    heuristic_score: 70,
    live_score: 70,
    final_score: 75,
    reveal_at: "2026-03-25T01:00:00.000Z",
    round_visibility: "open",
  }]);
  db.queueFirst("FROM verdicts", [
    {
      confidence: "moderate",
      terminalization_mode: "degraded_template",
      summary: "summary",
      reasoning_json: JSON.stringify({
        topContributionsPerRound: [
          {
            roundKind: "propose",
            contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 75, excerpt: "Body" }],
          },
        ],
        completedRounds: 1,
        totalRounds: 1,
      }),
    },
    {
      confidence: "moderate",
      terminalization_mode: "degraded_template",
      summary: "summary",
      reasoning_json: JSON.stringify({
        topContributionsPerRound: [
          {
            roundKind: "propose",
            contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 75, excerpt: "Body" }],
          },
        ],
        completedRounds: 1,
        totalRounds: 1,
      }),
    },
  ]);
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", [{ count: 1 }]);
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", [{ count: 1 }]);
}

describe("presentation reconcile", () => {
  it("publishes deterministic verdict HTML and OG image artifacts", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueSnapshotReads(db);

    const result = await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    assert.equal(result.retryQueued, false);
    assert.equal(result.artifact.artifactStatus, "published");
    assert.ok(publicArtifacts.writes.some((write) => write.key.endsWith("/verdict.html")));
    const ogWrite = publicArtifacts.writes.find((write) => write.key.endsWith("/og.png"));
    assert.ok(ogWrite);
    assert.equal(ogWrite?.options?.httpMetadata?.contentType, "image/png");
    assert.deepEqual(Array.from(ogWrite?.body as Uint8Array).slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("queues presentation retry state when artifact publication fails", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    publicArtifacts.failOnPut = true;
    const cache = new FakeCache();
    queueSnapshotReads(db);
    db.queueFirst("FROM topic_artifacts", [{
      transcript_snapshot_key: "topics/top_1/transcript.json",
      state_snapshot_key: "topics/top_1/state.json",
      verdict_html_key: null,
      og_image_key: null,
      artifact_status: "error",
    }]);

    const result = await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
      "artifact_render",
    );

    assert.equal(result.retryQueued, true);
    assert.equal(result.artifact.artifactStatus, "error");
    assert.ok(Array.from(cache.values.keys()).some((key) => key.startsWith("presentation-pending:top_1")));
  });

  it("suppresses artifacts for insufficient-signal verdicts by deleting both stable keys", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueSnapshotReads(db);
    db.queueFirst("FROM verdicts", [
      {
        confidence: "low",
        terminalization_mode: "insufficient_signal",
        summary: "Not enough signal",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [],
          completedRounds: 1,
          totalRounds: 1,
        }),
      },
      {
        confidence: "low",
        terminalization_mode: "insufficient_signal",
        summary: "Not enough signal",
        reasoning_json: JSON.stringify({
          topContributionsPerRound: [],
          completedRounds: 1,
          totalRounds: 1,
        }),
      },
    ]);

    const result = await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    assert.equal(result.retryQueued, false);
    assert.equal(result.artifact.artifactStatus, "suppressed");
    assert.deepEqual(publicArtifacts.deletes.sort(), [
      "artifacts/topics/top_1/og.png",
      "artifacts/topics/top_1/verdict.html",
    ]);
    assert.equal(publicArtifacts.writes.some((write) => write.options?.httpMetadata?.contentType === "text/html; charset=utf-8"), false);
  });
});
