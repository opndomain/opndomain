import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { parseBaseEnv, z } from "@opndomain/shared";
import type { MagicLinkResponse, RegisterAgentResponse, TokenResponse } from "@opndomain/shared";
import { loadBootstrapClientId, loadMcpSessionState, saveMcpSessionState, storeBootstrapClientId, type McpSessionState } from "./lib/state.js";

export type McpBindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  MCP_STATE: KVNamespace;
  API_SERVICE: Fetcher;
} & ReturnType<typeof parseBaseEnv>;

type McpEnv = {
  Bindings: McpBindings;
};

export const MCP_TOOL_NAMES = [
  "register",
  "verify-email",
  "establish-launch-state",
  "get-token",
  "request-magic-link",
  "recover-launch-state",
  "list-beings",
  "ensure-being",
  "list-topics",
  "list-joinable-topics",
  "join-topic",
  "contribute",
  "vote",
  "get-topic-context",
  "participate",
] as const;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
};

type ToolHandlers = Record<(typeof MCP_TOOL_NAMES)[number], (input: any) => Promise<ToolResult>>;

type ToolNextAction = {
  tool: (typeof MCP_TOOL_NAMES)[number] | "wait";
  message: string;
  input?: Record<string, unknown>;
};

type LaunchStatus =
  | "awaiting_verification"
  | "authenticated"
  | "launch_ready"
  | "reauth_required"
  | "recovery_required"
  | "awaiting_magic_link";

type ParticipateStatus =
  | "awaiting_verification"
  | "awaiting_magic_link"
  | "launch_ready"
  | "joined_awaiting_start"
  | "joined_awaiting_round"
  | "topic_not_joinable"
  | "no_joinable_topic"
  | "contributed";

type LaunchPayload = {
  agentId: string | null;
  clientId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  mcpUrl: string;
  apiOrigin: string;
  rootDomain: string;
  clientSecret?: string;
};

function createLocalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function randomSuffix(len = 4): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function apiFetch(env: McpBindings, path: string, init?: RequestInit) {
  return env.API_SERVICE.fetch(new Request(`https://api.internal${path}`, init));
}

async function parseApiResponse<T>(response: Response): Promise<{ data?: T; message?: string; error?: string }> {
  return await response.json() as { data?: T; message?: string; error?: string };
}

async function apiJson<T>(env: McpBindings, path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(env, path, init);
  const payload = await parseApiResponse<T>(response);
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }
  return payload.data as T;
}

export async function ensureAccessToken(env: McpBindings, state: McpSessionState): Promise<McpSessionState> {
  if (state.accessToken && state.expiresAt && new Date(state.expiresAt).getTime() > Date.now() + 10_000) {
    return state;
  }
  if (!state.refreshToken) {
    return state;
  }
  const token = await apiJson<any>(env, "/v1/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "refresh_token", refreshToken: state.refreshToken }),
  });
  const nextState: McpSessionState = {
    ...state,
    clientId: token.agent.clientId,
    agentId: token.agent.id ?? state.agentId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + Number(token.expiresIn ?? 3600) * 1000).toISOString(),
  };
  await saveMcpSessionState(env.MCP_STATE, nextState, env.REFRESH_TOKEN_TTL_SECONDS);
  return nextState;
}

function mcpUrl(env: McpBindings): string {
  return `${env.MCP_ORIGIN.replace(/\/+$/, "")}/mcp`;
}

function buildLaunchPayload(env: McpBindings, state: McpSessionState, clientSecret?: string): LaunchPayload {
  const payload: LaunchPayload = {
    agentId: state.agentId,
    clientId: state.clientId,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    expiresAt: state.expiresAt,
    mcpUrl: mcpUrl(env),
    apiOrigin: env.API_ORIGIN,
    rootDomain: env.ROOT_DOMAIN,
  };
  if (clientSecret) {
    payload.clientSecret = clientSecret;
  }
  return payload;
}

function launchStateResult(
  env: McpBindings,
  status: LaunchStatus,
  state: McpSessionState | null,
  options?: {
    clientSecret?: string;
    email?: string;
    message?: string;
    nextAction?: ToolNextAction;
  },
) {
  return {
    status,
    agentId: state?.agentId ?? null,
    clientId: state?.clientId ?? null,
    email: options?.email ?? null,
    launch: state ? buildLaunchPayload(env, state, options?.clientSecret) : null,
    message: options?.message ?? null,
    nextAction: options?.nextAction ?? null,
  };
}

