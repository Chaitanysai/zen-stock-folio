import { useState, useEffect, useCallback, useRef } from "react";
import { getApiUnavailableMessage, getApiUrl } from "@/lib/api";
import { getMarketStatus, getPriceRefreshIntervalMs } from "@/lib/market/marketStatus";
import { useMarketStatus } from "@/hooks/useMarketStatus";

export interface StockPrice {
  price: number;
  weekHigh52: number;
  weekLow52?: number;
  changePercent: number;
  change: number;
}

export type PriceSource =
  | "upstox-live"
  | "yahoo-v8-eod"
  | "yahoo-v7-eod"
  | "stooq-eod"
  | "memory-cache"
  | null;

export interface UseLivePricesResult {
  prices: Record<string, StockPrice>;
  loading: boolean;
  lastUpdated: string | null;
  error: string | null;
  source: PriceSource;
  marketOpen: boolean;
  sourceLabel: string;
  refresh: () => void;
}

function getSourceLabel(source: PriceSource, marketOpen: boolean): string {
  switch (source) {
    case "upstox-live": return "Live";
    case "yahoo-v8-eod":
    case "yahoo-v7-eod": return marketOpen ? "~15 min delayed" : "EOD";
    case "stooq-eod": return "EOD";
    case "memory-cache": return "Cached";
    default: return "";
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      lastErr = e;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

export function useLivePrices(tickers: string[]): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PriceSource>(null);
  // Exchange status comes from the shared clock/calendar service only — never
  // from the price API response (a 200 after 15:30 must not read as "live").
  const market = useMarketStatus();
  const marketOpen = market.isOpen;

  const tickerKey = tickers.slice().sort().join(",");
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) return;

    // 🔥 Prevent too frequent calls
    const now = Date.now();
    if (now - lastFetchRef.current < 800) return;
    lastFetchRef.current = now;

    const unique = [...new Set(tickers)];
    setLoading(true);

    try {
      const res = await fetchWithRetry(getApiUrl("/api/prices"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: unique }),
      });

      const data = await res.json();

      if (!res.ok) {
        const hint = data?.hint ? ` — ${data.hint}` : "";
        setError((data?.error ?? `HTTP ${res.status}`) + hint);
        return;
      }

      if (data?.prices && Object.keys(data.prices).length > 0) {
        setPrices(prev => ({ ...prev, ...data.prices })); // ✅ merge (no flicker)
        setLastUpdated(data.fetchedAt ?? new Date().toISOString());
        setSource((data.source as PriceSource) ?? null);
        setError(null);
      } else {
        setError("No price data returned");
      }

    } catch (err: any) {
      console.error("Fetch prices error:", err);
      setError(getApiUnavailableMessage("Live prices"));
    } finally {
      setLoading(false);
    }
  }, [tickerKey]);

  useEffect(() => {
    let cancelled = false;
    fetchPrices();

    const schedule = () => {
      if (cancelled) return;
      // Re-read status every cycle so the cadence follows the real session
      // without needing this effect (or the page) to be re-run.
      const delay = getPriceRefreshIntervalMs(getMarketStatus());

      intervalRef.current = setTimeout(() => {
        if (cancelled) return;
        fetchPrices().then(() => schedule());
      }, delay);
    };

    schedule();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearTimeout(intervalRef.current);
      intervalRef.current = null;
    };
  }, [fetchPrices]);

  const sourceLabel = getSourceLabel(source, marketOpen);

  return {
    prices,
    loading,
    lastUpdated,
    error,
    source,
    marketOpen,
    sourceLabel,
    refresh: fetchPrices
  };
}