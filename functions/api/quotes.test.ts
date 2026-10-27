// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequestPost } from "./quotes";
import {
  API_ORIGIN,
  authedRequest,
  makeEnv,
  restoreIdentity,
  stubIdentity,
  stubUpstreamRoutes,
  upstreamJson,
} from "./_lib/testHelpers";
import { resetMarketCache } from "./_lib/marketCache";

const URL = `${API_ORIGIN}/api/quotes`;

const yahooBody = (symbol: string, price: number, prevClose: number) => ({
  chart: {
    result: [
      {
        meta: {
          symbol: `${symbol}.NS`,
          currency: "INR",
          exchangeName: "NSI",
          fullExchangeName: "NSE",
          instrumentType: "EQUITY",
          longName: `${symbol} Industries Limited`,
          regularMarketPrice: price,
          chartPreviousClose: prevClose,
          fiftyTwoWeekHigh: price * 1.1,
          fiftyTwoWeekLow: price * 0.8,
          regularMarketVolume: 1_000_000,
          regularMarketTime: Math.floor(Date.now() / 1000) - 300,
        },
      },
    ],
  },
});

const upstoxBody = {
  status: "success",
  data: {
    "NSE_EQ:RELIANCE": {
      last_price: 2500,
      ohlc: { open: 2450, high: 2520, low: 2440, close: 2451 },
      volume: 1000,
      last_trade_time: "2026-10-27T10:00:00+05:30",
    },
    "NSE_EQ:TCS": {
      last_price: 4100,
      ohlc: { open: 4000, high: 4120, low: 3990, close: 4002 },
      volume: 500,
      last_trade_time: "2026-10-27T10:00:00+05:30",
    },
  },
};

const post = (body: unknown, token = "good-token"): Request =>
  authedRequest(URL, body, token, "POST");

beforeEach(() => {
  stubIdentity("user-1");
  resetMarketCache();
});
afterEach(() => {
  restoreIdentity();
  resetMarketCache();
});

