import { useCallback, useEffect, useState } from "react";
import { fetchCandles } from "@/lib/market-data/client";
import type { CandleRange, CandlesEnvelope, Market } from "@/lib/market-data/types";

const cache = new Map<string, CandlesEnvelope>();
const MAX_CONCURRENT = 3;
let active = 0;
const waiters: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

type CandleHistoryState = {
  status: "idle" | "loading" | "ready" | "error";
  envelope: CandlesEnvelope | null;
  error: string | null;
};

export function useCandleHistory(symbol: string | null, range: CandleRange, market: Market = "NSE") {
  const [state, setState] = useState<CandleHistoryState>({
    status: symbol ? "loading" : "idle",
    envelope: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const key = symbol ? `${market}:${symbol}:${range}` : "";

  useEffect(() => {
    if (!symbol) return;
    const cached = cache.get(key);
    if (cached) {
      setState({ status: "ready", envelope: cached, error: null });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading", envelope: null, error: null });

    withSlot(() => fetchCandles({ market, ticker: symbol }, range, { signal: controller.signal }))
      .then((envelope) => {
        if (cancelled) return;
        cache.set(key, envelope);
        setState({ status: "ready", envelope, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          envelope: null,
          error: error instanceof Error ? error.message : "Chart unavailable",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, market, range, key, nonce]);

  const retry = useCallback(() => {
    if (key) cache.delete(key);
    setState((current) => ({ ...current, status: "loading", error: null }));
    setNonce((value) => value + 1);
  }, [key]);

  return { ...state, retry };
}
