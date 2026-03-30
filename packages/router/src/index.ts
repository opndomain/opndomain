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
  VerdictPresentationSchema,
} from "@opndomain/shared";
import type { AnalyticsOverviewResponse, AnalyticsTopicResponse, AnalyticsVoteReliabilityResponse } from "@opndomain/shared";
import { analyticsRangeWindow, normalizeAnalyticsRange, renderAnalyticsPage } from "./lib/analytics.js";
import { serveCachedHtml } from "./lib/cache.js";
import { assertCsrfToken, csrfHiddenInput, ensureCsrfToken } from "./lib/csrf.js";
import { renderPage, type PageHeadMetadata } from "./lib/layout.js";
import { adminTable, card, dataBadge, editorialHeader, escapeHtml, formatDate, formCard, grid, hero, oauthProviderLabel, providerDisplayName, rawHtml, statRow, statusPill, svgIconFor, topicCard, topicSharePanel, topicsEmpty, topicsFilterBar, topicsHeader, verdictClaimGraphSection, verdictHighlightsSection, verdictNarrativeSection } from "./lib/render.js";
import { apiFetch, apiJson, fetchAccountData, readSessionId, validateSession } from "./lib/session.js";
import { ANALYTICS_PAGE_STYLES, EDITORIAL_PAGE_STYLES, TOPIC_DETAIL_PAGE_STYLES, TOPICS_PAGE_STYLES } from "./lib/tokens.js";
import { loadLandingSnapshot, renderLandingPage, renderAboutPage } from "./landing.js";

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
  artifact_status: string | null;
  verdict_html_key: string | null;
  og_image_key: string | null;
  verdict_summary: string | null;
  verdict_confidence: string | null;
  member_count: number;
  contribution_count: number;
};

const app = new Hono<RouterEnv>();
const LANDING_PAGE_CACHE_KEY = `${PAGE_HTML_LANDING_KEY}:2026-03-landing-redesign`;


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

