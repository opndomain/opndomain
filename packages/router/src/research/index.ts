import { Hono } from "hono";
import { CACHE_CONTROL_PORTFOLIO, type ResearchDomain } from "@opndomain/shared";
import {
  DOMAINS,
  getDomain,
  getTopic,
  listAllTopics,
  listTopicsInDomain,
  type DomainMeta,
  type TopicRecord,
} from "../content/index.js";
import { renderPage } from "../lib/layout.js";
import { breadcrumbs, dataBadge, hero, renderPaperLayout, renderPaperToc, type PaperTocItem } from "../lib/render.js";
import { KATEX_HEAD, markdownExcerpt, renderMarkdown } from "../lib/markdown.js";

type Bindings = {
  PUBLIC_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const PAPER_STYLES = `
.topic-meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));column-gap:2.4rem;row-gap:0;margin:1.4rem 0 2.4rem;padding:1.2rem 1.6rem;border:1px solid var(--rule);background:var(--surface-alt)}
.topic-meta-grid .stat-row{border-bottom:0;padding:.5rem 0}
.topic-meta-grid .stat-row strong{font-size:.66rem;letter-spacing:.14em}

.topic-continuation,.topic-related{border:0;border-left:3px solid var(--brand);border-radius:0;padding:.4rem 0 .4rem 1.2rem;margin:2rem 0;background:transparent;display:flex;flex-direction:column;gap:6px}
.topic-continuation a,.topic-related a{font-family:var(--font-display);font-size:1.15rem;font-weight:600;color:var(--text);text-decoration:none}
.topic-continuation a:hover,.topic-related a:hover{color:var(--brand)}
.topic-continuation-eyebrow{font-family:var(--font-ui);text-transform:uppercase;letter-spacing:.16em;font-size:.66rem;font-weight:500;color:var(--text-muted)}

.transcripts-section{margin-top:3rem;padding-top:1.4rem;border-top:1px solid var(--rule)}
.transcripts-section h2{margin-top:0;font-size:1.3rem}
.transcripts-section ul{list-style:none;padding:0;margin:0}
.transcripts-section li{padding:.55rem 0;border-bottom:1px solid var(--rule);margin:0}
.transcripts-section li:last-child{border-bottom:0}
.transcripts-section a{font-family:var(--font-display);font-size:1.05rem;color:var(--text);text-decoration:none}
.transcripts-section a:hover{color:var(--brand)}
`;

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeText(value);
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return base || "section";
}

type TocEntry = { id: string; label: string };

