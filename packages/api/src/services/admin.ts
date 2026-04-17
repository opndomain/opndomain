import type {
  AdminAuditMetadata,
  AdminAuditLogTargetType,
  AdminAuditLogEntry,
  AdminAuditLogListResponse,
  AdminAuditLogQuery,
  AdminAgentDetail,
  AdminAgentSummary,
  AdminBeingStatus,
  AdminBeingDetail,
  AdminBeingSummary,
  AdminCapabilityKey,
  AdminDashboardMetricsQuery,
  AdminDashboardMetricsResponse,
  AdminDashboardOverviewResponse,
  AdminDomainDetail,
  AdminDomainSummary,
  AdminExternalIdentity,
  AdminListMeta,
  AdminListQuery,
  AdminRestriction,
  AdminRestrictionsQuery,
  AdminTopicEditableField,
  AdminTopicDetail,
  AdminTopicSummary,
  CreateAdminRestriction,
} from "@opndomain/shared";
import { canAdminEditTopicField } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { nowIso } from "../lib/time.js";
import { ensureSeedDomains } from "./domains.js";
import { revokeSessionsForAgent } from "./auth.js";
import { readCronHeartbeatStatuses, listRecentLifecycleMutations } from "./lifecycle.js";
import { listPendingSnapshotRetries } from "../lib/snapshot-sync.js";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";

type CountRow = { count: number | string | null };

type AgentSummaryRow = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  trust_tier: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type AgentDetailRow = AgentSummaryRow & {
  active_being_count: number | string | null;
  active_session_count: number | string | null;
  linked_external_identity_count: number | string | null;
};

type ExternalIdentityRow = {
  id: string;
  provider: "google" | "github" | "x";
  provider_user_id: string;
  email_snapshot: string | null;
  email_verified: number | string | null;
  linked_at: string;
  last_login_at: string;
};

type BeingSummaryRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  handle: string;
  display_name: string;
  trust_tier: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type BeingDetailRow = BeingSummaryRow & {
  bio: string | null;
  can_publish: number | string | null;
  can_join_topics: number | string | null;
  can_suggest_topics: number | string | null;
  can_open_topics: number | string | null;
  owner_agent_email: string | null;
  owner_agent_active_session_count: number | string | null;
  owner_agent_linked_external_identity_count: number | string | null;
};

type DomainSummaryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  parent_domain_id: string | null;
  topic_count: number | string | null;
  active_topic_count: number | string | null;
  created_at: string;
  updated_at: string;
};

type DomainDetailRow = DomainSummaryRow & {
  active_being_count: number | string | null;
  closed_topic_count: number | string | null;
};

type TopicSummaryRow = {
  id: string;
  domain_id: string;
  domain_slug: string;
  domain_name: string;
  title: string;
  status: string;
  topic_source: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  active_member_count: number | string | null;
};

type TopicDetailRow = TopicSummaryRow & {
  prompt: string;
  template_id: string;
  cadence_family: string;
  cadence_preset: string | null;
  cadence_override_minutes: number | string | null;
  min_trust_tier: string;
  visibility: string;
  current_round_index: number | string | null;
  starts_at: string | null;
  join_until: string | null;
  countdown_started_at: string | null;
  stalled_at: string | null;
  closed_at: string | null;
  archived_by_agent_id: string | null;
  archived_by_agent_name: string | null;
  archive_reason: string | null;
  active_member_count: number | string | null;
  contribution_count: number | string | null;
  round_count: number | string | null;
};

type WhereClause = {
  sql: string;
  bindings: unknown[];
};

type PagedResult<TItem> = {
  items: TItem[];
  meta: AdminListMeta;
};

function countValue(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function buildMeta(query: AdminListQuery, totalCount: number): AdminListMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    hasNextPage: query.page * query.pageSize < totalCount,
  };
}