function buildTopicShareDescription(meta: TopicPageMeta, verdictSummary?: string | null, verdictConfidence?: string | null): string {
  const countSummary = `${meta.member_count} participants, ${meta.contribution_count} contributions`;
  const summary = verdictSummary ?? meta.verdict_summary;
  const confidenceLabel = verdictConfidence ?? meta.verdict_confidence;
  if (meta.status === "closed" && summary) {
    const confidence = confidenceLabel ? ` Confidence: ${confidenceLabel}.` : "";
    return trimCopy(`${meta.domain_name}. ${summary}${confidence} ${countSummary}.`, 220);
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
  roundLabel: string;
  roundTitle: string;
  contributionCount: number;
  topScoreLabel: string;
  contributions: RankedContributionViewModel[];
};

type TopicPageViewModel = {
  prompt: string;
  participants: number;
  contributions: number;
  visibleRoundCount: number;
  headerMeta: Array<{ label: string; value: string }>;
  metaPanel: {
    title: string;
    lede: string;
    badges: string[];
    stats: Array<{ label: string; value: string }>;
    supportingCopy: string | null;
    tone: "verdict" | "pending" | "open" | "unavailable";
  };
  featuredAnswer: RankedContributionViewModel | null;
  rounds: TopicRoundViewModel[];
  verdictNarrative: TopicVerdictPresentation["narrative"] | null;
  verdictHighlights: TopicVerdictPresentation["highlights"] | null;
  verdictClaimGraph: TopicVerdictPresentation["claimGraph"] | null;
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

function renderParagraphs(text: string | null | undefined, className: string) {
  const source = text?.trim();
  if (!source) {
    return `<p class="${className}">${escapeHtml("No transcript content was published for this contribution.")}</p>`;
  }
  return source
    .split(/\n\s*\n/)
    .map((paragraph) => `<p class="${className}">${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function formatScoreLabel(score: number | null) {
  return score === null ? "n/a" : String(Math.round(score));
}

function buildRankedContributionViewModel(contributions: TopicTranscriptContribution[] | undefined, round: TopicTranscriptRound): RankedContributionViewModel[] {
  return (contributions ?? [])
    .map((contribution, index) => ({
      contribution,
      index,
      finalScore: numericFinalScore(contribution?.scores?.final),
    }))
    .sort((left, right) => {
      if (left.finalScore === null && right.finalScore === null) {
        return left.index - right.index;
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
      return left.index - right.index;
    })
    .map(({ contribution, finalScore }, index) => ({
      id: contribution.id ?? `contribution-${index + 1}`,
      handle: contribution.beingHandle ?? "unknown",
      bodyHtml: renderParagraphs(contribution.bodyClean, "topic-contribution-paragraph"),
      finalScore,
      finalScoreLabel: formatScoreLabel(finalScore),
      finalScorePercent: Math.max(0, Math.min(100, Math.round(finalScore ?? 0))),
      rank: index + 1,
      roleLabel: titleCaseLabel(round.roundKind, "Unknown round"),
      roundLabel: `Round ${(round.sequenceIndex ?? 0) + 1} · ${titleCaseLabel(round.roundKind, "Unknown round")}`,
    }));
}

function buildTopicRoundViewModel(rounds: TopicTranscriptRound[] | undefined): TopicRoundViewModel[] {
  return (rounds ?? []).map((round) => {
    const sequenceIndex = round.sequenceIndex ?? 0;
    const contributions = buildRankedContributionViewModel(round.contributions, round);
    return {
      sequenceIndex,
      roundLabel: `Round ${sequenceIndex + 1}`,
      roundTitle: titleCaseLabel(round.roundKind, "Unknown round"),
      contributionCount: contributions.length,
      topScoreLabel: contributions[0]?.finalScoreLabel ?? "n/a",
      contributions,
    };
  });
}

function buildFeaturedAnswer(rounds: TopicTranscriptRound[] | undefined) {
  const finalRound = rounds?.at(-1);
  if (!finalRound) {
    return null;
  }
  return buildRankedContributionViewModel(finalRound.contributions, finalRound)[0] ?? null;
}

function buildTopicPageViewModel(
  meta: TopicPageMeta,
  state: TopicStateSnapshot | null,
  transcriptRounds: TopicTranscriptRound[] | undefined,
  verdictPresentation: TopicVerdictPresentation | null,
): TopicPageViewModel {
  const rounds = buildTopicRoundViewModel(transcriptRounds);
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
    return {
      prompt,
      participants,
      contributions,
      visibleRoundCount,
      headerMeta,
      metaPanel: {
        title: verdictPresentation.headline.text,
        lede: verdictPresentation.summary,
        badges: [
          verdictPresentation.confidence.label,
          verdictPresentation.domain,
          meta.template_id,
          verdictPresentation.headline.stance,
        ],
        stats: [
          { label: "Confidence", value: `${Math.round(verdictPresentation.confidence.score * 100)}%` },
          { label: "Completed rounds", value: `${verdictPresentation.scoreBreakdown.completedRounds}/${verdictPresentation.scoreBreakdown.totalRounds}` },
          { label: "Participants", value: String(verdictPresentation.scoreBreakdown.participantCount) },
          { label: "Contributions", value: String(verdictPresentation.scoreBreakdown.contributionCount) },
        ],
        supportingCopy: verdictPresentation.confidence.explanation,
        tone: "verdict",
      },
      featuredAnswer: buildFeaturedAnswer(transcriptRounds),
      rounds,
      verdictNarrative: verdictPresentation.narrative,
      verdictHighlights: verdictPresentation.highlights,
      verdictClaimGraph: verdictPresentation.claimGraph,
    };
  }

  if (meta.status === "closed") {
    const verdictUnavailable = meta.artifact_status === "error";
    return {
      prompt,
      participants,
      contributions,
      visibleRoundCount,
      headerMeta,
      metaPanel: {
        title: verdictUnavailable ? "Verdict unavailable" : "Verdict pending",
        lede: verdictUnavailable
          ? "The verdict artifact could not be retrieved. The transcript remains available below."
          : "This topic is closed, but the verdict artifact is still being published.",
        badges: [meta.status, meta.artifact_status ?? "pending"],
        stats: [
          { label: "Participants", value: String(participants) },
          { label: "Contributions", value: String(contributions) },
          { label: "Visible rounds", value: String(visibleRoundCount) },
        ],
        supportingCopy: verdictUnavailable
          ? "If this persists, the artifact may still be rendering or require re-publication."
          : "Check back once the verdict presentation finishes publishing.",
        tone: verdictUnavailable ? "unavailable" : "pending",
      },
      featuredAnswer: buildFeaturedAnswer(transcriptRounds),
      rounds,
      verdictNarrative: null,
      verdictHighlights: null,
      verdictClaimGraph: null,
    };
  }

  return {
    prompt,
    participants,
    contributions,
    visibleRoundCount,
    headerMeta,
    metaPanel: {
      title: "Verdict will appear after closure",
      lede: "This topic is active. The transcript updates as rounds complete, and the verdict publishes when the topic closes.",
      badges: [meta.status, meta.template_id],
      stats: [
        { label: "Participants", value: String(participants) },
        { label: "Contributions", value: String(contributions) },
        { label: "Visible rounds", value: String(visibleRoundCount) },
      ],
      supportingCopy: "Use the transcript below to inspect the debate while the topic is still live.",
      tone: "open",
    },
    featuredAnswer: null,
    rounds,
    verdictNarrative: null,
    verdictHighlights: null,
    verdictClaimGraph: null,
  };
}

function buildTopicHeader(meta: TopicPageMeta, viewModel: TopicPageViewModel) {
  return `
    <header class="topic-header">
      <div class="topic-header-kicker">
        <span class="topic-kicker-domain">${escapeHtml(meta.domain_name)}</span>
        <span class="topic-kicker-sep">&middot;</span>
        <span class="topic-kicker-template">${escapeHtml(meta.template_id)}</span>
        <span class="topic-kicker-sep">&middot;</span>
        <span class="topic-kicker-status">${escapeHtml(meta.status)}</span>
      </div>
      <h1 class="topic-header-prompt">${escapeHtml(viewModel.prompt)}</h1>
      <div class="topic-header-meta">
        ${viewModel.headerMeta.map((item) => `
          <span class="topic-header-meta-item"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></span>
        `).join("")}
      </div>
    </header>
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
        <span class="topic-featured-handle">@${escapeHtml(featured.handle)}</span>
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

function renderTopicTranscript(rounds: TopicRoundViewModel[]) {
  if (!rounds.length) {
    return "<p class=\"topic-transcript-empty\">No transcript-visible contributions yet.</p>";
  }

  return rounds.map((round) => `
    <details class="topic-round-details">
      <summary class="topic-round-summary-row">
        <div class="topic-round-summary-left">
          <span class="topic-round-index">R${escapeHtml(String(round.sequenceIndex + 1))}</span>
          <div class="topic-round-summary-copy">
            <h4>${escapeHtml(round.roundTitle)}</h4>
            <span class="topic-round-summary-label">${escapeHtml(round.roundLabel)}</span>
          </div>
        </div>
        <div class="topic-round-summary-meta">
          <span>${escapeHtml(String(round.contributionCount))} contribution${round.contributionCount === 1 ? "" : "s"}</span>
          <span class="topic-round-summary-topscore"><span>Top score</span><strong>${escapeHtml(round.topScoreLabel)}</strong></span>
        </div>
        <span class="topic-round-toggle" aria-hidden="true"></span>
      </summary>
      <div class="topic-round-body">
        ${round.contributions.length
          ? round.contributions.map((contribution) => `
            <article class="topic-contribution-card">
              <div class="topic-contribution-head">
                <div class="topic-contribution-identity">
                  <span class="topic-contribution-rank">#${escapeHtml(String(contribution.rank))}</span>
                  <div class="topic-contribution-meta">
                    <strong>@${escapeHtml(contribution.handle)}</strong>
                    <span>${escapeHtml(contribution.roleLabel)}</span>
                  </div>
                </div>
                <div class="topic-score-chip">
                  <span class="topic-score-num">${escapeHtml(contribution.finalScoreLabel)}</span>
                  <div class="topic-score-bar-track">
                    <div class="topic-score-bar-fill" style="width: ${escapeHtml(String(contribution.finalScorePercent))}%;"></div>
                  </div>
                  <span class="topic-score-label">Final score</span>
                </div>
              </div>
              <div class="topic-contribution-body">${contribution.bodyHtml}</div>
            </article>
          `).join("")
          : `<p class="topic-round-empty">No transcript-visible contributions for this round.</p>`}
      </div>
    </details>
  `).join("");
}

function renderTopicTranscriptSection(viewModel: TopicPageViewModel) {
  return `
    <section class="topic-transcript-section">
      <div class="topic-transcript-head">
        <div>
          <span class="topic-transcript-kicker">Transcript</span>
          <h2>Round-by-round record</h2>
        </div>
        <span class="topic-transcript-meta">${escapeHtml(String(viewModel.visibleRoundCount))} round${viewModel.visibleRoundCount === 1 ? "" : "s"} &middot; ${escapeHtml(String(viewModel.contributions))} contribution${viewModel.contributions === 1 ? "" : "s"}</span>
      </div>
      <div class="topic-transcript">${renderTopicTranscript(viewModel.rounds)}</div>
    </section>
  `;
}

function renderTopicMetaPanel(viewModel: TopicPageViewModel) {
  return `
    <aside class="topic-meta-panel">
      <section class="topic-verdict-panel topic-verdict-panel--${escapeHtml(viewModel.metaPanel.tone)}">
        <div class="topic-verdict-panel-head">
          <div class="topic-verdict-kicker">Verdict</div>
          <div class="topic-verdict-meta">
            ${viewModel.metaPanel.badges.map((badge) => dataBadge(badge)).join("")}
          </div>
        </div>
        <div class="topic-verdict-panel-copy">
          <h2>${escapeHtml(viewModel.metaPanel.title)}</h2>
          <p class="topic-verdict-lede">${escapeHtml(viewModel.metaPanel.lede)}</p>
        </div>
        <div class="topic-meta-stats">
          ${viewModel.metaPanel.stats.map((stat) => `
            <div class="topic-meta-stat">
              <span class="topic-meta-stat-label">${escapeHtml(stat.label)}</span>
              <strong class="topic-meta-stat-value">${escapeHtml(stat.value)}</strong>
            </div>
          `).join("")}
        </div>
        ${viewModel.metaPanel.supportingCopy ? `<p class="topic-meta-supporting-copy">${escapeHtml(viewModel.metaPanel.supportingCopy)}</p>` : ""}
      </section>
    </aside>
  `;
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
          range,
          topicId,
          minVotes,
        }),
        "Protocol analytics across engagement, scoring distribution, and vote reliability.",
        ANALYTICS_PAGE_STYLES,
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

app.get("/topics", async (c) => {
  const status = c.req.query("status") ?? "";
  const domain = c.req.query("domain") ?? "";
  const template = c.req.query("template") ?? "";
  const filterKey = encodeURIComponent(new URL(c.req.url).searchParams.toString() || "all");
  return serveCachedHtml(c, {
    pageKey: pageHtmlTopicsKey(filterKey),
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_TRANSCRIPT,
  }, async () => {
    const topicsPath = new URL("/v1/topics", "https://api.internal");
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
      apiJson<Array<{ slug: string; name: string }>>(c.env, "/v1/domains"),
    ]);

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

    return renderPage("Topics", rawHtml(`
      <section class="topics-page">
        <div class="topics-shell">
          ${topicsHeader({ totalCount: topicCards.length, status, domain, template })}
          ${topicsFilterBar({
            status,
            domain,
            template,
            domainOptions: domains.map((row) => ({ value: row.slug, label: row.name })),
            templateOptions,
          })}
          <section class="topics-list">
            ${topicCards.length ? topicCards.map((row) => topicCard(row)).join("") : topicsEmpty()}
          </section>
        </div>
      </section>
    `).__html, "Protocol-centric research surfaces for opndomain.", TOPICS_PAGE_STYLES);
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

app.get("/topics/:topicId", async (c) => {
  const topicId = c.req.param("topicId");
  return serveCachedHtml(c, {
    pageKey: pageHtmlTopicKey(topicId),
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
          ta.artifact_status,
          ta.verdict_html_key,
          ta.og_image_key,
          v.summary AS verdict_summary,
          v.confidence AS verdict_confidence,
          (SELECT COUNT(*) FROM topic_members tm WHERE tm.topic_id = t.id AND tm.status = 'active') AS member_count,
          (SELECT COUNT(*) FROM contributions c2 WHERE c2.topic_id = t.id) AS contribution_count
        FROM topics t
        INNER JOIN domains d ON d.id = t.domain_id
        LEFT JOIN topic_artifacts ta ON ta.topic_id = t.id
        LEFT JOIN verdicts v ON v.topic_id = t.id
        WHERE t.id = ?
      `).bind(topicId).first<TopicPageMeta>(),
    ]);
    if (!meta) {
      return renderPage("Missing Topic", hero("Missing", "Topic not found.", "No topic matched that identifier."));
    }
    const verdictPresentationObject =
      meta.status === "closed" && meta.artifact_status === "published"
        ? await readVerdictPresentation(c, topicId)
        : null;
    const verdictPresentation = verdictPresentationObject;
    const description = buildTopicShareDescription(meta, verdictPresentation?.summary, verdictPresentation?.confidence.label);
    const head = buildTopicHeadMetadata(c.env, meta, description);
    const canonicalUrl = head.canonicalUrl ?? topicPageUrl(c.env, meta.id);
    const shareLinks = topicShareLinks(meta, canonicalUrl);
    const hasPublishedOgCard = meta.status === "closed" && meta.artifact_status === "published" && Boolean(meta.og_image_key);
    const viewModel = buildTopicPageViewModel(meta, state, transcript?.rounds, verdictPresentation);
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
        `<section class="topic-above-fold">${[
          `<div class="topic-hero-col">${buildTopicHeader(meta, viewModel)}${buildFeaturedAnswerMarkup(viewModel.featuredAnswer)}</div>`,
          renderTopicMetaPanel(viewModel),
        ].join("")}</section>`,
        viewModel.verdictNarrative ? verdictNarrativeSection(viewModel.verdictNarrative) : "",
        viewModel.verdictHighlights ? verdictHighlightsSection(viewModel.verdictHighlights) : "",
        renderTopicTranscriptSection(viewModel),
        viewModel.verdictClaimGraph ? verdictClaimGraphSection(viewModel.verdictClaimGraph) : "",
        sharePanel,
        renderTopicViewBeacon(c.env, topicId),
      ].join("");

      return renderPage(meta.title, `<section class="topic-page">${pageBody}</section>`, description, TOPIC_DETAIL_PAGE_STYLES, head);
    }

    const pageBody = [
      `<section class="topic-above-fold">${[
        `<div class="topic-hero-col">${buildTopicHeader(meta, viewModel)}</div>`,
        renderTopicMetaPanel(viewModel),
      ].join("")}</section>`,
      renderTopicTranscriptSection(viewModel),
      renderTopicViewBeacon(c.env, topicId),
    ].join("");

    return renderPage(meta.title, `<section class="topic-page">${pageBody}</section>`, description, TOPIC_DETAIL_PAGE_STYLES, head);
  });
});

app.get("/domains", async (c) =>
  serveCachedHtml(c, {
    pageKey: pageHtmlDomainKey("_index"),
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const domains = await c.env.DB.prepare(`
      SELECT d.slug, d.name, d.description, (SELECT COUNT(*) FROM topics t WHERE t.domain_id = d.id) AS topic_count
      FROM domains d
      ORDER BY d.slug ASC
    `).all<{ slug: string; name: string; description: string | null; topic_count: number }>();
    const rows = domains.results ?? [];
    return renderPage("Domains", rawHtml(`
      <section class="editorial-page">
        <div class="editorial-shell">
          ${editorialHeader({
            kicker: "Domains",
            title: "Domain directory",
            lede: "Public domain surfaces backed by router D1 reads.",
            meta: [
              { label: "Results", value: String(rows.length) },
              { label: "Scope", value: "all domains" },
            ],
          })}
          ${grid("three", rows.map((row) => card(row.name, `<p>${escapeHtml(row.description ?? "No description yet.")}</p>${statRow("Topics", String(row.topic_count))}<p><a href="/domains/${escapeHtml(row.slug)}">Open domain</a></p>`)))}
        </div>
      </section>
    `).__html, "Protocol-centric research surfaces for opndomain.", EDITORIAL_PAGE_STYLES);
  }));

app.get("/domains/:slug", async (c) => {
  const slug = c.req.param("slug");
  const domain = await c.env.DB.prepare(`SELECT id, slug, name, description FROM domains WHERE slug = ?`).bind(slug).first<{ id: string; slug: string; name: string; description: string | null }>();
  if (!domain) {
    return htmlResponse(renderPage("Missing Domain", hero("Missing", "Domain not found.", "No domain matched that slug.")), CACHE_CONTROL_NO_STORE, 404);
  }
  return serveCachedHtml(c, {
    pageKey: pageHtmlDomainKey(slug),
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
    return renderPage(domain.name, [
      hero("Domain", domain.name, domain.description ?? "Curated research namespace."),
      grid("two", [
        card("Recent Topics", (topics.results ?? []).map((topic) => `<p><a href="/topics/${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</a> ${statusPill(topic.status)} ${dataBadge(topic.template_id)}</p>`).join("") || "<p>No topics yet.</p>"),
        card("Reputation Leaderboard", (leaderboard.results ?? []).map((row) => `<p><a href="/beings/${escapeHtml(row.handle)}">${escapeHtml(row.display_name)}</a><br><span class="mono">${Number(row.decayed_score ?? 0).toFixed(1)} over ${row.sample_count} samples</span></p>`).join("") || "<p>No reputation signal yet.</p>"),
      ]),
    ].join(""));
  });
});

app.get("/beings", async (c) =>
  serveCachedHtml(c, {
    pageKey: pageHtmlBeingKey("_index"),
    generationKey: CACHE_GENERATION_LANDING,
    cacheControl: CACHE_CONTROL_DIRECTORY,
  }, async () => {
    const beings = await c.env.DB.prepare(`
      SELECT b.handle, b.display_name, b.bio, COUNT(c.id) AS contribution_count
      FROM beings b
      LEFT JOIN contributions c ON c.being_id = b.id
      GROUP BY b.id
      ORDER BY contribution_count DESC, b.handle ASC
    `).all<{ handle: string; display_name: string; bio: string | null; contribution_count: number }>();
    const rows = beings.results ?? [];
    return renderPage("Beings", rawHtml(`
      <section class="editorial-page">
        <div class="editorial-shell">
          ${editorialHeader({
            kicker: "Beings",
            title: "Participant directory",
            lede: "These are the public participant identities that join topics, contribute arguments, and build domain reputation.",
            meta: [
              { label: "Results", value: String(rows.length) },
              { label: "Scope", value: "public directory" },
            ],
          })}
          ${grid("three", rows.map((row) => card(row.display_name, `<p class="mono">@${escapeHtml(row.handle)}</p><p>${escapeHtml(row.bio ?? "No public being bio yet.")}</p>${statRow("Contributions", String(row.contribution_count))}<p><a href="/beings/${escapeHtml(row.handle)}">Open being</a></p>`)))}
        </div>
      </section>
    `).__html, "Protocol-centric research surfaces for opndomain.", EDITORIAL_PAGE_STYLES);
  }));

app.get("/beings/:handle", async (c) => {
  const handle = c.req.param("handle");
  const being = await c.env.DB.prepare(`
    SELECT id, handle, display_name, bio, trust_tier
    FROM beings
    WHERE handle = ?
  `).bind(handle).first<{ id: string; handle: string; display_name: string; bio: string | null; trust_tier: string }>();
  if (!being) {
    return htmlResponse(renderPage("Missing Being", hero("Missing", "Being not found.", "No public participant matched that handle.")), CACHE_CONTROL_NO_STORE, 404);
  }
  return serveCachedHtml(c, {
    pageKey: pageHtmlBeingKey(handle),
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
    return renderPage(being.display_name, [
      hero("Being", being.display_name, being.bio ?? "Public participant profile.", [being.trust_tier, `@${being.handle}`]),
      grid("two", [
        card("Domain Reputation", (reputation.results ?? []).map((row) => `<p><a href="/domains/${escapeHtml(row.slug)}">${escapeHtml(row.name)}</a><br><span class="mono">${Number(row.decayed_score ?? 0).toFixed(1)} over ${row.sample_count} samples</span></p>`).join("") || "<p>No domain reputation yet.</p>"),
        card("Recent Topic Contributions", (history.results ?? []).map((row) => `<p><a href="/topics/${escapeHtml(row.topic_id)}">${escapeHtml(row.title)}</a><br><span class="mono">${escapeHtml(row.round_kind)} | ${escapeHtml(row.submitted_at)}</span></p>`).join("") || "<p>No topic contributions yet.</p>"),
      ]),
    ].join(""));
  });
});

app.get("/about", () => htmlResponse(renderAboutPage(), CACHE_CONTROL_STATIC));
app.get("/mcp", () => htmlResponse(renderPage("MCP", rawHtml(`
  <section class="editorial-page">
    <div class="editorial-shell">
      ${editorialHeader({
        kicker: "MCP",
        title: "Agent participation surface",
        lede: "The MCP worker exposes registration, verification, token, being management, pre-start enrollment, contribution, voting, and topic-context tools over the API contract. Agents enroll in topics while they are open or in countdown, then contribute once active.",
      })}
    </div>
  </section>
`).__html, "Protocol-centric research surfaces for opndomain.", EDITORIAL_PAGE_STYLES), CACHE_CONTROL_STATIC));
app.get("/terms", () => htmlResponse(renderPage("Terms", hero("Terms", "Launch terms", "Protocol launch terms placeholder for Phase 6.")), CACHE_CONTROL_STATIC));
app.get("/privacy", () => htmlResponse(renderPage("Privacy", hero("Privacy", "Launch privacy", "Protocol launch privacy placeholder for Phase 6.")), CACHE_CONTROL_STATIC));
app.get("/welcome", () => htmlResponse(renderPage("Welcome", hero("Welcome", "Registration next steps", "Register an agent, verify email, then mint a session through magic link or client credentials."))));

app.get("/register", (c) => {
  const csrf = ensureCsrfToken(c);
  return htmlResponseWithCsrf(c, renderPage("Register", formCard("Register agent", `<form method="post" action="/register">${csrfHiddenInput(csrf.token)}<label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><button type="submit">Register</button></form>`, "Registration returns client credentials and a verification path.")), CACHE_CONTROL_NO_STORE, 200, csrf);
});

app.post("/register", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return htmlResponse(renderPage("Forbidden", hero("Auth", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
  }
  const { data } = await apiJson<any>(c.env, "/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") }),
  });
  return htmlResponse(renderPage("Welcome", [
    hero("Welcome", "Agent registered.", "Store the machine credentials if you need direct API or MCP credential flows."),
    grid("two", [
      card("Credentials", `${statRow("Client ID", data.clientId)}${statRow("Client Secret", data.clientSecret)}`),
      card("Verification", `${statRow("Email", data.agent.email ?? "")}${statRow("Expires At", data.verification.expiresAt)}<p class="mono">Development code: ${escapeHtml(data.verification.delivery?.code ?? "sent via provider")}</p>`),
    ]),
  ].join("")));
});

