import {
  ExternalIdentityProfileSchema,
  OAUTH_NONCE_COOKIE_PREFIX,
  OAUTH_STATE_SCOPE,
  OAUTH_WELCOME_COOKIE_NAME,
  OAUTH_WELCOME_SCOPE,
  OAuthProviderSchema,
  OAuthStatePayloadSchema,
  OAuthWelcomePayloadSchema,
  z,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { buildClearedCookie, buildScopedCookie, readCookieValue } from "../lib/cookies.js";
import { allRows, firstRow, runStatement } from "../lib/db.js";
import { sha256 } from "../lib/crypto.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { createClientId, createId, createSecret } from "../lib/ids.js";
import { signJwt, verifyJwt } from "../lib/jwt.js";
import { enforceHourlyRateLimit } from "../lib/rate-limit.js";
import { nowIso } from "../lib/time.js";
import type { AgentRecord } from "./auth.js";
import { authenticateRequest, createSessionTokens, getAgentByEmail, getAgentById } from "./auth.js";

type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
type OAuthProfile = z.infer<typeof ExternalIdentityProfileSchema>;

type ExternalIdentityRow = {
  id: string;
  agent_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  email_snapshot: string | null;
  email_verified: number;
  profile_json: string;
  linked_at: string;
  last_login_at: string;
  created_at: string;
  updated_at: string;
};

type OAuthProvisionResult =
  | { kind: "existing"; agent: AgentRecord }
  | { kind: "new"; agent: AgentRecord; clientId: string; clientSecret: string };

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
};

function oauthNonceCookieName(provider: OAuthProvider) {
  return `${OAUTH_NONCE_COOKIE_PREFIX}${provider}`;
}

function normalizeRedirect(redirect: string | null | undefined): string | null {
  if (!redirect) {
    return null;
  }
  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    badRequest("invalid_redirect", "OAuth redirect must be a relative path.");
  }
  return redirect;
}

function oauthCallbackUrl(env: ApiEnv, provider: OAuthProvider) {
  const base = (env.OAUTH_CALLBACK_BASE_URL ?? env.API_ORIGIN).replace(/\/+$/, "");
  return `${base}/v1/auth/oauth/${provider}/callback`;
}

function providerConfig(env: ApiEnv, provider: OAuthProvider): ProviderConfig {
  switch (provider) {
    case "google":
      if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
        badRequest("oauth_not_configured", "Google OAuth is not configured.");
      }
      return {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["openid", "profile", "email"],
      };
    case "github":
      if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
        badRequest("oauth_not_configured", "GitHub OAuth is not configured.");
      }
      return {
        clientId: env.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: ["read:user", "user:email"],
      };
    case "x":
      if (!env.X_OAUTH_CLIENT_ID || !env.X_OAUTH_CLIENT_SECRET) {
        badRequest("oauth_not_configured", "X OAuth is not configured.");
      }
      return {
        clientId: env.X_OAUTH_CLIENT_ID,
        clientSecret: env.X_OAUTH_CLIENT_SECRET,
        authorizeUrl: "https://x.com/i/oauth2/authorize",
        tokenUrl: "https://api.x.com/2/oauth2/token",
        scopes: ["users.read", "users.email", "tweet.read"],
      };
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function signedStateToken(
  env: ApiEnv,
  provider: OAuthProvider,
  payload: z.infer<typeof OAuthStatePayloadSchema>,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(env, {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    sub: provider,
    scope: OAUTH_STATE_SCOPE,
    exp: issuedAt + env.OAUTH_STATE_TTL_SECONDS,
    iat: issuedAt,
    jti: createId("ost"),
    ...payload,
  });
}

async function signedWelcomeToken(
  env: ApiEnv,
  payload: z.infer<typeof OAuthWelcomePayloadSchema>,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return signJwt(env, {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    sub: payload.agentId,
    scope: OAUTH_WELCOME_SCOPE,
    exp: issuedAt + env.OAUTH_WELCOME_TTL_SECONDS,
    iat: issuedAt,
    jti: createId("owl"),
    ...payload,
  });
}

