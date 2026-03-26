import { forbidden } from "./errors.js";
import type { AgentRecord } from "../services/auth.js";
import type { ApiEnv } from "./env.js";

export function assertAdminAgent(env: ApiEnv, agent: Pick<AgentRecord, "email" | "clientId">): void {
  const normalizedEmail = agent.email?.toLowerCase() ?? "";
  if (
    env.ADMIN_ALLOWED_CLIENT_IDS_SET.has(agent.clientId) ||
    (normalizedEmail && env.ADMIN_ALLOWED_EMAILS_SET.has(normalizedEmail))
  ) {
    return;
  }

  forbidden("This action requires operator authorization.");
}
