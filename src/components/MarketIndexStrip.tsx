/**
 * Index strip for the overview tab.
 *
 * `GET /api/market` returns `price: null` for an index whose provider failed.
 * That is rendered as "unavailable" — never as 0 or as a stale carry-over —
 * because a missing index level and a flat index look identical on screen and
 * a trader may act on either.
 *
 * While a session is running the strip polls every 15 s (the same floor as the
 * holdings quote poller), pauses while the tab is hidden, and refreshes as soon
 * as it becomes visible again. A changed level flashes for one beat so the
 * refresh is visible without the user watching the clock.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketOverviewResponse } from "@/lib/market-data/types.ts";
import { dataModeLabel } from "@/lib/market-data/freshness.ts";
import { fetchMarketOverview } from "@/lib/market-data/client.ts";
import { getPriceRefreshIntervalMs } from "@/lib/market/marketStatus";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { Skeleton } from "@/components/ui/skeleton";

type StripState =
  | { kind: "loading" }
  | { kind: "ready"; data: MarketOverviewResponse }
  | { kind: "error"; message: string };

type Tick = "up" | "down";

const OPEN_POLL_MS = 15_000;
const FLASH_MS = 1_200;

const IST_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatLevel(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatClock(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : IST_CLOCK.format(date);
}

export function MarketIndexStrip() {
  const market = useMarketStatus();
  const [state, setState] = useState<StripState>({ kind: "loading" });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, Tick>>({});

  const previousRef = useRef<Record<string, number | null>>({});
  const controllerRef = useRef<AbortController | null>(null);
  const lastRunRef = useRef(0);
  const flashTimerRef = useRef(0);

  const interval = market.isOpen
    ? OPEN_POLL_MS
    : Math.max(60_000, getPriceRefreshIntervalMs(market));

  const load = useCallback(async () => {
    // A visibility refresh can land right after a scheduled one; collapse that.
    const now = Date.now();
    if (now - lastRunRef.current < 2_000) return;
    lastRunRef.current = now;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await fetchMarketOverview({ signal: controller.signal });
      if (controller.signal.aborted) return;

      const ticks: Record<string, Tick> = {};
      for (const index of data.indices) {
        const before = previousRef.current[index.providerSymbol];
        if (typeof before === "number" && index.price !== null && before !== index.price) {
          ticks[index.providerSymbol] = index.price > before ? "up" : "down";
        }
        previousRef.current[index.providerSymbol] = index.price;
      }

      setState({ kind: "ready", data });
      setLastUpdated(data.fetchedAt);
      setRefreshError(null);

      if (Object.keys(ticks).length > 0) {
        setFlash(ticks);
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setFlash({}), FLASH_MS);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Index data unavailable.";
      // A failed poll must not blank the last good levels; only an initial
      // failure has nothing to fall back to.
      setState((previous) => (previous.kind === "ready" ? previous : { kind: "error", message }));
      setRefreshError(message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        if (!document.hidden) await load();
        if (!cancelled) schedule();
      }, interval);
    };

    const onVisibility = () => {
      if (!document.hidden) void load();
    };

    void load();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
      window.clearTimeout(flashTimerRef.current);
    };
  }, [interval, load]);

  if (state.kind === "error") {
    return <p className="zf-pulse-error">Indices unavailable — {state.message}</p>;
  }

  if (state.kind === "loading") {
    return (
      <>
        <div className="zf-pulse-list" role="status">
          <span className="zf-sr-only">Loading market indices</span>
          {[0, 1, 2].map((i) => (
            <div className="zf-pulse-row" key={i}>
              <Skeleton width={68} height={10} radius={999} />
              <Skeleton width={104} height={12} radius={999} />
            </div>
          ))}
        </div>
        <p className="zf-pulse-meta"><Skeleton width={112} height={9} radius={999} /></p>
      </>
    );
  }

  const clock = lastUpdated ? formatClock(lastUpdated) : null;
  const warnings = state.data.warnings.join(" · ");

  return (
    <>
      <ul className="zf-pulse-list">
        {state.data.indices.map((index) => {
          const up = (index.changePercent ?? 0) >= 0;
          return (
            <li key={index.providerSymbol} className="zf-pulse-row">
              <span className="zf-pulse-label">{index.label}</span>
              <span className="zf-pulse-fig">
                {index.price === null ? (
                  <span className="zf-pulse-na">unavailable</span>
                ) : (
                  <span className="zf-index-tick" data-tick={flash[index.providerSymbol]}>
                    <b className="zf-pulse-value">{formatLevel(index.price)}</b>
                    {index.changePercent !== null && (
                      <span className="zf-pulse-delta" data-tone={up ? "up" : "down"}>
                        {up ? "+" : ""}{index.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="zf-pulse-meta" title={refreshError ?? (warnings || undefined)}>
        {dataModeLabel(state.data.dataMode)} · {state.data.provider}
        {state.data.cached ? " · cached" : ""}
        {state.data.stale ? " · stale" : ""}
        {clock ? ` · as of ${clock} IST` : ""}
        {refreshError ? " · update failed" : ""}
      </p>
    </>
  );
}

export default MarketIndexStrip;