async function fetchJson(url: string, init: RequestInit, invalidMessage: string) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    unauthorized(invalidMessage);
  }
  return payload as Record<string, unknown>;
}

async function exchangeProviderCode(
  env: ApiEnv,
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
) {
  const config = providerConfig(env, provider);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthCallbackUrl(env, provider),
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
  if (provider !== "x") {
    params.set("client_secret", config.clientSecret);
  }

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (provider === "x") {
    headers.authorization = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
  }

  return fetchJson(config.tokenUrl, {
    method: "POST",
    headers,
    body: params.toString(),
  }, "OAuth code exchange failed.");
}

async function googleProfile(accessToken: string): Promise<OAuthProfile> {
  const payload = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  }, "Google profile lookup failed.");
  return ExternalIdentityProfileSchema.parse({
    provider: "google",
    providerUserId: String(payload.sub ?? ""),
    email: payload.email ? String(payload.email).toLowerCase() : null,
    emailVerified: Boolean(payload.email_verified),
    displayName: String(payload.name ?? payload.email ?? "Google user"),
    username: null,
    avatarUrl: payload.picture ? String(payload.picture) : null,
    raw: payload,
  });
}

async function githubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "opndomain",
  };
  const user = await fetchJson("https://api.github.com/user", { headers }, "GitHub profile lookup failed.");
  const emails = await fetchJson("https://api.github.com/user/emails", { headers }, "GitHub email lookup failed.");
  const verifiedEmail = Array.isArray(emails)
    ? emails.find((entry) => entry && typeof entry === "object" && entry.verified === true && typeof entry.email === "string")
    : null;
  return ExternalIdentityProfileSchema.parse({
    provider: "github",
    providerUserId: String(user.id ?? ""),
    email: verifiedEmail && typeof verifiedEmail.email === "string" ? verifiedEmail.email.toLowerCase() : null,
    emailVerified: Boolean(verifiedEmail),
    displayName: String(user.name ?? user.login ?? "GitHub user"),
    username: user.login ? String(user.login) : null,
    avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
    raw: {
      user,
      emails,
    },
  });
}

async function xProfile(accessToken: string): Promise<OAuthProfile> {
  const payload = await fetchJson("https://api.x.com/2/users/me?user.fields=profile_image_url", {
    headers: { authorization: `Bearer ${accessToken}` },
  }, "X profile lookup failed.");
  const data = (payload.data ?? {}) as Record<string, unknown>;
  return ExternalIdentityProfileSchema.parse({
    provider: "x",
    providerUserId: String(data.id ?? ""),
    email: data.email ? String(data.email).toLowerCase() : null,
    emailVerified: Boolean(data.email_verified),
    displayName: String(data.name ?? data.username ?? "X user"),
    username: data.username ? String(data.username) : null,
    avatarUrl: data.profile_image_url ? String(data.profile_image_url) : null,
    raw: payload,
  });
}

async function providerProfile(provider: OAuthProvider, accessToken: string) {
  switch (provider) {
    case "google":
      return googleProfile(accessToken);
    case "github":
      return githubProfile(accessToken);
    case "x":
      return xProfile(accessToken);
  }
}

async function externalIdentityForProviderUser(env: ApiEnv, provider: OAuthProvider, providerUserId: string) {
  return firstRow<ExternalIdentityRow>(
    env.DB,
    `
      SELECT id, agent_id, provider, provider_user_id, email_snapshot, email_verified, profile_json, linked_at, last_login_at, created_at, updated_at
      FROM external_identities
      WHERE provider = ? AND provider_user_id = ?
    `,
    provider,
    providerUserId,
  );
}

function agentNameForProfile(profile: OAuthProfile) {
  return profile.displayName.trim().slice(0, 100) || `${profile.provider} user`;
}

async function insertExternalIdentity(env: ApiEnv, agentId: string, profile: OAuthProfile) {
  const linkedAt = nowIso();
  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO external_identities (
          id, agent_id, provider, provider_user_id, email_snapshot, email_verified, profile_json, linked_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      createId("eid"),
      agentId,
      profile.provider,
      profile.providerUserId,
      profile.email,
      Number(profile.emailVerified),
      JSON.stringify(profile),
      linkedAt,
      linkedAt,
    ),
  );
}