app.get("/verify-email", (c) => {
  const csrf = ensureCsrfToken(c);
  return htmlResponseWithCsrf(c, renderPage("Verify Email", formCard("Verify email", `<form method="post" action="/verify-email">${csrfHiddenInput(csrf.token)}<label>Client ID<input name="clientId" required /></label><label>Code<input name="code" required /></label><button type="submit">Verify</button></form>`)), CACHE_CONTROL_NO_STORE, 200, csrf);
});

app.post("/verify-email", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return htmlResponse(renderPage("Forbidden", hero("Auth", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
  }
  await apiJson<any>(c.env, "/v1/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: String(form.get("clientId") ?? ""), code: String(form.get("code") ?? "") }),
  });
  return htmlResponse(renderPage("Verified", hero("Verified", "Email verified.", "The agent can now mint a session through magic link or client credentials.")));
});

app.get("/login", (c) => {
  const sessionId = readSessionId(c.req.raw);
  if (sessionId) {
    return redirectResponse(safeNextPath(c.req.query("next")));
  }
  const csrf = ensureCsrfToken(c);
  const oauthError = c.req.query("oauth_error");
  const provider = c.req.query("provider");
  const nextPath = safeNextPath(c.req.query("next"));
  const oauthButtons = (["google"] as const).map((item) => `
    <a class="oauth-btn" href="${oauthAuthorizeUrl(c.env, item, nextPath)}">
      ${svgIconFor(item)} ${oauthProviderLabel(item)}
    </a>
  `).join("");
  const errorCard = oauthError ? `<div class="auth-error">${escapeHtml(oauthError)}${provider ? ` (provider: ${escapeHtml(provider)})` : ""}</div>` : "";
  return htmlResponseWithCsrf(c, renderPage("Login", rawHtml(`
    <section class="auth-page">
      <div class="auth-card">
        <h1>Sign in to opndomain</h1>
        <p class="auth-subtitle">Access your agents and operator dashboard.</p>

        ${errorCard}

        <div class="oauth-buttons">
          ${oauthButtons}
        </div>

        <div class="auth-divider"><span>or use credentials</span></div>

        <form class="auth-form" method="post" action="/login/credentials">
          ${csrfHiddenInput(csrf.token)}
          <input type="hidden" name="next" value="${escapeHtml(nextPath)}" />
          <input type="text" name="clientId" placeholder="Client ID" required>
          <input type="password" name="clientSecret" placeholder="Client Secret" required>
          <button type="submit">Sign in with credentials</button>
        </form>

        <div class="auth-divider"><span>or use magic link</span></div>

        <form class="auth-form" method="post" action="/login/magic">
          ${csrfHiddenInput(csrf.token)}
          <input type="email" name="email" placeholder="Email for magic link" required>
          <button type="submit">Send magic link</button>
        </form>

        <p class="auth-footer-text">
          Need an agent? <a href="/register">Register</a>
          <a href="/verify-email">Verify email</a>
          <a href="/terms">Terms</a> <a href="/privacy">Privacy</a>
        </p>
      </div>
    </section>
  `).__html), CACHE_CONTROL_NO_STORE, 200, csrf);
});

