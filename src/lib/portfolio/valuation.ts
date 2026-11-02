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
 *  - An unpriced position contributes to neither value, cost, nor P&L; it is
 *    counted in `unpricedCount`. A missing price is never rendered as zero.
 *
 * Freshness travels with the total so a stale figure cannot carry a live label.
 */

import type { PortfolioStock } from "../../data/sampleData.ts";
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

// ── Mixed-market INR valuation ────────────────────────────────────────────────
//
// Everything below converts native-currency positions into INR so the
// dashboard can add an NSE row and a US row together. It never estimates:
// a USD row without a current rate has `null` INR value, and a USD row without
// `fxAtCost` has `null` FX P&L. Price P&L and FX P&L are reported separately,
// so a currency move cannot masquerade as a stock call.

export type PositionKeySource = Pick<PortfolioStock, "market" | "ticker">;

export const positionKey = (stock: PositionKeySource): string =>
  `${stock.market ?? "NSE"}:${stock.ticker}`;

export const marketOf = (stock: Pick<PortfolioStock, "market">): "NSE" | "US" =>
  stock.market === "US" ? "US" : "NSE";

export type CurrencySource = Pick<PortfolioStock, "currency" | "market">;

/**
 * Default from the market when the row carries no currency, so a U.S. listing
 * can never be priced as INR at an implied rate of 1. Task 12 normalizes the
 * stored field, but parsing can pass a `{ market: "US" }` row through first.
 */
export const currencyOf = (stock: CurrencySource): "INR" | "USD" =>
  stock.currency === "USD" ? "USD" : stock.market === "US" ? "USD" : "INR";

/** Read a quote map that is keyed by `market:ticker`. */
export function quoteFor<T>(prices: Record<string, T>, stock: PositionKeySource): T | undefined {
  return prices[positionKey(stock)];
}

const rateFor = (stock: CurrencySource, usdInr: number | null): number | null =>
  currencyOf(stock) === "USD" ? usdInr : 1;

export function valueInr(
  stock: PortfolioStock,
  price: number,
  usdInr: number | null,
): number | null {
  const fx = rateFor(stock, usdInr);
  return fx === null ? null : price * stock.quantity * fx;
}

export function pricePnlInr(
  stock: PortfolioStock,
  price: number,
  usdInr: number | null,
): number | null {
  const fx = rateFor(stock, usdInr);
  return fx === null ? null : (price - stock.entryPrice) * stock.quantity * fx;
}

export function fxPnlInr(stock: PortfolioStock, usdInr: number | null): number | null {
  // `null` can arrive from a document even though the field is typed optional,
  // and a non-finite rate would silently fabricate a full-notional FX result.
  if (
    currencyOf(stock) !== "USD" ||
    usdInr === null ||
    stock.fxAtCost == null ||
    !Number.isFinite(stock.fxAtCost)
  ) {
    return null;
  }
  return stock.quantity * stock.entryPrice * (usdInr - stock.fxAtCost);
}

export interface TotalsRow {
  stock: PortfolioStock;
  /** Live or stored price in the row's native currency. */
  cmp: number;
}

export interface PortfolioTotals {
  investedInr: number;
  valueInr: number;
  pricePnlInr: number;
  /**
   * Sum of the FX P&L that can be computed. `null` when there is nothing to
   * report: no USD rows, or no USD lot carries `fxAtCost`.
   */
  fxPnlInr: number | null;
  /** True when at least one USD lot lacks `fxAtCost`, so the total is partial. */
  fxEstimated: boolean;
  /** Rows that contributed to value, cost and P&L. */
  pricedCount: number;
  /** Rows skipped because `cmp` was not a finite positive price. */
  unpricedCount: number;
  /**
   * USD market value converted at the current rate. `0` when the portfolio has
   * no USD rows; `null` when USD rows exist but `usdInr` is unknown **or** a
   * USD row has no price, because unknown exposure is unknown, never partial.
   */
  usdExposureInr: number | null;
  /** True when a USD row had no current rate and was excluded from INR totals. */
  incomplete: boolean;
}

/**
 * INR totals for the active rows. An unpriced row (`cmp` is not a finite
 * positive price) contributes to neither value, cost, nor P&L and is counted
 * in `unpricedCount`; it is never valued at zero.
 */
