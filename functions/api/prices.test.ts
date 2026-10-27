// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./prices";
import { authedRequest, kvBinding, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "./_lib/testHelpers";

const URL = "https://zenfolio.pages.dev/api/prices";

const upstoxBody = {
  data: {
    "NSE_EQ:RELIANCE": { last_price: 2500, prev_close: 2450, week_52_high: 2600, week_52_low: 2000 },
    "NSE_EQ:TCS": { last_price: 4100, prev_close: 4000, week_52_high: 4300, week_52_low: 3500 },
  },
};

const yahooBody = (price: number, prevClose: number) => ({
  chart: { result: [{ meta: { regularMarketPrice: price, previousClose: prevClose, fiftyTwoWeekHigh: 2600, fiftyTwoWeekLow: 2000 } }] },
});

/** Routes stubbed upstreams by provider URL. */
const stubUpstreams = (routes: Array<{ match: string; status?: number; body: unknown }>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const route of routes) {
      if (url.includes(route.match)) {
        return upstreamJson(route.body, route.status ?? 200);
      }
    }
    return upstreamJson({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

describe("POST /api/prices", () => {
  it("requires authentication", async () => {
    const res = await onRequestPost({
      request: new Request(URL, { method: "POST", body: JSON.stringify({ tickers: ["RELIANCE"] }) }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("serves Upstox first with freshness metadata and no secret leakage", async () => {
    const fetchMock = stubUpstreams([{ match: "api.upstox.com", body: upstoxBody }]);

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["RELIANCE", "TCS"] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const body = (await res.json()) as { prices: Record<string, { price: number; asOf: string }>; source: string; stale: boolean };

    expect(res.status).toBe(200);
    expect(body.source).toBe("upstox-live");
    expect(body.stale).toBe(false);
    expect(body.prices.RELIANCE.price).toBe(2500);
    expect(body.prices.RELIANCE.asOf).toBeTruthy();
    // Secret leakage check: neither the Upstox token nor the Firebase key appears.
    const text = JSON.stringify(body);
    expect(text).not.toContain("upstox-secret-token");
    expect(text).not.toContain("test-api-key");
    // And the Authorization header never reaches the response.
    expect(res.headers.get("Authorization")).toBeNull();
    void fetchMock;
  });

  it("falls back to Yahoo when Upstox fails", async () => {
    stubUpstreams([
      { match: "api.upstox.com", status: 401, body: {} },
      { match: "query1.finance.yahoo.com/v8/finance/chart/RELIANCE", body: yahooBody(2505, 2450) },
      { match: "query1.finance.yahoo.com/v8/finance/chart/TCS", body: yahooBody(4100, 4000) },
    ]);

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["RELIANCE", "TCS"] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const body = (await res.json()) as { source: string; prices: Record<string, { price: number }> };
    expect(body.source).toBe("yahoo-chart");
    expect(body.prices.RELIANCE.price).toBe(2505);
  });

  it("back-fills from the EOD cache as stale when live sources fail", async () => {
    stubUpstreams([
      { match: "api.upstox.com", status: 401, body: {} },
      { match: "query1.finance.yahoo.com", status: 503, body: {} },
    ]);
    const cachedAt = "2026-10-25T10:00:00Z";
    const binding = kvBinding({
      "eod:RELIANCE": { price: 2490, weekHigh52: 2600, weekLow52: 2000, changePercent: 1.6, change: 40, asOf: cachedAt, source: "upstox-live" },
    });

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["RELIANCE", "UNKNOWN"] }),
      env: makeEnv({ PRICE_CACHE: binding as unknown as KVNamespace }),
      params: {},
    });
    const body = (await res.json()) as {
      source: string;
      stale: boolean;
      prices: Record<string, { price: number; asOf: string }>;
    };

    expect(body.source).toBe("kv-cache");
    expect(body.stale).toBe(true);
    expect(body.prices.RELIANCE.price).toBe(2490);
    expect(body.prices.RELIANCE.asOf).toBe(cachedAt); // original fetch time preserved
    expect(body.prices.UNKNOWN).toBeUndefined();
  });

  it("returns 503 with no fabricated data when every source fails", async () => {
    stubUpstreams([
      { match: "api.upstox.com", status: 401, body: {} },
      { match: "query1.finance.yahoo.com", status: 500, body: {} },
    ]);
    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["RELIANCE"] }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; prices?: unknown };
    expect(body.error).toBeTruthy();
    expect(body.prices).toBeUndefined(); // no fabricated data of any kind
  });

  it("validates schema and body size", async () => {
    stubUpstreams([]);
    const badTickers = await onRequestPost({
      request: authedRequest(URL, { tickers: ["BAD TICKER!"] }),
      env: makeEnv(),
      params: {},
    });
    expect(badTickers.status).toBe(400);

    const tooMany = await onRequestPost({
      request: authedRequest(URL, { tickers: Array.from({ length: 41 }, (_, i) => `T${i}`) }),
      env: makeEnv(),
      params: {},
    });
    expect(tooMany.status).toBe(400);

    const oversized = new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good-token" },
      body: JSON.stringify({ tickers: ["X".repeat(5000)] }),
    });
    const tooBig = await onRequestPost({ request: oversized, env: makeEnv(), params: {} });
    expect(tooBig.status).toBe(413);
  });

  it("rate-limits per user at 120/min (the 1 s poll budget)", async () => {
    stubUpstreams([{ match: "api.upstox.com", body: upstoxBody }]);
    const env = makeEnv({ UPSTOX_ACCESS_TOKEN: "t" });
    let last: Response | null = null;
    for (let i = 0; i < 125; i++) {
      last = await onRequestPost({
        request: authedRequest(URL, { tickers: ["RELIANCE"] }),
        env,
        params: {},
      });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
