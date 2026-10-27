/**
 * Dashboard presentation rules for values that are easy to present dishonestly.
 *
 * These are pure functions so the rules can be asserted directly, rather than
 * inferred from a screenshot of a 1,700-line page. Each one exists because the
 * dashboard previously presented the value in a way the data did not support:
 *
 *  - a missing watchlist CMP rendered as `₹0`
 *  - a stored CMP rendered identically to a live quote
 *  - a manually entered RSI coloured green/red as if it carried a direction
 *  - a stored F&O premium rendered identically to a live LTP
 *  - an invented "momentum score" / "breakout zone" asserted as fact
 */

import type { PortfolioStock } from "@/data/sampleData";

/** `₹1,234*` for a stored value, `—` when nothing was stored. Never `₹0`. */
export function formatStoredPrice(cmp: number | null | undefined): string {
  if (typeof cmp !== "number" || !Number.isFinite(cmp) || cmp <= 0) return "—";
  return `₹${cmp.toLocaleString("en-IN")}*`;
}

/** RSI is a level, not a direction; it is displayed without a sign or colour. */
export function formatStoredRsi(rsi: number | null | undefined): string {
  if (typeof rsi !== "number" || !Number.isFinite(rsi) || rsi <= 0) return "RSI —";
  return `RSI ${rsi.toFixed(0)}`;
}

export interface FnoPremiumView {
  /** The premium to display: live when available, otherwise the stored one. */
  premium: number;
  /** True only when a provider quote produced this number. */
  live: boolean;
}

/**
 * Decide which premium a row may show.
 *
 * A stored LTP is used as a labelled fallback, so the row still has context;
 * `live: false` is what stops the caller from presenting it as current.
 */
export function resolveFnoPremium(
  ltp: number | null | undefined,
  entryPrice: number,
): FnoPremiumView {
  if (typeof ltp === "number" && Number.isFinite(ltp) && ltp > 0) {
    return { premium: ltp, live: true };
  }
  return { premium: entryPrice, live: false };
}

/**
 * The AI teaser line.
 *
 * Only two facts are available client-side: the count of active positions and
 * the best performer by return on the user's own entry price. Anything about
 * momentum, breakouts, or a score would be invented.
 */
export function describeAiTeaser(
  activePositions: number,
  best: { ticker: string; pct: number } | null,
): string {
  if (best && Number.isFinite(best.pct)) {
    const sign = best.pct >= 0 ? "+" : "−";
    return `Your best position is ${best.ticker} at ${sign}${Math.abs(best.pct).toFixed(1)}% on your entry. Ask the model for a portfolio review.`;
  }
  if (activePositions > 0) {
    return `${activePositions} active position${activePositions === 1 ? "" : "s"} ready for an AI portfolio review.`;
  }
  return "Add holdings to unlock AI-powered portfolio analysis and trade recommendations.";
}

/** Best performer by unrealised return on entry price, or null when pointless. */
export function bestPerformer(stocks: PortfolioStock[]): { ticker: string; pct: number } | null {
  const scored = stocks
    .filter((stock) => stock.status === "Active" && stock.entryPrice > 0 && Number.isFinite(stock.cmp))
    .map((stock) => ({ ticker: stock.ticker, pct: ((stock.cmp - stock.entryPrice) / stock.entryPrice) * 100 }));
  if (scored.length === 0) return null;
  return scored.reduce((best, item) => (item.pct > best.pct ? item : best));
}
