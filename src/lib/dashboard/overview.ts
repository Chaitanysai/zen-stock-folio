/**
 * Pure derivations behind the Overview. No React, no I/O, so each rule can be
 * asserted directly. Nothing here synthesises data: every number is computed
 * from the user's own holdings, F&O trades and the quotes already fetched.
 */

import {
  calcFnOInvested,
  calcFnOPnL,
  calcInvestedValue,
  calcProfitLoss,
  type FnOTrade,
  type PortfolioStock,
} from "@/data/sampleData";
import type { Market } from "@/lib/market-data/types";
import { isSameTradingDay, parseTradingDate } from "@/lib/trading";
import {
  dayPnlInr,
  isValidPrice,
  positionKey,
  quoteFor,
  realisedPnlInr,
  valueInr,
} from "@/lib/portfolio/valuation";

type PriceChange = { change: number | null } | undefined;

export interface OverviewMetrics {
  active: PortfolioStock[];
  closed: PortfolioStock[];
  fnoOpen: FnOTrade[];
  fnoClosed: FnOTrade[];
  equityInvested: number;
  equityValue: number;
  fnoInvested: number;
  fnoValue: number;
  invested: number;
  current: number;
  /** Unrealised P&L across open equity and open F&O. */
  pnl: number;
  pnlPct: number;
  totalRealised: number;
  closedCount: number;
  wins: number;
  /** `null` until at least one trade is closed. */
  winRate: number | null;
  /** Open-position move since the previous close, from quotes actually received. */
  dayMove: number;
  /** `dayMove` as a share of the previous close value, or `null` without quote data. */
  dayMovePct: number | null;
  hasDayData: boolean;
  /** Day move plus anything realised today. */
  todayPnl: number;
  todayPct: number | null;
  /** Active equity rows that contributed a price to value, cost and P&L. */
  pricedCount: number;
  /** Active equity rows skipped because no usable market price existed. */
  unpricedCount: number;
  /** True when a USD row was excluded for want of a current USD→INR rate. */
  fxIncomplete: boolean;
  /** Closed equity rows whose realised P&L could not be converted to INR. */
  realisedExcluded: number;
}

/**
 * Overview totals in INR.
 *
 * Prices are keyed `market:ticker`, so a quote lookup must never use a bare
 * symbol: `INFY` on NSE and `INFY` on the NYSE are different instruments. USD
 * rows are converted at one supplied rate; without that rate they are excluded
 * and flagged (`fxIncomplete`) rather than added in at an implied rate of 1.
 * An unpriced position contributes to neither value, cost nor P&L, and is
 * counted in `unpricedCount` — never valued at zero.
 */
export function computeMetrics(
  live: PortfolioStock[],
  fnoTrades: FnOTrade[],
  prices: Record<string, PriceChange>,
  today = new Date(),
  usdInr: number | null = null,
): OverviewMetrics {
  const active = live.filter((s) => s.status === "Active");
  const closed = live.filter((s) => s.status !== "Active");
  const fnoOpen = fnoTrades.filter((t) => t.status === "Open");
  const fnoClosed = fnoTrades.filter((t) => t.status !== "Open");

  let equityInvested = 0;
  let equityValue = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let fxIncomplete = false;

  for (const stock of active) {
    if (!isValidPrice(stock.cmp)) {
      unpricedCount += 1;
      continue;
    }
    const value = valueInr(stock, stock.cmp, usdInr);
    const cost = valueInr(stock, stock.entryPrice, usdInr);
    if (value === null || cost === null || !Number.isFinite(value) || !Number.isFinite(cost)) {
      fxIncomplete = true;
      continue;
    }
    equityValue += value;
    equityInvested += cost;
    pricedCount += 1;
  }

  const fnoInvested = fnoOpen.reduce((sum, t) => sum + calcFnOInvested(t), 0);
  const fnoUnrealised = fnoOpen.reduce((sum, t) => sum + calcFnOPnL(t), 0);
  const fnoValue = fnoInvested + fnoUnrealised;

  const invested = equityInvested + fnoInvested;
  const current = equityValue + fnoValue;
  const pnl = equityValue - equityInvested + fnoUnrealised;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  let realisedEquity = 0;
  let realisedExcluded = 0;
  for (const stock of closed) {
    const pnl = realisedPnlInr(stock, usdInr);
    if (pnl === null || !Number.isFinite(pnl)) realisedExcluded += 1;
    else realisedEquity += pnl;
  }
  const totalRealised = realisedEquity + fnoClosed.reduce((sum, t) => sum + calcFnOPnL(t), 0);

  // Win/loss is a direction, not an amount, so it needs no conversion.
  const wins =
    closed.filter((s) => calcProfitLoss(s) > 0).length + fnoClosed.filter((t) => calcFnOPnL(t) > 0).length;
  const closedCount = closed.length + fnoClosed.length;

  const equityDay = active.reduce((sum, stock) => {
    const change = quoteFor(prices, stock)?.change ?? null;
    const day = dayPnlInr(stock, change, usdInr);
    return day === null ? sum : sum + day;
  }, 0);
  const fnoDay = fnoOpen.reduce((sum, t) => sum + (t.dayChange ?? 0) * t.lots * t.lotSize, 0);
  const dayMove = equityDay + fnoDay;
  const hasDayData =
    active.some((stock) => typeof quoteFor(prices, stock)?.change === "number") ||
    fnoOpen.some((t) => typeof t.dayChange === "number");
  const previous = current - dayMove;

  let realisedToday = 0;
  for (const stock of closed) {
    if (!isSameTradingDay(stock.exitDate, today)) continue;
    const pnl = realisedPnlInr(stock, usdInr);
    if (pnl !== null && Number.isFinite(pnl)) realisedToday += pnl;
  }
  realisedToday += fnoClosed
    .filter((t) => isSameTradingDay(t.exitDate, today))
    .reduce((sum, t) => sum + calcFnOPnL(t), 0);
  const todayPnl = dayMove + realisedToday;

  return {
    active, closed, fnoOpen, fnoClosed,
    equityInvested, equityValue, fnoInvested, fnoValue,
    invested, current, pnl, pnlPct, totalRealised,
    closedCount, wins,
    winRate: closedCount > 0 ? (wins / closedCount) * 100 : null,
    dayMove,
    dayMovePct: hasDayData && previous > 0 ? (dayMove / previous) * 100 : null,
    hasDayData,
    todayPnl,
    todayPct: hasDayData && previous > 0 ? (todayPnl / previous) * 100 : null,
    pricedCount,
    unpricedCount,
    fxIncomplete,
    realisedExcluded,
  };
}

