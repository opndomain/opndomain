import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* Polyfill Workers Cache API for Node test environment */
if (typeof globalThis.caches === "undefined") {
  const store = new Map<string, Response>();
  (globalThis as any).caches = {
    default: {
      async match(req: Request) { return store.get(req.url) ?? undefined; },
      async put(req: Request, res: Response) { store.set(req.url, res.clone()); },
      async delete(req: Request) { return store.delete(req.url); },
    },
    async open() { return (globalThis as any).caches.default; },
  };
}

import app from "./index.js";

/* ------------------------------------------------------------------ */
/*  Minimal mock bindings for the router Hono app                     */
/* ------------------------------------------------------------------ */

class FakeKV {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
  async list() { return { keys: [] }; }
}

class FakeR2 {
  private store = new Map<string, { text: () => Promise<string>; body: ReadableStream | null }>();
  set(key: string, value: string) {
    this.store.set(key, {
      text: async () => value,
      body: new ReadableStream({ start(ctrl) { ctrl.enqueue(new TextEncoder().encode(value)); ctrl.close(); } }),
    });
  }
  async get(key: string) { return this.store.get(key) ?? null; }
  async put() {}
  async head() { return null; }
}

class FakeDb {
  private results: Record<string, unknown[]> = {};
  queueResult(pattern: string, rows: unknown[]) {
    this.results[pattern] = rows;
  }
  prepare(sql: string) {
    const self = this;
    return {
      bind(..._args: unknown[]) { return this; },
      async first<T>(): Promise<T | null> {
        for (const [pattern, rows] of Object.entries(self.results)) {
          if (sql.includes(pattern)) {
            const row = rows.shift();
            return (row ?? null) as T | null;
          }
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        for (const [pattern, rows] of Object.entries(self.results)) {
          if (sql.includes(pattern)) {
            const r = [...rows] as T[];
            rows.length = 0;
            return { results: r };
          }
        }
        return { results: [] };
      },
      async run() { return { success: true }; },
    };
  }
  async batch(stmts: unknown[]) {
    return stmts.map(() => ({ success: true }));
  }
}

function buildEnv(db: FakeDb, artifacts?: FakeR2, snapshots?: FakeR2) {
  return {
    DB: db as never,
    PUBLIC_CACHE: new FakeKV() as never,
    PUBLIC_ARTIFACTS: (artifacts ?? new FakeR2()) as never,
    SNAPSHOTS: (snapshots ?? new FakeR2()) as never,
    API_SERVICE: {} as never,
    ROOT_DOMAIN: "opndomain.com",
    ROUTER_HOST: "opndomain.com",
    API_HOST: "api.opndomain.com",
    MCP_HOST: "mcp.opndomain.com",
    ROUTER_ORIGIN: "https://opndomain.com",
    API_ORIGIN: "https://api.opndomain.com",
    MCP_ORIGIN: "https://mcp.opndomain.com",
  } as never;
}

function ctx() { return { waitUntil() {} } as never; }

/* ------------------------------------------------------------------ */
/*  OG image route: /topics/:topicId/og.png                           */
/* ------------------------------------------------------------------ */

describe("GET /topics/:topicId/og.png", () => {
  it("returns 404 when topic does not exist", async () => {
    const db = new FakeDb();
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/nonexistent/og.png"),
      buildEnv(db),
      ctx(),
    );
    assert.equal(response.status, 404);
  });

  it("returns 404 when artifact is not published", async () => {
    const db = new FakeDb();
    db.queueResult("topic_artifacts", [{ id: "t1", artifact_status: "pending", og_image_key: null }]);
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/t1/og.png"),
      buildEnv(db),
      ctx(),
    );
    assert.equal(response.status, 404);
  });

  it("returns 404 when R2 object is missing", async () => {
    const db = new FakeDb();
    db.queueResult("topic_artifacts", [{ id: "t1", artifact_status: "published", og_image_key: "og/t1.png" }]);
    const artifacts = new FakeR2(); // empty — no object stored
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/t1/og.png"),
      buildEnv(db, artifacts),
      ctx(),
    );
    assert.equal(response.status, 404);
  });

  it("returns 200 image/png when published verdict card exists", async () => {
    const db = new FakeDb();
    db.queueResult("topic_artifacts", [{ id: "t1", artifact_status: "published", og_image_key: "og/t1.png" }]);
    const artifacts = new FakeR2();
    artifacts.set("og/t1.png", "PNG_BYTES");
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/t1/og.png"),
      buildEnv(db, artifacts),
      ctx(),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
  });
});

/* ------------------------------------------------------------------ */
/*  Topic page: OG/Twitter meta tags and share panel                  */
/* ------------------------------------------------------------------ */

describe("GET /topics/:topicId (meta tags and share panel)", () => {
  function topicMeta(overrides: Record<string, unknown> = {}) {
    return {
      id: "topic_1",
      title: "Test Topic",
      status: "closed",
      prompt: "Test prompt",
      template_id: "debate_v1",
      domain_name: "AI Safety",
      artifact_status: "published",
      verdict_html_key: "verdicts/topic_1.html",
      og_image_key: "og/topic_1.png",
      verdict_summary: "The verdict is in.",
      verdict_confidence: "high",
      member_count: 3,
      contribution_count: 10,
      ...overrides,
    };
  }

  it("emits og:image and twitter:card meta tags on closed topic with published artifact", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta()]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_1/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_1/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set("verdicts/topic_1.html", "<p>Verdict</p>");
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_1"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('og:image'), "should contain og:image meta tag");
    assert.ok(html.includes('twitter:card'), "should contain twitter:card meta tag");
    assert.ok(html.includes('og.png'), "og:image should reference the PNG endpoint");
  });

  it("renders share panel only on closed topics", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ status: "closed" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_1/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_1/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set("verdicts/topic_1.html", "<p>Verdict</p>");
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_1"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes("Share on X"), "closed topic should have share panel");
  });

  it("does not render share panel on open topics", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_open", status: "started", artifact_status: null, verdict_html_key: null, og_image_key: null })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_open/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_open/transcript.json", JSON.stringify({ rounds: [] }));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_open"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(!html.includes("Share on X"), "open topic should not have share panel");
  });
});
