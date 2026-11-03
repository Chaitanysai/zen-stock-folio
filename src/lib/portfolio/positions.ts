/**
 * Canonical position engine.
 *
 * A stored `PortfolioStock` is a *lot*: a buy, plus a sale when the row is
 * closed. A *position* is every lot of one instrument from one source, so an
 * active row plus a sold row of the same symbol becomes one partially sold
 * position rather than two unrelated trades.
 *
 * The engine never guesses. Closure comes from recorded sale rows, not from the
 * age of a statement. A missing cost, exit price, market price, date or FX rate
 * leaves the affected figure `null`, excluded from the total and counted in the
 * disclosure beside it. A closed lot is never marked at `cmp`, and a missing
 * price is never treated as zero.
 */

import type { PortfolioStock } from "@/data/sampleData";
import { hasKnownCost } from "@/data/sampleData";
import type { MonthBucket } from "@/lib/dashboard/overview";
import { parseTradingDate } from "@/lib/trading";
import { currencyOf, isValidPrice } from "./valuation";

export type PositionStatus = "active" | "partial" | "closed" | "unvalued";

export type RealisedBasis = "computed" | "reported" | null;

export interface PositionLot {
  stock: PortfolioStock;
  /** Units still held from this lot. */
  remaining: number;
  /** Units sold from this lot. */
  sold: number;
  /** Cost of every unit the lot bought, or `null` when the cost is unknown. */
  costBasis: number | null;
  /** Realised amount for the sold units, or `null` when it cannot be known. */
  realised: number | null;
  /** `computed` from cost and exit, `reported` by the broker, or `null`. */
  realisedBasis: RealisedBasis;
  /** Unrealised amount for held units; `0` when nothing remains. */
  unrealised: number | null;
  /** Market value of held units; `0` when nothing remains. */
  marketValue: number | null;
  /** Usable per-unit market price for held units, else `null`. */
  price: number | null;
}

export interface Position {
  /** `source:market:ticker` — broker-scoped, so two brokers never merge. */
  key: string;
  source: string;
  sourceLabel: string;
  market: "NSE" | "US";
  ticker: string;
  name: string;
  isin: string | null;
  sector: string;
  currency: "INR" | "USD";
  status: PositionStatus;
  lots: PositionLot[];
  boughtQty: number;
  soldQty: number;
  remainingQty: number;
  /** Quantity-weighted buy price; `null` when any lot lacks a cost. */
  avgBuy: number | null;
  /** Quantity-weighted sell price; `null` when any sold lot lacks an exit price. */
  avgSell: number | null;
  /** Weighted price of remaining units; `null` when any held lot is unpriced. */
  price: number | null;
  /** Known cost of every bought unit. Uncosted lots are counted separately. */
  invested: number;
  investedUnknownLots: number;
  /** Cost of the remaining units; `null` when any held lot lacks a cost. */
  openCost: number | null;
  /** Market value of remaining units; `null` when any held lot is unpriced. */
  marketValue: number | null;
  /** Sum of known realised results; `null` when there are none to report. */
  realised: number | null;
  realisedUnknownLots: number;
  /** Sum of known unrealised results; `null` when any held lot is incomplete. */
  unrealised: number | null;
  firstEntryDate: string | null;
  lastExitDate: string | null;
}

export interface PositionIssue {
  ticker: string;
  reason: "missing-symbol" | "invalid-quantity";
  detail: string;
}

export interface BuildPositionsResult {
  positions: Position[];
  issues: PositionIssue[];
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  groww: "Groww",
  zerodha: "Zerodha",
  indmoney: "INDmoney",
};

export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? "Other";

export const POSITION_STATUS_LABEL: Record<PositionStatus, string> = {
  active: "Active",
  partial: "Partially Sold",
  closed: "Closed",
  unvalued: "Historical-Unvalued",
};

const validExit = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const dayValue = (value: string | null | undefined): number | null => {
  const date = parseTradingDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : null;
};

const earlierDate = (left: string | null, right: string | null): string | null => {
  if (left === null) return right;
  if (right === null) return left;
  const a = dayValue(left);
  const b = dayValue(right);
  if (a === null) return right;
  if (b === null) return left;
  return b < a ? right : left;
};

const laterDate = (left: string | null, right: string | null): string | null => {
  if (left === null) return right;
  if (right === null) return left;
  const a = dayValue(left);
  const b = dayValue(right);
  if (a === null) return right;
  if (b === null) return left;
  return b > a ? right : left;
};

