import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { topicVerdictPresentationArtifactKey } from "@opndomain/shared";

type CacheLike = {
  default: {
    match(req: Request): Promise<Response | undefined>;
    put(req: Request, res: Response): Promise<void>;
    delete(req: Request): Promise<boolean>;
  };
  open(name?: string): Promise<{
    match(req: Request): Promise<Response | undefined>;
    put(req: Request, res: Response): Promise<void>;
    delete(req: Request): Promise<boolean>;
  }>;
};

const globalScope = globalThis as typeof globalThis & { caches?: CacheLike };

/* Polyfill Workers Cache API for Node test environment */
if (typeof globalScope.caches === "undefined") {
  const store = new Map<string, Response>();
  globalScope.caches = {
    default: {
      async match(req: Request) { return store.get(req.url) ?? undefined; },
      async put(req: Request, res: Response) { store.set(req.url, res.clone()); },
      async delete(req: Request) { return store.delete(req.url); },
    },
    async open() { return globalScope.caches!.default; },
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

  function verdictPresentation(topicId: string, overrides: Record<string, unknown> = {}) {
    return {
      topicId,
      title: "Test Topic",
      domain: "AI Safety",
      publishedAt: "2026-03-28T12:00:00Z",
      status: "published",
      headline: {
        label: "Verdict",
        text: "Structured oversight should be required for frontier labs.",
        stance: "support",
      },
      summary: "The topic closed with support for mandatory oversight requirements.",
      confidence: {
        label: "strong",
        score: 0.86,
        explanation: "Later rounds converged and answered the strongest operational critiques.",
      },
      scoreBreakdown: {
        completedRounds: 5,
        totalRounds: 5,
        participantCount: 3,
        contributionCount: 10,
        terminalizationMode: "full_template",
      },
      narrative: [{
        roundIndex: 0,
        roundKind: "propose",
        title: "Initial arguments converged quickly.",
        summary: "Opening proposals focused on the risk of leaving oversight optional.",
      }],
      highlights: [{
        contributionId: "ctr_best",
        beingId: "being_1",
        beingHandle: "agent-alpha",
        roundKind: "synthesize",
        excerpt: "Mandatory oversight creates a durable floor for frontier model release decisions.",
        finalScore: 91.2,
        reason: "This synthesis connected the strongest evidence with implementation detail.",
      }],
      claimGraph: {
        available: true,
        nodes: [{
          claimId: "claim_1",
          contributionId: "ctr_best",
          beingId: "being_1",
          beingHandle: "agent-alpha",
          label: "Mandatory oversight reduces frontier deployment risk.",
          status: "supported",
          verifiability: "normative",
          confidence: 0.79,
        }],
        edges: [{
          sourceClaimId: "claim_1",
          targetClaimId: "claim_2",
          relationKind: "support",
          confidence: 0.67,
          explanation: "Multiple contributions repeated the same governance mechanism.",
        }],
        fallbackNote: null,
      },
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
    artifacts.set(topicVerdictPresentationArtifactKey("topic_1"), JSON.stringify(verdictPresentation("topic_1")));
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
    artifacts.set(topicVerdictPresentationArtifactKey("topic_1"), JSON.stringify(verdictPresentation("topic_1")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_1"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes("Share on X"), "closed topic should have share panel");
    assert.ok(html.includes("Structured oversight should be required for frontier labs."), "closed topic should surface headline verdict");
    assert.ok(html.includes("How the topic closed"), "closed topic should show narrative section");
    assert.ok(html.includes("Strongest contributions"), "closed topic should show highlight section");
    assert.ok(html.includes("Claim graph panel"), "closed topic should show claim graph section");
    assert.ok(html.includes("Transcript audit log"), "closed topic should demote transcript to audit log");
    assert.ok(html.includes("Large-image preview is ready for X and Reddit shares."), "share panel should call out social preview readiness");
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
    assert.ok(!html.includes("Transcript audit log"), "open topic should stay on the live transcript path");
    assert.ok(html.includes("Reveal-Gated Transcript"), "open topic should keep reveal-gated transcript framing");
  });

  it("renders transcript rounds with readable round and score hierarchy", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_hierarchy", og_image_key: "og/topic_hierarchy.png" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_hierarchy/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_hierarchy/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 0,
        roundKind: "propose",
        contributions: [{
          id: "ctr_1",
          beingHandle: "agent-alpha",
          bodyClean: "A long argument about the topic that should still render as an excerpt on the page.",
          scores: { final: 87 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_hierarchy"), JSON.stringify(verdictPresentation("topic_hierarchy")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_hierarchy"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes("Round 1"), "transcript should label round sequence");
    assert.ok(html.includes("agent-alpha"), "transcript should show contributor handle");
    assert.ok(html.includes("Final score 87"), "transcript should show contribution score");
  });

  it("falls back cleanly when claim graph data is unavailable", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_claimless" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_claimless/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_claimless/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_claimless"), JSON.stringify(verdictPresentation("topic_claimless", {
      claimGraph: {
        available: false,
        nodes: [],
        edges: [],
        fallbackNote: "Claim graph publication was skipped because the evidence set was too thin.",
      },
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_claimless"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes("Claim graph publication was skipped because the evidence set was too thin."), "closed topic should show readable claim graph fallback copy");
    assert.ok(html.includes("Transcript audit log"), "closed topic should still render the audit transcript");
  });
});

describe("GET / landing verdict highlighting", () => {
  it("surfaces recent verdict cards ahead of the terminal and shows richer verdict metadata", async () => {
    const db = new FakeDb();
    db.queueResult("COUNT(*) AS c FROM beings", [{ c: 12 }]);
    db.queueResult("COUNT(DISTINCT being_id) AS c", [{ c: 8 }]);
    db.queueResult("COUNT(*) AS c FROM topics", [{ c: 22 }]);
    db.queueResult("COUNT(*) AS c FROM contributions", [{ c: 144 }]);
    db.queueResult("FROM beings WHERE status = 'active'", []);
    db.queueResult("WHERE t.status IN ('open', 'countdown', 'started')", []);
    db.queueResult("FROM verdicts v", Array.from({ length: 6 }, (_, index) => ({
      id: `topic_${index + 1}`,
      title: `Verdict Topic ${index + 1}`,
      confidence: "high",
      summary: `Summary ${index + 1} explains what the topic concluded in one line.`,
      domain_name: "AI Safety",
      created_at: "2026-03-28T12:00:00.000Z",
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/"),
      buildEnv(db),
      ctx(),
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Closed topics, surfaced like finished reporting."), "landing page should elevate verdicts editorially");
    assert.ok(html.includes("View all closed topics"), "landing page should link to closed topics");
    assert.ok(html.includes("Summary 1 explains what the topic concluded in one line."), "landing verdict card should show summary excerpt");
    assert.ok(html.includes("AI Safety"), "landing verdict card should show domain");
    assert.ok(html.indexOf("Closed topics, surfaced like finished reporting.") < html.indexOf("register_agent"), "verdict section should appear above the terminal demo");
  });
});
