/**
 * The USD→INR rate the INR valuation needs, shared by every U.S. row.
 *
 * `fetchFxRate` (Task 9) never invents a number: an unavailable rate arrives as
 * an error, and a cached or untimed rate arrives with `stale: true` and, for
 * the untimed case, `asOf: null`. This hook passes both through untouched and
 * keeps the last good rate when a poll fails, so one provider blip does not
 * blank the INR column.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFxRate, MarketDataApiError } from "@/lib/market-data/client";
import type { FxRate } from "@/lib/market-data/types";

const DEFAULT_POLL_MS = 15 * 60_000;

export interface UseFxRateResult {
  /** Live USD→INR rate, or null when it has not loaded or failed. */
  rate: number | null;
  asOf: string | null;
  /** True when the server served a cached rate, or one with no observation time. */
  stale: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useFxRate(options: { enabled?: boolean; pollMs?: number } = {}): UseFxRateResult {
  const enabled = options.enabled ?? true;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const [state, setState] = useState<Omit<UseFxRateResult, "refresh">>({
    rate: null,
    asOf: null,
    stale: false,
    loading: false,
    error: null,
  });
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const fx: FxRate = await fetchFxRate({ signal: controller.signal });
      setState({ rate: fx.rate, asOf: fx.asOf, stale: fx.stale, loading: false, error: null });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        // An abort is a supersede/unmount, not a provider failure. Clear the
        // flag unless a successor request already owns it (it set loading true
        // after starting), so loading cannot stay stuck on a request that will
        // never settle.
        if (inFlight.current === controller) {
          setState((prev) => ({ ...prev, loading: false }));
        }
        return;
      }
      // Keep the previous rate: a failed poll must not overwrite a good value
      // with null, and it must never substitute 0.
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          caught instanceof MarketDataApiError
            ? caught.message
            : "USD→INR rate is temporarily unavailable.",
      }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      // Drop a previous scope's rate instead of pricing USD rows at a stale one.
      setState({ rate: null, asOf: null, stale: false, loading: false, error: null });
      return;
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => {
      clearInterval(timer);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [enabled, pollMs, refresh]);

  return { ...state, refresh };
}
