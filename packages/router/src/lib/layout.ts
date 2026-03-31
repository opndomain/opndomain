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
  variant?: "default" | "landing" | "interior-sidebar" | "top-nav-only";
  sidebarHtml?: string | null;
  navHtml?: string | null;
  footer?: string | null;
  footerClassName?: string;
  bodyClassName?: string;
  mainClassName?: string;
  navActiveKey?: "domains" | "topics" | "analytics" | "beings" | "connect" | "about" | "auth" | null;
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

function renderPrimaryNav(activeKey: PageShellOptions["navActiveKey"] = null) {
  const items = [
    { key: "domains", href: "/domains", label: "Archive" },
    { key: "topics", href: "/topics", label: "Metadata" },
    { key: "about", href: "/about", label: "Technical" },
  ] as const;

  return `
    <div class="shell-wordmark-wrap">
      <a class="wordmark shell-wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
      <span class="shell-tagline">Public inference protocol</span>
    </div>
    <div class="shell-links">
      ${items.map((item) => `<a class="shell-link${item.key === activeKey ? " is-active" : ""}" href="${item.href}">${item.label}</a>`).join("")}
      <a class="shell-link shell-link-auth${activeKey === "connect" || activeKey === "auth" ? " is-active" : ""}" href="/connect">Access</a>
    </div>
  `;
}

function renderFooterContent() {
  return `
    <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
    <div class="footer-links">
      <a href="/domains">Archive</a>
      <a href="/topics">Metadata</a>
      <a href="/about">Technical</a>
      <a href="/connect">Access</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
    </div>
  `;
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
  const variant = shell?.variant ?? "default";
  const bodyClassName = shell?.bodyClassName ? ` ${escapeHeadContent(shell.bodyClassName)}` : "";
  const mainClassName = shell?.mainClassName ? ` ${escapeHeadContent(shell.mainClassName)}` : "";
  const footerClassName = shell?.footerClassName ? ` class="${escapeHeadContent(shell.footerClassName)}"` : "";
  const footerContent = shell?.footer === undefined ? renderFooterContent() : shell.footer;
  const topbar = `
    <header class="shell-topbar shell-topbar--${variant}">
      <div class="shell-topbar-inner">
        ${shell?.navHtml ?? renderPrimaryNav(shell?.navActiveKey)}
      </div>
    </header>
  `;
  const mainMarkup = variant === "default"
    ? `
      <header class="shell">
        <nav>
          <a class="wordmark" href="/">opn<span class="wordmark-accent">domain</span></a>
          <div class="nav-links">
            <a href="/domains">Archive</a>
            <a href="/topics">Metadata</a>
            <a href="/about">Technical</a>
            <a href="/connect">Access</a>
          </div>
        </nav>
      </header>
      <main>${body}</main>
    `
    : variant === "interior-sidebar"
    ? `
      ${topbar}
      <div class="page-shell">
        <aside class="page-sidebar">${shell?.sidebarHtml ?? ""}</aside>
        <main class="page-main${mainClassName}">${body}</main>
      </div>
    `
    : `
      ${topbar}
      <main class="page-main page-main--${variant}${mainClassName}">${body}</main>
    `;

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
  <body${variant === "default" ? "" : ` class="shell-body shell-body--${variant}${bodyClassName}"`}>
    ${variant === "default" ? "" : `
    <div class="shell-frame" aria-hidden="true">
      <div class="shell-glow shell-glow-left"></div>
      <div class="shell-glow shell-glow-right"></div>
    </div>`}
    ${mainMarkup}
    <script>(function(){if(!('IntersectionObserver'in window)){document.querySelectorAll('[data-animate]').forEach(function(e){e.classList.add('is-visible')});return;}var o=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');o.unobserve(e.target)}})},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});document.querySelectorAll('[data-animate]').forEach(function(e){o.observe(e)});})();</script>
    ${footerContent === null ? "" : `<footer${footerClassName}>${footerContent}</footer>`}
  </body>
</html>`;
}
