/**
 * Browser client contract: how an API reply becomes either a typed payload or a
 * `MarketDataApiError` a component can branch on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarketDataApiError,
  fetchCandles,
  fetchHealth,
  fetchQuotes,
  fetchMarketOverview,
  searchSymbols,
} from "@/lib/market-data/client.ts";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("success paths", () => {
  it("POSTs the ticker list rather than putting it in the URL", async () => {
    const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ quotes: {}, fetchedAt: "x", providerCounts: {}, missing: [], notes: [] }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchQuotes(["RELIANCE", "TCS"]);

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("/api/quotes");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ tickers: ["RELIANCE", "TCS"], refresh: false });
  });

  it("sends cache: no-store so a browser never replays a quote", async () => {
    const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ indices: [], provider: "yahoo", dataMode: "eod", fetchedAt: "x", cached: false, stale: false, warnings: [] }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchMarketOverview();

    expect(spy.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("parameterizes the candle request", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => jsonResponse({ symbol: "RELIANCE", resolution: "5m", range: "1d", candles: [], provider: "yahoo", dataMode: "eod", fetchedAt: "x", exchangeTimestamp: null, cached: false, cacheAgeMs: 0, stale: true, unavailable: [], warnings: [] }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchCandles("RELIANCE", "1d");

    expect(String(spy.mock.calls[0][0])).toContain("symbol=RELIANCE");
    expect(String(spy.mock.calls[0][0])).toContain("range=1d");
  });

  it("never fires a deep health probe unless asked", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => jsonResponse({ generatedAt: "x", integrations: [], summary: "unconfigured" }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchHealth();
    expect(String(spy.mock.calls[0][0])).toBe("/api/health");

    await fetchHealth({ deep: true });
    expect(String(spy.mock.calls[1][0])).toBe("/api/health?deep=1");
  });

  it("encodes a search query safely", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => jsonResponse({ query: "M&M", hits: [], provider: "mixed", fetchedAt: "x", notes: [] }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await searchSymbols("M&M");

    expect(String(spy.mock.calls[0][0])).toContain("q=M%26M");
  });
});

describe("failure paths", () => {
  it("maps a server error body to the server's code", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "No chart data for X", code: "symbol_not_found" }, 404)) as unknown as typeof fetch;

    const error = await fetchCandles("X", "1d").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MarketDataApiError);
    expect(error).toMatchObject({ status: 404, code: "symbol_not_found" });
  });

  it("reports a network failure with status 0 rather than a fake success", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;

    const error = await fetchQuotes(["RELIANCE"]).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it("reports malformed JSON instead of returning a half-parsed payload", async () => {
    globalThis.fetch = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;

    const error = await fetchHealth().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "invalid_response" });
  });

  it("keeps a non-JSON error body from losing the status code", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch;

    const error = await fetchMarketOverview().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 502, code: "request_failed" });
  });

  it("surfaces an abort as an abort, not as a market-data error", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;

    await expect(searchSymbols("rel")).rejects.toMatchObject({ name: "AbortError" });
  });
});
