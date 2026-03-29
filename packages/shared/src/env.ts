import { z } from "zod";

export const BaseEnvSchema = z.object({
  OPNDOMAIN_ENV: z.enum(["development", "preview", "production"]).default("development"),
  ROOT_DOMAIN: z.string().min(1).default("opndomain.com"),
  ROUTER_HOST: z.string().min(1).default("opndomain.com"),
  API_HOST: z.string().min(1).default("api.opndomain.com"),
  MCP_HOST: z.string().min(1).default("mcp.opndomain.com"),
  ROUTER_ORIGIN: z.string().url().default("https://opndomain.com"),
  API_ORIGIN: z.string().url().default("https://api.opndomain.com"),
  MCP_ORIGIN: z.string().url().default("https://mcp.opndomain.com"),
  JWT_ISSUER: z.string().url().default("https://api.opndomain.com"),
  JWT_AUDIENCE: z.string().url().default("https://api.opndomain.com"),
  JWT_PRIVATE_KEY_PEM: z.string().default(""),
  JWT_PUBLIC_KEY_PEM: z.string().default(""),
  SESSION_COOKIE_NAME: z.string().default("opn_session"),
  SESSION_COOKIE_DOMAIN: z.string().default(".opndomain.com"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  WEB_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  REGISTRATION_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  TOKEN_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OAUTH_WELCOME_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  ADMIN_ALLOWED_EMAILS: z.string().default(""),
  ADMIN_ALLOWED_CLIENT_IDS: z.string().default(""),
  ENABLE_SEMANTIC_SCORING: z.union([z.boolean(), z.string()]).default(true).transform((value) => value === true || value === "true"),
  ENABLE_EPISTEMIC_SCORING: z.union([z.boolean(), z.string()]).default(false).transform((value) => value === true || value === "true"),
  ENABLE_ADAPTIVE_SCORING: z.union([z.boolean(), z.string()]).default(false).transform((value) => value === true || value === "true"),
  ENABLE_TRANSCRIPT_DELTAS: z.union([z.boolean(), z.string()]).default(false).transform((value) => value === true || value === "true"),
  ENABLE_ELASTIC_ROUNDS: z.union([z.boolean(), z.string()]).default(false).transform((value) => value === true || value === "true"),
  ENABLE_TRANSCRIPT_GUARDRAILS: z.union([z.boolean(), z.string()]).default(true).transform((value) => value === true || value === "true"),
  CURATED_OPEN_KEY: z.string().default("curated/open.json"),
  TOPIC_TRANSCRIPT_PREFIX: z.string().default("topics"),
  ARTIFACTS_PREFIX: z.string().default("artifacts"),
  ADMIN_BASE_PATH: z.string().default("/admin"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  EMAIL_PROVIDER: z.string().default("stub"),
  EMAIL_FROM: z.string().default("noreply@opndomain.com"),
  EMAIL_REPLY_TO: z.string().default("noreply@opndomain.com"),
  EMAIL_PROVIDER_API_KEY: z.string().default(""),
  AWS_SES_ACCESS_KEY_ID: z.string().default(""),
  AWS_SES_SECRET_ACCESS_KEY: z.string().default(""),
  AWS_SES_REGION: z.string().default("us-east-2"),
  AWS_SES_SESSION_TOKEN: z.string().default(""),
  EMAIL_VERIFICATION_BASE_URL: z.string().url().default("https://api.opndomain.com"),
  OAUTH_CALLBACK_BASE_URL: z.string().url().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GITHUB_OAUTH_CLIENT_ID: z.string().default(""),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().default(""),
  X_OAUTH_CLIENT_ID: z.string().default(""),
  X_OAUTH_CLIENT_SECRET: z.string().default(""),
});

export const ApiBindingSchema = z.object({
  DB: z.custom<D1Database>(),
  PUBLIC_CACHE: z.custom<KVNamespace>(),
  PUBLIC_ARTIFACTS: z.custom<R2Bucket>(),
  SNAPSHOTS: z.custom<R2Bucket>(),
  TOPIC_STATE_DO: z.custom<DurableObjectNamespace>(),
  AI: z.custom<Ai>().optional(),
  ROUTER_SERVICE: z.custom<Fetcher>().optional(),
});

export const RouterBindingSchema = z.object({
  DB: z.custom<D1Database>(),
  PUBLIC_CACHE: z.custom<KVNamespace>(),
  PUBLIC_ARTIFACTS: z.custom<R2Bucket>(),
  SNAPSHOTS: z.custom<R2Bucket>(),
  API_SERVICE: z.custom<Fetcher>(),
  MCP_SERVICE: z.custom<Fetcher>().optional(),
});

export const McpBindingSchema = z.object({
  DB: z.custom<D1Database>(),
  STORAGE: z.custom<R2Bucket>(),
  MCP_STATE: z.custom<KVNamespace>(),
  API_SERVICE: z.custom<Fetcher>(),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function parseBaseEnv(rawEnv: unknown): BaseEnv {
  return BaseEnvSchema.parse(rawEnv);
}
