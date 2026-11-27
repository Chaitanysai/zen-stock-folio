/**
 * Read-only portfolio tools.
 *
 * Every number here is produced by the app's existing valuation policy —
 * `portfolioTotals`, `realisedPnlInr`, `isValidPrice`, `hasKnownCost` — not by a
 * local re-derivation. That is the whole point of the tool layer: the assistant
 * can only say what the dashboard would say.
 *
 * Honesty rules encoded below:
 *  - an unpriced position is excluded from totals and counted, never valued at 0;
 *  - a missing cost is "unknown", never free shares;
 *  - a USD position with no FX rate is excluded and disclosed,never mixed into INR;
 *  - a total is never labelled as if it included something it did not.
 */

import { hasKnownCost, type PortfolioStock } from "../../../../../src/data/sampleData.ts";
import {
  currencyOf,
  isValidPrice,
  marketOf,
  portfolioTotals,
  realisedPnlInr,
} from "../../../../../src/lib/portfolio/valuation.ts";
import { instrumentKey } from "../../../../../src/lib/market-data/symbols.ts";
import type { Instrument } from "../../../../../src/lib/market-data/types.ts";
import type { GetHoldingDetailsArgs, GetHoldingsArgs, HoldingRow } from "../../../../../src/lib/assistant/schemas.ts";
import { MAX_QUOTE_INSTRUMENTS, loadQuotes, loadSnapshot, loadUsdInr, toolError, toolOk, type ToolContext, type ToolOutcome } from "../context";

const DEFAULT_HOLDING_LIMIT = 10;

/**
 * Distinct securities in a set of lot rows.
 *
 * The snapshot stores one row per LOT; a ticker can legitimately appear several
 * times. The dashboard's equity KPI counts distinct holdings, so the assistant
 * must too — otherwise the same portfolio reads as "4 holdings" on screen and
 * "6 active positions" in chat.
 */
export function countHoldings(stocks: PortfolioStock[]): number {
  const keys = new Set<string>();
  for (const stock of stocks) {
    keys.add(instrumentKey({ market: marketOf(stock), ticker: stock.ticker }));
  }
  return keys.size;
}

/**
 * Phrases a lot count without implying it is a holding count.
 *
 * When every holding is a single lot the two numbers agree and the qualifier is
 * noise, so it is omitted. When they differ the summary names both, which is
 * the only wording that cannot be misread.
 */
function describePositions(lots: number, holdings: number): string {
  if (lots === 0) return "no open positions";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (lots === holdings) {
    return `${plural(lots, "active position")} across ${plural(holdings, "holding")}`;
  }
  return `${plural(lots, "active position lot")} across ${plural(holdings, "holding")}`;
}

/** Market value using the last known price; `0` only for an actually unpriced row. */
const knownValue = (stock: PortfolioStock): number => {
  const price = stock.status === "Active" ? stock.cmp : stock.exitPrice;
  return isValidPrice(price) ? price * stock.quantity : 0;
};

/**
 * The instruments worth a quote request, bounded and de-duplicated.
 *
 * When a portfolio has more positions than the quote cap, the highest-value ones
 * are fetched first: a partial refresh that covers the positions that move the
 * total is more useful than none, and the note says it was partial.
 */
function instrumentsToQuote(stocks: PortfolioStock[], max: number): Instrument[] {
  const unique = new Map<string, PortfolioStock>();
  for (const stock of stocks) {
    const key = instrumentKey({ market: marketOf(stock), ticker: stock.ticker });
    if (!unique.has(key)) unique.set(key, stock);
  }
  return [...unique.values()]
    .sort((a, b) => knownValue(b) - knownValue(a))
    .slice(0, max)
    .map((stock) => ({ market: marketOf(stock), ticker: stock.ticker }));
}

/** Native P&L for a row, using the live price for open lots and the exit price for closed ones. */
function nativePnl(stock: PortfolioStock, livePrice: number | null): number | null {
  if (!hasKnownCost(stock)) return null;
  const resolved =
    stock.status === "Active"
      ? isValidPrice(livePrice)
        ? livePrice
        : stock.cmp
      : stock.exitPrice;
  if (!isValidPrice(resolved)) return null;
  return (resolved - stock.entryPrice) * stock.quantity;
}

function toHoldingRow(stock: PortfolioStock, livePrice: number | null): HoldingRow {
  const price =
    stock.status === "Active"
      ? isValidPrice(livePrice)
        ? livePrice
        : isValidPrice(stock.cmp)
          ? stock.cmp
          : null
      : isValidPrice(stock.exitPrice)
        ? stock.exitPrice
        : null;

  const pnl = nativePnl(stock, price);
  const cost = hasKnownCost(stock) ? stock.entryPrice * stock.quantity : null;
  const pnlPercent = pnl !== null && cost !== null && cost > 0 ? (pnl / cost) * 100 : null;

  return {
    ticker: stock.ticker,
    name: stock.stockName,
    market: marketOf(stock),
    quantity: stock.quantity,
    averageCost: hasKnownCost(stock) ? stock.entryPrice : null,
    price,
    pnl,
    pnlPercent,
    currency: currencyOf(stock),
    status: stock.status,
  };
}

