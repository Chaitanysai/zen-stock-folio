// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequestGet, onRequestOptions } from "./candles";
import {
  API_ORIGIN,
  makeEnv,
  restoreIdentity,
  stubIdentity,
  stubUpstreamRoutes,
} from "./_lib/testHelpers";
import { resetMarketCache } from "./_lib/marketCache";

const BASE = `${API_ORIGIN}/api/candles`;
const URL = (query: string): string => `${BASE}?${query}`;

const seconds = () => Math.floor(Date.now() / 1000);
const BAR_T = [seconds() - 200, seconds() - 140, seconds() - 80];

const candleBody = {
  chart: {
    result: [
      {
        meta: {
          symbol: "RELIANCE.NS",
          currency: "INR",
          regularMarketPrice: 2500,
          chartPreviousClose: 2450,
          regularMarketTime: seconds(),
        },
        timestamp: BAR_T,
        indicators: {
          quote: [
            {
              open: [2440, 2450, 2460],
              high: [2455, 2465, 2470],
              low: [2435, 2448, 2455],
              close: [2450, 2460, 2465],
              volume: [100, 200, 300],
            },
          ],
        },
      },
    ],
  },
};

const emptyBody = {
  chart: { result: [{ meta: { symbol: "RELIANCE.NS", chartPreviousClose: 2450 } }] },
};

const get = (query: string, token = "good-token"): Request =>
  new Request(URL(query), { headers: { Authorization: `Bearer ${token}` } });

beforeEach(() => {
  stubIdentity("user-1");
  resetMarketCache();
});
afterEach(() => {
  restoreIdentity();
  resetMarketCache();
});

