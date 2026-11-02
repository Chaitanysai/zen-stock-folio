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
 * Identity is covered too: prices are keyed by `market:ticker`, so the same
 * ticker held on NSE and on a U.S. listing cannot overwrite the other.
 *
 * Batch splitting is covered because a 41-symbol watchlist that quietly dropped
 * a symbol would look identical to a 40-symbol one.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "@/lib/market-data/client.ts";
import type { DataMode, Instrument, Quote, QuoteEnvelope } from "@/lib/market-data/types.ts";
import { instrumentKey } from "@/lib/market-data/symbols.ts";

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

const nse = (ticker: string) => ({ market: "NSE" as const, ticker });

function quote(symbol: string, price: number | null = 100): Quote {
  return {
    symbol,
    market: "NSE",
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

const keysOf = (batch: Instrument[]): string[] => batch.map(instrumentKey);

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
        "NSE:A": envelope("A", { dataMode: "realtime" }),
        "NSE:B": envelope("B", { dataMode: "eod" }),
      }),
    );

    const { result } = renderHook(() => useLivePrices([nse("A"), nse("B")]));

    await waitFor(() => expect(result.current.dataMode).toBe("eod"));
    expect(result.current.prices["NSE:A"]?.price).toBe(100);
  });

  it("ignores a symbol whose quote is null when ranking freshness", async () => {
    fetchQuotes.mockResolvedValue(
      reply({
        "NSE:A": envelope("A", { dataMode: "realtime" }),
        "NSE:B": envelope("B", { quote: null, dataMode: "unknown" }),
      }),
    );

    const { result } = renderHook(() => useLivePrices([nse("A"), nse("B")]));

    await waitFor(() => expect(result.current.dataMode).toBe("realtime"));
    // A missing quote must not appear as a zero price.
    expect(result.current.prices["NSE:B"]).toBeUndefined();
  });

  it("surfaces the provider note when no symbol has a quote", async () => {
    fetchQuotes.mockResolvedValue(
      reply({ "NSE:A": envelope("A", { quote: null }) }, ["No NSE listing for A."]),
    );

    const { result } = renderHook(() => useLivePrices([nse("A")]));

    await waitFor(() => expect(result.current.error).toBe("No NSE listing for A."));
    expect(result.current.sourceLabel).toBe("");
  });

  it("splits more than 40 symbols into batches without dropping any", async () => {
    const instruments = Array.from({ length: 41 }, (_, index) => nse(`S${index}`));
    fetchQuotes.mockImplementation(async (batch: Instrument[]) =>
      reply(Object.fromEntries(batch.map((instrument) => [
        instrumentKey(instrument),
        envelope(instrument.ticker),
      ]))),
    );

    renderHook(() => useLivePrices(instruments));

    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(2));
    const sent = fetchQuotes.mock.calls.flatMap(([batch]) => batch as Instrument[]);
    expect(sent).toHaveLength(41);
    expect(new Set(keysOf(sent)).size).toBe(41);
  });

  it("deduplicates instruments and does not refetch when array identity changes", async () => {
    fetchQuotes.mockResolvedValue(reply({ "NSE:A": envelope("A") }));

    const { rerender } = renderHook(({ instruments }) => useLivePrices(instruments), {
      initialProps: { instruments: [nse("B"), nse("A"), nse("A")] },
    });

    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
    const sent = fetchQuotes.mock.calls[0][0] as Instrument[];
    expect(keysOf(sent).sort()).toEqual(["NSE:A", "NSE:B"]);
    expect(sent).toHaveLength(2);

    rerender({ instruments: [nse("A"), nse("B"), nse("B")] });
    await waitFor(() => expect(fetchQuotes).toHaveBeenCalledTimes(1));
  });

  it("keeps NSE and U.S. rows with the same ticker apart", async () => {
    fetchQuotes.mockResolvedValue(
      reply({
        "NSE:INFY": envelope("INFY"),
        "US:INFY": envelope("INFY", { quote: { ...quote("INFY", 20), market: "US", currency: "USD" } }),
      }),
    );

    const { result } = renderHook(() =>
      useLivePrices([nse("INFY"), { market: "US", ticker: "INFY" }]),
    );

    await waitFor(() => expect(result.current.prices["US:INFY"]?.price).toBe(20));
    expect(result.current.prices["NSE:INFY"]?.price).toBe(100);
  });

  it("does not request when there are no instruments", async () => {
    const { result } = renderHook(() => useLivePrices([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchQuotes).not.toHaveBeenCalled();
  });
});
