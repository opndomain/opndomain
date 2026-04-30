import { Hono } from "hono";
import { CACHE_CONTROL_PORTFOLIO } from "@opndomain/shared";
import { renderPage } from "./lib/layout.js";
import { breadcrumbs, hero, renderPaperLayout, renderPaperToc, type PaperTocItem } from "./lib/render.js";
import { DOMAINS, listAllTopics, listRecentTopics, listTopicsInDomain, type TopicRecord } from "./content/index.js";
import { markdownExcerpt } from "./lib/markdown.js";
import researchRoutes from "./research/index.js";

type Bindings = {
  PUBLIC_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const LANDING_STYLES = `
.landing-wrap{max-width:1100px;margin:0 auto;padding:0 32px}
.landing-statbar{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:0 0 56px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.landing-statbar--bottom{margin:72px 0 0}
.landing-statbar .landing-stat{display:flex;flex-direction:column;gap:6px;padding:18px 28px;border-right:1px solid var(--rule)}
.landing-statbar .landing-stat:last-child{border-right:0}
.landing-statbar .landing-stat-value{font-family:var(--font-display);font-size:2rem;font-weight:500;color:var(--text);letter-spacing:-0.015em;line-height:1}
.landing-statbar .landing-stat-label{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}

.landing-doc{max-width:860px;margin:0 auto;padding:56px 0 0;font-family:var(--font-display);color:var(--text)}

.landing-section{margin-top:3.6rem}
.landing-section--latest{margin-top:0}
.landing-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:.6rem;padding-bottom:.7rem;border-bottom:2px solid var(--text)}
.landing-section--latest .landing-section-head{border-bottom-color:var(--brand)}
.landing-section-head h2{font-family:var(--font-ui);font-size:.72rem;font-weight:600;line-height:1.2;letter-spacing:.18em;text-transform:uppercase;margin:0;color:var(--text)}
.landing-section-link{font-family:var(--font-ui);font-size:.7rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);text-decoration:none}
.landing-section-link:hover{color:var(--brand)}

.landing-feature{padding:1.6rem 0 2rem;border-bottom:1px solid var(--rule);margin-bottom:0}
.landing-feature-meta{font-family:var(--font-ui);font-size:.7rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);margin:0 0 .8rem;display:flex;gap:14px;flex-wrap:wrap}
.landing-feature-meta .meta-current{color:var(--brand);font-weight:600}
.landing-feature-title{font-family:var(--font-display);font-size:clamp(1.7rem,2.6vw,2.2rem);font-weight:500;line-height:1.12;letter-spacing:-0.015em;margin:0 0 .9rem;color:var(--text)}
.landing-feature-title a{color:var(--text);text-decoration:none}
.landing-feature-title a:hover{color:var(--brand)}
.landing-feature-sub{font-family:var(--font-display);font-style:italic;color:var(--text-soft);margin:0 0 .9rem;font-size:1.18rem;line-height:1.5;max-width:38em}
.landing-feature-summary{color:var(--text);font-size:1.05rem;line-height:1.6;font-family:var(--font-display);margin:.6rem 0 1rem;max-width:42em}
.landing-feature-cta{display:flex;align-items:center;gap:18px;margin-top:1rem}
.landing-feature-cta-link{font-family:var(--font-ui);font-size:.72rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--brand);text-decoration:none}
.landing-feature-cta-link:hover{text-decoration:underline}
.landing-feature-stats{display:flex;flex-wrap:wrap;gap:8px}

.landing-paper-list,.landing-domain-list{list-style:none;padding:0;margin:0}
.landing-paper-list>li{padding:1.2rem 0;border-bottom:1px solid var(--rule)}
.landing-paper-list>li:last-child{border-bottom:0}
.landing-paper-meta{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);margin:0 0 .35rem}
.landing-paper-list h3{font-family:var(--font-display);font-size:1.2rem;font-weight:500;line-height:1.25;margin:0 0 .35rem;letter-spacing:-0.005em}
.landing-paper-list h3 a{color:var(--text);text-decoration:none}
.landing-paper-list h3 a:hover{color:var(--brand)}
.landing-paper-sub{font-style:italic;color:var(--text-soft);margin:0 0 .4rem;font-size:.98rem;font-family:var(--font-display)}
.landing-paper-summary{color:var(--text-soft);font-size:.98rem;line-height:1.55;font-family:var(--font-display);margin:.3rem 0 .5rem}
.landing-paper-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:.4rem}

.landing-domain-list>li{padding:.85rem 0;border-bottom:1px solid var(--rule);display:flex;align-items:baseline;gap:1.4rem}
.landing-domain-list>li:last-child{border-bottom:0}
.landing-domain-name{font-family:var(--font-display);font-size:1.1rem;font-weight:500;color:var(--text);text-decoration:none;flex:0 0 130px;letter-spacing:-0.005em}
.landing-domain-name:hover{color:var(--brand)}
.landing-domain-blurb{color:var(--text-soft);font-size:.98rem;line-height:1.55;flex:1;font-family:var(--font-display)}
.landing-domain-count{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap}

@media (max-width:820px){
  .landing-statbar{grid-template-columns:repeat(2,1fr)}
  .landing-statbar .landing-stat:nth-child(2){border-right:0}
  .landing-statbar .landing-stat:nth-child(-n+2){border-bottom:1px solid var(--rule)}
}
@media (max-width:720px){
  .landing-wrap{padding:0 20px}
  .landing-statbar{margin-bottom:36px}
  .landing-statbar .landing-stat{padding:14px 18px}
  .landing-statbar .landing-stat-value{font-size:1.6rem}
  .landing-doc{padding:36px 0 0}
  .landing-domain-list>li{flex-direction:column;gap:.3rem}
  .landing-domain-name{flex:none}
}
`;

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function landingPaperStats(topic: TopicRecord): string[] {
  const stats: string[] = [];
  if (topic.meta.harness) {
    stats.push(`${topic.meta.harness.totalRuns} runs`);
    stats.push(`${topic.meta.harness.distinctLemmas} lemmas`);
    if (topic.meta.harness.killedClaims > 0) stats.push(`${topic.meta.harness.killedClaims} killed`);
  }
  return stats;
}

function landingPaperItem(topic: TopicRecord): string {
  const stats = landingPaperStats(topic);
  return `
    <li>
      <p class="landing-paper-meta">${escapeText(topic.meta.domain)} · ${escapeText(topic.meta.status)}</p>
      <h3><a href="/research/${escapeText(topic.meta.domain)}/${escapeText(topic.meta.slug)}">${escapeText(topic.meta.title)}</a></h3>
      ${topic.meta.subtitle ? `<p class="landing-paper-sub">${escapeText(topic.meta.subtitle)}</p>` : ""}
      <p class="landing-paper-summary">${escapeText(markdownExcerpt(topic.meta.summary, 200))}</p>
      ${stats.length ? `<div class="landing-paper-stats">${stats.map((s) => `<span class="data-badge">${escapeText(s)}</span>`).join("")}</div>` : ""}
    </li>
  `;
}

function landingFeatureItem(topic: TopicRecord): string {
  const stats = landingPaperStats(topic);
  const href = `/research/${escapeText(topic.meta.domain)}/${escapeText(topic.meta.slug)}`;
  return `
    <article class="landing-feature">
      <p class="landing-feature-meta">
        <span class="meta-current">Current paper</span>
        <span>${escapeText(topic.meta.domain)}</span>
        <span>${escapeText(topic.meta.status)}</span>
        <span>${escapeText(topic.meta.lastUpdatedAt)}</span>
      </p>
      <h3 class="landing-feature-title"><a href="${href}">${escapeText(topic.meta.title)}</a></h3>
      ${topic.meta.subtitle ? `<p class="landing-feature-sub">${escapeText(topic.meta.subtitle)}</p>` : ""}
      <p class="landing-feature-summary">${escapeText(markdownExcerpt(topic.meta.summary, 320))}</p>
      <div class="landing-feature-cta">
        <a class="landing-feature-cta-link" href="${href}">Read the paper →</a>
        ${stats.length ? `<div class="landing-feature-stats">${stats.map((s) => `<span class="data-badge">${escapeText(s)}</span>`).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

app.get("/", (c) => {
  const recent = listRecentTopics(6);
  const allTopics = listAllTopics();
  const totalRuns = allTopics.reduce((s, t) => s + (t.meta.harness?.totalRuns ?? 0), 0);
  const totalKilled = allTopics.reduce((s, t) => s + (t.meta.harness?.killedClaims ?? 0), 0);
  const totalLemmas = allTopics.reduce((s, t) => s + (t.meta.harness?.distinctLemmas ?? 0), 0);

  const featured = recent[0];
  const remaining = recent.slice(1);
  const paperList = remaining.length
    ? `<ul class="landing-paper-list">${remaining.map(landingPaperItem).join("")}</ul>`
    : "";

  const domainList = `
    <ul class="landing-domain-list">
      ${DOMAINS.map((d) => {
        const count = listTopicsInDomain(d.slug).length;
        const label = `${count} ${count === 1 ? "topic" : "topics"}`;
        return `
          <li>
            <a class="landing-domain-name" href="/research/${escapeText(d.slug)}">${escapeText(d.title)}</a>
            <span class="landing-domain-blurb">${escapeText(d.blurb)}</span>
            <span class="landing-domain-count">${escapeText(label)}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;

  const body = `
    <div class="landing-wrap">
      <article class="landing-doc">
        <section class="landing-section landing-section--latest">
          <div class="landing-section-head">
            <h2>Latest</h2>
            <a class="landing-section-link" href="/research">All research →</a>
          </div>
          ${featured ? landingFeatureItem(featured) : ""}
          ${paperList}
        </section>

        <section class="landing-section">
          <div class="landing-section-head">
            <h2>Domains</h2>
          </div>
          ${domainList}
        </section>
      </article>

      <div class="landing-statbar landing-statbar--bottom">
        <div class="landing-stat"><span class="landing-stat-value">${totalRuns}</span><span class="landing-stat-label">Workshop runs</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${totalLemmas}</span><span class="landing-stat-label">Verified lemmas</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${totalKilled}</span><span class="landing-stat-label">False proofs caught</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${allTopics.length}</span><span class="landing-stat-label">Topics</span></div>
      </div>
    </div>
  `;

  return new Response(
    renderPage(
      "opndomain",
      body,
      "AI research workshop output: papers, transcripts, and the harness that produces them.",
      LANDING_STYLES,
      { canonicalUrl: "https://opndomain.com/" },
      { variant: "landing" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.route("/research", researchRoutes);

app.get("/method", (c) => {
  const all = listAllTopics();
  const totalRuns = all.reduce((s, t) => s + (t.meta.harness?.totalRuns ?? 0), 0);
  const totalKilled = all.reduce((s, t) => s + (t.meta.harness?.killedClaims ?? 0), 0);
  const totalLemmas = all.reduce((s, t) => s + (t.meta.harness?.distinctLemmas ?? 0), 0);

  const tocItems: PaperTocItem[] = [
    { href: "#abstract", label: "Abstract", icon: "format_indent_increase" },
    { href: "#loop", label: "The loop", icon: "format_indent_increase" },
    { href: "#ledger", label: "The ledger", icon: "format_indent_increase" },
    { href: "#kill-rule", label: "The kill rule", icon: "format_indent_increase" },
    { href: "#personas", label: "Personas, not models", icon: "format_indent_increase" },
    { href: "#output", label: "Output to date", icon: "format_indent_increase" },
  ];
  const tocExtras: PaperTocItem[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/research", label: "All research", icon: "collections_bookmark" },
  ];
  const tocSidebar = renderPaperToc({
    eyebrow: "Contents",
    meta: "Method",
    items: tocItems,
    extras: tocExtras,
  });

  const articleBody = `
    <article class="research-paper method-page">
      <div class="paper-categories">
        <span class="paper-category-pill">Method</span>
      </div>
      <h1>How the harness works</h1>
      <p><strong>Explore · Build · Verify</strong> Updated April 29, 2026</p>

      <h2 id="abstract">Abstract</h2>
      <aside class="paper-abstract">
        <p>A persistent ledger that prevents re-derivation, and a verify step that kills false claims before they ship. Personas vary run-to-run; the structure does not.</p>
      </aside>

      <h2 id="loop">1. The loop</h2>
      <p>Each workshop run executes:</p>
      <ol>
        <li><strong>Explore</strong>: each persona proposes an approach without seeing the others' output.</li>
        <li><strong>Build</strong>: personas extend the strongest thread sequentially. Each sees prior work and the running ledger.</li>
        <li><strong>Verify</strong>: every claim is audited and tagged <code>PROVEN</code>, <code>DEAD</code>, or <code>OPEN</code> with a concrete reason — counterexample, logical gap, or precise statement.</li>
        <li><strong>Iterate</strong>: if fatal flaws are found, return to Build with the critique incorporated.</li>
        <li><strong>Synthesize</strong>: final pass produces the self-contained writeup. Only PROVEN entries reach the paper.</li>
      </ol>

      <h2 id="ledger">2. The ledger</h2>
      <p>A persistent markdown file tracks PROVEN results, DEAD approaches with explicit counterexample, and OPEN questions. Personas read the ledger instead of the full transcript — same context, far less drift, no re-derivation of dead approaches.</p>

      <h2 id="kill-rule">3. The kill rule</h2>
      <p>If a verify pass finds a fatal flaw in a proposed proof, the proof is marked DEAD and recorded in the ledger with the killing argument inline. The synthesis pass refuses to import any DEAD entry. This is the load-bearing piece — without it, plausible-but-wrong proofs leak into the synthesis layer.</p>
      <p>Killed claims are surfaced on each topic's <em>Killed claims</em> page rather than buried, because they are the methodology proof point.</p>

      <h2 id="personas">4. Personas, not models</h2>
      <p>Workshops vary the model behind each persona run-to-run. Sometimes three distinct models (Codex, Claude, Grok) play three personas. Sometimes a single high-reasoning model plays all three under different prompts. The structural property — adversarial reading, persistent ledger, verify pass — is what matters.</p>

      <h2 id="output">5. Output to date</h2>
      <ul>
        <li>${totalRuns} workshop runs</li>
        <li>${totalLemmas} distinct verified lemmas</li>
        <li>${totalKilled} false proofs caught by verify</li>
      </ul>
      <p>See <a href="/research">Research</a> for the per-topic output.</p>
    </article>
  `;

  return new Response(
    renderPage(
      "Method",
      renderPaperLayout(tocSidebar, articleBody),
      "How the AI research harness works: explore, build, verify, with a persistent PROVEN/DEAD/OPEN ledger.",
      LANDING_STYLES,
      { canonicalUrl: "https://opndomain.com/method" },
      { navActiveKey: "method", variant: "paper" },
    ),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO } },
  );
});

app.notFound((c) =>
  new Response(
    renderPage(
      "Not found",
      `${breadcrumbs([{ label: "Not found" }])}${hero("404", "Not found", "That page isn't here.")}`,
      "Page not found.",
    ),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  ),
);

export default app;
