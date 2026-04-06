import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CACHE_GENERATION_LANDING,
  CACHE_INVALIDATION_EVENT_PREFIX,
  cacheGenerationDomainKey,
  cacheGenerationTopicKey,
  cacheGenerationVerdictKey,
} from "@opndomain/shared";
import { invalidateTopicPublicSurfaces } from "./invalidation.js";

class FakeCache {
  values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FakeDb {
  private parentDomainId: string | null;
  constructor(parentDomainId: string | null = null) {
    this.parentDomainId = parentDomainId;
  }
  prepare(_sql: string) {
    const self = this;
    return {
      bind(..._args: unknown[]) { return this; },
      async first<T>(): Promise<T | null> {
        return { parent_domain_id: self.parentDomainId } as T;
      },
    };
  }
}

describe("public cache invalidation", () => {
  it("bumps all generations and records the reason and timestamp", async () => {
    const cache = new FakeCache();
    cache.values.set(CACHE_GENERATION_LANDING, "4");
    cache.values.set(cacheGenerationDomainKey("dom_1"), "1");
    cache.values.set(cacheGenerationTopicKey("top_1"), "9");
    cache.values.set(cacheGenerationVerdictKey("top_1"), "2");

    const keys = await invalidateTopicPublicSurfaces(
      { PUBLIC_CACHE: cache as never, DB: new FakeDb() as never } as never,
      {
        topicId: "top_1",
        domainId: "dom_1",
        reason: "round_completion",
        occurredAt: "2026-03-26T12:00:00.000Z",
      },
    );

    assert.deepEqual(keys, [
      CACHE_GENERATION_LANDING,
      cacheGenerationDomainKey("dom_1"),
      cacheGenerationTopicKey("top_1"),
      cacheGenerationVerdictKey("top_1"),
    ]);
    assert.equal(cache.values.get(CACHE_GENERATION_LANDING), "5");
    assert.equal(cache.values.get(cacheGenerationDomainKey("dom_1")), "2");
    assert.equal(cache.values.get(cacheGenerationTopicKey("top_1")), "10");
    assert.equal(cache.values.get(cacheGenerationVerdictKey("top_1")), "3");

    const event = JSON.parse(cache.values.get(`${CACHE_INVALIDATION_EVENT_PREFIX}top_1`) ?? "{}");
    assert.equal(event.reason, "round_completion");
    assert.equal(event.occurredAt, "2026-03-26T12:00:00.000Z");
    assert.deepEqual(event.keys, keys);
  });
});
