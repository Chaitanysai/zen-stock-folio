/**
 * Client-normalization integration test.
 *
 * Drives the REAL `fetchQuotes` function against a mocked `fetch` returning the
 * captured live `/api/quotes` body. This is the boundary the task calls out:
 * "do not infer that a field survives normalization merely because the server
 * emits it". The assertion is on the parsed result, not on the server code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQuotes } from "./client";

/** Captured from the running local handler (provider yahoo, market closed). */
const liveBody = {
  quotes: {
    RELIANCE: {
      provider: "yahoo",
      dataMode: "eod",
      fetchedAt: "2026-10-27T10:44:08.875Z",
      exchangeTimestamp: "2026-10-27T09:58:13.000Z",
      cached: false,
      cacheAgeMs: 0,
      stale: false,
      unavailable: [],
      warnings: [],
      quote: {
        symbol: "RELIANCE",
        price: 1196.2,
        change: -5.6,
        changePercent: -0.466,
        previousClose: 1201.8,
        dayHigh: 1202.6,
        dayLow: 1184,
        weekHigh52: 1611.8,
        weekLow52: 1152.2,
        volume: 13064086,
        currency: "INR",
        exchange: "NSE",
        name: "Reliance Industries Limited",
      },
    },
  },
  fetchedAt: "2026-10-27T10:44:08.875Z",
  providerCounts: { yahoo: 1 },
  missing: [],
  notes: [],
};

afterEach(() => vi.restoreAllMocks());

describe("fetchQuotes normalization", () => {
  it("preserves every provenance field the alert evaluator needs", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(liveBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await fetchQuotes(["RELIANCE"]);
    const env = result.quotes.RELIANCE;

    expect(env.provider).toBe("yahoo");
    expect(env.dataMode).toBe("eod");
    expect(env.exchangeTimestamp).toBe("2026-10-27T09:58:13.000Z");
    expect(env.cached).toBe(false);
    expect(env.stale).toBe(false);
    expect(env.quote?.price).toBe(1196.2);

    // The client must have asked the real route with the expected shape.
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/quotes");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ tickers: ["RELIANCE"], refresh: false });
    // Freshness-sensitive: the request must not reuse a browser-cached body.
    expect((init as RequestInit)?.cache).toBe("no-store");
  });

  it("surfaces a server error as a typed MarketDataApiError, not a fake quote", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "No valid NSE symbols in request", code: "invalid_tickers" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchQuotes(["!!!"])).rejects.toMatchObject({
      status: 400,
      code: "invalid_tickers",
    });
  });
});