function toLot(stock: PortfolioStock): PositionLot {
  const closed = stock.status !== "Active";
  const remaining = closed ? 0 : stock.quantity;
  const sold = closed ? stock.quantity : 0;
  const costBasis = hasKnownCost(stock) ? stock.entryPrice * stock.quantity : null;
  const exitKnown = closed && validExit(stock.exitPrice);
  const computed =
    exitKnown && hasKnownCost(stock)
      ? (stock.exitPrice - stock.entryPrice) * stock.quantity
      : null;
  const reported =
    closed &&
    typeof stock.statementPnl === "number" &&
    Number.isFinite(stock.statementPnl)
      ? stock.statementPnl
      : null;
  const realised = computed !== null ? computed : reported;
  const price = remaining > 0 && isValidPrice(stock.cmp) ? stock.cmp : null;

  return {
    stock,
    remaining,
    sold,
    costBasis,
    realised,
    realisedBasis: computed !== null ? "computed" : reported !== null ? "reported" : null,
    unrealised:
      remaining === 0
        ? 0
        : hasKnownCost(stock) && price !== null
          ? (price - stock.entryPrice) * remaining
          : null,
    marketValue: remaining === 0 ? 0 : price !== null ? price * remaining : null,
    price,
  };
}

function toPosition(key: string, lots: PositionLot[]): Position {
  const first = lots[0].stock;
  const boughtQty = lots.reduce((sum, lot) => sum + lot.stock.quantity, 0);
  const soldQty = lots.reduce((sum, lot) => sum + lot.sold, 0);
  const remainingQty = lots.reduce((sum, lot) => sum + lot.remaining, 0);

  const soldLots = lots.filter((lot) => lot.sold > 0);
  const openLots = lots.filter((lot) => lot.remaining > 0);
  const realisedUnknownLots = soldLots.filter((lot) => lot.realised === null).length;

  const status: PositionStatus =
    remainingQty > 0
      ? soldQty > 0
        ? "partial"
        : "active"
      : realisedUnknownLots > 0
        ? "unvalued"
        : "closed";

  const knownCost = lots.filter((lot) => lot.costBasis !== null);
  const avgBuy =
    knownCost.length === lots.length && boughtQty > 0
      ? knownCost.reduce((sum, lot) => sum + (lot.costBasis as number), 0) / boughtQty
      : null;

  const pricedSellLots = soldLots.filter((lot) => validExit(lot.stock.exitPrice));
  const avgSell =
    soldLots.length > 0 && pricedSellLots.length === soldLots.length && soldQty > 0
      ? pricedSellLots.reduce(
          (sum, lot) => sum + (lot.stock.exitPrice as number) * lot.sold,
          0,
        ) / soldQty
      : null;

  const openCostComplete = openLots.every((lot) => lot.costBasis !== null);
  const openCost =
    remainingQty === 0
      ? 0
      : openCostComplete
        ? openLots.reduce((sum, lot) => sum + (lot.costBasis as number), 0)
        : null;

  const marketValue =
    remainingQty === 0
      ? 0
      : openLots.every((lot) => lot.marketValue !== null)
        ? openLots.reduce((sum, lot) => sum + (lot.marketValue as number), 0)
        : null;

  const realisedKnown = soldLots.filter((lot) => lot.realised !== null);
  const realised =
    soldLots.length === 0
      ? null
      : realisedKnown.length > 0
        ? realisedKnown.reduce((sum, lot) => sum + (lot.realised as number), 0)
        : null;

  const unrealised =
    remainingQty === 0
      ? 0
      : openLots.every((lot) => lot.unrealised !== null)
        ? openLots.reduce((sum, lot) => sum + (lot.unrealised as number), 0)
        : null;

  let firstEntryDate: string | null = null;
  let lastExitDate: string | null = null;
  for (const lot of lots) {
    firstEntryDate = earlierDate(firstEntryDate, lot.stock.entryDate ?? null);
    if (lot.sold > 0) lastExitDate = laterDate(lastExitDate, lot.stock.exitDate ?? null);
  }

  return {
    key,
    source: first.source ?? "manual",
    sourceLabel: sourceLabel(first.source ?? "manual"),
    market: first.market === "US" ? "US" : "NSE",
    ticker: first.ticker,
    name: first.stockName || first.ticker,
    isin: lots.find((lot) => lot.stock.isin)?.stock.isin ?? null,
    sector: lots.find((lot) => lot.stock.sector)?.stock.sector ?? "Other",
    currency: currencyOf(first),
    status,
    lots,
    boughtQty,
    soldQty,
    remainingQty,
    avgBuy,
    avgSell,
    price: remainingQty > 0 && marketValue !== null ? marketValue / remainingQty : null,
    invested: knownCost.reduce((sum, lot) => sum + (lot.costBasis as number), 0),
    investedUnknownLots: lots.length - knownCost.length,
    openCost,
    marketValue,
    realised,
    realisedUnknownLots,
    unrealised,
    firstEntryDate,
    lastExitDate,
  };
}

