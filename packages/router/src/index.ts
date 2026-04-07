import { Hono } from "hono";
import {
  CACHE_CONTROL_CURATED,
  CACHE_CONTROL_DIRECTORY,
  CACHE_CONTROL_NO_STORE,
  CACHE_CONTROL_STATIC,
  CACHE_CONTROL_TRANSCRIPT,
  CACHE_GENERATION_LANDING,
  cacheGenerationDomainKey,
  cacheGenerationTopicKey,
  CURATED_OPEN_KEY,
  extractSubdomain,
  pageHtmlBeingKey,
  pageHtmlDomainKey,
  PAGE_HTML_LANDING_KEY,
  pageHtmlTopicKey,
  pageHtmlTopicsKey,
  parseBaseEnv,
  TOPIC_TEMPLATES,
  topicVerdictPresentationArtifactKey,
  tryParseMapRoundBody,
  VerdictPresentationSchema,
} from "@opndomain/shared";
import type { MapRoundBody } from "@opndomain/shared";
import type { AnalyticsOverviewResponse, AnalyticsTopicResponse, AnalyticsVoteReliabilityResponse } from "@opndomain/shared";
import { analyticsRangeWindow, normalizeAnalyticsRange, renderAnalyticsPage } from "./lib/analytics.js";
import { serveCachedHtml } from "./lib/cache.js";
import { assertCsrfToken, csrfHiddenInput, ensureCsrfToken } from "./lib/csrf.js";
import { LANDING_HERO_BG_BASE64, LANDING_HERO_BG_CONTENT_TYPE } from "./generated/landing-background.js";
import { renderPage, type PageHeadMetadata, type PageShellOptions } from "./lib/layout.js";
import { adminTable, card, dataBadge, editorialHeader, escapeHtml, formatDate, formCard, grid, hero, oauthProviderLabel, providerDisplayName, publicSidebar, rawHtml, statRow, statusPill, svgIconFor, topicCard, topicSharePanel, topicsEmpty, topicsFilterBar, verdictClaimGraphSection } from "./lib/render.js";
import { apiFetch, apiJson, fetchAccountData, readSessionId, validateSession } from "./lib/session.js";
import { LEADERBOARD_DETAIL_PAGE_STYLES, LEADERBOARD_INDEX_PAGE_STYLES, ANALYTICS_PAGE_STYLES, DOMAIN_INDEX_PAGE_STYLES, DOMAIN_DETAIL_PAGE_STYLES, EDITORIAL_PAGE_STYLES, TOPIC_DETAIL_PAGE_STYLES, TOPICS_PAGE_STYLES } from "./lib/tokens.js";
import { loadLandingSnapshot, renderLandingPage, renderAboutPage, renderConnectPage } from "./landing.js";

type RouterEnv = {
  Bindings: {
    API_SERVICE: Fetcher;
    MCP_SERVICE?: Fetcher;
    DB: D1Database;
    PUBLIC_CACHE: KVNamespace;
    PUBLIC_ARTIFACTS: R2Bucket;
    SNAPSHOTS: R2Bucket;
  } & ReturnType<typeof parseBaseEnv>;
};

type CuratedOpen = {
  generatedAt: string;
  topics: Array<{ id: string; title: string; status: string; updatedAt: string }>;
};

type AdminSessionData = {
  session: {
    agent: { email: string | null; clientId: string };
    beings: Array<{ id: string; handle: string }>;
  };
  health: {
    snapshotPendingCount: number;
    presentationPendingCount: number;
    topicStatusDistribution?: Array<{ status: string; count: number }>;
  };
};

type AdminDashboardData = {
  topics: Array<{ id: string; title: string; status: string; domain_name: string }>;
  quarantined: Array<{ id: string; handle: string; topic_id: string; title: string }>;
};

type AdminTopicData = {
  topic: { id: string; title: string; status: string; prompt: string; artifact_status: string | null } | null;
  apiTopic: { rounds?: Array<{ status: string; roundKind: string; id: string }> } | null;
};

type TopicPageMeta = {
  id: string;
  title: string;
  status: string;
  prompt: string;
  template_id: string;
  domain_name: string;
  domain_slug: string;
  parent_domain_name: string | null;
  parent_domain_slug: string | null;
  artifact_status: string | null;
  verdict_html_key: string | null;
  og_image_key: string | null;
  verdict_summary: string | null;
  verdict_confidence: string | null;
  member_count: number;
  contribution_count: number;
};

const app = new Hono<RouterEnv>();
const LANDING_PAGE_CACHE_KEY = `${PAGE_HTML_LANDING_KEY}:2026-04-landing-split-v2`;
const TOPICS_INDEX_CACHE_KEY_VERSION = "2026-04-topics-rename";
const DOMAINS_INDEX_CACHE_KEY_VERSION = "2026-04-domain-groups";
const LEADERBOARD_INDEX_CACHE_KEY_VERSION = "2026-04-leaderboard-table-redesign";
const TOPIC_PAGE_CACHE_KEY_VERSION = "2026-04-topic-verdict-rework-v10";
const CANONICAL_TOPICS_PATH = "/topics";
const CANONICAL_LEADERBOARD_PATH = "/leaderboard";
const CANONICAL_ACCESS_PATH = "/access";


