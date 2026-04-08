import { Hono } from "hono";
import {
  type AdminAgentDetail,
  type AdminAgentSummary,
  type AdminAuditLogEntry,
  type AdminAuditLogListResponse,
  type AdminBeingDetail,
  type AdminBeingSummary,
  type AdminDashboardMetricsResponse,
  type AdminDomainSummary,
  type AdminRestriction,
  type AdminTopicDetail,
  type AdminTopicSummary,
  type BaseEnv,
  canAdminEditTopicField,
} from "@opndomain/shared";
import { assertCsrfToken, csrfHiddenInput, ensureCsrfToken } from "../lib/csrf.js";
import { renderPage } from "../lib/layout.js";
import { adminTable, card, dataBadge, escapeHtml, formCard, grid, hero, rawHtml, statRow, statusPill } from "../lib/render.js";
import { apiFetch, apiJson, validateSession } from "../lib/session.js";

type AdminRouterEnv = {
  Bindings: {
    API_SERVICE: Fetcher;
    DB: D1Database;
  } & BaseEnv;
};

type AdminSession = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

type AdminHealthData = {
  snapshotPendingCount: number;
  presentationPendingCount: number;
  topicStatusDistribution?: Array<{ status: string; count: number }>;
};

type AdminDashboardData = {
  topics: Array<{ id: string; title: string; status: string; domain_name: string }>;
  beings: AdminBeingSummary[];
  quarantined: Array<{ id: string; handle: string; topic_id: string; title: string }>;
};

type AdminPageState = {
  action?: string;
  message?: string;
};

const adminRoutes = new Hono<AdminRouterEnv>();

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function htmlResponseWithCsrf(c: any, html: string, status = 200) {
  const csrf = ensureCsrfToken(c);
  const response = htmlResponse(html, status);
  if (csrf.setCookie) {
    response.headers.append("set-cookie", csrf.setCookie);
  }
  return response;
}

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

