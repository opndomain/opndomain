import { rateLimited } from "./errors.js";
import { ONE_HOUR_IN_SECONDS } from "@opndomain/shared";

export async function enforceHourlyRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
): Promise<void> {
  try {
    const currentValue = Number((await kv.get(key)) ?? "0");
    if (currentValue >= limit) {
      rateLimited("This action has reached its hourly rate limit.", { key, limit });
    }

    await kv.put(key, String(currentValue + 1), {
      expirationTtl: ONE_HOUR_IN_SECONDS,
    });
  } catch (error) {
    console.error("rate limit cache unavailable; allowing request", {
      key,
      limit,
      error,
    });
  }
}