/** Group stored lots into broker-scoped positions. Unusable rows are reported. */
export function buildPositions(stocks: PortfolioStock[]): BuildPositionsResult {
  const groups = new Map<string, PositionLot[]>();
  const issues: PositionIssue[] = [];

  for (const stock of stocks) {
    if (typeof stock.ticker !== "string" || stock.ticker.trim() === "") {
      issues.push({
        ticker: "",
        reason: "missing-symbol",
        detail: "A stored row has no ticker and cannot belong to a position.",
      });
      continue;
    }
    if (!Number.isFinite(stock.quantity) || stock.quantity <= 0) {
      issues.push({
        ticker: stock.ticker,
        reason: "invalid-quantity",
        detail: "A stored row has no positive quantity and was left out of analytics.",
      });
      continue;
    }
    const source = stock.source ?? "manual";
    const market = stock.market === "US" ? "US" : "NSE";
    const key = `${source}:${market}:${stock.ticker}`;
    const lots = groups.get(key);
    if (lots) lots.push(toLot(stock));
    else groups.set(key, [toLot(stock)]);
  }

  const positions = [...groups.entries()]
    .map(([key, lots]) => toPosition(key, lots))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { positions, issues };
}

// ── Currency ─────────────────────────────────────────────────────────────────

/** Multiplier into INR, or `null` when a USD position has no usable rate. */
export function positionInrFactor(
  position: Pick<Position, "currency">,
  usdInr: number | null,
): number | null {
  if (position.currency !== "USD") return 1;
  return usdInr !== null && Number.isFinite(usdInr) && usdInr > 0 ? usdInr : null;
}

/** Convert a known native figure; an unknown figure stays unknown. */
export function positionFact(value: number | null, factor: number | null): number | null {
  return value === null || factor === null ? null : value * factor;
}

/** Realised on a closed position, unrealised on an open one, both on a partial. */
export function positionTotalPnl(position: Position): number | null {
  if (position.status === "active") return position.unrealised;
  if (position.remainingQty === 0) return position.realised;
  if (position.realised === null || position.unrealised === null) return null;
  return position.realised + position.unrealised;
}

// ── Portfolio summary ────────────────────────────────────────────────────────

export interface PortfolioSummary {
  /** All-time cost of bought units, in INR. Only known costs are added. */
  totalInvested: number;
  investedUnknownLots: number;
  /** Market value of remaining units, in INR. */
  marketValue: number;
  unpricedPositions: number;
  unrealised: number;
  unrealisedExcluded: number;
  realised: number;
  /** Sold lots whose realised result cannot be derived. */
  realisedExcluded: number;
  /** Eligible realised + eligible unrealised; sold and remaining units are disjoint. */
  combined: number;
  /** Positions with anything still held, including partially sold ones. */
  activePositions: number;
  partialPositions: number;
  /** Positions with nothing left to hold, including historical-unvalued rows. */
  closedPositions: number;
  unvaluedPositions: number;
  historicalTransactions: number;
  importedLots: number;
  /** Positions omitted from every INR total because no USD→INR rate existed. */
  fxExcluded: number;
  issues: number;
}