function safeAdminRedirect(input: string | null | undefined, fallback: string): string {
  if (!input) {
    return fallback;
  }
  if (!input.startsWith("/")) {
    return fallback;
  }
  if (input.startsWith("//")) {
    return fallback;
  }
  try {
    const url = new URL(input, "https://opndomain.com");
    if (url.origin !== "https://opndomain.com") {
      return fallback;
    }
    if (!(url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function appendFlash(path: string, action: string, message: string) {
  const url = new URL(path, "https://opndomain.com");
  url.searchParams.set("action", action);
  url.searchParams.set("message", message);
  return `${url.pathname}${url.search}`;
}

function readFlash(c: any): AdminPageState | null {
  const action = c.req.query("action");
  const message = c.req.query("message");
  if (!action || !message) {
    return null;
  }
  return { action, message };
}

function adminSidebar(active: string) {
  const links = [
    { key: "dashboard", href: "/admin/dashboard", label: "Dashboard" },
    { key: "analytics", href: "/admin/analytics", label: "Analytics" },
    { key: "beings", href: "/admin/beings", label: "Beings" },
    { key: "agents", href: "/admin/agents", label: "Agents" },
    { key: "topics", href: "/admin/topics", label: "Topics" },
    { key: "audit", href: "/admin/audit-log", label: "Audit Log" },
  ];
  return `
    <div class="card">
      <p class="eyebrow">Backoffice</p>
      <h2 style="margin:0 0 12px">Admin Portal</h2>
      <p style="margin:0 0 16px;color:var(--muted,#667085)">Protected operator surfaces for platform operations.</p>
      <nav style="display:grid;gap:8px">
        ${links.map((link) => `<a class="button${link.key === active ? "" : " secondary"}" href="${link.href}">${link.label}</a>`).join("")}
      </nav>
    </div>
  `;
}

function adminPage(active: string, title: string, body: string) {
  return renderPage(
    title,
    body,
    "Protected operator backoffice for beings, topics, analytics, and audit trails.",
    undefined,
    undefined,
    {
      variant: "interior-sidebar",
      sidebarHtml: adminSidebar(active),
      navActiveKey: null,
      footer: null,
    },
  );
}

function errorCard(state: AdminPageState | null) {
  if (!state?.message) {
    return "";
  }
  return card("Action failed", `<p><strong>${escapeHtml(state.action ?? "admin_action")}</strong></p><p>${escapeHtml(state.message)}</p>`);
}

async function requireAdminSession(c: any) {
  const session = await validateSession(c.env, c.req.raw);
  if (!session) {
    return redirectResponse("/login?next=%2Fadmin%2Fdashboard");
  }
  const probe = await apiFetch(c.env, "/v1/internal/health", {
    headers: { cookie: c.req.header("cookie") ?? "" },
  });
  if (probe.status === 401) {
    return redirectResponse("/login?next=%2Fadmin%2Fdashboard");
  }
  if (probe.status === 403) {
    return htmlResponse(adminPage("dashboard", "Forbidden", hero("Admin", "Access denied.", "This account is not authorized to use the admin portal.")), 403);
  }
  if (!probe.ok) {
    return htmlResponse(adminPage("dashboard", "Unavailable", hero("Admin", "Admin API unavailable.", "The API probe did not return a healthy operator response.")), probe.status);
  }
  const payload = await probe.json() as { data: AdminHealthData };
  return {
    session,
    health: payload.data,
  };
}

async function readApiMessage(response: Response) {
  try {
    const payload = await response.json() as { message?: string; error?: string; code?: string };
    return payload.message ?? payload.error ?? payload.code ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function postAdminJson(c: any, path: string, body: unknown) {
  return apiFetch(c.env, path, {
    method: "POST",
    headers: {
      cookie: c.req.header("cookie") ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function parseForm(c: any) {
  const form = await c.req.formData();
  if (!assertCsrfToken(c, form)) {
    return { ok: false as const, response: htmlResponse(adminPage("dashboard", "CSRF Error", hero("Admin", "Request rejected.", "The CSRF token was invalid or missing.")), 403) };
  }
  return { ok: true as const, form };
}

function reasonInput(defaultValue = "admin_ui") {
  return `<label>Reason<input name="reason" value="${escapeHtml(defaultValue)}" required /></label>`;
}

async function loadAdminReads<T>(c: any, path: string) {
  const { data } = await apiJson<T>(c.env, path, {
    headers: { cookie: c.req.header("cookie") ?? "" },
  });
  return data;
}

async function loadRecentBeingContributions(c: any, beingId: string) {
  const result = await c.env.DB.prepare(`
    SELECT c.id, c.topic_id, t.title AS topic_title, c.visibility, c.submitted_at
    FROM contributions c
    INNER JOIN topics t ON t.id = c.topic_id
    WHERE c.being_id = ?
    ORDER BY c.submitted_at DESC
    LIMIT 10
  `).bind(beingId).all();
  return (result.results ?? []) as Array<{
    id: string;
    topic_id: string;
    topic_title: string;
    visibility: string;
    submitted_at: string;
  }>;
}

async function loadDashboardPage(c: any, session: AdminSession, health: AdminHealthData) {
  const [topics, beings, quarantined] = await Promise.all([
    loadAdminReads<{ items: AdminTopicSummary[] }>(c, "/v1/internal/admin/topics?pageSize=10"),
    loadAdminReads<{ items: AdminBeingSummary[] }>(c, "/v1/internal/admin/beings?pageSize=10"),
    c.env.DB.prepare(`
      SELECT c.id, b.handle, t.id AS topic_id, t.title
      FROM contributions c
      INNER JOIN beings b ON b.id = c.being_id
      INNER JOIN topics t ON t.id = c.topic_id
      WHERE c.visibility = 'quarantined'
      ORDER BY c.updated_at DESC
      LIMIT 25
    `).all() as Promise<D1Result<{ id: string; handle: string; topic_id: string; title: string }>>,
  ]);
  const csrf = ensureCsrfToken(c);
  const body = [
    hero("Admin", "Dashboard", "Health, queue state, and quick links into beings and topics."),
    grid("two", [
      card("Health", [
        statRow("Snapshot queue", String(health.snapshotPendingCount ?? 0)),
        statRow("Presentation queue", String(health.presentationPendingCount ?? 0)),
        ...(health.topicStatusDistribution ?? []).map((row) => statRow(row.status, String(row.count))),
      ].join("")),
      formCard("Lifecycle Sweep", `<form method="post" action="/admin/actions/sweep">${csrfHiddenInput(csrf.token)}<button type="submit">Run sweep</button></form>`, "Triggers the existing lifecycle sweep endpoint."),
    ]),
    card("Operator", `${statRow("Client ID", session.agent.clientId)}${statRow("Email", session.agent.email ?? "none")}`),
    card("Recent topics", adminTable(
      ["Title", "Status", "Updated"],
      topics.items.map((topic) => [
        rawHtml(`<a href="/admin/topics/${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</a>`),
        rawHtml(statusPill(topic.status)),
        topic.updatedAt,
      ]),
    )),
    card("Recent beings", adminTable(
      ["Handle", "Status", "Trust"],
      beings.items.map((being) => [
        rawHtml(`<a href="/admin/beings/${escapeHtml(being.id)}">@${escapeHtml(being.handle)}</a>`),
        rawHtml(statusPill(being.status)),
        being.trustTier,
      ]),
    )),
    card(
      "Quarantine Queue",
      (quarantined.results ?? []).map((row) => `
        <div class="card" style="margin-top:12px">
          <p>
            <a href="/topics/${escapeHtml(row.topic_id)}">${escapeHtml(row.title)}</a><br>
            <span class="mono">${escapeHtml(row.id)} | @${escapeHtml(row.handle)}</span>
          </p>
          <div class="actions">
            <form method="post" action="/admin/contributions/${escapeHtml(row.id)}/release">
              ${csrfHiddenInput(csrf.token)}
              <input type="hidden" name="reason" value="admin_ui" />
              <input type="hidden" name="redirectTo" value="/admin/dashboard" />
              <button class="secondary" type="submit">Release</button>
            </form>
            <form method="post" action="/admin/contributions/${escapeHtml(row.id)}/block">
              ${csrfHiddenInput(csrf.token)}
              <input type="hidden" name="reason" value="admin_ui" />
              <input type="hidden" name="redirectTo" value="/admin/dashboard" />
              <button class="secondary" type="submit">Block</button>
            </form>
          </div>
        </div>
      `).join("") || "<p>No quarantined contributions.</p>",
    ),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("dashboard", "Admin Dashboard", body));
}

function renderDailyMetric(title: string, metric: AdminDashboardMetricsResponse["daily"][keyof AdminDashboardMetricsResponse["daily"]]) {
  return card(title, `
    <p>${dataBadge(metric.source)}</p>
    ${adminTable(
      ["Date", "Value"],
      metric.points.map((point) => [point.date, String(point.value)]),
    )}
  `);
}

async function renderAnalyticsPage(c: any) {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const metrics = await loadAdminReads<AdminDashboardMetricsResponse>(
    c,
    `/v1/internal/admin/dashboard/metrics${query.toString() ? `?${query.toString()}` : ""}`,
  );
  const body = [
    hero("Admin", "Analytics", "Operational and growth metrics sourced from rollups and on-demand counts."),
    card("Window", `${statRow("From", metrics.window.from)}${statRow("To", metrics.window.to)}`),
    grid("two", [
      renderDailyMetric("Registrations", metrics.daily.registrations),
      renderDailyMetric("Active beings", metrics.daily.activeBeings),
      renderDailyMetric("Active agents", metrics.daily.activeAgents),
      renderDailyMetric("Topics created", metrics.daily.topicsCreated),
      renderDailyMetric("Contributions", metrics.daily.contributions),
      renderDailyMetric("Verdicts", metrics.daily.verdicts),
    ]),
    grid("two", [
      card("Point-in-time metrics", [
        statRow("Active topics", String(metrics.pointInTime.activeTopics.value)),
        statRow("Quarantine volume", String(metrics.pointInTime.quarantineVolume.value)),
        statRow("Inactive beings", String(metrics.pointInTime.inactiveBeings.value)),
        statRow("Revoked sessions (24h)", String(metrics.pointInTime.revokedSessions24h.value)),
      ].join("")),
      card("Topics by status", adminTable(
        ["Status", "Count"],
        metrics.pointInTime.topicsByStatus.items.map((item) => [item.status, String(item.count)]),
      )),
    ]),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("analytics", "Admin Analytics", body));
}

function listQuery(c: any) {
  const query = new URLSearchParams();
  const q = c.req.query("q");
  const status = c.req.query("status");
  if (q) query.set("q", q);
  if (status) query.set("status", status);
  query.set("pageSize", "25");
  return query.toString();
}

function listFilterForm(action: string, q: string, status: string) {
  return `
    <form method="get" action="${action}" style="display:grid;gap:12px;margin-bottom:16px">
      <label>Search<input name="q" value="${escapeHtml(q)}" /></label>
      <label>Status<input name="status" value="${escapeHtml(status)}" /></label>
      <button type="submit">Filter</button>
    </form>
  `;
}

async function renderBeingsIndex(c: any) {
  const data = await loadAdminReads<{ items: AdminBeingSummary[]; meta: { totalCount: number } }>(
    c,
    `/v1/internal/admin/beings?${listQuery(c)}`,
  );
  const body = [
    hero("Admin", "Beings", "Review status, capabilities, and moderation state for beings."),
    listFilterForm("/admin/beings", c.req.query("q") ?? "", c.req.query("status") ?? ""),
    card("Beings", adminTable(
      ["Handle", "Display", "Status", "Trust"],
      data.items.map((being) => [
        rawHtml(`<a href="/admin/beings/${escapeHtml(being.id)}">@${escapeHtml(being.handle)}</a>`),
        being.displayName,
        rawHtml(statusPill(being.status)),
        being.trustTier,
      ]),
    )),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("beings", "Admin Beings", body));
}

async function renderAgentsIndex(c: any) {
  const data = await loadAdminReads<{ items: AdminAgentSummary[]; meta: { totalCount: number } }>(
    c,
    `/v1/internal/admin/agents?${listQuery(c)}`,
  );
  const body = [
    hero("Admin", "Agents", "Read-only operator view into agent ownership and linked identities."),
    listFilterForm("/admin/agents", c.req.query("q") ?? "", c.req.query("status") ?? ""),
    card("Agents", adminTable(
      ["Name", "Email", "Status", "Trust"],
      data.items.map((agent) => [
        rawHtml(`<a href="/admin/agents/${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</a>`),
        agent.email ?? "none",
        rawHtml(statusPill(agent.status)),
        agent.trustTier,
      ]),
    )),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("agents", "Admin Agents", body));
}

async function renderTopicsIndex(c: any) {
  const data = await loadAdminReads<{ items: AdminTopicSummary[]; meta: { totalCount: number } }>(
    c,
    `/v1/internal/admin/topics?${listQuery(c)}`,
  );
  const body = [
    hero("Admin", "Topics", "Inspect lifecycle state, archive status, and editable metadata."),
    listFilterForm("/admin/topics", c.req.query("q") ?? "", c.req.query("status") ?? ""),
    card("Topics", adminTable(
      ["Title", "Domain", "Status", "Archived"],
      data.items.map((topic) => [
        rawHtml(`<a href="/admin/topics/${escapeHtml(topic.id)}">${escapeHtml(topic.title)}</a>`),
        topic.domainName,
        rawHtml(statusPill(topic.status)),
        topic.archived ? "yes" : "no",
      ]),
    )),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("topics", "Admin Topics", body));
}

async function renderAuditLogIndex(c: any) {
  const params = new URLSearchParams();
  const actor = c.req.query("actor") ?? "";
  const action = c.req.query("action") ?? "";
  const targetType = c.req.query("target_type") ?? "";
  const targetId = c.req.query("target_id") ?? "";
  const cursor = c.req.query("cursor") ?? "";
  if (actor) params.set("actor", actor);
  if (action) params.set("action", action);
  if (targetType) params.set("target_type", targetType);
  if (targetId) params.set("target_id", targetId);
  if (cursor) params.set("cursor", cursor);
  params.set("page_size", "50");
  const data = await loadAdminReads<AdminAuditLogListResponse>(c, `/v1/internal/admin/audit-log?${params.toString()}`);
  const nextParams = new URLSearchParams(params);
  if (data.nextCursor) {
    nextParams.set("cursor", data.nextCursor);
  }
  const body = [
    hero("Admin", "Audit Log", "Append-only operator actions with actor and target filters."),
    `
      <form method="get" action="/admin/audit-log" style="display:grid;gap:12px;margin-bottom:16px">
        <label>Actor<input name="actor" value="${escapeHtml(actor)}" /></label>
        <label>Action<input name="action" value="${escapeHtml(action)}" /></label>
        <label>Target type<input name="target_type" value="${escapeHtml(targetType)}" /></label>
        <label>Target ID<input name="target_id" value="${escapeHtml(targetId)}" /></label>
        <button type="submit">Filter</button>
      </form>
    `,
    card("Entries", adminTable(
      ["Created", "Actor", "Action", "Target"],
      data.items.map((entry) => [
        rawHtml(`<a href="/admin/audit-log/${escapeHtml(entry.id)}">${escapeHtml(entry.createdAt)}</a>`),
        entry.actorLabel ?? "system",
        entry.action,
        `${entry.targetType}:${entry.targetId}`,
      ]),
    )),
    data.nextCursor
      ? `<p><a class="button secondary" href="/admin/audit-log?${escapeHtml(nextParams.toString())}">Next page</a></p>`
      : "",
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("audit", "Admin Audit Log", body));
}

async function renderAgentDetail(c: any, agentId: string) {
  const detail = await loadAdminReads<AdminAgentDetail>(c, `/v1/internal/admin/agents/${encodeURIComponent(agentId)}`);
  const body = [
    hero("Admin", detail.name, detail.email ?? "No email", [detail.status, detail.trustTier]),
    grid("two", [
      card("Summary", [
        statRow("Client ID", detail.clientId),
        statRow("Active beings", String(detail.activeBeingCount)),
        statRow("Active sessions", String(detail.activeSessionCount)),
        statRow("Linked identities", String(detail.linkedExternalIdentityCount)),
      ].join("")),
      card("Linked identities", detail.linkedExternalIdentities.length
        ? adminTable(
          ["Provider", "User", "Verified"],
          detail.linkedExternalIdentities.map((identity) => [
            identity.provider,
            identity.providerUserId,
            identity.emailVerified ? "yes" : "no",
          ]),
        )
        : "<p>No linked identities.</p>"),
    ]),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("agents", `Agent ${detail.name}`, body));
}

async function renderBeingDetail(c: any, beingId: string) {
  const [detail, restrictions, auditLog, recentContributions] = await Promise.all([
    loadAdminReads<AdminBeingDetail>(c, `/v1/internal/admin/beings/${encodeURIComponent(beingId)}`),
    loadAdminReads<AdminRestriction[]>(c, `/v1/internal/admin/restrictions?scope_type=being&scope_id=${encodeURIComponent(beingId)}`),
    loadAdminReads<AdminAuditLogListResponse>(c, `/v1/internal/admin/audit-log?target_type=being&target_id=${encodeURIComponent(beingId)}&page_size=20`),
    loadRecentBeingContributions(c, beingId),
  ]);
  const csrf = ensureCsrfToken(c);
  const flash = readFlash(c);
  const body = [
    hero("Admin", `@${detail.handle}`, detail.displayName, [detail.status, detail.trustTier]),
    errorCard(flash),
    grid("two", [
      card("Capabilities", `
        ${adminTable(
          ["Capability", "Enabled", "Update"],
          [
            ["canPublish", String(detail.capabilities.canPublish), rawHtml(`<form method="post" action="/admin/beings/${escapeHtml(detail.id)}/capabilities">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><input type="hidden" name="capability" value="canPublish" /><input type="hidden" name="enabled" value="${detail.capabilities.canPublish ? "false" : "true"}" />${reasonInput()}<button type="submit">${detail.capabilities.canPublish ? "Disable" : "Enable"}</button></form>` )],
            ["canJoinTopics", String(detail.capabilities.canJoinTopics), rawHtml(`<form method="post" action="/admin/beings/${escapeHtml(detail.id)}/capabilities">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><input type="hidden" name="capability" value="canJoinTopics" /><input type="hidden" name="enabled" value="${detail.capabilities.canJoinTopics ? "false" : "true"}" />${reasonInput()}<button type="submit">${detail.capabilities.canJoinTopics ? "Disable" : "Enable"}</button></form>` )],
            ["canSuggestTopics", String(detail.capabilities.canSuggestTopics), rawHtml(`<form method="post" action="/admin/beings/${escapeHtml(detail.id)}/capabilities">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><input type="hidden" name="capability" value="canSuggestTopics" /><input type="hidden" name="enabled" value="${detail.capabilities.canSuggestTopics ? "false" : "true"}" />${reasonInput()}<button type="submit">${detail.capabilities.canSuggestTopics ? "Disable" : "Enable"}</button></form>` )],
            ["canOpenTopics", String(detail.capabilities.canOpenTopics), rawHtml(`<form method="post" action="/admin/beings/${escapeHtml(detail.id)}/capabilities">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><input type="hidden" name="capability" value="canOpenTopics" /><input type="hidden" name="enabled" value="${detail.capabilities.canOpenTopics ? "false" : "true"}" />${reasonInput()}<button type="submit">${detail.capabilities.canOpenTopics ? "Disable" : "Enable"}</button></form>` )],
          ],
        )}
      `),
      card("Status + sessions", `<form method="post" action="/admin/beings/${escapeHtml(detail.id)}/status" style="display:grid;gap:12px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><label>Status<select name="status"><option value="active"${detail.status === "active" ? " selected" : ""}>active</option><option value="inactive"${detail.status === "inactive" ? " selected" : ""}>inactive</option></select></label>${reasonInput()}<button type="submit">Set status</button></form><form method="post" action="/admin/beings/${escapeHtml(detail.id)}/sessions/revoke" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" />${reasonInput()}<button class="secondary" type="submit">Revoke sessions</button></form>`),
    ]),
    grid("two", [
      card("Restrictions", `${restrictions.length ? adminTable(["Mode", "Reason", "Clear"], restrictions.map((restriction) => [restriction.mode, restriction.reason ?? "none", rawHtml(`<form method="post" action="/admin/restrictions/${escapeHtml(restriction.id)}/clear">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" />${reasonInput("clear_admin_restriction")}<button class="secondary" type="submit">Clear</button></form>`)])) : "<p>No active restrictions.</p>"}<form method="post" action="/admin/restrictions" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/beings/${escapeHtml(detail.id)}" /><input type="hidden" name="scopeType" value="being" /><input type="hidden" name="scopeId" value="${escapeHtml(detail.id)}" /><label>Mode<select name="mode"><option value="mute">mute</option><option value="read_only">read_only</option><option value="queue">queue</option><option value="cooldown">cooldown</option></select></label>${reasonInput("operator_restriction")}<button type="submit">Apply restriction</button></form>`),
      card("Recent contributions", recentContributions.length ? adminTable(["Topic", "Visibility", "Submitted"], recentContributions.map((row: { topic_id: string; topic_title: string; visibility: string; submitted_at: string }) => [rawHtml(`<a href="/admin/topics/${escapeHtml(row.topic_id)}">${escapeHtml(row.topic_title)}</a>`), row.visibility, row.submitted_at])) : "<p>No contributions found.</p>"),
    ]),
    card("Recent admin actions", auditLog.items.length ? adminTable(["Created", "Action", "Actor"], auditLog.items.map((entry) => [rawHtml(`<a href="/admin/audit-log/${escapeHtml(entry.id)}">${escapeHtml(entry.createdAt)}</a>`), entry.action, entry.actorLabel ?? "system"])) : "<p>No recent admin actions.</p>"),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("beings", `Being @${detail.handle}`, body));
}

async function renderTopicDetail(c: any, topicId: string) {
  const [detail, auditLog, restrictions, domains] = await Promise.all([
    loadAdminReads<AdminTopicDetail>(c, `/v1/internal/admin/topics/${encodeURIComponent(topicId)}`),
    loadAdminReads<AdminAuditLogListResponse>(c, `/v1/internal/admin/audit-log?target_type=topic&target_id=${encodeURIComponent(topicId)}&page_size=20`),
    loadAdminReads<AdminRestriction[]>(c, `/v1/internal/admin/restrictions?scope_type=topic&scope_id=${encodeURIComponent(topicId)}`),
    loadAdminReads<{ items: AdminDomainSummary[] }>(c, "/v1/internal/admin/domains?pageSize=100"),
  ]);
  const csrf = ensureCsrfToken(c);
  const flash = readFlash(c);
  const openOnly = (field: Parameters<typeof canAdminEditTopicField>[1]) => !canAdminEditTopicField(detail.status as Parameters<typeof canAdminEditTopicField>[0], field);
  const body = [
    hero("Admin", detail.title, detail.prompt, [detail.status, detail.topicSource, detail.archived ? "archived" : "live"]),
    errorCard(flash),
    grid("two", [
      card("Lifecycle actions", `<div style="display:grid;gap:12px">${["reconcile-presentation", "reterminalize", "repair-scores", "open", "close"].map((action) => `<form method="post" action="/admin/topics/${escapeHtml(detail.id)}/${action}">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" />${reasonInput()}<button class="secondary" type="submit">${escapeHtml(action)}</button></form>`).join("")}<form method="post" action="/admin/topics/${escapeHtml(detail.id)}/${detail.archived ? "unarchive" : "archive"}">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" />${reasonInput()}<button type="submit">${detail.archived ? "Unarchive" : "Archive"}</button></form></div>`),
      card("Summary", [statRow("Domain", detail.domainName), statRow("Visibility", detail.visibility), statRow("Trust threshold", detail.minTrustTier), statRow("Active members", String(detail.activeMemberCount)), statRow("Contributions", String(detail.contributionCount)), statRow("Rounds", String(detail.roundCount))].join("")),
    ]),
    grid("two", [
      card("Metadata", `<form method="post" action="/admin/topics/${escapeHtml(detail.id)}/title" style="display:grid;gap:12px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Title<input name="title" value="${escapeHtml(detail.title)}" ${openOnly("title") ? "disabled" : ""} required /></label>${reasonInput()}<button type="submit">Update title</button></form><form method="post" action="/admin/topics/${escapeHtml(detail.id)}/visibility" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Visibility<input name="visibility" value="${escapeHtml(detail.visibility)}" ${openOnly("visibility") ? "disabled" : ""} required /></label>${reasonInput()}<button type="submit">Update visibility</button></form><form method="post" action="/admin/topics/${escapeHtml(detail.id)}/prompt" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Prompt<textarea name="prompt" ${openOnly("prompt") ? "disabled" : ""} required>${escapeHtml(detail.prompt)}</textarea></label>${reasonInput()}<button type="submit"${openOnly("prompt") ? " disabled" : ""}>Update prompt</button></form>`),
      card("Domain + trust", `<form method="post" action="/admin/topics/${escapeHtml(detail.id)}/domain" style="display:grid;gap:12px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Domain<select name="domainId" ${openOnly("domain_id") ? "disabled" : ""}>${domains.items.map((domain) => `<option value="${escapeHtml(domain.id)}"${domain.id === detail.domainId ? " selected" : ""}>${escapeHtml(domain.name)}</option>`).join("")}</select></label>${reasonInput()}<button type="submit"${openOnly("domain_id") ? " disabled" : ""}>Update domain</button></form><form method="post" action="/admin/topics/${escapeHtml(detail.id)}/trust-threshold" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Trust threshold<select name="minTrustTier" ${openOnly("trust_threshold") ? "disabled" : ""}>${["unverified", "supervised", "verified", "established", "trusted"].map((tier) => `<option value="${tier}"${tier === detail.minTrustTier ? " selected" : ""}>${tier}</option>`).join("")}</select></label>${reasonInput()}<button type="submit"${openOnly("trust_threshold") ? " disabled" : ""}>Update threshold</button></form><form method="post" action="/admin/topics/${escapeHtml(detail.id)}/cadence" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><label>Cadence preset<input name="cadencePreset" value="${escapeHtml(detail.cadencePreset ?? "")}" ${openOnly("cadence") ? "disabled" : ""} /></label><label>Cadence override minutes<input type="number" name="cadenceOverrideMinutes" value="${escapeHtml(detail.cadenceOverrideMinutes?.toString() ?? "")}" ${openOnly("cadence") ? "disabled" : ""} /></label><label>Starts at<input name="startsAt" value="${escapeHtml(detail.startsAt ?? "")}" ${openOnly("cadence") ? "disabled" : ""} /></label><label>Join until<input name="joinUntil" value="${escapeHtml(detail.joinUntil ?? "")}" ${openOnly("cadence") ? "disabled" : ""} /></label>${reasonInput()}<button type="submit"${openOnly("cadence") ? " disabled" : ""}>Update cadence</button></form>`),
    ]),
    grid("two", [
      card("Restrictions", `${restrictions.length ? adminTable(["Mode", "Reason", "Clear"], restrictions.map((restriction) => [restriction.mode, restriction.reason ?? "none", rawHtml(`<form method="post" action="/admin/restrictions/${escapeHtml(restriction.id)}/clear">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" />${reasonInput("clear_admin_restriction")}<button class="secondary" type="submit">Clear</button></form>`)])) : "<p>No active restrictions.</p>"}<form method="post" action="/admin/restrictions" style="display:grid;gap:12px;margin-top:16px">${csrfHiddenInput(csrf.token)}<input type="hidden" name="redirectTo" value="/admin/topics/${escapeHtml(detail.id)}" /><input type="hidden" name="scopeType" value="topic" /><input type="hidden" name="scopeId" value="${escapeHtml(detail.id)}" /><label>Mode<select name="mode"><option value="mute">mute</option><option value="read_only">read_only</option><option value="queue">queue</option><option value="cooldown">cooldown</option></select></label>${reasonInput("operator_restriction")}<button type="submit">Apply topic restriction</button></form>`),
      card("Recent admin actions", auditLog.items.length ? adminTable(["Created", "Action", "Actor"], auditLog.items.map((entry) => [rawHtml(`<a href="/admin/audit-log/${escapeHtml(entry.id)}">${escapeHtml(entry.createdAt)}</a>`), entry.action, entry.actorLabel ?? "system"])) : "<p>No recent admin actions.</p>"),
    ]),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("topics", `Topic ${detail.title}`, body));
}

async function renderAuditLogDetail(c: any, auditLogId: string) {
  const entry = await loadAdminReads<AdminAuditLogEntry>(c, `/v1/internal/admin/audit-log/${encodeURIComponent(auditLogId)}`);
  const body = [
    hero("Admin", entry.action, `${entry.targetType}:${entry.targetId}`, [entry.createdAt]),
    card("Entry", [
      statRow("Actor", entry.actorLabel ?? "system"),
      statRow("Target", `${entry.targetType}:${entry.targetId}`),
      statRow("Created", entry.createdAt),
      `<pre>${escapeHtml(JSON.stringify(entry.metadata, null, 2))}</pre>`,
    ].join("")),
  ].join("");
  return htmlResponseWithCsrf(c, adminPage("audit", `Audit ${entry.action}`, body));
}

adminRoutes.get("/", (c) => redirectResponse("/admin/dashboard"));
adminRoutes.get("/dashboard", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return loadDashboardPage(c, admin.session, admin.health);
});
adminRoutes.get("/analytics", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderAnalyticsPage(c);
});
adminRoutes.get("/beings", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderBeingsIndex(c);
});
adminRoutes.get("/beings/:beingId", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderBeingDetail(c, c.req.param("beingId"));
});
adminRoutes.get("/agents", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderAgentsIndex(c);
});
adminRoutes.get("/agents/:agentId", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderAgentDetail(c, c.req.param("agentId"));
});
adminRoutes.get("/topics", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderTopicsIndex(c);
});
adminRoutes.get("/topics/:topicId", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderTopicDetail(c, c.req.param("topicId"));
});
adminRoutes.get("/audit-log", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderAuditLogIndex(c);
});
adminRoutes.get("/audit-log/:auditLogId", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  return renderAuditLogDetail(c, c.req.param("auditLogId"));
});

adminRoutes.post("/actions/sweep", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const response = await postAdminJson(c, "/v1/internal/topics/sweep", {});
  if (!response.ok) {
    return redirectResponse(appendFlash("/admin/dashboard", "sweep", await readApiMessage(response)));
  }
  return redirectResponse("/admin/dashboard");
});

adminRoutes.post("/beings/:beingId/capabilities", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), `/admin/beings/${c.req.param("beingId")}`);
  const response = await postAdminJson(c, `/v1/internal/admin/beings/${encodeURIComponent(c.req.param("beingId"))}/capabilities`, {
    capability: String(parsed.form.get("capability") ?? ""),
    enabled: String(parsed.form.get("enabled") ?? "") === "true",
    reason: String(parsed.form.get("reason") ?? "admin_ui"),
  });
  if (!response.ok) {
    return redirectResponse(appendFlash(redirectTo, "being_capability_set", await readApiMessage(response)));
  }
  return redirectResponse(redirectTo);
});

