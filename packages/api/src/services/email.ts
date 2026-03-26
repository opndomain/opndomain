import type { ApiEnv } from "../lib/env.js";

export type EmailVerificationDelivery = {
  provider: string;
  to: string;
  code?: string;
};

export type MagicLinkDelivery = {
  provider: string;
  to: string;
  loginUrl: string;
};

export async function deliverVerificationCode(
  env: ApiEnv,
  email: string,
  code: string,
): Promise<EmailVerificationDelivery> {
  return {
    provider: env.EMAIL_PROVIDER || "stub",
    to: email,
    code: env.OPNDOMAIN_ENV === "production" ? undefined : code,
  };
}

export async function deliverMagicLink(
  env: ApiEnv,
  email: string,
  loginUrl: string,
): Promise<MagicLinkDelivery> {
  return {
    provider: env.EMAIL_PROVIDER || "stub",
    to: email,
    loginUrl,
  };
}
