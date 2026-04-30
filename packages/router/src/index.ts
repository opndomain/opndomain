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
.landing-doc{max-width:860px;margin:0 auto;padding:72px 32px 96px;font-family:var(--font-display);color:var(--text)}
.landing-eyebrow{font-family:var(--font-ui);font-size:.7rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--text-muted);margin:0 0 1rem;display:block}
.landing-title{font-family:var(--font-display);font-size:clamp(2.6rem,5vw,3.6rem);font-weight:500;line-height:1.04;letter-spacing:-0.02em;margin:0 0 1.2rem;color:var(--text)}
.landing-lede{font-family:var(--font-display);font-size:1.3rem;line-height:1.5;color:var(--text);max-width:38em;margin:0 0 1.1rem}
.landing-lede strong{color:var(--text);font-weight:600}
.landing-lede-secondary{color:var(--text-soft);font-size:1.18rem}
.landing-stats{display:flex;flex-wrap:wrap;gap:24px;margin:1.6rem 0 0;padding-top:1.4rem;border-top:1px solid var(--rule)}
.landing-stat{display:flex;flex-direction:column;gap:2px}
.landing-stat-value{font-family:var(--font-display);font-size:1.6rem;font-weight:500;color:var(--text);letter-spacing:-0.01em;line-height:1}
.landing-stat-label{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}

.landing-section{margin-top:4rem}
.landing-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:.4rem;padding-bottom:.7rem;border-bottom:1px solid var(--rule)}
.landing-section-head h2{font-family:var(--font-display);font-size:1.45rem;font-weight:600;line-height:1.2;letter-spacing:-0.01em;margin:0;color:var(--text)}
.landing-section-link{font-family:var(--font-ui);font-size:.7rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);text-decoration:none}
.landing-section-link:hover{color:var(--brand)}

.landing-paper-list,.landing-domain-list{list-style:none;padding:0;margin:0}
.landing-paper-list>li{padding:1.4rem 0;border-bottom:1px solid var(--rule)}
.landing-paper-list>li:last-child{border-bottom:0}
.landing-paper-meta{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);margin:0 0 .4rem}
.landing-paper-list h3{font-family:var(--font-display);font-size:1.3rem;font-weight:500;line-height:1.25;margin:0 0 .4rem;letter-spacing:-0.005em}
.landing-paper-list h3 a{color:var(--text);text-decoration:none}
.landing-paper-list h3 a:hover{color:var(--brand)}
.landing-paper-sub{font-style:italic;color:var(--text-soft);margin:0 0 .5rem;font-size:1.02rem;font-family:var(--font-display)}
.landing-paper-summary{color:var(--text-soft);font-size:1.02rem;line-height:1.6;font-family:var(--font-display);margin:.4rem 0 .6rem}
.landing-paper-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:.5rem}

.landing-domain-list>li{padding:1rem 0;border-bottom:1px solid var(--rule);display:flex;align-items:baseline;gap:1.4rem}
.landing-domain-list>li:last-child{border-bottom:0}
.landing-domain-name{font-family:var(--font-display);font-size:1.15rem;font-weight:500;color:var(--text);text-decoration:none;flex:0 0 130px;letter-spacing:-0.005em}
.landing-domain-name:hover{color:var(--brand)}
.landing-domain-blurb{color:var(--text-soft);font-size:1rem;line-height:1.55;flex:1;font-family:var(--font-display)}
.landing-domain-count{font-family:var(--font-ui);font-size:.66rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap}

.landing-method-card{margin-top:1rem;padding:1.4rem 1.6rem;border:1px solid var(--rule);background:var(--surface);font-family:var(--font-display);font-size:1.05rem;line-height:1.6;color:var(--text-soft)}
.landing-method-card strong{color:var(--text);font-weight:500}
.landing-method-card a{color:var(--brand);text-decoration:none;font-family:var(--font-ui);font-size:.72rem;font-weight:500;letter-spacing:.14em;text-transform:uppercase;display:inline-block;margin-top:.6rem}
.landing-method-card a:hover{text-decoration:underline}

