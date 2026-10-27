import type { PriceAlert } from "@/data/sampleData";

/** Minimal price shape; StockPrice from useLivePrices is structurally compatible. */
export type AlertQuote = {
  price?: number;
  /** When the server obtained this quote (ISO). Absent means unknown age. */
  asOf?: string;
  /** When this client received the quote (ISO); used only when asOf is absent. */
  receivedAt?: string;
};

export type AlertPriceMap = Record<string, AlertQuote | undefined>;

/**
 * Coarse upper bound on quote age for alert evaluation. It rejects obviously
 * stale or retained quotes; it is not a freshness guarantee, and the server's
 * mixed live/EOD sources mean an accepted quote can still be end-of-day data.
 */
export const DEFAULT_MAX_QUOTE_AGE_MS = 24 * 60 * 60 * 1000;

/** Tolerance for server/client clock skew on the quote timestamp. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface AlertEvaluationOptions {
  /** Evaluation instant; defaults to Date.now(). */
  now?: number;
  /** True when the latest quote refresh failed, so no observation is trustworthy. */
  refreshFailed?: boolean;
  /** Tickers currently tracked; retained prices for other symbols are ignored. */
  activeTickers?: ReadonlySet<string>;
  maxQuoteAgeMs?: number;
}

const isUsablePrice = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const parseTimestamp = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * "between" alerts have no lower bound in the persisted model, so they are
 * never auto-triggered rather than guessed at.
 */
export function isAlertTriggered(alert: PriceAlert, price: number): boolean {
  if (!isUsablePrice(price)) return false;
  if (alert.direction === "above") return price >= alert.targetPrice;
  if (alert.direction === "below") return price <= alert.targetPrice;
  return false;
}

export interface AlertEvaluation {
  alerts: PriceAlert[];
  newlyTriggered: PriceAlert[];
}

/**
 * A quote may only trigger an alert when it is a real observation of that
 * symbol: it must carry a timestamp, that timestamp must be plausible and
 * recent, it must postdate the alert, and the ticker must still be tracked.
 *
 * The server's asOf (acquisition time) always wins. Legacy responses that omit
 * it fall back to the client receipt time, which only proves the quote arrived
 * recently -- not that the price itself is current.
 */
const isQuoteEligible = (
  alert: PriceAlert,
  quote: AlertQuote | undefined,
  now: number,
  maxQuoteAgeMs: number,
  activeTickers: ReadonlySet<string> | undefined,
): boolean => {
  if (!isUsablePrice(quote?.price)) return false;
  if (activeTickers && !activeTickers.has(alert.ticker)) return false;

  const observedAt =
    parseTimestamp(quote?.asOf) ?? parseTimestamp(quote?.receivedAt);
  if (observedAt === null) return false;
  if (observedAt - now > MAX_CLOCK_SKEW_MS) return false;
  if (now - observedAt > maxQuoteAgeMs) return false;

  const createdAt = parseTimestamp(alert.createdAt);
  if (createdAt !== null && observedAt < createdAt) return false;

  return true;
};

/**
 * One evaluation pass over the current price map. Already-triggered and
 * dismissed alerts are terminal, so a repeated pass cannot notify twice.
 */
export function evaluateAlerts(
  alerts: PriceAlert[],
  prices: AlertPriceMap,
  options: AlertEvaluationOptions = {},
): AlertEvaluation {
  if (options.refreshFailed) {
    return { alerts, newlyTriggered: [] };
  }

  const now = options.now ?? Date.now();
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? DEFAULT_MAX_QUOTE_AGE_MS;
  const newlyTriggered: PriceAlert[] = [];
  let changed = false;

  const nextAlerts = alerts.map((alert) => {
    if (alert.triggered || alert.dismissedAt) return alert;

    const quote = prices[alert.ticker];
    if (!isQuoteEligible(alert, quote, now, maxQuoteAgeMs, options.activeTickers)) {
      return alert;
    }
    if (!isAlertTriggered(alert, quote?.price ?? Number.NaN)) return alert;

    changed = true;
    const triggered: PriceAlert = {
      ...alert,
      triggered: true,
      triggeredAt: new Date(now).toISOString(),
    };
    newlyTriggered.push(triggered);
    return triggered;
  });

  return {
    alerts: changed ? nextAlerts : alerts,
    newlyTriggered,
  };
}