function htmlResponse(html: string, cacheControl = CACHE_CONTROL_NO_STORE, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

function withSecurityHeaders(response: Response): Response {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function htmlResponseWithCsrf(c: any, html: string, cacheControl = CACHE_CONTROL_NO_STORE, status = 200, csrf = ensureCsrfToken(c)) {
  const response = htmlResponse(html, cacheControl, status);
  if (csrf.setCookie) {
    response.headers.append("set-cookie", csrf.setCookie);
  }
  return response;
}

function redirectResponse(location: string, setCookies: string[] = []) {
  const response = new Response(null, { status: 302, headers: { location } });
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function redirectWithSameQuery(c: any, pathname: string) {
  const source = new URL(c.req.url);
  const target = new URL(pathname, source.origin);
  target.search = source.search;
  return redirectResponse(`${target.pathname}${target.search}`);
}

function oauthAuthorizeUrl(env: RouterEnv["Bindings"], provider: "google" | "github" | "x", redirect = "/account") {
  const url = new URL(`/v1/auth/oauth/${provider}/authorize`, env.API_ORIGIN);
  url.searchParams.set("redirect", redirect);
  return url.toString();
}

function safeNextPath(candidate: string | null | undefined, fallback = "/account") {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}

function trimCopy(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function topicPageUrl(env: RouterEnv["Bindings"], topicId: string, suffix = "") {
  return new URL(`/topics/${encodeURIComponent(topicId)}${suffix}`, env.ROUTER_ORIGIN).toString();
}

function accessPath(nextPath?: string) {
  if (!nextPath) {
    return CANONICAL_ACCESS_PATH;
  }
  const params = new URLSearchParams({ next: nextPath });
  return `${CANONICAL_ACCESS_PATH}?${params.toString()}`;
}

function sidebarShell(activeKey: NonNullable<PageShellOptions["navActiveKey"]>, options: {
  eyebrow: string;
  title: string;
  detail: string;
  meta?: Array<{ label: string; value: string }>;
  action?: { href: string; label: string } | null;
}): PageShellOptions {
  return {
    variant: "interior-sidebar",
    navActiveKey: activeKey,
    sidebarHtml: publicSidebar({
      activeKey,
      eyebrow: options.eyebrow,
      title: options.title,
      detail: options.detail,
      meta: options.meta,
      action: options.action ?? null,
    }),
  };
}

function authShell(title: string, detail: string): PageShellOptions {
  return {
    variant: "top-nav-only",
    navActiveKey: "auth",
    sidebarHtml: null,
    bodyClassName: "auth-shell-page",
    mainClassName: "auth-shell-main",
  };
}

type AccessPageState = {
  activePanel?: "signin" | "register" | "verify";
  statusCode?: number;
  statusTone?: "success" | "error" | "info";
  statusTitle?: string;
  statusBody?: string;
  oauthError?: string | null;
  provider?: string | null;
  nextPath?: string;
  lookupEmail?: string | null;
  registrationResult?: {
    clientId: string;
    clientSecret: string;
    email: string;
    expiresAt: string;
    code: string;
  } | null;
};

type AccountPageState = {
  statusTone?: "success" | "error" | "info";
  statusTitle?: string;
  statusBody?: string;
  rotatedCredentials?: {
    clientId: string;
    clientSecret: string;
  } | null;
};

function renderAccessPage(c: any, state: AccessPageState = {}) {
  const csrf = ensureCsrfToken(c);
  const nextPath = safeNextPath(state.nextPath ?? c.req.query("next"));
  const oauthError = state.oauthError ?? c.req.query("oauth_error");
  const provider = state.provider ?? c.req.query("provider");
  const panelQuery = c.req.query("panel");
  const activePanel = state.activePanel ?? (panelQuery === "register" || panelQuery === "verify" ? panelQuery : "signin");
  const oauthButtons = (["google"] as const).map((item) => `
    <a class="oauth-btn" href="${oauthAuthorizeUrl(c.env, item, nextPath)}">
      ${svgIconFor(item)} ${oauthProviderLabel(item)}
    </a>
  `).join("");
  const statusMarkup = state.statusTitle
    ? `<div class="auth-error auth-error--${escapeHtml(state.statusTone ?? "info")}"><strong>${escapeHtml(state.statusTitle)}</strong><span>${escapeHtml(state.statusBody ?? "")}</span></div>`
    : oauthError
    ? `<div class="auth-error"><strong>OAuth sign-in failed.</strong><span>${escapeHtml(oauthError)}${provider ? ` (provider: ${escapeHtml(provider)})` : ""}</span></div>`
    : "";
  const panelClass = (panel: typeof activePanel) => `button secondary${panel === activePanel ? " is-active" : ""}`;
  const lookupEmail = state.lookupEmail ?? null;
  const registrationPanel = state.registrationResult
    ? `
      <section class="form-card">
        <h3>Registration complete</h3>
        <p>Store these machine credentials now. The verification code remains valid until the listed expiry.</p>
        ${statRow("Client ID", state.registrationResult.clientId)}
        ${statRow("Client Secret", state.registrationResult.clientSecret)}
        ${statRow("Email", state.registrationResult.email)}
        ${statRow("Verify by", state.registrationResult.expiresAt)}
        <p class="mono">Verification code: ${escapeHtml(state.registrationResult.code)}</p>
      </section>
    `
    : "";
  const guestChoicePanel = lookupEmail
    ? `
      <section class="form-card">
        <h3>No account found</h3>
        <p>That email is not registered yet. Create a verified account for manual topics, or continue as a guest for autonomous cron_auto topics only.</p>
        <div class="grid two">
          <form class="auth-form" method="post" action="/register">
            ${csrfHiddenInput(csrf.token)}
            <label>Name<input name="name" required /></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(lookupEmail)}" required /></label>
            <button type="submit">Create account</button>
          </form>
          <form class="auth-form" method="post" action="/login/guest">
            ${csrfHiddenInput(csrf.token)}
            <button type="submit">Continue as guest</button>
          </form>
        </div>
      </section>
    `
    : "";
  const body = rawHtml(`
    <section class="auth-page">
      <div class="auth-card">
        <h1>Sign in</h1>
        ${statusMarkup}
        ${guestChoicePanel}
        ${registrationPanel}
        <div class="oauth-buttons">${oauthButtons}</div>
        <div class="auth-divider"><span>or</span></div>
        <form class="auth-form" method="post" action="/login/magic">
          ${csrfHiddenInput(csrf.token)}
          <input type="email" name="email" placeholder="you@example.com" required>
          <button class="btn-primary" type="submit">Continue with email</button>
        </form>
        <p class="auth-connect-link">Looking to connect an agent? <a href="/mcp">View connection methods</a></p>
      </div>
    </section>
  `).__html;
  const html = renderPage("Access", body, undefined, undefined, undefined, {
    variant: "top-nav-only",
    navActiveKey: "access",
    bodyClassName: "auth-shell-page",
    footerClassName: "auth-footer",
  });
  return htmlResponseWithCsrf(c, html, CACHE_CONTROL_NO_STORE, state.statusCode ?? 200, csrf);
}

function renderAuthPage(title: string, body: string, detail: string, options?: {
  description?: string;
  cacheControl?: string;
  status?: number;
  head?: PageHeadMetadata;
}) {
  return htmlResponse(
    renderPage(
      title,
      body,
      options?.description,
      undefined,
      options?.head,
      authShell(title, detail),
    ),
    options?.cacheControl ?? CACHE_CONTROL_NO_STORE,
    options?.status ?? 200,
  );
}

function renderAccountPage(c: any, account: NonNullable<Awaited<ReturnType<typeof fetchAccountData>>>, state: AccountPageState = {}) {
  const csrf = ensureCsrfToken(c);
  const { agent, beings, linkedIdentities } = account;
  const initial = (agent.name || agent.email || "?")[0].toUpperCase();
  const emailBadge = agent.emailVerifiedAt
    ? `<span class="acct-badge verified">email verified</span>`
    : `<span class="acct-badge unverified">email unverified</span>`;
  const statusMarkup = state.statusTitle
    ? `<div class="auth-error auth-error--${escapeHtml(state.statusTone ?? "info")}"><strong>${escapeHtml(state.statusTitle)}</strong><span>${escapeHtml(state.statusBody ?? "")}</span></div>`
    : "";
  const rotatedMarkup = state.rotatedCredentials
    ? `
      <div class="acct-section">
        <div class="acct-section-label">Rotated credentials</div>
        <div class="acct-cred"><strong>Client ID</strong><code>${escapeHtml(state.rotatedCredentials.clientId)}</code></div>
        <div class="acct-cred"><strong>Client Secret</strong><code>${escapeHtml(state.rotatedCredentials.clientSecret)}</code></div>
      </div>
    `
    : "";
  const beingsHtml = beings.length
    ? beings.map((b) => `
        <div class="acct-being">
          <div>
            <div class="acct-being-handle"><a href="/leaderboard/${escapeHtml(b.handle)}">@${escapeHtml(b.handle)}</a></div>
            <div class="acct-being-id">${escapeHtml(b.id)}</div>
          </div>
          <div class="acct-being-badges">
            <span class="acct-badge trust">${escapeHtml(b.trustTier)}</span>
            <span class="acct-badge status">${escapeHtml(b.status)}</span>
          </div>
        </div>
      `).join("")
    : `<p class="acct-empty">No agents yet.</p>`;
  const providersHtml = linkedIdentities.length
    ? linkedIdentities.map((li) => {
        const provider = li.provider as "google" | "github" | "x";
        return `
          <div class="acct-provider">
            ${svgIconFor(provider)}
            <span class="acct-provider-name">${escapeHtml(providerDisplayName(li.provider))}</span>
            ${li.emailSnapshot ? `<span class="acct-provider-meta">${escapeHtml(li.emailSnapshot)}</span>` : ""}
            <span class="acct-provider-meta">linked ${escapeHtml(formatDate(li.linkedAt))}</span>
          </div>
        `;
      }).join("")
    : `<p class="acct-empty">No linked accounts.</p>`;

  return htmlResponseWithCsrf(c, renderPage("Account", rawHtml(`
    <section class="auth-page">
      <div class="acct-card">
        <div class="acct-header">
          <div class="acct-avatar">${escapeHtml(initial)}</div>
          <div class="acct-identity">
            <h1 class="acct-name">${escapeHtml(agent.name)}</h1>
            <p class="acct-email">${escapeHtml(agent.email ?? "No email")}</p>
          </div>
        </div>

        <div class="acct-badges">
          <span class="acct-badge">${escapeHtml(agent.trustTier)}</span>
          <span class="acct-badge">${escapeHtml(agent.status)}</span>
          ${agent.emailVerifiedAt ? `<span class="acct-badge acct-badge--ok">verified</span>` : `<span class="acct-badge acct-badge--warn">unverified</span>`}
        </div>

        ${statusMarkup}

        <div class="acct-section">
          <div class="acct-section-label">Credentials</div>
          <div class="acct-row"><span>Client ID</span><code>${escapeHtml(agent.clientId)}</code></div>
          <div class="acct-row"><span>Agent ID</span><code>${escapeHtml(agent.id)}</code></div>
          <form method="post" action="/account/credentials/rotate">
            ${csrfHiddenInput(csrf.token)}
            <button class="btn-secondary" type="submit">Rotate secret</button>
          </form>
        </div>

        ${rotatedMarkup}

        <div class="acct-section">
          <div class="acct-section-label">Email</div>
          <form method="post" action="/account/email-link" class="acct-email-form">
            ${csrfHiddenInput(csrf.token)}
            <input type="email" name="email" value="${escapeHtml(agent.email ?? "")}" placeholder="you@example.com" required />
            <button class="btn-primary" type="submit">Verify email</button>
          </form>
        </div>

        <div class="acct-section">
          <div class="acct-section-label">Your agents</div>
          ${beingsHtml}
        </div>

        <div class="acct-section">
          <div class="acct-section-label">Linked accounts</div>
          ${providersHtml}
        </div>

        <div class="acct-footer">
          <span class="acct-meta">Member since ${escapeHtml(formatDate(agent.createdAt))}</span>
          <form method="post" action="/logout">${csrfHiddenInput(csrf.token)}<button class="btn-secondary" type="submit">Sign out</button></form>
        </div>
      </div>
    </section>
  `).__html, undefined, undefined, undefined, {
    variant: "top-nav-only",
    navActiveKey: "auth",
    bodyClassName: "auth-shell-page",
    footerClassName: "auth-footer",
  }), CACHE_CONTROL_NO_STORE, 200, csrf);
}

function buildTopicShareDescription(meta: TopicPageMeta, verdictSummary?: string | null): string {
  const countSummary = `${meta.member_count} participants, ${meta.contribution_count} contributions`;
  const summary = verdictSummary ?? meta.verdict_summary;
  if (meta.status === "closed" && summary) {
    return trimCopy(`${meta.domain_name}. ${summary} ${countSummary}.`, 220);
  }
  return trimCopy(`${meta.domain_name}. ${meta.prompt} ${countSummary}.`, 220);
}

type TopicStateSnapshot = {
  memberCount?: number;
  contributionCount?: number;
};

type TopicTranscriptContribution = {
  id?: string;
  beingHandle?: string;
  displayName?: string | null;
  bodyClean?: string | null;
  scores?: {
    final?: number | null;
  };
};

type TopicTranscriptRound = {
  sequenceIndex?: number;
  roundKind?: string;
  contributions?: TopicTranscriptContribution[];
};

type TopicVerdictPresentation = NonNullable<Awaited<ReturnType<typeof readVerdictPresentation>>>;

type RankedContributionViewModel = {
  id: string;
  handle: string;
  displayName: string | null;
  bodyHtml: string;
  finalScore: number | null;
  finalScoreLabel: string;
  finalScorePercent: number;
  rank: number;
  roundLabel: string;
  roleLabel: string;
};

type TopicRoundViewModel = {
  sequenceIndex: number;
  roundKind: string;
  roundLabel: string;
  roundTitle: string;
  contributionCount: number;
  topScoreLabel: string;
  rangeLabel: string;
  leaderHandle: string | null;
  leaderDisplayName: string | null;
  openByDefault: boolean;
  contributions: RankedContributionViewModel[];
};

type TopicPageViewModel = {
  prompt: string;
  participants: number;
  contributions: number;
  visibleRoundCount: number;
  headerMeta: Array<{ label: string; value: string }>;
  metaPanel: {
    kicker: string;
    primaryValue: string;
    secondaryValue: string;
    explanation: string;
    badges: string[];
    stats: Array<{ label: string; value: string }>;
    tone: "verdict" | "pending" | "open" | "unavailable";
  };
  featuredAnswer: RankedContributionViewModel | null;
  rounds: TopicRoundViewModel[];
  editorialBody: string | null;
  headlineLabel: string | null;
  headlineStance: string | null; // Pass 2: remove when OG/artifact confidence removal is complete
  confidencePercentLabel: string | null; // Pass 2: remove when OG/artifact confidence removal is complete
  verdictNarrative: TopicVerdictPresentation["narrative"] | null;
  verdictHighlights: TopicVerdictPresentation["highlights"] | null;
  verdictClaimGraph: TopicVerdictPresentation["claimGraph"] | null;
  synthesisOutcome: string | null;
  positions: Array<{
    label: string;
    contributionIds: string[];
    aggregateScore: number;
    stanceCounts: { support: number; oppose: number; neutral: number };
    strength: number;
    share?: number;
    classification?: "majority" | "runner_up" | "minority" | "noise";
  }> | null;
  convergenceMap: Array<{
    label: string;
    share: number;
    classification: "majority" | "runner_up" | "minority";
    strength: number;
    aggregateScore: number;
    contributionCount: number;
    stanceCounts: { support: number; oppose: number; neutral: number };
  }> | null;
  winningArgument: {
    bodyHtml: string;
    handle: string;
    displayName?: string | null;
    finalScore: number;
    finalScoreLabel: string;
    bodyCleanRaw: string | null;
    contributionId?: string | null;
  } | null;
  strongestCounter: {
    contributionId: string;
    bodyCleanRaw: string;
    handle: string;
    displayName: string | null;
    finalScore: number;
  } | null;
  dossier: TopicVerdictPresentation["dossier"] | null;
  minorityReports: TopicVerdictPresentation["minorityReports"] | null;
  bothSidesSummary: TopicVerdictPresentation["bothSidesSummary"] | null;
  openingSynthesisHtml: string | null;
  openingSynthesisContributionId: string | null;
  closureLine: string;
  convergenceLabel: string | null;
};

function titleCaseLabel(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function mapConvergenceLabel(outcome: string | null): string | null {
  const map: Record<string, string> = {
    clear_synthesis: "Clear synthesis",
    contested_synthesis: "Contested synthesis",
    emerging_synthesis: "Emerging synthesis",
    insufficient_signal: "Insufficient signal",
  };
  return outcome ? map[outcome] ?? null : null;
}

function renderParagraphs(text: string | null | undefined, className: string) {
  const source = text?.trim();
  if (!source) {
    return `<p class="${className}">${escapeHtml("No transcript content was published for this contribution.")}</p>`;
  }
  return source
    .split(/\n\s*\n/)
    .filter((p) => {
      const t = p.trim();
      return !/^\s*KICKER\s*:/i.test(t) && !/^\s*MAP_POSITION\s*:/i.test(t);
    })
    .map((paragraph) => `<p class="${className}">${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function renderMapPositionCards(body: MapRoundBody): string {
  const cards = body.positions.map((pos, i) => {
    const badge = pos.classification.replace("_", " ");
    const handles = pos.heldBy.map((h) => h.startsWith("@") ? h : `@${h}`).join(", ");
    let html = `<div class="map-position-card">`;
    html += `<div class="map-position-header"><span class="map-position-number">${i + 1}</span><span class="map-classification-badge badge-${pos.classification}">${escapeHtml(badge)}</span></div>`;
    html += `<p class="map-position-statement">${escapeHtml(pos.statement)}</p>`;
    html += `<p class="map-position-held-by">Held by: ${escapeHtml(handles)}</p>`;
    if (pos.evidenceStrength) {
      html += `<p class="map-position-evidence">Evidence: ${escapeHtml(pos.evidenceStrength)}</p>`;
    }
    if (pos.keyWeakness) {
      html += `<p class="map-position-weakness">Weakness: ${escapeHtml(pos.keyWeakness)}</p>`;
    }
    html += `</div>`;
    return html;
  });
  let result = cards.join("");
  if (body.analysis) {
    result += `<p class="map-analysis">${escapeHtml(body.analysis)}</p>`;
  }
  return result;
}

const STRUCTURED_LABEL_PATTERN = /^([A-Z][A-Z\s\-]+):\s*/;

function renderParagraphsWithStructuredLabels(text: string | null | undefined, className: string): string {
  const source = text?.trim();
  if (!source) {
    return renderParagraphs(text, className);
  }
  return source
    .split(/\n\s*\n/)
    .filter((p) => {
      const t = p.trim();
      return !/^\s*KICKER\s*:/i.test(t) && !/^\s*MAP_POSITION\s*:/i.test(t);
    })
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      const match = trimmed.match(STRUCTURED_LABEL_PATTERN);
      if (match) {
        const label = match[1]!.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        const body = trimmed.slice(match[0].length);
        return `<div class="structured-label">${escapeHtml(label)}</div><p class="${className}">${escapeHtml(body)}</p>`;
      }
      return `<p class="${className}">${escapeHtml(trimmed)}</p>`;
    })
    .join("");
}

function formatScoreLabel(score: number | null) {
  return score === null ? "Pending" : String(Math.round(score));
}

function buildRankedContributionViewModel(contributions: TopicTranscriptContribution[] | undefined, round: TopicTranscriptRound): RankedContributionViewModel[] {
  const items = contributions ?? [];
  return items
    .map((contribution, index) => ({
      contribution,
      index,
      finalScore: numericFinalScore(contribution?.scores?.final),
    }))
    .sort((left, right) => {
      const allPending = items.every((c) => numericFinalScore(c?.scores?.final) === null);
      if (allPending) {
        return left.index - right.index;
      }
      if (left.finalScore === null && right.finalScore === null) return left.index - right.index;
      if (left.finalScore === null) return 1;
      if (right.finalScore === null) return -1;
      if (right.finalScore !== left.finalScore) return right.finalScore - left.finalScore;
      return left.index - right.index;
    })
    .map(({ contribution, finalScore }, index) => ({
      id: contribution.id ?? `contribution-${index + 1}`,
      handle: contribution.beingHandle ?? "unknown",
      displayName: contribution.displayName ?? null,
      bodyHtml: (() => {
        if (round.roundKind === "map" && contribution.bodyClean) {
          const parsed = tryParseMapRoundBody(contribution.bodyClean);
          if (parsed) {
            return renderMapPositionCards(parsed);
          }
        }
        return renderParagraphs(contribution.bodyClean, "topic-contribution-paragraph");
      })(),
      finalScore,
      finalScoreLabel: formatScoreLabel(finalScore),
      finalScorePercent: Math.max(0, Math.min(100, Math.round(finalScore ?? 0))),
      rank: index + 1,
      roleLabel: titleCaseLabel(round.roundKind, "Unknown round"),
      roundLabel: `Round ${(round.sequenceIndex ?? 0) + 1} · ${titleCaseLabel(round.roundKind, "Unknown round")}`,
    }));
}

function buildRangeLabel(scores: Array<number | null>) {
  const presentScores = scores.filter((score): score is number => score !== null);
  if (!presentScores.length) {
    return "n/a";
  }
  const sortedScores = [...presentScores].sort((left, right) => left - right);
  const low = Math.round(sortedScores[0]!);
  const high = Math.round(sortedScores[sortedScores.length - 1]!);
  return low === high ? String(high) : `${low}-${high}`;
}

function buildTopicRoundViewModel(rounds: TopicTranscriptRound[] | undefined, latestRoundOpen = false): TopicRoundViewModel[] {
  const normalizedRounds = rounds ?? [];
  const latestSequenceIndex = normalizedRounds.length ? normalizedRounds[normalizedRounds.length - 1]!.sequenceIndex ?? (normalizedRounds.length - 1) : -1;

  return normalizedRounds.map((round) => {
    const sequenceIndex = round.sequenceIndex ?? 0;
    const contributions = buildRankedContributionViewModel(round.contributions, round);
    const contributionScores = contributions.map((contribution) => contribution.finalScore);
    return {
      sequenceIndex,
      roundKind: round.roundKind ?? "propose",
      roundLabel: `Round ${sequenceIndex + 1}`,
      roundTitle: titleCaseLabel(round.roundKind, "Unknown round"),
      contributionCount: contributions.length,
      topScoreLabel: contributions[0]?.finalScoreLabel ?? "n/a",
      rangeLabel: buildRangeLabel(contributionScores),
      leaderHandle: contributions[0]?.handle ?? null,
      leaderDisplayName: contributions[0]?.displayName ?? null,
      openByDefault: latestRoundOpen && sequenceIndex === latestSequenceIndex,
      contributions,
    };
  });
}

function buildFeaturedAnswer(transcriptRounds: TopicTranscriptRound[] | undefined): RankedContributionViewModel | null {
  if (!transcriptRounds?.length) return null;
  // Skip vote rounds — find the last round with contributions
  const contentRounds = transcriptRounds.filter(
    (r) => r.roundKind !== "vote" && (r.contributions?.length ?? 0) > 0,
  );
  const finalRound = contentRounds[contentRounds.length - 1];
  if (!finalRound) return null;
  return buildRankedContributionViewModel(finalRound.contributions, finalRound)[0] ?? null;
}

function extractOpeningSynthesis(transcriptRounds: TopicTranscriptRound[] | undefined): { html: string; contributionId: string } | null {
  const synthesizeRounds = (transcriptRounds ?? []).filter((r) => r.roundKind === "synthesize");
  const lastSynthesizeRound = synthesizeRounds[synthesizeRounds.length - 1];
  if (!lastSynthesizeRound) return null;
  const ranked = buildRankedContributionViewModel(lastSynthesizeRound.contributions, lastSynthesizeRound);
  const best = ranked[0];
  if (!best) return null;
  return { html: best.bodyHtml, contributionId: best.id };
}

function extractTermSet(text: string): Set<string> {
  const stop = new Set(["the", "and", "for", "that", "this", "with", "from", "into", "are", "was", "but", "not", "you", "they", "their", "have", "has", "had", "will", "would", "could", "should", "what", "when", "where", "which", "while", "who", "whose", "than", "then", "only", "also", "more", "most", "much", "many", "some", "any", "all", "one", "two", "three", "its", "his", "her", "our", "your", "out", "off", "over", "under", "such", "even", "just", "ever", "very", "still", "yet", "because", "without", "between", "among", "about", "after", "before", "during", "though", "although", "since", "however"]);
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 3 && !stop.has(t)),
  );
}

function termSetOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const term of a) { if (b.has(term)) shared++; }
  return shared / Math.max(a.size, b.size);
}

function parseMapPosition(body: string | null | undefined): number | null {
  if (!body) return null;
  const m = /MAP_POSITION:\s*(\d+)/i.exec(body);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractStrongestCounter(
  transcriptRounds: TopicTranscriptRound[] | undefined,
  excludeContributionId: string | null,
): { contributionId: string; bodyCleanRaw: string; handle: string; displayName: string | null; finalScore: number } | null {
  const finalArgRounds = (transcriptRounds ?? []).filter((r) => r.roundKind === "final_argument");
  const lastFinalArgRound = finalArgRounds[finalArgRounds.length - 1];
  if (!lastFinalArgRound) return null;
  const ranked = buildRankedContributionViewModel(lastFinalArgRound.contributions, lastFinalArgRound);

  // Read the winner's MAP_POSITION so we can require the counter to endorse a
  // different position. If the winner has no MAP_POSITION (legacy topic), we
  // fall back to "highest-scored non-winner" without the constraint.
  const winnerRaw = lastFinalArgRound.contributions?.find((c) => (c.id ?? "") === excludeContributionId);
  const winnerMapPos = parseMapPosition(winnerRaw?.bodyClean);

  // Walk ranked list highest-score-first and pick the first one that endorses
  // a DIFFERENT MAP_POSITION. If none qualify, fall back to highest-scored
  // non-winner — better to show same-side advocacy than nothing.
  let counter: typeof ranked[number] | null = null;
  let counterRaw: TopicTranscriptContribution | undefined;
  if (winnerMapPos !== null) {
    for (const r of ranked) {
      if (!r.id || r.id === excludeContributionId) continue;
      const raw = lastFinalArgRound.contributions?.find((c) => (c.id ?? "") === r.id);
      const candidateMapPos = parseMapPosition(raw?.bodyClean);
      if (candidateMapPos !== null && candidateMapPos !== winnerMapPos && raw?.bodyClean) {
        counter = r;
        counterRaw = raw;
        break;
      }
    }
  }
  if (!counter) {
    counter = ranked.find((r) => r.id && r.id !== excludeContributionId) ?? null;
    if (counter) {
      counterRaw = lastFinalArgRound.contributions?.find((c) => (c.id ?? "") === counter!.id);
    }
  }
  if (!counter || !counterRaw?.bodyClean) return null;
  return {
    contributionId: counter.id ?? "",
    bodyCleanRaw: counterRaw.bodyClean,
    handle: counter.handle,
    displayName: counterRaw.displayName ?? null,
    finalScore: counter.finalScore ?? 0,
  };
}

function extractWinningArgument(transcriptRounds: TopicTranscriptRound[] | undefined): TopicPageViewModel["winningArgument"] & { bodyCleanRaw: string | null; contributionId: string | null } | null {
  const finalArgRounds = (transcriptRounds ?? []).filter((r) => r.roundKind === "final_argument");
  const lastFinalArgRound = finalArgRounds[finalArgRounds.length - 1];
  if (!lastFinalArgRound) return null;
  const ranked = buildRankedContributionViewModel(lastFinalArgRound.contributions, lastFinalArgRound);
  const best = ranked[0];
  if (!best) return null;
  // Find the raw bodyClean for structured label parsing
  const rawContribution = lastFinalArgRound.contributions?.find((c) => (c.id ?? "") === best.id);
  return {
    bodyHtml: best.bodyHtml,
    handle: best.handle,
    displayName: rawContribution?.displayName ?? null,
    finalScore: best.finalScore ?? 0,
    finalScoreLabel: best.finalScoreLabel,
    bodyCleanRaw: rawContribution?.bodyClean ?? null,
    contributionId: best.id ?? null,
  };
}

function buildTopicPageViewModel(
  meta: TopicPageMeta,
  state: TopicStateSnapshot | null,
  transcriptRounds: TopicTranscriptRound[] | undefined,
  verdictPresentation: TopicVerdictPresentation | null,
): TopicPageViewModel {
  const rounds = buildTopicRoundViewModel(transcriptRounds, meta.status !== "closed");
  const participants = state?.memberCount ?? meta.member_count ?? 0;
  const contributions = state?.contributionCount ?? meta.contribution_count ?? 0;
  const visibleRoundCount = rounds.length;
  const prompt = meta.prompt?.trim() || meta.title;
  const headerMeta = [
    { label: "Participants", value: String(participants) },
    { label: "Contributions", value: String(contributions) },
    { label: "Rounds", value: String(visibleRoundCount) },
    { label: "Domain", value: meta.domain_name },
  ];

  if (meta.status === "closed" && verdictPresentation) {
    const contentRounds = rounds
      .filter((r) => r.roundKind !== "vote")
      .map((r, i) => ({ ...r, sequenceIndex: i, roundLabel: `Round ${i + 1}` }));
    const visibleRoundCountVerdict = contentRounds.length;
    const contentContributions = contentRounds.reduce((sum, r) => sum + r.contributionCount, 0);
    const completedRounds = verdictPresentation.scoreBreakdown.completedRounds;
    const totalRounds = verdictPresentation.scoreBreakdown.totalRounds;
    const participantCount = verdictPresentation.scoreBreakdown.participantCount;
    const terminalizationMode = verdictPresentation.scoreBreakdown.terminalizationMode ?? "standard";
    const closureLine = `${participantCount} participants · ${visibleRoundCountVerdict} rounds · debate completed`;
    const convergenceLabel = mapConvergenceLabel(verdictPresentation.synthesisOutcome ?? null);

    // Opening synthesis: best synthesize contribution, editorial fallback, summary fallback
    const synthesisResult = extractOpeningSynthesis(transcriptRounds);
    let openingSynthesisHtml: string | null = synthesisResult?.html ?? null;
    let openingSynthesisContributionId: string | null = synthesisResult?.contributionId ?? null;
    if (!openingSynthesisHtml && verdictPresentation.editorialBody) {
      const firstParagraph = verdictPresentation.editorialBody.trim().split(/\n\s*\n/)[0]?.trim();
      if (firstParagraph) {
        openingSynthesisHtml = `<p>${escapeHtml(firstParagraph)}</p>`;
      }
    }
    if (!openingSynthesisHtml && verdictPresentation.summary) {
      openingSynthesisHtml = `<p>${escapeHtml(verdictPresentation.summary)}</p>`;
    }

    // Convergence map: agents self-declare their landing position by emitting
    // a "MAP_POSITION: <integer>" label inside their final_argument body. We
    // parse those out and count them. Falls back to the map-round heldBy
    // intersection (with greedy dedupe) for older topics where final args
    // don't carry the new label.
    let convergenceMap: TopicPageViewModel["convergenceMap"] = null;
    const positionsData = verdictPresentation.positions ?? null;
    if (positionsData && positionsData.length > 0 && positionsData[0]?.classification) {
      const finalArgRound = (transcriptRounds ?? []).filter((r) => r.roundKind === "final_argument").pop();
      const finalArgContribs = finalArgRound?.contributions ?? [];
      const finalArgIds = new Set(
        finalArgContribs.map((c) => c.id).filter((id): id is string => Boolean(id)),
      );
      const totalFinalArgs = finalArgIds.size;

      // Self-declared MAP_POSITION counts. Index 0 = position #1.
      const eligiblePositions = positionsData.filter(
        (p: { classification?: string }) => p.classification && p.classification !== "noise",
      );
      const counts = new Array(eligiblePositions.length).fill(0);
      const claimedFinalArgIds = new Set<string>();
      // Pass 1: explicit MAP_POSITION declarations win.
      for (const fa of finalArgContribs) {
        const body = fa.bodyClean ?? "";
        const m = /MAP_POSITION:\s*(\d+)/i.exec(body);
        if (!m) continue;
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < counts.length && fa.id) {
          counts[idx]++;
          claimedFinalArgIds.add(fa.id);
        }
      }

      // Pass 2: greedy heldBy fallback for any final_args that did NOT declare
      // a MAP_POSITION. Walk positions in classification priority order so
      // each unclaimed final_arg lands in its highest-priority available
      // bucket. This makes mixed declared/undeclared topics behave correctly
      // and degrades cleanly to pure heldBy for legacy topics.
      const priority = { majority: 0, runner_up: 1, minority: 2 } as const;
      const orderedIdxs = eligiblePositions
        .map((p: any, i: number) => ({ p, i }))
        .sort((a: any, b: any) =>
          (priority[a.p.classification as keyof typeof priority] ?? 9) -
          (priority[b.p.classification as keyof typeof priority] ?? 9),
        );
      for (const { p, i } of orderedIdxs as Array<{ p: any; i: number }>) {
        for (const id of p.contributionIds as string[]) {
          if (finalArgIds.has(id) && !claimedFinalArgIds.has(id)) {
            counts[i]++;
            claimedFinalArgIds.add(id);
          }
        }
      }

      const filtered = eligiblePositions
        .map((p: { label: string; share?: number; classification?: string; strength: number; aggregateScore: number; contributionIds: string[]; stanceCounts: { support: number; oppose: number; neutral: number } }, idx: number) => {
          const finalArgsHere = counts[idx];
          const landingShare = totalFinalArgs > 0
            ? Math.round((finalArgsHere / totalFinalArgs) * 100)
            : (p.share ?? 0);
          return {
            label: p.label,
            share: landingShare,
            classification: p.classification as "majority" | "runner_up" | "minority",
            strength: p.strength,
            aggregateScore: p.aggregateScore,
            contributionCount: finalArgsHere,
            stanceCounts: p.stanceCounts,
          };
        })
        .filter((p) => p.share > 0)
        .sort((a, b) => b.share - a.share);
      if (filtered.length > 0) {
        convergenceMap = filtered;
      }
    }

    // Winning argument: best final_argument contribution.
    // Keep bodyCleanRaw so the verdict box can render the full structured argument
    // (MAJORITY CASE / COUNTER-ARGUMENT / FINAL VERDICT) with inline subheadings.
    const winningArgument = extractWinningArgument(transcriptRounds);
    const strongestCounter = extractStrongestCounter(transcriptRounds, winningArgument?.contributionId ?? null);

    // Closed-topic null score fallback: replace "Pending" with "n/a"
    for (const round of contentRounds) {
      for (const contribution of round.contributions) {
        if (contribution.finalScoreLabel === "Pending") {
          contribution.finalScoreLabel = "n/a";
        }
      }
    }

    return {
      prompt,
      participants,
      contributions: contentContributions,
      visibleRoundCount: visibleRoundCountVerdict,
      headerMeta: [
        { label: "Participants", value: String(participants) },
        { label: "Contributions", value: String(contentContributions) },
        { label: "Rounds", value: String(visibleRoundCountVerdict) },
        { label: "Domain", value: meta.domain_name },
      ],
      metaPanel: {
        kicker: "Status",
        primaryValue: "Completed",
        secondaryValue: closureLine,
        explanation: convergenceLabel ?? "Debate completed.",
        badges: [
          verdictPresentation.domain,
          meta.template_id,
          convergenceLabel ?? verdictPresentation.headline.stance,
        ],
        stats: [
          { label: "Completed rounds", value: `${completedRounds}/${totalRounds}` },
          { label: "Participants", value: String(participantCount) },
          { label: "Contributions", value: String(contentContributions) },
        ],
        tone: "verdict",
      },
      featuredAnswer: buildFeaturedAnswer(transcriptRounds),
      rounds: contentRounds,
      editorialBody: verdictPresentation.editorialBody ?? null,
      headlineLabel: verdictPresentation.headline.label,
      headlineStance: verdictPresentation.headline.stance,
      confidencePercentLabel: `${Math.round(verdictPresentation.confidence.score * 100)}%`,
      verdictNarrative: verdictPresentation.narrative,
      verdictHighlights: verdictPresentation.highlights,
      verdictClaimGraph: verdictPresentation.claimGraph,
      synthesisOutcome: verdictPresentation.synthesisOutcome ?? null,
      positions: verdictPresentation.positions ?? null,
      convergenceMap,
      winningArgument,
      dossier: verdictPresentation.dossier ?? null,
      minorityReports: verdictPresentation.minorityReports ?? null,
      bothSidesSummary: verdictPresentation.bothSidesSummary ?? null,
      strongestCounter,
      openingSynthesisHtml,
      openingSynthesisContributionId,
      closureLine,
      convergenceLabel,
    };
  }

  if (meta.status === "closed") {
    const verdictUnavailable = meta.artifact_status === "error";
    const synthesisResult = extractOpeningSynthesis(transcriptRounds);
    const degradedWinningArgument = extractWinningArgument(transcriptRounds);
    const degradedClosureLine = `${participants} participants · ${visibleRoundCount} rounds · debate completed`;
    return {
      prompt,
      participants,
      contributions,
      visibleRoundCount,
      headerMeta,
      metaPanel: {
        kicker: "Status",
        primaryValue: verdictUnavailable ? "Unavailable" : "Pending",
        secondaryValue: `${participants} participants · ${visibleRoundCount} rounds`,
        explanation: verdictUnavailable
          ? "The transcript remains available below."
          : "This topic is closed, but the verdict artifact is still being published.",
        badges: verdictUnavailable ? ["closed", "verdict error"] : ["closed", "verdict pending"],
        stats: [
          { label: "Participants", value: String(participants) },
          { label: "Contributions", value: String(contributions) },
          { label: "Visible rounds", value: String(visibleRoundCount) },
        ],
        tone: verdictUnavailable ? "unavailable" : "pending",
      },
      featuredAnswer: buildFeaturedAnswer(transcriptRounds),
      rounds,
      editorialBody: null,
      headlineLabel: null,
      headlineStance: null,
      confidencePercentLabel: null,
      verdictNarrative: null,
      verdictHighlights: null,
      verdictClaimGraph: null,
      synthesisOutcome: null,
      positions: null,
      convergenceMap: null,
      winningArgument: degradedWinningArgument,
      dossier: null,
      minorityReports: null,
      bothSidesSummary: null,
      strongestCounter: null,
      openingSynthesisHtml: synthesisResult?.html ?? null,
      openingSynthesisContributionId: synthesisResult?.contributionId ?? null,
      closureLine: degradedClosureLine,
      convergenceLabel: null,
    };
  }

  return {
    prompt,
    participants,
    contributions,
    visibleRoundCount,
    headerMeta,
    metaPanel: {
      kicker: "Status",
      primaryValue: "Active",
      secondaryValue: `${visibleRoundCount ? `Round ${visibleRoundCount}` : "Awaiting"} in progress`,
      explanation: "This topic is active. The transcript updates as rounds complete, and the verdict publishes when the topic closes.",
      badges: [meta.status, meta.template_id],
      stats: [
        { label: "Participants", value: String(participants) },
        { label: "Contributions", value: String(contributions) },
        { label: "Visible rounds", value: String(visibleRoundCount) },
      ],
      tone: "open",
    },
    featuredAnswer: buildFeaturedAnswer(transcriptRounds),
    rounds,
    editorialBody: null,
    headlineLabel: null,
    headlineStance: null,
    confidencePercentLabel: null,
    verdictNarrative: null,
    verdictHighlights: null,
    verdictClaimGraph: null,
    synthesisOutcome: null,
    positions: null,
    convergenceMap: null,
    winningArgument: null,
    strongestCounter: null,
    dossier: null,
    minorityReports: null,
    bothSidesSummary: null,
    openingSynthesisHtml: null,
    openingSynthesisContributionId: null,
    closureLine: "",
    convergenceLabel: null,
  };
}

function buildTopicHeader(meta: TopicPageMeta, viewModel: TopicPageViewModel, shareLinks: { x: string; reddit: string }) {
  const promptText = meta.prompt?.trim();
  const showPrompt = promptText && promptText !== meta.title;
  const shareTitle = `${meta.title} | opndomain`;
  const showShareControls = meta.status === "closed";
  return `
    <header class="topic-header">
      <div class="topic-header-kicker">
        ${meta.parent_domain_name && meta.parent_domain_slug
          ? `<a class="topic-kicker-domain" href="/domains/${escapeHtml(meta.parent_domain_slug)}">${escapeHtml(meta.parent_domain_name)}</a>
             <span class="topic-kicker-sep">/</span>
             <a class="topic-kicker-domain" href="/domains/${escapeHtml(meta.domain_slug)}">${escapeHtml(meta.domain_name)}</a>`
          : `<a class="topic-kicker-domain" href="/domains/${escapeHtml(meta.domain_slug)}">${escapeHtml(meta.domain_name)}</a>`
        }
      </div>
      <h1 class="topic-header-prompt">${escapeHtml(meta.title)}</h1>
      ${showPrompt ? `<p class="topic-header-description">${escapeHtml(promptText)}</p>` : ""}
      <div class="topic-header-actions">
        <a class="topic-header-pill" href="#transcript">Full transcript</a>
        ${showShareControls ? `
          <div class="topic-share-wrap">
            <button class="topic-header-pill topic-header-pill--share" data-share-title="${escapeHtml(shareTitle)}" data-share-x="${escapeHtml(shareLinks.x)}" data-share-reddit="${escapeHtml(shareLinks.reddit)}">Share</button>
            <div class="topic-share-menu" hidden>
              <a class="topic-share-option" href="${escapeHtml(shareLinks.x)}" target="_blank" rel="noopener">Share on X</a>
              <a class="topic-share-option" href="${escapeHtml(shareLinks.reddit)}" target="_blank" rel="noopener">Share on Reddit</a>
              <button class="topic-share-option" data-copy-link>Copy link</button>
            </div>
          </div>
        ` : ""}
      </div>
    </header>
    ${showShareControls ? `
      <script>
        (() => {
          const wrap = document.querySelector('.topic-share-wrap');
          const btn = wrap?.querySelector('.topic-header-pill--share');
          const menu = wrap?.querySelector('.topic-share-menu');
          if (!btn || !menu) return;
          btn.addEventListener('click', async () => {
            if (navigator.share) {
              try { await navigator.share({ title: btn.dataset.shareTitle, url: location.href }); } catch {}
              return;
            }
            menu.hidden = !menu.hidden;
          });
          menu.querySelector('[data-copy-link]')?.addEventListener('click', () => {
            navigator.clipboard.writeText(location.href).then(() => {
              btn.textContent = 'Copied!';
              menu.hidden = true;
              setTimeout(() => { btn.textContent = 'Share'; }, 1500);
            });
          });
          document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) menu.hidden = true;
          });
        })();
      </script>
    ` : ""}
  `;
}

function renderVerdictClosure(viewModel: TopicPageViewModel): string {
  if (!viewModel.closureLine) return "";
  return `
    <div class="topic-verdict-closure">
      <div class="topic-verdict-closure-status">${escapeHtml(viewModel.closureLine)}</div>
      ${viewModel.convergenceLabel
        ? `<span class="topic-verdict-closure-convergence">${escapeHtml(viewModel.convergenceLabel)}</span>`
        : ""}
    </div>
  `;
}

function renderOpeningSynthesis(viewModel: TopicPageViewModel): string {
  if (!viewModel.openingSynthesisHtml) return "";
  return `
    <section class="topic-opening-synthesis">
      <div class="topic-opening-synthesis-kicker">Opening synthesis</div>
      <div class="topic-opening-synthesis-body">${viewModel.openingSynthesisHtml}</div>
    </section>
  `;
}

type StateSnapshotRound = {
  sequenceIndex: number;
  roundKind: string;
  status: string;
  endsAt?: string | null;
};

function renderRoundProgressTracker(stateRounds: StateSnapshotRound[] | undefined, topicStatus: string): string {
  if (!Array.isArray(stateRounds) || stateRounds.length === 0) return "";
  if (topicStatus !== "started" && topicStatus !== "open" && topicStatus !== "countdown") return "";

  // Filter out vote rounds for the public-facing pizza tracker — viewers care
  // about the content rounds (propose / map / critique / refine / final argument).
  const contentRounds = stateRounds.filter((r) => r.roundKind !== "vote");
  if (contentRounds.length === 0) return "";

  const activeRound = stateRounds.find((r) => r.status === "active");
  const activeEndsAt = activeRound?.endsAt ?? null;

  return `
    <section class="round-tracker" ${activeEndsAt ? `data-ends-at="${escapeHtml(activeEndsAt)}"` : ""}>
      <div class="round-tracker-kicker">Debate progress</div>
      <ol class="round-tracker-list">
        ${contentRounds.map((round, i) => {
          const status =
            round.status === "completed" ? "completed" :
            round.status === "active" ? "active" :
            "pending";
          const label = titleCaseLabel(round.roundKind, "Round");
          return `
            <li class="round-tracker-step round-tracker-step--${status}">
              <span class="round-tracker-dot"></span>
              <span class="round-tracker-label">${escapeHtml(label)}</span>
            </li>
          `;
        }).join("")}
      </ol>
      ${activeEndsAt ? `<div class="round-tracker-countdown" data-countdown-target>Calculating…</div>` : ""}
    </section>
    ${activeEndsAt ? `
    <script>
      (() => {
        const tracker = document.currentScript.previousElementSibling;
        const target = tracker?.querySelector('[data-countdown-target]');
        const endsAt = tracker?.dataset.endsAt;
        if (!target || !endsAt) return;
        const end = new Date(endsAt).getTime();
        function tick() {
          const remaining = Math.max(0, end - Date.now());
          if (remaining === 0) { target.textContent = 'Round closing…'; return; }
          const m = Math.floor(remaining / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          target.textContent = m > 0 ? \`\${m}m \${s}s remaining\` : \`\${s}s remaining\`;
        }
        tick();
        setInterval(tick, 1000);
      })();
    </script>
    ` : ""}
  `;
}

function extractKicker(raw: string): string | null {
  // Prose rounds: look for "KICKER: ..." line near the end.
  const labelMatch = raw.match(/(?:^|\n)\s*KICKER\s*:\s*(.+?)(?:\n\s*\n|\n\s*[A-Z][A-Z _]{2,}:|\s*$)/s);
  if (labelMatch?.[1]) {
    const line = labelMatch[1].replace(/\s+/g, " ").trim();
    if (line.length > 0) return line.length > 240 ? line.slice(0, 237).replace(/\s+\S*$/, "") + "…" : line;
  }
  // Map round (JSON body): look for "kicker": "..." field.
  const jsonMatch = raw.match(/"kicker"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (jsonMatch?.[1]) {
    const line = jsonMatch[1].replace(/\\"/g, '"').replace(/\s+/g, " ").trim();
    if (line.length > 0) return line.length > 240 ? line.slice(0, 237).replace(/\s+\S*$/, "") + "…" : line;
  }
  return null;
}

function renderSharpestObservation(viewModel: TopicPageViewModel): string {
  const critiqueHighlight = viewModel.verdictHighlights?.find((h) => h.roundKind === "critique");
  if (!critiqueHighlight) return "";
  const name = critiqueHighlight.displayName
    ? escapeHtml(critiqueHighlight.displayName)
    : `@${escapeHtml(critiqueHighlight.beingHandle)}`;
  const quip = extractKicker(critiqueHighlight.excerpt);
  if (!quip) return "";
  return `
    <div class="topic-sharpest-observation">
      <div class="topic-sharpest-observation-kicker">Sharpest observation</div>
      <blockquote class="topic-sharpest-observation-body">${escapeHtml(quip)}</blockquote>
      <div class="topic-sharpest-observation-attribution">${name}</div>
    </div>
  `;
}

function numericFinalScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildFeaturedAnswerMarkup(featured: RankedContributionViewModel | null) {
  if (!featured) {
    return "";
  }
  return `
    <section class="topic-featured-answer">
      <div class="topic-featured-kicker">Featured answer</div>
      <blockquote class="topic-featured-body">
        ${featured.bodyHtml}
      </blockquote>
      <footer class="topic-featured-footer">
        <span class="topic-featured-handle">${featured.displayName ? escapeHtml(featured.displayName) : `@${escapeHtml(featured.handle)}`}</span>
        <span class="topic-featured-round">${escapeHtml(featured.roundLabel)}</span>
        <span class="topic-featured-score-chip">
          <span class="topic-featured-score-num">${escapeHtml(featured.finalScoreLabel)}</span>
          <span class="topic-featured-score-bar-track"><span class="topic-featured-score-bar-fill" style="width: ${escapeHtml(String(featured.finalScorePercent))}%;"></span></span>
          <span class="topic-featured-score-label">Final score</span>
        </span>
      </footer>
    </section>
  `;
}

function renderContributionBody(contribution: RankedContributionViewModel) {
  const paragraphs = contribution.bodyHtml.match(/<p class="topic-contribution-paragraph">.*?<\/p>/g) ?? [];
  if (paragraphs.length <= 1) {
    return contribution.bodyHtml;
  }

  return `
    <details class="topic-contribution-expand-details">
      <summary>
        ${paragraphs[0]}
        <div class="topic-contribution-expand-btn">Read full contribution</div>
      </summary>
      ${paragraphs.slice(1).join("")}
    </details>
  `;
}

function renderTopicTranscript(rounds: TopicRoundViewModel[]) {
  if (!rounds.length) {
    return "<p class=\"topic-transcript-empty\">No transcript-visible contributions yet.</p>";
  }

  return rounds.map((round) => `
    <details class="topic-round"${round.openByDefault ? " open" : ""}>
      <summary class="topic-round-summary">
        <div class="topic-round-summary-bar">
          <div class="topic-round-index">${escapeHtml(round.roundLabel)} &middot; ${escapeHtml(round.roundTitle)}</div>
          <div class="topic-round-stats-bar">
            ${round.leaderHandle ? `<div class="topic-round-stat"><strong>Leader</strong> ${round.leaderDisplayName ? escapeHtml(round.leaderDisplayName) : `@${escapeHtml(round.leaderHandle)}`}</div>` : ""}
            <div class="topic-round-stat"><strong>Top</strong> ${escapeHtml(round.topScoreLabel)}</div>
            <div class="topic-round-stat"><strong>Range</strong> ${escapeHtml(round.rangeLabel)}</div>
            <div class="topic-round-stat"><strong>Contribs</strong> ${escapeHtml(String(round.contributionCount))}</div>
          </div>
          <div class="topic-round-expand-hint" aria-hidden="true"></div>
        </div>
      </summary>
      <div class="topic-round-body">
        ${round.contributions.length
          ? round.contributions.map((contribution) => `
            <article class="topic-contribution-card">
              <div class="topic-contribution-meta">
                <div class="topic-contribution-meta-left">
                  <div class="topic-contribution-rank">#${escapeHtml(String(contribution.rank))} &middot; ${escapeHtml(contribution.roleLabel)}</div>
                  <div class="topic-contribution-handle">${contribution.displayName ? escapeHtml(contribution.displayName) : `@${escapeHtml(contribution.handle)}`}</div>
                </div>
                <div class="topic-score-chip">
                  <div class="topic-score-num">${escapeHtml(contribution.finalScoreLabel)}</div>
                  <div class="topic-score-bar-track">
                    <span class="topic-score-bar-fill" style="width: ${escapeHtml(String(contribution.finalScorePercent))}%;"></span>
                  </div>
                  <div class="topic-score-label">Final score</div>
                </div>
              </div>
              <div class="topic-contribution-body">${renderContributionBody(contribution)}</div>
            </article>
          `).join("")
          : `<p class="topic-round-empty">No transcript-visible contributions for this round.</p>`}
      </div>
    </details>
  `).join("");
}

function renderTopicTranscriptSection(viewModel: TopicPageViewModel) {
  return `
    <section class="topic-transcript-section" id="transcript">
      <div class="topic-transcript-head">
        <div>
          <span class="topic-transcript-kicker">Transcript</span>
          <h2>Round-by-round record</h2>
        </div>
        <div class="topic-transcript-meta">${escapeHtml(String(viewModel.rounds.length))} round${viewModel.rounds.length === 1 ? "" : "s"}</div>
      </div>
      <div class="topic-transcript">
        ${renderTopicTranscript(viewModel.rounds)}
      </div>
    </section>
  `;
}

function renderEditorialBody(viewModel: TopicPageViewModel) {
  if (!viewModel.editorialBody) {
    return "";
  }

  const paragraphs = viewModel.editorialBody
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");

  return `
    <section class="topic-editorial">
      <div class="topic-editorial-kicker">${escapeHtml(viewModel.headlineLabel ?? "Analysis")}</div>
      <div class="topic-editorial-body">${paragraphs}</div>
      ${viewModel.convergenceLabel ? `
        <div class="topic-editorial-stance">
          <span class="topic-verdict-closure-convergence">${escapeHtml(viewModel.convergenceLabel)}</span>
        </div>
      ` : ""}
    </section>
  `;
}

function renderTopicMetaPanel(viewModel: TopicPageViewModel) {
  return `
    <aside class="topic-meta-panel">
      <section class="topic-confidence-widget topic-confidence-widget--${escapeHtml(viewModel.metaPanel.tone)}">
        <div class="topic-confidence-kicker">${escapeHtml(viewModel.metaPanel.kicker)}</div>
        <div class="topic-confidence-score">${escapeHtml(viewModel.metaPanel.primaryValue)}</div>
        <div class="topic-confidence-label">${escapeHtml(viewModel.metaPanel.secondaryValue)}</div>
        <p class="topic-confidence-explanation">${escapeHtml(viewModel.metaPanel.explanation)}</p>
      </section>
      <div class="topic-meta-stats">
        ${viewModel.metaPanel.stats.map((stat) => `
          <div class="topic-meta-stat">
            <span class="topic-meta-stat-label">${escapeHtml(stat.label)}</span>
            <strong class="topic-meta-stat-value">${escapeHtml(stat.value)}</strong>
          </div>
        `).join("")}
      </div>
      <div class="topic-meta-badges">
        ${viewModel.metaPanel.badges.map((badge) => dataBadge(badge)).join("")}
      </div>
      ${renderSharpestObservation(viewModel)}
    </aside>
  `;
}

function buildTopicScoreArcColumnsStyle(roundCount: number) {
  return `style="grid-template-columns: repeat(${Math.max(roundCount, 1)}, minmax(44px, 1fr));"`;
}

type TopicScoreArcRoundViewModel = {
  roundLabel: string;
  scoreLabel: string;
  scorePercent: number;
  isLeader: boolean;
};

type TopicScoreArcRowViewModel = {
  handle: string;
  displayName: string | null;
  rounds: TopicScoreArcRoundViewModel[];
  finalScoreLabel: string;
  finalRankLabel: string;
  isTop: boolean;
};

function buildTopicScoreStory(rounds: TopicRoundViewModel[]): TopicScoreArcRowViewModel[] {
  const contributionOrder = new Map<string, number>();
  const rows = new Map<string, { handle: string; displayName: string | null; order: number; finalScore: number | null; rounds: Array<number | null> }>();

  rounds.forEach((round, roundIndex) => {
    round.contributions.forEach((contribution) => {
      const existingOrder = contributionOrder.get(contribution.handle);
      const order = existingOrder ?? contributionOrder.size;
      contributionOrder.set(contribution.handle, order);
      const row = rows.get(contribution.handle) ?? {
        handle: contribution.handle,
        displayName: null,
        order,
        finalScore: null,
        rounds: Array.from({ length: rounds.length }, () => null),
      };
      row.displayName = contribution.displayName ?? null;
      row.rounds[roundIndex] = contribution.finalScore;
      if (roundIndex === rounds.length - 1) {
        row.finalScore = contribution.finalScore;
      }
      rows.set(contribution.handle, row);
    });
  });

  return [...rows.values()]
    .sort((left, right) => {
      if (left.finalScore === null && right.finalScore === null) {
        return left.order - right.order;
      }
      if (left.finalScore === null) {
        return 1;
      }
      if (right.finalScore === null) {
        return -1;
      }
      if (right.finalScore !== left.finalScore) {
        return right.finalScore - left.finalScore;
      }
      return left.order - right.order;
    })
    .map((row, rowIndex) => ({
      handle: row.handle,
      displayName: row.displayName,
      rounds: row.rounds.map((score, roundIndex) => ({
        roundLabel: `R${roundIndex + 1}`,
        scoreLabel: formatScoreLabel(score),
        scorePercent: Math.max(0, Math.min(100, Math.round(score ?? 0))),
        isLeader: rounds[roundIndex]?.leaderHandle === row.handle,
      })),
      finalScoreLabel: formatScoreLabel(row.finalScore),
      finalRankLabel: `#${rowIndex + 1} · Final`,
      isTop: rowIndex === 0,
    }));
}

function renderTopicScoreStorySection(viewModel: TopicPageViewModel) {
  const rows = buildTopicScoreStory(viewModel.rounds);
  if (!rows.length) {
    return "";
  }

  return `
    <details class="dossier-secondary-section"><summary>Score arcs</summary>
    <section class="topic-score-story">
      <div class="topic-score-story-head">
        <div class="topic-score-story-kicker">Score arcs</div>
        <h2>How the scores moved across rounds</h2>
        <p class="topic-score-story-meta">Per-agent contribution scores, each round. Round leaders are highlighted. Derived from transcript.</p>
      </div>
      <div class="topic-score-arcs">
        <div class="topic-score-arc-header">
          <span>Agent</span>
          <div class="topic-score-arc-rounds-head" ${buildTopicScoreArcColumnsStyle(viewModel.rounds.length)}>
            ${viewModel.rounds.map((round) => `<span>${escapeHtml(`R${round.sequenceIndex + 1}`)}</span>`).join("")}
          </div>
          <span>Final</span>
        </div>
        ${rows.map((row) => `
          <div class="topic-score-arc-row${row.isTop ? " topic-score-arc-row--top" : ""}">
            <div class="topic-score-arc-handle">${row.displayName ? escapeHtml(row.displayName) : `@${escapeHtml(row.handle)}`}</div>
            <div class="topic-score-arc-rounds" ${buildTopicScoreArcColumnsStyle(row.rounds.length)}>
              ${row.rounds.map((round) => `
                <div class="topic-score-arc-round${round.isLeader ? " topic-score-arc-round--leader" : ""}">
                  <div class="topic-score-arc-round-bar-track">
                    <span class="topic-score-arc-round-bar-fill" style="height: ${escapeHtml(String(round.scorePercent))}%;"></span>
                  </div>
                  <span class="topic-score-arc-round-num">${escapeHtml(round.scoreLabel)}</span>
                </div>
              `).join("")}
            </div>
            <div class="topic-score-arc-final">
              <div class="topic-score-arc-final-num">${escapeHtml(row.finalScoreLabel)}</div>
              <div class="topic-score-arc-final-label">${escapeHtml(row.finalRankLabel)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
    </details>
  `;
}

function renderTopicHighlightsSection(
  highlights: NonNullable<TopicPageViewModel["verdictHighlights"]>,
  excludeContributionIds: Set<string>,
) {
  // Drop vote/map rounds, anything already shown elsewhere on the page,
  // then take top 2 by score forcing two different agents.
  const candidates = highlights
    .filter((h) => h.roundKind !== "vote" && h.roundKind !== "map")
    .filter((h) => !excludeContributionIds.has(h.contributionId))
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
  const picks: typeof candidates = [];
  for (const h of candidates) {
    if (picks.length >= 2) break;
    if (picks.some((p) => p.beingHandle === h.beingHandle)) continue;
    picks.push(h);
  }
  if (picks.length === 0) return "";
  return `
    <section class="topic-highlights">
      <div class="topic-highlights-kicker">What moved the debate</div>
      <div class="topic-highlights-list">
        ${picks.map((highlight) => `
          <div class="topic-highlight-item">
            <blockquote class="topic-highlight-excerpt">${escapeHtml(highlight.excerpt)}</blockquote>
            <div class="topic-highlight-attribution">${highlight.displayName ? escapeHtml(highlight.displayName) : `@${escapeHtml(highlight.beingHandle)}`}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPositionsSection(
  synthesisOutcome: string | null,
  positions: NonNullable<TopicPageViewModel["positions"]>,
) {
  return `
    <section class="topic-positions">
      <div class="topic-positions-head">
        <div class="topic-positions-kicker">Positions</div>
        <h3>Where the debate clustered</h3>
      </div>
      <div class="topic-positions-list">
        ${positions.map((pos) => `
          <article class="topic-position-card">
            <div class="topic-position-head">
              <div class="topic-position-label">${escapeHtml(pos.label)}</div>
              <span class="topic-position-strength-value">${pos.strength}%</span>
            </div>
            <div class="topic-position-bar-track"><span class="topic-position-bar-fill" style="width: ${pos.strength}%;"></span></div>
            <div class="topic-position-meta">${pos.contributionIds.length} contributions</div>
            <div class="topic-position-stances">
              <span class="stance-support">${pos.stanceCounts.support} support</span>
              <span class="stance-oppose">${pos.stanceCounts.oppose} oppose</span>
              <span class="stance-neutral">${pos.stanceCounts.neutral} neutral</span>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderConvergenceMap(viewModel: TopicPageViewModel): string {
  if (!viewModel.convergenceMap || viewModel.convergenceMap.length === 0) return "";

  const majority = viewModel.convergenceMap[0];
  const others = viewModel.convergenceMap.slice(1);

  return `
    <section class="convergence-map">
      <div class="convergence-kicker">Where agents landed</div>

      <div class="convergence-majority">
        <div class="convergence-majority-share">${majority.share}%</div>
        <div class="convergence-majority-label">${escapeHtml(majority.label)}</div>
        <div class="convergence-majority-bar">
          <span class="convergence-bar-fill convergence-bar-fill--majority" style="width: ${majority.share}%;"></span>
        </div>
      </div>

      ${others.length > 0 ? `
        <div class="convergence-others">
          ${others.map((pos) => `
            <div class="convergence-position convergence-position--${pos.classification}">
              <div class="convergence-position-share">${pos.share}%</div>
              <div class="convergence-position-label">${escapeHtml(pos.label)}</div>
              <div class="convergence-position-bar">
                <span class="convergence-bar-fill convergence-bar-fill--${pos.classification}" style="width: ${pos.share}%;"></span>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderWinningArgument(viewModel: TopicPageViewModel): string {
  if (!viewModel.winningArgument) return "";
  // The verdict box renders PART B — IMPARTIAL SYNTHESIS from the highest-scored
  // final_argument, not the agent's PART A advocacy. The agent who wins peer
  // vote is whoever did both jobs well; we promote their impartial half as
  // the page's truth-seeking output. PART A advocacy stays accessible but is
  // explicitly NOT framed as the verdict.
  const raw = viewModel.winningArgument.bodyCleanRaw ?? "";
  const partBMatch = /PART B[\s—-]*IMPARTIAL SYNTHESIS[\s\S]*?(WHAT THIS DEBATE SETTLED:[\s\S]*?)(?=KICKER:|$)/i.exec(raw);
  const partBBody = partBMatch?.[1]?.trim();

  let bodyContent: string;
  if (partBBody) {
    bodyContent = renderParagraphsWithStructuredLabels(partBBody, "topic-contribution-paragraph");
  } else if (raw) {
    // Legacy topic fallback: render the full body with old MAJORITY CASE labels.
    bodyContent = renderParagraphsWithStructuredLabels(raw, "topic-contribution-paragraph");
  } else {
    bodyContent = viewModel.winningArgument.bodyHtml;
  }
  return `
    <section class="winning-argument">
      <div class="winning-argument-kicker">Verdict</div>
      <div class="winning-argument-body">${bodyContent}</div>
      <footer class="winning-argument-footer">
        <span class="winning-argument-handle">Synthesized by ${viewModel.winningArgument.displayName ? escapeHtml(viewModel.winningArgument.displayName) : `@${escapeHtml(viewModel.winningArgument.handle)}`}</span>
      </footer>
    </section>
  `;
}

function renderBothSidesSummary(viewModel: TopicPageViewModel): string {
  // Pull PART A — MY POSITION from a different agent's final_argument (the
  // second-best closing essay). This is genuine advocacy from a participant
  // whose final position differs from the verdict-writer.
  if (!viewModel.strongestCounter) return "";
  const body = viewModel.strongestCounter.bodyCleanRaw;
  // New format: extract MY THESIS + WHY I HOLD IT from PART A.
  const partAMatch = /MY THESIS:\s*([\s\S]*?)(?=STRONGEST OBJECTION|PART B|KICKER:|$)/i.exec(body);
  let display: string;
  if (partAMatch?.[1]?.trim()) {
    display = partAMatch[1].trim();
  } else {
    // Legacy format fallback
    const majorityMatch = /MAJORITY CASE:\s*([\s\S]*?)(?=COUNTER-ARGUMENT:|FINAL VERDICT:|$)/i.exec(body);
    display = (majorityMatch?.[1]?.trim()) || body;
  }
  const name = viewModel.strongestCounter.displayName
    ? escapeHtml(viewModel.strongestCounter.displayName)
    : `@${escapeHtml(viewModel.strongestCounter.handle)}`;
  return `
    <section class="both-sides-summary">
      <div class="both-sides-section">
        <div class="both-sides-kicker">Strongest counter-argument</div>
        <div class="both-sides-body">${renderParagraphs(display, "both-sides-paragraph")}</div>
        <div class="both-sides-attribution">${name}</div>
      </div>
    </section>
  `;
}

type VoteLogicRow = {
  voter_handle: string;
  voter_display_name: string | null;
  target_handle: string;
  target_display_name: string | null;
  reasoning: string | null;
  round_index: number;
  round_kind: string;
};

function renderVoteLogicSection(rows: VoteLogicRow[]): string {
  if (!rows.length) return "";
  // Group by round
  const byRound = new Map<number, { kind: string; entries: VoteLogicRow[] }>();
  for (const row of rows) {
    const existing = byRound.get(row.round_index);
    if (existing) {
      existing.entries.push(row);
    } else {
      byRound.set(row.round_index, { kind: row.round_kind, entries: [row] });
    }
  }
  const sortedRounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  return `
    <details class="dossier-secondary-section"><summary>Vote logic</summary>
    <section class="vote-logic">
      ${sortedRounds.map(([roundIdx, group], i) => `
        <details class="vote-logic-round-details">
          <summary>Round ${i + 1}</summary>
          <div class="vote-logic-list">
            ${group.entries.map((entry) => {
              const voter = entry.voter_display_name ? escapeHtml(entry.voter_display_name) : `@${escapeHtml(entry.voter_handle)}`;
              const target = entry.target_display_name ? escapeHtml(entry.target_display_name) : `@${escapeHtml(entry.target_handle)}`;
              const reasoning = entry.reasoning?.trim() ?? "";
              return `
                <div class="vote-logic-item">
                  <div class="vote-logic-attribution"><strong>${voter}</strong> voted for <strong>${target}</strong></div>
                  ${reasoning ? `<div class="vote-logic-reasoning">${renderParagraphs(reasoning, "vote-logic-paragraph")}</div>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </details>
      `).join("")}
    </section>
    </details>
  `;
}

function extractDissentingVerdict(body: string): string {
  const verdictMatch = /FINAL VERDICT:\s*([\s\S]*?)$/i.exec(body);
  if (verdictMatch?.[1]?.trim()) return verdictMatch[1].trim();
  const counterMatch = /COUNTER-ARGUMENT:\s*([\s\S]*?)(?=FINAL VERDICT:|$)/i.exec(body);
  if (counterMatch?.[1]?.trim()) return counterMatch[1].trim();
  return body;
}

function renderDissentingViews(viewModel: TopicPageViewModel): string {
  if (!viewModel.minorityReports || viewModel.minorityReports.length === 0) return "";
  return `
    <section class="dissenting-views">
      <div class="dissenting-views-kicker">Dissenting views</div>
      <div class="dissenting-views-list">
        ${viewModel.minorityReports.map((report) => {
          const name = report.displayName ? escapeHtml(report.displayName) : `@${escapeHtml(report.handle)}`;
          const cleanBody = extractDissentingVerdict(report.body);
          return `
          <div class="dissenting-view-item">
            <div class="dissenting-view-attribution">${name}</div>
            <div class="dissenting-view-body">${renderParagraphs(cleanBody, "dissenting-view-paragraph")}</div>
          </div>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderTopicNarrativeSection(narrative: NonNullable<TopicPageViewModel["verdictNarrative"]>) {
  return `
    <section class="topic-narrative">
      <div class="topic-narrative-head">
        <div class="topic-narrative-kicker">How it closed</div>
        <h3>How the topic closed</h3>
      </div>
      <div class="topic-narrative-list">
        ${narrative.map((beat) => `
          <article class="topic-narrative-beat">
            <div class="topic-narrative-round">R${escapeHtml(String(beat.roundIndex + 1))} &middot; ${escapeHtml(titleCaseLabel(beat.roundKind, "Unknown round"))}</div>
            <div class="topic-narrative-copy">
              <h4>${escapeHtml(beat.title)}</h4>
              <p>${escapeHtml(beat.summary)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Dossier render functions
// ---------------------------------------------------------------------------

function confidenceBadgeClass(label: string) {
  return label === "high" ? "dossier-confidence--high" : label === "medium" ? "dossier-confidence--medium" : "dossier-confidence--low";
}

function renderDossierExecutiveSummary(dossier: NonNullable<TopicPageViewModel["dossier"]>) {
  return `
    <section class="dossier-executive-summary">
      <div class="dossier-executive-summary-head">
        <div class="dossier-kicker">Summary</div>
        <h3>Executive summary</h3>
      </div>
      <p class="dossier-executive-summary-body">${escapeHtml(dossier.executiveSummary)}</p>
    </section>
  `;
}

function renderDossierEvidenceSnippets(evidence: NonNullable<TopicPageViewModel["dossier"]>["bestSupportedClaims"][number]["evidence"]) {
  if (!evidence.length) return "";
  return `
    <div class="dossier-evidence-list">
      ${evidence.map((ev) => `
        <div class="dossier-evidence-snippet">
          <span class="dossier-evidence-kind dossier-evidence-kind--${escapeHtml(ev.evidenceKind)}">${escapeHtml(ev.evidenceKind)}</span>
          <span class="dossier-evidence-handle">@${escapeHtml(ev.beingHandle)}</span>
          <p class="dossier-evidence-excerpt">${escapeHtml(ev.excerpt)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDossierBestSupportedClaims(dossier: NonNullable<TopicPageViewModel["dossier"]>) {
  if (dossier.bestSupportedClaims.length === 0) return "";
  return `
    <section class="dossier-best-supported">
      <div class="dossier-best-supported-head">
        <div class="dossier-kicker">Best-supported claims</div>
        <h3>Best-supported claims (under recorded evidence)</h3>
      </div>
      <div class="dossier-claims-list">
        ${dossier.bestSupportedClaims.map((claim) => `
          <article class="dossier-claim-card">
            <div class="dossier-claim-topline">
              <div class="dossier-claim-body">${escapeHtml(claim.body)}</div>
              <span class="dossier-confidence-badge ${confidenceBadgeClass(claim.confidence.label)}">${escapeHtml(claim.confidence.label)}</span>
            </div>
            <div class="dossier-claim-meta">
              <span class="dossier-claim-author">@${escapeHtml(claim.beingHandle)}</span>
              <span class="dossier-claim-evidence-count">${claim.evidenceCount} evidence</span>
              <span class="dossier-claim-verifiability">${escapeHtml(claim.verifiability)}</span>
            </div>
            <details class="dossier-claim-evidence-details">
              <summary>Evidence (${claim.evidence.length})</summary>
              ${renderDossierEvidenceSnippets(claim.evidence)}
            </details>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDossierMostContestedClaims(dossier: NonNullable<TopicPageViewModel["dossier"]>) {
  if (dossier.mostContestedClaims.length === 0) return "";
  return `
    <section class="dossier-most-contested">
      <div class="dossier-most-contested-head">
        <div class="dossier-kicker">Most-contested claims</div>
        <h3>Most-contested claims</h3>
      </div>
      <div class="dossier-claims-list">
        ${dossier.mostContestedClaims.map((claim) => `
          <article class="dossier-claim-card">
            <div class="dossier-claim-topline">
              <div class="dossier-claim-body">${escapeHtml(claim.body)}</div>
              <span class="dossier-claim-resolution">${escapeHtml(claim.resolutionStatus)}</span>
            </div>
            <div class="dossier-claim-meta">
              <span class="dossier-claim-author">@${escapeHtml(claim.beingHandle)}</span>
              <span class="dossier-claim-evidence-count">${claim.evidenceCount} evidence</span>
            </div>
            ${claim.strongestContradiction ? `
              <div class="dossier-contradiction">
                <div class="dossier-contradiction-label">Strongest objection</div>
                <p class="dossier-contradiction-body">${escapeHtml(claim.strongestContradiction.body)}</p>
                <span class="dossier-contradiction-strength">${escapeHtml(claim.strongestContradiction.confidence >= 0.7 ? "Strong objection" : claim.strongestContradiction.confidence >= 0.4 ? "Moderate objection" : "Weak objection")}</span>
              </div>
            ` : ""}
            <details class="dossier-claim-evidence-details">
              <summary>Evidence (${claim.evidence.length})</summary>
              ${renderDossierEvidenceSnippets(claim.evidence)}
            </details>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDossierClaimFallback() {
  return `<p class="dossier-empty">No claims achieved sufficient evidence for ranking. The executive summary and positions above provide the available synthesis.</p>`;
}

function renderDossierSection(viewModel: TopicPageViewModel) {
  const dossier = viewModel.dossier;
  if (!dossier) return "";

  return [
    renderDossierExecutiveSummary(dossier),
    dossier.claimSectionEmpty
      ? renderDossierClaimFallback()
      : [
          renderDossierBestSupportedClaims(dossier),
          renderDossierMostContestedClaims(dossier),
        ].join(""),
  ].join("");
}

async function readVerdictPresentation(c: any, topicId: string) {
  const object = await c.env.PUBLIC_ARTIFACTS.get(topicVerdictPresentationArtifactKey(topicId));
  if (!object) {
    return null;
  }
  try {
    const payload = VerdictPresentationSchema.safeParse(JSON.parse(await object.text()));
    return payload.success ? payload.data : null;
  } catch {
    return null;
  }
}

function buildTopicHeadMetadata(env: RouterEnv["Bindings"], meta: TopicPageMeta, description: string): PageHeadMetadata {
  const canonicalUrl = topicPageUrl(env, meta.id);
  const hasOgImage = meta.status === "closed" && meta.artifact_status === "published" && Boolean(meta.og_image_key);

  return {
    canonicalUrl,
    ogType: "article",
    ogUrl: canonicalUrl,
    ogTitle: `${meta.title} | opndomain`,
    ogDescription: description,
    ogImageUrl: hasOgImage ? topicPageUrl(env, meta.id, "/og.png") : undefined,
    ogImageAlt: hasOgImage ? `Verdict card for ${meta.title}` : undefined,
    twitterCard: hasOgImage ? "summary_large_image" : "summary",
    twitterTitle: `${meta.title} | opndomain`,
    twitterDescription: description,
    twitterImageUrl: hasOgImage ? topicPageUrl(env, meta.id, "/og.png") : undefined,
    twitterImageAlt: hasOgImage ? `Verdict card for ${meta.title}` : undefined,
  };
}

function topicShareLinks(meta: TopicPageMeta, canonicalUrl: string) {
  const xUrl = new URL("https://twitter.com/intent/tweet");
  xUrl.searchParams.set("url", canonicalUrl);
  xUrl.searchParams.set("text", trimCopy(`${meta.title} · ${meta.domain_name} topic on opndomain`, 110));

  const redditUrl = new URL("https://www.reddit.com/submit");
  redditUrl.searchParams.set("url", canonicalUrl);
  redditUrl.searchParams.set("title", trimCopy(`${meta.title} | ${meta.domain_name} | opndomain`, 120));

  return {
    x: xUrl.toString(),
    reddit: redditUrl.toString(),
  };
}

function renderTopicViewBeacon(env: RouterEnv["Bindings"], topicId: string) {
  const endpoint = new URL(`/v1/topics/${encodeURIComponent(topicId)}/views`, env.API_ORIGIN).toString();
  return `
    <script>
      (() => {
        const endpoint = ${JSON.stringify(endpoint)};
        const send = () => {
          fetch(endpoint, {
            method: "POST",
            mode: "cors",
            keepalive: true,
          }).catch(() => {});
        };
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(send, { timeout: 1500 });
          return;
        }
        window.setTimeout(send, 0);
      })();
    </script>
  `;
}

function pngResponse(body: ReadableStream | ArrayBuffer | ArrayBufferView, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    },
  });
}

function pngNotFoundResponse() {
  return new Response("Not found.", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

function binaryResponse(body: ArrayBuffer | ArrayBufferView, contentType: string, cacheControl = CACHE_CONTROL_STATIC, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl,
    },
  });
}

async function bucketJson<T>(object: R2ObjectBody | null): Promise<T | null> {
  if (!object) {
    return null;
  }
  return JSON.parse(await object.text()) as T;
}

function hostname(c: { req: { header: (name: string) => string | undefined } }, fallback: string) {
  return (c.req.header("host") ?? fallback).split(":")[0];
}

async function readCuratedOpen(env: RouterEnv["Bindings"]) {
  return bucketJson<CuratedOpen>(await env.PUBLIC_ARTIFACTS.get(env.CURATED_OPEN_KEY ?? CURATED_OPEN_KEY));
}

async function requireAdminSession(c: any) {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return redirectResponse("/login?next=%2Fadmin");
  }
  const probe = await apiFetch(c.env, "/v1/internal/health", {
    headers: { cookie: c.req.header("cookie") ?? "" },
  });
  if (probe.status === 403) {
    return htmlResponse(renderPage("Forbidden", hero("Admin", "Access denied.", "You do not have access to this surface.")), CACHE_CONTROL_NO_STORE, 403);
  }
  if (!probe.ok) {
    return htmlResponse(renderPage("Unavailable", hero("Admin", "Admin probe failed.", "The API did not validate operator access.")), CACHE_CONTROL_NO_STORE, probe.status);
  }
  let payload: { data: any };
  try {
    payload = await probe.json() as { data: any };
  } catch {
    return htmlResponse(renderPage("Unavailable", hero("Admin", "Admin probe failed.", "The API returned an invalid response.")), CACHE_CONTROL_NO_STORE, 502);
  }
  return { session, health: payload.data };
}

function adminErrorCard(action: string, message: string) {
  return card("Action failed", `<p><strong>${escapeHtml(action)}</strong></p><p>${escapeHtml(message)}</p>`);
}

async function loadAdminDashboardData(c: any): Promise<AdminDashboardData> {
  const [topics, quarantined] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.id, t.title, t.status, d.name AS domain_name
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      ORDER BY t.updated_at DESC
      LIMIT 25
    `).all() as Promise<D1Result<{ id: string; title: string; status: string; domain_name: string }>>,
    c.env.DB.prepare(`
      SELECT c.id, b.handle, t.id AS topic_id, t.title
      FROM contributions c
      INNER JOIN beings b ON b.id = c.being_id
      INNER JOIN topics t ON t.id = c.topic_id
      WHERE c.visibility = 'quarantined'
      ORDER BY c.updated_at DESC
      LIMIT 25
    `).all() as Promise<D1Result<{ id: string; handle: string; topic_id: string; title: string }>>,
  ]);
  return {
    topics: topics.results ?? [],
    quarantined: quarantined.results ?? [],
  };
}

async function renderAdminDashboard(c: any, admin: AdminSessionData, error?: { action: string; message: string }) {
  const csrf = ensureCsrfToken(c);
  const data = await loadAdminDashboardData(c);
  const sections = [
    hero("Admin", "Launch operations", "Protected launch-admin routes proxy authoritative repair operations into the API."),
    error ? adminErrorCard(error.action, error.message) : "",
    grid("two", [
      card("Health", `${statRow("Snapshot queue", String(admin.health.snapshotPendingCount))}${statRow("Presentation queue", String(admin.health.presentationPendingCount))}${(admin.health.topicStatusDistribution ?? []).map((row) => statRow(row.status, String(row.count))).join("")}`),
      formCard("Lifecycle sweep", `<form method="post" action="/admin/actions/sweep">${csrfHiddenInput(csrf.token)}<button type="submit">Run sweep</button></form>`),
    ]),
    adminTable(["Topic", "Domain", "Status", "Actions"], data.topics.map((row) => [
      rawHtml(`<a href="/admin/topics/${escapeHtml(row.id)}">${escapeHtml(row.title)}</a>`),
      row.domain_name,
      rawHtml(statusPill(row.status)),
      rawHtml(`<a class="button secondary" href="/admin/topics/${escapeHtml(row.id)}">Inspect</a>`),
    ])),
    card("Quarantine Queue", data.quarantined.map((row) => `<div class="card" style="margin-top:12px"><p><a href="/topics/${escapeHtml(row.topic_id)}">${escapeHtml(row.title)}</a><br><span class="mono">${escapeHtml(row.id)} | @${escapeHtml(row.handle)}</span></p><div class="actions"><form method="post" action="/admin/contributions/${escapeHtml(row.id)}/release">${csrfHiddenInput(csrf.token)}<input type="hidden" name="reason" value="admin_ui" /><button class="secondary" type="submit">Release</button></form><form method="post" action="/admin/contributions/${escapeHtml(row.id)}/block">${csrfHiddenInput(csrf.token)}<input type="hidden" name="reason" value="admin_ui" /><button class="secondary" type="submit">Block</button></form></div></div>`).join("") || "<p>No quarantined contributions.</p>"),
  ];
  return htmlResponseWithCsrf(c, renderPage("Admin", sections.join("")), CACHE_CONTROL_NO_STORE, 200, csrf);
}

async function loadAdminTopicData(c: any, topicId: string): Promise<AdminTopicData> {
  const [topic, apiTopic] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.id, t.title, t.status, t.prompt, ta.artifact_status
      FROM topics t
      LEFT JOIN topic_artifacts ta ON ta.topic_id = t.id
      WHERE t.id = ?
    `).bind(topicId).first() as Promise<{ id: string; title: string; status: string; prompt: string; artifact_status: string | null } | null>,
    apiJson<any>(c.env, `/v1/topics/${topicId}`, { headers: { cookie: c.req.header("cookie") ?? "" } }).catch(() => null),
  ]);
  return {
    topic: topic ?? null,
    apiTopic: apiTopic?.data ?? null,
  };
}

async function renderAdminTopicPage(c: any, admin: AdminSessionData, topicId: string, error?: { action: string; message: string }) {
  void admin;
  const data = await loadAdminTopicData(c, topicId);
  if (!data.topic) {
    return htmlResponse(renderPage("Missing Topic", hero("Missing", "Topic not found.", "No topic matched that identifier.")), CACHE_CONTROL_NO_STORE, 404);
  }
  const csrf = ensureCsrfToken(c);
  const actions = ["reconcile-presentation", "reterminalize", "repair-scores", "open", "close"]
    .map((action) => `<form method="post" action="/admin/topics/${escapeHtml(topicId)}/${action}">${csrfHiddenInput(csrf.token)}<input type="hidden" name="reason" value="admin_ui" /><button class="secondary" type="submit">${escapeHtml(action)}</button></form>`)
    .join("");
  const sections = [
    hero("Admin Topic", data.topic.title, data.topic.prompt, [data.topic.status, data.topic.artifact_status ?? "pending"]),
    error ? adminErrorCard(error.action, error.message) : "",
    card("Actions", `<div class="actions">${actions}</div>`),
    card("Rounds", (data.apiTopic?.rounds ?? []).map((round) => `<p>${statusPill(round.status)} ${escapeHtml(round.roundKind)} <span class="mono">${escapeHtml(round.id)}</span></p>`).join("") || "<p>No round detail available.</p>"),
  ];
  return htmlResponseWithCsrf(c, renderPage(`Admin ${data.topic.title}`, sections.join("")), CACHE_CONTROL_NO_STORE, 200, csrf);
}

app.use("*", async (c, next) => {
  const env = parseBaseEnv(c.env);
  const subdomain = extractSubdomain(hostname(c, env.ROUTER_HOST));
  if (subdomain === "api") {
    return c.env.API_SERVICE.fetch(c.req.raw);
  }
  if (subdomain === "mcp" && c.env.MCP_SERVICE) {
    return c.env.MCP_SERVICE.fetch(c.req.raw);
  }
  if (subdomain === "www") {
    const url = new URL(c.req.url);
    url.hostname = env.ROUTER_HOST;
    return c.redirect(url.toString(), 301);
  }
  if (subdomain && subdomain !== "api" && subdomain !== "mcp") {
    return c.text("Not found.", 404);
  }
  return next();
});

app.use("*", async (c, next) => {
  await next();
  withSecurityHeaders(c.res);
});

app.get("/healthz", (c) => c.json({ ok: true, service: "router" }));

app.get("/", async (c) =>
  serveCachedHtml(c, {
    pageKey: LANDING_PAGE_CACHE_KEY,
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_CURATED,
  }, async () => {
    const snapshot = await loadLandingSnapshot(c.env.DB);
    return renderLandingPage(snapshot);
  }));

app.get("/analytics", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  const range = normalizeAnalyticsRange(c.req.query("range"));
  const rawTopicId = c.req.query("topicId")?.trim() ?? "";
  const topicId = rawTopicId || null;
  const rawMinVotes = Number.parseInt(c.req.query("minVotes") ?? "5", 10);
  const minVotes = [3, 5, 10, 25].includes(rawMinVotes) ? rawMinVotes : 5;
  const { from, to } = analyticsRangeWindow(range);
  const overviewPath = new URL("/v1/analytics/overview", "https://api.internal");
  if (from && to) {
    overviewPath.searchParams.set("from", from);
    overviewPath.searchParams.set("to", to);
  }
  const topicsPath = new URL("/v1/topics", "https://api.internal");
  topicsPath.searchParams.set("status", "closed");
  const reliabilityPath = new URL("/v1/analytics/vote-reliability", "https://api.internal");
  reliabilityPath.searchParams.set("minVotes", String(minVotes));

  try {
    const [{ data: overview }, { data: topics }, { data: reliability }, topicData] = await Promise.all([
      apiJson<AnalyticsOverviewResponse>(c.env, `${overviewPath.pathname}${overviewPath.search}`),
      apiJson<Array<{ id: string; title: string; status: string }>>(c.env, `${topicsPath.pathname}${topicsPath.search}`),
      apiJson<AnalyticsVoteReliabilityResponse>(c.env, `${reliabilityPath.pathname}${reliabilityPath.search}`),
      topicId
        ? apiJson<AnalyticsTopicResponse>(c.env, `/v1/analytics/topic/${encodeURIComponent(topicId)}`)
          .then((response) => response.data)
          .catch(() => null)
        : Promise.resolve(null),
    ]);

    return htmlResponse(
      renderPage(
        "Analytics",
        renderAnalyticsPage({
          overview,
          topics,
          topicData,
          reliability,
          canViewDetailedAnalytics: Boolean(session),
          range,
          topicId,
          minVotes,
        }),
        "Protocol analytics across engagement, scoring distribution, and vote reliability.",
        ANALYTICS_PAGE_STYLES,
        undefined,
        sidebarShell("analytics", {
          eyebrow: "Analytics",
          title: "Signal View",
          detail: "Protocol activity, score distribution, and vote reliability across public topics.",
          meta: [
            { label: "Range", value: range },
            { label: "Min votes", value: String(minVotes) },
          ],
          action: { href: "/topics?status=closed", label: "Browse topics" },
        }),
      ),
      CACHE_CONTROL_NO_STORE,
    );
  } catch {
    return htmlResponse(
      renderPage(
        "Analytics Unavailable",
        hero("Analytics", "Analytics unavailable.", "The analytics API did not return a complete public dataset."),
      ),
      CACHE_CONTROL_NO_STORE,
      502,
    );
  }
});

app.get("/archive", (c) => redirectWithSameQuery(c, CANONICAL_TOPICS_PATH));

app.get("/topics", async (c) => {
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "";
  const domain = c.req.query("domain") ?? "";
  const template = c.req.query("template") ?? "";
  const filterKey = encodeURIComponent(new URL(c.req.url).searchParams.toString() || "all");
  return serveCachedHtml(c, {
    pageKey: `${pageHtmlTopicsKey(filterKey)}:${TOPICS_INDEX_CACHE_KEY_VERSION}`,
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_TRANSCRIPT,
  }, async () => {
    const topicsPath = new URL("/v1/topics", "https://api.internal");
    if (q) {
      topicsPath.searchParams.set("q", q);
    }
    if (status) {
      topicsPath.searchParams.set("status", status);
    }
    if (domain) {
      topicsPath.searchParams.set("domain", domain);
    }
    if (template) {
      topicsPath.searchParams.set("templateId", template);
    }

    const [{ data: topics }, { data: domains }] = await Promise.all([
      apiJson<Array<{
        id: string;
        title: string;
        status: string;
        templateId: string;
        prompt: string;
        createdAt: string;
        updatedAt: string;
        currentRoundIndex: number | null;
        domainSlug: string;
        domainName: string;
        memberCount: number;
        roundCount: number;
      }>>(c.env, `${topicsPath.pathname}${topicsPath.search}`),
      apiJson<Array<{ id: string; slug: string; name: string; parent_domain_id: string | null }>>(c.env, "/v1/domains"),
    ]);

    // Build parent id -> name map from real ids
    const parentIdToName = new Map<string, string>();
    for (const d of domains) {
      if (!d.parent_domain_id) {
        parentIdToName.set(d.id, d.name);
      }
    }
    const groupedDomainOptions = domains
      .filter((d) => d.parent_domain_id !== null)
      .map((d) => ({
        value: d.slug,
        label: d.name,
        group: d.parent_domain_id ? (parentIdToName.get(d.parent_domain_id) ?? undefined) : undefined,
      }));

    const topicCards = topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      status: topic.status,
      template_id: topic.templateId,
      prompt: topic.prompt,
      created_at: topic.createdAt,
      updated_at: topic.updatedAt,
      current_round_index: topic.currentRoundIndex,
      domain_slug: topic.domainSlug,
      domain_name: topic.domainName,
      member_count: topic.memberCount,
      round_count: topic.roundCount,
    }));
    const templateOptions = Object.values(TOPIC_TEMPLATES)
      .map((definition) => ({ value: definition.templateId, label: definition.templateId }))
      .sort((left, right) => left.label.localeCompare(right.label));

    const activeFilters = [
      topicCards.length !== undefined ? { label: "Results", value: String(topicCards.length) } : null,
      status ? { label: "Status", value: status } : null,
      domain ? { label: "Domain", value: domain } : null,
      template ? { label: "Template", value: template } : null,
      q ? { label: "Query", value: q } : null,
    ].filter((item): item is { label: string; value: string } => item !== null);

    return renderPage("Topics", rawHtml(`
      <section class="editorial-page topics-page">
        <div class="topics-shell">
          ${editorialHeader({
            kicker: "Topics",
            title: "Topics index",
            lede: "Search public topics by keyword, then refine by domain, template, status, participant count, rounds, and recency.",
            meta: activeFilters.length ? activeFilters : [{ label: "Scope", value: "all topics" }],
          })}
          ${topicsFilterBar({
            q,
            status,
            domain,
            template,
            domainOptions: groupedDomainOptions,
            templateOptions,
          })}
          <section class="topics-list">
            ${topicCards.length ? topicCards.map((row) => topicCard(row)).join("") : topicsEmpty()}
          </section>
        </div>
      </section>
    `).__html, "Protocol-centric research surfaces for opndomain.", `${EDITORIAL_PAGE_STYLES}${TOPICS_PAGE_STYLES}`, undefined, {
      variant: "top-nav-only" as const,
      navActiveKey: "topics" as const,
      mainClassName: "topics-main",
    });
  });
});

app.get("/topics/:topicId/og.png", async (c) => {
  const topicId = c.req.param("topicId");
  const artifact = await c.env.DB.prepare(`
    SELECT t.id, ta.artifact_status, ta.og_image_key
    FROM topics t
    LEFT JOIN topic_artifacts ta ON ta.topic_id = t.id
    WHERE t.id = ?
  `).bind(topicId).first<{ id: string; artifact_status: string | null; og_image_key: string | null }>();

  if (!artifact || artifact.artifact_status !== "published" || !artifact.og_image_key) {
    return pngNotFoundResponse();
  }

  const object = await c.env.PUBLIC_ARTIFACTS.get(artifact.og_image_key);
  if (!object) {
    return pngNotFoundResponse();
  }

  return pngResponse(object.body);
});

app.get("/landing/background.png", (c) => {
  const bytes = Uint8Array.from(atob(LANDING_HERO_BG_BASE64), (char) => char.charCodeAt(0));
  return binaryResponse(bytes, LANDING_HERO_BG_CONTENT_TYPE);
});

app.get("/topics/:topicId", async (c) => {
  const topicId = c.req.param("topicId");
  return serveCachedHtml(c, {
    pageKey: `${pageHtmlTopicKey(topicId)}:${TOPIC_PAGE_CACHE_KEY_VERSION}`,
    generationKey: cacheGenerationTopicKey(topicId),
    cacheControl: CACHE_CONTROL_TRANSCRIPT,
  }, async () => {
    const [state, transcript, meta] = await Promise.all([
      bucketJson<any>(await c.env.SNAPSHOTS.get(`topics/${topicId}/state.json`)),
      bucketJson<any>(await c.env.SNAPSHOTS.get(`topics/${topicId}/transcript.json`)),
      c.env.DB.prepare(`
        SELECT
          t.id,
          t.title,
          t.status,
          t.prompt,
          t.template_id,
          d.name AS domain_name,
          d.slug AS domain_slug,
          pd.name AS parent_domain_name,
          pd.slug AS parent_domain_slug,
          ta.artifact_status,
          ta.verdict_html_key,
          ta.og_image_key,
          v.summary AS verdict_summary,
          v.confidence AS verdict_confidence,
          (SELECT COUNT(*) FROM topic_members tm WHERE tm.topic_id = t.id AND tm.status = 'active') AS member_count,
          (SELECT COUNT(*) FROM contributions c2 WHERE c2.topic_id = t.id) AS contribution_count
        FROM topics t
        INNER JOIN domains d ON d.id = t.domain_id
        LEFT JOIN domains pd ON pd.id = d.parent_domain_id
        LEFT JOIN topic_artifacts ta ON ta.topic_id = t.id
        LEFT JOIN verdicts v ON v.topic_id = t.id
        WHERE t.id = ?
      `).bind(topicId).first<TopicPageMeta>(),
    ]);
    if (!meta) {
      return renderPage("Missing Topic", hero("Missing", "Topic not found.", "No topic matched that identifier."));
    }
    const voteLogicRows = meta.status === "closed"
      ? (await c.env.DB.prepare(`
          SELECT
            voter_b.handle AS voter_handle,
            voter_b.display_name AS voter_display_name,
            target_b.handle AS target_handle,
            target_b.display_name AS target_display_name,
            voter_c.body_clean AS reasoning,
            r.sequence_index AS round_index,
            r.round_kind AS round_kind
          FROM votes v
          INNER JOIN beings voter_b ON voter_b.id = v.voter_being_id
          INNER JOIN contributions target_c ON target_c.id = v.contribution_id
          INNER JOIN beings target_b ON target_b.id = target_c.being_id
          INNER JOIN rounds r ON r.id = v.round_id
          LEFT JOIN contributions voter_c
            ON voter_c.round_id = v.round_id
            AND voter_c.being_id = v.voter_being_id
          WHERE v.topic_id = ?
            AND v.vote_kind = 'most_correct'
          ORDER BY r.sequence_index ASC, voter_b.handle ASC
        `).bind(topicId).all<{
          voter_handle: string;
          voter_display_name: string | null;
          target_handle: string;
          target_display_name: string | null;
          reasoning: string | null;
          round_index: number;
          round_kind: string;
        }>())?.results ?? []
      : [];
    const verdictPresentationObject =
      meta.status === "closed" && meta.artifact_status === "published"
        ? await readVerdictPresentation(c, topicId)
        : null;
    const verdictPresentation = verdictPresentationObject;
    const viewModel = buildTopicPageViewModel(meta, state, transcript?.rounds, verdictPresentation);
    // Use viewModel contributions for closed topics (content-round-derived), meta for open
    const descriptionMeta = meta.status === "closed"
      ? { ...meta, contribution_count: viewModel.contributions }
      : meta;
    const topPosition = viewModel.convergenceMap?.[0]?.label ?? null;
    const shareDescriptionText = topPosition
      ? `${topPosition}`
      : verdictPresentation?.summary ?? null;
    const description = buildTopicShareDescription(descriptionMeta, shareDescriptionText);
    const head = buildTopicHeadMetadata(c.env, meta, description);
    const canonicalUrl = head.canonicalUrl ?? topicPageUrl(c.env, meta.id);
    const shareLinks = topicShareLinks(meta, canonicalUrl);
    const hasPublishedOgCard = meta.status === "closed" && meta.artifact_status === "published" && Boolean(meta.og_image_key);
    const sharePanel = meta.status === "closed"
      ? topicSharePanel({
          url: canonicalUrl,
          title: meta.title,
          lede: "Push the outcome first: send readers straight to the verdict, transcript highlights, and social preview card.",
          note: hasPublishedOgCard
            ? "Large-image preview is ready for X and Reddit shares."
            : "No published verdict card is available, so shares will fall back to summary metadata.",
          xLink: { href: shareLinks.x, label: "Share on X" },
          redditLink: { href: shareLinks.reddit, label: "Share on Reddit" },
        })
      : "";
    if (meta.status === "closed") {
      const pageBody = [
        // TIER 1 — Above fold
        `<section class="topic-above-fold">${[
          `<div class="topic-hero-col">
            ${buildTopicHeader(meta, viewModel, shareLinks)}
            ${viewModel.convergenceMap ? renderConvergenceMap(viewModel) : ""}
          </div>`,
          renderTopicMetaPanel(viewModel),
        ].join("")}</section>`,

        // TIER 2 — The Story (always visible)
        renderOpeningSynthesis(viewModel),
        renderWinningArgument(viewModel),
        renderBothSidesSummary(viewModel),
        // Highlights (top-scoring quote per round) — promoted out of dropdown,
        // sits between the verdict and the dissenting views as a "what mattered most" section.
        viewModel.verdictHighlights
          ? (() => {
              // Build exclusion set: anything already featured above the fold.
              const excluded = new Set<string>();
              if (viewModel.openingSynthesisContributionId) excluded.add(viewModel.openingSynthesisContributionId);
              if (viewModel.winningArgument?.contributionId) excluded.add(viewModel.winningArgument.contributionId);
              if (viewModel.strongestCounter?.contributionId) excluded.add(viewModel.strongestCounter.contributionId);
              for (const r of viewModel.minorityReports ?? []) {
                if (r.contributionId) excluded.add(r.contributionId);
              }
              // Sharpest observation pulls the first critique-round highlight.
              const sharpest = viewModel.verdictHighlights.find((h) => h.roundKind === "critique");
              if (sharpest) excluded.add(sharpest.contributionId);
              return renderTopicHighlightsSection(viewModel.verdictHighlights, excluded);
            })()
          : "",
        renderDissentingViews(viewModel),
        !viewModel.winningArgument
          ? buildFeaturedAnswerMarkup(viewModel.featuredAnswer)
          : "",
        // Editorial body: skip if bothSidesSummary is present (same content, already decomposed above)
        !viewModel.bothSidesSummary ? renderEditorialBody(viewModel) : "",
        !viewModel.convergenceMap && viewModel.positions
          ? renderPositionsSection(viewModel.synthesisOutcome, viewModel.positions)
          : "",

        // TIER 4 — Deep Dives (always collapsed)
        renderTopicScoreStorySection(viewModel),
        renderVoteLogicSection(voteLogicRows),
        `<details class="dossier-secondary-section"><summary>Full transcript</summary>${renderTopicTranscriptSection(viewModel)}</details>`,
        sharePanel,
        renderTopicViewBeacon(c.env, topicId),
      ].join("");

      return renderPage(meta.title, `<section class="topic-page">${pageBody}</section>`, description, TOPIC_DETAIL_PAGE_STYLES, head, {
        variant: "top-nav-only",
        navActiveKey: "topics",
        mainClassName: "page-main--topic",
      });
    }

    const pageBody = [
      `<section class="topic-above-fold">${[
        `<div class="topic-hero-col">${buildTopicHeader(meta, viewModel, shareLinks)}${buildFeaturedAnswerMarkup(viewModel.featuredAnswer)}</div>`,
        renderTopicMetaPanel(viewModel),
      ].join("")}</section>`,
      renderRoundProgressTracker(state?.rounds as StateSnapshotRound[] | undefined, meta.status),
      renderTopicTranscriptSection(viewModel),
      renderTopicViewBeacon(c.env, topicId),
    ].join("");

    return renderPage(meta.title, `<section class="topic-page">${pageBody}</section>`, description, TOPIC_DETAIL_PAGE_STYLES, head, {
      variant: "top-nav-only",
      navActiveKey: "topics",
      mainClassName: "page-main--topic",
    });
  });
});

app.get("/domains", async (c) =>
  serveCachedHtml(c, {
    pageKey: `${pageHtmlDomainKey("_index")}:${DOMAINS_INDEX_CACHE_KEY_VERSION}`,
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const [parentResult, childResult] = await Promise.all([
      c.env.DB.prepare(`
        SELECT d.id, d.slug, d.name, d.description
        FROM domains d
        WHERE d.parent_domain_id IS NULL
        ORDER BY d.name ASC
      `).all<{ id: string; slug: string; name: string; description: string | null }>(),
      c.env.DB.prepare(`
        SELECT d.slug, d.name, d.description, d.parent_domain_id,
          (SELECT COUNT(*) FROM topics t WHERE t.domain_id = d.id) AS topic_count
        FROM domains d
        WHERE d.parent_domain_id IS NOT NULL
        ORDER BY d.slug ASC
      `).all<{ slug: string; name: string; description: string | null; parent_domain_id: string; topic_count: number }>(),
    ]);
    const parents = parentResult.results ?? [];
    const children = childResult.results ?? [];
    const childrenByParent = new Map<string, typeof children>();
    for (const child of children) {
      const group = childrenByParent.get(child.parent_domain_id) ?? [];
      group.push(child);
      childrenByParent.set(child.parent_domain_id, group);
    }
    return renderPage("Domains", rawHtml(`
      <section class="editorial-page domain-index-page">
        <div class="domain-index-shell">
          <header class="domain-index-header">
            <h1 class="editorial-title">Domains</h1>
            <p class="editorial-lede">Domains organize the protocol into durable fields of inquiry. Find the subject areas your agents operate in, track the topics each field has accumulated, and open the domain surface for current activity.</p>
          </header>
          ${parents.map((parent) => {
            const group = childrenByParent.get(parent.id) ?? [];
            const totalTopics = group.reduce((sum, c) => sum + c.topic_count, 0);
            return `
              <section class="domain-group" aria-label="${escapeHtml(parent.name)}">
                <div class="domain-group-header">
                  <a href="/domains/${escapeHtml(parent.slug)}" class="domain-group-link">
                    <h2>${escapeHtml(parent.name)}</h2>
                  </a>
                  <span class="domain-group-count">${totalTopics} topics across ${group.length} subdomains</span>
                </div>
                <div class="domain-group-grid">
                  ${group.map((row) => `
                    <a class="lp-og-card" href="/domains/${escapeHtml(row.slug)}">
                      <div class="lp-og-card-chrome">
                        <div class="lp-og-card-meta">
                          <span class="lp-og-card-kicker">Domain</span>
                          <span class="lp-og-card-date">${escapeHtml(String(row.topic_count))} topics</span>
                        </div>
                        <h2><span>${escapeHtml(row.name)}</span></h2>
                        <p>${escapeHtml(row.description ?? "A public domain surface inside the protocol.")}</p>
                      </div>
                      <div class="lp-og-card-footer">
                        <div class="lp-og-card-stats">
                          <div class="lp-og-card-stat">
                            <span>Purpose</span>
                            <strong>Topic registry</strong>
                          </div>
                          <div class="lp-og-card-stat">
                            <span>Access</span>
                            <strong>Open domain</strong>
                          </div>
                        </div>
                        <div class="lp-og-card-actions">
                          <span class="lp-og-card-link">Open Domain</span>
                          <code>${escapeHtml(row.slug)}</code>
                        </div>
                      </div>
                    </a>
                  `).join("")}
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </section>
    `).__html, "Domain index for public protocol research fields and their topic history.", `${EDITORIAL_PAGE_STYLES}${DOMAIN_INDEX_PAGE_STYLES}`, undefined, {
      variant: "top-nav-only" as const,
      navActiveKey: "domains",
      mainClassName: "domain-index-main",
    });
  }));

app.get("/domains/:slug", async (c) => {
  const slug = c.req.param("slug");
  const domain = await c.env.DB.prepare(
    `SELECT d.id, d.slug, d.name, d.description, d.parent_domain_id,
       (SELECT COUNT(*) FROM topics WHERE domain_id = d.id) AS topic_count,
       p.slug AS parent_slug, p.name AS parent_name
     FROM domains d
     LEFT JOIN domains p ON p.id = d.parent_domain_id
     WHERE d.slug = ?`,
  ).bind(slug).first<{
    id: string; slug: string; name: string; description: string | null;
    parent_domain_id: string | null; topic_count: number;
    parent_slug: string | null; parent_name: string | null;
  }>();
  if (!domain) {
    return htmlResponse(renderPage("Missing Domain", hero("Missing", "Domain not found.", "No domain matched that slug.")), CACHE_CONTROL_NO_STORE, 404);
  }
  const isParent = domain.parent_domain_id === null;

  if (isParent) {
    // Parent domain detail: show children grid + aggregated leaderboard
    return serveCachedHtml(c, {
      pageKey: `${pageHtmlDomainKey(slug)}:2026-04-domain-groups`,
      generationKey: cacheGenerationDomainKey(domain.id),
      cacheControl: CACHE_CONTROL_DIRECTORY,
    }, async () => {
      const [childResult, leaderboard] = await Promise.all([
        c.env.DB.prepare(`
          SELECT d.slug, d.name, d.description,
            (SELECT COUNT(*) FROM topics t WHERE t.domain_id = d.id) AS topic_count
          FROM domains d
          WHERE d.parent_domain_id = ?
          ORDER BY d.slug ASC
        `).bind(domain.id).all<{ slug: string; name: string; description: string | null; topic_count: number }>(),
        c.env.DB.prepare(`
          SELECT b.handle, b.display_name,
            SUM(dr.decayed_score) AS decayed_score,
            SUM(dr.sample_count) AS sample_count
          FROM domain_reputation dr
          INNER JOIN beings b ON b.id = dr.being_id
          INNER JOIN domains d ON d.id = dr.domain_id
          WHERE d.parent_domain_id = ?
          GROUP BY dr.being_id
          ORDER BY decayed_score DESC
          LIMIT 12
        `).bind(domain.id).all<{ handle: string; display_name: string; decayed_score: number; sample_count: number }>(),
      ]);
      const childRows = childResult.results ?? [];
      const leaderRows = leaderboard.results ?? [];
      const totalTopics = childRows.reduce((sum, c) => sum + c.topic_count, 0);
      return renderPage(domain.name, `
        <section class="domain-detail">
          <nav class="domain-breadcrumb">
            <a href="/domains">Domains</a> <span class="domain-breadcrumb-sep">&rsaquo;</span> ${escapeHtml(domain.name)}
          </nav>
          <section class="domain-detail-section">
            <div class="domain-detail-section-head">
              <span class="domain-detail-kicker">Subdomains</span>
              <h2>${childRows.length} fields of inquiry</h2>
            </div>
            <div class="domain-group-grid">
              ${childRows.map((row) => `
                <a class="lp-og-card" href="/domains/${escapeHtml(row.slug)}">
                  <div class="lp-og-card-chrome">
                    <div class="lp-og-card-meta">
                      <span class="lp-og-card-kicker">Domain</span>
                      <span class="lp-og-card-date">${escapeHtml(String(row.topic_count))} topics</span>
                    </div>
                    <h2><span>${escapeHtml(row.name)}</span></h2>
                    <p>${escapeHtml(row.description ?? "A public domain surface inside the protocol.")}</p>
                  </div>
                  <div class="lp-og-card-footer">
                    <div class="lp-og-card-stats">
                      <div class="lp-og-card-stat">
                        <span>Purpose</span>
                        <strong>Topic registry</strong>
                      </div>
                      <div class="lp-og-card-stat">
                        <span>Access</span>
                        <strong>Open domain</strong>
                      </div>
                    </div>
                    <div class="lp-og-card-actions">
                      <span class="lp-og-card-link">Open Domain</span>
                      <code>${escapeHtml(row.slug)}</code>
                    </div>
                  </div>
                </a>
              `).join("")}
            </div>
          </section>
          <section class="domain-detail-section">
            <div class="domain-detail-section-head">
              <span class="domain-detail-kicker">Aggregated leaderboard</span>
              <h2>Top agents</h2>
            </div>
            ${leaderRows.length ? leaderRows.map((row, i) => `
              <div class="domain-leader-row">
                <span class="domain-leader-rank">#${i + 1}</span>
                <span class="domain-leader-name"><a href="/leaderboard/${escapeHtml(row.handle)}">${escapeHtml(row.display_name)}</a></span>
                <span class="domain-leader-score">${Number(row.decayed_score ?? 0).toFixed(1)}</span>
                <span class="domain-leader-samples">${row.sample_count} samples</span>
              </div>
            `).join("") : `<p class="domain-detail-empty">No reputation signal yet.</p>`}
          </section>
        </section>
      `, undefined, `${EDITORIAL_PAGE_STYLES}${DOMAIN_INDEX_PAGE_STYLES}${DOMAIN_DETAIL_PAGE_STYLES}`, undefined, sidebarShell("domains", {
        eyebrow: "Parent domain",
        title: domain.name,
        detail: domain.description ?? `Parent domain grouping ${childRows.length} subdomains.`,
        meta: [
          { label: "Subdomains", value: String(childRows.length) },
          { label: "Total topics", value: String(totalTopics) },
        ],
        action: { href: "/domains", label: "Back to domains" },
      }));
    });
  }

  // Subdomain detail: existing view with breadcrumb
  return serveCachedHtml(c, {
    pageKey: `${pageHtmlDomainKey(slug)}:2026-04-domain-groups`,
    generationKey: cacheGenerationDomainKey(domain.id),
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const [topics, leaderboard] = await Promise.all([
      c.env.DB.prepare(`
        SELECT id, title, status, template_id
        FROM topics
        WHERE domain_id = ?
        ORDER BY updated_at DESC
        LIMIT 12
      `).bind(domain.id).all<{ id: string; title: string; status: string; template_id: string }>(),
      c.env.DB.prepare(`
        SELECT b.handle, b.display_name, dr.decayed_score, dr.sample_count
        FROM domain_reputation dr
        INNER JOIN beings b ON b.id = dr.being_id
        WHERE dr.domain_id = ?
        ORDER BY dr.decayed_score DESC, dr.sample_count DESC
        LIMIT 12
      `).bind(domain.id).all<{ handle: string; display_name: string; decayed_score: number; sample_count: number }>(),
    ]);
    const topicRows = topics.results ?? [];
    const leaderRows = leaderboard.results ?? [];
    const breadcrumb = domain.parent_slug
      ? `<nav class="domain-breadcrumb"><a href="/domains">Domains</a> <span class="domain-breadcrumb-sep">&rsaquo;</span> <a href="/domains/${escapeHtml(domain.parent_slug)}">${escapeHtml(domain.parent_name!)}</a> <span class="domain-breadcrumb-sep">&rsaquo;</span> ${escapeHtml(domain.name)}</nav>`
      : `<nav class="domain-breadcrumb"><a href="/domains">Domains</a> <span class="domain-breadcrumb-sep">&rsaquo;</span> ${escapeHtml(domain.name)}</nav>`;
    return renderPage(domain.name, `
      <section class="domain-detail">
        ${breadcrumb}
        <section class="domain-detail-section">
          <div class="domain-detail-section-head">
            <span class="domain-detail-kicker">Recent topics</span>
            <h2>Topic activity</h2>
          </div>
          ${topicRows.length ? topicRows.map((topic) => `
            <div class="domain-topic-row">
              <h3 class="domain-topic-title"><a href="/topics/${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</a></h3>
              <div class="domain-topic-badges">${statusPill(topic.status)} ${dataBadge(topic.template_id)}</div>
            </div>
          `).join("") : `<p class="domain-detail-empty">No topics yet.</p>`}
        </section>
        <section class="domain-detail-section">
          <div class="domain-detail-section-head">
            <span class="domain-detail-kicker">Domain leaderboard</span>
            <h2>Top agents</h2>
          </div>
          ${leaderRows.length ? leaderRows.map((row, i) => `
            <div class="domain-leader-row">
              <span class="domain-leader-rank">#${i + 1}</span>
              <span class="domain-leader-name"><a href="/leaderboard/${escapeHtml(row.handle)}">${escapeHtml(row.display_name)}</a></span>
              <span class="domain-leader-score">${Number(row.decayed_score ?? 0).toFixed(1)}</span>
              <span class="domain-leader-samples">${row.sample_count} samples</span>
            </div>
          `).join("") : `<p class="domain-detail-empty">No reputation signal yet.</p>`}
        </section>
      </section>
    `, undefined, `${EDITORIAL_PAGE_STYLES}${DOMAIN_DETAIL_PAGE_STYLES}`, undefined, sidebarShell("domains", {
      eyebrow: "Domain",
      title: domain.name,
      detail: domain.description ?? `Public domain surface for ${domain.slug}.`,
      meta: [
        { label: "Slug", value: domain.slug },
        { label: "Topics", value: String(domain.topic_count) },
      ],
      action: domain.parent_slug
        ? { href: `/domains/${domain.parent_slug}`, label: `Back to ${domain.parent_name}` }
        : { href: "/domains", label: "Back to domains" },
    }));
  });
});

app.get("/beings", (c) => redirectWithSameQuery(c, CANONICAL_LEADERBOARD_PATH));
app.get("/beings/:handle", (c) => redirectWithSameQuery(c, `${CANONICAL_LEADERBOARD_PATH}/${encodeURIComponent(c.req.param("handle"))}`));
app.get("/agents", (c) => redirectWithSameQuery(c, CANONICAL_LEADERBOARD_PATH));
app.get("/agents/:handle", (c) => redirectWithSameQuery(c, `${CANONICAL_LEADERBOARD_PATH}/${encodeURIComponent(c.req.param("handle"))}`));

app.get("/leaderboard", async (c) =>
  serveCachedHtml(c, {
    pageKey: `${pageHtmlBeingKey("_index")}:${LEADERBOARD_INDEX_CACHE_KEY_VERSION}`,
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const beings = await c.env.DB.prepare(`
      SELECT
        b.handle,
        b.display_name,
        b.bio,
        b.trust_tier,
        COUNT(DISTINCT c.id) AS contribution_count,
        COALESCE(SUM(dr.decayed_score), 0) AS aggregate_score,
        COALESCE(SUM(dr.sample_count), 0) AS aggregate_samples
      FROM beings b
      LEFT JOIN contributions c ON c.being_id = b.id
      LEFT JOIN domain_reputation dr ON dr.being_id = b.id
      GROUP BY b.id
      ORDER BY aggregate_score DESC, contribution_count DESC, b.handle ASC
    `).all<{ handle: string; display_name: string; bio: string | null; trust_tier: string; contribution_count: number; aggregate_score: number; aggregate_samples: number }>();
    const rows = beings.results ?? [];
    const topRows = rows.slice(0, 3);
    const restRows = rows.slice(3);
    const maxScore = rows.length ? Math.max(...rows.map((r) => Number(r.aggregate_score ?? 0)), 1) : 1;
    const medalClass = (i: number) => i === 0 ? "lb-medal--gold" : i === 1 ? "lb-medal--silver" : "lb-medal--bronze";

    return renderPage("Leaderboard", rawHtml(`
      <section class="lb-page">
        <header class="lb-header">
          <h1 class="lb-title">Leaderboard</h1>
          <p class="lb-subtitle">${rows.length} agents ranked by aggregate reputation</p>
        </header>

        ${topRows.length ? `
          <section class="lb-podium" aria-label="Top agents">
            ${topRows.map((row, i) => `
              <a class="lb-podium-card ${medalClass(i)}" href="/leaderboard/${escapeHtml(row.handle)}">
                <span class="lb-podium-rank">${i + 1}</span>
                <div class="lb-podium-avatar">${escapeHtml((row.display_name || row.handle || "?")[0].toUpperCase())}</div>
                <h2 class="lb-podium-name">${escapeHtml(row.display_name)}</h2>
                <span class="lb-podium-handle">@${escapeHtml(row.handle)}</span>
                <div class="lb-podium-score">${Number(row.aggregate_score ?? 0).toFixed(1)}</div>
                <span class="lb-podium-score-label">reputation</span>
                <div class="lb-podium-meta">
                  <span>${row.contribution_count} contributions</span>
                  <span>${row.aggregate_samples ?? 0} samples</span>
                </div>
              </a>
            `).join("")}
          </section>
        ` : ""}

        <section class="lb-table-wrap" aria-label="Full rankings">
          <table class="lb-table">
            <thead>
              <tr>
                <th class="lb-th-rank">#</th>
                <th class="lb-th-agent">Agent</th>
                <th class="lb-th-rep">Reputation</th>
                <th class="lb-th-num">Samples</th>
                <th class="lb-th-num">Contributions</th>
                <th class="lb-th-trust">Trust</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => {
                const score = Number(row.aggregate_score ?? 0);
                const barWidth = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const isTop3 = index < 3;
                return `
                  <tr class="lb-row${isTop3 ? ` lb-row--top ${medalClass(index)}` : ""}">
                    <td class="lb-cell-rank">${index + 1}</td>
                    <td class="lb-cell-agent">
                      <a href="/leaderboard/${escapeHtml(row.handle)}">
                        <span class="lb-agent-name">${escapeHtml(row.display_name)}</span>
                        <span class="lb-agent-handle">@${escapeHtml(row.handle)}</span>
                      </a>
                    </td>
                    <td class="lb-cell-rep">
                      <div class="lb-bar-wrap">
                        <div class="lb-bar" style="width:${barWidth.toFixed(1)}%"></div>
                      </div>
                      <span class="lb-score-value">${score.toFixed(1)}</span>
                    </td>
                    <td class="lb-cell-num">${row.aggregate_samples ?? 0}</td>
                    <td class="lb-cell-num">${row.contribution_count}</td>
                    <td class="lb-cell-trust"><span class="lb-trust-badge">${escapeHtml(row.trust_tier)}</span></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </section>
      </section>
    `).__html, "Public agents ranked by aggregate reputation across domains.", `${LEADERBOARD_INDEX_PAGE_STYLES}`, undefined, {
      variant: "top-nav-only",
      navActiveKey: "leaderboard",
    });
  }));

app.get("/leaderboard/:handle", async (c) => {
  const handle = c.req.param("handle");
  const being = await c.env.DB.prepare(`
    SELECT id, handle, display_name, bio, trust_tier
    FROM beings
    WHERE handle = ?
  `).bind(handle).first<{ id: string; handle: string; display_name: string; bio: string | null; trust_tier: string }>();
  if (!being) {
    return htmlResponse(renderPage("Agent Not Found", hero("Missing", "Agent not found.", "No public agent matched that handle.")), CACHE_CONTROL_NO_STORE, 404);
  }
  return serveCachedHtml(c, {
    pageKey: `${pageHtmlBeingKey(handle)}:2026-04-frontend-unify`,
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const [reputation, history] = await Promise.all([
      c.env.DB.prepare(`
        SELECT d.slug, d.name, dr.decayed_score, dr.sample_count
        FROM domain_reputation dr
        INNER JOIN domains d ON d.id = dr.domain_id
        WHERE dr.being_id = ?
        ORDER BY dr.decayed_score DESC
      `).bind(being.id).all<{ slug: string; name: string; decayed_score: number; sample_count: number }>(),
      c.env.DB.prepare(`
        SELECT t.id AS topic_id, t.title, r.round_kind, c.submitted_at
        FROM contributions c
        INNER JOIN topics t ON t.id = c.topic_id
        INNER JOIN rounds r ON r.id = c.round_id
        WHERE c.being_id = ?
        ORDER BY c.submitted_at DESC
        LIMIT 20
      `).bind(being.id).all<{ topic_id: string; title: string; round_kind: string; submitted_at: string }>(),
    ]);
    const repRows = reputation.results ?? [];
    const histRows = history.results ?? [];
    const initial = (being.display_name || being.handle || "?")[0].toUpperCase();
    const totalScore = repRows.reduce((sum, r) => sum + Number(r.decayed_score ?? 0), 0);
    const totalSamples = repRows.reduce((sum, r) => sum + Number(r.sample_count ?? 0), 0);
    return renderPage(being.display_name, `
      <section class="leaderboard-profile">
        <div class="leaderboard-profile-card">
          <div class="leaderboard-profile-header">
            <div class="leaderboard-profile-avatar">${escapeHtml(initial)}</div>
            <div class="leaderboard-profile-identity">
              <h1 class="leaderboard-profile-name">${escapeHtml(being.display_name)}</h1>
              <span class="leaderboard-profile-handle">@${escapeHtml(being.handle)}</span>
            </div>
            <div class="leaderboard-profile-score">
              <strong>${totalScore.toFixed(1)}</strong>
              <span>reputation</span>
            </div>
          </div>

          ${repRows.length ? `
            <div class="leaderboard-profile-section leaderboard-profile-section--rep">
              <div class="leaderboard-profile-section-label">Reputation</div>
              ${repRows.map((row) => `<div class="leaderboard-profile-row"><a href="/domains/${escapeHtml(row.slug)}">${escapeHtml(row.name)}</a><span class="leaderboard-profile-mono">${Number(row.decayed_score ?? 0).toFixed(1)}</span></div>`).join("")}
            </div>
          ` : ""}

          ${histRows.length ? `
            <div class="leaderboard-profile-section leaderboard-profile-section--contrib">
              <div class="leaderboard-profile-section-label">Contributions</div>
              ${histRows.map((row) => `<div class="leaderboard-profile-row"><a href="/topics/${escapeHtml(row.topic_id)}">${escapeHtml(row.title)}</a><span class="leaderboard-profile-mono">${escapeHtml(row.round_kind)}</span></div>`).join("")}
            </div>
          ` : ""}

          <div class="leaderboard-profile-stats">
            <div class="leaderboard-profile-stat"><strong>${repRows.length}</strong><span>domains</span></div>
            <div class="leaderboard-profile-stat"><strong>${totalSamples}</strong><span>samples</span></div>
            <div class="leaderboard-profile-stat"><strong>${histRows.length}</strong><span>contributions</span></div>
          </div>

        </div>
      </section>
    `, undefined, LEADERBOARD_DETAIL_PAGE_STYLES, undefined, {
      variant: "top-nav-only",
      navActiveKey: "leaderboard",
      bodyClassName: "auth-shell-page",
      footerClassName: "auth-footer",
    });
  });
});

app.get("/about", () => htmlResponse(renderAboutPage(), CACHE_CONTROL_STATIC));
app.get("/connect", (c) => redirectWithSameQuery(c, "/login"));
app.get("/login", (c) => redirectWithSameQuery(c, CANONICAL_ACCESS_PATH));
app.get("/register", (c) => redirectWithSameQuery(c, CANONICAL_ACCESS_PATH));
app.get("/verify-email", (c) => redirectWithSameQuery(c, CANONICAL_ACCESS_PATH));
app.get("/access", (c) => renderAccessPage(c, { activePanel: (c.req.query("panel") as "signin" | "register" | "verify" | null) ?? "signin" }));
app.get("/mcp", () => htmlResponse(renderConnectPage(), CACHE_CONTROL_STATIC));
app.get("/terms", () => htmlResponse(renderPage("Terms", hero("Terms", "Launch terms", "Protocol launch terms placeholder for Phase 6."), undefined, undefined, undefined, authShell("Terms", "Launch terms")), CACHE_CONTROL_STATIC));
app.get("/privacy", () => htmlResponse(renderPage("Privacy", hero("Privacy", "Launch privacy", "Protocol launch privacy placeholder for Phase 6."), undefined, undefined, undefined, authShell("Privacy", "Protocol privacy")), CACHE_CONTROL_STATIC));
app.get("/welcome", () => htmlResponse(renderPage("Welcome", hero("Welcome", "Registration next steps", "Register an agent, verify email, then mint a session through magic link or client credentials."), undefined, undefined, undefined, authShell("Welcome", "Registration next steps"))));

app.post("/register", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccessPage(c, {
      activePanel: "register",
      statusCode: 403,
      statusTone: "error",
      statusTitle: "Registration rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  const { data } = await apiJson<any>(c.env, "/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") }),
  });
  return renderAccessPage(c, {
    activePanel: "register",
    statusTone: "success",
    statusTitle: "Agent registered.",
    statusBody: "Store the machine credentials now, then verify the email to enable the full access flow.",
    registrationResult: {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      email: data.agent.email ?? "",
      expiresAt: data.verification.expiresAt,
      code: data.verification.delivery?.code ?? "sent via provider",
    },
  });
});

app.post("/verify-email", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccessPage(c, {
      activePanel: "verify",
      statusCode: 403,
      statusTone: "error",
      statusTitle: "Verification rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  await apiJson<any>(c.env, "/v1/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: String(form.get("clientId") ?? ""), code: String(form.get("code") ?? "") }),
  });
  return renderAccessPage(c, {
    activePanel: "verify",
    statusTone: "success",
    statusTitle: "Email verified.",
    statusBody: "The agent can now sign in through magic link or machine credentials.",
  });
});

app.post("/login/magic", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 403,
      statusTone: "error",
      statusTitle: "Magic link rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  const email = String(form.get("email") ?? "");
  const { data: lookup } = await apiJson<any>(c.env, "/v1/auth/account-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (lookup.status === "account_not_found") {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusTone: "info",
      statusTitle: "Choose your path.",
      statusBody: "No existing account matched that email. Create an account or continue as a guest.",
      lookupEmail: email,
    });
  }
  await apiJson<any>(c.env, "/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return renderAccessPage(c, {
    activePanel: "signin",
    statusTone: "info",
    statusTitle: "Check your email.",
    statusBody: lookup.status === "awaiting_verification"
      ? "Use the emailed magic link to verify and sign in to the existing account."
      : "Use the emailed magic link to mint a router session.",
  });
});

app.post("/login/guest", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 403,
      statusTone: "error",
      statusTitle: "Guest launch rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  const response = await apiFetch(c.env, "/v1/auth/guest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 500,
      statusTone: "error",
      statusTitle: "Guest launch failed.",
      statusBody: "The guest session could not be provisioned.",
    });
  }
  const next = redirectResponse("/account");
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    next.headers.append("set-cookie", setCookie);
  }
  return next;
});

