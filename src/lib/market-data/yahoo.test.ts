/**
 * Yahoo adapter — parsing rules only. No network: `globalThis.fetch` is stubbed
 * with recorded payload shapes, so every assertion is about how we interpret a
 * provider reply, not about what Yahoo currently returns.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchYahooCandles, fetchYahooQuote, ProviderHttpError } from "@/lib/market-data/yahoo.ts";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chartPayload(overrides: {
  meta?: Record<string, unknown>;
  timestamp?: number[];
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
} = {}) {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol: "RELIANCE.NS",
            currency: "INR",
            exchangeName: "NSI",
            instrumentType: "EQUITY",
            regularMarketTime: 1_793_008_688,
            regularMarketPrice: 1201.8,
            chartPreviousClose: 1190,
            fiftyTwoWeekHigh: 1608.95,
            fiftyTwoWeekLow: 1110.2,
            regularMarketDayHigh: 1210,
            regularMarketDayLow: 1185,
            regularMarketVolume: 8_500_000,
            longName: "Reliance Industries Limited",
            ...overrides.meta,
          },
          timestamp: overrides.timestamp ?? [1_793_008_500],
          indicators: {
            quote: [
              {
                open: overrides.open ?? [1195],
                high: overrides.high ?? [1210],
                low: overrides.low ?? [1185],
                close: overrides.close ?? [1201.8],
                volume: overrides.volume ?? [8_500_000],
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchYahooQuote", () => {
  it("maps the provider meta into the canonical quote", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload())) as unknown as typeof fetch;

    const result = await fetchYahooQuote("RELIANCE");

    expect(result.quote.symbol).toBe("RELIANCE");
    expect(result.quote.price).toBe(1201.8);
    expect(result.quote.previousClose).toBe(1190);
    expect(result.quote.weekHigh52).toBe(1608.95);
    expect(result.quote.weekLow52).toBe(1110.2);
    expect(result.quote.currency).toBe("INR");
    expect(result.quote.name).toBe("Reliance Industries Limited");
    // Freshness must come from the provider's own clock, not ours.
    expect(result.exchangeTimestampMs).toBe(1_793_008_688_000);
  });

  it("reports a missing optional field as null instead of substituting a value", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({
      meta: { fiftyTwoWeekHigh: undefined, fiftyTwoWeekLow: undefined, longName: undefined },
    }))) as unknown as typeof fetch;

    const result = await fetchYahooQuote("RELIANCE");

    expect(result.quote.weekHigh52).toBeNull();
    expect(result.quote.weekLow52).toBeNull();
    expect(result.quote.name).toBeNull();
    expect(result.quote.price).toBe(1201.8);
  });

  it("treats non-positive and non-finite numbers as unavailable", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({
      meta: { regularMarketPrice: 0, fiftyTwoWeekHigh: Number.NaN, regularMarketVolume: -5 },
    }))) as unknown as typeof fetch;

    const result = await fetchYahooQuote("RELIANCE");

    expect(result.quote.price).toBeNull();
    expect(result.quote.weekHigh52).toBeNull();
    expect(result.quote.volume).toBeNull();
    expect(result.unavailable).toEqual(
      expect.arrayContaining(["price", "weekHigh52", "volume"]),
    );
  });

  it("surfaces a 429 as a typed provider error rather than an empty quote", async () => {
    globalThis.fetch = vi.fn(async () => new Response("too many requests", { status: 429 })) as unknown as typeof fetch;

    await expect(fetchYahooQuote("RELIANCE")).rejects.toBeInstanceOf(ProviderHttpError);
    await expect(fetchYahooQuote("RELIANCE")).rejects.toMatchObject({ status: 429 });
  });

  it("surfaces a provider-side error object even on HTTP 200", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      chart: { result: null, error: { code: "Not Found", description: "No data found" } },
    })) as unknown as typeof fetch;

    await expect(fetchYahooQuote("NOSUCHTICKERZZ")).rejects.toThrow(/Not Found/);
  });

  it("surfaces a malformed body instead of reporting a null price", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ chart: { result: null } })) as unknown as typeof fetch;

    await expect(fetchYahooQuote("RELIANCE")).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("propagates an aborted request as an abort, not as a quote", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;

    await expect(fetchYahooQuote("RELIANCE")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("fetchYahooCandles", () => {
  it("converts provider epoch seconds to epoch seconds and keeps volume", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({
      timestamp: [1_793_008_500, 1_793_008_800],
      open: [1195, 1198],
      high: [1210, 1211],
      low: [1185, 1190],
      close: [1201.8, 1205],
      volume: [8_500_000, 1_200],
    }))) as unknown as typeof fetch;

    const result = await fetchYahooCandles("RELIANCE", "1d");

    expect(result.candles).toHaveLength(2);
    expect(result.candles[0]).toEqual({
      time: 1_793_008_500,
      open: 1195,
      high: 1210,
      low: 1185,
      close: 1201.8,
      volume: 8_500_000,
    });
    expect(result.warnings).toEqual([]);
    expect(result.unavailable).toEqual([]);
  });

  it("drops only the malformed rows and warns about them", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({
      timestamp: [1_793_008_500, 1_793_008_800, 1_793_009_100],
      open: [1195, null, 1200],
      high: [1210, 1211, 1212],
      low: [1185, 1190, null],
      close: [1201.8, 1205, 1207],
      volume: [8_500_000, 1_200, 900],
    }))) as unknown as typeof fetch;

    const result = await fetchYahooCandles("RELIANCE", "1d");

    expect(result.candles).toHaveLength(1);
    expect(result.candles[0].time).toBe(1_793_008_500);
    expect(result.warnings.join(" ")).toMatch(/2/);
  });

  it("marks volume unavailable when the volume series is the wrong length", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({
      timestamp: [1_793_008_500, 1_793_008_800],
      open: [1195, 1198],
      high: [1210, 1211],
      low: [1185, 1190],
      close: [1201.8, 1205],
      volume: [8_500_000],
    }))) as unknown as typeof fetch;

    const result = await fetchYahooCandles("RELIANCE", "5d");

    expect(result.unavailable).toContain("volume");
    expect(result.candles).toHaveLength(2);
    // A missing volume is unknown, never zero.
    expect(result.candles.every((candle) => candle.volume === null)).toBe(true);
  });

  it("returns an empty series with a warning when the provider sends no timestamps", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(chartPayload({ timestamp: [] }))) as unknown as typeof fetch;

    const result = await fetchYahooCandles("RELIANCE", "1mo");

    expect(result.candles).toEqual([]);
    expect(result.exchangeTimestampMs).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("requests the interval prescribed for the range", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => jsonResponse(chartPayload()));
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchYahooCandles("RELIANCE", "1y");

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("interval=1d");
    expect(url).toContain("range=1y");
  });
});