function processPaperHtml(html: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const seen = new Set<string>();

  let processed = html.replace(/<h2(?![^>]*\sid=)([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    const baseSlug = slugify(text);
    let slug = baseSlug;
    let i = 2;
    while (seen.has(slug)) {
      slug = `${baseSlug}-${i++}`;
    }
    seen.add(slug);
    toc.push({ id: slug, label: text });
    return `<h2 id="${slug}"${attrs}>${inner}</h2>`;
  });

  processed = processed.replace(
    /(<h2 id="abstract"[^>]*>[^<]*<\/h2>)\s*((?:<p>[\s\S]*?<\/p>\s*)+?)(?=<(?:h[1-6]|hr|aside|section|div))/i,
    (_m, heading, body) => `${heading}<aside class="paper-abstract">${body}</aside>`,
  );

  return { html: processed, toc };
}

function buildTopicToc(opts: {
  topicTitle: string;
  pageKind: string;
  toc: TocEntry[];
  extras: PaperTocItem[];
}): string {
  return renderPaperToc({
    eyebrow: "Contents",
    meta: `${opts.pageKind} · ${opts.topicTitle}`,
    items: opts.toc.map((e) => ({ href: `#${e.id}`, label: e.label, icon: "format_indent_increase" })),
    extras: opts.extras,
  });
}

function topicCard(topic: TopicRecord): string {
  const stats: string[] = [];
  if (topic.meta.harness) {
    stats.push(`${topic.meta.harness.totalRuns} runs`);
    stats.push(`${topic.meta.harness.distinctLemmas} lemmas`);
    if (topic.meta.harness.killedClaims > 0) {
      stats.push(`${topic.meta.harness.killedClaims} killed claims`);
    }
  }
  return `
    <a class="card card-link" href="/research/${topic.meta.domain}/${topic.meta.slug}">
      <div class="card-eyebrow">${escapeText(topic.meta.domain)} · ${escapeText(topic.meta.status)}</div>
      <h3>${escapeText(topic.meta.title)}</h3>
      ${topic.meta.subtitle ? `<p class="card-sub">${escapeText(topic.meta.subtitle)}</p>` : ""}
      <p class="card-summary">${escapeText(markdownExcerpt(topic.meta.summary, 220))}</p>
      ${stats.length ? `<div class="card-stats">${stats.map((s) => dataBadge(s)).join("")}</div>` : ""}
    </a>
  `;
}

function domainCard(domain: DomainMeta, topicCount: number): string {
  return `
    <a class="card card-link" href="/research/${domain.slug}">
      <h3>${escapeText(domain.title)}</h3>
      <p class="card-summary">${escapeText(domain.blurb)}</p>
      <div class="card-stats">${dataBadge(`${topicCount} ${topicCount === 1 ? "topic" : "topics"}`)}</div>
    </a>
  `;
}

function findContinuation(topic: TopicRecord): TopicRecord | null {
  if (!topic.meta.continuedBy) return null;
  return getTopic(topic.meta.domain, topic.meta.continuedBy);
}

function topicExtras(topic: TopicRecord, domain: DomainMeta, currentKey: string): Array<{ href: string; label: string; icon?: string; active?: boolean }> {
  const base = `/research/${domain.slug}/${topic.meta.slug}`;
  const out: Array<{ href: string; label: string; icon?: string; active?: boolean }> = [
    { href: base, label: "Paper", icon: "description", active: currentKey === "paper" },
  ];
  if (topic.ledger) out.push({ href: `${base}/ledger`, label: "Ledger", icon: "list_alt", active: currentKey === "ledger" });
  if (topic.killed) out.push({ href: `${base}/killed`, label: "Killed claims", icon: "block", active: currentKey === "killed" });
  for (const [slug, t] of Object.entries(topic.transcripts)) {
    out.push({
      href: `${base}/transcripts/${slug}`,
      label: t.label,
      icon: "forum",
      active: currentKey === `transcript:${slug}`,
    });
  }
  return out;
}

app.get("/", (c) => {
  const cards = DOMAINS.map((d) => domainCard(d, listTopicsInDomain(d.slug).length)).join("");
  const recent = listAllTopics();
  const recentSection = recent.length
    ? `
      <section class="domain-recent">
        <h2>Latest</h2>
        <div class="grid two">${recent.map(topicCard).join("")}</div>
      </section>
    `
    : "";
  const body = `
    ${breadcrumbs([{ label: "Research" }])}
    ${hero("Research", "Domains", "Math, science, economics, finance.")}
    <div class="grid two">${cards}</div>
    ${recentSection}
  `;
  return new Response(
    renderPage(
      "Research",
      body,
      "Research portfolio across math, science, economics, and finance.",
      PAPER_STYLES,
      { canonicalUrl: "https://opndomain.com/research" },
      { navActiveKey: "research" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.get("/:domain", (c) => {
  const domainSlug = c.req.param("domain");
  const domain = getDomain(domainSlug);
  if (!domain) return c.notFound();
  const topics = listTopicsInDomain(domain.slug);
  const list = topics.length
    ? `<div class="grid two">${topics.map(topicCard).join("")}</div>`
    : `<section class="card"><p>No topics published in ${escapeText(domain.title)} yet.</p></section>`;
  const body = `
    ${breadcrumbs([{ label: "Research", href: "/research" }, { label: domain.title }])}
    ${hero(domain.title, `Topics in ${domain.title.toLowerCase()}`, domain.blurb)}
    ${list}
  `;
  return new Response(
    renderPage(
      `${domain.title} research`,
      body,
      `${domain.title} research topics on opndomain.`,
      PAPER_STYLES,
      { canonicalUrl: `https://opndomain.com/research/${domain.slug}` },
      { navActiveKey: "research" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.get("/:domain/:topic", (c) => {
  const domainSlug = c.req.param("domain");
  const topicSlug = c.req.param("topic");
  const domain = getDomain(domainSlug);
  const topic = getTopic(domainSlug, topicSlug);
  if (!domain || !topic) return c.notFound();

  const meta = topic.meta;

  const continuation = findContinuation(topic);
  const continuationCallout = continuation
    ? `<aside class="topic-continuation">
        <div class="topic-continuation-eyebrow">Continued in</div>
        <a href="/research/${continuation.meta.domain}/${continuation.meta.slug}">${escapeText(continuation.meta.title)}</a>
      </aside>`
    : "";

  const relatedCallout = (meta.relatedTopics ?? []).length
    ? `<aside class="topic-related">
        <div class="topic-continuation-eyebrow">Builds on</div>
        ${(meta.relatedTopics ?? []).map((r) => `<a href="/research/${r.domain}/${r.slug}">${escapeText(r.label)}</a>`).join("")}
      </aside>`
    : "";

  const { html: paperHtml, toc } = processPaperHtml(renderMarkdown(topic.paper));

  const tocSidebar = buildTopicToc({
    topicTitle: meta.title,
    pageKind: "Paper",
    toc,
    extras: topicExtras(topic, domain, "paper"),
  });

  const articleBody = `
    ${breadcrumbs([
      { label: "Research", href: "/research" },
      { label: domain.title, href: `/research/${domain.slug}` },
      { label: meta.title },
    ])}
    <article class="research-paper">
      <div class="paper-categories">
        <span class="paper-category-pill">${escapeText(domain.title)}</span>
        <span class="paper-category-pill">${escapeText(meta.status)}</span>
      </div>
      ${relatedCallout}
      ${paperHtml}
      ${continuationCallout}
    </article>
  `;

  return new Response(
    renderPage(
      meta.title,
      renderPaperLayout(tocSidebar, articleBody),
      markdownExcerpt(meta.summary, 200),
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${meta.slug}`,
        ogTitle: meta.title,
        ogDescription: markdownExcerpt(meta.summary, 200),
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "paper" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.get("/:domain/:topic/ledger", (c) => {
  const domainSlug = c.req.param("domain");
  const topicSlug = c.req.param("topic");
  const domain = getDomain(domainSlug);
  const topic = getTopic(domainSlug, topicSlug);
  if (!domain || !topic || !topic.ledger) return c.notFound();

  const { html: paperHtml, toc } = processPaperHtml(renderMarkdown(topic.ledger));
  const tocSidebar = buildTopicToc({
    topicTitle: topic.meta.title,
    pageKind: "Ledger",
    toc,
    extras: topicExtras(topic, domain, "ledger"),
  });

  const articleBody = `
    ${breadcrumbs([
      { label: "Research", href: "/research" },
      { label: domain.title, href: `/research/${domain.slug}` },
      { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
      { label: "Ledger" },
    ])}
    <article class="research-paper">
      <div class="paper-categories">
        <span class="paper-category-pill">${escapeText(domain.title)}</span>
        <span class="paper-category-pill">Ledger</span>
      </div>
      ${paperHtml}
    </article>
  `;

  return new Response(
    renderPage(
      `Ledger — ${topic.meta.title}`,
      renderPaperLayout(tocSidebar, articleBody),
      "Verified PROVEN/DEAD/OPEN entries across all workshop runs.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/ledger`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "paper" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.get("/:domain/:topic/killed", (c) => {
  const domainSlug = c.req.param("domain");
  const topicSlug = c.req.param("topic");
  const domain = getDomain(domainSlug);
  const topic = getTopic(domainSlug, topicSlug);
  if (!domain || !topic || !topic.killed) return c.notFound();

  const { html: paperHtml, toc } = processPaperHtml(renderMarkdown(topic.killed));
  const tocSidebar = buildTopicToc({
    topicTitle: topic.meta.title,
    pageKind: "Killed claims",
    toc,
    extras: topicExtras(topic, domain, "killed"),
  });

  const articleBody = `
    ${breadcrumbs([
      { label: "Research", href: "/research" },
      { label: domain.title, href: `/research/${domain.slug}` },
      { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
      { label: "Killed claims" },
    ])}
    <article class="research-paper">
      <div class="paper-categories">
        <span class="paper-category-pill">${escapeText(domain.title)}</span>
        <span class="paper-category-pill">Killed claims</span>
      </div>
      ${paperHtml}
    </article>
  `;

  return new Response(
    renderPage(
      `Killed claims — ${topic.meta.title}`,
      renderPaperLayout(tocSidebar, articleBody),
      "False proofs caught by the verify step before they could ship.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/killed`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "paper" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.get("/:domain/:topic/transcripts/:run", (c) => {
  const domainSlug = c.req.param("domain");
  const topicSlug = c.req.param("topic");
  const runSlug = c.req.param("run");
  const domain = getDomain(domainSlug);
  const topic = getTopic(domainSlug, topicSlug);
  if (!domain || !topic) return c.notFound();
  const transcript = topic.transcripts[runSlug];
  if (!transcript) return c.notFound();

  const { html: paperHtml, toc } = processPaperHtml(renderMarkdown(transcript.body));
  const tocSidebar = buildTopicToc({
    topicTitle: topic.meta.title,
    pageKind: "Transcript",
    toc,
    extras: topicExtras(topic, domain, `transcript:${runSlug}`),
  });

  const articleBody = `
    ${breadcrumbs([
      { label: "Research", href: "/research" },
      { label: domain.title, href: `/research/${domain.slug}` },
      { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
      { label: transcript.label },
    ])}
    <article class="research-paper">
      <div class="paper-categories">
        <span class="paper-category-pill">${escapeText(domain.title)}</span>
        <span class="paper-category-pill">Transcript</span>
      </div>
      ${paperHtml}
    </article>
  `;

  return new Response(
    renderPage(
      `${transcript.label} — ${topic.meta.title}`,
      renderPaperLayout(tocSidebar, articleBody),
      "Workshop transcript: explore/build/verify rounds with full agent output.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/transcripts/${runSlug}`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "paper" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

export default app;
