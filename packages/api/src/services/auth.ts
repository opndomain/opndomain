import {
  ACCESS_TOKEN_SCOPE,
  loginUrl,
  REFRESH_TOKEN_SCOPE,
} from "@opndomain/shared";
import type {
  AccountClass,
  AccountLookupResponse,
  AuthAgentIdentity,
  AuthAgentProfile,
  EffectiveAccountClass,
  GuestBootstrapResponse,
  MagicLinkResponse,
  MagicLinkVerifyResponse,
  RegisterAgentResponse,
  TokenResponse,
  VerifyEmailResponse,
} from "@opndomain/shared";
import type { TrustTier } from "@opndomain/shared";
import { isAdminAgent } from "../lib/admin.js";
import type { ApiEnv } from "../lib/env.js";
import { buildClearedSessionCookie, buildSessionCookie, readCookieValue } from "../lib/cookies.js";
import { allRows, firstRow, requireRow, runStatement } from "../lib/db.js";
import { safeEqualHash, sha256 } from "../lib/crypto.js";
import { ApiError, conflict, unauthorized } from "../lib/errors.js";
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
  accountClass: AccountClass;
  trustTier: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthenticatedAgent = AgentRecord & {
  emailVerified?: boolean;
  isGuest?: boolean;
  isAdmin: boolean;
  effectiveAccountClass: EffectiveAccountClass;
};

