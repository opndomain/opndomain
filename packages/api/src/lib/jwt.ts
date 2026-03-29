import { badRequest, unauthorized } from "./errors.js";
import { importPrivateKey, importPublicKey } from "./crypto.js";
import { nowIso } from "./time.js";
import type { ApiEnv } from "./env.js";

type JwtPayload = Record<string, unknown> & {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  exp: number;
  iat: number;
  jti: string;
};

function base64UrlEncode(value: Uint8Array | string): string {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of input) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function signJwt(env: ApiEnv, payload: JwtPayload): Promise<string> {
  if (!env.JWT_PRIVATE_KEY_PEM) {
    badRequest("jwt_key_missing", "JWT private key is not configured.");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(env.JWT_PRIVATE_KEY_PEM);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyJwt(env: ApiEnv, token: string): Promise<JwtPayload> {
  if (!env.JWT_PUBLIC_KEY_PEM) {
    unauthorized();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    unauthorized("Token format is invalid.");
  }
  if (
    base64UrlEncode(base64UrlDecode(encodedHeader)) !== encodedHeader
    || base64UrlEncode(base64UrlDecode(encodedPayload)) !== encodedPayload
    || base64UrlEncode(base64UrlDecode(encodedSignature)) !== encodedSignature
  ) {
    unauthorized("Token encoding is invalid.");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPublicKey(env.JWT_PUBLIC_KEY_PEM);
  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(signingInput),
  );
  if (!isValid) {
    unauthorized("Token signature is invalid.");
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== env.JWT_ISSUER || payload.aud !== env.JWT_AUDIENCE) {
    unauthorized("Token issuer or audience is invalid.");
  }
  if (payload.exp <= now) {
    unauthorized("Token is expired.");
  }

  void nowIso;
  return payload;
}
