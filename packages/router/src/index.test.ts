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
  readonly preparedSql: string[] = [];
  queueResult(pattern: string, rows: unknown[]) {
    this.results[pattern] = rows;
  }
  sqlMatching(substring: string): string | undefined {
    return this.preparedSql.find((sql) => sql.includes(substring));
  }
  prepare(sql: string) {
    const self = this;
    self.preparedSql.push(sql);
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

function assertSidebarShell(html: string, _activeLabel?: string) {
  assert.ok(html.includes('class="shell-body shell-body--interior-sidebar'), "route should use the interior sidebar shell");
  assert.ok(html.includes('class="page-shell"'), "route should render the page shell wrapper");
  assert.ok(html.includes('class="page-sidebar"'), "route should render the sidebar column");
}

function assertTopNavShell(html: string) {
  assert.ok(html.includes('class="shell-body shell-body--top-nav-only'), "route should use the top-nav-only shell");
  assert.ok(html.includes('class="shell-topbar shell-topbar--top-nav-only"'), "route should render the top nav shell");
  assert.ok(html.includes('class="page-main page-main--top-nav-only'), "route should render the top-nav main layout");
  assert.ok(html.includes('data-nav-group="center"'), "route should render the centered nav group");
  assert.ok(html.includes('href="/login">Access</a>'), "route should render the access link to login");
  assert.ok(!html.includes("Public Inference Protocol"), "route should not render the retired topbar tagline");
}

function assertLegacyShell(html: string) {
  assertTopNavShell(html);
}

function queueAccountApi(api: FakeApiService) {
  api.set("/v1/auth/session", {
    data: {
      agent: { email: "agent@example.com", clientId: "client_123" },
      beings: [{ id: "being_1", handle: "agent-alpha" }],
    },
  });
  api.set("/v1/auth/session/account", {
    data: {
      agent: {
        id: "agent_1",
        clientId: "client_123",
        name: "Agent Alpha",
        email: "agent@example.com",
        emailVerifiedAt: "2026-03-28T00:00:00.000Z",
        trustTier: "verified",
        status: "active",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      beings: [
        { id: "being_1", handle: "agent-alpha", trustTier: "verified", status: "active" },
      ],
      linkedIdentities: [
        { id: "li_1", provider: "google", emailSnapshot: "agent@example.com", linkedAt: "2026-03-29T00:00:00.000Z", lastLoginAt: "2026-03-30T00:00:00.000Z" },
      ],
    },
  });
  api.set("/v1/auth/oauth/welcome", {
    data: {
      clientId: "client_123",
      clientSecret: "secret_123",
    },
  });
}

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
    const artifacts = new FakeR2(); // empty â€” no object stored
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
      template_id: "debate",
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
      lede: "Frontier labs should not ship without mandatory oversight review.",
      kicker: "Mandatory oversight is a release condition.",
      editorialBody: "Mandatory oversight should be treated as a release condition for frontier labs.\n\nThe closing rounds converged on the operational case for a durable review floor before deployment.",
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

  it("returns snapshot-derived public topic status JSON with no-store caching", async () => {
    const db = new FakeDb();
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_status/state.json", JSON.stringify({
      topicId: "topic_status",
      status: "started",
      changeSequence: 42,
      currentRoundIndex: 3,
      generatedAt: "2026-04-18T14:00:00.000Z",
      rounds: [
        { sequenceIndex: 0, roundKind: "propose", status: "completed", endsAt: "2026-04-18T13:00:00.000Z" },
        { sequenceIndex: 1, roundKind: "map", status: "active", endsAt: "2026-04-18T15:00:00.000Z" },
      ],
    }));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_status/status.json"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const payload = await response.json();
    assert.deepEqual(payload, {
      topicId: "topic_status",
      status: "started",
      changeSequence: 42,
      currentRoundIndex: 3,
      generatedAt: "2026-04-18T14:00:00.000Z",
      activeRoundEndsAt: "2026-04-18T15:00:00.000Z",
    });
  });

  it("returns a retryable 404 when the topic status snapshot is missing", async () => {
    const db = new FakeDb();

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_missing/status.json"),
      buildEnv(db),
      ctx(),
    );

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const payload = await response.json();
    assert.deepEqual(payload, {
      topicId: "topic_missing",
      retryable: true,
      error: "snapshot_missing",
    });
  });

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
    assert.ok(html.includes('class="topic-confidence-widget topic-confidence-widget--verdict"'), "closed topic should render the confidence widget");
    assert.ok(html.includes("Share on X"), "closed topic should have share panel");
    assert.ok(html.includes("Test prompt"), "closed topic should keep the topic prompt under the title");
    assert.ok(!html.includes("Structured oversight should be required for frontier labs."), "verdict headline should be suppressed (redundant with convergence map)");
    assert.ok(!html.includes("Frontier labs should not ship without mandatory oversight review."), "verdict lede should be suppressed (redundant with convergence map)");
    assert.ok(!html.includes('class="topic-verdict-kicker"'), "closed topic should not render the verdict kicker sentence above the title");
    assert.ok(html.includes('class="topic-editorial"'), "closed topic should render the editorial body section");
    assert.ok(html.includes("Mandatory oversight should be treated as a release condition for frontier labs."), "closed topic should render the editorial copy from the artifact");
    assert.ok(html.includes('class="topic-score-story"'), "closed topic should render the score storytelling section");
    assert.ok(html.includes("Opening synthesis"), "closed topic should show opening synthesis section");
    assert.ok(html.includes("This is the strongest final-round answer and it should appear as the featured answer near the top of the page."), "opening synthesis should render the best synthesize contribution body");
    assert.ok(html.includes("<strong>Top</strong> 93"), "closed topic transcript summary should surface the top score");
    assert.ok(!html.includes("How the topic closed"), "closed topic should NOT show narrative section (pruned)");
    assert.ok(html.includes('class="topic-highlights-kicker">What moved the debate</div>'), "closed topic should show highlights section");
    assert.ok(!html.includes("Claim graph panel"), "closed topic should NOT show claim graph section (pruned)");
    assert.ok(html.includes("Full transcript</summary>"), "closed topic should keep transcript in the document flow");
    assert.ok(html.indexOf("Full transcript</summary>") < html.indexOf("Share this closed topic"), "share panel should remain after transcript");
    assert.ok(html.includes("Large-image preview is ready for X and Reddit shares."), "share panel should call out social preview readiness");
  });

  it("sizes score-arc columns to the actual round count", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_score_columns" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_score_columns/state.json", JSON.stringify({ memberCount: 3, contributionCount: 6, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_score_columns/transcript.json", JSON.stringify({
      rounds: [
        {
          sequenceIndex: 0,
          roundKind: "propose",
          contributions: [{ id: "ctr_1", beingHandle: "agent-alpha", bodyClean: "Round one.", scores: { final: 62 } }],
        },
        {
          sequenceIndex: 1,
          roundKind: "critique",
          contributions: [{ id: "ctr_2", beingHandle: "agent-alpha", bodyClean: "Round two.", scores: { final: 74 } }],
        },
        {
          sequenceIndex: 2,
          roundKind: "synthesize",
          contributions: [{ id: "ctr_3", beingHandle: "agent-alpha", bodyClean: "Round three.", scores: { final: 88 } }],
        },
      ],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_score_columns"), JSON.stringify(verdictPresentation("topic_score_columns", {
      scoreBreakdown: {
        completedRounds: 3,
        totalRounds: 3,
        participantCount: 3,
        contributionCount: 6,
        terminalizationMode: "full_template",
      },
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_score_columns"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(html.includes('class="topic-score-arc-rounds-head" style="grid-template-columns: repeat(3, minmax(44px, 1fr));"'), "score-arc header should size to the rendered round count");
    assert.ok(html.includes('class="topic-score-arc-rounds" style="grid-template-columns: repeat(3, minmax(44px, 1fr));"'), "score-arc rows should size to the rendered round count");
  });

  it("does not duplicate the headline as a lede for legacy verdict artifacts without parsed thesis metadata", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_legacy_header", status: "closed" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_legacy_header/state.json", JSON.stringify({ memberCount: 3, contributionCount: 10, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_legacy_header/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_legacy_header"), JSON.stringify(verdictPresentation("topic_legacy_header", {
      lede: null,
      kicker: undefined,
    })));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_legacy_header"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    const matches = html.match(/Structured oversight should be required for frontier labs\./g) ?? [];
    assert.equal(matches.length, 0, "legacy header should suppress the headline entirely (redundant with convergence map)");
  });

  it("does not render share panel on open topics", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_open", status: "started", artifact_status: null, verdict_html_key: null, og_image_key: null })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_open/state.json", JSON.stringify({
      topicId: "topic_open",
      status: "started",
      changeSequence: 7,
      currentRoundIndex: 2,
      generatedAt: "2026-04-09T12:05:00.000Z",
      memberCount: 3,
      contributionCount: 10,
      transcriptVersion: 1,
      rounds: [
        { sequenceIndex: 0, roundKind: "propose", status: "completed", endsAt: "2026-04-09T12:00:00.000Z" },
        { sequenceIndex: 1, roundKind: "vote", status: "completed", endsAt: "2026-04-09T12:05:00.000Z" },
        { sequenceIndex: 2, roundKind: "critique", status: "active", endsAt: "2026-04-09T12:10:00.000Z" },
      ],
    }));
    snapshots.set("topics/topic_open/transcript.json", JSON.stringify({
      rounds: [
        {
          sequenceIndex: 0,
          roundKind: "propose",
          contributions: [{ id: "ctr_open_1", beingHandle: "agent-alpha", bodyClean: "Opening round contribution.", scores: { final: 61 } }],
        },
        {
          sequenceIndex: 1,
          roundKind: "critique",
          contributions: [{ id: "ctr_open_2", beingHandle: "agent-beta", bodyClean: "Latest round contribution.", scores: { final: 74 } }],
        },
      ],
    }));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_open"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );
    const html = await response.text();
    assert.ok(!html.includes("Share on X"), "open topic should not have share panel");
    assert.ok(html.includes("Test prompt"), "open topic should also lead with the topic prompt");
    assert.ok(html.includes("Active"), "open topic should render a status-first fallback");
    assert.ok(html.includes("This topic is active. The transcript updates as rounds complete, and the verdict publishes when the topic closes."), "open topic should explain the active state");
    assert.ok(html.includes('<details class="topic-round" open>'), "open topic should expand the latest round by default");
    assert.ok(html.includes("Transcript</span>"), "open topic should keep transcript in the page flow");
    assert.ok(html.includes("https://api.opndomain.com/v1/topics/topic_open/views"), "open public topic page should still include the topic view beacon endpoint");
    assert.ok(html.includes("Debate progress"), "open topic should render the debate progress tracker");
    assert.ok(html.includes('data-status-endpoint="/topics/topic_open/status.json"'), "round tracker should embed the status endpoint");
    assert.ok(html.includes('data-initial-change-sequence="7"'), "round tracker should embed the initial change sequence");
    assert.ok(html.includes('data-active-round-ends-at="2026-04-09T12:10:00.000Z"'), "round tracker should embed the active round deadline");
    assert.ok(html.includes("fetch(statusEndpoint"), "round tracker should poll the status endpoint after expiry");
    assert.ok(!html.includes("opndomain:round-tracker-reload"), "round tracker should not use the retired reload retry marker");
    assert.ok(html.includes("observedChangeSequence > initialChangeSequence"), "round tracker should gate reloads on changeSequence increase only");
    assert.ok(html.includes("sessionStorage.setItem(reloadGuardKey"), "round tracker should persist the reload suppression guard before reloading");
    assert.ok(html.includes("initialChangeSequence > reloadGuard.reloadedFor"), "boot should clear the reload guard when fresh HTML advances");
    assert.ok(html.includes("Date.now() - reloadGuard.at <= reloadSuppressionMs"), "boot should suppress another auto-reload when stale HTML lands");
    assert.ok(html.includes("window.setTimeout(clearReloadGuard, reloadSuppressionMs - (Date.now() - reloadGuard.at))"), "stale-html suppression should clear the guard after the remaining suppression window");
    assert.ok(html.includes("Waiting for next round to open. Refresh to check for updates."), "round tracker should show the bounded waiting/manual-refresh state");
    assert.ok(html.includes("Math.min(pollIntervalMs, remainingWindowMs)"), "non-ok and fetch errors should stay on the same bounded 5s cadence");
    assert.ok(html.includes("typeof payload?.changeSequence === 'number'"), "round tracker should ignore malformed polled changeSequence values");
  });

  it("does not include the transition polling script when there is no active round", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_no_active", status: "started", artifact_status: null, verdict_html_key: null, og_image_key: null })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_no_active/state.json", JSON.stringify({
      topicId: "topic_no_active",
      status: "started",
      changeSequence: 9,
      currentRoundIndex: 2,
      generatedAt: "2026-04-09T12:10:00.000Z",
      memberCount: 3,
      contributionCount: 10,
      transcriptVersion: 1,
      rounds: [
        { sequenceIndex: 0, roundKind: "propose", status: "completed", endsAt: "2026-04-09T12:00:00.000Z" },
        { sequenceIndex: 1, roundKind: "critique", status: "completed", endsAt: "2026-04-09T12:10:00.000Z" },
      ],
    }));
    snapshots.set("topics/topic_no_active/transcript.json", JSON.stringify({ rounds: [] }));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_no_active"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );

    const html = await response.text();
    assert.ok(!html.includes("fetch(statusEndpoint"), "pages without an active round should not start transition polling");
    assert.ok(!html.includes('data-status-endpoint="/topics/topic_no_active/status.json"'), "pages without an active round should not embed the status endpoint");
  });

  it("does not include the transition polling script on stalled topics", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_stalled", status: "stalled", artifact_status: null, verdict_html_key: null, og_image_key: null })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_stalled/state.json", JSON.stringify({
      topicId: "topic_stalled",
      status: "stalled",
      changeSequence: 10,
      currentRoundIndex: 2,
      generatedAt: "2026-04-09T12:10:00.000Z",
      memberCount: 3,
      contributionCount: 10,
      transcriptVersion: 1,
      rounds: [
        { sequenceIndex: 0, roundKind: "propose", status: "completed", endsAt: "2026-04-09T12:00:00.000Z" },
        { sequenceIndex: 1, roundKind: "critique", status: "active", endsAt: "2026-04-09T12:10:00.000Z" },
      ],
    }));
    snapshots.set("topics/topic_stalled/transcript.json", JSON.stringify({ rounds: [] }));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_stalled"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );

    const html = await response.text();
    assert.ok(!html.includes("fetch(statusEndpoint"), "stalled topics should not include the transition polling script");
    assert.ok(!html.includes("Waiting for next round to open. Refresh to check for updates."), "stalled topics should not embed the waiting copy from the polling script");
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
    assert.ok(html.includes('<details class="topic-round">'), "transcript should render rounds as native disclosure blocks");
    assert.ok(html.includes("agent-alpha"), "transcript should show contributor handle");
    assert.ok(html.includes("#1"), "transcript should show derived rank cues");
    assert.ok(html.includes("<strong>Top</strong> 87"), "transcript summary should show the top score");
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
    assert.ok(html.includes("<p class=\"topic-contribution-paragraph\">First paragraph.</p>"), "contribution body should render first paragraph");
    assert.ok(html.includes("<p class=\"topic-contribution-paragraph\">Second paragraph.</p>"), "contribution body should render second paragraph");
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
    assert.ok(!html.includes("Claim graph publication was skipped"), "closed topic should NOT show claim graph (pruned)");
    assert.ok(html.includes("Transcript</span>"), "closed topic should still render transcript");
  });

  it("renders the verdict box from PART B and keeps PART A advocacy out of that box", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_part_b_verdict" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_part_b_verdict/state.json", JSON.stringify({ memberCount: 3, contributionCount: 3, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_part_b_verdict/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 8,
        roundKind: "final_argument",
        contributions: [{
          id: "ctr_winner",
          beingHandle: "agent-alpha",
          displayName: "Agent Alpha",
          bodyClean:
            "PART A - MY POSITION\n\n" +
            "MAP_POSITION: 1\n\n" +
            "MY THESIS: Unique PART A thesis that should not appear in the verdict box.\n\n" +
            "WHY I HOLD IT: Unique PART A support paragraph that should stay out of the verdict box.\n\n" +
            "STRONGEST OBJECTION I CAN'T FULLY ANSWER: Unique PART A objection.\n\n" +
            "PART B - IMPARTIAL SYNTHESIS\n\n" +
            "WHAT THIS DEBATE SETTLED: Unique PART B settled finding.\n\n" +
            "WHAT REMAINS CONTESTED: Unique PART B contested tension.\n\n" +
            "NEUTRAL VERDICT: Unique PART B neutral verdict.\n\n" +
            "KICKER: Unique kicker.",
          scores: { final: 97 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_part_b_verdict"), JSON.stringify(verdictPresentation("topic_part_b_verdict")));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_part_b_verdict"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );

    const html = await response.text();
    const verdictSection = /<section class="winning-argument">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(verdictSection.includes("Unique PART B settled finding."), "verdict box should render PART B settled section");
    assert.ok(verdictSection.includes("Unique PART B contested tension."), "verdict box should render PART B contested section");
    assert.ok(verdictSection.includes("Unique PART B neutral verdict."), "verdict box should render PART B verdict section");
    assert.ok(!verdictSection.includes("Unique PART A thesis"), "verdict box should not render PART A thesis text");
    assert.ok(!verdictSection.includes("Unique PART A support paragraph"), "verdict box should not render PART A advocacy text");
    assert.ok(verdictSection.includes("Synthesized by Agent Alpha"), "verdict box should attribute the synthesis to the winning agent");
  });

  it("picks the strongest counter from a different MAP_POSITION when available", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_counter_map_position" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_counter_map_position/state.json", JSON.stringify({ memberCount: 3, contributionCount: 3, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_counter_map_position/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 8,
        roundKind: "final_argument",
        contributions: [
          {
            id: "ctr_winner",
            beingHandle: "agent-alpha",
            displayName: "Agent Alpha",
            bodyClean:
              "PART A - MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: Winner thesis.\n\nWHY I HOLD IT: Winner support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Winner objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 98 },
          },
          {
            id: "ctr_same_side",
            beingHandle: "agent-beta",
            displayName: "Agent Beta",
            bodyClean:
              "PART A - MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: Same-side thesis that should not be chosen.\n\nWHY I HOLD IT: Same-side support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Same-side objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Same-side settled.\n\nWHAT REMAINS CONTESTED: Same-side contested.\n\nNEUTRAL VERDICT: Same-side verdict.\n\nKICKER: Same-side kicker.",
            scores: { final: 96 },
          },
          {
            id: "ctr_counter",
            beingHandle: "agent-gamma",
            displayName: "Agent Gamma",
            bodyClean:
              "PART A - MY POSITION\n\nMAP_POSITION: 2\n\nMY THESIS: Opposing thesis that should be chosen.\n\nWHY I HOLD IT: Opposing support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Opposing objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Opposing settled.\n\nWHAT REMAINS CONTESTED: Opposing contested.\n\nNEUTRAL VERDICT: Opposing verdict.\n\nKICKER: Opposing kicker.",
            scores: { final: 95 },
          },
        ],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_counter_map_position"), JSON.stringify(verdictPresentation("topic_counter_map_position")));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_counter_map_position"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );

    const html = await response.text();
    const counterSection = /<section class="both-sides-summary">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(counterSection.includes("Opposing thesis that should be chosen."), "counter section should use a different MAP_POSITION when one exists");
    assert.ok(counterSection.includes("Agent Gamma"), "counter section should attribute the selected opposing agent");
    assert.ok(!counterSection.includes("Same-side thesis that should not be chosen."), "counter section should skip higher-scored same-position non-winners");
  });

  it("merges declared and undeclared MAP_POSITION contributions in the convergence map", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_convergence_merge" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_convergence_merge/state.json", JSON.stringify({ memberCount: 5, contributionCount: 5, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_convergence_merge/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 8,
        roundKind: "final_argument",
        contributions: [
          {
            id: "ctr_1",
            beingHandle: "agent-alpha",
            bodyClean: "PART A - MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: One.\n\nWHY I HOLD IT: One support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: One objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 98 },
          },
          {
            id: "ctr_2",
            beingHandle: "agent-beta",
            bodyClean: "PART A - MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: Two.\n\nWHY I HOLD IT: Two support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Two objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 96 },
          },
          {
            id: "ctr_3",
            beingHandle: "agent-gamma",
            bodyClean: "PART A - MY POSITION\n\nMY THESIS: Three.\n\nWHY I HOLD IT: Three support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Three objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 94 },
          },
          {
            id: "ctr_4",
            beingHandle: "agent-delta",
            bodyClean: "PART A - MY POSITION\n\nMY THESIS: Four.\n\nWHY I HOLD IT: Four support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Four objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 92 },
          },
          {
            id: "ctr_5",
            beingHandle: "agent-epsilon",
            bodyClean: "PART A - MY POSITION\n\nMAP_POSITION: 2\n\nMY THESIS: Five.\n\nWHY I HOLD IT: Five support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Five objection.\n\nPART B - IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: Settled.\n\nWHAT REMAINS CONTESTED: Contested.\n\nNEUTRAL VERDICT: Verdict.\n\nKICKER: Kicker.",
            scores: { final: 90 },
          },
        ],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_convergence_merge"), JSON.stringify(verdictPresentation("topic_convergence_merge", {
      positions: [
        {
          label: "Position One",
          share: 0,
          classification: "majority",
          strength: 80,
          aggregateScore: 100,
          contributionIds: ["ctr_1", "ctr_2"],
          stanceCounts: { support: 2, oppose: 0, neutral: 0 },
        },
        {
          label: "Position Two",
          share: 0,
          classification: "runner_up",
          strength: 60,
          aggregateScore: 70,
          contributionIds: ["ctr_3", "ctr_5"],
          stanceCounts: { support: 1, oppose: 1, neutral: 0 },
        },
        {
          label: "Position Three",
          share: 0,
          classification: "minority",
          strength: 40,
          aggregateScore: 50,
          contributionIds: ["ctr_4"],
          stanceCounts: { support: 1, oppose: 0, neutral: 0 },
        },
      ],
    })));

    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_convergence_merge"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );

    const html = await response.text();
    const convergenceSection = /<section class="convergence-map">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(convergenceSection.includes("Position One"), "convergence map should include the majority position");
    assert.ok(convergenceSection.includes("Position Two"), "convergence map should include the runner-up position");
    assert.ok(convergenceSection.includes("Position Three"), "convergence map should include the minority position");
    assert.ok(convergenceSection.includes("40%"), "convergence map should use total final args as denominator for mixed declared and undeclared positions");
    assert.ok(convergenceSection.includes("20%"), "convergence map should assign undeclared arguments via heldBy fallback");
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
    assert.ok(pendingHtml.includes("Pending"), "closed topic with pending artifact should explain the pending verdict state");
    assert.ok(pendingHtml.includes("This topic is closed, but the verdict artifact is still being published."), "pending verdict fallback should explain what happens next");
    assert.ok(!pendingHtml.includes("Browse topics"), "closed topic fallback should use the top-nav-only shell without the legacy sidebar");

    const unavailableResponse = await app.fetch(
      new Request("https://opndomain.com/topics/topic_unavailable"),
      buildEnv(db, undefined, snapshots),
      ctx(),
    );
    const unavailableHtml = await unavailableResponse.text();
    assert.ok(unavailableHtml.includes("Unavailable"), "closed topic with artifact error should explain the unavailable verdict state");
    assert.ok(unavailableHtml.includes("The transcript remains available below."), "unavailable verdict fallback should keep the transcript accessible");
    assert.ok(!unavailableHtml.includes("Browse topics"), "closed topic fallback should use the top-nav-only shell without the legacy sidebar");
  });

  it("strips round-8 scaffolding labels from dissenting view bodies", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_dissent_strip" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_dissent_strip/state.json", JSON.stringify({ memberCount: 3, contributionCount: 3, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_dissent_strip/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_dissent_strip"), JSON.stringify(verdictPresentation("topic_dissent_strip", {
      minorityReports: [{
        contributionId: "ctr_dissent",
        handle: "agent-dissenter",
        displayName: "Dissenter",
        finalScore: 72,
        positionLabel: "Minority view",
        body:
          "PART A — MY POSITION\n\n" +
          "MAP_POSITION: 3\n\n" +
          "MY THESIS: Dissent thesis statement.\n\n" +
          "WHY I HOLD IT: The dissenting contributor offers a substantive WHY paragraph that must appear clean in the rendered dissenting views block.\n\n" +
          "STRONGEST OBJECTION I CAN'T FULLY ANSWER: Some objection.\n\n" +
          "PART B — IMPARTIAL SYNTHESIS\n\n" +
          "WHAT THIS DEBATE SETTLED: Nothing.\n\n" +
          "WHAT REMAINS CONTESTED: Everything.\n\n" +
          "NEUTRAL VERDICT: Unclear.\n\n" +
          "KICKER: Dissenting kicker.",
      }],
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_dissent_strip"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="dissenting-views">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("substantive WHY paragraph"), "dissenting view should render WHY I HOLD IT prose");
    const forbidden = ["PART A", "PART B", "MY THESIS:", "WHY I HOLD IT:", "STRONGEST OBJECTION", "WHAT THIS DEBATE SETTLED:", "WHAT REMAINS CONTESTED:", "NEUTRAL VERDICT:", "KICKER:", "MAP_POSITION:"];
    for (const label of forbidden) {
      assert.ok(!section.includes(label), `dissenting view section should not contain label "${label}"`);
    }
  });

  it("substitutes guest-handle references in vote logic reasoning", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_vote_logic_sub" })]);
    db.queueResult("FROM votes v", [{
      voter_handle: "agent-alpha",
      voter_display_name: "Agent Alpha",
      target_handle: "guest-abc123",
      target_display_name: "The Macro Skeptic",
      reasoning: "I defer to guest-abc123's structural argument over the rest.",
      round_index: 0,
      round_kind: "vote",
    }]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_vote_logic_sub/state.json", JSON.stringify({ memberCount: 2, contributionCount: 2, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_vote_logic_sub/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_vote_logic_sub"), JSON.stringify(verdictPresentation("topic_vote_logic_sub")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_vote_logic_sub"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="vote-logic">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("The Macro Skeptic"), "vote logic reasoning should substitute guest handle with resolved display name");
    assert.ok(!section.includes("guest-abc123"), "raw guest-xxxx token should not leak into vote logic reasoning");
  });

  it("falls back to editorial body when synthesize contribution is too short", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_opening_fallback" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_opening_fallback/state.json", JSON.stringify({ memberCount: 1, contributionCount: 1, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_opening_fallback/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 0,
        roundKind: "synthesize",
        contributions: [{
          id: "ctr_short",
          beingHandle: "agent-alpha",
          bodyClean: "PART A — MY POSITION\n\nMAP_POSITION: 1\n",
          scores: { final: 80 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_opening_fallback"), JSON.stringify(verdictPresentation("topic_opening_fallback")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_opening_fallback"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="topic-opening-synthesis">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("Mandatory oversight should be treated as a release condition"), "opening synthesis should fall back to editorial body first paragraph");
    assert.ok(!section.includes("PART A"), "opening synthesis fallback should not leak the PART A label");
    assert.ok(!section.includes("MAP_POSITION"), "opening synthesis fallback should not leak MAP_POSITION");
  });

  it("renders the verdict box as three clean kicker sections with no raw label tokens", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_verdict_kickers" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_verdict_kickers/state.json", JSON.stringify({ memberCount: 1, contributionCount: 1, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_verdict_kickers/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 7,
        roundKind: "final_argument",
        contributions: [{
          id: "ctr_k",
          beingHandle: "agent-alpha",
          displayName: "Alpha",
          bodyClean:
            "PART A — MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: A.\n\nWHY I HOLD IT: B.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: C.\n\n" +
            "PART B — IMPARTIAL SYNTHESIS\n\n" +
            "WHAT THIS DEBATE SETTLED: The settled prose explains an agreed-upon finding with enough body to render.\n\n" +
            "WHAT REMAINS CONTESTED: The contested prose explains a remaining tension with enough body to render.\n\n" +
            "NEUTRAL VERDICT: The neutral verdict prose summarizes the decision with enough body to render.\n\n" +
            "KICKER: Final kicker.",
          scores: { final: 95 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_verdict_kickers"), JSON.stringify(verdictPresentation("topic_verdict_kickers")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_verdict_kickers"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="winning-argument">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes('class="winning-argument-section-kicker">What this debate settled<'), "verdict should render settled kicker");
    assert.ok(section.includes('class="winning-argument-section-kicker">What remains contested<'), "verdict should render contested kicker");
    assert.ok(section.includes('class="winning-argument-section-kicker">Neutral verdict<'), "verdict should render verdict kicker");
    assert.ok(section.includes("agreed-upon finding"), "verdict should render settled body prose");
    // No raw uppercase label tokens should appear inside paragraphs
    const paragraphs = section.match(/<p[^>]*>[^<]*<\/p>/g) ?? [];
    for (const p of paragraphs) {
      assert.ok(!/WHAT THIS DEBATE SETTLED:/.test(p), "paragraph should not contain raw settled label");
      assert.ok(!/WHAT REMAINS CONTESTED:/.test(p), "paragraph should not contain raw contested label");
      assert.ok(!/NEUTRAL VERDICT:/.test(p), "paragraph should not contain raw neutral verdict label");
    }
  });

  it("strips trailing KICKER lines from highlight excerpts", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_highlight_kicker" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_highlight_kicker/state.json", JSON.stringify({ memberCount: 2, contributionCount: 2, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_highlight_kicker/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_highlight_kicker"), JSON.stringify(verdictPresentation("topic_highlight_kicker", {
      highlights: [
        {
          contributionId: "ctr_h1",
          beingId: "being_h1",
          beingHandle: "agent-hl",
          roundKind: "refine",
          excerpt: "The refinement strengthens the governance mechanism substantially.\n\nKICKER: Leaked kicker line.",
          finalScore: 88,
          reason: "Strong refinement",
        },
        {
          contributionId: "ctr_h2",
          beingId: "being_h2",
          beingHandle: "agent-hl2",
          roundKind: "refine",
          excerpt: "Another strong refinement that tightens the proposal further.",
          finalScore: 86,
          reason: "Another refinement",
        },
      ],
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_highlight_kicker"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="topic-highlights">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("The refinement strengthens"), "highlight section should render excerpt prose");
    assert.ok(!section.includes("KICKER:"), "highlight excerpt should not leak KICKER line");
    assert.ok(!section.includes("Leaked kicker line"), "highlight excerpt should strip the kicker content line");
  });

  it("strips inline labels from strongest counter while preserving thesis prose", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_counter_strip" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_counter_strip/state.json", JSON.stringify({ memberCount: 2, contributionCount: 2, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_counter_strip/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 8,
        roundKind: "final_argument",
        contributions: [
          {
            id: "ctr_win",
            beingHandle: "agent-alpha",
            displayName: "Alpha",
            bodyClean:
              "PART A — MY POSITION\n\nMAP_POSITION: 1\n\nMY THESIS: Winner thesis long enough to serve as content.\n\nWHY I HOLD IT: Winner support.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Winner objection.\n\nPART B — IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: X.\n\nWHAT REMAINS CONTESTED: Y.\n\nNEUTRAL VERDICT: Z.\n\nKICKER: W.",
            scores: { final: 98 },
          },
          {
            id: "ctr_counter",
            beingHandle: "agent-beta",
            displayName: "Beta",
            bodyClean:
              "PART A — MY POSITION\n\nMAP_POSITION: 2\n\nMY THESIS: A distinctive counter thesis prose that must appear cleanly in the strongest-counter box.\n\nWHY I HOLD IT: Supporting reasoning for the counter position that should be stripped of its inline label.\n\nSTRONGEST OBJECTION I CAN'T FULLY ANSWER: Counter objection.\n\nPART B — IMPARTIAL SYNTHESIS\n\nWHAT THIS DEBATE SETTLED: X.\n\nWHAT REMAINS CONTESTED: Y.\n\nNEUTRAL VERDICT: Z.\n\nKICKER: W.",
            scores: { final: 90 },
          },
        ],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_counter_strip"), JSON.stringify(verdictPresentation("topic_counter_strip")));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_counter_strip"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="both-sides-summary">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("distinctive counter thesis prose"), "counter should render thesis prose");
    assert.ok(!section.includes("WHY I HOLD IT:"), "counter section should strip WHY I HOLD IT label");
    assert.ok(!section.includes("MY THESIS:"), "counter section should strip MY THESIS label");
  });

  it("strips whitespace-only PART A / PART B header variants (no em-dash)", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_partab_whitespace" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_partab_whitespace/state.json", JSON.stringify({ memberCount: 2, contributionCount: 2, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_partab_whitespace/transcript.json", JSON.stringify({ rounds: [] }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_partab_whitespace"), JSON.stringify(verdictPresentation("topic_partab_whitespace", {
      minorityReports: [{
        contributionId: "ctr_dissent_ws",
        handle: "agent-ws",
        displayName: "Whitespace Dissenter",
        finalScore: 70,
        positionLabel: "Minority",
        body:
          "PART A  MY POSITION\n\n" +
          "MY THESIS: foo dissent thesis.\n\n" +
          "WHY I HOLD IT: A whitespace-form dissent body that should render cleanly without any header artifact leaking into prose.\n\n" +
          "PART B  IMPARTIAL SYNTHESIS\n\n" +
          "WHAT THIS DEBATE SETTLED: bar.",
      }],
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_partab_whitespace"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="dissenting-views">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(section.includes("whitespace-form dissent body"), "should render dissent prose body");
    assert.ok(!section.includes("PART A"), "should strip whitespace-form PART A header");
    assert.ok(!section.includes("PART B"), "should strip whitespace-form PART B header");
    assert.ok(!section.includes("MY POSITION"), "should strip MY POSITION descriptor");
    assert.ok(!section.includes("IMPARTIAL SYNTHESIS"), "should strip IMPARTIAL SYNTHESIS descriptor");
  });

  it("preserves legacy MAJORITY CASE / COUNTER-ARGUMENT / FINAL VERDICT structure in the verdict box", async () => {
    const db = new FakeDb();
    db.queueResult("topics t", [topicMeta({ id: "topic_legacy_verdict" })]);
    const snapshots = new FakeR2();
    snapshots.set("topics/topic_legacy_verdict/state.json", JSON.stringify({ memberCount: 1, contributionCount: 1, transcriptVersion: 1, rounds: [] }));
    snapshots.set("topics/topic_legacy_verdict/transcript.json", JSON.stringify({
      rounds: [{
        sequenceIndex: 7,
        roundKind: "final_argument",
        contributions: [{
          id: "ctr_legacy",
          beingHandle: "agent-legacy",
          displayName: "Legacy Agent",
          bodyClean:
            "MAJORITY CASE: The legacy majority case as written by guest-abc123 lays out the core argument.\n\n" +
            "COUNTER-ARGUMENT: The legacy counter-argument records the principal objection.\n\n" +
            "FINAL VERDICT: The legacy final verdict resolves the dispute on the merits.",
          scores: { final: 92 },
        }],
      }],
    }));
    const artifacts = new FakeR2();
    artifacts.set(topicVerdictPresentationArtifactKey("topic_legacy_verdict"), JSON.stringify(verdictPresentation("topic_legacy_verdict")));
    // Add a being whose handle is guest-abc123 so the substitutor has someone to resolve.
    db.queueResult("FROM votes v", [{
      voter_handle: "guest-abc123",
      voter_display_name: "Resolved Name",
      target_handle: "agent-legacy",
      target_display_name: "Legacy Agent",
      reasoning: "n/a",
      round_index: 0,
      round_kind: "vote",
    }]);
    const response = await app.fetch(
      new Request("https://opndomain.com/topics/topic_legacy_verdict"),
      buildEnv(db, artifacts, snapshots),
      ctx(),
    );
    const html = await response.text();
    const section = /<section class="winning-argument">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    assert.ok(/structured-label[^>]*>Majority Case</i.test(section), "legacy verdict should retain MAJORITY CASE label");
    assert.ok(/structured-label[^>]*>Counter-Argument</i.test(section), "legacy verdict should retain COUNTER-ARGUMENT label");
    assert.ok(/structured-label[^>]*>Final Verdict</i.test(section), "legacy verdict should retain FINAL VERDICT label");
    assert.ok(section.includes("legacy majority case"), "legacy verdict should render majority body prose");
    assert.ok(section.includes("Resolved Name"), "legacy verdict should substitute guest-handle references with resolved display names");
    assert.ok(!section.includes("guest-abc123"), "legacy verdict should not leak raw guest- token");
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
        templateId: "debate",
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
        { id: "dom_ai-machine-intelligence", slug: "ai-machine-intelligence", name: "AI & Machine Intelligence", parent_domain_id: null },
        { id: "dom_1", slug: "ai-safety", name: "AI Safety", parent_domain_id: "dom_ai-machine-intelligence" },
        { id: "dom_physical-sciences", slug: "physical-sciences", name: "Physical Sciences", parent_domain_id: null },
        { id: "dom_2", slug: "energy", name: "Energy", parent_domain_id: "dom_physical-sciences" },
      ],
    });
  }

  it("renders the topics directory from API-backed topics and domain filters", async () => {
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
    assert.ok(html.includes("Topics"));
    assert.ok(html.includes("Topics index"));
    assert.ok(html.includes("Should frontier model audits be mandatory?"));
    assert.ok(html.includes('class="topics-status-pill is-active" href="/topics">All</a>'));
    assert.ok(html.includes('class="topics-status-pill" href="/topics?status=open">Open</a>'));
    assert.ok(html.includes('value="ai-safety"'));
    assert.ok(html.includes('value="debate"'));
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
    assert.ok(html.includes('class="topics-status-pill is-active" href="/topics?status=open">Open</a>'));
  });

  it("preserves domain and template filters in segmented status links", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api, {
      path: "/v1/topics?status=open&domain=ai-safety&templateId=debate",
    });

    const response = await app.fetch(
      new Request("https://opndomain.com/topics?status=open&domain=ai-safety&template=debate"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('class="topics-status-pill" href="/topics?domain=ai-safety&amp;template=debate">All</a>'));
    assert.ok(html.includes('class="topics-status-pill is-active" href="/topics?status=open&amp;domain=ai-safety&amp;template=debate">Open</a>'));
    assert.ok(html.includes('class="topics-status-pill" href="/topics?status=closed&amp;domain=ai-safety&amp;template=debate">Closed</a>'));
    assert.ok(html.includes('input type="hidden" name="status" value="open"'));
    assert.ok(html.includes('class="topics-filter-clear" href="/topics">Clear</a>'));
  });

  it("passes the metadata query to the API and preserves it across filters", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api, {
      path: "/v1/topics?q=frontier",
    });

    const response = await app.fetch(
      new Request("https://opndomain.com/topics?q=frontier"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('<input class="topics-search-input" name="q" type="search" value="frontier"'));
    assert.ok(html.includes("<strong>Query</strong><span>frontier</span>"));
    assert.ok(html.includes('href="/topics?q=frontier'));
    assert.ok(!html.includes('input type="hidden" name="q" value="frontier"'));
  });

  it("passes the public template filter to the API as templateId", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueTopicsApi(api, {
      path: "/v1/topics?templateId=debate",
      topics: [{
        id: "topic_2",
        title: "Should grid operators mandate storage reserves?",
        status: "closed",
        prompt: "Evaluate reserve mandates for reliability.",
        templateId: "debate",
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
      new Request("https://opndomain.com/topics?template=debate"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Should grid operators mandate storage reserves?"));
    assert.ok(html.includes("<strong>Template</strong><span>debate</span>"));
    assert.ok(html.includes('option value="debate" selected'));
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
            { minScore: 0, maxScore: 20, totalCount: 2, roundCounts: { propose: 1, critique: 0, refine: 1, synthesize: 0, map: 0, final_argument: 0 } },
            { minScore: 20, maxScore: 40, totalCount: 3, roundCounts: { propose: 1, critique: 1, refine: 1, synthesize: 0, map: 0, final_argument: 0 } },
            { minScore: 40, maxScore: 60, totalCount: 4, roundCounts: { propose: 1, critique: 1, refine: 1, synthesize: 1, map: 0, final_argument: 0 } },
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
          voteTiming: {
            totalVotes: 22,
            timedVotes: 20,
            averageVotePositionPct: 0.41,
            averageRoundElapsedPct: 0.41,
          },
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
    queueAccountApi(api);
    queueAnalyticsApi(api);

    const response = await app.fetch(
      new Request("https://opndomain.com/analytics?range=all&topicId=topic_1&minVotes=5", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("Platform Activity"));
    assert.ok(html.includes("Scoring Distribution"));
    assert.ok(html.includes("Vote Reliability"));
    assert.ok(html.includes("Should frontier labs publish red-team results?"));
    assert.ok(html.includes('href="/topics"'));
    assert.ok(html.includes("Topics"));
    assert.ok(html.includes("Reliability vs Votes"));
  });

  it("renders empty states for no activity, invalid topic selection, and no qualifying beings", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    queueAccountApi(api);
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
      new Request("https://opndomain.com/analytics?range=all&topicId=missing&minVotes=25", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("No activity recorded for this period."));
    assert.ok(html.includes("Select a topic above to view scoring distribution."));
    assert.ok(html.includes("No agents meet the minimum vote threshold. Try a lower minimum."));
  });

  it("returns 502 when public analytics data cannot be loaded", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    api.set("/v1/topics?status=closed", { data: [] });

    const response = await app.fetch(
      new Request("https://opndomain.com/analytics?range=all"),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 502);
    const html = await response.text();
    assert.ok(html.includes("Analytics unavailable."));
  });

  it("keeps public summary analytics available when detailed analytics are auth-gated", async () => {
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
    assert.ok(html.includes("Sign in to view topic-level scoring analytics."));
    assert.ok(html.includes("Sign in to view vote reliability analytics."));
  });
});

describe("GET / landing verdict highlighting", () => {
  it("renders the connect-first landing layout with OG verdict cards", async () => {
    const db = new FakeDb();
    db.queueResult("COUNT(*) AS c FROM beings", [{ c: 12 }]);
    db.queueResult("COUNT(DISTINCT tm.being_id) AS c", [{ c: 8 }]);
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
      og_image_key: `og/topic_${index + 1}.png`,
      participant_count: 12 + index,
    })));
    const response = await app.fetch(
      new Request("https://opndomain.com/"),
      buildEnv(db),
      ctx(),
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("A public protocol for reasoning in the open."), "landing page should use the current hero headline");
    assert.ok(html.includes("opndomain turns private model deliberation into a shared process"), "landing page should render the current hero support line");
    assert.ok(html.includes("See live topics"), "landing page should expose the primary access action");
    assert.ok(html.includes('href="/topics"'), "landing page should point primary access actions to the topics surface");
    assert.ok(html.includes("lp-rail"), "landing page should render the rolling verdict card rail");
    assert.ok(html.includes("Topics"), "landing page should render the topics nav label");
    assert.ok(html.includes("Domains"), "landing page should render the domains nav label");
    assert.ok(html.includes("About"), "landing page should render the about nav label");
    assert.ok(html.includes("Access"), "landing page should render the access nav label");
    assert.ok(html.includes("Verdict Topic 1"), "landing page should render the verdict card title");
    assert.ok(html.includes("Summary 1"), "landing page should render the opening verdict response in the card");
    assert.ok(html.includes('href="/topics/topic_1"'), "landing page cards should link to the individual topic page");
    assert.ok(html.includes('class="shell-topbar shell-topbar--landing"'), "landing page should render the shared top nav shell");
    assert.ok(html.includes('class="shell-search"'), "landing page should render the global search bar");
    assert.ok(html.includes('class="lp-terminal lp-reveal"'), "landing page should render the terminal component");
    assert.ok(html.includes("data-term-output"), "landing page should include the typewriter output hook");
  });
});

describe("SSR shell coverage for redesigned routes", () => {
  it("renders the domains index with parent group headers", async () => {
    const db = new FakeDb();
    db.queueResult("parent_domain_id IS NULL", [
      { id: "dom_ai-machine-intelligence", slug: "ai-machine-intelligence", name: "AI & Machine Intelligence", description: "AI research." },
    ]);
    db.queueResult("parent_domain_id IS NOT NULL", [
      { slug: "ai-safety", name: "AI Safety", description: "Model evaluations and safeguards.", parent_domain_id: "dom_ai-machine-intelligence", topic_count: 4 },
    ]);

    const response = await app.fetch(
      new Request("https://opndomain.com/domains"),
      buildEnv(db),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assertTopNavShell(html);
    assert.ok(!html.includes('class="page-sidebar"'));
    assert.ok(html.includes("Domains"));
    assert.ok(html.includes("AI &amp; Machine Intelligence"), "should render parent group header");
    assert.ok(html.includes("AI Safety"), "should render child domain card");
    assert.ok(html.includes("domain-group"), "should use domain-group class");
    assert.ok(html.includes("Domains organize the protocol into durable fields of inquiry."));
  });

  it("renders the parent domain detail page with children grid", async () => {
    const db = new FakeDb();
    db.queueResult("WHERE d.slug = ?", [
      { id: "dom_ai-machine-intelligence", slug: "ai-machine-intelligence", name: "AI & Machine Intelligence", description: "AI research.", parent_domain_id: null, topic_count: 0, parent_slug: null, parent_name: null },
    ]);
    db.queueResult("FROM domains d\n          WHERE d.parent_domain_id", [
      { slug: "ai-safety", name: "AI Safety", description: "Model evaluations.", topic_count: 3 },
    ]);
    db.queueResult("SUM(dr.decayed_score)", [
      { handle: "agent-alpha", display_name: "Agent Alpha", trust_tier: "unverified", decayed_score: 82.4, sample_count: 11, contribution_count: 5 },
    ]);

    const response = await app.fetch(
      new Request("https://opndomain.com/domains/ai-machine-intelligence"),
      buildEnv(db),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assertTopNavShell(html);
    assert.ok(html.includes("AI Safety"), "parent detail should show child subdomain");
    assert.ok(html.includes("Agent Alpha"), "parent detail should show aggregated leaderboard");
    assert.ok(html.includes("domain-card-simple"), "parent detail should use domain-card-simple cards");
    assert.ok(html.includes("domain-breadcrumb"), "parent detail should have breadcrumb");
    assert.ok(html.includes("lb-table"), "parent detail should use leaderboard table");
    const parentLeaderSql = db.sqlMatching("SUM(dr.decayed_score)");
    assert.ok(parentLeaderSql, "expected aggregated leaderboard SQL to be prepared");
    assert.ok(parentLeaderSql!.includes("b.status = 'active'"), "parent leaderboard must filter inactive beings");
    assert.ok(parentLeaderSql!.includes("a.status = 'active'"), "parent leaderboard must filter inactive owner agents");
  });

  it("renders the subdomain detail page with breadcrumb", async () => {
    const db = new FakeDb();
    db.queueResult("WHERE d.slug = ?", [
      { id: "dom_1", slug: "ai-safety", name: "AI Safety", description: "Model evaluations and safeguards.", parent_domain_id: "dom_ai-machine-intelligence", topic_count: 3, parent_slug: "ai-machine-intelligence", parent_name: "AI & Machine Intelligence" },
    ]);
    db.queueResult("FROM topics t", [
      { id: "topic_1", title: "Should audits be mandatory?", status: "open", template_id: "debate", prompt: "Evaluate whether mandatory audits improve safety.", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-02T00:00:00Z", current_round_index: 0, domain_slug: "ai-safety", domain_name: "AI Safety", parent_domain_name: "AI & Machine Intelligence", member_count: 5, round_count: 2 },
    ]);
    db.queueResult("FROM domain_reputation dr", [
      { handle: "agent-alpha", display_name: "Agent Alpha", trust_tier: "unverified", decayed_score: 82.4, sample_count: 11, contribution_count: 3 },
    ]);

    const response = await app.fetch(
      new Request("https://opndomain.com/domains/ai-safety"),
      buildEnv(db),
      ctx(),
    );

    assert.equal(response.status, 200);
    const html = await response.text();
    assertTopNavShell(html);
    assert.ok(html.includes("Should audits be mandatory?"));
    assert.ok(html.includes("Agent Alpha"));
    assert.ok(html.includes("domain-breadcrumb"), "subdomain detail should have breadcrumb");
    assert.ok(html.includes("ai-machine-intelligence"), "breadcrumb should link to parent");
    assert.ok(html.includes("topics-card"), "subdomain detail should use topic cards");
    assert.ok(html.includes("lb-table"), "subdomain detail should use leaderboard table");
    const subLeaderSql = db.sqlMatching("FROM domain_reputation dr\n        INNER JOIN beings b");
    assert.ok(subLeaderSql, "expected subdomain leaderboard SQL to be prepared");
    assert.ok(subLeaderSql!.includes("b.status = 'active'"), "subdomain leaderboard must filter inactive beings");
    assert.ok(subLeaderSql!.includes("a.status = 'active'"), "subdomain leaderboard must filter inactive owner agents");
  });

  it("redirects legacy beings and agents routes and renders leaderboard index/detail inside the sidebar shell", async () => {
    const indexDb = new FakeDb();
    indexDb.queueResult("LEFT JOIN domain_reputation dr ON dr.being_id = b.id", [
      { handle: "agent-alpha", display_name: "Agent Alpha", bio: "Specialist in model evaluations.", trust_tier: "verified", contribution_count: 9, aggregate_score: 91.5, aggregate_samples: 14 },
    ]);

    const legacyIndexResponse = await app.fetch(
      new Request("https://opndomain.com/beings"),
      buildEnv(indexDb),
      ctx(),
    );
    assert.equal(legacyIndexResponse.status, 302);
    assert.equal(legacyIndexResponse.headers.get("location"), "/leaderboard");

    const legacyAgentsIndexResponse = await app.fetch(
      new Request("https://opndomain.com/agents"),
      buildEnv(indexDb),
      ctx(),
    );
    assert.equal(legacyAgentsIndexResponse.status, 302);
    assert.equal(legacyAgentsIndexResponse.headers.get("location"), "/leaderboard");

    const indexResponse = await app.fetch(
      new Request("https://opndomain.com/leaderboard"),
      buildEnv(indexDb),
      ctx(),
    );

    assert.equal(indexResponse.status, 200);
    const indexHtml = await indexResponse.text();
    assertTopNavShell(indexHtml);
    assert.ok(indexHtml.includes("Leaderboard"));
    const indexSql = indexDb.sqlMatching("LEFT JOIN domain_reputation dr ON dr.being_id = b.id");
    assert.ok(indexSql, "expected leaderboard index SQL to be prepared");
    assert.ok(indexSql!.includes("b.status = 'active'"), "leaderboard index must filter inactive beings");
    assert.ok(indexSql!.includes("a.status = 'active'"), "leaderboard index must filter inactive owner agents");

    const detailDb = new FakeDb();
    detailDb.queueResult("WHERE b.handle = ?", [
      { id: "being_1", handle: "agent-alpha", display_name: "Agent Alpha", bio: "Specialist in model evaluations.", trust_tier: "verified" },
    ]);
    detailDb.queueResult("FROM domain_reputation dr", [
      { slug: "ai-safety", name: "AI Safety", decayed_score: 91.5, sample_count: 14 },
    ]);
    detailDb.queueResult("FROM contributions c", [
      { topic_id: "topic_1", title: "Should audits be mandatory?", round_kind: "synthesize", submitted_at: "2026-03-30T00:00:00.000Z" },
    ]);

    const legacyDetailResponse = await app.fetch(
      new Request("https://opndomain.com/beings/agent-alpha"),
      buildEnv(detailDb),
      ctx(),
    );
    assert.equal(legacyDetailResponse.status, 302);
    assert.equal(legacyDetailResponse.headers.get("location"), "/leaderboard/agent-alpha");

    const legacyAgentsDetailResponse = await app.fetch(
      new Request("https://opndomain.com/agents/agent-alpha"),
      buildEnv(detailDb),
      ctx(),
    );
    assert.equal(legacyAgentsDetailResponse.status, 302);
    assert.equal(legacyAgentsDetailResponse.headers.get("location"), "/leaderboard/agent-alpha");

    const detailResponse = await app.fetch(
      new Request("https://opndomain.com/leaderboard/agent-alpha"),
      buildEnv(detailDb),
      ctx(),
    );

    assert.equal(detailResponse.status, 200);
    const detailHtml = await detailResponse.text();
    assertTopNavShell(detailHtml);
    assert.ok(detailHtml.includes("Contributions"));
    const detailLookupSql = detailDb.sqlMatching("WHERE b.handle = ?");
    assert.ok(detailLookupSql, "expected being lookup SQL to be prepared");
    assert.ok(detailLookupSql!.includes("b.status = 'active'"), "being lookup must filter inactive beings");
    assert.ok(detailLookupSql!.includes("a.status = 'active'"), "being lookup must filter inactive owner agents");

    const missingDb = new FakeDb();
    const missingResponse = await app.fetch(
      new Request("https://opndomain.com/leaderboard/retired-agent"),
      buildEnv(missingDb),
      ctx(),
    );
    assert.equal(missingResponse.status, 404, "inactive or unknown being should 404");
  });

  it("renders about, access, and legacy access redirects correctly", async () => {
    const aboutResponse = await app.fetch(
      new Request("https://opndomain.com/about"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(aboutResponse.status, 200);
    const aboutHtml = await aboutResponse.text();
    assertTopNavShell(aboutHtml);
    assert.ok(aboutHtml.includes("A public protocol for reasoning in the open."));

    const accessResponse = await app.fetch(
      new Request("https://opndomain.com/access"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(accessResponse.status, 200);
    const accessHtml = await accessResponse.text();
    assertTopNavShell(accessHtml);
    assert.ok(accessHtml.includes("Continue with Google"));
    assert.ok(accessHtml.includes("Need help?"));
    assert.ok(accessHtml.includes("mailto:noreply%40opndomain.com?subject=opndomain+sign-in+help"));

    const connectResponse = await app.fetch(
      new Request("https://opndomain.com/connect"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(connectResponse.status, 302);
    assert.equal(connectResponse.headers.get("location"), "/login");

    const mcpResponse = await app.fetch(
      new Request("https://opndomain.com/mcp"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(mcpResponse.status, 200);
    const mcpHtml = await mcpResponse.text();
    assert.ok(mcpHtml.includes("Connect your agent to the protocol"), "MCP connect page should render with connection methods");
  });

  it("renders canonical access and legal pages inside the top-nav-only shell", async () => {
    const accessResponse = await app.fetch(
      new Request("https://opndomain.com/access"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(accessResponse.status, 200);
    const accessHtml = await accessResponse.text();
    assertTopNavShell(accessHtml);
    assert.ok(accessHtml.includes('action="/login/magic"'));
    assert.ok(accessHtml.includes("Continue with Google"));

    const loginRedirect = await app.fetch(
      new Request("https://opndomain.com/login"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(loginRedirect.status, 302);
    assert.equal(loginRedirect.headers.get("location"), "/access");

    const privacyResponse = await app.fetch(
      new Request("https://opndomain.com/privacy"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(privacyResponse.status, 200);
    const privacyHtml = await privacyResponse.text();
    assertTopNavShell(privacyHtml);
    assert.ok(privacyHtml.includes("Launch privacy"));
  });

  it("renders auth success and error states inside the top-nav-only shell", async () => {
    const registerApi = new FakeApiService();
    registerApi.set("/v1/auth/register", {
      data: {
        clientId: "client_123",
        clientSecret: "secret_123",
        agent: { email: "agent@example.com" },
        verification: { expiresAt: "2026-04-01T00:00:00.000Z", delivery: { code: "123456" } },
      },
    });
    const registerResponse = await app.fetch(
      new Request("https://opndomain.com/register", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "name=Agent+Alpha&email=agent%40example.com",
      }),
      buildEnv(new FakeDb(), undefined, undefined, registerApi),
      ctx(),
    );
    assert.equal(registerResponse.status, 403);
    assertTopNavShell(await registerResponse.text());

    const verifyApi = new FakeApiService();
    verifyApi.set("/v1/auth/verify-email", { data: {} });
    const verifyResponse = await app.fetch(
      new Request("https://opndomain.com/verify-email", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "clientId=client_123&code=123456",
      }),
      buildEnv(new FakeDb(), undefined, undefined, verifyApi),
      ctx(),
    );
    assert.equal(verifyResponse.status, 403);
    assertTopNavShell(await verifyResponse.text());

    const loginVerifyResponse = await app.fetch(
      new Request("https://opndomain.com/login/verify"),
      buildEnv(new FakeDb()),
      ctx(),
    );
    assert.equal(loginVerifyResponse.status, 400);
    assertTopNavShell(await loginVerifyResponse.text());
  });

  it("renders account and welcome credentials correctly for authenticated users", async () => {
    const api = new FakeApiService();
    queueAccountApi(api);

    const accountResponse = await app.fetch(
      new Request("https://opndomain.com/account", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );
    assert.equal(accountResponse.status, 200);
    const accountHtml = await accountResponse.text();
    assertTopNavShell(accountHtml);
    assert.ok(accountHtml.includes("Agent Alpha"));
    assert.ok(accountHtml.includes("Rotate secret"));
    assert.ok(accountHtml.includes("Need help?"));
    assert.ok(accountHtml.includes("mailto:noreply%40opndomain.com?subject=opndomain+account+help"));

    const welcomeResponse = await app.fetch(
      new Request("https://opndomain.com/welcome/credentials", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );
    assert.equal(welcomeResponse.status, 200);
    const welcomeHtml = await welcomeResponse.text();
    assertTopNavShell(welcomeHtml);
    assert.ok(welcomeHtml.includes("OAuth account created."));
    assert.ok(welcomeHtml.includes("secret_123"));
  });

  it("supports email linking and machine secret rotation from the account page", async () => {
    const api = new FakeApiService();
    api.set("/v1/auth/session", {
      data: {
        agent: { email: "agent@example.com", clientId: "client_123" },
        beings: [{ id: "being_1", handle: "agent-alpha" }],
      },
    });
    api.set("/v1/auth/session/account", {
      data: {
        agent: {
          id: "agent_1",
          clientId: "client_123",
          name: "Agent Alpha",
          email: "agent@example.com",
          emailVerifiedAt: null,
          trustTier: "unverified",
          status: "active",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
        beings: [
          { id: "being_1", handle: "agent-alpha", trustTier: "unverified", status: "active" },
        ],
        linkedIdentities: [],
      },
    });
    api.set("/v1/auth/email-link", { data: { ok: true } });
    api.set("/v1/auth/credentials/rotate", { data: { clientId: "client_123", clientSecret: "secret_456" } });

    const emailLinkResponse = await app.fetch(
      new Request("https://opndomain.com/account/email-link", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "opn_session=abc123; opn_csrf=csrf123",
        },
        body: "csrfToken=csrf123&email=agent%40example.com",
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );
    assert.equal(emailLinkResponse.status, 200);
    const emailLinkHtml = await emailLinkResponse.text();
    assertTopNavShell(emailLinkHtml);
    assert.ok(emailLinkHtml.includes("Verification link sent."));

    const rotateResponse = await app.fetch(
      new Request("https://opndomain.com/account/credentials/rotate", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "opn_session=abc123; opn_csrf=csrf123",
        },
        body: "csrfToken=csrf123",
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );
    assert.equal(rotateResponse.status, 200);
    const rotateHtml = await rotateResponse.text();
    assertTopNavShell(rotateHtml);
    assert.ok(rotateHtml.includes("Machine secret rotated."));
    assert.ok(rotateHtml.includes("secret_456"));
  });

  it("redirects unauthenticated account requests to access", async () => {
    const response = await app.fetch(
      new Request("https://opndomain.com/account"),
      buildEnv(new FakeDb()),
      ctx(),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/access?next=%2Faccount");
  });

  it("redirects unauthenticated admin requests to login", async () => {
    const response = await app.fetch(
      new Request("https://opndomain.com/admin/dashboard"),
      buildEnv(new FakeDb()),
      ctx(),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/login?next=%2Fadmin%2Fdashboard");
  });

  it("renders the admin dashboard and topic detail pages through the admin subrouter", async () => {
    const db = new FakeDb();
    const api = new FakeApiService();
    api.set("/v1/auth/session", {
      data: {
        agent: { email: "admin@example.com", clientId: "client_admin" },
        beings: [{ id: "being_1", handle: "admin-alpha" }],
      },
    });
    api.set("/v1/internal/health", {
      data: {
        snapshotPendingCount: 1,
        presentationPendingCount: 2,
        topicStatusDistribution: [{ status: "open", count: 3 }],
      },
    });
    api.set("/v1/internal/admin/dashboard/overview", {
      data: {
        headline: {
          openTopics: 5,
          stalledTopics: 1,
          topicsClosed24h: 2,
          quarantinedContributions: 1,
          activeRestrictions: 0,
          newAgents24h: 3,
          newBeings24h: 2,
          agentsOnline: 1,
          beingsActiveNow: 1,
        },
        ops: {
          snapshotPendingCount: 1,
          presentationPendingCount: 2,
          topicStatusDistribution: [{ status: "open", count: 3 }],
          cronHeartbeats: [],
          recentLifecycleMutations: [],
        },
        queues: {
          quarantineItems: [{
            contributionId: "con_q1",
            topicId: "top_1",
            topicTitle: "Admin topic",
            beingHandle: "flagged-being",
            bodyExcerpt: "some flagged text",
            guardrailDecision: "quarantine",
            submittedAt: "2026-04-02T00:00:00.000Z",
          }],
          stalledTopicItems: [],
          recentlyClosedTopics: [],
          topicsNeedingAttention: [],
        },
      },
    });
    api.set("/v1/internal/admin/topics/top_1", {
      data: {
        id: "top_1",
        domainId: "dom_1",
        domainSlug: "biology",
        domainName: "Biology",
        title: "Admin topic",
        status: "started",
        topicSource: "manual_admin",
        archived: false,
        archivedAt: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
        prompt: "Should started topics lock prompt edits?",
        templateId: "debate",
        cadenceFamily: "scheduled",
        cadencePreset: "24h",
        cadenceOverrideMinutes: null,
        minTrustTier: "supervised",
        visibility: "public",
        currentRoundIndex: 1,
        startsAt: "2026-04-01T00:00:00.000Z",
        joinUntil: "2026-04-01T01:00:00.000Z",
        countdownStartedAt: null,
        stalledAt: null,
        closedAt: null,
        archivedByAgentId: null,
        archivedByAgentName: null,
        archiveReason: null,
        activeMemberCount: 3,
        contributionCount: 8,
        roundCount: 2,
      },
    });
    api.set("/v1/internal/admin/audit-log?target_type=topic&target_id=top_1&page_size=20", {
      data: { items: [], nextCursor: null },
    });
    api.set("/v1/internal/admin/restrictions?scope_type=topic&scope_id=top_1", {
      data: [],
    });
    api.set("/v1/internal/admin/domains?pageSize=100", {
      data: {
        items: [{
          id: "dom_1",
          slug: "biology",
          name: "Biology",
          description: null,
          status: "active",
          parentDomainId: null,
          archived: false,
          topicCount: 1,
          activeTopicCount: 1,
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        }],
      },
    });

    const dashboardResponse = await app.fetch(
      new Request("https://opndomain.com/admin/dashboard", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(db, undefined, undefined, api),
      ctx(),
    );
    assert.equal(dashboardResponse.status, 200);
    const dashboardHtml = await dashboardResponse.text();
    assertSidebarShell(dashboardHtml);
    assert.ok(dashboardHtml.includes("Admin Dashboard"));
    assert.ok(dashboardHtml.includes("Lifecycle sweep"));
    assert.ok(dashboardHtml.includes("Quarantine queue"));
    assert.ok(dashboardHtml.includes("/admin/contributions/con_q1/release"));
    assert.ok(dashboardHtml.includes("/admin/contributions/con_q1/block"));
    assert.ok(dashboardHtml.includes('content="60"'), "should include 60s auto-refresh meta tag");
    assert.ok(dashboardHtml.includes("Updates every 60s"), "should show refresh interval copy");
    assert.ok(dashboardHtml.includes("At a glance"), "should render KPI strip");
    assert.ok(dashboardHtml.includes("Drilldowns"), "should render drilldown links");

    const topicResponse = await app.fetch(
      new Request("https://opndomain.com/admin/topics/top_1", {
        headers: { cookie: "opn_session=abc123" },
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );
    assert.equal(topicResponse.status, 200);
    const topicHtml = await topicResponse.text();
    assertSidebarShell(topicHtml);
    assert.ok(topicHtml.includes("Admin topic"));
    assert.ok(topicHtml.includes("disabled"));
  });

  it("sanitizes admin redirect targets on contribution moderation actions", async () => {
    const api = new FakeApiService();
    api.set("/v1/auth/session", {
      data: {
        agent: { email: "admin@example.com", clientId: "client_admin" },
        beings: [{ id: "being_1", handle: "admin-alpha" }],
      },
    });
    api.set("/v1/internal/health", {
      data: {
        snapshotPendingCount: 1,
        presentationPendingCount: 2,
        topicStatusDistribution: [{ status: "open", count: 3 }],
      },
    });
    api.set("/v1/internal/contributions/con_q1/quarantine", { data: { ok: true } });

    const response = await app.fetch(
      new Request("https://opndomain.com/admin/contributions/con_q1/release", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "opn_session=abc123; opn_csrf=csrf123",
        },
        body: "csrfToken=csrf123&reason=admin_ui&redirectTo=https%3A%2F%2Fevil.example%2Fsteal",
      }),
      buildEnv(new FakeDb(), undefined, undefined, api),
      ctx(),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/admin/dashboard");
  });

  it("renders not-found routes inside the shared top-nav shell", async () => {
    const response = await app.fetch(
      new Request("https://opndomain.com/nope"),
      buildEnv(new FakeDb()),
      ctx(),
    );

    assert.equal(response.status, 404);
    const html = await response.text();
    assertTopNavShell(html);
    assert.ok(html.includes("Page not found."));
  });
});

describe("VerdictPositionSchema with audit fields", () => {
  it("accepts positions with landingCount and landingHandles", async () => {
    const { VerdictPositionSchema } = await import("@opndomain/shared");
    const pos = {
      label: "Position A",
      contributionIds: ["c1", "c2"],
      aggregateScore: 80,
      stanceCounts: { support: 2, oppose: 1, neutral: 0 },
      strength: 75,
      classification: "majority" as const,
      landingCount: 2,
      landingHandles: ["alice", "carol"],
    };
    const result = VerdictPositionSchema.safeParse(pos);
    assert.ok(result.success);
    assert.equal(result.data.landingCount, 2);
    assert.deepEqual(result.data.landingHandles, ["alice", "carol"]);
  });

  it("accepts positions without landing fields (backward-compatible)", async () => {
    const { VerdictPositionSchema } = await import("@opndomain/shared");
    const pos = {
      label: "Position B",
      contributionIds: ["c3"],
      aggregateScore: 60,
      stanceCounts: { support: 1, oppose: 2, neutral: 0 },
      strength: 40,
      classification: "minority" as const,
    };
    const result = VerdictPositionSchema.safeParse(pos);
    assert.ok(result.success);
    assert.equal(result.data.landingCount, undefined);
    assert.equal(result.data.landingHandles, undefined);
  });
});
