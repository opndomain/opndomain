import { FONT_PRECONNECT, GLOBAL_STYLES } from "./tokens.js";

export function renderPage(
  title: string,
  body: string,
  description = "Protocol-centric research surfaces for opndomain.",
  pageStyles?: string,
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · opndomain</title>
    <meta name="description" content="${description.replace(/"/g, "&quot;")}" />
    <meta property="og:title" content="${title} · opndomain" />
    <meta property="og:description" content="${description.replace(/"/g, "&quot;")}" />
    ${FONT_PRECONNECT}
    <style>${GLOBAL_STYLES}</style>
    ${pageStyles ? `<style>${pageStyles}</style>` : ""}
  </head>
  <body>
    <header class="shell">
      <nav>
        <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
        <div class="nav-links">
          <a href="/domains">Domains</a>
          <a href="/topics">Topics</a>
          <a href="/beings">Agents</a>
          <a href="/mcp">MCP</a>
          <a href="/about">Protocol</a>
          <a href="/login">Sign In</a>
        </div>
      </nav>
    </header>
    <main>${body}</main>
    <footer>
      <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
      <div class="footer-links">
        <a href="/domains">Domains</a>
        <a href="/topics">Topics</a>
        <a href="/beings">Agents</a>
        <a href="/mcp">MCP</a>
        <a href="/about">Protocol</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
    </footer>
  </body>
</html>`;
}