const quotePriceFor = (
  quotes: Record<string, { quote?: { price?: number | null } | null }>,
  stock: PortfolioStock,
): number | null => {
  const envelope = quotes[instrumentKey({ market: marketOf(stock), ticker: stock.ticker })];
  const price = envelope?.quote?.price;
  return isValidPrice(price) ? price : null;
};

const joinNotes = (notes: Array<string | null | undefined>): string | undefined => {
  const kept = notes.filter((note): note is string => Boolean(note));
  return kept.length > 0 ? kept.join(" ") : undefined;
};

/**
 * Portfolio totals: invested, current value, unrealised and realised P&L.
 */
export async function getPortfolioSummary(ctx: ToolContext): Promise<ToolOutcome> {
  const read = await loadSnapshot(ctx);
  if (read.status === "error") return toolError(read.message);

  const { stocks } = read.snapshot;
  if (stocks.length === 0) {
    return toolOk(
      "No positions are recorded in this portfolio yet.",
      { positions: 0, closedPositions: 0 },
      {
        kind: "metrics",
        title: "Portfolio",
        metrics: [{ label: "Open positions", value: 0, currency: null }],
        note: "No positions recorded yet.",
      },
    );
  }

  const active = stocks.filter((stock) => stock.status === "Active");
  const closed = stocks.filter((stock) => stock.status !== "Active");
  const hasUsd = stocks.some((stock) => currencyOf(stock) === "USD");
  const usdInr = hasUsd ? await loadUsdInr(ctx) : null;

  const quoteLoad = await loadQuotes(ctx, instrumentsToQuote(active, MAX_QUOTE_INSTRUMENTS));
  const rows = active.map((stock) => ({ stock, cmp: quotePriceFor(quoteLoad.quotes, stock) ?? stock.cmp }));
  const totals = portfolioTotals(rows, usdInr);

  let realisedTotal = 0;
  let realisedUnknown = 0;
  for (const stock of closed) {
    const value = realisedPnlInr(stock, usdInr);
    if (value === null) realisedUnknown += 1;
    else realisedTotal += value;
  }

  const unrealised = totals.pricePnlInr + (totals.fxPnlInr ?? 0);

  const note = joinNotes([
    quoteLoad.note,
    totals.unpricedCount > 0
      ? `${totals.unpricedCount} open position${totals.unpricedCount === 1 ? " has" : "s have"} no market price and ${totals.unpricedCount === 1 ? "is" : "are"} excluded from the value and P&L.`
      : null,
    totals.incomplete
      ? "U.S. holdings are excluded from these INR totals because no USD→INR rate is available."
      : null,
    totals.unknownCostCount > 0
      ? `${totals.unknownCostCount} position${totals.unknownCostCount === 1 ? " has" : "s have"} no recorded cost, so their return is unknown.`
      : null,
    realisedUnknown > 0
      ? `${realisedUnknown} closed lot${realisedUnknown === 1 ? "" : "s"} cannot be scored (missing cost, exit price or FX rate).`
      : null,
  ]);

  const closedClause =
    closed.length === 0
      ? ""
      : `, and ${closed.length} closed position lot${closed.length === 1 ? "" : "s"}`;
  const summary =
    `Totals in INR: ${describePositions(active.length, countHoldings(active))}${closedClause}.` +
    (note ? ` Caveats: ${note}` : "");

  return toolOk(
    summary,
    {
      currency: "INR",
      openPositions: active.length,
      activeLots: active.length,
      // Matches the dashboard's equity KPI: distinct tickers among OPEN lots.
      holdings: countHoldings(active),
      closedPositions: closed.length,
      closedLots: closed.length,
      closedHoldings: countHoldings(closed),
      holdingsNote:
        active.length === countHoldings(active)
          ? null
          : `${active.length} lots across ${countHoldings(active)} distinct holdings; a holding can be held as several lots.`,
      investedInr: totals.investedInr,
      currentValueInr: totals.valueInr,
      unrealisedPnlInr: unrealised,
      pricePnlInr: totals.pricePnlInr,
      fxPnlInr: totals.fxPnlInr,
      realisedPnlInr: closed.length === 0 ? null : realisedTotal,
      realisedUnknownLots: realisedUnknown,
      pricedCount: totals.pricedCount,
      unpricedCount: totals.unpricedCount,
      unknownCostCount: totals.unknownCostCount,
      usdExcluded: totals.incomplete,
      quotesLive: quoteLoad.live,
    },
    {
      kind: "metrics",
      title: "Portfolio summary",
      metrics: [
        { label: "Current value", value: totals.valueInr, currency: "INR" },
        { label: "Invested", value: totals.investedInr, currency: "INR" },
        { label: "Unrealised P&L", value: unrealised, currency: "INR" },
        {
          label: "Realised P&L",
          value: closed.length === 0 ? null : realisedTotal,
          currency: "INR",
          hint: realisedUnknown > 0 ? "Some closed lots cannot be scored" : undefined,
        },
        { label: "Open positions", value: active.length, currency: null },
        { label: "Holdings", value: countHoldings(active), currency: null },
      ],
      note,
    },
  );
}

