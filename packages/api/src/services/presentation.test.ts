import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CACHE_GENERATION_LANDING,
  CACHE_INVALIDATION_EVENT_PREFIX,
  cacheGenerationDomainKey,
  cacheGenerationTopicKey,
  cacheGenerationVerdictKey,
} from "@opndomain/shared";
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
    const entry = Array.from(this.firstQueue.entries())
      .filter(([fragment]) => sql.includes(fragment))
      .sort((left, right) => right[0].length - left[0].length)[0];
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

function queueSnapshotReads(
  db: FakeDb,
  {
    status = "closed",
    repeatCount = 1,
    verdictRows,
  }: {
    status?: string;
    repeatCount?: number;
    verdictRows?: unknown[];
  } = {},
) {
  db.queueFirst("FROM topics", Array.from({ length: repeatCount }, () => ({
    id: "top_1",
    domain_id: "dom_1",
    domain_slug: "energy",
    title: "Topic",
    prompt: "Prompt",
    status,
    closed_at: "2026-03-25T02:00:00.000Z",
  })));
  db.queueFirst("FROM topics\n      WHERE id = ?", Array.from({ length: repeatCount }, () => ({
    id: "top_1",
    domain_id: "dom_1",
    title: "Topic",
    prompt: "Prompt",
    template_id: "debate_v2",
    status,
    current_round_index: 0,
    updated_at: "2026-03-25T00:00:00.000Z",
  })));
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
  db.queueFirst(
    "FROM verdicts",
    verdictRows
      ? verdictRows.flatMap((row) => [row, row])
      : Array.from({ length: repeatCount * 2 }, () => ({
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
        })),
  );
  db.queueAll("WHERE status IN ('open', 'started')", []);
  db.queueFirst("FROM topic_members", Array.from({ length: repeatCount }, () => ({ count: 1 })));
  db.queueFirst("SELECT COUNT(*) AS count\n      FROM contributions", Array.from({ length: repeatCount }, () => ({ count: 1 })));
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
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    assert.equal(result.retryQueued, false);
    assert.equal(result.artifact.artifactStatus, "published");
    const jsonWrite = publicArtifacts.writes.find((write) => write.key.endsWith("/verdict-presentation.json"));
    assert.ok(jsonWrite);
    assert.equal(jsonWrite?.options?.httpMetadata?.contentType, "application/json; charset=utf-8");
    const payload = JSON.parse(String(jsonWrite?.body ?? "{}"));
    assert.equal(payload.claimGraph.available, false);
    assert.equal(payload.editorialBody, null);
    assert.equal(payload.narrative[0]?.summary, "Lead signal: Body");
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
        ENABLE_EPISTEMIC_SCORING: false,
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
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    assert.equal(result.retryQueued, false);
    assert.equal(result.artifact.artifactStatus, "suppressed");
    assert.deepEqual(publicArtifacts.deletes.sort(), [
      "artifacts/topics/top_1/og.png",
      "artifacts/topics/top_1/verdict-presentation.json",
      "artifacts/topics/top_1/verdict.html",
    ]);
    assert.equal(publicArtifacts.writes.some((write) => write.options?.httpMetadata?.contentType === "text/html; charset=utf-8"), false);
  });

  it("falls back to a readable claim-graph note when epistemic scoring is enabled but no claim rows exist", async () => {
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
        ENABLE_EPISTEMIC_SCORING: true,
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    assert.equal(result.retryQueued, false);
    const jsonWrite = publicArtifacts.writes.find((write) => write.key.endsWith("/verdict-presentation.json"));
    assert.ok(jsonWrite);
    const payload = JSON.parse(String(jsonWrite?.body ?? "{}")) as {
      claimGraph: { available: boolean; fallbackNote: string | null };
    };
    assert.equal(payload.claimGraph.available, false);
    assert.equal(
      payload.claimGraph.fallbackNote,
      "Claim graph unavailable because no claim rows were published for this topic.",
    );
  });

  it("bumps public cache generations and clears retry state after a successful reconcile", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueSnapshotReads(db);
    cache.values.set("presentation-pending:top_1", JSON.stringify({ topicId: "top_1", attemptCount: 2 }));
    cache.values.set(CACHE_GENERATION_LANDING, "4");
    cache.values.set(cacheGenerationDomainKey("dom_1"), "7");
    cache.values.set(cacheGenerationTopicKey("top_1"), "9");
    cache.values.set(cacheGenerationVerdictKey("top_1"), "11");

    const result = await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
      "cache_invalidation",
    );

    assert.deepEqual(result.invalidationKeys, [
      CACHE_GENERATION_LANDING,
      cacheGenerationDomainKey("dom_1"),
      cacheGenerationTopicKey("top_1"),
      cacheGenerationVerdictKey("top_1"),
    ]);
    assert.equal(cache.values.has("presentation-pending:top_1"), false);
    assert.equal(cache.values.get(CACHE_GENERATION_LANDING), "5");
    assert.equal(cache.values.get(cacheGenerationDomainKey("dom_1")), "8");
    assert.equal(cache.values.get(cacheGenerationTopicKey("top_1")), "10");
    assert.equal(cache.values.get(cacheGenerationVerdictKey("top_1")), "12");
    assert.ok(cache.values.has(`${CACHE_INVALIDATION_EVENT_PREFIX}top_1`));
  });

  it("replaces stale verdict artifact metadata on repeat publication", async () => {
    const db = new FakeDb();
    const snapshots = new FakeBucket();
    const publicArtifacts = new FakeBucket();
    const cache = new FakeCache();
    queueSnapshotReads(db, {
      repeatCount: 2,
      verdictRows: [
        {
          confidence: "moderate",
          terminalization_mode: "degraded_template",
          summary: "Initial summary",
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
          confidence: "strong",
          terminalization_mode: "full_template",
          summary: "Updated summary after reterminalize",
          reasoning_json: JSON.stringify({
            editorialBody:
              "The topic closed with stronger late-round convergence after rebuttal pressure narrowed the live disagreement.\n\nReterminalization preserved the same publication path while refreshing the long-form verdict copy.",
            topContributionsPerRound: [
              {
                roundKind: "propose",
                contributions: [{ contributionId: "cnt_1", beingId: "bng_1", finalScore: 88, excerpt: "Updated body" }],
              },
            ],
            completedRounds: 2,
            totalRounds: 2,
          }),
        },
      ],
    });
    db.queueFirst("FROM topic_artifacts", [
      null,
      {
        transcript_snapshot_key: "topics/top_1/transcript.json",
        state_snapshot_key: "topics/top_1/state.json",
        verdict_html_key: "legacy/topic_1.html",
        og_image_key: "legacy/topic_1.png",
        artifact_status: "published",
      },
    ]);

    await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
      "reconcile_unknown",
    );
    const firstWriteCount = publicArtifacts.writes.length;

    const result = await reconcileTopicPresentation(
      {
        DB: db as never,
        SNAPSHOTS: snapshots as never,
        PUBLIC_ARTIFACTS: publicArtifacts as never,
        PUBLIC_CACHE: cache as never,
        TOPIC_TRANSCRIPT_PREFIX: "topics",
        CURATED_OPEN_KEY: "curated/open.json",
        ENABLE_EPISTEMIC_SCORING: false,
      } as never,
      "top_1",
      "reconcile_unknown",
    );

    const secondRunWrites = publicArtifacts.writes.slice(firstWriteCount);
    const jsonWrite = secondRunWrites.find((write) => write.key.endsWith("/verdict-presentation.json"));
    assert.equal(result.artifact.verdictHtmlKey, "artifacts/topics/top_1/verdict.html");
    assert.equal(result.artifact.ogImageKey, "artifacts/topics/top_1/og.png");
    assert.ok(jsonWrite);
    assert.equal(
      (JSON.parse(String(jsonWrite?.body ?? "{}")) as { summary: string }).summary,
      "Updated summary after reterminalize",
    );
    assert.match(
      (JSON.parse(String(jsonWrite?.body ?? "{}")) as { editorialBody?: string | null }).editorialBody ?? "",
      /late-round convergence/i,
    );
    assert.equal(secondRunWrites.some((write) => write.key.includes("legacy/")), false);
  });
});
