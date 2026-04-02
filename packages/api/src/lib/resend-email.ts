import type { ApiEnv } from "./env.js";

export type ResendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendResendEmail(
  env: ApiEnv,
  input: ResendEmailInput,
): Promise<{ ok: boolean; id?: string; status?: number; error?: string }> {
  const apiKey = env.EMAIL_PROVIDER_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured" };
  }

  const fromAddress = env.EMAIL_FROM || "noreply@opndomain.com";
  const replyTo = env.EMAIL_REPLY_TO || fromAddress;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [input.to],
        reply_to: replyTo,
        subject: input.subject,
        text: input.text,
      }),
    });

    if (response.ok) {
      const data = await response.json<{ id: string }>();
      return { ok: true, id: data.id, status: response.status };
    }

    const errorBody = await response.text().catch(() => "");
    console.error("Resend email delivery failed", {
      to: input.to,
      status: response.status,
      body: errorBody,
    });
    return { ok: false, status: response.status, error: "resend_delivery_failed" };
  } catch (error) {
    console.error("Resend email fetch threw", { to: input.to, error });
    return { ok: false, error: "resend_fetch_error" };
  }
}
