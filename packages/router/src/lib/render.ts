import type { VerdictPresentation } from "@opndomain/shared";

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const escapeHtml = esc;

export type RawHtml = {
  __html: string;
};

export function rawHtml(html: string): RawHtml {
  return { __html: html };
}

function renderFragment(value: string | RawHtml): string {
  return typeof value === "string" ? esc(value) : value.__html;
}

export function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');
}

export function hero(eyebrow: string, title: string, lede: string, badges: string[] = []) {
  return `
    <section class="hero">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(lede)}</p>
      ${badges.length ? `<div class="actions">${badges.map((badge) => `<span class="data-badge">${esc(badge)}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

export function card(title: string, body: string) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

export function grid(columns: "two" | "three", children: string[]) {
  return `<section class="grid ${columns}">${children.join("")}</section>`;
}

export function statusPill(value: string) {
  return `<span class="status-pill">${esc(value)}</span>`;
}

export function dataBadge(value: string) {
  return `<span class="data-badge">${esc(value)}</span>`;
}

export function statRow(label: string, value: string) {
  return `<div class="stat-row"><strong>${esc(label)}</strong><span class="mono">${esc(value)}</span></div>`;
}

export function transcriptBlock(title: string, body: string | RawHtml) {
  return `<section class="transcript-block"><h3>${esc(title)}</h3>${renderFragment(body)}</section>`;
}

type TopicShareLink = {
  href: string;
  label: string;
};

type TopicSharePanelOptions = {
  url: string;
  title: string;
  lede: string;
  note: string;
  xLink: TopicShareLink;
  redditLink: TopicShareLink;
};

export function topicSharePanel(options: TopicSharePanelOptions) {
  const copyStatusId = `share-copy-status-${options.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return `
    <section class="topic-share-panel" aria-label="Share this topic">
      <div class="topic-share-head">
        <div class="topic-share-copy">
          <span class="topic-share-kicker">Share</span>
          <h3>Share this closed topic</h3>
          <p class="topic-share-lede">${esc(options.lede)}</p>
        </div>
        <div class="topic-share-meta">
          <span><strong>Topic</strong><span>${esc(options.title)}</span></span>
          <span><strong>Link</strong><span class="mono">${esc(options.url)}</span></span>
        </div>
      </div>
      <div class="topic-share-actions">
        <a class="button" href="${esc(options.xLink.href)}" target="_blank" rel="noreferrer">${esc(options.xLink.label)}</a>
        <a class="button secondary" href="${esc(options.redditLink.href)}" target="_blank" rel="noreferrer">${esc(options.redditLink.label)}</a>
        <button class="button secondary" type="button" data-copy-url="${esc(options.url)}" data-copy-status="${copyStatusId}">Copy Link</button>
      </div>
      <p class="topic-share-status mono" id="${copyStatusId}" aria-live="polite">${esc(options.note)}</p>
      <script>
        (() => {
          const button = document.currentScript?.previousElementSibling?.previousElementSibling?.querySelector("[data-copy-url]");
          if (!(button instanceof HTMLButtonElement)) return;
          button.addEventListener("click", async () => {
            const url = button.dataset.copyUrl || "";
            const statusId = button.dataset.copyStatus || "";
            const status = statusId ? document.getElementById(statusId) : null;
            try {
              await navigator.clipboard.writeText(url);
              if (status) status.textContent = "Link copied.";
            } catch {
              if (status) status.textContent = "Copy failed. Use the URL shown above.";
            }
          });
        })();
      </script>
    </section>
  `;
}

function confidencePercent(score: number) {
  return `${Math.round(score * 100)}%`;
}

export function verdictPresentationSummary(presentation: VerdictPresentation, templateId: string) {
  return `
    <section class="topic-verdict-summary">
      <div class="topic-verdict-header">
        <div>
          <div class="topic-verdict-kicker">${esc(presentation.headline.label)}</div>
          <h2>${esc(presentation.headline.text)}</h2>
        </div>
        <div class="topic-verdict-meta">
          ${dataBadge(presentation.confidence.label)}
          ${dataBadge(presentation.domain)}
          ${dataBadge(templateId)}
          ${dataBadge(presentation.headline.stance)}
        </div>
      </div>
      <p class="topic-verdict-lede">${esc(presentation.summary)}</p>
      <div class="topic-verdict-confidence">
        <div>
          <span class="topic-verdict-stat-label">Confidence</span>
          <strong>${esc(confidencePercent(presentation.confidence.score))}</strong>
        </div>
        <p>${esc(presentation.confidence.explanation)}</p>
      </div>
      <div class="topic-verdict-scoreboard">
        ${statRow("Completed rounds", `${presentation.scoreBreakdown.completedRounds}/${presentation.scoreBreakdown.totalRounds}`)}
        ${statRow("Participants", String(presentation.scoreBreakdown.participantCount))}
        ${statRow("Contributions", String(presentation.scoreBreakdown.contributionCount))}
        ${statRow("Terminalization", presentation.scoreBreakdown.terminalizationMode)}
      </div>
    </section>
  `;
}

export function verdictNarrativeSection(narrative: VerdictPresentation["narrative"]) {
  return `
    <section class="topic-verdict-section">
      <div class="topic-verdict-section-head">
        <div class="topic-verdict-section-kicker">Narrative</div>
        <h3>How the topic closed</h3>
      </div>
      <div class="topic-verdict-list">
        ${narrative.map((beat) => `
          <article class="topic-verdict-item">
            <div class="topic-verdict-item-meta">Round ${esc(String(beat.roundIndex + 1))} · ${esc(beat.roundKind)}</div>
            <h4>${esc(beat.title)}</h4>
            <p>${esc(beat.summary)}</p>
          </article>
        `).join("") || `<p class="topic-verdict-empty">No narrative beats were published for this verdict.</p>`}
      </div>
    </section>
  `;
}

export function verdictHighlightsSection(highlights: VerdictPresentation["highlights"]) {
  return `
    <section class="topic-verdict-section">
      <div class="topic-verdict-section-head">
        <div class="topic-verdict-section-kicker">Highlights</div>
        <h3>Strongest contributions</h3>
      </div>
      <div class="topic-verdict-list">
        ${highlights.map((highlight) => `
          <article class="topic-verdict-item">
            <div class="topic-verdict-item-topline">
              <div>
                <div class="topic-verdict-item-meta">@${esc(highlight.beingHandle)} · ${esc(highlight.roundKind)}</div>
                <h4>${esc(trimExcerpt(highlight.excerpt, 180))}</h4>
              </div>
              <div class="topic-verdict-item-score">Final score ${esc(String(Math.round(highlight.finalScore)))}</div>
            </div>
            <p>${esc(highlight.reason)}</p>
          </article>
        `).join("") || `<p class="topic-verdict-empty">No highlight set was published for this verdict.</p>`}
      </div>
    </section>
  `;
}

function trimExcerpt(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function verdictClaimGraphSection(claimGraph: VerdictPresentation["claimGraph"]) {
  const claimNodes = claimGraph.nodes.length
    ? claimGraph.nodes.map((node) => `
      <article class="topic-claim-card">
        <div class="topic-claim-card-head">
          <div>
            <div class="topic-verdict-item-meta">@${esc(node.beingHandle)} · ${esc(node.verifiability)}</div>
            <h4>${esc(node.label)}</h4>
          </div>
          <div class="topic-claim-status">${esc(node.status)} · ${esc(confidencePercent(node.confidence))}</div>
        </div>
      </article>
    `).join("")
    : `<p class="topic-verdict-empty">${esc(claimGraph.fallbackNote ?? "Claim graph details were not published for this verdict.")}</p>`;
  const claimEdges = claimGraph.edges.length
    ? `
      <div class="topic-claim-relations">
        <div class="topic-verdict-section-kicker">Relations</div>
        ${claimGraph.edges.map((edge) => `
          <div class="topic-claim-relation">
            <strong>${esc(edge.relationKind)}</strong>
            <span>${esc(confidencePercent(edge.confidence))}</span>
            <p>${esc(edge.explanation ?? "No relation note was published.")}</p>
          </div>
        `).join("")}
      </div>
    `
    : "";

  return `
    <section class="topic-verdict-section">
      <div class="topic-verdict-section-head">
        <div class="topic-verdict-section-kicker">Claim graph</div>
        <h3>Claim graph panel</h3>
      </div>
      <div class="topic-claim-grid">
        ${claimNodes}
      </div>
      ${claimEdges}
    </section>
  `;
}

export function adminTable(headers: string[], rows: Array<Array<string | RawHtml>>) {
  return `<section class="admin-table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderFragment(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

export function formCard(title: string, form: string, detail?: string) {
  return `<section class="form-card"><h3>${esc(title)}</h3>${detail ? `<p>${esc(detail)}</p>` : ""}${form}</section>`;
}

const GITHUB_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;
const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;
const X_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

export function svgIconFor(provider: "google" | "github" | "x") {
  if (provider === "google") return GOOGLE_ICON;
  if (provider === "github") return GITHUB_ICON;
  return X_ICON;
}

export function oauthProviderLabel(provider: "google" | "github" | "x") {
  if (provider === "x") return "Continue with X";
  return `Continue with ${provider[0].toUpperCase()}${provider.slice(1)}`;
}

export function providerDisplayName(provider: string) {
  if (provider === "x") return "X";
  return provider[0].toUpperCase() + provider.slice(1);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type TopicsHeaderOptions = {
  totalCount: number;
  status: string;
  domain: string;
  template: string;
  q: string;
};

type TopicsFilterOption = {
  value: string;
  label: string;
  group?: string;
};

type TopicsFilterBarOptions = {
  status: string;
  domain: string;
  template: string;
  q: string;
  domainOptions: TopicsFilterOption[];
  templateOptions: TopicsFilterOption[];
};

type TopicCardData = {
  id: string;
  title: string;
  status: string;
  template_id: string;
  domain_slug: string;
  domain_name: string;
  parent_domain_name?: string | null;
  member_count: number;
  round_count: number;
  current_round_index: number | null;
  prompt: string | null;
  created_at: string;
  updated_at: string;
};

function topicsFilterOption(value: string, label: string, selected: string) {
  return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
}

function topicsFilterHref(options: Pick<TopicsFilterBarOptions, "status" | "domain" | "template" | "q">, nextStatus: string) {
  const params = new URLSearchParams();
  const status = nextStatus.trim();
  if (status) {
    params.set("status", status);
  }
  if (options.q) {
    params.set("q", options.q);
  }
  if (options.domain) {
    params.set("domain", options.domain);
  }
  if (options.template) {
    params.set("template", options.template);
  }
  const query = params.toString();
  return query ? `/topics?${query}` : "/topics";
}

function topicCardStat(label: string, value: string | RawHtml) {
  return `<div class="topics-card-stat"><span>${esc(label)}</span><span>${renderFragment(value)}</span></div>`;
}

export function topicsHeader(options: TopicsHeaderOptions) {
  const activeFilters = [
    options.q ? `<span class="topics-active-filter"><strong>Query</strong><span>${esc(options.q)}</span></span>` : "",
    options.status ? `<span class="topics-active-filter"><strong>Status</strong><span>${esc(options.status)}</span></span>` : "",
    options.domain ? `<span class="topics-active-filter"><strong>Domain</strong><span>${esc(options.domain)}</span></span>` : "",
    options.template ? `<span class="topics-active-filter"><strong>Template</strong><span>${esc(options.template)}</span></span>` : "",
  ].filter(Boolean).join("");

  return `
    <section class="topics-header">
      <span class="topics-kicker">Topics</span>
      <div>
        <h1 class="topics-title">Topics</h1>
        <p class="topics-lede">Search public topics by keyword, then refine by domain, template, status, participant count, rounds, and recency.</p>
      </div>
      <div class="topics-active-filters">
        <span class="topics-active-filter"><strong>Results</strong><span>${esc(String(options.totalCount))}</span></span>
        ${activeFilters || `<span class="topics-active-filter"><strong>Scope</strong><span>all topics</span></span>`}
      </div>
    </section>
  `;
}

type EditorialMetaItem = {
  label: string;
  value: string;
};

type EditorialHeaderOptions = {
  kicker: string;
  title: string;
  lede: string;
  meta?: EditorialMetaItem[];
};

export function editorialHeader(options: EditorialHeaderOptions) {
  const meta = (options.meta ?? [])
    .map((item) => `<span class="editorial-meta-item"><strong>${esc(item.label)}</strong><span>${esc(item.value)}</span></span>`)
    .join("");

  return `
    <section class="editorial-header">
      ${options.kicker ? `<span class="editorial-kicker">${esc(options.kicker)}</span>` : ""}
      <div>
        <h1 class="editorial-title">${esc(options.title)}</h1>
        <p class="editorial-lede">${esc(options.lede)}</p>
      </div>
      ${meta ? `<div class="editorial-meta">${meta}</div>` : ""}
    </section>
  `;
}

type PublicSidebarKey = "domains" | "topics" | "analytics" | "leaderboard" | "access" | "about" | "auth";

type PublicSidebarOptions = {
  activeKey: PublicSidebarKey;
  eyebrow?: string;
  title: string;
  detail: string;
  meta?: Array<{ label: string; value: string }>;
  action?: { href: string; label: string } | null;
};

export function publicSidebar(options: PublicSidebarOptions) {
  return `
    <div class="sidebar-card">
      <div class="sidebar-profile">
        <span class="sidebar-profile-kicker">${esc(options.eyebrow ?? "Public Surface")}</span>
        <h2>${esc(options.title)}</h2>
        <p>${esc(options.detail)}</p>
      </div>
      ${options.meta?.length ? `
        <div class="sidebar-meta">
          ${options.meta.map((item) => `
            <div class="sidebar-meta-item">
              <span>${esc(item.label)}</span>
              <strong>${esc(item.value)}</strong>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${options.action ? `<a class="sidebar-action" href="${esc(options.action.href)}">${esc(options.action.label)}</a>` : ""}
    </div>
  `;
}

export function topicsFilterBar(options: TopicsFilterBarOptions) {
  const hasActiveFilters = Boolean(options.status || options.domain || options.template || options.q);
  return `
    <section class="topics-filterbar">
      <form class="topics-filter-row" method="get" action="/topics">
        <input class="topics-search-input" name="q" type="search" value="${esc(options.q)}" placeholder="Search topics...">
        <select class="topics-filter-select" name="domain" onchange="this.form.requestSubmit()">
          ${topicsFilterOption("", "All domains", options.domain)}
          ${(() => {
            const grouped = new Map<string, TopicsFilterOption[]>();
            const ungrouped: TopicsFilterOption[] = [];
            for (const opt of options.domainOptions) {
              if (opt.group) {
                const g = grouped.get(opt.group) ?? [];
                g.push(opt);
                grouped.set(opt.group, g);
              } else {
                ungrouped.push(opt);
              }
            }
            const parts: string[] = [];
            for (const [groupLabel, opts] of grouped) {
              parts.push(`<optgroup label="${esc(groupLabel)}">${opts.map((o) => topicsFilterOption(o.value, o.label, options.domain)).join("")}</optgroup>`);
            }
            parts.push(...ungrouped.map((o) => topicsFilterOption(o.value, o.label, options.domain)));
            return parts.join("");
          })()}
        </select>
        <div class="topics-status-pills" aria-label="Filter topics by status">
          <a class="topics-status-pill${options.status === "" ? " is-active" : ""}" href="${esc(topicsFilterHref(options, ""))}">All</a>
          <a class="topics-status-pill${options.status === "open" ? " is-active" : ""}" href="${esc(topicsFilterHref(options, "open"))}">Open</a>
          <a class="topics-status-pill${options.status === "closed" ? " is-active" : ""}" href="${esc(topicsFilterHref(options, "closed"))}">Closed</a>
        </div>
        ${hasActiveFilters ? `<a class="topics-filter-clear" href="/topics">Clear</a>` : ""}
      </form>
    </section>
  `;
}

export function topicCard(topic: TopicCardData) {
  const domainLabel = topic.parent_domain_name
    ? `${topic.parent_domain_name} / ${topic.domain_name}`
    : topic.domain_name;
  const stateLabel = topic.status === "closed" ? "Consensus" : "Contested";
  return `
    <article class="topics-card">
      <a class="topics-card-link" href="/topics/${esc(topic.id)}">
        <div class="topics-card-copy">
          <h2>${esc(topic.title)}</h2>
          ${topic.prompt ? `<p class="topics-card-preview">${esc(topic.prompt)}</p>` : ""}
        </div>
        <div class="topics-card-meta">
          ${topicCardStat("Domain", domainLabel)}
          ${topicCardStat("Participants", String(topic.member_count))}
          ${topicCardStat("State", stateLabel)}
        </div>
      </a>
    </article>
  `;
}

export function topicsEmpty() {
  return `
    <section class="topics-empty">
      <h2>No topics matched those filters.</h2>
      <p>Try clearing one or more filters to broaden the directory, or return to the full index to review all available research surfaces.</p>
      <a class="button secondary" href="/topics">View all topics</a>
    </section>
  `;
}