app.get("/login/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 400,
      statusTone: "error",
      statusTitle: "Magic link token missing.",
      statusBody: "A token query parameter is required.",
    });
  }
  const response = await apiFetch(c.env, "/v1/auth/magic-link/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 401,
      statusTone: "error",
      statusTitle: "Magic link invalid.",
      statusBody: "The token is expired, invalid, or already consumed.",
    });
  }
  const next = redirectResponse("/account");
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    next.headers.append("set-cookie", setCookie);
  }
  return next;
});

app.post("/login/credentials", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 403,
      statusTone: "error",
      statusTitle: "Credential login rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  const response = await apiFetch(c.env, "/v1/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "client_credentials",
      clientId: String(form.get("clientId") ?? ""),
      clientSecret: String(form.get("clientSecret") ?? ""),
    }),
  });
  if (!response.ok) {
    return renderAccessPage(c, {
      activePanel: "signin",
      statusCode: 401,
      statusTone: "error",
      statusTitle: "Credential login failed.",
      statusBody: "Client credentials were rejected.",
      nextPath: String(form.get("next") ?? ""),
    });
  }
  const next = redirectResponse(safeNextPath(String(form.get("next") ?? "")));
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    next.headers.append("set-cookie", setCookie);
  }
  return next;
});

app.post("/logout", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return htmlResponse(renderPage("Forbidden", hero("Auth", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
  }
  const response = await apiFetch(c.env, "/v1/auth/logout", {
    method: "POST",
    headers: { cookie: c.req.header("cookie") ?? "" },
  });
  const next = redirectResponse("/");
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    next.headers.append("set-cookie", setCookie);
  }
  return next;
});

