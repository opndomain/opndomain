import { FONT_PRECONNECT, GLOBAL_STYLES } from "./tokens.js";

export type PageHeadMetadata = {
  canonicalUrl?: string;
  ogType?: string;
  ogUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImageUrl?: string;
  twitterImageAlt?: string;
};

export type PageShellOptions = {
  footer?: string | null;
  footerClassName?: string;
};

function escapeHeadContent(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMetaTag(attribute: "name" | "property", key: string, value: string | undefined): string {
  if (!value) {
    return "";
  }
  return `<meta ${attribute}="${escapeHeadContent(key)}" content="${escapeHeadContent(value)}" />`;
}

export function renderPage(
  title: string,
  body: string,
  description = "Protocol-centric research surfaces for opndomain.",
  pageStyles?: string,
  head?: PageHeadMetadata,
  shell?: PageShellOptions,
) {
  const pageTitle = `${title} | opndomain`;
  const metaDescription = description;
  const ogTitle = head?.ogTitle ?? pageTitle;
  const ogDescription = head?.ogDescription ?? metaDescription;
  const twitterTitle = head?.twitterTitle ?? ogTitle;
  const twitterDescription = head?.twitterDescription ?? ogDescription;
  const ogImageUrl = head?.ogImageUrl;
  const twitterImageUrl = head?.twitterImageUrl ?? ogImageUrl;
  const twitterCard = head?.twitterCard ?? (twitterImageUrl ? "summary_large_image" : "summary");
  const footerClassName = shell?.footerClassName ? ` class="${escapeHeadContent(shell.footerClassName)}"` : "";
  const footerContent = shell?.footer === undefined
    ? `
      <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
      <div class="footer-links">
        <a href="/domains">Domains</a>
        <a href="/topics">Topics</a>
        <a href="/analytics">Analytics</a>
        <a href="/beings">Beings</a>
        <a href="/mcp">MCP</a>
        <a href="/about">Protocol</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
    `
    : shell.footer;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHeadContent(pageTitle)}</title>
    <meta name="description" content="${escapeHeadContent(metaDescription)}" />
    ${head?.canonicalUrl ? `<link rel="canonical" href="${escapeHeadContent(head.canonicalUrl)}" />` : ""}
    ${renderMetaTag("property", "og:site_name", "opndomain")}
    ${renderMetaTag("property", "og:type", head?.ogType ?? "website")}
    ${renderMetaTag("property", "og:url", head?.ogUrl ?? head?.canonicalUrl)}
    ${renderMetaTag("property", "og:title", ogTitle)}
    ${renderMetaTag("property", "og:description", ogDescription)}
    ${renderMetaTag("property", "og:image", ogImageUrl)}
    ${renderMetaTag("property", "og:image:type", ogImageUrl ? "image/png" : undefined)}
    ${renderMetaTag("property", "og:image:alt", head?.ogImageAlt)}
    ${renderMetaTag("name", "twitter:card", twitterCard)}
    ${renderMetaTag("name", "twitter:title", twitterTitle)}
    ${renderMetaTag("name", "twitter:description", twitterDescription)}
    ${renderMetaTag("name", "twitter:image", twitterImageUrl)}
    ${renderMetaTag("name", "twitter:image:alt", head?.twitterImageAlt ?? head?.ogImageAlt)}
    ${FONT_PRECONNECT}
    <style>${GLOBAL_STYLES}</style>
    ${pageStyles ? `<style>${pageStyles}</style>` : ""}
    <noscript><style>[data-animate]{opacity:1!important;transform:none!important}</style></noscript>
  </head>
  <body>
    <div class="shell-frame" aria-hidden="true">
      <div class="shell-glow shell-glow-left"></div>
      <div class="shell-glow shell-glow-right"></div>
    </div>
    <header class="shell">
      <nav>
        <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
        <div class="nav-links">
          <a href="/domains">Domains</a>
          <a href="/topics">Topics</a>
          <a href="/analytics">Analytics</a>
          <a href="/beings">Beings</a>
          <a href="/mcp">MCP</a>
          <a href="/about">Protocol</a>
          <a href="/login">Sign In</a>
        </div>
      </nav>
    </header>
    <main>${body}</main>
    <script>(function(){if(!('IntersectionObserver'in window)){document.querySelectorAll('[data-animate]').forEach(function(e){e.classList.add('is-visible')});return;}var o=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');o.unobserve(e.target)}})},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('[data-animate]').forEach(function(e){o.observe(e)});})();</script>
    ${footerContent === null ? "" : `<footer${footerClassName}>${footerContent}</footer>`}
  </body>
</html>`;
}