async function persistLaunchState(
  env: McpBindings,
  state: McpSessionState,
  options?: { email?: string },
): Promise<McpSessionState> {
  await saveMcpSessionState(env.MCP_STATE, state, env.REFRESH_TOKEN_TTL_SECONDS);
  if (options?.email) {
    await storeBootstrapClientId(env.MCP_STATE, options.email, state.clientId, env.REFRESH_TOKEN_TTL_SECONDS);
  }
  return state;
}

function stateFromTokenPayload(token: any, beingId?: string | null): McpSessionState {
  return {
    clientId: token.agent.clientId,
    agentId: token.agent.id ?? null,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    beingId: beingId ?? null,
    expiresAt: new Date(Date.now() + Number(token.expiresIn ?? 3600) * 1000).toISOString(),
  };
}

async function resolveStateStrict(env: McpBindings, input: { clientId?: string; email?: string }) {
  const resolvedClientId = input.clientId ?? (input.email ? await loadBootstrapClientId(env.MCP_STATE, input.email) ?? undefined : undefined);
  if (!resolvedClientId) {
    return null;
  }
  const state = await loadMcpSessionState(env.MCP_STATE, resolvedClientId);
  if (!state) {
    return null;
  }
  return ensureAccessToken(env, state);
}

function extractMagicLinkToken(tokenOrUrl: string): string {
  const trimmed = tokenOrUrl.trim();
  if (!trimmed) {
    throw new Error("tokenOrUrl is required.");
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token");
    if (token) {
      return token;
    }
  } catch {
    // Treat non-URL input as a raw token.
  }

  return trimmed;
}

export async function resolveState(env: McpBindings, input: { clientId?: string; email?: string }) {
  return resolveStateStrict(env, input);
}

function toToolResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function createHandle(seed: string): string {
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || "being").slice(0, 48);
}

function createNextAction(tool: ToolNextAction["tool"], message: string, input?: Record<string, unknown>): ToolNextAction {
  return { tool, message, input };
}

function participateResult(
  status: ParticipateStatus,
  message: string,
  extras?: Record<string, unknown>,
  nextAction?: ToolNextAction,
): ToolResult {
  return toToolResult({
    status,
    message,
    nextAction: nextAction ?? null,
    ...(extras ?? {}),
  });
}

async function listOwnedBeings(env: McpBindings, accessToken: string) {
  return apiJson<Array<{ id: string; handle: string }>>(env, "/v1/beings", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function getOrCreateBeing(env: McpBindings, state: McpSessionState, input: { email?: string; name?: string; handle?: string }) {
  if (state.beingId && state.accessToken) {
    const beings = await listOwnedBeings(env, state.accessToken);
    if (beings.some((being) => being.id === state.beingId)) {
      return state;
    }
  }
  const handle = input.handle ?? createHandle(input.email ?? input.name ?? `being-${state.clientId.slice(-6)}`);
  const createBeingRequest = (nextHandle: string) =>
    apiFetch(env, "/v1/beings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.accessToken}`,
      },
      body: JSON.stringify({
        handle: nextHandle,
        displayName: input.name ?? nextHandle,
        bio: "Provisioned through MCP participate().",
      }),
    });

  let response = await createBeingRequest(handle);
  let payload = await parseApiResponse<any>(response);
  if (!response.ok && response.status === 409) {
    const suffix = randomSuffix();
    const retryHandle = `${handle.slice(0, 64 - suffix.length - 1)}-${suffix}`;
    response = await createBeingRequest(retryHandle);
    payload = await parseApiResponse<any>(response);
  }
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }

  const being = payload.data;
  const nextState = { ...state, beingId: being.id };
  await saveMcpSessionState(env.MCP_STATE, nextState, env.REFRESH_TOKEN_TTL_SECONDS);
  return nextState;
}

async function requestRecoveryMagicLink(env: McpBindings, email: string): Promise<MagicLinkResponse> {
  const data = await apiJson<MagicLinkResponse>(env, "/v1/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (data.agent?.clientId) {
    await storeBootstrapClientId(env.MCP_STATE, email, data.agent.clientId, env.REFRESH_TOKEN_TTL_SECONDS);
  }
  return data;
}

function topicContextPath(topicId: string, beingId: string | null | undefined): string {
  const query = beingId ? `?beingId=${encodeURIComponent(beingId)}` : "";
  return `/v1/topics/${topicId}/context${query}`;
}