export function summarisePositions(
  positions: Position[],
  usdInr: number | null,
  issues = 0,
): PortfolioSummary {
  const summary: PortfolioSummary = {
    totalInvested: 0,
    investedUnknownLots: 0,
    marketValue: 0,
    unpricedPositions: 0,
    unrealised: 0,
    unrealisedExcluded: 0,
    realised: 0,
    realisedExcluded: 0,
    combined: 0,
    activePositions: 0,
    partialPositions: 0,
    closedPositions: 0,
    unvaluedPositions: 0,
    historicalTransactions: 0,
    importedLots: 0,
    fxExcluded: 0,
    issues,
  };

  for (const position of positions) {
    summary.historicalTransactions += position.lots.length;
    summary.importedLots += position.lots.filter((lot) => lot.stock.source !== "manual").length;
    summary.investedUnknownLots += position.investedUnknownLots;
    summary.realisedExcluded += position.realisedUnknownLots;

    if (position.remainingQty > 0) summary.activePositions += 1;
    if (position.status === "partial") summary.partialPositions += 1;
    if (position.remainingQty === 0) summary.closedPositions += 1;
    if (position.status === "unvalued") summary.unvaluedPositions += 1;

    const factor = positionInrFactor(position, usdInr);
    // A USD position without a rate is unknown exposure; it joins no INR total.
    if (factor === null) {
      summary.fxExcluded += 1;
      continue;
    }

    summary.totalInvested += position.invested * factor;
    if (position.marketValue === null) summary.unpricedPositions += 1;
    else summary.marketValue += position.marketValue * factor;
    if (position.unrealised === null) summary.unrealisedExcluded += 1;
    else summary.unrealised += position.unrealised * factor;
    if (position.realised !== null) summary.realised += position.realised * factor;
  }

  summary.combined = summary.realised + summary.unrealised;
  return summary;
}

// ── Charts ───────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface RealisedMonthsResult {
  months: MonthBucket[];
  /** Sold lots with no usable exit date. */
  undated: number;
  /** Sold lots with no derivable realised result. */
  unscoreable: number;
  /** Sold lots omitted because their USD result had no INR rate. */
  fxExcluded: number;
}

/**
 * Realised P&L by exit month, one entry per sold lot. Months between the first
 * and last close are kept at zero so gaps stay visible; nothing is back-filled.
 */
export function realisedByMonthFromPositions(
  positions: Position[],
  usdInr: number | null,
  limit = 12,
): RealisedMonthsResult {
  const totals = new Map<string, { value: number; trades: number }>();
  let undated = 0;
  let unscoreable = 0;
  let fxExcluded = 0;

  for (const position of positions) {
    const factor = positionInrFactor(position, usdInr);
    for (const lot of position.lots) {
      if (lot.sold === 0) continue;
      if (factor === null) {
        fxExcluded += 1;
        continue;
      }
      if (lot.realised === null) {
        unscoreable += 1;
        continue;
      }
      const date = parseTradingDate(lot.stock.exitDate);
      if (!date) {
        undated += 1;
        continue;
      }
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const bucket = totals.get(key) ?? { value: 0, trades: 0 };
      bucket.value += lot.realised * factor;
      bucket.trades += 1;
      totals.set(key, bucket);
    }
  }

  if (totals.size === 0) return { months: [], undated, unscoreable, fxExcluded };

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
  return { months: months.slice(-limit), undated, unscoreable, fxExcluded };
}

export interface UnrealisedHolding {
  key: string;
  ticker: string;
  label: string;
  value: number;
}

export interface UnrealisedByHolding {
  holdings: UnrealisedHolding[];
  /** Open positions with no computable unrealised result or no FX rate. */
  excluded: number;
}

/** Open positions ranked by absolute unrealised P&L, in INR. */
export function unrealisedByHolding(
  positions: Position[],
  usdInr: number | null,
  limit = 8,
): UnrealisedByHolding {
  const holdings: UnrealisedHolding[] = [];
  let excluded = 0;

  for (const position of positions) {
    if (position.remainingQty === 0) continue;
    const factor = positionInrFactor(position, usdInr);
    if (factor === null || position.unrealised === null) {
      excluded += 1;
      continue;
    }
    holdings.push({
      key: position.key,
      ticker: position.ticker,
      label: position.name,
      value: position.unrealised * factor,
    });
  }

  holdings.sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value) || a.ticker.localeCompare(b.ticker),
  );
  return { holdings: holdings.slice(0, limit), excluded };
}

export interface OutcomeDistribution {
  wins: number;
  losses: number;
  breakEven: number;
  /** Sold lots with no derivable result; never counted as a loss. */
  unknown: number;
  grossProfit: number;
  grossLoss: number;
  net: number;
  fxExcluded: number;
}