export function portfolioTotals(rows: TotalsRow[], usdInr: number | null): PortfolioTotals {
  let investedInr = 0;
  let valueInrTotal = 0;
  let pricePnlTotal = 0;
  let fxPnlTotal = 0;
  let fxLots = 0;
  let usdExposure = 0;
  let usdRows = 0;
  let fxEstimated = false;
  let incomplete = false;
  let pricedCount = 0;
  let unpricedCount = 0;
  let usdUnpriced = false;

  for (const { stock, cmp } of rows) {
    const isUsd = currencyOf(stock) === "USD";
    if (isUsd) usdRows += 1;
    if (!isValidPrice(cmp)) {
      unpricedCount += 1;
      if (isUsd) usdUnpriced = true;
      continue;
    }
    const fx = rateFor(stock, usdInr);
    if (fx === null) {
      incomplete = true;
      continue;
    }
    pricedCount += 1;
    investedInr += stock.entryPrice * stock.quantity * fx;
    valueInrTotal += cmp * stock.quantity * fx;
    pricePnlTotal += (cmp - stock.entryPrice) * stock.quantity * fx;
    if (isUsd) {
      usdExposure += cmp * stock.quantity;
      const fxPnl = fxPnlInr(stock, usdInr);
      if (fxPnl === null) {
        fxEstimated = true;
      } else {
        fxLots += 1;
        fxPnlTotal += fxPnl;
      }
    }
  }

  return {
    investedInr,
    valueInr: valueInrTotal,
    pricePnlInr: pricePnlTotal,
    fxPnlInr: fxLots > 0 ? fxPnlTotal : null,
    fxEstimated,
    pricedCount,
    unpricedCount,
    usdExposureInr:
      usdRows === 0 ? 0 : usdInr === null || usdUnpriced ? null : usdExposure * usdInr,
    incomplete,
  };
}

/** Realised P&L in INR for a closed row. `null` when its rate is unavailable. */
export function realisedPnlInr(stock: PortfolioStock, usdInr: number | null): number | null {
  const fx = rateFor(stock, usdInr);
  if (fx === null) return null;
  // Documents can hold an explicit null even though the field is optional, so
  // treat null like absent and fall back to the mark instead of doing maths on it.
  const exit = stock.status !== "Active" && stock.exitPrice != null ? stock.exitPrice : stock.cmp;
  return (exit - stock.entryPrice) * stock.quantity * fx;
}

/** Today's P&L in INR from a per-share native move. `null` when either input is missing. */
export function dayPnlInr(
  stock: PortfolioStock,
  change: number | null,
  usdInr: number | null,
): number | null {
  if (change === null || !Number.isFinite(change)) return null;
  const fx = rateFor(stock, usdInr);
  return fx === null ? null : change * stock.quantity * fx;
}

/**
 * INR-denominated copies for aggregate widgets that only do arithmetic.
 *
 * USD rows are DROPPED when no rate exists rather than left native: mixing
 * currencies in one sum is worse than an explicitly incomplete total, which
 * `portfolioTotals().incomplete` already reports. Quotes are fetched from the
 * native rows, never from this view.
 */
export function toInrStocks(stocks: PortfolioStock[], usdInr: number | null): PortfolioStock[] {
  const out: PortfolioStock[] = [];
  for (const stock of stocks) {
    const fx = rateFor(stock, usdInr);
    if (fx === null) continue;
    if (fx === 1) {
      out.push(stock);
      continue;
    }
    const converted: PortfolioStock = { ...stock, currency: "INR" };
    // Only convert fields the row actually carries: an absent (or explicitly
    // null) value must stay unknown, never become a converted zero.
    if (Number.isFinite(stock.entryPrice)) converted.entryPrice = stock.entryPrice * fx;
    if (Number.isFinite(stock.cmp)) converted.cmp = stock.cmp * fx;
    if (Number.isFinite(stock.weekHigh52)) converted.weekHigh52 = stock.weekHigh52 * fx;
    if (Number.isFinite(stock.weekLow52)) converted.weekLow52 = stock.weekLow52 * fx;
    if (Number.isFinite(stock.exitPrice)) converted.exitPrice = stock.exitPrice * fx;
    // A converted row is INR: its USD rate at cost no longer means anything.
    delete converted.fxAtCost;
    out.push(converted);
  }
  return out;
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
