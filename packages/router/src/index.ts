import { Hono } from "hono";
import { CACHE_CONTROL_PORTFOLIO } from "@opndomain/shared";
import { renderPage } from "./lib/layout.js";
import { hero } from "./lib/render.js";

type Bindings = {
  PUBLIC_CACHE?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  const body = `
    ${hero(
      "AI research workshop",
      "opndomain",
      "Papers, transcripts, and the harness that produces them.",
    )}
    <section class="card">
      <p>The portfolio is being rebuilt. The Frankl writeup will land here first; other domains follow.</p>
      <p><a href="/research">Browse research →</a></p>
    </section>
  `;
  return new Response(renderPage("opndomain", body, undefined, undefined, undefined, { variant: "landing" }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO },
  });
});

app.get("/research", (c) => {
  const body = `
    ${hero("Research", "Domains", "Math, science, economics, finance.")}
    <section class="card"><p>Topic listings land here once the content layout is wired up.</p></section>
  `;
  return new Response(renderPage("Research", body, undefined, undefined, undefined, { navActiveKey: "research" }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO },
  });
});

app.get("/method", (c) => {
  const body = `
    ${hero("Method", "How the harness works", "Explore, build, verify. Repeat with a persistent ledger.")}
    <section class="card"><p>Methodology page lands here next.</p></section>
  `;
  return new Response(renderPage("Method", body, undefined, undefined, undefined, { navActiveKey: "method" }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": CACHE_CONTROL_PORTFOLIO },
  });
});

app.notFound((c) =>
  new Response(
    renderPage(
      "Not found",
      `${hero("404", "Not found", "That page isn't here.")}`,
      "Page not found.",
    ),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  ),
);

export default app;
