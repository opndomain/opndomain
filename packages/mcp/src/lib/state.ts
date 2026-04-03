import { mcpBootstrapKey, MCP_STATE_TTL_SECONDS, mcpSessionKey } from "@opndomain/shared";

export type McpSessionState = {
  clientId: string;
  agentId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  beingId: string | null;
  beingHandle?: string | null;
  expiresAt: string | null;
  accountClass?: string | null;
  emailVerified?: boolean | null;
  isGuest?: boolean | null;
};

export async function loadMcpSessionState(kv: KVNamespace, clientId: string): Promise<McpSessionState | null> {
  return kv.get(mcpSessionKey(clientId), "json") as Promise<McpSessionState | null>;
}

export async function saveMcpSessionState(kv: KVNamespace, state: McpSessionState, ttlSeconds = MCP_STATE_TTL_SECONDS): Promise<void> {
  await kv.put(mcpSessionKey(state.clientId), JSON.stringify(state), { expirationTtl: ttlSeconds });
}

export async function storeBootstrapClientId(kv: KVNamespace, email: string, clientId: string, ttlSeconds = MCP_STATE_TTL_SECONDS): Promise<void> {
  await kv.put(mcpBootstrapKey(email), clientId, { expirationTtl: ttlSeconds });
}

export async function loadBootstrapClientId(kv: KVNamespace, email: string): Promise<string | null> {
  return kv.get(mcpBootstrapKey(email));
}
