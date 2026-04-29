function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const escapeHtml = esc;

export type RawHtml = {
  __html: string;
};

export function rawHtml(html: string): RawHtml {
  return { __html: html };
}

export function renderFragment(value: string | RawHtml): string {
  return typeof value === "string" ? esc(value) : value.__html;
}

export function hero(eyebrow: string, title: string, lede: string, badges: string[] = []) {
  return `
    <section class="hero">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(lede)}</p>
      ${badges.length ? `<div class="actions">${badges.map((badge) => `<span class="data-badge">${esc(badge)}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

export function card(title: string, body: string, href?: string) {
  if (href) {
    return `<a class="card card-link" href="${esc(href)}"><h3>${esc(title)}</h3>${body}</a>`;
  }
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

export function grid(columns: "two" | "three", children: string[]) {
  return `<section class="grid ${columns}">${children.join("")}</section>`;
}

export function statusPill(value: string) {
  return `<span class="status-pill">${esc(value)}</span>`;
}

export function dataBadge(value: string) {
  return `<span class="data-badge">${esc(value)}</span>`;
}

export function statRow(label: string, value: string) {
  return `<div class="stat-row"><strong>${esc(label)}</strong><span class="mono">${esc(value)}</span></div>`;
}

export function breadcrumbs(crumbs: Array<{ label: string; href?: string }>): string {
  const items = crumbs.map((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    if (isLast || !crumb.href) {
      return `<span aria-current="page">${esc(crumb.label)}</span>`;
    }
    return `<a href="${esc(crumb.href)}">${esc(crumb.label)}</a>`;
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.join('<span class="breadcrumb-sep">/</span>')}</nav>`;
}

export type PaperTocItem = { href: string; label: string; icon?: string; active?: boolean };

export function renderPaperToc(opts: {
  eyebrow?: string;
  meta?: string;
  items: PaperTocItem[];
  extras?: PaperTocItem[];
}): string {
  const renderItem = (item: PaperTocItem) => `
    <a href="${esc(item.href)}"${item.active ? ' class="is-active"' : ""}>
      <span class="material-symbols-outlined">${esc(item.icon ?? "format_indent_increase")}</span>
      <span>${esc(item.label)}</span>
    </a>
  `;
  const itemsHtml = opts.items.map(renderItem).join("");
  const extrasHtml = (opts.extras ?? []).map(renderItem).join("");
  const dividerNeeded = itemsHtml && extrasHtml;
  return `
    <aside class="paper-toc">
      <div class="paper-toc-eyebrow">${esc(opts.eyebrow ?? "Contents")}</div>
      ${opts.meta ? `<div class="paper-toc-meta">${esc(opts.meta)}</div>` : ""}
      <nav class="paper-toc-list">
        ${itemsHtml}
        ${dividerNeeded ? '<div class="paper-toc-divider"></div>' : ""}
        ${extrasHtml}
      </nav>
    </aside>
  `;
}

export function renderPaperRail(buttons?: Array<{ icon: string; title: string; href?: string }>): string {
  const defaults: Array<{ icon: string; title: string; href?: string }> = buttons ?? [
    { icon: "bookmark_add", title: "Bookmark" },
    { icon: "share", title: "Share" },
    { icon: "hub", title: "Citation graph" },
  ];
  const items = defaults
    .map((b) => {
      const tag = b.href ? "a" : "button";
      const attrs = b.href ? `href="${esc(b.href)}"` : 'type="button"';
      return `<${tag} class="paper-rail-button" ${attrs} title="${esc(b.title)}"><span class="material-symbols-outlined">${esc(b.icon)}</span></${tag}>`;
    })
    .join("");
  return `<aside class="paper-rail">${items}</aside>`;
}

export function renderPaperLayout(toc: string, body: string, rail?: string): string {
  return `
    <div class="paper-layout">
      ${toc}
      <main class="paper-article-col">
        ${body}
      </main>
      ${rail ?? renderPaperRail()}
    </div>
  `;
}
