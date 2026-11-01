import type { PortfolioStock } from "../../data/sampleData.ts";

/**
 * Ticker shapes accepted for manual entry. The U.S. rule allows the dotted
 * class-share form (BRK.B); the market-data layer converts it to BRK-B at the
 * provider boundary.
 */
export const US_TICKER_PATTERN = /^[A-Z][A-Z0-9.]{0,9}$/;
export const NSE_TICKER_PATTERN = /^[A-Z][A-Z0-9&-]{0,19}$/;

export interface ManualPositionInput {
  market: "NSE" | "US";
  ticker: string;
  stockName: string;
  entryDate?: string;
  entryPrice: number;
  quantity: number;
  cmp?: number;
  weekHigh52?: number;
  weekLow52?: number;
  dailyChange?: number;
  exitPrice?: number;
  exitDate?: string;
  status?: PortfolioStock["status"];
  /** USD→INR at the time of purchase. Omitted when unknown — never estimated. */
  fxAtCost?: number;
}

export function buildManualPosition(input: ManualPositionInput): PortfolioStock | null {
  const ticker = input.ticker.trim().toUpperCase();
  const pattern = input.market === "US" ? US_TICKER_PATTERN : NSE_TICKER_PATTERN;
  if (!pattern.test(ticker)) return null;
  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) return null;
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return null;

  const cmp = input.cmp !== undefined && Number.isFinite(input.cmp) && input.cmp > 0
    ? input.cmp
    : input.entryPrice;
  const fxAtCost = input.fxAtCost !== undefined && Number.isFinite(input.fxAtCost) && input.fxAtCost > 0
    ? input.fxAtCost
    : undefined;
  const status = input.status ?? "Active";
  const exitPrice = input.exitPrice !== undefined && Number.isFinite(input.exitPrice) && input.exitPrice > 0
    ? input.exitPrice
    : undefined;

  // A closed row with no exit price would book the mark (cmp) as realised.
  // Reject it instead of inventing a sale price.
  if (status !== "Active" && exitPrice === undefined) return null;

  return {
    ticker,
    stockName: input.stockName.trim() || ticker,
    entryDate:
      input.entryDate ||
      new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    entryPrice: input.entryPrice,
    cmp,
    weekHigh52: input.weekHigh52 ?? Math.max(cmp, input.entryPrice),
    weekLow52: input.weekLow52 ?? Math.min(cmp, input.entryPrice),
    ...(input.dailyChange !== undefined && Number.isFinite(input.dailyChange)
      ? { dailyChange: input.dailyChange }
      : {}),
    quantity: input.quantity,
    status,
    market: input.market,
    currency: input.market === "US" ? "USD" : "INR",
    source: "manual",
    ...(input.market === "US" && fxAtCost !== undefined ? { fxAtCost } : {}),
    ...(exitPrice !== undefined ? { exitPrice } : {}),
    ...(input.exitDate ? { exitDate: input.exitDate } : {}),
  };
}