function buildPagination(query: AdminListQuery) {
  return {
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

function buildArchivedClause(query: AdminListQuery, archivedExpression: string): WhereClause | null {
  if (query.archived === "include") {
    return null;
  }
  if (query.archived === "only") {
    return { sql: archivedExpression, bindings: [] };
  }
  return { sql: `NOT (${archivedExpression})`, bindings: [] };
}

function buildStatusClause(query: AdminListQuery, expression: string): WhereClause | null {
  if (!query.status) {
    return null;
  }
  return { sql: `${expression} = ?`, bindings: [query.status] };
}

function buildSearchClause(query: AdminListQuery, expressions: string[]): WhereClause | null {
  if (!query.q) {
    return null;
  }
  const value = `%${query.q.toLowerCase()}%`;
  return {
    sql: `(${expressions.map((expression) => `lower(${expression}) LIKE ?`).join(" OR ")})`,
    bindings: expressions.map(() => value),
  };
}

function combineWhereClauses(clauses: Array<WhereClause | null>) {
  const filtered = clauses.filter((clause): clause is WhereClause => clause !== null);
  return {
    whereSql: filtered.length ? `WHERE ${filtered.map((clause) => clause.sql).join(" AND ")}` : "",
    bindings: filtered.flatMap((clause) => clause.bindings),
  };
}

function mapAgentSummary(row: AgentSummaryRow): AdminAgentSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    trustTier: row.trust_tier as AdminAgentSummary["trustTier"],
    status: row.status,
    archived: row.status === "inactive",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExternalIdentity(row: ExternalIdentityRow): AdminExternalIdentity {
  return {
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    email: row.email_snapshot,
    emailVerified: Boolean(Number(row.email_verified ?? 0)),
    linkedAt: row.linked_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapBeingSummary(row: BeingSummaryRow): AdminBeingSummary {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    handle: row.handle,
    displayName: row.display_name,
    trustTier: row.trust_tier as AdminBeingSummary["trustTier"],
    status: row.status,
    archived: row.status === "inactive",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDomainSummary(row: DomainSummaryRow): AdminDomainSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    parentDomainId: row.parent_domain_id,
    archived: row.status === "inactive",
    topicCount: countValue(row.topic_count),
    activeTopicCount: countValue(row.active_topic_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTopicSummary(row: TopicSummaryRow): AdminTopicSummary {
  return {
    id: row.id,
    domainId: row.domain_id,
    domainSlug: row.domain_slug,
    domainName: row.domain_name,
    title: row.title,
    status: row.status as AdminTopicSummary["status"],
    topicSource: row.topic_source as AdminTopicSummary["topicSource"],
    archived: row.archived_at !== null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeMemberCount: countValue(row.active_member_count),
  };
}

async function countRows(env: ApiEnv, sql: string, bindings: unknown[]) {
  const row = await firstRow<CountRow>(env.DB, sql, ...bindings);
  return countValue(row?.count);
}

// These admin projections are read-only. Any future archive or status mutation
// for beings, domains, or topics must invalidate the same public cache surfaces
// that normal lifecycle and presentation writes already refresh.
export async function listAdminAgents(env: ApiEnv, query: AdminListQuery): Promise<PagedResult<AdminAgentSummary>> {
  const { whereSql, bindings } = combineWhereClauses([
    buildArchivedClause(query, `a.status = 'inactive'`),
    buildStatusClause(query, "a.status"),
    buildSearchClause(query, ["a.id", "a.client_id", "a.name", "coalesce(a.email, '')"]),
  ]);
  const { limit, offset } = buildPagination(query);
  const totalCount = await countRows(
    env,
    `
      SELECT COUNT(*) AS count
      FROM agents a
      ${whereSql}
    `,
    bindings,
  );
  const rows = await allRows<AgentSummaryRow>(
    env.DB,
    `
      SELECT a.id, a.client_id, a.name, a.email, a.trust_tier, a.status, a.created_at, a.updated_at
      FROM agents a
      ${whereSql}
      ORDER BY a.updated_at DESC, a.created_at DESC, a.id ASC
      LIMIT ? OFFSET ?
    `,
    ...bindings,
    limit,
    offset,
  );
  return {
    items: rows.map(mapAgentSummary),
    meta: buildMeta(query, totalCount),
  };
}

export async function getAdminAgentDetail(env: ApiEnv, agentId: string): Promise<AdminAgentDetail> {
  const row = await firstRow<AgentDetailRow>(
    env.DB,
    `
      SELECT
        a.id,
        a.client_id,
        a.name,
        a.email,
        a.trust_tier,
        a.status,
        a.created_at,
        a.updated_at,
        (
          SELECT COUNT(*)
          FROM beings b
          WHERE b.agent_id = a.id AND b.status = 'active'
        ) AS active_being_count,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.agent_id = a.id AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
        ) AS active_session_count,
        (
          SELECT COUNT(*)
          FROM external_identities ei
          WHERE ei.agent_id = a.id
        ) AS linked_external_identity_count
      FROM agents a
      WHERE a.id = ?
    `,
    agentId,
  );
  if (!row) {
    notFound("The requested admin agent was not found.");
  }
  const identities = await allRows<ExternalIdentityRow>(
    env.DB,
    `
      SELECT id, provider, provider_user_id, email_snapshot, email_verified, linked_at, last_login_at
      FROM external_identities
      WHERE agent_id = ?
      ORDER BY linked_at ASC, id ASC
    `,
    agentId,
  );
  return {
    ...mapAgentSummary(row),
    activeBeingCount: countValue(row.active_being_count),
    activeSessionCount: countValue(row.active_session_count),
    linkedExternalIdentityCount: countValue(row.linked_external_identity_count),
    linkedExternalIdentities: identities.map(mapExternalIdentity),
  };
}

export async function listAdminBeings(env: ApiEnv, query: AdminListQuery): Promise<PagedResult<AdminBeingSummary>> {
  const { whereSql, bindings } = combineWhereClauses([
    buildArchivedClause(query, `b.status = 'inactive'`),
    buildStatusClause(query, "b.status"),
    buildSearchClause(query, ["b.id", "b.handle", "b.display_name", "coalesce(b.bio, '')", "a.name", "coalesce(a.email, '')"]),
  ]);
  const { limit, offset } = buildPagination(query);
  const totalCount = await countRows(
    env,
    `
      SELECT COUNT(*) AS count
      FROM beings b
      INNER JOIN agents a ON a.id = b.agent_id
      ${whereSql}
    `,
    bindings,
  );
  const rows = await allRows<BeingSummaryRow>(
    env.DB,
    `
      SELECT
        b.id,
        b.agent_id,
        a.name AS agent_name,
        b.handle,
        b.display_name,
        b.trust_tier,
        b.status,
        b.created_at,
        b.updated_at
      FROM beings b
      INNER JOIN agents a ON a.id = b.agent_id
      ${whereSql}
      ORDER BY b.updated_at DESC, b.created_at DESC, b.id ASC
      LIMIT ? OFFSET ?
    `,
    ...bindings,
    limit,
    offset,
  );
  return {
    items: rows.map(mapBeingSummary),
    meta: buildMeta(query, totalCount),
  };
}

export async function getAdminBeingDetail(env: ApiEnv, beingId: string): Promise<AdminBeingDetail> {
  const row = await firstRow<BeingDetailRow>(
    env.DB,
    `
      SELECT
        b.id,
        b.agent_id,
        a.name AS agent_name,
        b.handle,
        b.display_name,
        b.bio,
        b.trust_tier,
        b.status,
        b.created_at,
        b.updated_at,
        bc.can_publish,
        bc.can_join_topics,
        bc.can_suggest_topics,
        bc.can_open_topics,
        a.email AS owner_agent_email,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.agent_id = a.id AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
        ) AS owner_agent_active_session_count,
        (
          SELECT COUNT(*)
          FROM external_identities ei
          WHERE ei.agent_id = a.id
        ) AS owner_agent_linked_external_identity_count
      FROM beings b
      INNER JOIN agents a ON a.id = b.agent_id
      INNER JOIN being_capabilities bc ON bc.being_id = b.id
      WHERE b.id = ?
    `,
    beingId,
  );
  if (!row) {
    notFound("The requested admin being was not found.");
  }
  return {
    ...mapBeingSummary(row),
    bio: row.bio,
    capabilities: {
      canPublish: Boolean(Number(row.can_publish ?? 0)),
      canJoinTopics: Boolean(Number(row.can_join_topics ?? 0)),
      canSuggestTopics: Boolean(Number(row.can_suggest_topics ?? 0)),
      canOpenTopics: Boolean(Number(row.can_open_topics ?? 0)),
    },
    ownerAgentEmail: row.owner_agent_email,
    ownerAgentActiveSessionCount: countValue(row.owner_agent_active_session_count),
    ownerAgentLinkedExternalIdentityCount: countValue(row.owner_agent_linked_external_identity_count),
  };
}

export async function listAdminDomains(env: ApiEnv, query: AdminListQuery): Promise<PagedResult<AdminDomainSummary>> {
  await ensureSeedDomains(env);
  const { whereSql, bindings } = combineWhereClauses([
    buildArchivedClause(query, `d.status = 'inactive'`),
    buildStatusClause(query, "d.status"),
    buildSearchClause(query, ["d.id", "d.slug", "d.name", "coalesce(d.description, '')"]),
  ]);
  const { limit, offset } = buildPagination(query);
  const totalCount = await countRows(
    env,
    `
      SELECT COUNT(*) AS count
      FROM domains d
      ${whereSql}
    `,
    bindings,
  );
  const rows = await allRows<DomainSummaryRow>(
    env.DB,
    `
      SELECT
        d.id,
        d.slug,
        d.name,
        d.description,
        d.status,
        d.parent_domain_id,
        d.created_at,
        d.updated_at,
        (
          SELECT COUNT(*)
          FROM topics t
          WHERE t.domain_id = d.id
        ) AS topic_count,
        (
          SELECT COUNT(*)
          FROM topics t
          WHERE t.domain_id = d.id
            AND t.archived_at IS NULL
            AND t.status IN ('open', 'countdown', 'started', 'stalled')
        ) AS active_topic_count
      FROM domains d
      ${whereSql}
      ORDER BY d.updated_at DESC, d.created_at DESC, d.id ASC
      LIMIT ? OFFSET ?
    `,
    ...bindings,
    limit,
    offset,
  );
  return {
    items: rows.map(mapDomainSummary),
    meta: buildMeta(query, totalCount),
  };
}

export async function getAdminDomainDetail(env: ApiEnv, domainId: string): Promise<AdminDomainDetail> {
  await ensureSeedDomains(env);
  const row = await firstRow<DomainDetailRow>(
    env.DB,
    `
      SELECT
        d.id,
        d.slug,
        d.name,
        d.description,
        d.status,
        d.parent_domain_id,
        d.created_at,
        d.updated_at,
        (
          SELECT COUNT(*)
          FROM topics t
          WHERE t.domain_id = d.id
        ) AS topic_count,
        (
          SELECT COUNT(*)
          FROM topics t
          WHERE t.domain_id = d.id
            AND t.archived_at IS NULL
            AND t.status IN ('open', 'countdown', 'started', 'stalled')
        ) AS active_topic_count,
        (
          SELECT COUNT(DISTINCT tm.being_id)
          FROM topic_members tm
          INNER JOIN topics t ON t.id = tm.topic_id
          INNER JOIN beings b ON b.id = tm.being_id
          WHERE t.domain_id = d.id
            AND tm.status = 'active'
            AND b.status = 'active'
        ) AS active_being_count,
        (
          SELECT COUNT(*)
          FROM topics t
          WHERE t.domain_id = d.id AND t.status = 'closed'
        ) AS closed_topic_count
      FROM domains d
      WHERE d.id = ?
    `,
    domainId,
  );
  if (!row) {
    notFound("The requested admin domain was not found.");
  }
  return {
    ...mapDomainSummary(row),
    activeBeingCount: countValue(row.active_being_count),
    closedTopicCount: countValue(row.closed_topic_count),
  };
}

export async function listAdminTopics(env: ApiEnv, query: AdminListQuery): Promise<PagedResult<AdminTopicSummary>> {
  const { whereSql, bindings } = combineWhereClauses([
    buildArchivedClause(query, "t.archived_at IS NOT NULL"),
    buildStatusClause(query, "t.status"),
    buildSearchClause(query, ["t.id", "t.title", "t.prompt", "d.slug", "d.name"]),
  ]);
  const { limit, offset } = buildPagination(query);
  const totalCount = await countRows(
    env,
    `
      SELECT COUNT(*) AS count
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      ${whereSql}
    `,
    bindings,
  );
  const rows = await allRows<TopicSummaryRow>(
    env.DB,
    `
      SELECT
        t.id,
        t.domain_id,
        d.slug AS domain_slug,
        d.name AS domain_name,
        t.title,
        t.status,
        t.topic_source,
        t.archived_at,
        t.created_at,
        t.updated_at,
        (
          SELECT COUNT(*)
          FROM topic_members tm
          WHERE tm.topic_id = t.id AND tm.status = 'active'
        ) AS active_member_count
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      ${whereSql}
      ORDER BY t.updated_at DESC, t.created_at DESC, t.id ASC
      LIMIT ? OFFSET ?
    `,
    ...bindings,
    limit,
    offset,
  );
  return {
    items: rows.map(mapTopicSummary),
    meta: buildMeta(query, totalCount),
  };
}

export async function getAdminTopicDetail(env: ApiEnv, topicId: string): Promise<AdminTopicDetail> {
  const row = await firstRow<TopicDetailRow>(
    env.DB,
    `
      SELECT
        t.id,
        t.domain_id,
        d.slug AS domain_slug,
        d.name AS domain_name,
        t.title,
        t.prompt,
        t.template_id,
        t.status,
        t.topic_source,
        t.cadence_family,
        t.cadence_preset,
        t.cadence_override_minutes,
        t.min_trust_tier,
        t.visibility,
        t.current_round_index,
        t.starts_at,
        t.join_until,
        t.countdown_started_at,
        t.stalled_at,
        t.closed_at,
        t.archived_at,
        t.archived_by_agent_id,
        aa.name AS archived_by_agent_name,
        t.archive_reason,
        t.created_at,
        t.updated_at,
        (
          SELECT COUNT(*)
          FROM topic_members tm
          WHERE tm.topic_id = t.id AND tm.status = 'active'
        ) AS active_member_count,
        (
          SELECT COUNT(*)
          FROM contributions c
          WHERE c.topic_id = t.id
        ) AS contribution_count,
        (
          SELECT COUNT(*)
          FROM rounds r
          WHERE r.topic_id = t.id
        ) AS round_count
      FROM topics t
      INNER JOIN domains d ON d.id = t.domain_id
      LEFT JOIN agents aa ON aa.id = t.archived_by_agent_id
      WHERE t.id = ?
    `,
    topicId,
  );
  if (!row) {
    notFound("The requested admin topic was not found.");
  }
  return {
    ...mapTopicSummary(row),
    prompt: row.prompt,
    templateId: row.template_id as AdminTopicDetail["templateId"],
    cadenceFamily: row.cadence_family as AdminTopicDetail["cadenceFamily"],
    cadencePreset: row.cadence_preset as AdminTopicDetail["cadencePreset"],
    cadenceOverrideMinutes: row.cadence_override_minutes === null ? null : Number(row.cadence_override_minutes),
    minTrustTier: row.min_trust_tier as AdminTopicDetail["minTrustTier"],
    visibility: row.visibility,
    currentRoundIndex: countValue(row.current_round_index),
    startsAt: row.starts_at,
    joinUntil: row.join_until,
    countdownStartedAt: row.countdown_started_at,
    stalledAt: row.stalled_at,
    closedAt: row.closed_at,
    archivedByAgentId: row.archived_by_agent_id,
    archivedByAgentName: row.archived_by_agent_name,
    archiveReason: row.archive_reason,
    activeMemberCount: countValue(row.active_member_count),
    contributionCount: countValue(row.contribution_count),
    roundCount: countValue(row.round_count),
  };
}

type AuditLogRow = {
  id: string;
  actor_agent_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: string | null;
  created_at: string;
};

type RestrictionRow = {
  id: string;
  scope_type: "being" | "topic";
  scope_id: string;
  mode: AdminRestriction["mode"];
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardDailyPointRow = {
  rollup_date?: string;
  metric_date?: string;
  value: number | string | null;
};

type DashboardStatusCountRow = {
  status: string;
  count: number | string | null;
};

type DashboardScalarRow = {
  value: number | string | null;
};

type TopicMetadataRow = {
  id: string;
  status: string;
  title: string;
  prompt: string;
  domain_id: string;
  visibility: string;
  min_trust_tier: string;
  cadence_preset: string | null;
  cadence_override_minutes: number | null;
  starts_at: string | null;
  join_until: string | null;
  archived_at: string | null;
};

type BeingOwnershipRow = {
  id: string;
  agent_id: string;
};

function parseAuditMetadata(value: string | null): unknown | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildAuditMetadata(
  reason: string,
  options?: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    clearedAt?: string;
    extra?: Record<string, unknown>;
  },
): AdminAuditMetadata {
  return {
    reason,
    before: options?.before,
    after: options?.after,
    ...(options?.clearedAt ? { clearedAt: options.clearedAt } : {}),
    ...(options?.extra ?? {}),
  };
}

function mapAuditLogRow(row: AuditLogRow): AdminAuditLogEntry {
  return {
    id: row.id,
    actorAgentId: row.actor_agent_id,
    actorLabel: row.actor_email ?? row.actor_name ?? row.actor_agent_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: parseAuditMetadata(row.metadata_json),
    createdAt: row.created_at,
  };
}

function encodeAuditCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify({ createdAt, id }));
}

function decodeAuditCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const value = JSON.parse(atob(cursor)) as { createdAt?: string; id?: string };
    if (!value.createdAt || !value.id) {
      throw new Error("invalid");
    }
    return { createdAt: value.createdAt, id: value.id };
  } catch {
    badRequest("invalid_cursor", "The audit log cursor is invalid.");
  }
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDashboardWindow(query: AdminDashboardMetricsQuery) {
  const today = new Date();
  const defaultTo = isoDateOnly(today);
  const defaultFrom = isoDateOnly(new Date(today.getTime() - (29 * 24 * 60 * 60 * 1000)));
  const from = query.from ?? defaultFrom;
  const to = query.to ?? defaultTo;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    badRequest("invalid_date_range", "The dashboard date range is invalid.");
  }
  const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (diffDays > 365) {
    badRequest("invalid_date_range", "The dashboard date range cannot exceed 365 days.");
  }
  return { from, to };
}

function buildDateBuckets(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(isoDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function mapSeriesPoints(
  dates: string[],
  rows: DashboardDailyPointRow[],
  dateKey: "rollup_date" | "metric_date",
) {
  const values = new Map(
    rows.map((row) => [String(row[dateKey] ?? ""), countValue(row.value)]),
  );
  return dates.map((date) => ({ date, value: values.get(date) ?? 0 }));
}

function capabilityColumnName(capability: AdminCapabilityKey): string {
  switch (capability) {
    case "canPublish":
      return "can_publish";
    case "canJoinTopics":
      return "can_join_topics";
    case "canSuggestTopics":
      return "can_suggest_topics";
    case "canOpenTopics":
      return "can_open_topics";
  }
}

async function requireBeingOwnership(env: ApiEnv, beingId: string): Promise<BeingOwnershipRow> {
  const row = await firstRow<BeingOwnershipRow>(
    env.DB,
    `SELECT id, agent_id FROM beings WHERE id = ?`,
    beingId,
  );
  if (!row) {
    notFound("The requested admin being was not found.");
  }
  return row;
}

async function requireTopicMetadataRow(env: ApiEnv, topicId: string): Promise<TopicMetadataRow> {
  const row = await firstRow<TopicMetadataRow>(
    env.DB,
    `SELECT id, status, title, prompt, domain_id, visibility, min_trust_tier, cadence_preset, cadence_override_minutes, starts_at, join_until, archived_at
     FROM topics
     WHERE id = ?`,
    topicId,
  );
  if (!row) {
    notFound("The requested admin topic was not found.");
  }
  return row;
}

function assertAdminTopicFieldEditable(topicStatus: string, field: AdminTopicEditableField) {
  if (!["open", "started", "countdown", "stalled", "closed", "dropped"].includes(topicStatus)) {
    badRequest("invalid_topic_status", `Unsupported topic status ${topicStatus}.`);
  }
  if (!canAdminEditTopicField(topicStatus as Parameters<typeof canAdminEditTopicField>[0], field)) {
    badRequest("invalid_topic_status", `Field ${field} cannot be edited while the topic is ${topicStatus}.`);
  }
}

export async function recordAdminAuditLog(
  env: ApiEnv,
  input: {
    actorAgentId: string;
    action: string;
    targetType: AdminAuditLogTargetType;
    targetId: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  await runStatement(
    env.DB.prepare(
      `INSERT INTO admin_audit_log (id, actor_agent_id, action, target_type, target_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      createId("adl"),
      input.actorAgentId,
      input.action,
      input.targetType,
      input.targetId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ),
  );
}

export async function listAdminAuditLog(env: ApiEnv, query: AdminAuditLogQuery): Promise<AdminAuditLogListResponse> {
  const clauses: string[] = [];
  const bindings: unknown[] = [];

  if (query.actor) {
    clauses.push(`(
      aal.actor_agent_id = ?
      OR lower(coalesce(a.email, '')) LIKE ?
      OR lower(coalesce(a.name, '')) LIKE ?
      OR lower(coalesce(a.client_id, '')) LIKE ?
    )`);
    const actorId = query.actor.trim();
    const actorLike = `%${actorId.toLowerCase()}%`;
    bindings.push(actorId, actorLike, actorLike, actorLike);
  }
  if (query.targetType) {
    clauses.push(`aal.target_type = ?`);
    bindings.push(query.targetType);
  }
  if (query.targetId) {
    clauses.push(`aal.target_id = ?`);
    bindings.push(query.targetId);
  }
  if (query.action) {
    clauses.push(`aal.action = ?`);
    bindings.push(query.action);
  }
  if (query.from) {
    clauses.push(`substr(aal.created_at, 1, 10) >= ?`);
    bindings.push(query.from);
  }
  if (query.to) {
    clauses.push(`substr(aal.created_at, 1, 10) <= ?`);
    bindings.push(query.to);
  }
  if (query.cursor) {
    const cursor = decodeAuditCursor(query.cursor);
    clauses.push(`(aal.created_at < ? OR (aal.created_at = ? AND aal.id < ?))`);
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await allRows<AuditLogRow>(
    env.DB,
    `
      SELECT
        aal.id,
        aal.actor_agent_id,
        aal.action,
        aal.target_type,
        aal.target_id,
        aal.metadata_json,
        aal.created_at,
        a.name AS actor_name,
        a.email AS actor_email
      FROM admin_audit_log aal
      LEFT JOIN agents a ON a.id = aal.actor_agent_id
      ${whereSql}
      ORDER BY aal.created_at DESC, aal.id DESC
      LIMIT ?
    `,
    ...bindings,
    query.pageSize + 1,
  );
  const page = rows.slice(0, query.pageSize).map(mapAuditLogRow);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: rows.length > query.pageSize && last ? encodeAuditCursor(last.createdAt, last.id) : null,
  };
}

export async function getAdminAuditLogEntry(env: ApiEnv, auditLogId: string): Promise<AdminAuditLogEntry> {
  const row = await firstRow<AuditLogRow>(
    env.DB,
    `
      SELECT
        aal.id,
        aal.actor_agent_id,
        aal.action,
        aal.target_type,
        aal.target_id,
        aal.metadata_json,
        aal.created_at,
        a.name AS actor_name,
        a.email AS actor_email
      FROM admin_audit_log aal
      LEFT JOIN agents a ON a.id = aal.actor_agent_id
      WHERE aal.id = ?
    `,
    auditLogId,
  );
  if (!row) {
    notFound("The requested admin audit log entry was not found.");
  }
  return mapAuditLogRow(row);
}

export async function listActiveAdminRestrictions(env: ApiEnv, query: AdminRestrictionsQuery): Promise<AdminRestriction[]> {
  const rows = await allRows<RestrictionRow>(
    env.DB,
    `
      SELECT id, scope_type, scope_id, mode, reason, expires_at, created_at, updated_at
      FROM text_restrictions
      WHERE scope_type = ?
        AND scope_id = ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `,
    query.scopeType,
    query.scopeId,
  );
  return rows.map((row) => ({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    mode: row.mode,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getAdminDashboardMetrics(
  env: ApiEnv,
  query: AdminDashboardMetricsQuery,
): Promise<AdminDashboardMetricsResponse> {
  const window = parseDashboardWindow(query);
  const dates = buildDateBuckets(window.from, window.to);

  const [
    registrationsRows,
    activeBeingsRows,
    activeAgentsRows,
    topicsCreatedRows,
    contributionsRows,
    verdictsRows,
    activeTopicsRow,
    topicsByStatusRows,
    quarantineVolumeRow,
    inactiveBeingsRow,
    revokedSessionsRow,
  ] = await Promise.all([
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT substr(created_at, 1, 10) AS metric_date, COUNT(*) AS value
       FROM beings
       WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY metric_date ASC`,
      window.from,
      window.to,
    ),
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT rollup_date, active_beings AS value
       FROM platform_daily_rollups
       WHERE rollup_date BETWEEN ? AND ?
       ORDER BY rollup_date ASC`,
      window.from,
      window.to,
    ),
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT rollup_date, active_agents AS value
       FROM platform_daily_rollups
       WHERE rollup_date BETWEEN ? AND ?
       ORDER BY rollup_date ASC`,
      window.from,
      window.to,
    ),
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT rollup_date, topics_created_count AS value
       FROM platform_daily_rollups
       WHERE rollup_date BETWEEN ? AND ?
       ORDER BY rollup_date ASC`,
      window.from,
      window.to,
    ),
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT rollup_date, contributions_created_count AS value
       FROM platform_daily_rollups
       WHERE rollup_date BETWEEN ? AND ?
       ORDER BY rollup_date ASC`,
      window.from,
      window.to,
    ),
    allRows<DashboardDailyPointRow>(
      env.DB,
      `SELECT rollup_date, verdicts_created_count AS value
       FROM platform_daily_rollups
       WHERE rollup_date BETWEEN ? AND ?
       ORDER BY rollup_date ASC`,
      window.from,
      window.to,
    ),
    firstRow<DashboardScalarRow>(
      env.DB,
      `SELECT active_topics AS value
       FROM platform_daily_rollups
       ORDER BY rollup_date DESC
       LIMIT 1`,
    ),
    allRows<DashboardStatusCountRow>(
      env.DB,
      `SELECT status, COUNT(*) AS count
       FROM topics
       GROUP BY status
       ORDER BY status ASC`,
    ),
    firstRow<DashboardScalarRow>(
      env.DB,
      `SELECT COUNT(*) AS value
       FROM text_restrictions
       WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`,
    ),
    firstRow<DashboardScalarRow>(
      env.DB,
      `SELECT COUNT(*) AS value
       FROM beings
       WHERE status = 'inactive'`,
    ),
    firstRow<DashboardScalarRow>(
      env.DB,
      `SELECT COUNT(*) AS value
       FROM sessions
       WHERE revoked_at IS NOT NULL
         AND revoked_at > datetime('now', '-1 day')`,
    ),
  ]);

  return {
    window,
    daily: {
      registrations: { source: "on_demand", points: mapSeriesPoints(dates, registrationsRows, "metric_date") },
      activeBeings: { source: "rollup", points: mapSeriesPoints(dates, activeBeingsRows, "rollup_date") },
      activeAgents: { source: "rollup", points: mapSeriesPoints(dates, activeAgentsRows, "rollup_date") },
      topicsCreated: { source: "rollup", points: mapSeriesPoints(dates, topicsCreatedRows, "rollup_date") },
      contributions: { source: "rollup", points: mapSeriesPoints(dates, contributionsRows, "rollup_date") },
      verdicts: { source: "rollup", points: mapSeriesPoints(dates, verdictsRows, "rollup_date") },
    },
    pointInTime: {
      activeTopics: { source: "rollup", value: countValue(activeTopicsRow?.value) },
      topicsByStatus: {
        source: "on_demand",
        items: topicsByStatusRows.map((row) => ({ status: row.status, count: countValue(row.count) })),
      },
      quarantineVolume: { source: "on_demand", value: countValue(quarantineVolumeRow?.value) },
      inactiveBeings: { source: "on_demand", value: countValue(inactiveBeingsRow?.value) },
      revokedSessions24h: { source: "on_demand", value: countValue(revokedSessionsRow?.value) },
    },
  };
}

export async function updateAdminBeingCapability(
  env: ApiEnv,
  actorAgentId: string,
  beingId: string,
  input: { capability: AdminCapabilityKey; enabled: boolean; reason: string },
) {
  await requireBeingOwnership(env, beingId);
  const column = capabilityColumnName(input.capability);
  await runStatement(
    env.DB.prepare(`UPDATE being_capabilities SET ${column} = ? WHERE being_id = ?`).bind(Number(input.enabled), beingId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "being_capability_set",
    targetType: "being",
    targetId: beingId,
    metadata: {
      capability: input.capability,
      enabled: input.enabled,
      reason: input.reason,
    },
  });
  return getAdminBeingDetail(env, beingId);
}

export async function updateAdminBeingStatus(
  env: ApiEnv,
  actorAgentId: string,
  beingId: string,
  input: { status: AdminBeingStatus; reason: string },
) {
  await requireBeingOwnership(env, beingId);
  const before = await getAdminBeingDetail(env, beingId);
  await runStatement(
    env.DB.prepare(`UPDATE beings SET status = ? WHERE id = ?`).bind(input.status, beingId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "being_status_set",
    targetType: "being",
    targetId: beingId,
    metadata: buildAuditMetadata(input.reason, {
      before: { status: before.status },
      after: { status: input.status },
    }),
  });
  return getAdminBeingDetail(env, beingId);
}

export async function revokeAdminBeingSessions(
  env: ApiEnv,
  actorAgentId: string,
  beingId: string,
  reason: string,
) {
  const being = await requireBeingOwnership(env, beingId);
  const { revokedAt } = await revokeSessionsForAgent(env, being.agent_id);
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "being_sessions_revoked",
    targetType: "being",
    targetId: beingId,
    metadata: buildAuditMetadata(reason, {
      after: { revokedAt },
    }),
  });
  return { beingId, revoked: true };
}

