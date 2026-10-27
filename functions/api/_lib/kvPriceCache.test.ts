// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  cacheKey,
  isValidCachedQuote,
  readEodCache,
  writeEodCache,
} from "./kvPriceCache";
import type { Env } from "./types";

const validQuote = {
  price: 2500,
  weekHigh52: 2600,
  weekLow52: 2000,
  changePercent: 2.04,
  change: 50,
  asOf: "2026-10-26T10:00:00Z",
  source: "upstox-live",
};

const makeEnv = (binding: unknown) => ({ PRICE_CACHE: binding }) as Env;

describe("kvPriceCache", () => {
  it("no-ops without the KV binding (pre-approval / local dev)", async () => {
    const env = makeEnv(undefined);
    await expect(readEodCache(env, ["RELIANCE"])).resolves.toEqual({});
    await expect(writeEodCache(env, { RELIANCE: validQuote })).resolves.toBe(0);
  });

  it("reads only structurally valid cached quotes", async () => {
    const put = vi.fn(async (_key: string, _value: string, _opts?: unknown) => undefined);
    const binding = {
      get: vi.fn(async () =>
        new Map<string, unknown>([
          [cacheKey("RELIANCE"), validQuote],
          [cacheKey("TCS"), { price: "not-a-number" }],
          [cacheKey("INFY"), { ...validQuote, price: 0 }],
        ]),
      ),
      put,
    };

    const result = await readEodCache(makeEnv(binding), ["RELIANCE", "TCS", "INFY"]);
    expect(Object.keys(result)).toEqual(["RELIANCE"]);
    expect(result.RELIANCE.asOf).toBe("2026-10-26T10:00:00Z");
  });

  it("writes EOD entries with a 30 h TTL only while the market is closed", async () => {
    const put = vi.fn(async (_key: string, _value: string, _opts?: unknown) => undefined);
    const binding = { get: vi.fn(async () => new Map<string, unknown>()), put };
    // Monday 2026-10-26, 15:45 IST — market closed.
    const closed = new Date("2026-10-26T10:15:00Z");

    const written = await writeEodCache(makeEnv(binding), { RELIANCE: validQuote }, closed);

    expect(written).toBe(1);
    expect(put).toHaveBeenCalledWith(
      cacheKey("RELIANCE"),
      expect.stringContaining("2500"),
      expect.objectContaining({ expirationTtl: 30 * 60 * 60 }),
    );

    // Monday 10:30 IST — market open: no EOD writes at all.
    const open = new Date("2026-10-26T05:00:00Z");
    await expect(writeEodCache(makeEnv(binding), { RELIANCE: validQuote }, open)).resolves.toBe(0);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("amortises writes: skips entries newer than 30 min, rewrites older ones", async () => {
    const recentEntry = { ...validQuote, asOf: "2026-10-26T10:00:00Z" };
    const staleEntry = { ...validQuote, asOf: "2026-10-25T08:00:00Z" };
    const put = vi.fn(async (_key: string, _value: string, _opts?: unknown) => undefined);
    const binding = {
      get: vi.fn(async () =>
        new Map<string, unknown>([
          [cacheKey("RELIANCE"), recentEntry],
          [cacheKey("TCS"), staleEntry],
        ]),
      ),
      put,
    };
    // Sunday (closed). New quote fetched 10 min after the cached one.
    const sunday = new Date("2026-10-25T10:00:00Z");

    const fresh = { ...validQuote, asOf: new Date(sunday.getTime() + 10 * 60 * 1000).toISOString() };
    const written = await writeEodCache(
      makeEnv(binding),
      { RELIANCE: fresh, TCS: fresh },
      sunday,
    );

    // RELIANCE: existing only 10 min older → skip. TCS: 26 h older → rewrite.
    expect(written).toBe(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(cacheKey("TCS"));
  });

  it("never lets cache failures break a request", async () => {
    const binding = {
      get: vi.fn(async (_keys: string[], _opts?: unknown) => {
        throw new Error("kv down");
      }),
      put: vi.fn(async (_key: string, _value: string, _opts?: unknown) => {
        throw new Error("kv down");
      }),
    };
    await expect(readEodCache(makeEnv(binding), ["X"])).resolves.toEqual({});
    await expect(writeEodCache(makeEnv(binding), { X: validQuote }, new Date("2026-10-25T10:00:00Z"))).resolves.toBe(0);
  });

  it("validates quote shape", () => {
    expect(isValidCachedQuote(validQuote)).toBe(true);
    expect(isValidCachedQuote({ ...validQuote, price: -1 })).toBe(false);
    expect(isValidCachedQuote({ ...validQuote, asOf: "not-a-date" })).toBe(false);
    expect(isValidCachedQuote(null)).toBe(false);
  });
});
