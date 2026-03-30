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

class FakeApiService {
  private routes = new Map<string, Response>();

  set(path: string, body: unknown, status = 200) {
    this.routes.set(
      path,
      Response.json(body, { status }),
    );
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const response = this.routes.get(`${url.pathname}${url.search}`) ?? this.routes.get(url.pathname);
    return response?.clone() ?? Response.json({
      error: "not_found",
      message: `No fake API response for ${url.pathname}${url.search}`,
    }, { status: 404 });
  }
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

function buildEnv(db: FakeDb, artifacts?: FakeR2, snapshots?: FakeR2, apiService?: FakeApiService) {
  return {
    DB: db as never,
    PUBLIC_CACHE: new FakeKV() as never,
    PUBLIC_ARTIFACTS: (artifacts ?? new FakeR2()) as never,
    SNAPSHOTS: (snapshots ?? new FakeR2()) as never,
    API_SERVICE: (apiService ?? new FakeApiService()) as never,
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
    assert.ok(html.includes("https://api.opndomain.com/v1/topics/topic_1/views"), "public topic page should include the topic view beacon endpoint");
    assert.ok(html.includes('method: "POST"'), "topic view beacon should post to the backend endpoint");
  });

  it("renders share panel only on closed topics", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_featured", status: "closed" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_featured/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_featured/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 4,
        roundKind: "synthesize",
        contributions: [{
          id: "ctr_featured",
          beingHandle: "agent-alpha",
          bodyClean: "This is the strongest final-round answer and it should appear as the featured answer near the top of the page.",
          scores: { final: 93 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_featured"), JSON.stringify(verdictPresentation("topic_featured")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_featured"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes('class="topic-above-fold"'), "closed topic should render the above-the-fold layout");
    assert.ok(html.includes('class="topic-verdict-panel topic-verdict-panel--verdict"'), "closed topic should render a verdict panel");
    assert.ok(html.includes("Share on X"), "closed topic should have share panel");
    assert.ok(html.includes("Test prompt"), "closed topic should lead with the topic prompt");
    assert.ok(html.includes("Featured answer"), "closed topic should show featured answer section");
    assert.ok(html.includes("This is the strongest final-round answer and it should appear as the featured answer near the top of the page."), "featured answer should render full body text");
    assert.ok(html.includes("Top score 93"), "closed topic transcript summary should surface the top score");
    assert.ok(html.includes("How the topic closed"), "closed topic should show narrative section");
    assert.ok(html.includes("Strongest contributions"), "closed topic should show highlight section");
    assert.ok(html.includes("Claim graph panel"), "closed topic should show claim graph section");
    assert.ok(html.includes("Transcript</h3>"), "closed topic should keep transcript in the document flow");
    assert.ok(html.indexOf("Transcript</h3>") < html.indexOf("Claim graph panel"), "claim graph should render after transcript");
    assert.ok(html.indexOf("Claim graph panel") < html.indexOf("Share this closed topic"), "share panel should remain after claim graph");
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
    assert.ok(html.includes("Test prompt"), "open topic should also lead with the topic prompt");
    assert.ok(html.includes("Verdict will appear after closure"), "open topic should render a coherent no-verdict fallback");
    assert.ok(html.includes("Transcript</h3>"), "open topic should keep transcript in the page flow");
    assert.ok(html.includes("https://api.opndomain.com/v1/topics/topic_open/views"), "open public topic page should still include the topic view beacon endpoint");
  });

  it("renders transcript rounds with native disclosure, readable hierarchy, and score chips", async () => {
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
          bodyClean: "A long argument about the topic that should still render in full on the page, including the concluding sentence that used to get clipped by the transcript excerpt limit.",
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
    assert.ok(html.includes('<details class="topic-round-details">'), "transcript should render rounds as native disclosure blocks");
    assert.ok(html.includes("agent-alpha"), "transcript should show contributor handle");
    assert.ok(html.includes("#1"), "transcript should show derived rank cues");
    assert.ok(html.includes("Top score 87"), "transcript summary should show the top score");
    assert.ok(html.includes("Final score"), "transcript should show score chips");
    assert.ok(html.includes("including the concluding sentence that used to get clipped by the transcript excerpt limit."), "transcript should render full body text without clipping");
  });

  it("preserves paragraph breaks in contribution bodies", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_paragraphs" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_paragraphs/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_paragraphs/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 0,
        roundKind: "propose",
        contributions: [{
          id: "ctr_para",
          beingHandle: "agent-alpha",
          bodyClean: "First paragraph.\n\nSecond paragraph.",
          scores: { final: 81 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_paragraphs"), JSON.stringify(verdictPresentation("topic_paragraphs")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_paragraphs"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes("<p class=\"topic-contribution-paragraph\">First paragraph.</p><p class=\"topic-contribution-paragraph\">Second paragraph.</p>"), "contribution body should preserve paragraph breaks");
  });

  it("uses stable ranking tie-breaks for transcript cards and the featured answer", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_tie_break" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_tie_break/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_tie_break/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 4,
        roundKind: "synthesize",
        contributions: [
          {
            id: "ctr_first",
            beingHandle: "agent-alpha",
            bodyClean: "First final answer wins the tie-break because it appears first in transcript order.",
            scores: { final: 91 },
          },
          {
            id: "ctr_second",
            beingHandle: "agent-beta",
            bodyClean: "Second final answer loses the tie-break despite matching the same final score.",
            scores: { final: 91 },
          },
        ],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_tie_break"), JSON.stringify(verdictPresentation("topic_tie_break")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_tie_break"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.indexOf("First final answer wins the tie-break because it appears first in transcript order.") < html.indexOf("Second final answer loses the tie-break despite matching the same final score."), "featured answer should use transcript-order tie-break for equal scores");
    assert.ok(html.indexOf("@agent-alpha") < html.indexOf("@agent-beta"), "ranked transcript cards should keep transcript order for equal scores");
    assert.ok(html.indexOf("#1") < html.indexOf("#2"), "ranked transcript cards should expose deterministic rank labels");
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
    assert.ok(html.includes("Transcript</h3>"), "closed topic should still render transcript before fallback claim graph");
  });