app.get("/account", async (c) => {
  const account = await fetchAccountData(c.env, c.req.raw);
  if (!account) {
    return redirectResponse("/access?next=%2Faccount");
  }
  return renderAccountPage(c, account);
});

app.post("/account/email-link", async (c) => {
  const account = await fetchAccountData(c.env, c.req.raw);
  if (!account) {
    return redirectResponse("/access?next=%2Faccount");
  }
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccountPage(c, account, {
      statusTone: "error",
      statusTitle: "Email link rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  try {
    await apiJson(c.env, "/v1/auth/email-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: c.req.header("cookie") ?? "",
      },
      body: JSON.stringify({ email: String(form.get("email") ?? "") }),
    });
    return renderAccountPage(c, account, {
      statusTone: "success",
      statusTitle: "Verification link sent.",
      statusBody: "Use the emailed magic link to attach and verify that address.",
    });
  } catch (error) {
    return renderAccountPage(c, account, {
      statusTone: "error",
      statusTitle: "Email link failed.",
      statusBody: error instanceof Error ? error.message : "The email link could not be issued.",
    });
  }
});

app.post("/account/credentials/rotate", async (c) => {
  const account = await fetchAccountData(c.env, c.req.raw);
  if (!account) {
    return redirectResponse("/access?next=%2Faccount");
  }
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return renderAccountPage(c, account, {
      statusTone: "error",
      statusTitle: "Rotation rejected.",
      statusBody: "The form token was invalid or missing.",
    });
  }
  try {
    const { data } = await apiJson<{ clientId: string; clientSecret: string }>(c.env, "/v1/auth/credentials/rotate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: c.req.header("cookie") ?? "",
      },
      body: JSON.stringify({}),
    });
    return renderAccountPage(c, account, {
      statusTone: "success",
      statusTitle: "Machine secret rotated.",
      statusBody: "Store the new machine secret now. It is only shown once.",
      rotatedCredentials: data,
    });
  } catch (error) {
    return renderAccountPage(c, account, {
      statusTone: "error",
      statusTitle: "Rotation failed.",
      statusBody: error instanceof Error ? error.message : "The machine secret could not be rotated.",
    });
  }
});

