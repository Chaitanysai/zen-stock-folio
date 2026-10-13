/**
 * Shared, auto-updating subscription to the single market-status service.
 *
 * One module-level timer serves every subscriber, so mounting the hook in N
 * components does not create N timers. The timer is cleared as soon as the last
 * subscriber unmounts.
 *
 * Re-evaluation happens:
 *  - exactly at the next status boundary (open / pre-open / close / midnight), and
 *  - every `RECHECK_INTERVAL_MS` as a safety net (clock drift, suspended tab,
 *    laptop wake-up), so the UI never needs a page refresh.
 */

import { useEffect, useState } from "react";
import { getMarketStatus, MarketStatus } from "@/lib/market/marketStatus";

const RECHECK_INTERVAL_MS = 15_000;
/** Land just after a boundary so the recomputed status is on the new side. */
const BOUNDARY_SKEW_MS = 250;
const MIN_DELAY_MS = 250;

type Listener = (status: MarketStatus) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let current: MarketStatus | null = null;

function isSameStatus(a: MarketStatus, b: MarketStatus): boolean {
  return (
    a.phase === b.phase &&
    a.isOpen === b.isOpen &&
    a.label === b.label &&
    a.istTime === b.istTime &&
    a.istDate === b.istDate &&
    a.holidayDataStale === b.holidayDataStale
  );
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNextTick() {
  clearTimer();
  if (listeners.size === 0) return;

  let delay = RECHECK_INTERVAL_MS;
  if (current?.nextChangeAt != null) {
    const untilBoundary = current.nextChangeAt - Date.now() + BOUNDARY_SKEW_MS;
    if (untilBoundary > 0) delay = Math.min(delay, untilBoundary);
  }

  timer = setTimeout(tick, Math.max(MIN_DELAY_MS, delay));
}

function tick() {
  const next = getMarketStatus();
  if (!current || !isSameStatus(current, next)) {
    current = next;
    listeners.forEach((listener) => listener(next));
  } else {
    // Keep the freshest `nextChangeAt` even when the visible status is equal.
    current = next;
  }
  scheduleNextTick();
}

/** Current status, recomputed on demand. */
export function getMarketStatusSnapshot(): MarketStatus {
  current = getMarketStatus();
  return current;
}

/** Subscribes to status changes. Returns an unsubscribe function. */
export function subscribeMarketStatus(listener: Listener): () => void {
  listeners.add(listener);
  current = getMarketStatus();
  listener(current);
  scheduleNextTick();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimer();
      current = null;
    }
  };
}

/** React binding. Every market-status indicator in the app must use this. */
export function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatusSnapshot);

  useEffect(() => subscribeMarketStatus(setStatus), []);

  return status;
}
