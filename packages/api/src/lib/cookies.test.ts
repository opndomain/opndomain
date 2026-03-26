import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClearedSessionCookie, buildSessionCookie } from "./cookies.js";
import type { ApiEnv } from "./env.js";

const env = {
  SESSION_COOKIE_NAME: "opn_session",
  SESSION_COOKIE_DOMAIN: ".opndomain.com",
  WEB_SESSION_TTL_SECONDS: 604800,
} as ApiEnv;

describe("session cookies", () => {
  it("builds the Phase 2 session cookie contract", () => {
    const cookie = buildSessionCookie(env, "session_123");
    assert.match(cookie, /opn_session=session_123/);
    assert.match(cookie, /Domain=.opndomain.com/);
    assert.match(cookie, /Max-Age=604800/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  });

  it("clears the session cookie explicitly", () => {
    const cookie = buildClearedSessionCookie(env);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });
});
