export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createClientId(): string {
  return `cli_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createSecret(byteLength = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createNumericCode(length = 6): string {
  const digits = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(digits, (digit) => (digit % 10).toString()).join("");
}
