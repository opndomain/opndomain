import { z } from "zod";
import { ApiBindingSchema, BaseEnvSchema } from "@opndomain/shared";

const ParsedApiEnvSchema = BaseEnvSchema.extend({
  ADMIN_ALLOWED_EMAILS: z.string().default(""),
  ADMIN_ALLOWED_CLIENT_IDS: z.string().default(""),
}).transform((value) => ({
  ...value,
  ADMIN_ALLOWED_EMAILS_SET: new Set(
    value.ADMIN_ALLOWED_EMAILS.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ),
  ADMIN_ALLOWED_CLIENT_IDS_SET: new Set(
    value.ADMIN_ALLOWED_CLIENT_IDS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
}));

export type ApiEnv = z.infer<typeof ParsedApiEnvSchema> & z.infer<typeof ApiBindingSchema>;

export function parseApiEnv(rawEnv: unknown): ApiEnv {
  return {
    ...ParsedApiEnvSchema.parse(rawEnv),
    ...ApiBindingSchema.parse(rawEnv),
  };
}
