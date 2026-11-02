import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeDaily, dailyKey, dailyRetryAfterSeconds } from "./dailyLimit";
import { makeEnv } from "./testHelpers";

/**
 * Local in-memory KV.
 *
 * `testHelpers.kvBinding` models the batch `get(string[]) -> Map` call used by
 * the FX cache and its `put` is a no-op, so it cannot represent an incrementing
 * counter. This stub only implements the single-key get/put pair the daily
 * guard actually calls.
 */
const memoryKv = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
};

afterEach(() => vi.useRealTimers());

describe("daily broker budget", () => {
  it("keys the counter by uid and UTC day", () => {
    expect(dailyKey("u1", Date.parse("2026-11-01T23:59:59Z"))).toBe("broker:daily:u1:2026-11-01");
  });

  it("reports the seconds until the UTC day rolls over", () => {
    expect(dailyRetryAfterSeconds(Date.parse("2026-11-01T23:00:00Z"))).toBe(3600);
  });

  it("allows up to the limit and then refuses", async () => {
    const PRICE_CACHE = memoryKv();
    const env = makeEnv({ PRICE_CACHE });
    for (let i = 0; i < 20; i += 1) {
      expect((await consumeDaily(env, "u1", 20)).allowed).toBe(true);
    }
    expect(await consumeDaily(env, "u1", 20)).toMatchObject({ allowed: false, used: 20 });
    // A refusal must not extend the day's counter.
    expect(PRICE_CACHE.store.get("broker:daily:u1:" + new Date().toISOString().slice(0, 10))).toBe("20");
  });

  it("keeps separate counters per user", async () => {
    const env = makeEnv({ PRICE_CACHE: memoryKv() });
    for (let i = 0; i < 20; i += 1) {
      await consumeDaily(env, "u1", 20);
    }
    expect((await consumeDaily(env, "u2", 20)).allowed).toBe(true);
  });

  it("fails open when no KV binding exists, because the minute limiter still applies", async () => {
    expect(await consumeDaily(makeEnv(), "u1", 20)).toEqual({ allowed: true, used: 0 });
  });

  it("fails open when KV is unhealthy", async () => {
    const env = makeEnv({
      PRICE_CACHE: {
        get: vi.fn(async () => {
          throw new Error("kv down");
        }),
        put: vi.fn(async () => {
          throw new Error("kv down");
        }),
      },
    });
    expect(await consumeDaily(env, "u1", 20)).toEqual({ allowed: true, used: 0 });
  });
});