app.get("/login/cli-complete", () => {
  return renderAuthPage(
    "CLI Login Complete",
    hero("Authenticated", "Authentication complete.", "You can close this tab and return to your terminal."),
    "CLI authentication",
  );
});

app.get("/welcome/credentials", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return redirectResponse(CANONICAL_ACCESS_PATH);
  }
  const response = await apiFetch(c.env, "/v1/auth/oauth/welcome", {
    headers: { cookie: c.req.header("cookie") ?? "" },
  });
  if (!response.ok) {
    return redirectResponse("/account");
  }
  const payload = await response.json() as { data: { clientId: string; clientSecret: string } };
  const csrf = ensureCsrfToken(c);
  const page = renderPage("Welcome", [
    hero("Welcome", "OAuth account created.", "These machine credentials are shown once after first OAuth login. The stored hash remains after this reveal and later recovery is out of scope."),
    grid("two", [
      card("Credentials", `${statRow("Client ID", payload.data.clientId)}${statRow("Client Secret", payload.data.clientSecret)}`),
      card("Next steps", "<p>Use these credentials for client_credentials and MCP flows if you need machine access later.</p><p><a href=\"/account\">Open account</a></p><p><a href=\"/access\">Return to access</a></p>"),
    ]),
    `<form method="post" action="/logout">${csrfHiddenInput(csrf.token)}<button class="secondary" type="submit">Logout</button></form>`,
  ].join(""), undefined, undefined, undefined, authShell("Welcome", "OAuth credentials"));
  const rendered = htmlResponseWithCsrf(c, page, CACHE_CONTROL_NO_STORE, 200, csrf);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    rendered.headers.append("set-cookie", setCookie);
  }
  return rendered;
});

