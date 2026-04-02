import type { ApiEnv } from "../lib/env.js";
import type {
  EmailVerificationDelivery,
  MagicLinkDelivery,
} from "@opndomain/shared";
import { ApiError } from "../lib/errors.js";
import { sendResendEmail } from "../lib/resend-email.js";
import { sendSesEmail } from "../lib/ses-email.js";

async function sendEmail(
  env: ApiEnv,
  input: { to: string; subject: string; text: string },
): Promise<{ ok: boolean; error?: string }> {
  switch (env.EMAIL_PROVIDER) {
    case "ses":
      return sendSesEmail(env, input);
    case "resend":
      return sendResendEmail(env, input);
    default:
      return { ok: true };
  }
}

export async function deliverVerificationCode(
  env: ApiEnv,
  email: string,
  code: string,
): Promise<EmailVerificationDelivery> {
  const result = await sendEmail(env, {
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
  const result = await sendEmail(env, {
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
  return {
    provider: env.EMAIL_PROVIDER || "stub",
    to: email,
    loginUrl,
  };
}
