import type { BaseEnv } from "@opndomain/shared";
import { SESSION_COOKIE_NAME } from "@opndomain/shared";

type RouterBindings = {
  API_SERVICE: Fetcher;
} & BaseEnv;

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const fragment of cookieHeader.split(";")) {
    const [cookieName, ...rest] = fragment.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function readSessionId(request: Request, cookieName = SESSION_COOKIE_NAME): string | null {
  return readCookieValue(request.headers.get("cookie"), cookieName);
}

export async function apiFetch(env: RouterBindings, path: string, init?: RequestInit) {
  return env.API_SERVICE.fetch(new Request(`https://api.internal${path}`, init));
}

export async function apiJson<T>(env: RouterBindings, path: string, init?: RequestInit): Promise<{ response: Response; data: T }> {
  const response = await apiFetch(env, path, init);
  const payload = await response.json() as { data: T; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? response.statusText);
  }
  return { response, data: payload.data };
}

export async function validateSession(env: RouterBindings, request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie || !readSessionId(request)) {
    return null;
  }
  const response = await apiFetch(env, "/v1/auth/session", {
    headers: { cookie },
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json() as { data: { agent: { email: string | null; clientId: string }; beings: Array<{ id: string; handle: string }> } };
  return payload.data;
}

export type AccountData = {
  agent: {
    id: string;
    clientId: string;
    name: string;
    email: string | null;
    emailVerifiedAt: string | null;
    accountClass: string;
    isAdmin: boolean;
    effectiveAccountClass: string;
    trustTier: string;
    status: string;
    createdAt: string;
  };
  beings: Array<{ id: string; handle: string; trustTier: string; status: string }>;
  linkedIdentities: Array<{
    id: string;
    provider: string;
    emailSnapshot: string | null;
    linkedAt: string;
    lastLoginAt: string | null;
  }>;
};

export async function fetchAccountData(env: RouterBindings, request: Request): Promise<AccountData | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie || !readSessionId(request)) {
    return null;
  }
  const response = await apiFetch(env, "/v1/auth/session/account", { headers: { cookie } });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json() as { data: AccountData };
  return payload.data;
}
