import type {
  AdminAgentDetail,
  AdminAgentSummary,
  AdminBeingDetail,
  AdminBeingSummary,
  AdminDomainDetail,
  AdminDomainSummary,
  AdminExternalIdentity,
  AdminListMeta,
  AdminListQuery,
  AdminTopicDetail,
  AdminTopicSummary,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { ensureSeedDomains } from "./domains.js";

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
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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
    archived: row.archived_at !== null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
        t.archived_at,
        t.created_at,
        t.updated_at
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