/** Profit-vs-loss distribution over scored sold lots, in INR. */
export function outcomeDistribution(
  positions: Position[],
  usdInr: number | null,
): OutcomeDistribution {
  const result: OutcomeDistribution = {
    wins: 0, losses: 0, breakEven: 0, unknown: 0,
    grossProfit: 0, grossLoss: 0, net: 0, fxExcluded: 0,
  };

  for (const position of positions) {
    const factor = positionInrFactor(position, usdInr);
    for (const lot of position.lots) {
      if (lot.sold === 0) continue;
      if (factor === null) {
        result.fxExcluded += 1;
        continue;
      }
      if (lot.realised === null) {
        result.unknown += 1;
        continue;
      }
      const value = lot.realised * factor;
      if (value > 0) {
        result.wins += 1;
        result.grossProfit += value;
      } else if (value < 0) {
        result.losses += 1;
        result.grossLoss += value;
      } else {
        result.breakEven += 1;
      }
    }
  }

  result.net = result.grossProfit + result.grossLoss;
  return result;
}

export interface SourceBreakdownRow {
  source: string;
  label: string;
  positions: number;
  lots: number;
  invested: number;
  /** `null` when the source has nothing realised to report. */
  realised: number | null;
  unrealised: number | null;
  fxExcluded: number;
  investedUnknownLots: number;
}

/** Invested, realised and unrealised totals per broker/source, in INR. */
export function sourceBreakdown(
  positions: Position[],
  usdInr: number | null,
): SourceBreakdownRow[] {
  const rows = new Map<string, SourceBreakdownRow>();

  for (const position of positions) {
    const row = rows.get(position.source) ?? {
      source: position.source,
      label: position.sourceLabel,
      positions: 0,
      lots: 0,
      invested: 0,
      realised: null,
      unrealised: null,
      fxExcluded: 0,
      investedUnknownLots: 0,
    };
    row.positions += 1;
    row.lots += position.lots.length;
    row.investedUnknownLots += position.investedUnknownLots;

    const factor = positionInrFactor(position, usdInr);
    if (factor === null) {
      row.fxExcluded += 1;
      rows.set(position.source, row);
      continue;
    }
    row.invested += position.invested * factor;
    if (position.realised !== null) row.realised = (row.realised ?? 0) + position.realised * factor;
    if (position.unrealised !== null) {
      row.unrealised = (row.unrealised ?? 0) + position.unrealised * factor;
    }
    rows.set(position.source, row);
  }

  return [...rows.values()].sort(
    (a, b) => b.invested - a.invested || a.label.localeCompare(b.label),
  );
}

// ── Filtering and sorting ────────────────────────────────────────────────────

export type PositionFilter =
  | "all"
  | "active"
  | "partial"
  | "closed"
  | "unvalued"
  | "realised-gain"
  | "realised-loss"
  | "unrealised-gain"
  | "unrealised-loss"
  | "unknown-cost";

export interface PositionFilterOptions {
  query?: string;
  filter?: PositionFilter;
  /** `all` or a stored source such as `groww`. */
  broker?: string;
  /** Inclusive `YYYY-MM-DD` bounds; positions matching any known date pass. */
  from?: string | null;
  to?: string | null;
}

const matchesFilter = (position: Position, filter: PositionFilter): boolean => {
  switch (filter) {
    case "active": return position.status === "active";
    case "partial": return position.status === "partial";
    case "closed": return position.remainingQty === 0;
    case "unvalued": return position.status === "unvalued";
    case "realised-gain": return position.realised !== null && position.realised > 0;
    case "realised-loss": return position.realised !== null && position.realised < 0;
    case "unrealised-gain": return position.unrealised !== null && position.unrealised > 0;
    case "unrealised-loss": return position.unrealised !== null && position.unrealised < 0;
    case "unknown-cost": return position.investedUnknownLots > 0;
    case "all": return true;
    default: return true;
  }
};

export function filterPositions(
  positions: Position[],
  options: PositionFilterOptions = {},
): Position[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const filter = options.filter ?? "all";
  const broker = options.broker && options.broker !== "all" ? options.broker : null;
  const from = options.from ? dayValue(options.from) : null;
  const to = options.to ? dayValue(options.to) : null;

  return positions.filter((position) => {
    if (!matchesFilter(position, filter)) return false;
    if (broker && position.source !== broker) return false;
    if (from !== null || to !== null) {
      const dates = [position.firstEntryDate, position.lastExitDate]
        .map(dayValue)
        .filter((value): value is number => value !== null);
      const inRange = dates.some(
        (value) => (from === null || value >= from) && (to === null || value <= to),
      );
      if (!inRange) return false;
    }
    if (!query) return true;
    return [position.ticker, position.name, position.isin ?? "", position.sector, position.sourceLabel]
      .some((field) => field.toLowerCase().includes(query));
  });
}