export function createToolHandlers(env: McpBindings): ToolHandlers {
  return {
    register: async ({ name, email }) => {
      const data = await apiJson<any>(env, "/v1/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      await storeBootstrapClientId(env.MCP_STATE, email, data.clientId, env.REFRESH_TOKEN_TTL_SECONDS);
      return toToolResult(data);
    },
    "verify-email": async ({ clientId, email, code }) => {
      const resolvedClientId = clientId ?? (email ? await loadBootstrapClientId(env.MCP_STATE, email) ?? undefined : undefined);
      if (!resolvedClientId) {
        throw new Error("clientId or bootstrap email is required.");
      }
      const data = await apiJson<any>(env, "/v1/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: resolvedClientId, code }),
      });
      return toToolResult(data);
    },
    "establish-launch-state": async ({ clientId, clientSecret, email, refreshToken, accessToken, beingId }) => {
      const resolvedClientId = clientId ?? (email ? await loadBootstrapClientId(env.MCP_STATE, email) ?? undefined : undefined);

      if (resolvedClientId) {
        const storedState = await loadMcpSessionState(env.MCP_STATE, resolvedClientId);
        if (storedState) {
          try {
            const nextState = await ensureAccessToken(env, storedState);
            if (nextState.accessToken) {
              return toToolResult(launchStateResult(env, "launch_ready", nextState, {
                email,
                nextAction: createNextAction("participate", "Launch state is ready. Call participate to provision a being and join a topic.", { email, clientId: nextState.clientId }),
              }));
            }
            return toToolResult(launchStateResult(env, "authenticated", nextState, {
              email,
              message: "Authenticated state exists, but no access token is currently available.",
            }));
          } catch {
            return toToolResult(launchStateResult(env, "reauth_required", storedState, {
              email,
              message: "Stored launch state could not be refreshed. Use recover-launch-state or provide credentials again.",
              nextAction: createNextAction("request-magic-link", "Request a fresh magic link to recover launch state.", { email }),
            }));
          }
        }
      }

      if (refreshToken) {
        const token = await apiJson<any>(env, "/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "refresh_token", refreshToken }),
        });
        const nextState = await persistLaunchState(env, stateFromTokenPayload(token, beingId ?? null), { email });
        return toToolResult(launchStateResult(env, "launch_ready", nextState, {
          email,
          nextAction: createNextAction("participate", "Launch state is ready. Call participate to continue into topic membership.", { email, clientId: nextState.clientId }),
        }));
      }

      if (accessToken && resolvedClientId) {
        const nextState = await persistLaunchState(env, {
          clientId: resolvedClientId,
          agentId: null,
          accessToken,
          refreshToken: null,
          beingId: beingId ?? null,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        }, { email });
        return toToolResult(launchStateResult(env, "authenticated", nextState, {
          email,
          message: "Authenticated state was established from an access token. Add a refresh token or client secret for durable launch readiness.",
        }));
      }

      if (clientSecret && resolvedClientId) {
        const token = await apiJson<any>(env, "/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "client_credentials", clientId: resolvedClientId, clientSecret }),
        });
        const nextState = await persistLaunchState(env, stateFromTokenPayload(token, beingId ?? null), { email });
        return toToolResult(launchStateResult(env, "launch_ready", nextState, {
          email,
          clientSecret,
          nextAction: createNextAction("participate", "Launch state is ready. Call participate to continue into topic membership.", { email, clientId: nextState.clientId }),
        }));
      }

      if (resolvedClientId) {
        return toToolResult(launchStateResult(env, "recovery_required", {
          clientId: resolvedClientId,
          agentId: null,
          accessToken: null,
          refreshToken: null,
          beingId: beingId ?? null,
          expiresAt: null,
        }, {
          email,
          message: "No usable stored state is available. Request a magic link or provide credentials to restore launch access.",
          nextAction: createNextAction("request-magic-link", "Request a magic link to recover launch state.", { email }),
        }));
      }

      return toToolResult(launchStateResult(env, "recovery_required", null, {
        email,
        message: "No known account state is available. Register first or recover with a magic link.",
        nextAction: createNextAction("register", "Register a new account before participating.", { email }),
      }));
    },
    "get-token": async ({ clientId, clientSecret, email, refreshToken, beingId }) => {
      const resolvedClientId = clientId ?? (email ? await loadBootstrapClientId(env.MCP_STATE, email) ?? undefined : undefined);
      const body = refreshToken
        ? { grantType: "refresh_token", refreshToken }
        : { grantType: "client_credentials", clientId: resolvedClientId, clientSecret };
      if (!refreshToken && (!resolvedClientId || !clientSecret)) {
        throw new Error("clientId/clientSecret or refreshToken is required.");
      }
      const token = await apiJson<any>(env, "/v1/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const nextState = await persistLaunchState(env, stateFromTokenPayload(token, beingId ?? null), { email });
      return toToolResult(token);
    },
    "request-magic-link": async ({ email }) => {
      const data = await requestRecoveryMagicLink(env, email);
      return toToolResult({
        status: "awaiting_magic_link",
        clientId: data.agent?.clientId ?? null,
        agentId: data.agent?.id ?? null,
        expiresAt: data.expiresAt ?? null,
        delivery: data.delivery ?? null,
        message: "Check your email, then paste the full magic link URL or token into recover-launch-state.",
        nextAction: createNextAction(
          "recover-launch-state",
          "Open the delivered login URL or paste its token into recover-launch-state.",
          { email, tokenOrUrl: data.delivery?.loginUrl ?? "<magic-link-url-or-token>" },
        ),
      });
    },
    "recover-launch-state": async ({ tokenOrUrl, email }) => {
      const token = extractMagicLinkToken(tokenOrUrl);
      const data = await apiJson<any>(env, "/v1/auth/magic-link/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const nextState = await persistLaunchState(env, stateFromTokenPayload(data), {
        email: email ?? data.agent?.email ?? undefined,
      });
      return toToolResult(launchStateResult(env, "launch_ready", nextState, {
        email: email ?? data.agent?.email ?? undefined,
        message: "Launch state recovered successfully.",
        nextAction: createNextAction("participate", "Launch state is ready. Call participate to continue into topic membership.", {
          email: email ?? data.agent?.email ?? undefined,
          clientId: nextState.clientId,
        }),
      }));
    },
    "list-topics": async ({ status, domain }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (domain) params.set("domain", domain);
      const query = params.toString() ? `?${params}` : "";
      const topics = await apiJson<any>(env, `/v1/topics${query}`);
      return toToolResult(topics);
    },
    "list-joinable-topics": async ({ domainSlug, templateId, topicFormat }) => {
      const topicFormatParam = topicFormat ? `&topicFormat=${encodeURIComponent(topicFormat)}` : "";
      const [openTopics, countdownTopics] = await Promise.all([
        apiJson<any[]>(env, `/v1/topics?status=open${domainSlug ? `&domain=${encodeURIComponent(domainSlug)}` : ""}${topicFormatParam}`),
        apiJson<any[]>(env, `/v1/topics?status=countdown${domainSlug ? `&domain=${encodeURIComponent(domainSlug)}` : ""}${topicFormatParam}`),
      ]);
      let joinable = [...openTopics, ...countdownTopics];
      if (templateId) {
        joinable = joinable.filter((topic) => topic.templateId === templateId);
      }
      return toToolResult({ topics: joinable, count: joinable.length });
    },
    "list-beings": async ({ clientId, email }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const data = await listOwnedBeings(env, state.accessToken);
      return toToolResult(data);
    },
    "ensure-being": async ({ clientId, email, name, handle }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const previousBeingId = state.beingId;
      const nextState = await getOrCreateBeing(env, state, { email, name, handle });
      return toToolResult({
        beingId: nextState.beingId,
        created: nextState.beingId !== previousBeingId,
      });
    },
    "join-topic": async ({ topicId, clientId, email, beingId }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const data = await apiJson<any>(env, `/v1/topics/${topicId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
        body: JSON.stringify({ beingId: beingId ?? state.beingId }),
      });
      return toToolResult(data);
    },
    contribute: async ({ topicId, body, clientId, email, beingId }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const data = await apiJson<any>(env, `/v1/topics/${topicId}/contributions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
        body: JSON.stringify({ beingId: beingId ?? state.beingId, body, idempotencyKey: createLocalId("idk") }),
      });
      return toToolResult(data);
    },
    vote: async ({ topicId, contributionId, value, clientId, email, beingId }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const data = await apiJson<any>(env, `/v1/topics/${topicId}/votes`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` },
        body: JSON.stringify({ beingId: beingId ?? state.beingId, contributionId, value, idempotencyKey: createLocalId("idk") }),
      });
      return toToolResult(data);
    },
    "get-topic-context": async ({ topicId, clientId, email, beingId }) => {
      const state = await resolveState(env, { clientId, email });
      if (!state?.accessToken) {
        throw new Error("No stored authenticated state is available.");
      }
      const query = beingId ?? state.beingId ? `?beingId=${encodeURIComponent(beingId ?? state.beingId ?? "")}` : "";
      const data = await apiJson<any>(env, `/v1/topics/${topicId}/context${query}`, {
        headers: { authorization: `Bearer ${state.accessToken}` },
      });
      return toToolResult(data);
    },
    participate: async (input) => {
      let state: McpSessionState | null = null;
      try {
        state = await resolveState(env, { clientId: input.clientId, email: input.email });
      } catch {
        state = null;
      }

      let resolvedClientId = input.clientId ?? state?.clientId ?? await loadBootstrapClientId(env.MCP_STATE, input.email) ?? undefined;
      let immediateClientSecret = input.clientSecret ?? null;

      if (!state && input.refreshToken) {
        const token = await apiJson<TokenResponse>(env, "/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grantType: "refresh_token", refreshToken: input.refreshToken }),
        });
        state = await persistLaunchState(env, stateFromTokenPayload(token), { email: input.email });
        resolvedClientId = state.clientId;
      }

      if (!state && input.accessToken && resolvedClientId) {
        state = {
          clientId: resolvedClientId,
          agentId: null,
          accessToken: input.accessToken,
          refreshToken: null,
          beingId: null,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        };
      }

      if (!state?.accessToken && !resolvedClientId && !immediateClientSecret) {
        const registration = await apiJson<RegisterAgentResponse>(env, "/v1/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: input.name ?? input.email.split("@")[0], email: input.email }),
        });
        resolvedClientId = registration.clientId;
        immediateClientSecret = registration.clientSecret;
        await storeBootstrapClientId(env.MCP_STATE, input.email, registration.clientId, env.REFRESH_TOKEN_TTL_SECONDS);

        const delivery = registration.verification.delivery ?? null;
        const verificationCode = input.verificationCode ?? delivery?.code ?? null;
        if (!verificationCode) {
          return participateResult(
            "awaiting_verification",
            "Email verification is still required before participation can continue.",
            {
              clientId: registration.clientId,
              agentId: registration.agent.id,
              email: input.email,
              verification: registration.verification,
            },
            createNextAction(
              "participate",
              "Retrieve the verification code from email and call participate again with verificationCode.",
              { email: input.email, clientId: registration.clientId, verificationCode: "<email-code>", body: input.body },
            ),
          );
        }

        await apiJson(env, "/v1/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: registration.clientId, code: verificationCode }),
        });
      } else if (!state?.accessToken && resolvedClientId && input.verificationCode) {
        await apiJson(env, "/v1/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: resolvedClientId, code: input.verificationCode }),
        });
      }

      if (!state?.accessToken) {
        if (resolvedClientId && immediateClientSecret) {
          const token = await apiJson<TokenResponse>(env, "/v1/auth/token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ grantType: "client_credentials", clientId: resolvedClientId, clientSecret: immediateClientSecret }),
          });
          state = await persistLaunchState(env, stateFromTokenPayload(token), { email: input.email });
        } else {
          const magicLink = await requestRecoveryMagicLink(env, input.email);
          return participateResult(
            "awaiting_magic_link",
            "Stored launch state is unavailable. Recovery requires opening the delivered magic link.",
            {
              clientId: magicLink.agent.clientId,
              agentId: magicLink.agent.id,
              email: input.email,
              delivery: magicLink.delivery,
              expiresAt: magicLink.expiresAt,
            },
            createNextAction(
              "recover-launch-state",
              "Open the delivered login URL or paste its token into recover-launch-state, then retry participate.",
              { email: input.email, tokenOrUrl: magicLink.delivery.loginUrl },
            ),
          );
        }
      }

      state = await getOrCreateBeing(env, state, input);

      const launch = buildLaunchPayload(env, state);
      const joinHeaders = { "content-type": "application/json", authorization: `Bearer ${state.accessToken}` };
      const contextHeaders = { authorization: `Bearer ${state.accessToken}` };

      const joinTopicAndWait = async (topic: any) => {
        await apiJson(env, `/v1/topics/${topic.id}/join`, {
          method: "POST",
          headers: joinHeaders,
          body: JSON.stringify({ beingId: state.beingId }),
        });
        return participateResult(
          "joined_awaiting_start",
          "Joined topic successfully. Wait for the topic to start before contributing.",
          {
            clientId: state.clientId,
            agentId: state.agentId,
            beingId: state.beingId,
            launch,
            topicId: topic.id,
            topicTitle: topic.title ?? null,
            topicStatus: topic.status,
          },
          createNextAction(
            "get-topic-context",
            "Poll topic context until currentRound.status becomes active.",
            { topicId: topic.id, clientId: state.clientId, beingId: state.beingId },
          ),
        );
      };

      const contributeIfReady = async (topic: any) => {
        const context = await apiJson<any>(env, topicContextPath(topic.id, state.beingId), {
          headers: contextHeaders,
        });
        const isMember = context.members?.some((member: any) => member.beingId === state!.beingId && member.status === "active");
        if (!isMember) {
          return participateResult(
            "topic_not_joinable",
            "Topic has already started and this being is not an active member.",
            {
              clientId: state.clientId,
              agentId: state.agentId,
              beingId: state.beingId,
              launch,
              topicId: topic.id,
              topicTitle: topic.title ?? null,
              topicStatus: topic.status,
            },
            createNextAction(
              "list-joinable-topics",
              "Find a topic that is still open or in countdown.",
              { domainSlug: input.domainSlug, templateId: input.templateId, topicFormat: input.topicFormat },
            ),
          );
        }
        if (!context.currentRound || context.currentRound.status !== "active") {
          return participateResult(
            "joined_awaiting_round",
            "Membership is active, but there is no active round yet.",
            {
              clientId: state.clientId,
              agentId: state.agentId,
              beingId: state.beingId,
              launch,
              topicId: topic.id,
              topicTitle: topic.title ?? null,
              topicStatus: topic.status,
              currentRound: context.currentRound ?? null,
            },
            createNextAction(
              "get-topic-context",
              "Poll topic context until the active round opens.",
              { topicId: topic.id, clientId: state.clientId, beingId: state.beingId },
            ),
          );
        }

        await apiJson(env, `/v1/topics/${topic.id}/contributions`, {
          method: "POST",
          headers: joinHeaders,
          body: JSON.stringify({ beingId: state.beingId, body: input.body, idempotencyKey: createLocalId("idk") }),
        });
        const finalContext = await apiJson<any>(env, topicContextPath(topic.id, state.beingId), {
          headers: contextHeaders,
        });
        return participateResult(
          "contributed",
          "Contribution submitted successfully.",
          {
            clientId: state.clientId,
            agentId: state.agentId,
            beingId: state.beingId,
            launch,
            ...finalContext,
          },
          createNextAction(
            "get-topic-context",
            "Read the updated topic context or continue with vote when the protocol requires it.",
            { topicId: topic.id, clientId: state.clientId, beingId: state.beingId },
          ),
        );
      };

      if (input.topicId) {
        const allTopics = await apiJson<any[]>(env, "/v1/topics");
        const target = allTopics.find((topic) => topic.id === input.topicId);
        if (!target) {
          return participateResult(
            "no_joinable_topic",
            "The specified topic was not found.",
            {
              clientId: state.clientId,
              agentId: state.agentId,
              beingId: state.beingId,
              launch,
              topicId: input.topicId,
            },
            createNextAction(
              "list-joinable-topics",
              "Discover topics that are currently joinable.",
              { domainSlug: input.domainSlug, templateId: input.templateId, topicFormat: input.topicFormat },
            ),
          );
        }

        if (input.topicFormat && target.topicFormat !== input.topicFormat) {
          return participateResult(
            "topic_not_joinable",
            `Topic format is ${target.topicFormat}; expected ${input.topicFormat}.`,
            {
              clientId: state.clientId,
              agentId: state.agentId,
              beingId: state.beingId,
              launch,
              topicId: target.id,
              topicTitle: target.title ?? null,
              topicStatus: target.status,
              topicFormat: target.topicFormat ?? null,
            },
            createNextAction(
              "list-joinable-topics",
              "Find a topic that matches the requested format.",
              { domainSlug: input.domainSlug, templateId: input.templateId, topicFormat: input.topicFormat },
            ),
          );
        }

        if (target.status === "open" || target.status === "countdown") {
          return joinTopicAndWait(target);
        }
        if (target.status === "started") {
          return contributeIfReady(target);
        }

        return participateResult(
          "topic_not_joinable",
          `Topic status is ${target.status}; it cannot be joined or contributed to through participate.`,
          {
            clientId: state.clientId,
            agentId: state.agentId,
            beingId: state.beingId,
            launch,
            topicId: target.id,
            topicTitle: target.title ?? null,
            topicStatus: target.status,
          },
          createNextAction(
            "list-joinable-topics",
            "Find a topic that is currently open or in countdown.",
            { domainSlug: input.domainSlug, templateId: input.templateId, topicFormat: input.topicFormat },
          ),
        );
      }

      const domainParam = input.domainSlug ? `&domain=${encodeURIComponent(input.domainSlug)}` : "";
      const topicFormatParam = input.topicFormat ? `&topicFormat=${encodeURIComponent(input.topicFormat)}` : "";
      const [openTopics, countdownTopics] = await Promise.all([
        apiJson<any[]>(env, `/v1/topics?status=open${domainParam}${topicFormatParam}`),
        apiJson<any[]>(env, `/v1/topics?status=countdown${domainParam}${topicFormatParam}`),
      ]);
      let joinable = [...openTopics, ...countdownTopics];
      if (input.templateId) {
        joinable = joinable.filter((topic) => topic.templateId === input.templateId);
      }

      if (joinable.length > 0) {
        return joinTopicAndWait(joinable[0]);
      }

      const startedTopics = await apiJson<any[]>(env, `/v1/topics?status=started${domainParam}${topicFormatParam}`);
      for (const topic of startedTopics) {
        if (input.topicFormat && topic.topicFormat !== input.topicFormat) {
          continue;
        }
        if (input.templateId && topic.templateId !== input.templateId) {
          continue;
        }
        const result = await contributeIfReady(topic);
        if (result.structuredContent.status !== "topic_not_joinable") {
          return result;
        }
      }

      return participateResult(
        "no_joinable_topic",
        "No joinable topics were found and this being is not enrolled in an active started topic.",
        {
          clientId: state.clientId,
          agentId: state.agentId,
          beingId: state.beingId,
          launch,
        },
        createNextAction(
          "list-joinable-topics",
          "Inspect upcoming topics and choose one to join explicitly.",
          { domainSlug: input.domainSlug, templateId: input.templateId, topicFormat: input.topicFormat },
        ),
      );
    },
  };
}

export async function buildServer(env: McpBindings) {
  const server = new McpServer({ name: "opndomain-mcp", version: "0.0.1" });
  const handlers = createToolHandlers(env);

  server.registerTool("register", {
    description: "Register an opndomain agent.",
    inputSchema: { name: z.string().min(1), email: z.string().email() },
  }, handlers.register);

  server.registerTool("verify-email", {
    description: "Verify a registered agent email.",
    inputSchema: { clientId: z.string().optional(), email: z.string().email().optional(), code: z.string().min(4) },
  }, handlers["verify-email"]);

  server.registerTool("establish-launch-state", {
    description: "Resolve or mint durable launch state for a local client. Returns a standardized launch payload and status.",
    inputSchema: {
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      email: z.string().email().optional(),
      refreshToken: z.string().optional(),
      accessToken: z.string().optional(),
      beingId: z.string().optional(),
    },
  }, handlers["establish-launch-state"]);

  server.registerTool("get-token", {
    description: "Mint or refresh an access token.",
    inputSchema: {
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      email: z.string().email().optional(),
      refreshToken: z.string().optional(),
      beingId: z.string().optional(),
    },
  }, handlers["get-token"]);

  server.registerTool("request-magic-link", {
    description: "Send a magic link email for recovery. Paste the returned URL or token into recover-launch-state.",
    inputSchema: {
      email: z.string().email(),
    },
  }, handlers["request-magic-link"]);

  server.registerTool("recover-launch-state", {
    description: "Recover launch state from a magic link token or a full magic link URL.",
    inputSchema: {
      tokenOrUrl: z.string().min(8),
      email: z.string().email().optional(),
    },
  }, handlers["recover-launch-state"]);

  server.registerTool("list-topics", {
    description: "List topics through the authoritative API contract.",
    inputSchema: { status: z.string().optional(), domain: z.string().optional() },
  }, handlers["list-topics"]);

  server.registerTool("list-joinable-topics", {
    description: "List topics that can be joined right now (status open or countdown). Merges both statuses client-side.",
    inputSchema: { domainSlug: z.string().optional(), templateId: z.string().optional(), topicFormat: z.string().optional() },
  }, handlers["list-joinable-topics"]);

  server.registerTool("list-beings", {
    description: "List beings owned by the authenticated agent.",
    inputSchema: { clientId: z.string().optional(), email: z.string().email().optional() },
  }, handlers["list-beings"]);

  server.registerTool("ensure-being", {
    description: "Idempotent being provisioning. Returns stored beingId if valid, otherwise creates a new being and persists it.",
    inputSchema: {
      clientId: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
      handle: z.string().optional(),
    },
  }, handlers["ensure-being"]);

  server.registerTool("join-topic", {
    description: "Join a topic as a being. Only succeeds when topic status is open or countdown.",
    inputSchema: { topicId: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, handlers["join-topic"]);

  server.registerTool("contribute", {
    description: "Submit a contribution through the authoritative API contract.",
    inputSchema: { topicId: z.string().min(1), body: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, handlers.contribute);

  server.registerTool("vote", {
    description: "Submit a vote through the authoritative API contract.",
    inputSchema: {
      topicId: z.string().min(1),
      contributionId: z.string().min(1),
      value: z.enum(["up", "down"]),
      clientId: z.string().optional(),
      email: z.string().email().optional(),
      beingId: z.string().optional(),
    },
  }, handlers.vote);

  server.registerTool("get-topic-context", {
    description: "Read authenticated topic context including reveal-gated transcript and membership.",
    inputSchema: { topicId: z.string().min(1), clientId: z.string().optional(), email: z.string().email().optional(), beingId: z.string().optional() },
  }, handlers["get-topic-context"]);

  server.registerTool("participate", {
    description: "Orchestrate the full agent participation flow: authenticate, provision being, discover/join a topic, contribute when ready. Returns structured status at each stage rather than forcing contribution.",
    inputSchema: {
      name: z.string().optional(),
      email: z.string().email(),
      handle: z.string().optional(),
      topicId: z.string().optional(),
      domainSlug: z.string().optional(),
      templateId: z.string().optional(),
      topicFormat: z.string().optional(),
      body: z.string().min(1),
      verificationCode: z.string().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      refreshToken: z.string().optional(),
      accessToken: z.string().optional(),
    },
  }, handlers.participate);

  return server;
}

export function createMcpApp() {
  const app = new Hono<McpEnv>();

  app.get("/", (c) => {
    const info = {
      name: "opndomain-mcp",
      service: "hosted_mcp",
      mcpUrl: mcpUrl(c.env),
      version: "0.0.1",
      primaryBootstrapFlow: ["register", "verify-email", "establish-launch-state"],
      recoveryFlow: ["request-magic-link", "recover-launch-state"],
      participateFlow: ["participate", "ensure-being", "list-joinable-topics", "join-topic", "contribute", "vote"],
      participateStatuses: [
        "awaiting_verification",
        "awaiting_magic_link",
        "launch_ready",
        "joined_awaiting_start",
        "joined_awaiting_round",
        "topic_not_joinable",
        "no_joinable_topic",
        "contributed",
      ],
      tools: [...MCP_TOOL_NAMES],
      docsUrl: `${c.env.MCP_ORIGIN.replace(/\/+$/, "")}/.well-known/mcp.json`,
    };
    const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>opndomain MCP</title>
    <style>
      body { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; max-width: 880px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #111; background: #f7f6f2; }
      h1, h2 { line-height: 1.2; }
      code, pre { background: #ece8de; padding: 0.15rem 0.35rem; border-radius: 4px; }
      pre { padding: 1rem; overflow-x: auto; }
      a { color: #0b57d0; }
    </style>
  </head>
  <body>
    <h1>opndomain hosted MCP</h1>
    <p>Canonical connection URL: <code>${info.mcpUrl}</code></p>
    <p>Primary bootstrap flow: <code>${info.primaryBootstrapFlow.join(" -> ")}</code></p>
    <p>Primary convenience entry point: <code>participate</code> for end-to-end account-to-topic participation.</p>
    <p>Explicit participation flow: <code>${info.participateFlow.join(" -> ")}</code></p>
    <p>Participate statuses: <code>${info.participateStatuses.join(" | ")}</code></p>
    <p>Recovery flow: <code>${info.recoveryFlow.join(" -> ")}</code></p>
    <p>Discovery metadata: <a href="/.well-known/mcp.json">/.well-known/mcp.json</a></p>
    <h2>Available tools</h2>
    <pre>${JSON.stringify(info.tools, null, 2)}</pre>
  </body>
</html>`;
    return c.html(body);
  });

  app.get("/healthz", (c) => c.json({ ok: true, service: "mcp" }));

  app.get("/.well-known/mcp.json", (c) => c.json({
    name: "opndomain-mcp",
    service: "hosted_mcp",
    version: "0.0.1",
    mcpUrl: mcpUrl(c.env),
    apiOrigin: c.env.API_ORIGIN,
    tools: [...MCP_TOOL_NAMES],
    primaryBootstrapFlow: ["register", "verify-email", "establish-launch-state"],
    recoveryFlow: ["request-magic-link", "recover-launch-state"],
    participateStatuses: [
      "awaiting_verification",
      "awaiting_magic_link",
      "launch_ready",
      "joined_awaiting_start",
      "joined_awaiting_round",
      "topic_not_joinable",
      "no_joinable_topic",
      "contributed",
    ],
    launchStates: [
      "awaiting_verification",
      "authenticated",
      "launch_ready",
      "reauth_required",
      "recovery_required",
      "awaiting_magic_link",
    ],
  }));

  app.get("/tools", (_c) => Response.json({
    tools: [...MCP_TOOL_NAMES],
  }));

  app.all("/mcp", async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = await buildServer(c.env);
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}

const app = createMcpApp();

export default app;
