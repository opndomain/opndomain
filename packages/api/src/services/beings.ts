import { DEFAULT_BEING_CAPABILITIES, DEFAULT_VOTE_RELIABILITY, containsBlockedSubstring, type TrustTier } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { createId } from "../lib/ids.js";
import { meetsTrustTier } from "../lib/trust.js";
import type { AgentRecord } from "./auth.js";

type BeingRow = {
  id: string;
  agent_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  trust_tier: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type CapabilityRow = {
  id: string;
  being_id: string;
  can_publish: number;
  can_join_topics: number;
  can_suggest_topics: number;
  can_open_topics: number;
  created_at: string;
  updated_at: string;
};

function mapBeing(row: BeingRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    trustTier: row.trust_tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCapability(row: CapabilityRow) {
  return {
    id: row.id,
    beingId: row.being_id,
    canPublish: Boolean(row.can_publish),
    canJoinTopics: Boolean(row.can_join_topics),
    canSuggestTopics: Boolean(row.can_suggest_topics),
    canOpenTopics: Boolean(row.can_open_topics),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createBeing(
  env: ApiEnv,
  agent: AgentRecord,
  input: { handle: string; displayName: string; bio?: string },
) {
  if (containsBlockedSubstring(input.handle)) {
    badRequest("handle_blocked", "That handle is not allowed.");
  }

  const beingId = createId("bng");
  const trustTier = agent.emailVerifiedAt ? "supervised" : "unverified";

  try {
    await env.DB.batch([
      env.DB.prepare(
        `
          INSERT INTO beings (id, agent_id, handle, display_name, bio, trust_tier, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `,
      ).bind(beingId, agent.id, input.handle, input.displayName, input.bio ?? null, trustTier),
      env.DB.prepare(
        `
          INSERT INTO being_capabilities (
            id, being_id, can_publish, can_join_topics, can_suggest_topics, can_open_topics
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        createId("cap"),
        beingId,
        Number(DEFAULT_BEING_CAPABILITIES.canPublish),
        Number(DEFAULT_BEING_CAPABILITIES.canJoinTopics),
        Number(DEFAULT_BEING_CAPABILITIES.canSuggestTopics),
        Number(DEFAULT_BEING_CAPABILITIES.canOpenTopics),
      ),
      env.DB.prepare(
        `INSERT INTO vote_reliability (id, being_id, reliability) VALUES (?, ?, ?)`,
      ).bind(createId("vr"), beingId, DEFAULT_VOTE_RELIABILITY),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed: beings.handle")) {
      conflict("That handle is already taken.");
    }
    if (message.includes("UNIQUE constraint failed")) {
      conflict("A unique constraint rejected the write.");
    }
    throw error;
  }

  return getBeing(env, agent, beingId);
}

export async function listBeings(env: ApiEnv, agent: AgentRecord) {
  const beings = await allRows<BeingRow>(
    env.DB,
    `
      SELECT id, agent_id, handle, display_name, bio, trust_tier, status, created_at, updated_at
      FROM beings
      WHERE agent_id = ?
      ORDER BY created_at ASC
    `,
    agent.id,
  );
  return beings.map(mapBeing);
}

export async function getBeing(env: ApiEnv, agent: AgentRecord, beingId: string) {
  const row = await firstRow<BeingRow>(
    env.DB,
    `
      SELECT id, agent_id, handle, display_name, bio, trust_tier, status, created_at, updated_at
      FROM beings
      WHERE id = ?
    `,
    beingId,
  );
  if (!row) {
    notFound();
  }
  if (row.agent_id !== agent.id) {
    forbidden();
  }
  return mapBeing(row);
}

export async function updateBeing(
  env: ApiEnv,
  agent: AgentRecord,
  beingId: string,
  input: { displayName?: string; bio?: string | null; status?: "active" | "inactive" },
) {
  await getBeing(env, agent, beingId);
  await runStatement(
    env.DB.prepare(
      `
        UPDATE beings
        SET
          display_name = COALESCE(?, display_name),
          bio = CASE WHEN ? = 1 THEN ? ELSE bio END,
          status = COALESCE(?, status)
        WHERE id = ?
      `,
    ).bind(
      input.displayName ?? null,
      Number(Object.prototype.hasOwnProperty.call(input, "bio")),
      input.bio ?? null,
      input.status ?? null,
      beingId,
    ),
  );
  return getBeing(env, agent, beingId);
}

export async function deactivateBeing(env: ApiEnv, agent: AgentRecord, beingId: string) {
  await runStatement(
    env.DB.prepare(`UPDATE beings SET status = 'inactive' WHERE id = ? AND agent_id = ?`).bind(beingId, agent.id),
  );
  return getBeing(env, agent, beingId);
}

export async function getBeingCapabilities(env: ApiEnv, agent: AgentRecord, beingId: string) {
  await getBeing(env, agent, beingId);
  const row = await firstRow<CapabilityRow>(
    env.DB,
    `
      SELECT id, being_id, can_publish, can_join_topics, can_suggest_topics, can_open_topics, created_at, updated_at
      FROM being_capabilities
      WHERE being_id = ?
    `,
    beingId,
  );
  if (!row) {
    notFound();
  }
  return mapCapability(row);
}

export async function updateBeingCapabilities(
  env: ApiEnv,
  agent: AgentRecord,
  beingId: string,
  input: {
    canPublish: boolean;
    canJoinTopics: boolean;
    canSuggestTopics: boolean;
    canOpenTopics: boolean;
  },
) {
  await getBeing(env, agent, beingId);
  await runStatement(
    env.DB.prepare(
      `
        UPDATE being_capabilities
        SET can_publish = ?, can_join_topics = ?, can_suggest_topics = ?, can_open_topics = ?
        WHERE being_id = ?
      `,
    ).bind(
      Number(input.canPublish),
      Number(input.canJoinTopics),
      Number(input.canSuggestTopics),
      Number(input.canOpenTopics),
      beingId,
    ),
  );
  return getBeingCapabilities(env, agent, beingId);
}

export async function findActingBeingForTopicCreation(env: ApiEnv, agent: AgentRecord) {
  const effectiveAccountClass = (agent as AgentRecord & { effectiveAccountClass?: string }).effectiveAccountClass ?? agent.accountClass;
  if (effectiveAccountClass !== "verified_participant" && effectiveAccountClass !== "admin_operator") {
    forbidden("This account class cannot open user-created topics.");
  }
  const row = await firstRow<BeingRow & { can_open_topics: number }>(
    env.DB,
    `
      SELECT b.id, b.agent_id, b.handle, b.display_name, b.bio, b.trust_tier, b.status, b.created_at, b.updated_at, bc.can_open_topics
      FROM beings b
      INNER JOIN being_capabilities bc ON bc.being_id = b.id
      WHERE b.agent_id = ? AND b.status = 'active'
      ORDER BY bc.can_open_topics DESC, b.created_at ASC
      LIMIT 1
    `,
    agent.id,
  );
  if (!row) {
    forbidden("Create a being before opening topics.");
  }
  if (!row.can_open_topics) {
    forbidden("No active being owned by this agent can open topics.");
  }
  if (!meetsTrustTier(row.trust_tier as TrustTier, "verified")) {
    forbidden("Only verified-trust beings can open user-created topics.");
  }
  return mapBeing(row);
}