// ─── Realised P&L by month ────────────────────────────────────────────────────

export interface MonthBucket {
  key: string;
  label: string;
  /** Net realised P&L in the month; 0 means no trade closed, or exactly break-even. */
  value: number;
  trades: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Realised P&L grouped by exit month for closed equity and F&O trades.
 * Months between the first and last closed trade are included at 0 so gaps are
 * visible. Closed trades without a usable exit date cannot be placed in a month
 * and are counted in `undated` instead of being guessed.
 */
export function realisedByMonth(
  stocks: PortfolioStock[],
  fnoTrades: FnOTrade[],
  limit = 12,
): { months: MonthBucket[]; undated: number } {
  const totals = new Map<string, { value: number; trades: number }>();
  let undated = 0;

  const add = (exitDate: string | undefined, pnl: number) => {
    const date = parseTradingDate(exitDate);
    if (!date) { undated += 1; return; }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = totals.get(key) ?? { value: 0, trades: 0 };
    bucket.value += pnl;
    bucket.trades += 1;
    totals.set(key, bucket);
  };

  stocks.filter((s) => s.status !== "Active").forEach((s) => add(s.exitDate, calcProfitLoss(s)));
  fnoTrades.filter((t) => t.status !== "Open").forEach((t) => add(t.exitDate, calcFnOPnL(t)));

  if (totals.size === 0) return { months: [], undated };

  const keys = [...totals.keys()].sort();
  const [fy, fm] = keys[0].split("-").map(Number);
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  const months: MonthBucket[] = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? (y += 1, m = 1) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const bucket = totals.get(key);
    months.push({
      key,
      label: `${MONTHS[m - 1]} '${String(y).slice(-2)}`,
      value: bucket?.value ?? 0,
      trades: bucket?.trades ?? 0,
    });
  }
  return { months: months.slice(-limit), undated };
}

// ─── Holdings table ───────────────────────────────────────────────────────────

export interface HoldingRow {
  /** `market:ticker`; two listings of one ticker stay separate rows. */
  key: string;
  market: Market;
  ticker: string;
  name: string;
  sector: string;
  qty: number;
  avg: number;
  /** `null` when no usable price exists — never rendered as zero. */
  ltp: number | null;
  invested: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

export type HoldingSortKey = "name" | "qty" | "avg" | "ltp" | "value" | "pnl" | "pnlPct";
export type HoldingFilter = "all" | "gain" | "loss";

export function toHoldingRow(stock: PortfolioStock): HoldingRow {
  const invested = calcInvestedValue(stock);
  const priced = isValidPrice(stock.cmp);
  const value = priced ? stock.cmp * stock.quantity : null;
  return {
    key: positionKey(stock),
    market: stock.market ?? "NSE",
    ticker: stock.ticker,
    name: stock.stockName || stock.ticker,
    sector: stock.sector || "Other",
    qty: stock.quantity,
    avg: stock.entryPrice,
    ltp: priced ? stock.cmp : null,
    invested,
    value,
    pnl: value === null ? null : value - invested,
    pnlPct: value === null || invested <= 0 ? null : ((value - invested) / invested) * 100,
  };
}

export function filterHoldings(rows: HoldingRow[], query: string, mode: HoldingFilter): HoldingRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    // An unpriced row has no gain/loss direction, so it belongs to neither filter.
    if (mode === "gain" && (r.pnl === null || r.pnl <= 0)) return false;
    if (mode === "loss" && (r.pnl === null || r.pnl >= 0)) return false;
    if (!q) return true;
    return [r.ticker, r.name, r.sector].some((field) => field.toLowerCase().includes(q));
  });
}

export function sortHoldings(rows: HoldingRow[], key: HoldingSortKey, dir: "asc" | "desc"): HoldingRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") {
      const result = a.name.localeCompare(b.name);
      return result === 0 ? a.key.localeCompare(b.key) : result * factor;
    }
    const left = a[key];
    const right = b[key];
    // Unpriced rows have no magnitude to rank; they sit last in either direction.
    if (left === null && right === null) return a.key.localeCompare(b.key);
    if (left === null) return 1;
    if (right === null) return -1;
    const result = left - right;
    return result === 0 ? a.key.localeCompare(b.key) : result * factor;
  });
}
