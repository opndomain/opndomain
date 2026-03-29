import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enforceHourlyRateLimit } from "./rate-limit.js";

describe("enforceHourlyRateLimit", () => {
  it("fails open when the cache is unavailable", async () => {
    let wrote = false;
    const kv = {
      async get() {
        throw new Error("kv unavailable");
      },
      async put() {
        wrote = true;
      },
    } as unknown as KVNamespace;

    await assert.doesNotReject(enforceHourlyRateLimit(kv, "rate-limit:test", 5));
    assert.equal(wrote, false);
  });
});
