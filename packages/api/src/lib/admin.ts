import { forbidden } from "./errors.js";
import type { AgentRecord } from "../services/auth.js";
import type { ApiEnv } from "./env.js";

export function isAdminAgent(env: ApiEnv, agent: Pick<AgentRecord, "email" | "clientId">): boolean {
  const normalizedEmail = agent.email?.toLowerCase() ?? "";
  return Boolean(
    env.ADMIN_ALLOWED_CLIENT_IDS_SET?.has(agent.clientId) ||
    (normalizedEmail && env.ADMIN_ALLOWED_EMAILS_SET?.has(normalizedEmail))
  );
}

export function assertAdminAgent(env: ApiEnv, agent: Pick<AgentRecord, "email" | "clientId">): void {
  if (isAdminAgent(env, agent)) {
    return;
  }

  forbidden("This action requires operator authorization.");
}
