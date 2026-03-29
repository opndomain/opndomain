import { createHash } from "node:crypto";

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  try {
    return toHex(await crypto.subtle.digest("SHA-256", encodeUtf8(value)));
  } catch {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}

export async function safeEqualHash(candidate: string, expectedHash: string): Promise<boolean> {
  return (await sha256(candidate)) === expectedHash;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const trimmed = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}
