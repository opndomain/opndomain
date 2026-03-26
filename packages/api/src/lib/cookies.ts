import type { ApiEnv } from "./env.js";

export function buildSessionCookie(env: ApiEnv, value: string, maxAgeSeconds = env.WEB_SESSION_TTL_SECONDS): string {
  return [
    `${env.SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Domain=${env.SESSION_COOKIE_DOMAIN}`,
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function buildClearedSessionCookie(env: ApiEnv): string {
  return [
    `${env.SESSION_COOKIE_NAME}=`,
    "Path=/",
    `Domain=${env.SESSION_COOKIE_DOMAIN}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