describe("POST /api/quotes", () => {
  it("requires authentication (401 without a bearer token)", async () => {
    stubUpstreamRoutes([]);
    const res = await onRequestPost({
      request: new Request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: ["RELIANCE"] }),
      }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("refuses unverified identities (403, same message as /api/prices)", async () => {
    stubIdentity("user-1", false);
    stubUpstreamRoutes([]);
    const res = await onRequestPost({ request: post({ tickers: ["RELIANCE"] }), env: makeEnv(), params: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Email verification required");
  });

  it("validates: empty, missing, oversized and fully-invalid lists are 400", async () => {
    stubUpstreamRoutes([]);
    const env = makeEnv();
    const run = (body: unknown) => onRequestPost({ request: post(body), env, params: {} });

    expect((await run({})).status).toBe(400); // no tickers
    expect((await run({ tickers: [] })).status).toBe(400); // empty
    expect(
      (await run({ tickers: Array.from({ length: 41 }, (_, i) => `S${i}`) })).status,
    ).toBe(400); // oversized
    expect((await run({ tickers: ["BAD NEWS!"] })).status).toBe(400); // no valid NSE symbol
    expect((await run({ symbols: ["RELIANCE"] })).status).toBe(200); // `symbols` alias accepted
  });

  it("serves Yahoo quotes with provenance and ignores junk entries with a note", async () => {
    stubUpstreamRoutes([
      { match: "chart/RELIANCE", body: yahooBody("RELIANCE", 2500.5, 2450) },
      { match: "chart/TCS", body: yahooBody("TCS", 4100, 4000) },
    ]);
    const res = await onRequestPost({
      request: post({ tickers: ["RELIANCE", "junk!!", "TCS"] }),
      env: makeEnv(),
      params: {},
    });
    const body = (await res.json()) as {
      quotes: Record<string, { provider: string; cached: boolean; quote: { price: number | null; symbol: string }; exchangeTimestamp: string | null; unavailable: string[] }>;
      fetchedAt: string;
      providerCounts: Record<string, number>;
      missing: string[];
      notes: string[];
    };

    expect(res.status).toBe(200);
    expect(body.providerCounts).toEqual({ yahoo: 2 });
    expect(body.missing).toEqual([]);
    expect(body.quotes.RELIANCE.provider).toBe("yahoo");
    expect(body.quotes.RELIANCE.cached).toBe(false);
    expect(body.quotes.RELIANCE.quote.price).toBe(2500.5);
    expect(typeof body.quotes.RELIANCE.exchangeTimestamp).toBe("string");
    expect(body.notes.some((note) => note.includes("Ignored invalid symbol"))).toBe(true);
  });

  it("prefers Upstox realtime when a token is set, without leaking it", async () => {
    stubUpstreamRoutes([{ match: "api.upstox.com", body: upstoxBody }]);
    const res = await onRequestPost({
      request: post({ tickers: ["RELIANCE", "TCS"] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const body = (await res.json()) as {
      quotes: Record<string, { provider: string; quote: { price: number } }>;
      providerCounts: Record<string, number>;
    };
    expect(res.status).toBe(200);
    expect(body.providerCounts.upstox).toBe(2);
    expect(body.quotes.RELIANCE.provider).toBe("upstox");
    expect(body.quotes.RELIANCE.quote.price).toBe(2500);
    expect(JSON.stringify(body)).not.toContain("upstox-secret-token");
    expect(JSON.stringify(body)).not.toContain("test-api-key");
  });

  it("degrades Upstox failures to Yahoo for the same request", async () => {
    stubUpstreamRoutes([
      { match: "api.upstox.com", status: 401, body: { status: "error" } },
      { match: "chart/RELIANCE", body: yahooBody("RELIANCE", 2500.5, 2450) },
      { match: "chart/TCS", body: yahooBody("TCS", 4100, 4000) },
    ]);
    const res = await onRequestPost({
      request: post({ tickers: ["RELIANCE", "TCS"] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const body = (await res.json()) as { providerCounts: Record<string, number>; missing: string[] };
    expect(res.status).toBe(200);
    expect(body.providerCounts.yahoo).toBe(2);
  });

  it("fails closed with 502 when every provider is unreachable", async () => {
    stubUpstreamRoutes([
      { match: "query1.finance.yahoo.com", status: 500, body: {} },
    ]);
    const res = await onRequestPost({
      request: post({ tickers: ["RELIANCE"] }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code: string; quotes?: unknown };
    expect(body.code).toBe("provider_unavailable");
    expect(Object(body).quotes).toBeUndefined(); // never an empty success
  });

  it("reports outage symbols in `missing` with a note when other quotes succeeded", async () => {
    stubUpstreamRoutes([
      { match: "chart/RELIANCE", body: yahooBody("RELIANCE", 2500.5, 2450) },
      { match: "chart/TCS", status: 503, body: {} },
    ]);
    const res = await onRequestPost({
      request: post({ tickers: ["RELIANCE", "TCS"] }),
      env: makeEnv(),
      params: {},
    });
    const body = (await res.json()) as { missing: string[]; notes: string[] };
    expect(res.status).toBe(200);
    expect(body.missing).toEqual(["TCS"]);
    expect(body.notes.some((note) => note.includes("Provider unreachable"))).toBe(true);
  });

  it("serves the second request from the per-isolate cache and never re-derives a fresh label", async () => {
    const fetchMock = stubUpstreamRoutes([
      { match: "chart/RELIANCE", body: yahooBody("RELIANCE", 2500.5, 2450) },
    ]);
    const env = makeEnv();

    const first = await onRequestPost({ request: post({ tickers: ["RELIANCE"] }), env, params: {} });
    const firstBody = (await first.json()) as { providerCounts: Record<string, number>; quotes: Record<string, { cached: boolean }> };
    expect(firstBody.providerCounts.yahoo).toBe(1);
    expect(firstBody.quotes.RELIANCE.cached).toBe(false);

    const second = await onRequestPost({ request: post({ tickers: ["RELIANCE"] }), env, params: {} });
    const secondBody = (await second.json()) as { providerCounts: Record<string, number>; quotes: Record<string, { cached: boolean; cacheAgeMs: number }> };
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second upstream call
    expect(secondBody.providerCounts.cache).toBe(1);
    expect(secondBody.quotes.RELIANCE.cached).toBe(true);

    // refresh=1 must bypass the cache and hit the provider again.
    const refreshed = await onRequestPost({ request: post({ tickers: ["RELIANCE"], refresh: true }), env, params: {} });
    const refreshedBody = (await refreshed.json()) as { providerCounts: Record<string, number>; quotes: Record<string, { cached: boolean }> };
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshedBody.providerCounts.yahoo).toBe(1);
    expect(refreshedBody.quotes.RELIANCE.cached).toBe(false);
  });

  it("rejects oversized bodies with 413", async () => {
    stubUpstreamRoutes([]);
    const oversized = new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good-token" },
      body: JSON.stringify({ tickers: ["X".repeat(5000)] }),
    });
    const res = await onRequestPost({ request: oversized, env: makeEnv(), params: {} });
    expect(res.status).toBe(413);
  });

  it("rate-limits per user at 60/min", async () => {
    stubUpstreamRoutes([{ match: "chart/RELIANCE", body: yahooBody("RELIANCE", 2500.5, 2450) }]);
    const env = makeEnv();
    let last: Response | null = null;
    for (let i = 0; i < 70; i++) {
      last = await onRequestPost({ request: post({ tickers: ["RELIANCE"] }), env, params: {} });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
