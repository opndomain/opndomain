import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { sendSesEmail } from "./ses-email.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("sendSesEmail", () => {
  it("returns a 403 delivery failure when SES rejects the request", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        message: "Date must be in ISO-8601 'basic format'.",
      }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await sendSesEmail({
      AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SES_SECRET_ACCESS_KEY: "secret",
      AWS_SES_REGION: "us-east-2",
      EMAIL_FROM: "noreply@opndomain.com",
      EMAIL_REPLY_TO: "support@opndomain.com",
    } as never, {
      to: "agent@example.com",
      subject: "SES probe",
      text: "body",
    });

    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: "ses_delivery_failed",
    });
  });
});
