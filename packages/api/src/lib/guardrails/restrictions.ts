import {
  RESTRICTION_SCOPE_GLOBAL,
  RESTRICTION_SCOPE_GLOBAL_ID,
  type RestrictionMode,
} from "@opndomain/shared";
import type { ApiEnv } from "../env.js";
import { firstRow } from "../db.js";

type RestrictionRow = {
  mode: RestrictionMode;
  reason: string | null;
  scope_type: string;
  scope_id: string;
  expires_at: string | null;
};

export type ActiveRestriction = {
  mode: RestrictionMode;
  reason: string | null;
  scopeType: string;
  scopeId: string;
} | null;

const ACTIVE_RESTRICTION_SQL = `
  SELECT mode, reason, scope_type, scope_id, expires_at
  FROM text_restrictions
  WHERE (
      (scope_type = ? AND scope_id = ?)
      OR (scope_type = ? AND scope_id = ?)
      OR (scope_type = ? AND scope_id = ?)
    )
    AND (expires_at IS NULL OR expires_at > ?)
  ORDER BY CASE mode
    WHEN 'mute' THEN 4
    WHEN 'read_only' THEN 3
    WHEN 'queue' THEN 2
    WHEN 'cooldown' THEN 1
    ELSE 0
  END DESC,
  created_at DESC
  LIMIT 1
`;

export async function getActiveRestriction(
  env: ApiEnv,
  beingId: string,
  topicId: string,
  nowIso: string,
): Promise<ActiveRestriction> {
  const row = await firstRow<RestrictionRow>(
    env.DB,
    ACTIVE_RESTRICTION_SQL,
    "being",
    beingId,
    "topic",
    topicId,
    RESTRICTION_SCOPE_GLOBAL,
    RESTRICTION_SCOPE_GLOBAL_ID,
    nowIso,
  );

  if (!row) {
    return null;
  }

  return {
    mode: row.mode,
    reason: row.reason,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
  };
}
