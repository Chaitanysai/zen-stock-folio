import type { PortfolioStock } from "../../data/sampleData.ts";
import type { Execution, PortfolioSnapshot } from "./snapshotTypes.ts";

/**
 * Shared structural validation for snapshot payloads coming from any cloud
 * provider. Applies the design's read defaults so old documents keep working:
 * missing `market`/`currency`/`source` become NSE/INR/manual and a missing
 * `executions` array becomes `[]`.
 */

const asMarket = (value: unknown): "NSE" | "US" => (value === "US" ? "US" : "NSE");

/**
 * A stored row's prices are in its market's native currency, so the market
 * decides it: a US row is always USD and every other row INR. A contradicting
 * stored currency is corrected here rather than preserved; only in-memory
 * conversions (`toInrStocks`) may relabel a U.S. row as INR.
 */
const asCurrency = (market: "NSE" | "US"): "INR" | "USD" => (market === "US" ? "USD" : "INR");

const SOURCES = new Set<NonNullable<PortfolioStock["source"]>>([
  "manual",
  "indmoney",
  "groww",
  "zerodha",
]);

/**
 * A stored cost of `0`, a blank string or a non-finite number is not a cost;
 * it normalizes to `null` so downstream maths cannot treat it as free shares.
 * Legacy documents never hold `null`, so this only affects rows whose source
 * statement never stated a purchase price.
 */
const asCost = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

function normalizeStock(value: unknown): PortfolioStock | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as PortfolioStock;
  if (typeof row.ticker !== "string" || !row.ticker) return null;
  const market = asMarket(row.market);
  const entryDate = asText(row.entryDate);
  const statementFingerprint = asText(row.statementFingerprint);
  return {
    ...row,
    market,
    currency: asCurrency(market),
    source: row.source && SOURCES.has(row.source) ? row.source : "manual",
    entryPrice: asCost(row.entryPrice),
    // Firestore rejects explicit `undefined`, so absent optionals are omitted
    // rather than carried as keys. Their absence already means "not known".
    ...(entryDate ? { entryDate } : {}),
    ...(statementFingerprint ? { statementFingerprint } : {}),
  };
}

function normalizeExecution(value: unknown): Execution | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<Execution>;
  if (
    typeof row.id !== "string" ||
    !row.id ||
    (row.market !== "NSE" && row.market !== "US") ||
    typeof row.ticker !== "string" ||
    !row.ticker ||
    (row.side !== "BUY" && row.side !== "SELL") ||
    typeof row.quantity !== "number" ||
    !Number.isFinite(row.quantity) ||
    row.quantity <= 0 ||
    typeof row.price !== "number" ||
    !Number.isFinite(row.price) ||
    row.price < 0 ||
    typeof row.executedAt !== "string" ||
    Number.isNaN(Date.parse(row.executedAt)) ||
    (row.currency !== "INR" && row.currency !== "USD")
  ) {
    return null;
  }
  return {
    id: row.id,
    source: "indmoney",
    market: row.market,
    ticker: row.ticker,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    executedAt: row.executedAt,
    currency: row.currency,
  };
}

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
    stocks: parsed.stocks.map(normalizeStock).filter((row): row is PortfolioStock => row !== null),
    trades: parsed.trades,
    watchlist: parsed.watchlist,
    alerts: parsed.alerts,
    fnoTrades: Array.isArray(parsed.fnoTrades) ? parsed.fnoTrades : [],
    executions: Array.isArray(parsed.executions)
      ? parsed.executions
          .map(normalizeExecution)
          .filter((row): row is Execution => row !== null)
      : [],
  };
};
