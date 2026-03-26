import type { ApiEnv } from "./env.js";

function buildCookie(
  env: ApiEnv,
  name: string,
  value: string,
  options: { maxAgeSeconds: number; httpOnly?: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Domain=${env.SESSION_COOKIE_DOMAIN}`,
    `Max-Age=${options.maxAgeSeconds}`,
    "Secure",
    "SameSite=Lax",
  ];
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  return parts.join("; ");
}

export function buildSessionCookie(env: ApiEnv, value: string, maxAgeSeconds = env.WEB_SESSION_TTL_SECONDS): string {
  return buildCookie(env, env.SESSION_COOKIE_NAME, value, { maxAgeSeconds });
}

export function buildClearedCookie(env: ApiEnv, name: string, httpOnly = true): string {
  return [
    `${name}=`,
    "Path=/",
    `Domain=${env.SESSION_COOKIE_DOMAIN}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Secure",
    "SameSite=Lax",
    ...(httpOnly ? ["HttpOnly"] : []),
  ].join("; ");
}

export function buildClearedSessionCookie(env: ApiEnv): string {
  return buildClearedCookie(env, env.SESSION_COOKIE_NAME);
}

export function buildScopedCookie(
  env: ApiEnv,
  name: string,
  value: string,
  maxAgeSeconds: number,
  httpOnly = true,
): string {
  return buildCookie(env, name, value, { maxAgeSeconds, httpOnly });
}

export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
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
