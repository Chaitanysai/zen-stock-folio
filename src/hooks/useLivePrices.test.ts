/**
 * `useLivePrices` is what every price surface reads, so its two honesty rules
 * are tested directly rather than through a table:
 *
 *  - `dataMode` reports the weakest mode among the symbols that actually
 *    returned a quote, so one EOD symbol cannot make a realtime page look live;
 *  - a symbol with no usable price is absent from `prices` instead of appearing
 *    as `0`, and an all-empty reply is reported as an error with the provider's
 *    note, not as silence.
 *
 * Batch splitting is covered because a 41-symbol watchlist that quietly dropped
 * a symbol would look identical to a 40-symbol one.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "@/lib/market-data/client.ts";
import type { DataMode, Quote, QuoteEnvelope } from "@/lib/market-data/types.ts";

const fetchQuotes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/market-data/client.ts", async () => {
  const actual = await vi.importActual<typeof ClientModule>("@/lib/market-data/client.ts");
  return { ...actual, fetchQuotes };
});

// The poller would otherwise keep the test process alive.
vi.mock("@/hooks/useMarketStatus", () => ({
  useMarketStatus: () => ({ isOpen: false, status: "closed" }),
}));

import { useLivePrices } from "./useLivePrices";

function quote(symbol: string, price: number | null = 100): Quote {
  return {
    symbol,
    price,
    change: 1,
    changePercent: 1,
    previousClose: 99,
    dayHigh: 101,
    dayLow: 98,
    weekHigh52: 120,
    weekLow52: 80,
    volume: 1000,
    currency: "INR",
    exchange: "NSE",
    name: null,
  };
}

function envelope(
  symbol: string,
  overrides: { dataMode?: DataMode; quote?: Quote | null } = {},
): QuoteEnvelope {
  return {
    quote: overrides.quote === undefined ? quote(symbol) : overrides.quote,
    provider: "yahoo",
    dataMode: overrides.dataMode ?? "realtime",
    exchangeTimestamp: "2026-10-27T09:00:00.000Z",
    fetchedAt: "2026-10-27T09:00:01.000Z",
    cached: false,
    cacheAgeMs: 0,
    stale: false,
    unavailable: [],
    warnings: [],
  };
}

function reply(quotes: Record<string, QuoteEnvelope>, notes: string[] = []) {
  return { quotes, fetchedAt: "2026-10-27T09:00:01.000Z", providerCounts: {}, missing: [], notes };
}

describe("useLivePrices", () => {
  beforeEach(() => {
    fetchQuotes.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the weakest mode across the symbols that returned a quote", async () => {
    fetchQuotes.mockResolvedValue(
      reply({
        A: envelope("A", { dataMode: "realtime" }),
        B: envelope("B", { dataMode: "eod" }),
      }),
    );

    const { result } = renderHook(() => useLivePrices(["A", "B"]));

    await waitFor(() => expect(result.current.dataMode).toBe("eod"));
    expect(result.current.prices.A?.price).toBe(100);
  });

  it("ignores a symbol whose quote is null when ranking freshness", async () => {
    fetchQuotes.mockResolvedValue(
      reply({
        A: envelope("A", { dataMode: "realtime" }),
        B: envelope("B", { quote: null, dataMode: "unknown" }),
      }),
    );

    const { result } = renderHook(() => useLivePrices(["A", "B"]));

    await waitFor(() => expect(result.current.dataMode).toBe("realtime"));
    // A missing quote must not appear as a zero price.
    expect(result.current.prices.B).toBeUndefined();
  });

  it("surfaces the provider note when no symbol has a quote", async () => {
    fetchQuotes.mockResolvedValue(
      reply({ A: envelope("A", { quote: null }) }, ["No NSE listing for A."]),
    );

    const { result } = renderHook(() => useLivePrices(["A"]));

    await waitFor(() => expect(result.current.error).toBe("No NSE listing for A."));
    expect(result.current.sourceLabel).toBe("");
  });

  it("splits more than 40 symbols into batches without dropping any", async () => {
    const symbols = Array.from({ length: 41 }, (_, index) => `S${index}`);
    fetchQuotes.mockImplementation(async (batch: string[]) =>
      reply(Object.fromEntries(batch.map((symbol) => [symbol, envelope(symbol)]))),
    );

    renderHook(() => useLivePrices(symbols));

    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(2));
    const sent = fetchQuotes.mock.calls.flatMap(([batch]) => batch as string[]);
    expect(sent).toHaveLength(41);
    expect(new Set(sent).size).toBe(41);
  });

  it("deduplicates and sorts the symbol list so array identity cannot refetch", async () => {
    fetchQuotes.mockResolvedValue(reply({ A: envelope("A") }));

    const { rerender } = renderHook(({ symbols }) => useLivePrices(symbols), {
      initialProps: { symbols: ["B", "A", "A"] },
    });

    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
    expect(fetchQuotes.mock.calls[0][0]).toEqual(["A", "B"]);

    rerender({ symbols: ["A", "B", "B"] });
    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
  });

  it("does not request when there are no symbols", async () => {
    const { result } = renderHook(() => useLivePrices([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchQuotes).not.toHaveBeenCalled();
  });
});