describe("GET /api/candles", () => {
  it("requires authentication (401 without a bearer token)", async () => {
    stubUpstreamRoutes([]);
    const res = await onRequestGet({
      request: new Request(URL("symbol=RELIANCE&range=1d")),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("refuses unverified identities (403)", async () => {
    stubIdentity("user-1", false);
    stubUpstreamRoutes([]);
    const res = await onRequestGet({ request: get("symbol=RELIANCE"), env: makeEnv(), params: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Email verification required");
  });

  it("validates symbol and range (400), never silently rewriting a range", async () => {
    stubUpstreamRoutes([]);
    const env = makeEnv();
    const run = (query: string) => onRequestGet({ request: get(query), env, params: {} });

    const badSymbol = await run("symbol=BAD%20NEWS!");
    expect(badSymbol.status).toBe(400);
    expect(((await badSymbol.json()) as { code: string }).code).toBe("invalid_symbol");

    const badRange = await run("symbol=RELIANCE&range=2d");
    expect(badRange.status).toBe(400);
    const rangeBody = (await badRange.json()) as { code: string; error: string };
    expect(rangeBody.code).toBe("invalid_range");
    expect(rangeBody.error).toContain("1d");
  });

  it("returns the CandlesEnvelope shape with OHLCV and provenance", async () => {
    stubUpstreamRoutes([{ match: "chart/RELIANCE.NS", body: candleBody }]);
    const res = await onRequestGet({
      request: get("symbol=RELIANCE&range=1mo"),
      env: makeEnv(),
      params: {},
    });
    const body = (await res.json()) as {
      symbol: string;
      resolution: string;
      range: string;
      dataMode: string;
      candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number | null }>;
      provider: string;
      cached: boolean;
      stale: boolean;
      unavailable: string[];
      warnings: string[];
      fetchedAt: string;
      exchangeTimestamp: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.symbol).toBe("RELIANCE");
    expect(body.range).toBe("1mo");
    expect(body.resolution).toBe("1d");
    expect(body.provider).toBe("yahoo");
    expect(body.cached).toBe(false);
    expect(body.candles).toHaveLength(3);
    expect(body.candles[0]).toEqual({ time: BAR_T[0], open: 2440, high: 2455, low: 2435, close: 2450, volume: 100 });
    // A daily series is always a settled close — forced `eod` in either phase.
    expect(body.dataMode).toBe("eod");
    expect(body.stale).toBe(false);
    expect(typeof body.fetchedAt).toBe("string");
  });

  it("accepts supported index symbols (^NSEI)", async () => {
    stubUpstreamRoutes([
      {
        match: "chart/%5ENSEI",
        body: {
          chart: {
            result: [
              {
                meta: { symbol: "^NSEI", regularMarketPrice: 24000, chartPreviousClose: 23800, regularMarketTime: seconds() - 120 },
                timestamp: [seconds() - 120, seconds() - 60],
                indicators: { quote: [{ open: [23810, 23900], high: [23900, 24010], low: [23800, 23890], close: [23900, 24000] }] },
              },
            ],
          },
        },
      },
    ]);
    const res = await onRequestGet({
      request: get(`symbol=${encodeURIComponent("^NSEI")}&range=1d`),
      env: makeEnv(),
      params: {},
    });
    const body = (await res.json()) as { symbol: string; candles: unknown[] };
    expect(res.status).toBe(200);
    expect(body.symbol).toBe("^NSEI");
    expect(body.candles).toHaveLength(2);
  });

  it("answers 404 symbol_not_found for unknown symbols", async () => {
    stubUpstreamRoutes([{ match: "chart/ZZZZZ.NS", status: 404, body: {} }]);
    const res = await onRequestGet({ request: get("symbol=ZZZZZ"), env: makeEnv(), params: {} });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("symbol_not_found");
    expect(body.error).toContain("ZZZZZ");
  });

  it("fails closed with 502 on a provider outage (never an empty success)", async () => {
    stubUpstreamRoutes([{ match: "chart/RELIANCE.NS", status: 500, body: {} }]);
    const res = await onRequestGet({ request: get("symbol=RELIANCE&range=1d"), env: makeEnv(), params: {} });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; candles?: unknown };
    expect(body.code).toBe("provider_unavailable");
    expect(body.candles).toBeUndefined();
  });

  it("returns an empty series as 200 with an explicit warning (valid, not an outage)", async () => {
    stubUpstreamRoutes([{ match: "chart/RELIANCE.NS", body: emptyBody }]);
    const res = await onRequestGet({ request: get("symbol=RELIANCE&range=1d"), env: makeEnv(), params: {} });
    const body = (await res.json()) as { candles: unknown[]; warnings: string[] };
    expect(res.status).toBe(200);
    expect(body.candles).toEqual([]);
    expect(body.warnings.some((w) => w.includes("no candles"))).toBe(true);
  });

  it("serves the second request from the per-isolate cache; refresh=1 bypasses it", async () => {
    const fetchMock = stubUpstreamRoutes([{ match: "chart/RELIANCE.NS", body: candleBody }]);
    const env = makeEnv();

    await onRequestGet({ request: get("symbol=RELIANCE&range=1mo"), env, params: {} });
    const second = await onRequestGet({ request: get("symbol=RELIANCE&range=1mo"), env, params: {} });
    const secondBody = (await second.json()) as { cached: boolean; cacheAgeMs: number };
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondBody.cached).toBe(true);

    const refreshed = await onRequestGet({
      request: get("symbol=RELIANCE&range=1mo&refresh=1"),
      env,
      params: {},
    });
    const refreshedBody = (await refreshed.json()) as { cached: boolean };
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshedBody.cached).toBe(false);
  });

  it("handles CORS preflight like the other endpoints", async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: "https://app.example" });
    const res = await onRequestOptions({
      request: new Request(BASE, { method: "OPTIONS", headers: { Origin: "https://app.example" } }),
      env,
      params: {},
    });
    expect(res.status).toBe(204);
  });

  it("rate-limits per user at 30/min", async () => {
    stubUpstreamRoutes([{ match: "chart/RELIANCE.NS", body: candleBody }]);
    const env = makeEnv();
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await onRequestGet({ request: get(`symbol=RELIANCE&range=1d&bust=${i}`), env, params: {} });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
