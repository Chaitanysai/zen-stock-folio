/**
 * Portfolio valuation policy: what a total may claim, and what it may not.
 *
 * The defect this replaces: the Dashboard summed `stock.cmp` for every active
 * position, and `cmp` is *also* where the live overlay writes a provider price.
 * A position with no market price was silently valued at the stored (or even
 * zero) figure, and the result was labelled "Portfolio Value" under a
 * "Delayed · asof" line as though every unit had been priced.
 *
 * Policy (single, consistent, and visible in the UI):
 *  - A position is **verified** when the quote layer produced a finite, positive
 *    price for it and the provider's own timestamp established a data mode.
 *  - The **verified total** is the market value of verified positions only.
 *  - The **estimated total** adds last-known stored prices for the rest. It is
 *    never presented as the portfolio value; it is labelled as an estimate.
 *  - An unpriced position contributes to neither total and is counted in
 *    `unpricedCount`. A missing price is never rendered as zero.
 *
 * Freshness travels with the total so a stale figure cannot carry a live label.
 */

import type { DataMode, QuoteEnvelope } from "../market-data/types.ts";

export interface ValuationPosition {
  ticker: string;
  quantity: number;
  /** Cost per unit, from the user's own record. Always available. */
  entryPrice: number;
  /** Last-known price the user stored. Used only for the estimate. */
  storedPrice: number;
}

export interface ValuationQuote {
  /** Provider price, or null when the provider reported none. */
  price: number | null;
  /** Provider's own freshness verdict, from `QuoteEnvelope.dataMode`. */
  dataMode: DataMode;
}

export interface ValuationInput {
  positions: ValuationPosition[];
  /** Envelopes keyed by canonical symbol. */
  quotes: Record<string, QuoteEnvelope>;
}

export interface PricedPosition {
  ticker: string;
  quantity: number;
  price: number;
  marketValue: number;
  costBasis: number;
  dataMode: DataMode;
}

export interface ValuationSummary {
  /** Positions considered (active only, by the caller). */
  positionCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** Market value of positions with a verified provider price. */
  verifiedValue: number;
  /**
   * Verified value plus last-known stored prices for unpriced positions.
   * Equal to `verifiedValue` when everything is priced.
   */
  estimatedValue: number;
  invested: number;
  /** True only when every position has a verified price. */
  complete: boolean;
  /** Weakest freshness among the verified prices; `unknown` when none. */
  dataMode: DataMode;
  /** Symbols counted in `unpricedCount`, for the UI to name them. */
  unpricedSymbols: string[];
  priced: PricedPosition[];
}

const MODE_RANK: Record<DataMode, number> = { realtime: 0, delayed: 1, eod: 2, unknown: 3 };

/** A usable market price: finite and strictly positive. */
export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Decide how one position is valued.
 *
 * `unknown` freshness means the provider answered without a timestamp, so the
 * number cannot be labelled and is treated as unpriced for the verified total.
 */
export function classifyPosition(
  position: ValuationPosition,
  quote: ValuationQuote | undefined,
): "verified" | "stored" | "missing" {
  if (!quote) return isValidPrice(position.storedPrice) ? "stored" : "missing";
  if (!isValidPrice(quote.price)) return isValidPrice(position.storedPrice) ? "stored" : "missing";
  if (quote.dataMode === "unknown") return isValidPrice(position.storedPrice) ? "stored" : "missing";
  return "verified";
}

export function summarizeValuation(input: ValuationInput): ValuationSummary {
  const { positions, quotes } = input;
  let verifiedValue = 0;
  let estimatedValue = 0;
  let invested = 0;
  let dataMode: DataMode = "unknown";
  let anyVerified = false;

  const unpricedSymbols: string[] = [];
  const priced: PricedPosition[] = [];

  for (const position of positions) {
    const quantity = Number.isFinite(position.quantity) ? position.quantity : 0;
    const costBasis = (Number.isFinite(position.entryPrice) ? position.entryPrice : 0) * quantity;
    invested += costBasis;

    const envelope = quotes[position.ticker];
    const verdict = classifyPosition(position, envelope ? { price: envelope.quote?.price ?? null, dataMode: envelope.dataMode } : undefined);

    if (verdict === "verified" && envelope?.quote?.price) {
      const price = envelope.quote.price;
      const marketValue = price * quantity;
      verifiedValue += marketValue;
      estimatedValue += marketValue;
      priced.push({ ticker: position.ticker, quantity, price, marketValue, costBasis, dataMode: envelope.dataMode });
      if (!anyVerified || MODE_RANK[envelope.dataMode] > MODE_RANK[dataMode]) dataMode = envelope.dataMode;
      anyVerified = true;
      continue;
    }

    // Estimated total may use the stored price, so the user still sees context.
    if (verdict === "stored") estimatedValue += position.storedPrice * quantity;
    unpricedSymbols.push(position.ticker);
  }

  const unpricedCount = unpricedSymbols.length;
  return {
    positionCount: positions.length,
    pricedCount: priced.length,
    unpricedCount,
    verifiedValue,
    estimatedValue,
    invested,
    complete: unpricedCount === 0,
    dataMode: anyVerified ? dataMode : "unknown",
    unpricedSymbols,
    priced,
  };
}

/**
 * The headline the UI must show for a total.
 *
 * - `verified`: every position priced; the number is the portfolio value.
 * - `estimate`: some positions unpriced; the number is explicitly an estimate.
 * - `unavailable`: nothing priced, so no total may be shown at all.
 */
export type ValuationHeadline = "verified" | "estimate" | "unavailable";

export function headlineFor(summary: ValuationSummary): ValuationHeadline {
  if (summary.positionCount === 0) return "unavailable";
  if (summary.pricedCount === 0) return "unavailable";
  return summary.complete ? "verified" : "estimate";
}

/** Currency figure at the precision the dashboard uses. */
export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `₹${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * One sentence a user can act on. Never claims a total it does not have.
 *
 * `modeLabel` is the already-translated freshness word ("Delayed", "EOD",
 * "Live") so this module does not re-derive presentation vocabulary.
 */
export function describeValuation(summary: ValuationSummary, modeLabel: string): string {
  const headline = headlineFor(summary);
  if (headline === "unavailable") {
    return summary.positionCount === 0
      ? "No active positions to value."
      : `No market price is available for ${summary.unpricedCount} position${summary.unpricedCount === 1 ? "" : "s"}, so no current value is shown.`;
  }  if (headline === "verified") {
    return `Verified total · ${summary.pricedCount} of ${summary.positionCount} priced · ${modeLabel}`;
  }
  return `Estimated total · ${summary.unpricedCount} of ${summary.positionCount} unpriced (last-known prices used) · ${modeLabel}`;
}
