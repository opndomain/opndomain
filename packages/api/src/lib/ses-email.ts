import type { ApiEnv } from "./env.js";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value));
}

async function hmacHex(key: ArrayBuffer | Uint8Array, value: string): Promise<string> {
  return toHex(await hmacRaw(key, value));
}

async function deriveSigningKey(secretAccessKey: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(new TextEncoder().encode(`AWS4${secretAccessKey}`), date);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, "ses");
  return hmacRaw(kService, "aws4_request");
}

export type SesEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendSesEmail(
  env: ApiEnv,
  input: SesEmailInput,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const accessKeyId = env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SES_SECRET_ACCESS_KEY;
  const region = env.AWS_SES_REGION || "us-east-2";
  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, error: "ses_not_configured" };
  }

  const fromAddress = env.EMAIL_FROM || "noreply@opndomain.com";
  const replyTo = env.EMAIL_REPLY_TO || fromAddress;
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = iso;
  const dateStamp = amzDate.slice(0, 8);

  const body = JSON.stringify({
    FromEmailAddress: fromAddress,
    Destination: {
      ToAddresses: [input.to],
    },
    ReplyToAddresses: [replyTo],
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: input.text, Charset: "UTF-8" },
        },
      },
    },
  });

  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = [
    "content-type:application/json",
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  if (env.AWS_SES_SESSION_TOKEN) {
    canonicalHeaders.push(`x-amz-security-token:${env.AWS_SES_SESSION_TOKEN}`);
  }
  canonicalHeaders.sort();

  const signedHeaders = canonicalHeaders.map((line) => line.split(":")[0]).join(";");
  const canonicalRequest = [
    "POST",
    "/v2/email/outbound-emails",
    "",
    canonicalHeaders.join("\n") + "\n",
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region);
  const signature = await hmacHex(signingKey, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    Authorization: authorization,
  };
  if (env.AWS_SES_SESSION_TOKEN) {
    headers["X-Amz-Security-Token"] = env.AWS_SES_SESSION_TOKEN;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });
    if (response.ok) {
      return { ok: true, status: response.status };
    }
    const errorBody = await response.text().catch(() => "");
    console.error("SES email delivery failed", {
      to: input.to,
      status: response.status,
      body: errorBody,
    });
    return { ok: false, status: response.status, error: "ses_delivery_failed" };
  } catch (error) {
    console.error("SES email fetch threw", { to: input.to, error });
    return { ok: false, error: "ses_fetch_error" };
  }
}