adminRoutes.post("/beings/:beingId/status", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), `/admin/beings/${c.req.param("beingId")}`);
  const response = await postAdminJson(c, `/v1/internal/admin/beings/${encodeURIComponent(c.req.param("beingId"))}/status`, {
    status: String(parsed.form.get("status") ?? "active"),
    reason: String(parsed.form.get("reason") ?? "admin_ui"),
  });
  if (!response.ok) {
    return redirectResponse(appendFlash(redirectTo, "being_status_set", await readApiMessage(response)));
  }
  return redirectResponse(redirectTo);
});

adminRoutes.post("/beings/:beingId/sessions/revoke", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), `/admin/beings/${c.req.param("beingId")}`);
  const response = await postAdminJson(c, `/v1/internal/admin/beings/${encodeURIComponent(c.req.param("beingId"))}/sessions/revoke`, {
    reason: String(parsed.form.get("reason") ?? "admin_ui"),
  });
  if (!response.ok) {
    return redirectResponse(appendFlash(redirectTo, "being_sessions_revoked", await readApiMessage(response)));
  }
  return redirectResponse(redirectTo);
});

adminRoutes.post("/restrictions", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), "/admin/dashboard");
  const response = await postAdminJson(c, "/v1/internal/admin/restrictions", {
    scopeType: String(parsed.form.get("scopeType") ?? ""),
    scopeId: String(parsed.form.get("scopeId") ?? ""),
    mode: String(parsed.form.get("mode") ?? ""),
    reason: String(parsed.form.get("reason") ?? "admin_ui"),
  });
  if (!response.ok) {
    return redirectResponse(appendFlash(redirectTo, "restriction_create", await readApiMessage(response)));
  }
  return redirectResponse(redirectTo);
});

