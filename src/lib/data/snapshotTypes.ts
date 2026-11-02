import type {
  PortfolioStock,
  TradeStrategy,
  WatchlistStock,
  PriceAlert,
  FnOTrade,
} from "../../data/sampleData.ts";

/**
 * One broker fill. Added deliberately rather than derived from `stocks`,
 * because a position row cannot represent partial exits or multiple lots.
 * Relative import keeps this file usable from Pages Functions (no `@` alias).
 */
export type Execution = {
  /** "indmoney:<tradeId>" or "indmoney:hash:<sha256>". */
  id: string;
  source: "indmoney";
  market: "NSE" | "US";
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  /** ISO-8601 execution time. */
  executedAt: string;
  currency: "INR" | "USD";
};

/**
 * The whole-portfolio snapshot stored in Firestore
 * (`portfolios/{uid}.snapshot`) and used by the historical import tooling.
 */
export type PortfolioSnapshot = {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  watchlist: WatchlistStock[];
  alerts: PriceAlert[];
  fnoTrades: FnOTrade[];
  /** Broker fills. Optional so pre-existing documents remain valid. */
  executions?: Execution[];
};
