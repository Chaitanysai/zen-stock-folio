/**
 * Presentation helpers for mixed-currency rows.
 *
 * Formatting is locale-pinned per currency (en-IN for INR, en-US for USD) so a
 * USD price never renders with Indian digit grouping just because the browser
 * is set to en-IN. A missing INR conversion is "—", never 0 and never a guess.
 */

import type { PortfolioStock } from "../../data/sampleData.ts";
import { marketOf } from "./valuation.ts";

export type Currency = "INR" | "USD";

export const currencySymbol = (currency: Currency | undefined): string =>
  currency === "USD" ? "$" : "₹";

/** NSE unless the row is explicitly a U.S. listing; mirrors `marketOf`. */
export const marketCode = (stock: Pick<PortfolioStock, "market">): "NSE" | "US" =>
  marketOf(stock);

export function formatNative(
  value: number | null | undefined,
  currency: Currency | undefined,
  digits = 2,
): string {
  // A missing figure is "—", never ₹0: the 52W High cell can hold a stored
  // `null` at runtime, and Math.abs(null) would otherwise render as zero.
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const amount = Math.abs(value).toLocaleString(currency === "USD" ? "en-US" : "en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${currencySymbol(currency)}${amount}`;
}

export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
