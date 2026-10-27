import type {
  PortfolioStock,
  TradeStrategy,
  WatchlistStock,
  PriceAlert,
  FnOTrade,
} from "@/data/sampleData";

/**
 * The whole-portfolio snapshot shape stored in Firestore
 * (`portfolios/{uid}.snapshot`) and used by the historical import tooling.
 * Declared here, free of browser-only imports, so server-side and Node-context
 * code can reference it.
 */
export type PortfolioSnapshot = {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  watchlist: WatchlistStock[];
  alerts: PriceAlert[];
  fnoTrades: FnOTrade[];
};
