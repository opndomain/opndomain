import { Hono } from "hono";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  EmailLinkRequestSchema,
  MagicLinkRequestSchema,
  MagicLinkVerifySchema,
  OAUTH_NONCE_COOKIE_PREFIX,
  OAuthAuthorizeQuerySchema,
  OAuthCallbackQuerySchema,
  OAuthProviderSchema,
  RegisterAgentSchema,
  TokenRequestSchema,
  VerifyEmailSchema,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { buildClearedCookie } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import {
  createAttachedEmailMagicLink,
  createMagicLink,
  exchangeClientCredentials,
  exchangeRefreshToken,
  getSessionSummary,
  logoutSession,
  registerAgent,
  rotateClientCredentials,
  verifyMagicLink,
  verifyAgentEmail,
} from "../services/auth.js";
import { beginOAuthAuthorize, completeOAuthCallback, consumeOAuthWelcome, listExternalIdentitiesForAgent, pollCliOAuth } from "../services/oauth.js";

export const authRoutes = new Hono<{ Bindings: ApiEnv }>();

authRoutes.post("/register", async (c) => {
  const body = parseJsonBody(RegisterAgentSchema, await c.req.json());
  const payload = await registerAgent(
    c.env,
    c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0",
    body,
  );
  return jsonData(c, payload, 201);
});

authRoutes.post("/verify-email", async (c) => {
  const body = parseJsonBody(VerifyEmailSchema, await c.req.json());
  const agent = await verifyAgentEmail(c.env, body);
  return jsonData(c, agent);
});

authRoutes.post("/magic-link", async (c) => {
  const body = parseJsonBody(MagicLinkRequestSchema, await c.req.json());
  const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0";
  return jsonData(c, await createMagicLink(c.env, ipAddress, body.email), 201);
});

authRoutes.post("/email-link", async (c) => {
  const body = parseJsonBody(EmailLinkRequestSchema, await c.req.json());
  return jsonData(c, await createAttachedEmailMagicLink(c.env, c.req.raw, body.email), 201);
});

authRoutes.post("/magic-link/verify", async (c) => {
  const body = parseJsonBody(MagicLinkVerifySchema, await c.req.json());
  const tokens = await verifyMagicLink(c.env, body.token);
  c.header("set-cookie", tokens.cookie, { append: true });
  return jsonData(c, {
    tokenType: "Bearer",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    sessionId: tokens.sessionId,
    agent: tokens.agent,
  });
});

authRoutes.post("/token", async (c) => {
  const body = parseJsonBody(TokenRequestSchema, await c.req.json());
  const ipAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0";
  const tokens =
    body.grantType === "client_credentials"
      ? await exchangeClientCredentials(c.env, ipAddress, body)
      : await exchangeRefreshToken(c.env, ipAddress, body.refreshToken);

  c.header("set-cookie", tokens.cookie, { append: true });
  return jsonData(c, {
    tokenType: "Bearer",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    sessionId: tokens.sessionId,
    agent: tokens.agent,
  });
});

authRoutes.get("/oauth/:provider/authorize", async (c) => {
  const provider = OAuthProviderSchema.parse(c.req.param("provider"));
  const query = OAuthAuthorizeQuerySchema.parse({
    redirect: c.req.query("redirect") ?? undefined,
    source: c.req.query("source") ?? undefined,
  });
  const result = await beginOAuthAuthorize(
    c.env,
    c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0",
    provider,
    query.redirect,
    query.source,
  );
  if (query.source === "cli") {
    return jsonData(c, {
      authorizeUrl: result.location,
      cliSessionId: result.cliSessionId,
    });
  }
  if (result.nonceCookie) {
    c.header("set-cookie", result.nonceCookie, { append: true });
  }
  return c.redirect(result.location, 302);
});

authRoutes.get("/oauth/:provider/callback", async (c) => {
  const provider = OAuthProviderSchema.parse(c.req.param("provider"));
  const query = OAuthCallbackQuerySchema.parse({
    code: c.req.query("code") ?? undefined,
    state: c.req.query("state") ?? undefined,
    error: c.req.query("error") ?? undefined,
    error_description: c.req.query("error_description") ?? undefined,
  });
  try {
    const result = await completeOAuthCallback(
      c.env,
      c.req.raw,
      c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0",
      provider,
      {
        code: query.code,
        state: query.state,
        error: query.error,
        errorDescription: query.error_description,
      },
    );
    for (const cookie of result.setCookies) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.redirect(result.location, 302);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "OAuth sign-in failed.";
    const fallback = new URL("/login", c.env.ROUTER_ORIGIN);
    fallback.searchParams.set("oauth_error", message);
    fallback.searchParams.set("provider", provider);
    c.header("set-cookie", buildClearedCookie(c.env, `${OAUTH_NONCE_COOKIE_PREFIX}${provider}`), { append: true });
    return c.redirect(fallback.toString(), 302);
  }
});

authRoutes.get("/oauth/cli/poll", async (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId || sessionId.length < 16) {
    return jsonData(c, { status: "invalid", message: "Missing or invalid sessionId." }, 400);
  }
  const result = await pollCliOAuth(c.env, sessionId);
  if (!result) {
    return jsonData(c, { status: "pending" });
  }
  return jsonData(c, result);
});

authRoutes.get("/oauth/welcome", async (c) => {
  const welcome = await consumeOAuthWelcome(c.env, c.req.raw);
  c.header("set-cookie", welcome.clearedCookie, { append: true });
  return jsonData(c, {
    clientId: welcome.clientId,
    clientSecret: welcome.clientSecret,
  });
});

authRoutes.post("/logout", async (c) => {
  const result = await logoutSession(c.env, c.req.raw);
  c.header("set-cookie", result.clearedCookie, { append: true });
  return jsonData(c, { ok: true });
});

authRoutes.post("/credentials/rotate", async (c) => {
  const rotated = await rotateClientCredentials(c.env, c.req.raw);
  return jsonData(c, rotated);
});

authRoutes.get("/session", async (c) => {
  const session = await getSessionSummary(c.env, c.req.raw);
  return jsonData(c, session);
});

authRoutes.get("/session/account", async (c) => {
  const session = await getSessionSummary(c.env, c.req.raw);
  const linkedIdentities = await listExternalIdentitiesForAgent(c.env, session.agent.id);
  return jsonData(c, { ...session, linkedIdentities });
});
