import type { PortfolioSnapshot } from "./snapshotTypes";

/**
 * Shared structural validation for snapshot payloads coming from any cloud
 * provider. Mirrors the validation the original usePortfolioSync applied to
 * Supabase rows: all four array fields must be present; fnoTrades defaults
 * to an empty array for snapshots written before that field existed.
 */
export const parseSnapshot = (value: unknown): PortfolioSnapshot | null => {
  const parsed = value as Partial<PortfolioSnapshot> | null;
  if (
    !parsed ||
    !Array.isArray(parsed.stocks) ||
    !Array.isArray(parsed.trades) ||
    !Array.isArray(parsed.watchlist) ||
    !Array.isArray(parsed.alerts)
  ) {
    return null;
  }
  return {
    stocks: parsed.stocks,
    trades: parsed.trades,
    watchlist: parsed.watchlist,
    alerts: parsed.alerts,
    fnoTrades: Array.isArray(parsed.fnoTrades) ? parsed.fnoTrades : [],
  };
};
