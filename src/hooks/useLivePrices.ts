import { useState, useEffect, useCallback, useRef } from "react";
import { getApiUnavailableMessage, getApiUrl } from "@/lib/api";

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

function isMarketOpen(): boolean {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930;
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
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());

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
        setMarketOpen(data.marketOpen ?? isMarketOpen());
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
    fetchPrices();

    const schedule = () => {
      const open = isMarketOpen();
      const day = new Date().getDay();
      const isWeekend = day === 0 || day === 6;

      // 🚀 REAL-TIME UPGRADE
      const delay = isWeekend
        ? 10 * 60_000        // 10 min weekend
        : open
        ? 1000              // 🔥 1 sec (REAL-TIME)
        : 5 * 60_000;       // 5 min after market

      intervalRef.current = setTimeout(() => {
        fetchPrices().then(() => schedule());
      }, delay);
    };

    schedule();

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
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