export type PositionSortKey =
  | "name"
  | "status"
  | "qty"
  | "avgBuy"
  | "price"
  | "invested"
  | "value"
  | "realised"
  | "unrealised"
  | "total"
  | "entry"
  | "exit";

const STATUS_RANK: Record<PositionStatus, number> = {
  active: 0, partial: 1, closed: 2, unvalued: 3,
};

export function sortPositions(
  positions: Position[],
  key: PositionSortKey,
  dir: "asc" | "desc",
): Position[] {
  const factor = dir === "asc" ? 1 : -1;
  const valueOf = (position: Position): string | number | null => {
    switch (key) {
      case "name": return position.name;
      case "status": return STATUS_RANK[position.status];
      case "qty": return position.remainingQty;
      case "avgBuy": return position.avgBuy;
      case "price": return position.price;
      case "invested": return position.invested;
      case "value": return position.marketValue;
      case "realised": return position.realised;
      case "unrealised": return position.unrealised;
      case "total": return positionTotalPnl(position);
      case "entry": return dayValue(position.firstEntryDate);
      case "exit": return dayValue(position.lastExitDate);
      default: return null;
    }
  };

  return [...positions].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    // An unavailable value has no rank, so it sits last in either direction.
    if (left === null && right === null) return a.key.localeCompare(b.key);
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "string" || typeof right === "string") {
      const result = String(left).localeCompare(String(right));
      return result === 0 ? a.key.localeCompare(b.key) : result * factor;
    }
    const result = left - right;
    return result === 0 ? a.key.localeCompare(b.key) : result * factor;
  });
}

// ── Import reconciliation ────────────────────────────────────────────────────

export interface StatementDiscrepancy {
  ticker: string;
  computed: number;
  reported: number;
  delta: number;
}

export interface StatementDiscrepancyResult {
  checked: number;
  differing: StatementDiscrepancy[];
  totalDelta: number;
}

/**
 * Compare each closed row's broker-stated P&L with the computed price result.
 * Charges and rounding legitimately create small gaps; the computed result
 * stays canonical and every material difference is surfaced, never applied.
 */
export function statementDiscrepancies(stocks: PortfolioStock[]): StatementDiscrepancyResult {
  const differing: StatementDiscrepancy[] = [];
  let checked = 0;
  let totalDelta = 0;

  for (const stock of stocks) {
    if (stock.status === "Active") continue;
    if (typeof stock.statementPnl !== "number" || !Number.isFinite(stock.statementPnl)) continue;
    if (!hasKnownCost(stock) || !validExit(stock.exitPrice)) continue;
    checked += 1;
    const computed = (stock.exitPrice - stock.entryPrice) * stock.quantity;
    const delta = stock.statementPnl - computed;
    if (Math.abs(delta) <= Math.max(1, Math.abs(computed) * 0.001)) continue;
    differing.push({ ticker: stock.ticker, computed, reported: stock.statementPnl, delta });
    totalDelta += delta;
  }

  return { checked, differing, totalDelta };
}

export interface ImportLifecyclePreview {
  totalLots: number;
  openLots: number;
  closedLots: number;
  activePositions: number;
  partialPositions: number;
  closedPositions: number;
  unvaluedPositions: number;
  unknownCostLots: number;
  missingDateLots: number;
  closedWithoutPnlLots: number;
}

/** Lifecycle counts for the import preview, using the dashboard's own engine. */
export function previewImportLifecycle(stocks: PortfolioStock[]): ImportLifecyclePreview {
  const { positions } = buildPositions(stocks);
  const lots = positions.flatMap((position) => position.lots);
  return {
    totalLots: lots.length,
    openLots: lots.filter((lot) => lot.remaining > 0).length,
    closedLots: lots.filter((lot) => lot.sold > 0).length,
    activePositions: positions.filter((position) => position.status === "active").length,
    partialPositions: positions.filter((position) => position.status === "partial").length,
    closedPositions: positions.filter((position) => position.remainingQty === 0).length,
    unvaluedPositions: positions.filter((position) => position.status === "unvalued").length,
    unknownCostLots: lots.filter((lot) => lot.costBasis === null).length,
    missingDateLots: lots.filter((lot) => !lot.stock.entryDate).length,
    closedWithoutPnlLots: lots.filter((lot) => lot.sold > 0 && lot.realised === null).length,
  };
}
