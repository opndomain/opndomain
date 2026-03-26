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
};

type TopicsFilterOption = {
  value: string;
  label: string;
};

type TopicsFilterBarOptions = {
  status: string;
  domain: string;
  template: string;
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

function topicCardStat(label: string, value: string | RawHtml) {
  return `<div class="topics-card-stat"><span>${esc(label)}</span><span>${renderFragment(value)}</span></div>`;
}

export function topicsHeader(options: TopicsHeaderOptions) {
  const activeFilters = [
    options.status ? `<span class="topics-active-filter"><strong>Status</strong>${esc(options.status)}</span>` : "",
    options.domain ? `<span class="topics-active-filter"><strong>Domain</strong>${esc(options.domain)}</span>` : "",
    options.template ? `<span class="topics-active-filter"><strong>Template</strong>${esc(options.template)}</span>` : "",
  ].filter(Boolean).join("");

  return `
    <section class="topics-header">
      <span class="topics-kicker">Topics</span>
      <div>
        <h1 class="topics-title">Research topics, not dashboard bubbles.</h1>
        <p class="topics-lede">Browse active and archived research prompts with the metadata operators actually need: domain, template, participant count, rounds, and recency.</p>
      </div>
      <div class="topics-active-filters">
        <span class="topics-active-filter"><strong>Results</strong>${esc(String(options.totalCount))}</span>
        ${activeFilters || `<span class="topics-active-filter"><strong>Scope</strong>all topics</span>`}
      </div>
    </section>
  `;
}

export function topicsFilterBar(options: TopicsFilterBarOptions) {
  return `
    <section class="topics-filterbar">
      <form class="topics-filter-form" method="get" action="/topics">
        <div class="topics-filter-field">
          <label for="topics-status">Status</label>
          <select id="topics-status" name="status">
            ${topicsFilterOption("", "All statuses", options.status)}
            ${topicsFilterOption("open", "Open", options.status)}
            ${topicsFilterOption("closed", "Closed", options.status)}
          </select>
        </div>
        <div class="topics-filter-field">
          <label for="topics-domain">Domain</label>
          <select id="topics-domain" name="domain">
            ${topicsFilterOption("", "All domains", options.domain)}
            ${options.domainOptions.map((option) => topicsFilterOption(option.value, option.label, options.domain)).join("")}
          </select>
        </div>
        <div class="topics-filter-field">
          <label for="topics-template">Template</label>
          <select id="topics-template" name="template">
            ${topicsFilterOption("", "All templates", options.template)}
            ${options.templateOptions.map((option) => topicsFilterOption(option.value, option.label, options.template)).join("")}
          </select>
        </div>
        <div class="topics-filter-actions">
          <button type="submit">Apply filters</button>
          <a class="button secondary" href="/topics">Reset</a>
        </div>
      </form>
    </section>
  `;
}

export function topicCard(topic: TopicCardData) {
  const prompt = topic.prompt?.trim() || "No prompt excerpt is available for this topic yet.";
  const currentRound = topic.current_round_index === null ? "Not started" : `Round ${topic.current_round_index + 1}`;
  return `
    <article class="topics-card">
      <div class="topics-card-head">
        <div class="topics-card-copy">
          <span class="topics-card-eyebrow">${esc(topic.template_id)}</span>
          <h2><a href="/topics/${esc(topic.id)}">${esc(topic.title)}</a></h2>
          <p>${esc(prompt)}</p>
        </div>
        <div class="topics-card-state"><strong>${esc(topic.status)}</strong>${esc(currentRound)}</div>
      </div>
      <div class="topics-card-meta">
        ${topicCardStat("Domain", rawHtml(`<a href="/domains/${esc(topic.domain_slug)}">${esc(topic.domain_name)}</a>`))}
        ${topicCardStat("Participants", String(topic.member_count))}
        ${topicCardStat("Rounds", String(topic.round_count))}
        ${topicCardStat("Updated", formatDate(topic.updated_at))}
        ${topicCardStat("Created", formatDate(topic.created_at))}
        ${topicCardStat("Topic ID", rawHtml(`<span class="mono">${esc(topic.id)}</span>`))}
      </div>
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
