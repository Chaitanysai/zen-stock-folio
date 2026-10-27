// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheGet,
  cacheSet,
  cacheStats,
  cached,
  resetMarketCache,
} from "./marketCache";

beforeEach(() => resetMarketCache());

describe("marketCache (per-isolate TTL cache)", () => {
  it("never caches a TTL <= 0 entry (unknown freshness must not be frozen)", () => {
    cacheSet("a", { v: 1 }, 0);
    expect(cacheGet("a")).toBeNull();
  });

  it("evicts expired entries on read", () => {
    cacheSet("expired", { v: 1 }, 100, Date.now() - 200);
    expect(cacheGet("expired")).toBeNull();

    cacheSet("fresh", { v: 2 }, 60_000);
    const hit = cacheGet<{ v: number }>("fresh");
    expect(hit?.cached).toBe(true);
    expect(hit?.value).toEqual({ v: 2 });
    expect((hit?.ageMs ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("single-flights concurrent loads for the same key", async () => {
    const loader = vi.fn(async () => ({ series: [1, 2, 3] }));
    const ttlFor = () => 5_000;

    const [a, b] = await Promise.all([
      cached("key", loader, ttlFor),
      cached("key", loader, ttlFor),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a.value).toEqual({ series: [1, 2, 3] });
    expect(a.cached).toBe(false);
    expect(b.value).toEqual(a.value);
  });

  it("serves a later call from cache without running the loader again", async () => {
    const loader = vi.fn(async () => "value");
    await cached("k", loader, () => 60_000);
    const second = await cached("k", loader, () => 60_000);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
  });

  it("does not cache a throwing load and retries on the next call", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("provider down");
      return "recovered";
    });

    await expect(cached("k", loader, () => 60_000)).rejects.toThrow("provider down");
    expect(cacheGet("k")).toBeNull(); // a failure must not be replayed for a TTL

    const result = await cached("k", loader, () => 60_000);
    expect(result.value).toBe("recovered");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cacheStats().inflight).toBe(0); // inflight cleared even on failure
  });

  it("resetMarketCache drops entries and inflight promises", async () => {
    cacheSet("k", "v", 60_000);
    resetMarketCache();
    expect(cacheGet("k")).toBeNull();
    expect(cacheStats().entries).toBe(0);
  });
});
