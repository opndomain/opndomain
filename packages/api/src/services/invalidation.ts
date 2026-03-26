import {
  CACHE_GENERATION_LANDING,
  CACHE_INVALIDATION_EVENT_PREFIX,
  cacheGenerationDomainKey,
  cacheGenerationTopicKey,
  cacheGenerationVerdictKey,
} from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";

async function bumpGeneration(env: ApiEnv, key: string): Promise<void> {
  const current = await env.PUBLIC_CACHE.get(key);
  const next = Number.parseInt(current ?? "0", 10) + 1;
  await env.PUBLIC_CACHE.put(key, String(next));
}

export async function invalidateTopicPublicSurfaces(
  env: ApiEnv,
  input: { topicId: string; domainId: string; reason: string; occurredAt?: string },
): Promise<string[]> {
  const keys = [
    CACHE_GENERATION_LANDING,
    cacheGenerationDomainKey(input.domainId),
    cacheGenerationTopicKey(input.topicId),
    cacheGenerationVerdictKey(input.topicId),
  ];
  for (const key of keys) {
    await bumpGeneration(env, key);
  }
  await env.PUBLIC_CACHE.put(
    `${CACHE_INVALIDATION_EVENT_PREFIX}${input.topicId}`,
    JSON.stringify({
      topicId: input.topicId,
      domainId: input.domainId,
      reason: input.reason,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      keys,
    }),
  );
  return keys;
}
