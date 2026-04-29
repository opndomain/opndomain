import { Hono } from "hono";
import { CACHE_CONTROL_PORTFOLIO } from "@opndomain/shared";
import { renderPage } from "./lib/layout.js";
import { breadcrumbs, dataBadge, hero } from "./lib/render.js";
import { listAllTopics, listRecentTopics } from "./content/index.js";
import { markdownExcerpt } from "./lib/markdown.js";
import researchRoutes from "./research/index.js";

type Bindings = {
  PUBLIC_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

const LANDING_STYLES = `
.landing-pitch{max-width:720px;margin:0 auto;padding:0 1.5rem 2rem;text-align:center}
.landing-pitch p{font-size:1.1rem;line-height:1.6;color:var(--text-soft)}
.landing-recent{max-width:1080px;margin:2.4rem auto 0;padding:0 1.5rem}
.landing-recent h2{margin-bottom:1rem;font-size:1.2rem;letter-spacing:.02em;text-transform:uppercase;color:var(--text-soft)}
.method-page{max-width:780px;margin:0 auto;padding:0 1.5rem 4rem;line-height:1.65}
.method-page h2{margin-top:2.4rem;font-size:1.4rem}
.method-page h3{margin-top:1.6rem;font-size:1.1rem}
`;

app.get("/", (c) => {
  const recent = listRecentTopics(3);
  const cards = recent
    .map(
      (topic) => `
        <a class="card card-link" href="/research/${topic.meta.domain}/${topic.meta.slug}">
          <div class="card-eyebrow">${topic.meta.domain} · ${topic.meta.status}</div>
          <h3>${topic.meta.title}</h3>
          ${topic.meta.subtitle ? `<p class="card-sub">${topic.meta.subtitle}</p>` : ""}
          <p class="card-summary">${markdownExcerpt(topic.meta.summary, 200)}</p>
          ${
            topic.meta.harness
              ? `<div class="card-stats">${dataBadge(`${topic.meta.harness.totalRuns} runs`)}${dataBadge(`${topic.meta.harness.distinctLemmas} lemmas`)}${topic.meta.harness.killedClaims > 0 ? dataBadge(`${topic.meta.harness.killedClaims} killed`) : ""}</div>`
              : ""
          }
        </a>
      `,
    )
    .join("");

  const body = `
    ${hero(
      "AI research workshop",
      "opndomain",
      "Multi-model research harnesses produce papers and transcripts with the verify step on. The output is here.",
    )}
    <section class="landing-pitch">
      <p>Each topic on this site went through explore / build / verify cycles with a persistent ledger. False proofs are caught and surfaced — they don't ship.</p>
    </section>
    ${
      recent.length
        ? `
        <section class="landing-recent">
          <h2>Latest</h2>
          <div class="grid two">${cards}</div>
        </section>
      `
        : ""
    }
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

  const body = `
    <article class="method-page">
      ${breadcrumbs([{ label: "Method" }])}
      ${hero("Method", "How the harness works", "Explore, build, verify — with a persistent ledger that prevents re-derivation and a verify step that kills false claims before they ship.")}

      <h2>The loop</h2>
      <p>Each workshop run executes:</p>
      <ol>
        <li><strong>Explore</strong>: each persona proposes an approach without seeing the others' output.</li>
        <li><strong>Build</strong>: personas extend the strongest thread sequentially. Each sees prior work and the running ledger.</li>
        <li><strong>Verify</strong>: every claim is audited and tagged <code>PROVEN</code>, <code>DEAD</code>, or <code>OPEN</code> with a concrete reason — counterexample, logical gap, or precise statement.</li>
        <li><strong>Iterate</strong>: if fatal flaws are found, return to Build with the critique incorporated.</li>
        <li><strong>Synthesize</strong>: final pass produces the self-contained writeup. Only PROVEN entries reach the paper.</li>
      </ol>

      <h2>The ledger</h2>
      <p>A persistent markdown file tracks PROVEN results, DEAD approaches with explicit counterexample, and OPEN questions. Personas read the ledger instead of the full transcript — same context, far less drift, no re-derivation of dead approaches.</p>

      <h2>The kill rule</h2>
      <p>If a verify pass finds a fatal flaw in a proposed proof, the proof is marked DEAD and recorded in the ledger with the killing argument inline. The synthesis pass refuses to import any DEAD entry. This is the load-bearing piece — without it, plausible-but-wrong proofs leak into the synthesis layer.</p>
      <p>Killed claims are surfaced on each topic's <em>Killed claims</em> page rather than buried, because they are the methodology proof point.</p>

      <h2>Personas, not models</h2>
      <p>Workshops vary the model behind each persona run-to-run. Sometimes three distinct models (Codex, Claude, Grok) play three personas. Sometimes a single high-reasoning model plays all three under different prompts. The structural property — adversarial reading, persistent ledger, verify pass — is what matters.</p>

      <h2>Output to date</h2>
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
      body,
      "How the AI research harness works: explore, build, verify, with a persistent PROVEN/DEAD/OPEN ledger.",
      LANDING_STYLES,
      { canonicalUrl: "https://opndomain.com/method" },
      { navActiveKey: "method" },
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
