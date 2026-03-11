import { useState, useEffect, useCallback } from "react";

interface StockPrice {
  price: number;
  weekHigh52: number;
  weekLow52?: number;
  changePercent: number;
  change: number;
}

interface UseLivePricesResult {
  prices: Record<string, StockPrice>;
  loading: boolean;
  lastUpdated: string | null;
  error: string | null;
  refresh: () => void;
}

export function useLivePrices(tickers: string[], intervalMs = 60 * 1000): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) return;
    
    // Only fetch for unique active tickers
    const uniqueTickers = [...new Set(tickers)];
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: uniqueTickers }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Prices API error:", data);
        setError("Failed to fetch live prices");
        return;
      }

      if (data?.prices) {
        setPrices(data.prices);
        setLastUpdated(data.fetchedAt || new Date().toISOString());
      }
      if (data?.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error("Fetch prices error:", err);
      setError("Network error fetching prices");
    } finally {
      setLoading(false);
    }
  }, [tickers.join(",")]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, intervalMs);
    return () => clearInterval(interval);
  }, [fetchPrices, intervalMs]);

  return { prices, loading, lastUpdated, error, refresh: fetchPrices };
}