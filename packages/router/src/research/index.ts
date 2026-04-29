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

function findContinuation(topic: TopicRecord): TopicRecord | null {
  if (!topic.meta.continuedBy) return null;
  return getTopic(topic.meta.domain, topic.meta.continuedBy);
}
import { renderPage } from "../lib/layout.js";
import { breadcrumbs, dataBadge, hero, statRow } from "../lib/render.js";
import { KATEX_HEAD, markdownExcerpt, renderMarkdown } from "../lib/markdown.js";

type Bindings = {
  PUBLIC_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const PAPER_STYLES = `
.research-paper{max-width:780px;margin:0 auto;padding:0 1.5rem 4rem;line-height:1.65;font-size:1.02rem}
.research-paper h1{font-size:2.05rem;line-height:1.2;margin:1.5rem 0 .8rem}
.research-paper h2{margin-top:2.4rem;font-size:1.45rem}
.research-paper h3{margin-top:1.8rem;font-size:1.15rem}
.research-paper p,.research-paper ul,.research-paper ol{margin:1rem 0}
.research-paper table{width:100%;border-collapse:collapse;margin:1.4rem 0;font-size:.95rem}
.research-paper th,.research-paper td{border-bottom:1px solid var(--rule);padding:.55rem .7rem;text-align:left}
.research-paper th{font-weight:600;background:var(--surface-soft)}
.research-paper code{background:var(--surface-soft);padding:.1rem .35rem;border-radius:3px;font-size:.92em}
.research-paper pre{background:var(--surface-soft);padding:1rem;border-radius:6px;overflow-x:auto}
.research-paper pre code{background:transparent;padding:0}
.research-paper blockquote{border-left:3px solid var(--accent);margin:1.2rem 0;padding:.2rem 0 .2rem 1.1rem;color:var(--text-soft)}
.research-paper hr{border:none;border-top:1px solid var(--rule);margin:2.4rem 0}
.research-paper .math-display{display:block;text-align:center;margin:1rem 0}
.topic-meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.6rem;margin:1.4rem 0 2rem}
.topic-section-nav{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0 2rem}
.topic-section-nav a{padding:.35rem .8rem;border:1px solid var(--rule);border-radius:999px;font-size:.85rem;text-decoration:none;color:var(--text-soft)}
.topic-section-nav a:hover{border-color:var(--accent);color:var(--text)}
.topic-continuation,.topic-related{border:1px solid var(--rule);border-radius:8px;padding:14px 18px;margin:1.6rem 0;background:color-mix(in srgb,var(--surface-alt) 60%,transparent);display:flex;flex-direction:column;gap:6px}
.topic-continuation a,.topic-related a{font-family:var(--font-display);font-size:1.05rem;color:var(--text);text-decoration:none}
.topic-continuation a:hover,.topic-related a:hover{color:var(--accent)}
.topic-continuation-eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;color:var(--text-muted)}
`;

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

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const harness = meta.harness;

  const transcriptList = Object.entries(topic.transcripts)
    .map(([slug, t]) => `<li><a href="/research/${domain.slug}/${meta.slug}/transcripts/${slug}">${escapeText(t.label)}</a></li>`)
    .join("");

  const sectionNav: Array<{ label: string; href: string }> = [];
  if (topic.ledger) sectionNav.push({ label: "Ledger", href: `/research/${domain.slug}/${meta.slug}/ledger` });
  if (topic.killed) sectionNav.push({ label: "Killed claims", href: `/research/${domain.slug}/${meta.slug}/killed` });
  if (Object.keys(topic.transcripts).length) sectionNav.push({ label: "Transcripts", href: `#transcripts` });

  const navHtml = sectionNav.length
    ? `<nav class="topic-section-nav">${sectionNav.map((n) => `<a href="${escapeText(n.href)}">${escapeText(n.label)}</a>`).join("")}</nav>`
    : "";

  const harnessGrid = harness
    ? `
      <section class="topic-meta-grid">
        ${statRow("Workshop runs", String(harness.totalRuns))}
        ${statRow("Compute", `~${harness.approxComputeHours} hours`)}
        ${statRow("Verified lemmas", String(harness.distinctLemmas))}
        ${statRow("Killed claims", String(harness.killedClaims))}
        ${statRow("Dead approaches", String(harness.distinctDeadApproaches))}
      </section>
    `
    : "";

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

  const body = `
    <article class="research-paper">
      ${breadcrumbs([
        { label: "Research", href: "/research" },
        { label: domain.title, href: `/research/${domain.slug}` },
        { label: meta.title },
      ])}
      ${navHtml}
      ${relatedCallout}
      ${harnessGrid}
      ${renderMarkdown(topic.paper)}
      ${continuationCallout}
      ${transcriptList ? `<section id="transcripts"><h2>Workshop transcripts</h2><ul>${transcriptList}</ul></section>` : ""}
    </article>
  `;

  return new Response(
    renderPage(
      meta.title,
      body,
      markdownExcerpt(meta.summary, 200),
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${meta.slug}`,
        ogTitle: meta.title,
        ogDescription: markdownExcerpt(meta.summary, 200),
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "reading" },
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

  const body = `
    <article class="research-paper">
      ${breadcrumbs([
        { label: "Research", href: "/research" },
        { label: domain.title, href: `/research/${domain.slug}` },
        { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
        { label: "Ledger" },
      ])}
      ${renderMarkdown(topic.ledger)}
    </article>
  `;

  return new Response(
    renderPage(
      `Ledger — ${topic.meta.title}`,
      body,
      "Verified PROVEN/DEAD/OPEN entries across all workshop runs.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/ledger`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "reading" },
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

  const body = `
    <article class="research-paper">
      ${breadcrumbs([
        { label: "Research", href: "/research" },
        { label: domain.title, href: `/research/${domain.slug}` },
        { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
        { label: "Killed claims" },
      ])}
      ${renderMarkdown(topic.killed)}
    </article>
  `;

  return new Response(
    renderPage(
      `Killed claims — ${topic.meta.title}`,
      body,
      "False proofs caught by the verify step before they could ship.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/killed`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "reading" },
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

  const body = `
    <article class="research-paper">
      ${breadcrumbs([
        { label: "Research", href: "/research" },
        { label: domain.title, href: `/research/${domain.slug}` },
        { label: topic.meta.title, href: `/research/${domain.slug}/${topic.meta.slug}` },
        { label: transcript.label },
      ])}
      ${renderMarkdown(transcript.body)}
    </article>
  `;

  return new Response(
    renderPage(
      `${transcript.label} — ${topic.meta.title}`,
      body,
      "Workshop transcript: explore/build/verify rounds with full agent output.",
      PAPER_STYLES,
      {
        canonicalUrl: `https://opndomain.com/research/${domain.slug}/${topic.meta.slug}/transcripts/${runSlug}`,
        extraHead: KATEX_HEAD,
      },
      { navActiveKey: "research", variant: "reading" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

export default app;