  it("renders verdict pending and unavailable fallback panels for closed topics without published presentations", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [
      topicMeta({ id: "topic_pending", artifact_status: "pending", og_image_key: null, verdict_html_key: null }),
      topicMeta({ id: "topic_unavailable", artifact_status: "error", og_image_key: null, verdict_html_key: null }),
    ]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_pending/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_pending/transcript.json", JSON.stringify({ rounds: [] }));
    snapshots.set("topics/topic_unavailable/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_unavailable/transcript.json", JSON.stringify({ rounds: [] }));

    const pendingResponse = await app.fetch(
      new Request("https://opndomain.com/topics/topic_pending"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );
    const pendingHtml = await pendingResponse.text();
    assert.ok(pendingHtml.includes("Verdict pending"), "closed topic with pending artifact should explain the pending verdict state");
    assert.ok(pendingHtml.includes("Check back once the verdict presentation finishes publishing."), "pending verdict fallback should explain what happens next");

    const unavailableResponse = await app.fetch(
      new Request("https://opndomain.com/topics/topic_unavailable"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );
    const unavailableHtml = await unavailableResponse.text();
    assert.ok(unavailableHtml.includes("Verdict unavailable"), "closed topic with artifact error should explain the unavailable verdict state");
    assert.ok(unavailableHtml.includes("The transcript remains available below."), "unavailable verdict fallback should keep the transcript accessible");
  });
});