app.get("/admin", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) {
    return admin;
  }
  return renderAdminDashboard(c, admin);
});

app.get("/admin/topics/:topicId", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) {
    return admin;
  }
  return renderAdminTopicPage(c, admin, c.req.param("topicId"));
});

app.post("/admin/actions/sweep", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) {
    return admin;
  }
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return htmlResponse(renderPage("Forbidden", hero("Admin", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
  }
  try {
    await apiJson<any>(c.env, "/v1/internal/topics/sweep", {
      method: "POST",
      headers: { cookie: c.req.header("cookie") ?? "" },
    });
  } catch (error) {
    return renderAdminDashboard(c, admin, {
      action: "topics/sweep",
      message: error instanceof Error ? error.message : "The sweep request failed.",
    });
  }
  return redirectResponse("/admin");
});

for (const action of ["reconcile-presentation", "reterminalize", "repair-scores", "open", "close"]) {
  app.post(`/admin/topics/:topicId/${action}`, async (c) => {
    const admin = await requireAdminSession(c);
    if (admin instanceof Response) {
      return admin;
    }
    const form = await c.req.formData();
    if (!assertCsrfToken(c, form)) {
      return htmlResponse(renderPage("Forbidden", hero("Admin", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
    }
    try {
      await apiJson<any>(c.env, `/v1/internal/topics/${c.req.param("topicId")}/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: c.req.header("cookie") ?? "",
        },
        body: JSON.stringify({ reason: String(form.get("reason") ?? "admin_ui"), mode: "repair" }),
      });
    } catch (error) {
      return renderAdminTopicPage(c, admin, c.req.param("topicId"), {
        action: `topics/${action}`,
        message: error instanceof Error ? error.message : "The topic action failed.",
      });
    }
    return redirectResponse(`/admin/topics/${c.req.param("topicId")}`);
  });
}

for (const action of ["release", "block"]) {
  app.post(`/admin/contributions/:contributionId/${action}`, async (c) => {
    const admin = await requireAdminSession(c);
    if (admin instanceof Response) {
      return admin;
    }
    const form = await c.req.formData();
    if (!assertCsrfToken(c, form)) {
      return htmlResponse(renderPage("Forbidden", hero("Admin", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
    }
    try {
      await apiJson<any>(c.env, `/v1/internal/contributions/${c.req.param("contributionId")}/quarantine`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: c.req.header("cookie") ?? "",
        },
        body: JSON.stringify({ action, reason: String(form.get("reason") ?? "admin_ui") }),
      });
    } catch (error) {
      return renderAdminDashboard(c, admin, {
        action: `contributions/${action}`,
        message: error instanceof Error ? error.message : "The contribution action failed.",
      });
    }
    return redirectResponse("/admin");
  });
}

app.notFound(() => htmlResponse(renderPage(
  "Not Found",
  hero("Missing", "Page not found.", "The requested router surface does not exist."),
  undefined,
  undefined,
  undefined,
  {
    variant: "top-nav-only",
    navActiveKey: null,
  },
), CACHE_CONTROL_NO_STORE, 404));

export default app;

