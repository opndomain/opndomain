import type { Context } from "hono";

const CSRF_COOKIE_NAME = "opn_csrf";

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

function createCsrfCookie(
  env: { SESSION_COOKIE_DOMAIN: string; WEB_SESSION_TTL_SECONDS: number },
  token: string,
): string {
  return [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Domain=${env.SESSION_COOKIE_DOMAIN}`,
    `Max-Age=${env.WEB_SESSION_TTL_SECONDS}`,
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function ensureCsrfToken(c: Context<any>): { token: string; setCookie?: string } {
  const existing = readCookieValue(c.req.header("cookie") ?? null, CSRF_COOKIE_NAME);
  if (existing) {
    return { token: existing };
  }
  const token = crypto.randomUUID().replace(/-/g, "");
  return { token, setCookie: createCsrfCookie(c.env, token) };
}

export function csrfHiddenInput(token: string): string {
  return `<input type="hidden" name="csrfToken" value="${token}" />`;
}

export function assertCsrfToken(c: Context<any>, formData: FormData): boolean {
  const cookieToken = readCookieValue(c.req.header("cookie") ?? null, CSRF_COOKIE_NAME);
  const formToken = String(formData.get("csrfToken") ?? "");
  return Boolean(cookieToken && formToken && cookieToken === formToken);
}
