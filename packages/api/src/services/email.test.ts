import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { ApiError } from "../lib/errors.js";
import { deliverMagicLink, deliverVerificationCode } from "./email.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

type TestEnv = {
  OPNDOMAIN_ENV: string;
  ROOT_DOMAIN: string;
  ROUTER_HOST: string;
  API_HOST: string;
  MCP_HOST: string;
  ROUTER_ORIGIN: string;
  API_ORIGIN: string;
  MCP_ORIGIN: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_PRIVATE_KEY_PEM: string;
  JWT_PUBLIC_KEY_PEM: string;
  SESSION_COOKIE_NAME: string;
  SESSION_COOKIE_DOMAIN: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  WEB_SESSION_TTL_SECONDS: number;
  REGISTRATION_RATE_LIMIT_PER_HOUR: number;
  TOKEN_RATE_LIMIT_PER_HOUR: number;
  EMAIL_VERIFICATION_MAX_ATTEMPTS: number;
  EMAIL_VERIFICATION_TTL_MINUTES: number;
  MAGIC_LINK_TTL_MINUTES: number;
  OAUTH_STATE_TTL_SECONDS: number;
  OAUTH_WELCOME_TTL_SECONDS: number;
  ADMIN_ALLOWED_EMAILS: string;
  ADMIN_ALLOWED_CLIENT_IDS: string;
  ENABLE_SEMANTIC_SCORING: boolean;
  ENABLE_TRANSCRIPT_GUARDRAILS: boolean;
  CURATED_OPEN_KEY: string;
  TOPIC_TRANSCRIPT_PREFIX: string;
  ARTIFACTS_PREFIX: string;
  ADMIN_BASE_PATH: string;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  EMAIL_PROVIDER: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  EMAIL_PROVIDER_API_KEY: string;
  AWS_SES_ACCESS_KEY_ID: string;
  AWS_SES_SECRET_ACCESS_KEY: string;
  AWS_SES_REGION: string;
  AWS_SES_SESSION_TOKEN: string;
  EMAIL_VERIFICATION_BASE_URL: string;
  OAUTH_CALLBACK_BASE_URL: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  X_OAUTH_CLIENT_ID: string;
  X_OAUTH_CLIENT_SECRET: string;
};

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    OPNDOMAIN_ENV: "development",
    ROOT_DOMAIN: "opndomain.com",
    ROUTER_HOST: "opndomain.com",
    API_HOST: "api.opndomain.com",
    MCP_HOST: "mcp.opndomain.com",
    ROUTER_ORIGIN: "https://opndomain.com",
    API_ORIGIN: "https://api.opndomain.com",
    MCP_ORIGIN: "https://mcp.opndomain.com",
    JWT_ISSUER: "https://api.opndomain.com",
    JWT_AUDIENCE: "https://api.opndomain.com",
    JWT_PRIVATE_KEY_PEM: privateKey,
    JWT_PUBLIC_KEY_PEM: publicKey,
    SESSION_COOKIE_NAME: "opn_session",
    SESSION_COOKIE_DOMAIN: ".opndomain.com",
    ACCESS_TOKEN_TTL_SECONDS: 3600,
    REFRESH_TOKEN_TTL_SECONDS: 2592000,
    WEB_SESSION_TTL_SECONDS: 604800,
    REGISTRATION_RATE_LIMIT_PER_HOUR: 5,
    TOKEN_RATE_LIMIT_PER_HOUR: 30,
    EMAIL_VERIFICATION_MAX_ATTEMPTS: 5,
    EMAIL_VERIFICATION_TTL_MINUTES: 15,
    MAGIC_LINK_TTL_MINUTES: 15,
    OAUTH_STATE_TTL_SECONDS: 600,
    OAUTH_WELCOME_TTL_SECONDS: 600,
    ADMIN_ALLOWED_EMAILS: "",
    ADMIN_ALLOWED_CLIENT_IDS: "",
    ENABLE_SEMANTIC_SCORING: true,
    ENABLE_TRANSCRIPT_GUARDRAILS: true,
    CURATED_OPEN_KEY: "curated/open.json",
    TOPIC_TRANSCRIPT_PREFIX: "topics",
    ARTIFACTS_PREFIX: "artifacts",
    ADMIN_BASE_PATH: "/admin",
    LOG_LEVEL: "debug",
    EMAIL_PROVIDER: "stub",
    EMAIL_FROM: "noreply@opndomain.com",
    EMAIL_REPLY_TO: "noreply@opndomain.com",
    EMAIL_PROVIDER_API_KEY: "",
    AWS_SES_ACCESS_KEY_ID: "",
    AWS_SES_SECRET_ACCESS_KEY: "",
    AWS_SES_REGION: "us-east-2",
    AWS_SES_SESSION_TOKEN: "",
    EMAIL_VERIFICATION_BASE_URL: "https://api.opndomain.com",
    OAUTH_CALLBACK_BASE_URL: "https://api.opndomain.com",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GITHUB_OAUTH_CLIENT_ID: "",
    GITHUB_OAUTH_CLIENT_SECRET: "",
    X_OAUTH_CLIENT_ID: "",
    X_OAUTH_CLIENT_SECRET: "",
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("email delivery", () => {
  it("returns stub verification payload in development", async () => {
    const result = await deliverVerificationCode(buildEnv() as never, "agent@example.com", "123456");
    assert.deepEqual(result, {
      provider: "stub",
      to: "agent@example.com",
      code: "123456",
    });
  });

  it("sends magic links through SES when configured", async () => {
    let request: RequestInit | undefined;
    let inputUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      inputUrl = String(input);
      request = init;
      return new Response("", { status: 200 });
    }) as typeof fetch;

    const result = await deliverMagicLink(buildEnv({
      EMAIL_PROVIDER: "ses",
      AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SES_SECRET_ACCESS_KEY: "secret",
      EMAIL_FROM: "noreply@opndomain.com",
      EMAIL_REPLY_TO: "support@opndomain.com",
    }) as never, "agent@example.com", "https://opndomain.com/login/verify?token=abc");

    assert.equal(result.provider, "ses");
    assert.equal(inputUrl, "https://email.us-east-2.amazonaws.com/v2/email/outbound-emails");
    assert.equal(request?.method, "POST");
    assert.match(String((request?.headers as Record<string, string>).Authorization), /^AWS4-HMAC-SHA256 /);
    const body = JSON.parse(String(request?.body));
    assert.equal(body.Destination.ToAddresses[0], "agent@example.com");
    assert.equal(body.Content.Simple.Subject.Data, "Your opndomain magic link");
    assert.match(body.Content.Simple.Body.Text.Data, /https:\/\/opndomain\.com\/login\/verify\?token=abc/);
  });

  it("raises a 502 when SES delivery fails", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

    await assert.rejects(
      deliverMagicLink(buildEnv({
        EMAIL_PROVIDER: "ses",
        AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
        AWS_SES_SECRET_ACCESS_KEY: "secret",
      }) as never, "agent@example.com", "https://opndomain.com/login/verify?token=abc"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 502 &&
        error.code === "email_delivery_failed",
    );
  });
});