/**
 * Positions with quantity, cost, price and P&L.
 */
export async function getHoldings(ctx: ToolContext, args: GetHoldingsArgs): Promise<ToolOutcome> {
  const read = await loadSnapshot(ctx);
  if (read.status === "error") return toolError(read.message);

  const status = args.status ?? "active";
  const limit = args.limit ?? DEFAULT_HOLDING_LIMIT;

  const active = read.snapshot.stocks.filter((stock) => stock.status === "Active");
  const closed = read.snapshot.stocks.filter((stock) => stock.status !== "Active");
  const pool = status === "active" ? active : status === "closed" ? closed : read.snapshot.stocks;

  if (pool.length === 0) {
    const emptyLabel =
      status === "active" ? "open positions" : status === "closed" ? "closed positions" : "positions";
    return toolOk(
      `There are no ${emptyLabel} in this portfolio.`,
      { status, count: 0, rows: [] },
      { kind: "holdings", title: "Holdings", rows: [], note: `No ${emptyLabel}.` },
    );
  }

  const ordered = [...pool].sort((a, b) => knownValue(b) - knownValue(a));
  const selected = ordered.slice(0, limit);

  const quoteLoad = await loadQuotes(ctx, instrumentsToQuote(selected, MAX_QUOTE_INSTRUMENTS));
  const rows = selected.map((stock) => toHoldingRow(stock, quotePriceFor(quoteLoad.quotes, stock)));

  const unpriced = rows.filter((row) => row.price === null).length;
  const note = joinNotes([
    ordered.length > selected.length ? `Showing the ${selected.length} largest of ${ordered.length}.` : null,
    quoteLoad.note,
    unpriced > 0 ? `${unpriced} position${unpriced === 1 ? " has" : "s have"} no market price.` : null,
  ]);

  const summary =
    `${rows.length} ${status === "all" ? "" : `${status} `}position${rows.length === 1 ? "" : "s"}` +
    (ordered.length > selected.length ? ` (largest ${selected.length} of ${ordered.length})` : "") +
    ` across ${countHoldings(pool)} distinct holding${countHoldings(pool) === 1 ? "" : "s"}.`;

  return toolOk(
    summary,
    {
      status,
      count: ordered.length,
      shown: rows.length,
      holdings: countHoldings(pool),
      quotesLive: quoteLoad.live,
      rows: rows.slice(0, 20),
      truncated: rows.length > 20,
    },
    {
      kind: "holdings",
      title: status === "closed" ? "Closed positions" : status === "all" ? "All positions" : "Open positions",
      rows,
      note,
    },
  );
}

/**
 * Details for one ticker, including every lot.
 *
 * A ticker can legitimately appear more than once (separate lots are allowed).
 * The tool returns all of them and says so rather than silently picking one —
 * the same rule any future write tool must follow.
 */
export async function getHoldingDetails(
  ctx: ToolContext,
  args: GetHoldingDetailsArgs,
): Promise<ToolOutcome> {
  const read = await loadSnapshot(ctx);
  if (read.status === "error") return toolError(read.message);

  const needle = args.ticker.trim().toUpperCase();
  const matches = read.snapshot.stocks.filter(
    (stock) =>
      stock.ticker.toUpperCase() === needle &&
      (args.market === undefined || marketOf(stock) === args.market),
  );

  if (matches.length === 0) {
    return toolError(`There is no position for ${needle} in this portfolio.`, false);
  }

  const quoteLoad = await loadQuotes(ctx, instrumentsToQuote(matches, MAX_QUOTE_INSTRUMENTS));
  const rows = matches.map((stock) => toHoldingRow(stock, quotePriceFor(quoteLoad.quotes, stock)));
  const multipleLots = rows.length > 1;
  const note = joinNotes([
    multipleLots ? `This ticker is held as ${rows.length} separate lots.` : null,
    quoteLoad.note,
  ]);

  return toolOk(
    `${rows.length} lot${rows.length === 1 ? "" : "s"} of ${needle}${multipleLots ? " (each listed separately)" : ""}.`,
    {
      ticker: needle,
      lots: rows.length,
      ambiguous: multipleLots,
      quotesLive: quoteLoad.live,
      rows,
    },
    {
      kind: "holdings",
      title: multipleLots ? `${needle} — ${rows.length} lots` : needle,
      rows,
      note,
    },
  );
}
