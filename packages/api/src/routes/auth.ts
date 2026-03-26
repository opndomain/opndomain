import { Hono } from "hono";
import {
  MagicLinkRequestSchema,
  MagicLinkVerifySchema,
  RegisterAgentSchema,
  TokenContractSchema,
  TokenRequestSchema,
  VerifyEmailSchema,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { jsonData, parseJsonBody } from "../lib/http.js";
import {
  createMagicLink,
  exchangeClientCredentials,
  exchangeRefreshToken,
  getSessionSummary,
  logoutSession,
  registerAgent,
  verifyMagicLink,
  verifyAgentEmail,
} from "../services/auth.js";

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

authRoutes.post("/magic-link/verify", async (c) => {
  const body = parseJsonBody(MagicLinkVerifySchema, await c.req.json());
  const tokens = await verifyMagicLink(c.env, body.token);
  c.header("set-cookie", tokens.cookie, { append: true });
  return jsonData(c, {
    tokenType: "Bearer",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: TokenContractSchema.parse({
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
      scopes: ["web_session", "agent_refresh"],
    }).accessTokenTtlSeconds,
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
    expiresIn: TokenContractSchema.parse({
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
      scopes: ["web_session", "agent_refresh"],
    }).accessTokenTtlSeconds,
    sessionId: tokens.sessionId,
    agent: tokens.agent,
  });
});

authRoutes.post("/logout", async (c) => {
  const result = await logoutSession(c.env, c.req.raw);
  c.header("set-cookie", result.clearedCookie, { append: true });
  return jsonData(c, { ok: true });
});

authRoutes.get("/session", async (c) => {
  const session = await getSessionSummary(c.env, c.req.raw);
  return jsonData(c, session);
});
