import type { WatchlistStock } from "@/data/sampleData";

/** Raw add-dialog values; numbers stay strings until validated. */
export interface WatchlistDraft {
  ticker: string;
  sector?: string;
  cmp: string;
  entryZoneLow: string;
  entryZoneHigh: string;
  stopLoss: string;
  target1: string;
  target2?: string;
  target3?: string;
  rsi?: string;
  sma50?: string;
  ema10?: string;
  ema21?: string;
}

export type WatchlistBuildResult =
  | { status: "ok"; stock: WatchlistStock }
  | { status: "error"; error: string };

/** Matches the app's ticker convention (AddTransactionDialog, PriceAlerts). */
export const normalizeTicker = (raw: string): string => raw.toUpperCase().trim();

export const isDuplicateWatchlistTicker = (
  watchlist: WatchlistStock[],
  ticker: string,
): boolean => {
  const candidate = normalizeTicker(ticker);
  return watchlist.some(
    (stock) => normalizeTicker(stock.stockName) === candidate,
  );
};

const positiveNumber = (raw: string): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : NaN;
};

const optionalNumber = (raw?: string): number | null => {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
};

export function buildWatchlistStock(
  draft: WatchlistDraft,
  watchlist: WatchlistStock[],
): WatchlistBuildResult {
  const ticker = normalizeTicker(draft.ticker);
  if (!ticker) {
    return { status: "error", error: "Ticker symbol is required." };
  }
  if (isDuplicateWatchlistTicker(watchlist, ticker)) {
    return { status: "error", error: `${ticker} is already in your watchlist.` };
  }

  const cmp = positiveNumber(draft.cmp);
  const entryZoneLow = positiveNumber(draft.entryZoneLow);
  const entryZoneHigh = positiveNumber(draft.entryZoneHigh);
  const stopLoss = positiveNumber(draft.stopLoss);
  const target1 = positiveNumber(draft.target1);
  if ([cmp, entryZoneLow, entryZoneHigh, stopLoss, target1].some(Number.isNaN)) {
    return {
      status: "error",
      error: "CMP, entry zone, stop loss and Target 1 must be positive numbers.",
    };
  }
  if (entryZoneLow > entryZoneHigh) {
    return {
      status: "error",
      error: "Entry zone low cannot be higher than entry zone high.",
    };
  }

  const target2 = optionalNumber(draft.target2);
  const target3 = optionalNumber(draft.target3);
  const rsi = optionalNumber(draft.rsi);
  const sma50 = optionalNumber(draft.sma50);
  const ema10 = optionalNumber(draft.ema10);
  const ema21 = optionalNumber(draft.ema21);
  if ([target2, target3, rsi, sma50, ema10, ema21].some((value) => Number.isNaN(value))) {
    return { status: "error", error: "Technical values must be valid numbers." };
  }

  const sector = draft.sector?.trim();

  return {
    status: "ok",
    stock: {
      stockName: ticker,
      ...(sector ? { sector } : {}),
      cmp,
      entryZoneLow,
      entryZoneHigh,
      stopLoss,
      target1,
      target2: target2 ?? target1,
      target3: target3 ?? target1,
      rsi: rsi ?? 0,
      sma50: sma50 ?? 0,
      ema10: ema10 ?? 0,
      ema21: ema21 ?? 0,
    },
  };
}