type AgentRow = {
  id: string;
  client_id: string;
  client_secret_hash?: string;
  name: string;
  email: string | null;
  email_verified_at: string | null;
  account_class: AccountClass;
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

type AgentBeingStatusRow = {
  active_count: number | string | null;
  inactive_count: number | string | null;
};

type MagicLinkRow = {
  id: string;
  agent_id: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
};

type CreateAgentRecordInput = {
  name: string;
  email: string;
  emailVerifiedAt?: string | null;
  accountClass: AccountClass;
  trustTier: TrustTier;
};

type PreparedAgentRecord = {
  agentId: string;
  normalizedEmail: string;
  clientId: string;
  clientSecret: string;
  agentProfile: {
    id: string;
    clientId: string;
    email: string;
    accountClass: AccountClass;
    trustTier: TrustTier;
    status: string;
  };
  insertStatement: D1PreparedStatement;
};

function mapAgent(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    accountClass: row.account_class,
    trustTier: row.trust_tier,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function projectAgentAccount(env: ApiEnv, agent: AgentRecord): AuthenticatedAgent {
  const isAdmin = isAdminAgent(env, agent);
  return {
    ...agent,
    emailVerified: Boolean(agent.emailVerifiedAt),
    isGuest: agent.accountClass === "guest_participant",
    isAdmin,
    effectiveAccountClass: isAdmin ? "admin_operator" : agent.accountClass,
  };
}

function mapAuthAgentIdentity(agent: AgentRecord): AuthAgentIdentity {
  return {
    id: agent.id,
    clientId: agent.clientId,
  };
}

function mapAuthAgentProfile(agent: AuthenticatedAgent, fallbackEmail?: string): AuthAgentProfile {
  return {
    ...mapAuthAgentIdentity(agent),
    email: agent.email ?? fallbackEmail ?? null,
    emailVerified: Boolean(agent.emailVerified),
    isGuest: Boolean(agent.isGuest),
    trustTier: agent.trustTier as TrustTier,
    accountClass: agent.accountClass,
    isAdmin: agent.isAdmin,
    effectiveAccountClass: agent.effectiveAccountClass,
    status: agent.status,
  };
}

async function prepareAgentRecord(env: ApiEnv, input: CreateAgentRecordInput): Promise<PreparedAgentRecord> {
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
  return {
    agentId,
    normalizedEmail,
    clientId,
    clientSecret,
    agentProfile: {
      id: agentId,
      clientId,
      email: normalizedEmail,
      accountClass: input.accountClass,
      trustTier: input.trustTier,
      status: "active",
    },
    insertStatement: env.DB.prepare(
      `
        INSERT INTO agents (
          id, client_id, client_secret_hash, name, email, email_verified_at, account_class, trust_tier, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `,
    ).bind(
      agentId,
      clientId,
      await sha256(clientSecret),
      input.name.trim(),
      normalizedEmail,
      input.emailVerifiedAt ?? null,
      input.accountClass,
      input.trustTier,
    ),
  };
}

type TokenExchangeResult = Omit<TokenResponse, "tokenType" | "expiresIn"> & { cookie: string };
type MagicLinkVerifyResult = Omit<MagicLinkVerifyResponse, "tokenType" | "expiresIn"> & { cookie: string };

function defaultAgentNameForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const localPart = normalizedEmail.split("@")[0] ?? "operator";
  const collapsed = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "Operator";
  }
  return collapsed
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

function defaultGuestName() {
  return `Guest ${createNumericCode().slice(0, 4)}`;
}

export async function getAgentById(env: ApiEnv, agentId: string): Promise<AgentRecord | null> {
  const row = await firstRow<AgentRow>(
    env.DB,
    `SELECT id, client_id, name, email, email_verified_at, account_class, trust_tier, status, created_at, updated_at
     FROM agents
     WHERE id = ?`,
    agentId,
  );
  return row ? mapAgent(row) : null;
}

export async function getAgentByClientId(env: ApiEnv, clientId: string): Promise<AgentRecord | null> {
  const row = await firstRow<AgentRow>(
    env.DB,
    `SELECT id, client_id, name, email, email_verified_at, account_class, trust_tier, status, created_at, updated_at
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
    `SELECT id, client_id, name, email, email_verified_at, account_class, trust_tier, status, created_at, updated_at
     FROM agents
     WHERE lower(email) = ?`,
    normalizedEmail,
  );
  return row ? mapAgent(row) : null;
}

export async function lookupAccountByEmail(
  env: ApiEnv,
  ipAddress: string,
  email: string,
): Promise<AccountLookupResponse> {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:account-lookup:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);
  const normalizedEmail = email.trim().toLowerCase();
  const agent = await getAgentByEmail(env, normalizedEmail);
  if (!agent) {
    return {
      status: "account_not_found",
      email: normalizedEmail,
      nextActions: ["register", "continue_as_guest"],
      loginMethods: [],
    };
  }

  if (!agent.emailVerifiedAt || agent.accountClass === "unverified_participant") {
    return {
      status: "awaiting_verification",
      email: normalizedEmail,
      nextActions: ["send_magic_link"],
      accountClass: "unverified_participant",
      emailVerified: false,
      loginMethods: ["magic_link", "client_credentials", "oauth"],
    };
  }

  return {
    status: "login_required",
    email: normalizedEmail,
    nextActions: ["send_magic_link"],
    accountClass: agent.accountClass,
    emailVerified: true,
    loginMethods: ["magic_link", "client_credentials", "oauth"],
  };
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

  const { agentId, normalizedEmail, clientId, clientSecret, agentProfile, insertStatement } = await prepareAgentRecord(env, {
    name: input.name,
    email: input.email,
    emailVerifiedAt: null,
    accountClass: "unverified_participant",
    trustTier: "unverified",
  });
  const verificationCode = createNumericCode();
  const verificationId = createId("ev");
  const expiresAt = nowIso(addMinutes(new Date(), env.EMAIL_VERIFICATION_TTL_MINUTES));

  await env.DB.batch([
    insertStatement,
    env.DB.prepare(
      `
        INSERT INTO email_verifications (
          id, agent_id, email, code_hash, attempts, expires_at
        ) VALUES (?, ?, ?, ?, 0, ?)
      `,
    ).bind(verificationId, agentId, normalizedEmail, await sha256(verificationCode), expiresAt),
  ]);

  const delivery = await deliverVerificationCode(env, normalizedEmail, verificationCode);
  return {
    agent: mapAuthAgentProfile(projectAgentAccount(env, {
      ...agentProfile,
      name: input.name.trim(),
      emailVerifiedAt: null,
      accountClass: "unverified_participant",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
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
      `UPDATE agents SET email_verified_at = ?, account_class = 'verified_participant', updated_at = ? WHERE id = ?`,
    ).bind(verifiedAt, verifiedAt, agent.id),
  ]);

  return mapAuthAgentProfile(projectAgentAccount(env, (await getAgentById(env, agent.id)) as AgentRecord), agent.email ?? verification.email);
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

export async function createGuestSession(env: ApiEnv): Promise<GuestBootstrapResponse & { cookie: string }> {
  const agentId = createId("agt");
  const clientId = createClientId();
  const clientSecret = createSecret();
  const agentName = defaultGuestName();
  const beingId = createId("bng");
  const handle = `guest-${randomGuestHandleSuffix()}`;
  await env.DB.batch([
    env.DB.prepare(
      `
        INSERT INTO agents (
          id, client_id, client_secret_hash, name, email, email_verified_at, account_class, trust_tier, status
        ) VALUES (?, ?, ?, ?, NULL, NULL, 'guest_participant', 'unverified', 'active')
      `,
    ).bind(agentId, clientId, await sha256(clientSecret), agentName),
    env.DB.prepare(
      `
        INSERT INTO beings (id, agent_id, handle, display_name, bio, trust_tier, status)
        VALUES (?, ?, ?, ?, ?, 'unverified', 'active')
      `,
    ).bind(beingId, agentId, handle, agentName, "Guest participant provisioned through auth guest bootstrap."),
    env.DB.prepare(
      `
        INSERT INTO being_capabilities (
          id, being_id, can_publish, can_join_topics, can_suggest_topics, can_open_topics
        ) VALUES (?, ?, 1, 1, 1, 0)
      `,
    ).bind(createId("cap"), beingId),
    env.DB.prepare(
      `INSERT INTO vote_reliability (id, being_id, reliability) VALUES (?, ?, 1.0)`,
    ).bind(createId("vr"), beingId),
  ]);

  const agent = (await getAgentById(env, agentId)) as AgentRecord;
  const session = await createSessionTokens(env, agent);
  return {
    ...session,
    tokenType: "Bearer",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    agent: mapAuthAgentProfile(projectAgentAccount(env, session.agent)),
    being: {
      id: beingId,
      handle,
      displayName: agentName,
      trustTier: "unverified",
      status: "active",
    },
  };
}

function randomGuestHandleSuffix(len = 8) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
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
      , account_class
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
    agent: mapAuthAgentProfile(projectAgentAccount(env, session.agent)),
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
    agent: mapAuthAgentProfile(projectAgentAccount(env, agent)),
    sessionId: session.id,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    cookie: buildSessionCookie(env, session.id),
  };
}

export async function authenticateRequest(env: ApiEnv, request: Request) {
  async function assertSessionBeingAccess(agentId: string) {
    const beingStatus = await firstRow<AgentBeingStatusRow>(
      env.DB,
      `
        SELECT
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) AS inactive_count
        FROM beings
        WHERE agent_id = ?
      `,
      agentId,
    );
    if (Number(beingStatus?.inactive_count ?? 0) > 0) {
      throw new ApiError(401, "being_inactive", "This account is inactive.");
    }
  }

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
    await assertSessionBeingAccess(agent.id);
    return { agent: projectAgentAccount(env, agent), sessionId: session.id, tokenScope: String(payload.scope) };
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
  await assertSessionBeingAccess(agent.id);
  await runStatement(env.DB.prepare(`UPDATE sessions SET last_used_at = ? WHERE id = ?`).bind(nowIso(), session.id));
  return { agent: projectAgentAccount(env, agent), sessionId: session.id, tokenScope: session.scope };
}

export async function revokeSessionsForAgent(env: ApiEnv, agentId: string) {
  const revokedAt = nowIso();
  await runStatement(
    env.DB.prepare(
      `
        UPDATE sessions
        SET revoked_at = ?, refresh_token_hash = NULL, expires_at = ?, updated_at = ?
        WHERE agent_id = ?
          AND revoked_at IS NULL
      `,
    ).bind(revokedAt, revokedAt, revokedAt, agentId),
  );
  return { revokedAt };
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

export async function createAttachedEmailMagicLink(env: ApiEnv, request: Request, email: string): Promise<MagicLinkResponse> {
  const { agent } = await authenticateRequest(env, request);
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getAgentByEmail(env, normalizedEmail);
  if (existing && existing.id !== agent.id) {
    conflict("That email is already attached to another account.");
  }
  if (agent.emailVerifiedAt && agent.email && agent.email !== normalizedEmail) {
    conflict("A verified email is already attached to this account.");
  }

  if (agent.email !== normalizedEmail || !agent.email) {
    await runStatement(
      env.DB.prepare(
        `UPDATE agents SET email = ?, email_verified_at = NULL, account_class = 'unverified_participant', updated_at = ? WHERE id = ?`,
      ).bind(normalizedEmail, nowIso(), agent.id),
    );
  }

  return createMagicLink(env, `authenticated-email-link:${agent.id}`, normalizedEmail);
}

export async function rotateClientCredentials(env: ApiEnv, request: Request) {
  const { agent } = await authenticateRequest(env, request);
  const clientSecret = createSecret();
  await runStatement(
    env.DB.prepare(
      `UPDATE agents SET client_secret_hash = ?, updated_at = ? WHERE id = ?`,
    ).bind(await sha256(clientSecret), nowIso(), agent.id),
  );
  return {
    clientId: agent.clientId,
    clientSecret,
  };
}

export async function createMagicLink(env: ApiEnv, ipAddress: string, email: string): Promise<MagicLinkResponse> {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:magic-link:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  const normalizedEmail = email.trim().toLowerCase();
  const agent = await getAgentByEmail(env, normalizedEmail);
  if (!agent) {
    unauthorized("No account matches that email.");
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
      email: agent.email ?? normalizedEmail,
    },
    expiresAt,
    delivery: await deliverMagicLink(env, agent.email ?? normalizedEmail, link),
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

  let sessionAgent = agent;
  if (!agent.emailVerifiedAt || agent.accountClass === "unverified_participant") {
    const verifiedAt = nowIso();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE agents SET email_verified_at = COALESCE(email_verified_at, ?), account_class = 'verified_participant', updated_at = ? WHERE id = ?`,
      ).bind(verifiedAt, verifiedAt, agent.id),
    ]);
    sessionAgent = (await getAgentById(env, agent.id)) ?? agent;
  }

  const session = await createSessionTokens(env, sessionAgent);
  return {
    ...session,
    agent: mapAuthAgentProfile(projectAgentAccount(env, session.agent), agent.email ?? undefined),
  };
}

export async function purgeExpiredMagicLinks(env: ApiEnv, now = new Date()) {
  return runStatement(
    env.DB.prepare(
      `DELETE FROM magic_links WHERE expires_at < ?`,
    ).bind(nowIso(addMinutes(now, -(24 * 60)))),
  );
}
