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

function renderFragment(value: string | RawHtml): string {
  return typeof value === "string" ? esc(value) : value.__html;
}

export function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, ' $1="#"');
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

export function card(title: string, body: string) {
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

export function transcriptBlock(title: string, body: string | RawHtml) {
  return `<section class="transcript-block"><h3>${esc(title)}</h3>${renderFragment(body)}</section>`;
}

export function adminTable(headers: string[], rows: Array<Array<string | RawHtml>>) {
  return `<section class="admin-table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderFragment(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

export function formCard(title: string, form: string, detail?: string) {
  return `<section class="form-card"><h3>${esc(title)}</h3>${detail ? `<p>${esc(detail)}</p>` : ""}${form}</section>`;
}