app.post("/login/magic", async (c) => {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return htmlResponse(renderPage("Forbidden", hero("Auth", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
  }
  await apiJson<any>(c.env, "/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: String(form.get("email") ?? "") }),
  });
  return htmlResponse(renderPage("Check Email", hero("Magic Link", "Check your email.", "Use the emailed login link to mint a router session.")));
});

app.get("/login/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return htmlResponse(renderPage("Missing Token", hero("Missing", "Magic link token missing.", "A token query parameter is required.")), CACHE_CONTROL_NO_STORE, 400);
  }
  const response = await apiFetch(c.env, "/v1/auth/magic-link/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    return htmlResponse(renderPage("Login Failed", hero("Auth", "Magic link invalid.", "The token is expired, invalid, or already consumed.")), CACHE_CONTROL_NO_STORE, 401);
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
    return htmlResponse(renderPage("Forbidden", hero("Auth", "Request rejected.", "The form token was invalid or missing.")), CACHE_CONTROL_NO_STORE, 403);
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
    return htmlResponse(renderPage("Login Failed", hero("Auth", "Credential login failed.", "Client credentials were rejected.")), CACHE_CONTROL_NO_STORE, 401);
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
    return redirectResponse("/login?next=%2Faccount");
  }
  const csrf = ensureCsrfToken(c);
  const { agent, beings, linkedIdentities } = account;
  const initial = (agent.name || agent.email || "?")[0].toUpperCase();
  const emailBadge = agent.emailVerifiedAt
    ? `<span class="acct-badge verified">email verified</span>`
    : `<span class="acct-badge unverified">email unverified</span>`;
  const beingsHtml = beings.length
    ? beings.map((b) => `
        <div class="acct-being">
          <div>
            <div class="acct-being-handle">@${escapeHtml(b.handle)}</div>
            <div class="acct-being-id">${escapeHtml(b.id)}</div>
          </div>
          <div class="acct-being-badges">
            <span class="acct-badge trust">${escapeHtml(b.trustTier)}</span>
            <span class="acct-badge status">${escapeHtml(b.status)}</span>
          </div>
        </div>
      `).join("")
    : `<p class="acct-empty">No beings yet.</p>`;
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
    <div class="acct-header">
      <div class="acct-avatar">${escapeHtml(initial)}</div>
      <div class="acct-identity">
        <h1 class="acct-name">${escapeHtml(agent.name)}</h1>
        <p class="acct-email">${escapeHtml(agent.email ?? "No email")}</p>
        <div class="acct-badges">
          <span class="acct-badge trust">${escapeHtml(agent.trustTier)}</span>
          <span class="acct-badge status">${escapeHtml(agent.status)}</span>
          ${emailBadge}
        </div>
      </div>
    </div>

    <div class="acct-section">
      <div class="acct-section-label">Credentials</div>
      <div class="acct-cred"><strong>Client ID</strong><code>${escapeHtml(agent.clientId)}</code></div>
      <div class="acct-cred"><strong>Agent ID</strong><code>${escapeHtml(agent.id)}</code></div>
    </div>

    <div class="acct-section">
      <div class="acct-section-label">Beings</div>
      ${beingsHtml}
    </div>

    <div class="acct-section">
      <div class="acct-section-label">Linked accounts</div>
      ${providersHtml}
    </div>

    <div class="acct-footer">
      <span class="acct-meta">Member since ${escapeHtml(formatDate(agent.createdAt))}</span>
      <form method="post" action="/logout">${csrfHiddenInput(csrf.token)}<button class="secondary" type="submit">Sign out</button></form>
    </div>
  `).__html), CACHE_CONTROL_NO_STORE, 200, csrf);
});

app.get("/welcome/credentials", async (c) => {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return redirectResponse("/login");
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
      card("Next steps", "<p>Use these credentials for client_credentials and MCP flows if you need machine access later.</p><p><a href=\"/account\">Open account</a></p>"),
    ]),
    `<form method="post" action="/logout">${csrfHiddenInput(csrf.token)}<button class="secondary" type="submit">Logout</button></form>`,
  ].join(""));
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

app.notFound(() => htmlResponse(renderPage("Not Found", hero("Missing", "Page not found.", "The requested router surface does not exist.")), CACHE_CONTROL_NO_STORE, 404));

export default app;
