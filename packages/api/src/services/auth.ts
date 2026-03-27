import {
  ACCESS_TOKEN_SCOPE,
  loginUrl,
  REFRESH_TOKEN_SCOPE,
} from "@opndomain/shared";
import type {
  AuthAgentIdentity,
  AuthAgentProfile,
  MagicLinkResponse,
  MagicLinkVerifyResponse,
  RegisterAgentResponse,
  TokenResponse,
  VerifyEmailResponse,
} from "@opndomain/shared";
import type { TrustTier } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { buildClearedSessionCookie, buildSessionCookie, readCookieValue } from "../lib/cookies.js";
import { allRows, firstRow, requireRow, runStatement } from "../lib/db.js";
import { safeEqualHash, sha256 } from "../lib/crypto.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { createClientId, createId, createNumericCode, createSecret } from "../lib/ids.js";
import { signJwt, verifyJwt } from "../lib/jwt.js";
import { enforceHourlyRateLimit } from "../lib/rate-limit.js";
import { addMinutes, addSeconds, isExpired, nowIso } from "../lib/time.js";
import { deliverMagicLink, deliverVerificationCode } from "./email.js";

export type AgentRecord = {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  emailVerifiedAt: string | null;
  trustTier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AgentRow = {
  id: string;
  client_id: string;
  client_secret_hash?: string;
  name: string;
  email: string | null;
  email_verified_at: string | null;
  trust_tier: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type VerificationRow = {
  id: string;
  agent_id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

type SessionRow = {
  id: string;
  agent_id: string;
  scope: string;
  refresh_token_hash: string | null;
  access_token_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};

type MagicLinkRow = {
  id: string;
  agent_id: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
};

function mapAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    trustTier: row.trust_tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuthAgentIdentity(agent: AgentRecord): AuthAgentIdentity {
  return {
    id: agent.id,
    clientId: agent.clientId,
  };
}

function mapAuthAgentProfile(agent: AgentRecord, fallbackEmail?: string): AuthAgentProfile {
  return {
    ...mapAuthAgentIdentity(agent),
    email: agent.email ?? fallbackEmail ?? "",
    trustTier: agent.trustTier as TrustTier,
    status: agent.status,
  };
}

type TokenExchangeResult = Omit<TokenResponse, "tokenType" | "expiresIn"> & { cookie: string };
type MagicLinkVerifyResult = Omit<MagicLinkVerifyResponse, "tokenType" | "expiresIn"> & { cookie: string };

export async function getAgentById(env: ApiEnv, agentId: string): Promise<AgentRecord | null> {
  const row = await firstRow<AgentRow>(
    env.DB,
    `SELECT id, client_id, name, email, email_verified_at, trust_tier, status, created_at, updated_at
     FROM agents
     WHERE id = ?`,
    agentId,
  );
  return row ? mapAgent(row) : null;
}

export async function getAgentByClientId(env: ApiEnv, clientId: string): Promise<AgentRecord | null> {
  const row = await firstRow<AgentRow>(
    env.DB,
    `SELECT id, client_id, name, email, email_verified_at, trust_tier, status, created_at, updated_at
     FROM agents
     WHERE client_id = ?`,
    clientId,
  );
  return row ? mapAgent(row) : null;
}

export async function getAgentByEmail(env: ApiEnv, email: string): Promise<AgentRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const row = await firstRow<AgentRow>(
    env.DB,
    `SELECT id, client_id, name, email, email_verified_at, trust_tier, status, created_at, updated_at
     FROM agents
     WHERE lower(email) = ?`,
    normalizedEmail,
  );
  return row ? mapAgent(row) : null;
}

export async function registerAgent(
  env: ApiEnv,
  ipAddress: string,
  input: { name: string; email: string },
): Promise<RegisterAgentResponse> {
  await enforceHourlyRateLimit(
    env.PUBLIC_CACHE,
    `rate-limit:register:${ipAddress}`,
    env.REGISTRATION_RATE_LIMIT_PER_HOUR,
  );

  const normalizedEmail = input.email.trim().toLowerCase();
  const existingAgent = await firstRow<{ id: string }>(
    env.DB,
    `SELECT id FROM agents WHERE lower(email) = ?`,
    normalizedEmail,
  );
  if (existingAgent) {
    conflict("That email is already registered.");
  }

  const agentId = createId("agt");
  const clientId = createClientId();
  const clientSecret = createSecret();
  const verificationCode = createNumericCode();
  const verificationId = createId("ev");
  const expiresAt = nowIso(addMinutes(new Date(), env.EMAIL_VERIFICATION_TTL_MINUTES));

  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO agents (
          id, client_id, client_secret_hash, name, email, trust_tier, status
        ) VALUES (?, ?, ?, ?, ?, 'unverified', 'active')
      `,
    ).bind(agentId, clientId, await sha256(clientSecret), input.name.trim(), normalizedEmail),
    env.DB.prepare(
      `
        INSERT INTO email_verifications (
          id, agent_id, email, code_hash, attempts, expires_at
        ) VALUES (?, ?, ?, ?, 0, ?)
      `,
    ).bind(verificationId, agentId, normalizedEmail, await sha256(verificationCode), expiresAt),
  ]);

  const delivery = await deliverVerificationCode(env, normalizedEmail, verificationCode);
  const agent = (await getAgentById(env, agentId)) as AgentRecord;
  return {
    agent: mapAuthAgentProfile(agent, normalizedEmail),
    clientId,
    clientSecret,
    verification: {
      expiresAt,
      maxAttempts: env.EMAIL_VERIFICATION_MAX_ATTEMPTS,
      delivery,
    },
  };
}

export async function verifyAgentEmail(
  env: ApiEnv,
  input: { clientId: string; code: string },
): Promise<VerifyEmailResponse> {
  const agent = await getAgentByClientId(env, input.clientId);
  if (!agent) {
    unauthorized("Verification credentials are invalid.");
  }

  const verification = await firstRow<VerificationRow>(
    env.DB,
    `
      SELECT id, agent_id, email, code_hash, attempts, expires_at, consumed_at
      FROM email_verifications
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    agent.id,
  );
  if (!verification || verification.consumed_at || isExpired(verification.expires_at)) {
    unauthorized("Verification code is no longer valid.");
  }
  if (verification.attempts >= env.EMAIL_VERIFICATION_MAX_ATTEMPTS) {
    unauthorized("Verification attempts exceeded the allowed threshold.");
  }

  const matches = await safeEqualHash(input.code.trim(), verification.code_hash);
  if (!matches) {
    await runStatement(
      env.DB.prepare(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?`).bind(verification.id),
    );
    unauthorized("Verification credentials are invalid.");
  }

  const verifiedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE email_verifications SET consumed_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(verifiedAt, verifiedAt, verification.id),
    env.DB.prepare(
      `UPDATE agents SET email_verified_at = ?, trust_tier = 'supervised', updated_at = ? WHERE id = ?`,
    ).bind(verifiedAt, verifiedAt, agent.id),
    env.DB.prepare(
      `UPDATE beings SET trust_tier = 'supervised', updated_at = ? WHERE agent_id = ? AND trust_tier = 'unverified'`,
    ).bind(verifiedAt, agent.id),
  ]);

  return mapAuthAgentProfile((await getAgentById(env, agent.id)) as AgentRecord, agent.email ?? verification.email);
}

async function mintToken(
  env: ApiEnv,
  agent: AgentRecord,
  sessionId: string,
  tokenId: string,
  scope: string,
  ttlSeconds: number,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(env, {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    sub: agent.id,
    scope,
    exp: issuedAt + ttlSeconds,
    iat: issuedAt,
    jti: tokenId,
    client_id: agent.clientId,
    session_id: sessionId,
    trust_tier: agent.trustTier,
  });
}

export async function createSessionTokens(env: ApiEnv, agent: AgentRecord) {
  const sessionId = createId("ses");
  const accessTokenId = createId("atk");
  const refreshTokenId = createId("rtk");
  const refreshToken = await mintToken(env, agent, sessionId, refreshTokenId, REFRESH_TOKEN_SCOPE, env.REFRESH_TOKEN_TTL_SECONDS);
  const accessToken = await mintToken(env, agent, sessionId, accessTokenId, ACCESS_TOKEN_SCOPE, env.ACCESS_TOKEN_TTL_SECONDS);
  const expiresAt = nowIso(addSeconds(new Date(), env.WEB_SESSION_TTL_SECONDS));

  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO sessions (id, agent_id, scope, refresh_token_hash, access_token_id, expires_at)
        VALUES (?, ?, 'web_session', ?, ?, ?)
      `,
    ).bind(sessionId, agent.id, await sha256(refreshToken), accessTokenId, expiresAt),
  );

  return { agent, sessionId, accessToken, refreshToken, cookie: buildSessionCookie(env, sessionId) };
}

export async function exchangeClientCredentials(
  env: ApiEnv,
  ipAddress: string,
  input: { clientId: string; clientSecret: string },
): Promise<TokenExchangeResult> {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:token:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  const agentRow = await requireRow<AgentRow>(
    env.DB,
    `
      SELECT id, client_id, client_secret_hash, name, email, email_verified_at, trust_tier, status, created_at, updated_at
      FROM agents
      WHERE client_id = ?
    `,
    input.clientId,
  );
  if (!agentRow.client_secret_hash || !(await safeEqualHash(input.clientSecret, agentRow.client_secret_hash))) {
    unauthorized("Client credentials are invalid.");
  }

  const agent = mapAgent(agentRow);
  const session = await createSessionTokens(env, agent);
  return {
    ...session,
    agent: mapAuthAgentIdentity(session.agent),
  };
}

export async function exchangeRefreshToken(
  env: ApiEnv,
  ipAddress: string,
  refreshToken: string,
): Promise<TokenExchangeResult> {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:token:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  const payload = await verifyJwt(env, refreshToken);
  if (payload.scope !== REFRESH_TOKEN_SCOPE) {
    unauthorized("Refresh token scope is invalid.");
  }

  const sessionId = String(payload.session_id ?? "");
  const session = await firstRow<SessionRow>(
    env.DB,
    `
      SELECT id, agent_id, scope, refresh_token_hash, access_token_id, expires_at, revoked_at
      FROM sessions
      WHERE id = ?
    `,
    sessionId,
  );
  if (!session || session.revoked_at || isExpired(session.expires_at)) {
    unauthorized("Refresh token is no longer valid.");
  }
  if (!session.refresh_token_hash || !(await safeEqualHash(refreshToken, session.refresh_token_hash))) {
    unauthorized("Refresh token is no longer valid.");
  }

  const agent = (await getAgentById(env, session.agent_id)) as AgentRecord;
  const nextAccessTokenId = createId("atk");
  const nextRefreshTokenId = createId("rtk");
  const nextRefreshToken = await mintToken(env, agent, session.id, nextRefreshTokenId, REFRESH_TOKEN_SCOPE, env.REFRESH_TOKEN_TTL_SECONDS);
  const nextAccessToken = await mintToken(env, agent, session.id, nextAccessTokenId, ACCESS_TOKEN_SCOPE, env.ACCESS_TOKEN_TTL_SECONDS);

  await runStatement(
    env.DB.prepare(
      `
        UPDATE sessions
        SET refresh_token_hash = ?, access_token_id = ?, expires_at = ?, last_used_at = ?, revoked_at = NULL
        WHERE id = ?
      `,
    ).bind(
      await sha256(nextRefreshToken),
      nextAccessTokenId,
      nowIso(addSeconds(new Date(), env.WEB_SESSION_TTL_SECONDS)),
      nowIso(),
      session.id,
    ),
  );

  return {
    agent: mapAuthAgentIdentity(agent),
    sessionId: session.id,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    cookie: buildSessionCookie(env, session.id),
  };
}

export async function authenticateRequest(env: ApiEnv, request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const payload = await verifyJwt(env, authHeader.slice("Bearer ".length));
    if (payload.scope !== ACCESS_TOKEN_SCOPE) {
      unauthorized("Access token scope is invalid.");
    }
    const sessionId = String(payload.session_id ?? "").trim();
    if (!sessionId) {
      unauthorized();
    }
    const session = await firstRow<SessionRow>(
      env.DB,
      `
        SELECT id, agent_id, scope, refresh_token_hash, access_token_id, expires_at, revoked_at
        FROM sessions
        WHERE id = ?
      `,
      sessionId,
    );
    if (!session || session.revoked_at || isExpired(session.expires_at)) {
      unauthorized();
    }
    const agent = await getAgentById(env, String(payload.sub));
    if (!agent) {
      unauthorized();
    }
    return { agent, sessionId: session.id, tokenScope: String(payload.scope) };
  }

  const sessionId = readCookieValue(request.headers.get("cookie"), env.SESSION_COOKIE_NAME);
  if (!sessionId) {
    unauthorized();
  }
  const session = await firstRow<SessionRow>(
    env.DB,
    `
      SELECT id, agent_id, scope, refresh_token_hash, access_token_id, expires_at, revoked_at
      FROM sessions
      WHERE id = ?
    `,
    sessionId,
  );
  if (!session || session.revoked_at || isExpired(session.expires_at)) {
    unauthorized();
  }
  const agent = await getAgentById(env, session.agent_id);
  if (!agent) {
    unauthorized();
  }
  await runStatement(env.DB.prepare(`UPDATE sessions SET last_used_at = ? WHERE id = ?`).bind(nowIso(), session.id));
  return { agent, sessionId: session.id, tokenScope: session.scope };
}

export async function logoutSession(env: ApiEnv, request: Request) {
  const sessionId = readCookieValue(request.headers.get("cookie"), env.SESSION_COOKIE_NAME);
  if (sessionId) {
    await runStatement(
      env.DB.prepare(
        `
          UPDATE sessions
          SET revoked_at = ?, refresh_token_hash = NULL, expires_at = ?, updated_at = ?
          WHERE id = ?
        `,
      ).bind(nowIso(), nowIso(), nowIso(), sessionId),
    );
  }
  return { clearedCookie: buildClearedSessionCookie(env) };
}

export async function getSessionSummary(env: ApiEnv, request: Request) {
  const { agent } = await authenticateRequest(env, request);
  const beings = await allRows<{ id: string; handle: string; trust_tier: string; status: string }>(
    env.DB,
    `
      SELECT id, handle, trust_tier, status
      FROM beings
      WHERE agent_id = ?
      ORDER BY created_at ASC
    `,
    agent.id,
  );
  return {
    agent,
    beings: beings.map((being) => ({
      id: being.id,
      handle: being.handle,
      trustTier: being.trust_tier,
      status: being.status,
    })),
  };
}

export async function createMagicLink(env: ApiEnv, ipAddress: string, email: string): Promise<MagicLinkResponse> {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:magic-link:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  const agent = await getAgentByEmail(env, email);
  if (!agent) {
    unauthorized("No registered agent was found for that email.");
  }

  const token = createSecret();
  const tokenHash = await sha256(token);
  const linkId = createId("mlk");
  const expiresAt = nowIso(addMinutes(new Date(), env.MAGIC_LINK_TTL_MINUTES));
  const link = loginUrl(token);

  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO magic_links (id, agent_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `,
    ).bind(linkId, agent.id, tokenHash, expiresAt),
  );

  return {
    agent: {
      ...mapAuthAgentIdentity(agent),
      email: agent.email ?? email.trim().toLowerCase(),
    },
    expiresAt,
    delivery: await deliverMagicLink(env, agent.email ?? email.trim().toLowerCase(), link),
  };
}

export async function verifyMagicLink(
  env: ApiEnv,
  token: string,
): Promise<MagicLinkVerifyResult> {
  const tokenHash = await sha256(token);
  const magicLink = await firstRow<MagicLinkRow>(
    env.DB,
    `
      SELECT id, agent_id, token_hash, expires_at, consumed_at
      FROM magic_links
      WHERE token_hash = ?
      LIMIT 1
    `,
    tokenHash,
  );
  if (!magicLink || magicLink.consumed_at || isExpired(magicLink.expires_at)) {
    unauthorized("Magic link is no longer valid.");
  }

  const agent = await getAgentById(env, magicLink.agent_id);
  if (!agent) {
    unauthorized("Magic link is no longer valid.");
  }

  const consumedAt = nowIso();
  const result = await runStatement(
    env.DB.prepare(
      `UPDATE magic_links SET consumed_at = ?, updated_at = ? WHERE id = ? AND consumed_at IS NULL`,
    ).bind(consumedAt, consumedAt, magicLink.id),
  );
  if (Number(result.meta?.changes ?? 0) < 1) {
    unauthorized("Magic link is no longer valid.");
  }

  const session = await createSessionTokens(env, agent);
  return {
    ...session,
    agent: {
      ...mapAuthAgentIdentity(session.agent),
      email: session.agent.email ?? agent.email ?? "",
    },
  };
}

export async function purgeExpiredMagicLinks(env: ApiEnv, now = new Date()) {
  return runStatement(
    env.DB.prepare(
      `DELETE FROM magic_links WHERE expires_at < ?`,
    ).bind(nowIso(addMinutes(now, -(24 * 60)))),
  );
}