adminRoutes.post("/restrictions/:restrictionId/clear", async (c) => {
  const admin = await requireAdminSession(c);
  if (admin instanceof Response) return admin;
  const parsed = await parseForm(c);
  if (!parsed.ok) return parsed.response;
  const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), "/admin/dashboard");
  const response = await postAdminJson(c, `/v1/internal/admin/restrictions/${encodeURIComponent(c.req.param("restrictionId"))}/clear`, {
    reason: String(parsed.form.get("reason") ?? "admin_ui"),
  });
  if (!response.ok) {
    return redirectResponse(appendFlash(redirectTo, "restriction_clear", await readApiMessage(response)));
  }
  return redirectResponse(redirectTo);
});

for (const action of ["archive", "unarchive", "open", "close", "repair-scores", "reterminalize", "reconcile-presentation"] as const) {
  adminRoutes.post(`/topics/:topicId/${action}`, async (c) => {
    const admin = await requireAdminSession(c);
    if (admin instanceof Response) return admin;
    const parsed = await parseForm(c);
    if (!parsed.ok) return parsed.response;
    const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), `/admin/topics/${c.req.param("topicId")}`);
    const payload = action === "reterminalize"
      ? { reason: String(parsed.form.get("reason") ?? "admin_ui"), mode: "repair" }
      : { reason: String(parsed.form.get("reason") ?? "admin_ui") };
    const apiPath = action === "archive" || action === "unarchive"
      ? `/v1/internal/admin/topics/${encodeURIComponent(c.req.param("topicId"))}/${action}`
      : `/v1/internal/topics/${encodeURIComponent(c.req.param("topicId"))}/${action}`;
    const response = await postAdminJson(c, apiPath, payload);
    if (!response.ok) {
      return redirectResponse(appendFlash(redirectTo, action, await readApiMessage(response)));
    }
    return redirectResponse(redirectTo);
  });
}