async function touchExternalIdentity(env: ApiEnv, rowId: string, profile: OAuthProfile) {
  await runStatement(
    env.DB.prepare(
      `
        UPDATE external_identities
        SET email_snapshot = ?, email_verified = ?, profile_json = ?, last_login_at = ?, updated_at = ?
        WHERE id = ?
      `,
    ).bind(profile.email, Number(profile.emailVerified), JSON.stringify(profile), nowIso(), nowIso(), rowId),
  );
}

async function createOAuthAgent(env: ApiEnv, profile: OAuthProfile): Promise<OAuthProvisionResult> {
  const agentId = createId("agt");
  const clientId = createClientId();
  const clientSecret = createSecret();
  const verifiedAt = profile.emailVerified ? nowIso() : null;
  const trustTier = profile.emailVerified ? "supervised" : "unverified";

  await runStatement(
    env.DB.prepare(
      `
        INSERT INTO agents (
          id, client_id, client_secret_hash, name, email, email_verified_at, trust_tier, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `,
    ).bind(
      agentId,
      clientId,
      await sha256(clientSecret),
      agentNameForProfile(profile),
      profile.email,
      verifiedAt,
      trustTier,
    ),
  );

  await insertExternalIdentity(env, agentId, profile);
  const agent = await getAgentById(env, agentId);
  if (!agent) {
    unauthorized("OAuth agent provisioning failed.");
  }
  return { kind: "new", agent, clientId, clientSecret };
}

async function resolveOAuthAgent(env: ApiEnv, profile: OAuthProfile): Promise<OAuthProvisionResult> {
  const existingIdentity = await externalIdentityForProviderUser(env, profile.provider, profile.providerUserId);
  if (existingIdentity) {
    const agent = await getAgentById(env, existingIdentity.agent_id);
    if (!agent) {
      unauthorized("Linked OAuth account no longer has a valid agent.");
    }
    await touchExternalIdentity(env, existingIdentity.id, profile);
    return { kind: "existing", agent };
  }

  if (profile.email && profile.emailVerified) {
    const agent = await getAgentByEmail(env, profile.email);
    if (agent) {
      await insertExternalIdentity(env, agent.id, profile);
      return { kind: "existing", agent };
    }
  }

  return createOAuthAgent(env, profile);
}

async function verifiedState(
  env: ApiEnv,
  provider: OAuthProvider,
  request: Request,
  rawState: string,
) {
  const payload = await verifyJwt(env, rawState);
  if (payload.scope !== OAUTH_STATE_SCOPE || payload.sub !== provider) {
    unauthorized("OAuth state is invalid.");
  }
  const state = OAuthStatePayloadSchema.parse({
    provider: payload.provider,
    nonce: payload.nonce,
    codeVerifier: payload.codeVerifier,
    redirect: payload.redirect ?? null,
  });
  const cookieNonce = readCookieValue(request.headers.get("cookie"), oauthNonceCookieName(provider));
  if (!cookieNonce || cookieNonce !== state.nonce) {
    unauthorized("OAuth state is invalid.");
  }
  return state;
}

function callbackFailureUrl(env: ApiEnv, provider: OAuthProvider, message: string) {
  const url = new URL("/login", env.ROUTER_ORIGIN);
  url.searchParams.set("oauth_error", message);
  url.searchParams.set("provider", provider);
  return url.toString();
}

function callbackSuccessUrl(env: ApiEnv, path: string) {
  return new URL(path, env.ROUTER_ORIGIN).toString();
}

export async function beginOAuthAuthorize(
  env: ApiEnv,
  ipAddress: string,
  provider: OAuthProvider,
  redirect: string | null | undefined,
) {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:oauth:authorize:${provider}:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  const config = providerConfig(env, provider);
  const nonce = createSecret();
  const codeVerifier = createSecret(48);
  const state = await signedStateToken(env, provider, {
    provider,
    nonce,
    codeVerifier,
    redirect: normalizeRedirect(redirect),
  });
  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", oauthCallbackUrl(env, provider));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", await pkceChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") {
    authorizeUrl.searchParams.set("access_type", "online");
    authorizeUrl.searchParams.set("include_granted_scopes", "true");
  }

  return {
    location: authorizeUrl.toString(),
    nonceCookie: buildScopedCookie(env, oauthNonceCookieName(provider), nonce, env.OAUTH_STATE_TTL_SECONDS),
  };
}