describe("GET /topics", () => {
  function queueTopicsApi(api: FakeApiService, overrides: {
    path?: string;
    topics?: Array<Record<string, unknown>>;
    domains?: Array<Record<string, unknown>>;
  } = {}) {
    api.set(overrides.path ?? "/v1/topics", {
      data: overrides.topics ?? [{
        id: "topic_1",
        title: "Should frontier model audits be mandatory?",
        status: "open",
        prompt: "Assess whether independent audits should be required before deployment.",
        templateId: "debate_v2",
        domainSlug: "ai-safety",
        domainName: "AI Safety",
        memberCount: 7,
        roundCount: 3,
        currentRoundIndex: 1,
        createdAt: "2026-03-25T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
      }],
    });
    api.set("/v1/domains", {
      data: overrides.domains ?? [
        { id: "dom_1", slug: "ai-safety", name: "AI Safety" },
        { id: "dom_2", slug: "energy", name: "Energy" },
      ],
    });
  }

  it("renders the topic directory from API-backed topics and domain filters", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api);

    const response = await app.fetch(
      new Request("https://opndomain.com/topics"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Topic directory"));
    assert.ok(html.includes("Should frontier model audits be mandatory?"));
    assert.ok(html.includes('value="ai-safety"'));
    assert.ok(html.includes('value="debate_v2"'));
  });

  it("renders an empty state when the API returns no topics", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api, { topics: [] });

    const response = await app.fetch(
      new Request("https://opndomain.com/topics?status=open"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("No topics matched those filters."));
    assert.ok(html.includes("<strong>Status</strong><span>open</span>"));
  });

  it("passes the public template filter to the API as templateId", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api, {
      path: "/v1/topics?templateId=debate_v2",
      topics: [{
        id: "topic_2",
        title: "Should grid operators mandate storage reserves?",
        status: "closed",
        prompt: "Evaluate reserve mandates for reliability.",
        templateId: "debate_v2",
        domainSlug: "energy",
        domainName: "Energy",
        memberCount: 4,
        roundCount: 5,
        currentRoundIndex: 4,
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z",
      }],
    });

    const response = await app.fetch(
      new Request("https://opndomain.com/topics?template=debate_v2"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Should grid operators mandate storage reserves?"));
    assert.ok(html.includes("<strong>Template</strong><span>debate_v2</span>"));
    assert.ok(html.includes('option value="debate_v2" selected'));
  });
});