for (const field of ["title", "visibility", "prompt", "domain", "trust-threshold", "cadence"] as const) {
  adminRoutes.post(`/topics/:topicId/${field}`, async (c) => {
    const admin = await requireAdminSession(c);
    if (admin instanceof Response) return admin;
    const parsed = await parseForm(c);
    if (!parsed.ok) return parsed.response;
    const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), `/admin/topics/${c.req.param("topicId")}`);
    const body = field === "title"
      ? { title: String(parsed.form.get("title") ?? ""), reason: String(parsed.form.get("reason") ?? "admin_ui") }
      : field === "visibility"
      ? { visibility: String(parsed.form.get("visibility") ?? ""), reason: String(parsed.form.get("reason") ?? "admin_ui") }
      : field === "prompt"
      ? { prompt: String(parsed.form.get("prompt") ?? ""), reason: String(parsed.form.get("reason") ?? "admin_ui") }
      : field === "domain"
      ? { domainId: String(parsed.form.get("domainId") ?? ""), reason: String(parsed.form.get("reason") ?? "admin_ui") }
      : field === "trust-threshold"
      ? { minTrustTier: String(parsed.form.get("minTrustTier") ?? ""), reason: String(parsed.form.get("reason") ?? "admin_ui") }
      : {
          cadencePreset: String(parsed.form.get("cadencePreset") ?? "") || null,
          cadenceOverrideMinutes: String(parsed.form.get("cadenceOverrideMinutes") ?? "") ? Number(parsed.form.get("cadenceOverrideMinutes")) : null,
          startsAt: String(parsed.form.get("startsAt") ?? "") || null,
          joinUntil: String(parsed.form.get("joinUntil") ?? "") || null,
          reason: String(parsed.form.get("reason") ?? "admin_ui"),
        };
    const response = await postAdminJson(c, `/v1/internal/admin/topics/${encodeURIComponent(c.req.param("topicId"))}/${field}`, body);
    if (!response.ok) {
      return redirectResponse(appendFlash(redirectTo, `topic_${field}`, await readApiMessage(response)));
    }
    return redirectResponse(redirectTo);
  });
}

for (const action of ["release", "block"] as const) {
  adminRoutes.post(`/contributions/:contributionId/${action}`, async (c) => {
    const admin = await requireAdminSession(c);
    if (admin instanceof Response) return admin;
    const parsed = await parseForm(c);
    if (!parsed.ok) return parsed.response;
    const redirectTo = safeAdminRedirect(String(parsed.form.get("redirectTo") ?? ""), "/admin/dashboard");
    const response = await postAdminJson(
      c,
      `/v1/internal/contributions/${encodeURIComponent(c.req.param("contributionId"))}/quarantine`,
      {
        action,
        reason: String(parsed.form.get("reason") ?? "admin_ui"),
      },
    );
    if (!response.ok) {
      return redirectResponse(appendFlash(redirectTo, `contribution_${action}`, await readApiMessage(response)));
    }
    return redirectResponse(redirectTo);
  });
}

export { adminRoutes };
