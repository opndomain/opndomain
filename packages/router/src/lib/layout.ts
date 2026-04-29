import { FONT_PRECONNECT, GLOBAL_STYLES, PORTFOLIO_STYLES } from "./tokens.js";

const FAVICON_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='2' fill='%23f9f8f6'/%3E%3Ctext x='50%25' y='54%25' font-family='Newsreader, Georgia, serif' font-size='20' font-weight='700' fill='%238a3324' text-anchor='middle' dominant-baseline='central'%3Eo%3C/text%3E%3C/svg%3E";

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
  extraHead?: string;
};

export type NavActiveKey = "research" | "method" | null;

export type PageShellOptions = {
  variant?: "default" | "landing" | "reading" | "paper";
  bodyClassName?: string;
  mainClassName?: string;
  navActiveKey?: NavActiveKey;
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

function renderPrimaryNav(activeKey: NavActiveKey = null) {
  return `
    <a class="wordmark shell-wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
    <div class="shell-links">
      <a class="shell-link${activeKey === "research" ? " is-active" : ""}" href="/research">Research</a>
      <a class="shell-link${activeKey === "method" ? " is-active" : ""}" href="/method">Method</a>
    </div>
  `;
}

function renderFooterContent() {
  return `
    <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
    <div class="footer-links">
      <a href="/research">Research</a>
      <a href="/method">Method</a>
      <a href="https://github.com/opndomain" rel="noopener">GitHub</a>
    </div>
  `;
}

export function renderPage(
  title: string,
  body: string,
  description = "AI research workshop output: papers, transcripts, and the harness that produces them.",
  pageStyles?: string,
  head?: PageHeadMetadata,
  shell?: PageShellOptions,
) {
  const pageTitle = title === "opndomain" ? title : `${title} | opndomain`;
  const ogTitle = head?.ogTitle ?? pageTitle;
  const ogDescription = head?.ogDescription ?? description;
  const twitterTitle = head?.twitterTitle ?? ogTitle;
  const twitterDescription = head?.twitterDescription ?? ogDescription;
  const ogImageUrl = head?.ogImageUrl;
  const twitterImageUrl = head?.twitterImageUrl ?? ogImageUrl;
  const twitterCard = head?.twitterCard ?? (twitterImageUrl ? "summary_large_image" : "summary");
  const variant = shell?.variant ?? "default";
  const bodyClassName = shell?.bodyClassName ? ` ${escapeHeadContent(shell.bodyClassName)}` : "";
  const mainClassName = shell?.mainClassName ? ` ${escapeHeadContent(shell.mainClassName)}` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHeadContent(pageTitle)}</title>
    <meta name="description" content="${escapeHeadContent(description)}" />
    ${head?.canonicalUrl ? `<link rel="canonical" href="${escapeHeadContent(head.canonicalUrl)}" />` : ""}
    ${renderMetaTag("property", "og:site_name", "opndomain")}
    ${renderMetaTag("property", "og:type", head?.ogType ?? "website")}
    ${renderMetaTag("property", "og:url", head?.ogUrl ?? head?.canonicalUrl)}
    ${renderMetaTag("property", "og:title", ogTitle)}
    ${renderMetaTag("property", "og:description", ogDescription)}
    ${renderMetaTag("property", "og:image", ogImageUrl)}
    ${renderMetaTag("property", "og:image:alt", head?.ogImageAlt)}
    ${renderMetaTag("name", "twitter:card", twitterCard)}
    ${renderMetaTag("name", "twitter:title", twitterTitle)}
    ${renderMetaTag("name", "twitter:description", twitterDescription)}
    ${renderMetaTag("name", "twitter:image", twitterImageUrl)}
    ${renderMetaTag("name", "twitter:image:alt", head?.twitterImageAlt ?? head?.ogImageAlt)}
    <link rel="icon" href="${FAVICON_DATA_URL}" />
    ${FONT_PRECONNECT}
    <style>${GLOBAL_STYLES}${PORTFOLIO_STYLES}</style>
    ${pageStyles ? `<style>${pageStyles}</style>` : ""}
    ${head?.extraHead ?? ""}
  </head>
  <body class="shell-body shell-body--${variant}${bodyClassName}">
    <header class="shell-topbar">
      <div class="shell-topbar-inner">
        ${renderPrimaryNav(shell?.navActiveKey ?? null)}
      </div>
    </header>
    <main class="page-main page-main--${variant}${mainClassName}">${body}</main>
    <footer class="shell-footer">${renderFooterContent()}</footer>
  </body>
</html>`;
}
