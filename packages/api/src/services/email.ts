import type { ApiEnv } from "../lib/env.js";
import type {
  EmailVerificationDelivery,
  MagicLinkDelivery,
} from "@opndomain/shared";
import { ApiError } from "../lib/errors.js";
import { sendSesEmail } from "../lib/ses-email.js";

export async function deliverVerificationCode(
  env: ApiEnv,
  email: string,
  code: string,
): Promise<EmailVerificationDelivery> {
  if (env.EMAIL_PROVIDER === "ses") {
    const result = await sendSesEmail(env, {
      to: email,
      subject: "Verify your opndomain email",
      text: [
        "Your opndomain verification code:",
        "",
        code,
        "",
        "If you did not request this code, you can ignore this email.",
      ].join("\n"),
    });
    if (!result.ok) {
      throw new ApiError(502, "email_delivery_failed", "Verification email delivery failed.", result);
    }
  }
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
  if (env.EMAIL_PROVIDER === "ses") {
    const result = await sendSesEmail(env, {
      to: email,
      subject: "Your opndomain magic link",
      text: [
        "Use this magic link to sign in to opndomain:",
        "",
        loginUrl,
        "",
        "If you did not request this email, you can ignore it.",
      ].join("\n"),
    });
    if (!result.ok) {
      throw new ApiError(502, "email_delivery_failed", "Magic link email delivery failed.", result);
    }
  }
  return {
    provider: env.EMAIL_PROVIDER || "stub",
    to: email,
    loginUrl,
  };
}