@media (max-width:720px){
  .landing-doc{padding:48px 20px 72px}
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

function landingPaperItem(topic: TopicRecord): string {
  const stats: string[] = [];
  if (topic.meta.harness) {
    stats.push(`${topic.meta.harness.totalRuns} runs`);
    stats.push(`${topic.meta.harness.distinctLemmas} lemmas`);
    if (topic.meta.harness.killedClaims > 0) stats.push(`${topic.meta.harness.killedClaims} killed`);
  }
  return `
    <li>
      <p class="landing-paper-meta">${escapeText(topic.meta.domain)} · ${escapeText(topic.meta.status)}</p>
      <h3><a href="/research/${escapeText(topic.meta.domain)}/${escapeText(topic.meta.slug)}">${escapeText(topic.meta.title)}</a></h3>
      ${topic.meta.subtitle ? `<p class="landing-paper-sub">${escapeText(topic.meta.subtitle)}</p>` : ""}
      <p class="landing-paper-summary">${escapeText(markdownExcerpt(topic.meta.summary, 240))}</p>
      ${stats.length ? `<div class="landing-paper-stats">${stats.map((s) => `<span class="data-badge">${escapeText(s)}</span>`).join("")}</div>` : ""}
    </li>
  `;
}

app.get("/", (c) => {
  const recent = listRecentTopics(6);
  const allTopics = listAllTopics();
  const totalRuns = allTopics.reduce((s, t) => s + (t.meta.harness?.totalRuns ?? 0), 0);
  const totalKilled = allTopics.reduce((s, t) => s + (t.meta.harness?.killedClaims ?? 0), 0);
  const totalLemmas = allTopics.reduce((s, t) => s + (t.meta.harness?.distinctLemmas ?? 0), 0);

  const paperList = recent.length
    ? `<ul class="landing-paper-list">${recent.map(landingPaperItem).join("")}</ul>`
    : `<p class="landing-paper-summary">No papers published yet.</p>`;

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
    <article class="landing-doc">
      <span class="landing-eyebrow">Frontier AI research · Verified output</span>
      <h1 class="landing-title">opndomain</h1>
      <p class="landing-lede"><strong>opndomain is not a list of solved open problems.</strong> It is a system that produces verified structural analysis of hard problems — faster than any human team could, across domains, with honest scope and transparent methodology.</p>
      <p class="landing-lede landing-lede-secondary">That is what pushing the limits of AI research on frontier topics actually looks like: not false breakthroughs, but proofs of what's true, what's dead, and exactly where the remaining gaps live — at a pace and rigor that didn't exist before.</p>

      <div class="landing-stats">
        <div class="landing-stat"><span class="landing-stat-value">${totalRuns}</span><span class="landing-stat-label">Workshop runs</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${totalLemmas}</span><span class="landing-stat-label">Verified lemmas</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${totalKilled}</span><span class="landing-stat-label">False proofs caught</span></div>
        <div class="landing-stat"><span class="landing-stat-value">${allTopics.length}</span><span class="landing-stat-label">Topics</span></div>
      </div>

      <section class="landing-section">
        <div class="landing-section-head">
          <h2>Latest research</h2>
          <a class="landing-section-link" href="/research">All research →</a>
        </div>
        ${paperList}
      </section>

      <section class="landing-section">
        <div class="landing-section-head">
          <h2>Domains</h2>
        </div>
        ${domainList}
      </section>

      <section class="landing-section">
        <div class="landing-section-head">
          <h2>Method</h2>
          <a class="landing-section-link" href="/method">Read the essay →</a>
        </div>
        <div class="landing-method-card">
          Each workshop run executes <strong>explore → build → verify</strong> with a persistent ledger that prevents re-derivation of dead approaches. False proofs are tagged DEAD with the killing argument inline; only PROVEN entries reach the synthesized paper.
          <br>
          <a href="/method">How the harness works</a>
        </div>
      </section>
    </article>
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
