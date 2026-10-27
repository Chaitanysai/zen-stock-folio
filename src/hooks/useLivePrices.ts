/**
 * Live NSE prices for the dashboard, portfolio table and charts.
 *
 * Backed by `POST /api/quotes`, which returns a `QuoteEnvelope` per symbol
 * carrying provider, data mode and the provider's own exchange timestamp. The
 * previous implementation called `/api/prices`, since deleted, which returned
 * bare numbers with a `source` string and no timestamp — so the UI could only
 * guess whether a value was live, delayed, or yesterday's close.
 *
 * Rules preserved from the previous version:
 *  - Poll cadence comes from the shared market-status service, never from a
 *    successful API response.
 *  - New values are merged, not replaced, so one missing symbol does not blank
 *    the table.
 *
 * Changed deliberately:
 *  - A successful response with `dataMode: "unknown"` is reported as
 *    unverified instead of being labelled "Live".
 *  - Polling is floored at `MIN_POLL_MS`: NSE quotes from the primary provider
 *    are ~15 min delayed, so a 1 s poll only multiplies upstream load.
 *  - `dataMode` is the weakest mode across the symbols actually returned.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarketStatus, getPriceRefreshIntervalMs } from "@/lib/market/marketStatus";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { fetchQuotes, MarketDataApiError } from "@/lib/market-data/client.ts";
import { dataModeLabel } from "@/lib/market-data/freshness.ts";
import type { DataMode, QuoteEnvelope } from "@/lib/market-data/types.ts";

/** Server-side cap per request (`MAX_QUOTES_PER_REQUEST`). */
const MAX_PER_REQUEST = 40;
/** Floor on polling interval regardless of session phase. */
const MIN_POLL_MS = 15_000;

export interface StockPrice {
  price: number;
  /** `null` when the provider did not send it — never backfilled from stored data. */
  weekHigh52: number | null;
  weekLow52: number | null;
  changePercent: number | null;
  change: number | null;
}

export interface UseLivePricesResult {
  /** Legacy view of the data, for components that predate provenance. */
  prices: Record<string, StockPrice>;
  /** Full provider answers, including freshness. Keyed by canonical symbol. */
  envelopes: Record<string, QuoteEnvelope>;
  /** Weakest data mode among the symbols that returned a quote. */
  dataMode: DataMode;
  /** Short label for `dataMode`, e.g. "Delayed". Empty before the first reply. */
  sourceLabel: string;
  loading: boolean;
  lastUpdated: string | null;
  error: string | null;
  marketOpen: boolean;
  refresh: () => void;
}

const MODE_RANK: Record<DataMode, number> = { realtime: 0, delayed: 1, eod: 2, unknown: 3 };

function weakestMode(envelopes: Record<string, QuoteEnvelope>): DataMode {
  let weakest: DataMode = "unknown";
  let seen = false;
  for (const envelope of Object.values(envelopes)) {
    if (envelope.quote === null) continue;
    if (!seen || MODE_RANK[envelope.dataMode] > MODE_RANK[weakest]) weakest = envelope.dataMode;
    seen = true;
  }
  return seen ? weakest : "unknown";
}

/** Flatten an envelope into the legacy shape, or null when unusable. */
function toStockPrice(envelope: QuoteEnvelope): StockPrice | null {
  const quote = envelope.quote;
  if (!quote || quote.price === null) return null;
  return {
    price: quote.price,
    weekHigh52: quote.weekHigh52,
    weekLow52: quote.weekLow52,
    changePercent: quote.changePercent,
    change: quote.change,
  };
}

/** Split the ticker list into server-sized batches without dropping any. */
function toBatches(tickers: string[]): string[][] {
  if (tickers.length <= MAX_PER_REQUEST) return [tickers];
  const batches: string[][] = [];
  for (let index = 0; index < tickers.length; index += MAX_PER_REQUEST) {
    batches.push(tickers.slice(index, index + MAX_PER_REQUEST));
  }
  return batches;
}

export function useLivePrices(tickers: string[]): UseLivePricesResult {
  const [envelopes, setEnvelopes] = useState<Record<string, QuoteEnvelope>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const market = useMarketStatus();
  const marketOpen = market.isOpen;

  // The symbol set is derived from a content key rather than from the `tickers`
  // array identity: callers pass a fresh array each render, and depending on it
  // directly would resubscribe the poller (and refetch) on every render.
  const tickerKey = useMemo(
    () => [...new Set(tickers.filter(Boolean))].sort().join(","),
    [tickers],
  );
  const symbols = useMemo(() => (tickerKey ? tickerKey.split(",") : []), [tickerKey]);

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchPrices = useCallback(async () => {
    if (symbols.length === 0) return;

    // Collapse duplicate triggers from several mounted consumers.
    const now = Date.now();
    if (now - lastFetchRef.current < 800) return;
    lastFetchRef.current = now;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setLoading(true);

    try {
      const merged: Record<string, QuoteEnvelope> = {};
      const notes: string[] = [];
      let fetchedAt: string | null = null;

      for (const batch of toBatches(symbols)) {
        const response = await fetchQuotes(batch, { signal: controller.signal });
        Object.assign(merged, response.quotes);
        notes.push(...response.notes);
        fetchedAt = response.fetchedAt;
      }

      setEnvelopes((previous) => ({ ...previous, ...merged }));
      if (fetchedAt) setLastUpdated(fetchedAt);

      const withQuote = Object.values(merged).some((envelope) => envelope.quote !== null);
      setError(withQuote ? null : notes[0] ?? "No price data returned for these symbols.");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof MarketDataApiError
          ? caught.message
          : "Live prices are temporarily unavailable. Please try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await fetchPrices();
    };

    void run();

    const schedule = () => {
      if (cancelled) return;
      const delay = Math.max(MIN_POLL_MS, getPriceRefreshIntervalMs(getMarketStatus()));
      intervalRef.current = setTimeout(() => {
        if (cancelled) return;
        void fetchPrices().then(schedule);
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [fetchPrices]);

  const prices = useMemo(() => {
    const flat: Record<string, StockPrice> = {};
    for (const [symbol, envelope] of Object.entries(envelopes)) {
      const price = toStockPrice(envelope);
      if (price) flat[symbol] = price;
    }
    return flat;
  }, [envelopes]);

  const dataMode = useMemo(() => weakestMode(envelopes), [envelopes]);

  return {
    prices,
    envelopes,
    dataMode,
    sourceLabel: Object.keys(prices).length > 0 ? dataModeLabel(dataMode) : "",
    loading,
    lastUpdated,
    error,
    marketOpen,
    refresh: fetchPrices,
  };
}