describe("GET /analytics", () => {
  function queueAnalyticsApi(api: FakeApiService, overrides: {
    overview?: Record<string, unknown>;
    topics?: Array<Record<string, unknown>>;
    topicData?: Record<string, unknown> | null;
    reliability?: Record<string, unknown>;
    topicId?: string;
    range?: string;
    minVotes?: number;
  } = {}) {
    const range = overrides.range ?? "all";
    const topicId = overrides.topicId ?? "topic_1";
    const minVotes = overrides.minVotes ?? 5;
    const overviewPath = range === "all" ? "/v1/analytics/overview" : "/v1/analytics/overview?from=2026-03-01&to=2026-03-30";
    api.set(overviewPath, {
      data: overrides.overview ?? {
        generatedAt: "2026-03-30T12:00:00.000Z",
        window: { from: "2026-03-01", to: "2026-03-30" },
        totals: {
          totalTopics: 14,
          totalContributions: 122,
          totalVerdicts: 9,
          activeBeings: 18,
          activeAgents: 11,
        },
        series: [
          {
            rollupDate: "2026-03-28",
            topicsCreatedCount: 1,
            contributionsCreatedCount: 12,
            verdictsCreatedCount: 2,
            cumulativeTopics: 13,
            cumulativeContributions: 110,
            cumulativeVerdicts: 7,
            activeTopics: 4,
            activeBeings: 10,
            activeAgents: 7,
          },
          {
            rollupDate: "2026-03-29",
            topicsCreatedCount: 1,
            contributionsCreatedCount: 7,
            verdictsCreatedCount: 1,
            cumulativeTopics: 14,
            cumulativeContributions: 117,
            cumulativeVerdicts: 8,
            activeTopics: 5,
            activeBeings: 13,
            activeAgents: 8,
          },
        ],
      },
    });
    api.set("/v1/topics?status=closed", {
      data: overrides.topics ?? [{
        id: topicId,
        title: "Should frontier labs publish red-team results?",
        status: "closed",
      }],
    });
    if (overrides.topicData !== null) {
      api.set(`/v1/analytics/topic/${topicId}`, {
        data: overrides.topicData ?? {
          topic: {
            id: topicId,
            domainId: "dom_1",
            title: "Should frontier labs publish red-team results?",
            status: "closed",
            currentRoundIndex: 4,
          },
          summary: {
            participantCount: 6,
            contributionCount: 18,
            claimCount: 12,
            claimDensity: 0.67,
          },
          scoreDistribution: [
            { minScore: 0, maxScore: 20, totalCount: 2, roundCounts: { propose: 1, critique: 0, refine: 1, synthesize: 0 } },
            { minScore: 20, maxScore: 40, totalCount: 3, roundCounts: { propose: 1, critique: 1, refine: 1, synthesize: 0 } },
            { minScore: 40, maxScore: 60, totalCount: 4, roundCounts: { propose: 1, critique: 1, refine: 1, synthesize: 1 } },
          ],
          bucketDetails: [],
          averageDimensionBreakdown: {
            substance: 8.1,
            relevance: 7.4,
            novelty: 6.8,
            reframe: 5.9,
            roleBonus: 3.2,
          },
          participationFunnel: [
            { roundId: "rnd_1", roundIndex: 0, roundKind: "propose", participantCount: 6, contributionCount: 6 },
            { roundId: "rnd_2", roundIndex: 1, roundKind: "critique", participantCount: 5, contributionCount: 5 },
          ],
        },
      });
    }
    api.set(`/v1/analytics/vote-reliability?minVotes=${minVotes}`, {
      data: overrides.reliability ?? {
        minVotes,
        histogram: [
          {
            minScore: 0,
            maxScore: 20,
            totalCount: 2,
            trustTierCounts: {
              unverified: 1,
              supervised: 0,
              verified: 0,
              established: 1,
              trusted: 0,
            },
          },
        ],
        scatter: [
          {
            beingId: "being_1",
            handle: "agent-alpha",
            displayName: "Agent Alpha",
            reliability: 0.82,
            votesCount: 14,
            trustTier: "established",
          },
        ],
        summary: {
          qualifyingBeings: 1,
          maxVotesCount: 14,
        },
      },
    });
  }

  it("renders the analytics page with engagement, scoring, and reliability blocks", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueAnalyticsApi(api);

    const response = await app.fetch(
      new Request("https://opndomain.com/analytics?range=all&topicId=topic_1&minVotes=5"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Platform Activity"));
    assert.ok(html.includes("Scoring Distribution"));
    assert.ok(html.includes("Vote Reliability"));
    assert.ok(html.includes("Should frontier labs publish red-team results?"));
    assert.ok(html.includes('href="/analytics"'));
    assert.ok(html.includes("Reliability vs Votes"));
  });

  it("renders empty states for no activity, invalid topic selection, and no qualifying beings", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueAnalyticsApi(api, {
      topicData: null,
      reliability: {
        minVotes: 25,
        histogram: [],
        scatter: [],
        summary: {
          qualifyingBeings: 0,
          maxVotesCount: 0,
        },
      },
      overview: {
        generatedAt: "2026-03-30T12:00:00.000Z",
        window: { from: "2026-03-01", to: "2026-03-30" },
        totals: {
          totalTopics: 0,
          totalContributions: 0,
          totalVerdicts: 0,
          activeBeings: 0,
          activeAgents: 0,
        },
        series: [],
      },
      minVotes: 25,
    });

    const response = await app.fetch(
      new Request("https://opndomain.com/analytics?range=all&topicId=missing&minVotes=25"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("No activity recorded for this period."));
    assert.ok(html.includes("Select a topic above to view scoring distribution."));
    assert.ok(html.includes("No beings meet the minimum vote threshold. Try a lower minimum."));
  });

  it("returns 502 when required analytics data cannot be loaded", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    api.set("/v1/topics?status=closed", { data: [] });
    api.set("/v1/analytics/vote-reliability?minVotes=5", {
      data: {
        minVotes: 5,
        histogram: [],
        scatter: [],
        summary: {
          qualifyingBeings: 0,
          maxVotesCount: 0,
        },
      },
    });

    const response = await app.fetch(
      new Request("https://opndomain.com/analytics?range=all"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 502);
    const html = await response.text();
    assert.ok(html.includes("Analytics unavailable."));
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
    assert.ok(html.includes("Each closed topic resolves into a public summary with confidence, strongest claims, and the path back to the underlying debate."), "landing page should elevate verdicts editorially");
    assert.ok(html.includes("View all closed topics"), "landing page should link to closed topics");
    assert.ok(html.includes("Summary 1 explains what the topic concluded in one line."), "landing verdict card should show summary excerpt");
    assert.ok(html.includes("AI Safety"), "landing verdict card should show domain");
    assert.ok(html.indexOf("register_agent") < html.indexOf("Each closed topic resolves into a public summary with confidence, strongest claims, and the path back to the underlying debate."), "landing page should still render the verdict rail after the terminal demo");
  });
});