export async function completeOAuthCallback(
  env: ApiEnv,
  request: Request,
  ipAddress: string,
  provider: OAuthProvider,
  query: { code?: string; state?: string; error?: string; errorDescription?: string },
) {
  await enforceHourlyRateLimit(env.PUBLIC_CACHE, `rate-limit:oauth:callback:${provider}:${ipAddress}`, env.TOKEN_RATE_LIMIT_PER_HOUR);

  if (query.error) {
    return {
      location: callbackFailureUrl(env, provider, query.errorDescription ?? query.error),
      setCookies: [buildClearedCookie(env, oauthNonceCookieName(provider))],
    };
  }
  if (!query.code || !query.state) {
    return {
      location: callbackFailureUrl(env, provider, "Missing OAuth callback parameters."),
      setCookies: [buildClearedCookie(env, oauthNonceCookieName(provider))],
    };
  }

  const state = await verifiedState(env, provider, request, query.state);
  const tokenPayload = await exchangeProviderCode(env, provider, query.code, state.codeVerifier);
  const accessToken = String(tokenPayload.access_token ?? "");
  if (!accessToken) {
    unauthorized("OAuth code exchange failed.");
  }
  const profile = await providerProfile(provider, accessToken);
  const provisioned = await resolveOAuthAgent(env, profile);
  const session = await createSessionTokens(env, provisioned.agent);
  const setCookies = [
    buildClearedCookie(env, oauthNonceCookieName(provider)),
    session.cookie,
  ];

  if (provisioned.kind === "new") {
    const welcomeToken = await signedWelcomeToken(env, {
      agentId: provisioned.agent.id,
      clientId: provisioned.clientId,
      clientSecret: provisioned.clientSecret,
    });
    setCookies.push(buildScopedCookie(env, OAUTH_WELCOME_COOKIE_NAME, welcomeToken, env.OAUTH_WELCOME_TTL_SECONDS));
    return {
      location: callbackSuccessUrl(env, "/welcome/credentials"),
      setCookies,
    };
  }

  return {
    location: callbackSuccessUrl(env, state.redirect ?? "/account"),
    setCookies,
  };
}

export async function consumeOAuthWelcome(env: ApiEnv, request: Request) {
  const session = await authenticateRequest(env, request);
  const token = readCookieValue(request.headers.get("cookie"), OAUTH_WELCOME_COOKIE_NAME);
  if (!token) {
    unauthorized("OAuth welcome data is no longer available.");
  }
  const payload = await verifyJwt(env, token);
  if (payload.scope !== OAUTH_WELCOME_SCOPE) {
    unauthorized("OAuth welcome data is no longer available.");
  }
  const welcome = OAuthWelcomePayloadSchema.parse({
    agentId: payload.agentId,
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
  });
  if (welcome.agentId !== session.agent.id) {
    unauthorized("OAuth welcome data does not match the active session.");
  }
  return {
    clientId: welcome.clientId,
    clientSecret: welcome.clientSecret,
    clearedCookie: buildClearedCookie(env, OAUTH_WELCOME_COOKIE_NAME),
  };
}

export async function listExternalIdentitiesForAgent(env: ApiEnv, agentId: string) {
  const rows = await allRows<ExternalIdentityRow>(
    env.DB,
    `
      SELECT id, agent_id, provider, provider_user_id, email_snapshot, email_verified, profile_json, linked_at, last_login_at, created_at, updated_at
      FROM external_identities
      WHERE agent_id = ?
      ORDER BY created_at ASC
    `,
    agentId,
  );
  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    emailSnapshot: row.email_snapshot,
    emailVerified: Boolean(row.email_verified),
    linkedAt: row.linked_at,
    lastLoginAt: row.last_login_at,
  }));
}
