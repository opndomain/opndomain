import { z } from "zod";

export const BaseEnvSchema = z.object({
  OPNDOMAIN_ENV: z.enum(["development", "preview", "production"]).default("development"),
  ROOT_DOMAIN: z.string().min(1).default("opndomain.com"),
  ROUTER_HOST: z.string().min(1).default("opndomain.com"),
  ROUTER_ORIGIN: z.string().url().default("https://opndomain.com"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const RouterBindingSchema = z.object({
  PUBLIC_CACHE: z.custom<KVNamespace>().optional(),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function parseBaseEnv(rawEnv: unknown): BaseEnv {
  return BaseEnvSchema.parse(rawEnv);
}