export async function createAdminRestrictionRecord(
  env: ApiEnv,
  actorAgentId: string,
  input: CreateAdminRestriction,
): Promise<AdminRestriction> {
  if (input.scopeType === "being") {
    await requireBeingOwnership(env, input.scopeId);
  } else {
    await requireTopicMetadataRow(env, input.scopeId);
  }
  const restrictionId = createId("rst");
  await runStatement(
    env.DB.prepare(
      `INSERT INTO text_restrictions (id, scope_type, scope_id, mode, reason, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      restrictionId,
      input.scopeType,
      input.scopeId,
      input.mode,
      input.reason,
      input.expiresAt ?? null,
    ),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "restriction_create",
    targetType: "restriction",
    targetId: restrictionId,
    metadata: buildAuditMetadata(input.reason, {
      after: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        mode: input.mode,
        expiresAt: input.expiresAt ?? null,
      },
    }),
  });
  const row = await firstRow<RestrictionRow>(
    env.DB,
    `SELECT id, scope_type, scope_id, mode, reason, expires_at, created_at, updated_at
     FROM text_restrictions
     WHERE id = ?`,
    restrictionId,
  );
  if (!row) {
    notFound("The created restriction could not be read back.");
  }
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    mode: row.mode,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function clearAdminRestrictionRecord(
  env: ApiEnv,
  actorAgentId: string,
  restrictionId: string,
  reason: string,
) {
  const existing = await firstRow<RestrictionRow>(
    env.DB,
    `SELECT id, scope_type, scope_id, mode, reason, expires_at, created_at, updated_at
     FROM text_restrictions
     WHERE id = ?`,
    restrictionId,
  );
  if (!existing) {
    notFound("The requested restriction was not found.");
  }
  const clearedAt = nowIso();
  await runStatement(
    env.DB.prepare(`UPDATE text_restrictions SET expires_at = ? WHERE id = ?`).bind(clearedAt, restrictionId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "restriction_clear",
    targetType: "restriction",
    targetId: restrictionId,
    metadata: buildAuditMetadata(reason, {
      before: {
        scopeType: existing.scope_type,
        scopeId: existing.scope_id,
        mode: existing.mode,
        expiresAt: existing.expires_at,
      },
      after: {
        scopeType: existing.scope_type,
        scopeId: existing.scope_id,
        mode: existing.mode,
        expiresAt: clearedAt,
      },
      clearedAt,
    }),
  });
  return { restrictionId, clearedAt };
}

export async function archiveAdminTopic(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  reason: string,
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  const archivedAt = nowIso();
  await runStatement(
    env.DB.prepare(
      `UPDATE topics
       SET archived_at = ?, archived_by_agent_id = ?, archive_reason = ?
       WHERE id = ?`,
    ).bind(archivedAt, actorAgentId, reason, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_archive",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(reason, {
      before: {
        archivedAt: topic.archived_at,
      },
      after: {
        archivedAt,
      },
    }),
  });
  await invalidateTopicPublicSurfaces(env, {
    topicId,
    domainId: topic.domain_id,
    reason: "topic_archived",
  });
  return getAdminTopicDetail(env, topicId);
}

export async function unarchiveAdminTopic(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  reason: string,
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  await runStatement(
    env.DB.prepare(
      `UPDATE topics
       SET archived_at = NULL, archived_by_agent_id = NULL, archive_reason = NULL
       WHERE id = ?`,
    ).bind(topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_unarchive",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(reason, {
      before: {
        archivedAt: topic.archived_at,
      },
      after: {
        archivedAt: null,
      },
    }),
  });
  await invalidateTopicPublicSurfaces(env, {
    topicId,
    domainId: topic.domain_id,
    reason: "topic_unarchived",
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicTitle(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: { title: string; reason: string },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "title");
  await runStatement(
    env.DB.prepare(`UPDATE topics SET title = ? WHERE id = ?`).bind(input.title, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_title_set",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(input.reason, {
      before: { title: topic.title },
      after: { title: input.title },
    }),
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicVisibility(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: { visibility: string; reason: string },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "visibility");
  await runStatement(
    env.DB.prepare(`UPDATE topics SET visibility = ? WHERE id = ?`).bind(input.visibility, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_visibility_set",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(input.reason, {
      before: { visibility: topic.visibility },
      after: { visibility: input.visibility },
    }),
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicPrompt(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: { prompt: string; reason: string },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "prompt");
  await runStatement(
    env.DB.prepare(`UPDATE topics SET prompt = ? WHERE id = ?`).bind(input.prompt, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_prompt_set",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(input.reason, {
      before: { prompt: topic.prompt },
      after: { prompt: input.prompt },
    }),
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicDomain(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: { domainId: string; reason: string },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "domain_id");
  const domain = await firstRow<{ id: string }>(env.DB, `SELECT id FROM domains WHERE id = ?`, input.domainId);
  if (!domain) {
    notFound("The requested admin domain was not found.");
  }
  await runStatement(
    env.DB.prepare(`UPDATE topics SET domain_id = ? WHERE id = ?`).bind(input.domainId, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_domain_set",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(input.reason, {
      before: { domainId: topic.domain_id },
      after: { domainId: input.domainId },
    }),
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicTrustThreshold(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: { minTrustTier: string; reason: string },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "trust_threshold");
  await runStatement(
    env.DB.prepare(`UPDATE topics SET min_trust_tier = ? WHERE id = ?`).bind(input.minTrustTier, topicId),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_trust_threshold_set",
    targetType: "topic",
    targetId: topicId,
    metadata: buildAuditMetadata(input.reason, {
      before: { minTrustTier: topic.min_trust_tier },
      after: { minTrustTier: input.minTrustTier },
    }),
  });
  return getAdminTopicDetail(env, topicId);
}

export async function setAdminTopicCadence(
  env: ApiEnv,
  actorAgentId: string,
  topicId: string,
  input: {
    cadencePreset?: string | null;
    cadenceOverrideMinutes?: number | null;
    startsAt?: string | null;
    joinUntil?: string | null;
    reason: string;
  },
) {
  const topic = await requireTopicMetadataRow(env, topicId);
  assertAdminTopicFieldEditable(topic.status, "cadence");
  await runStatement(
    env.DB.prepare(
      `UPDATE topics
       SET
         cadence_preset = CASE WHEN ? = 1 THEN ? ELSE cadence_preset END,
         cadence_override_minutes = CASE WHEN ? = 1 THEN ? ELSE cadence_override_minutes END,
         starts_at = CASE WHEN ? = 1 THEN ? ELSE starts_at END,
         join_until = CASE WHEN ? = 1 THEN ? ELSE join_until END
       WHERE id = ?`,
    ).bind(
      Number(Object.prototype.hasOwnProperty.call(input, "cadencePreset")),
      input.cadencePreset ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "cadenceOverrideMinutes")),
      input.cadenceOverrideMinutes ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "startsAt")),
      input.startsAt ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "joinUntil")),
      input.joinUntil ?? null,
      topicId,
    ),
  );
  await recordAdminAuditLog(env, {
    actorAgentId,
    action: "topic_cadence_set",
    targetType: "topic",
    targetId: topicId,
    metadata: {
      ...buildAuditMetadata(input.reason, {
        before: {
          cadencePreset: topic.cadence_preset,
          cadenceOverrideMinutes: topic.cadence_override_minutes,
          startsAt: topic.starts_at,
          joinUntil: topic.join_until,
        },
        after: {
          cadencePreset: Object.prototype.hasOwnProperty.call(input, "cadencePreset") ? input.cadencePreset ?? null : topic.cadence_preset,
          cadenceOverrideMinutes: Object.prototype.hasOwnProperty.call(input, "cadenceOverrideMinutes") ? input.cadenceOverrideMinutes ?? null : topic.cadence_override_minutes,
          startsAt: Object.prototype.hasOwnProperty.call(input, "startsAt") ? input.startsAt ?? null : topic.starts_at,
          joinUntil: Object.prototype.hasOwnProperty.call(input, "joinUntil") ? input.joinUntil ?? null : topic.join_until,
        },
      }),
    },
  });
  return getAdminTopicDetail(env, topicId);
}

// --- Admin Dashboard Overview (operational command center) ---

type HeadlineTopicRow = {
  open_topics: number | string | null;
  stalled_topics: number | string | null;
  closed_24h: number | string | null;
};

type HeadlineCountsRow = {
  quarantined_contributions: number | string | null;
  active_restrictions: number | string | null;
  new_agents_24h: number | string | null;
  new_beings_24h: number | string | null;
};

type SessionOnlineRow = {
  agents_online: number | string | null;
  beings_active_now: number | string | null;
};

type OverviewTopicStatusRow = { status: string; count: number | string | null };

type QuarantineItemRow = {
  contribution_id: string;
  topic_id: string;
  topic_title: string;
  being_handle: string;
  body: string | null;
  guardrail_decision: string | null;
  submitted_at: string;
};

type StalledTopicRow = {
  topic_id: string;
  title: string;
  domain_name: string;
  status: string;
  updated_at: string;
  contribution_count: number | string | null;
};

type ClosedTopicRow = {
  topic_id: string;
  title: string;
  domain_name: string;
  closed_at: string;
  contribution_count: number | string | null;
  artifact_status: string | null;
};

type AttentionTopicRow = {
  topic_id: string;
  title: string;
  domain_name: string;
  status: string;
  updated_at: string;
  last_contribution_at: string | null;
  contribution_count: number | string | null;
};

export async function getAdminDashboardOverview(
  env: ApiEnv,
): Promise<AdminDashboardOverviewResponse> {
  const [
    headlineTopics,
    headlineCounts,
    sessionOnline,
    topicStatusDistribution,
    quarantineItems,
    stalledTopicItems,
    recentlyClosedTopics,
    topicsNeedingAttention,
    snapshotPending,
    presentationPending,
    cronHeartbeats,
    recentLifecycleMutations,
  ] = await Promise.all([
    // Query 1: topic headline counts
    firstRow<HeadlineTopicRow>(
      env.DB,
      `SELECT
        SUM(CASE WHEN status IN ('open','countdown','started','stalled') AND archived_at IS NULL THEN 1 ELSE 0 END) AS open_topics,
        SUM(CASE WHEN status = 'stalled' AND archived_at IS NULL THEN 1 ELSE 0 END) AS stalled_topics,
        SUM(CASE WHEN closed_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS closed_24h
      FROM topics`,
    ),
    // Query 2: other headline counts
    firstRow<HeadlineCountsRow>(
      env.DB,
      `SELECT
        (SELECT COUNT(*) FROM contributions WHERE visibility = 'quarantined') AS quarantined_contributions,
        (SELECT COUNT(*) FROM text_restrictions WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) AS active_restrictions,
        (SELECT COUNT(*) FROM agents WHERE created_at >= datetime('now', '-1 day')) AS new_agents_24h,
        (SELECT COUNT(*) FROM beings WHERE created_at >= datetime('now', '-1 day')) AS new_beings_24h`,
    ),
    // Query 3: session-based online counts
    firstRow<SessionOnlineRow>(
      env.DB,
      `SELECT
        COUNT(DISTINCT agent_id) AS agents_online,
        COUNT(DISTINCT being_id) AS beings_active_now
      FROM sessions
      WHERE revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
        AND last_used_at >= datetime('now', '-15 minutes')`,
    ),
    // Query 4: topic status distribution
    allRows<OverviewTopicStatusRow>(
      env.DB,
      `SELECT status, COUNT(*) AS count FROM topics GROUP BY status ORDER BY status ASC`,
    ),
    // Query 5: quarantine items (up to 25)
    allRows<QuarantineItemRow>(
      env.DB,
      `SELECT
        c.id AS contribution_id,
        c.topic_id,
        t.title AS topic_title,
        b.handle AS being_handle,
        c.body,
        c.guardrail_decision,
        c.submitted_at
      FROM contributions c
      INNER JOIN topics t ON t.id = c.topic_id
      INNER JOIN beings b ON b.id = c.being_id
      WHERE c.visibility = 'quarantined'
      ORDER BY c.submitted_at DESC
      LIMIT 25`,
    ),
    // Query 6: stalled topics
    allRows<StalledTopicRow>(
      env.DB,
      `SELECT
        t.id AS topic_id,
        t.title,
        COALESCE(d.name, 'unknown') AS domain_name,
        t.status,
        t.updated_at,
        (SELECT COUNT(*) FROM contributions c WHERE c.topic_id = t.id) AS contribution_count
      FROM topics t
      LEFT JOIN domains d ON d.id = t.domain_id
      WHERE t.status = 'stalled' AND t.archived_at IS NULL
      ORDER BY t.updated_at DESC
      LIMIT 25`,
    ),
    // Query 7: recently closed topics (last 24h)
    allRows<ClosedTopicRow>(
      env.DB,
      `SELECT
        t.id AS topic_id,
        t.title,
        COALESCE(d.name, 'unknown') AS domain_name,
        t.closed_at,
        (SELECT COUNT(*) FROM contributions c WHERE c.topic_id = t.id) AS contribution_count,
        ta.artifact_status
      FROM topics t
      LEFT JOIN domains d ON d.id = t.domain_id
      LEFT JOIN topic_artifacts ta ON ta.topic_id = t.id
      WHERE t.closed_at >= datetime('now', '-1 day')
      ORDER BY t.closed_at DESC
      LIMIT 25`,
    ),
    // Query 8: topics needing attention (active but no recent contributions)
    allRows<AttentionTopicRow>(
      env.DB,
      `SELECT
        t.id AS topic_id,
        t.title,
        COALESCE(d.name, 'unknown') AS domain_name,
        t.status,
        t.updated_at,
        (SELECT MAX(c2.submitted_at) FROM contributions c2 WHERE c2.topic_id = t.id) AS last_contribution_at,
        (SELECT COUNT(*) FROM contributions c3 WHERE c3.topic_id = t.id) AS contribution_count
      FROM topics t
      LEFT JOIN domains d ON d.id = t.domain_id
      WHERE t.status IN ('open','countdown','started','stalled')
        AND t.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM contributions c
          WHERE c.topic_id = t.id
            AND c.submitted_at >= datetime('now', '-1 day')
        )
      ORDER BY t.updated_at DESC
      LIMIT 25`,
    ),
    // Reuse existing helpers
    listPendingSnapshotRetries(env),
    env.PUBLIC_CACHE.list({ prefix: "presentation-pending:" }),
    readCronHeartbeatStatuses(env),
    listRecentLifecycleMutations(env),
  ]);

  return {
    headline: {
      openTopics: countValue(headlineTopics?.open_topics),
      stalledTopics: countValue(headlineTopics?.stalled_topics),
      topicsClosed24h: countValue(headlineTopics?.closed_24h),
      quarantinedContributions: countValue(headlineCounts?.quarantined_contributions),
      activeRestrictions: countValue(headlineCounts?.active_restrictions),
      newAgents24h: countValue(headlineCounts?.new_agents_24h),
      newBeings24h: countValue(headlineCounts?.new_beings_24h),
      agentsOnline: countValue(sessionOnline?.agents_online),
      beingsActiveNow: countValue(sessionOnline?.beings_active_now),
    },
    ops: {
      snapshotPendingCount: snapshotPending.length,
      presentationPendingCount: presentationPending.keys.length,
      topicStatusDistribution: topicStatusDistribution.map((row) => ({
        status: row.status,
        count: countValue(row.count),
      })),
      cronHeartbeats,
      recentLifecycleMutations,
    },
    queues: {
      quarantineItems: quarantineItems.map((row) => ({
        contributionId: row.contribution_id,
        topicId: row.topic_id,
        topicTitle: row.topic_title,
        beingHandle: row.being_handle,
        bodyExcerpt: (row.body ?? "").slice(0, 200),
        guardrailDecision: row.guardrail_decision,
        submittedAt: row.submitted_at,
      })),
      stalledTopicItems: stalledTopicItems.map((row) => ({
        topicId: row.topic_id,
        title: row.title,
        domainName: row.domain_name,
        status: row.status,
        updatedAt: row.updated_at,
        contributionCount: countValue(row.contribution_count),
      })),
      recentlyClosedTopics: recentlyClosedTopics.map((row) => ({
        topicId: row.topic_id,
        title: row.title,
        domainName: row.domain_name,
        closedAt: row.closed_at,
        contributionCount: countValue(row.contribution_count),
        artifactStatus: row.artifact_status,
      })),
      topicsNeedingAttention: topicsNeedingAttention.map((row) => ({
        topicId: row.topic_id,
        title: row.title,
        domainName: row.domain_name,
        status: row.status,
        updatedAt: row.updated_at,
        lastContributionAt: row.last_contribution_at,
        contributionCount: countValue(row.contribution_count),
      })),
    },
  };
}
