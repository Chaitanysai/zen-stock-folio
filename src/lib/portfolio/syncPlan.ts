import type { PortfolioStock } from "../../data/sampleData.ts";
import type { Execution, PortfolioSnapshot } from "../data/snapshotTypes.ts";
import type {
  HoldingChange,
  NormalizedFill,
  NormalizedHolding,
  PreviewResult,
  SyncConflict,
  UnmatchedHolding,
} from "../broker/types.ts";
import { aggregateClosedLots, deriveClosedLots, formatTradeDate } from "./fifo.ts";

/**
 * Pure INDmoney diff. The route and the tests both call this, so a preview and
 * the apply that follows it are computed by exactly the same code.
 *
 * Ownership: only `source: "indmoney"` rows are ever created, changed, or
 * removed. A symbol that also has a manual row is skipped wholesale and
 * reported as `manual-position`.
 *
 * Stored data is treated as untrusted: malformed or duplicate executions are
 * kept in the ledger but excluded from FIFO and reported as warnings.
 */

export interface SyncPlanInput {
  snapshot: PortfolioSnapshot;
  snapshotUpdateTime: string | null;
  holdings: NormalizedHolding[];
  unmatched: UnmatchedHolding[];
  fills: NormalizedFill[];
  warnings?: string[];
  /** Overrides "now" for the entry-date fallback and `generatedAt`. */
  now?: string;
}

export interface SyncPlan {
  preview: PreviewResult;
  nextSnapshot: PortfolioSnapshot;
}

const MAX_STOCKS = 1000;
const MAX_EXECUTIONS = 10_000;
const EPSILON = 1e-6;

const isSynced = (row: PortfolioStock): boolean => row.source === "indmoney";
const isOpen = (row: PortfolioStock): boolean => row.status === "Active";
const rowKey = (row: Pick<PortfolioStock, "market" | "ticker">): string =>
  `${row.market === "US" ? "US" : "NSE"}:${row.ticker}`;

const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;

/** Canonical note payload, so two equal journals are not treated as a conflict. */
const notesKey = (notes: PortfolioStock["notes"]): string =>
  JSON.stringify([
    notes?.tradeReason ?? null,
    notes?.marketCondition ?? null,
    notes?.strategyUsed ?? null,
    notes?.mistakesLearned ?? null,
  ]);

const positionSnapshot = (
  row: PortfolioStock | undefined,
): HoldingChange["before"] =>
  row ? { quantity: row.quantity, averagePrice: row.entryPrice } : null;

const combinedSnapshot = (
  rows: PortfolioStock[],
): HoldingChange["before"] => {
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (quantity === 0) return null;
  const cost = rows.reduce((sum, row) => sum + row.entryPrice * row.quantity, 0);
  return { quantity, averagePrice: cost / quantity };
};

const changeOf = (
  ticker: string,
  before: HoldingChange["before"],
  after: HoldingChange["after"],
): HoldingChange => ({ ticker, before, after });

const isUsableExecution = (row: Execution): boolean =>
  typeof row.id === "string" &&
  row.id !== "" &&
  typeof row.ticker === "string" &&
  row.ticker !== "" &&
  (row.side === "BUY" || row.side === "SELL") &&
  Number.isFinite(row.quantity) &&
  row.quantity > 0 &&
  Number.isFinite(row.price) &&
  row.price >= 0 &&
  typeof row.executedAt === "string" &&
  !Number.isNaN(Date.parse(row.executedAt));

const executionPayload = (row: Execution): string =>
  JSON.stringify([
    row.source,
    row.market,
    row.ticker,
    row.side,
    row.quantity,
    row.price,
    row.executedAt,
    row.currency,
  ]);

/**
 * Every stored row is persisted again, even when it is unreadable or repeats
 * an id: executions are never removed. Only usable, unique rows feed FIFO.
 */
function mergeExecutions(existing: Execution[], fills: NormalizedFill[]) {
  const executions: Execution[] = [...existing];
  const ledger: Execution[] = [];
  const seen = new Map<string, Execution>();
  let unreadable = 0;
  let duplicates = 0;

  for (const row of existing) {
    if (!isUsableExecution(row)) {
      unreadable += 1;
      continue;
    }
    if (seen.has(row.id)) {
      duplicates += 1;
      continue;
    }
    seen.set(row.id, row);
    ledger.push(row);
  }

  let added = 0;
  let ignored = 0;
  for (const fill of fills) {
    const execution: Execution = {
      id: fill.id,
      source: "indmoney",
      market: "NSE",
      ticker: fill.ticker,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      executedAt: fill.executedAt,
      currency: "INR",
    };
    if (!isUsableExecution(execution)) continue;
    const stored = seen.get(execution.id);
    if (stored) {
      if (executionPayload(stored) !== executionPayload(execution)) ignored += 1;
      continue;
    }
    seen.set(execution.id, execution);
    ledger.push(execution);
    executions.push(execution);
    added += 1;
  }

  return { executions, ledger, added, unreadable, duplicates, ignored };
}

/** Sum duplicate holdings rows, weighting the average price by quantity. */
function mergeHoldings(holdings: NormalizedHolding[]): NormalizedHolding[] {
  const merged = new Map<string, NormalizedHolding>();
  for (const holding of holdings) {
    const current = merged.get(holding.ticker);
    if (!current) {
      merged.set(holding.ticker, { ...holding });
      continue;
    }
    const quantity = current.quantity + holding.quantity;
    merged.set(holding.ticker, {
      ...current,
      quantity,
      averagePrice:
        (current.averagePrice * current.quantity + holding.averagePrice * holding.quantity) / quantity,
      lastPrice: holding.lastPrice ?? current.lastPrice,
    });
  }
  return [...merged.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

const usableLastPrice = (holding: NormalizedHolding): number | null =>
  holding.lastPrice !== null &&
  Number.isFinite(holding.lastPrice) &&
  holding.lastPrice > 0
    ? holding.lastPrice
    : null;

/**
 * `cmp` is preserved, never invented. A new row gets the documented `0`
 * sentinel for "no market price": `isValidPrice` rejects it, so valuation,
 * tables, charts and exports treat the row as unpriced until a quote arrives.
 * A stored quote wins even when it is `0`; the broker's last price is only a
 * rescue for a stored row whose `cmp` is not a finite number.
 */
const preservedCmp = (
  previous: PortfolioStock | undefined,
  holding: NormalizedHolding,
): number => {
  if (!previous) return 0;
  if (Number.isFinite(previous.cmp)) return previous.cmp;
  return usableLastPrice(holding) ?? 0;
};

export function buildSyncPlan(input: SyncPlanInput): SyncPlan {
  const now = input.now ?? new Date().toISOString();
  const warnings = [...(input.warnings ?? [])];
  const conflicts: SyncConflict[] = [];

  const {
    executions,
    ledger,
    added: executionsAdded,
    unreadable,
    duplicates,
    ignored,
  } = mergeExecutions(input.snapshot.executions ?? [], input.fills);
  if (unreadable > 0) {
    warnings.push(
      `${unreadable} stored execution row(s) were unreadable; they were kept but excluded from FIFO.`,
    );
  }
  if (duplicates > 0) {
    warnings.push(
      `${duplicates} stored execution row(s) duplicated an id; the first usable row won and the copy was kept.`,
    );
  }
  if (ignored > 0) {
    warnings.push(
      `${ignored} broker fill(s) reused an existing execution id with different data; the stored fill was kept.`,
    );
  }

  const derivedLots = aggregateClosedLots(deriveClosedLots(ledger, warnings));
  const derivedTickers = new Set(derivedLots.map((lot) => lot.ticker));

  const earliestBuy = new Map<string, string>();
  for (const execution of ledger) {
    if (execution.side !== "BUY" || execution.market !== "NSE") continue;
    const current = earliestBuy.get(execution.ticker);
    if (!current || Date.parse(execution.executedAt) < Date.parse(current)) {
      earliestBuy.set(execution.ticker, execution.executedAt);
    }
  }

  const manualRows = input.snapshot.stocks.filter((row) => !isSynced(row));
  const manualKeys = new Set(manualRows.map(rowKey));
  const previousSynced = input.snapshot.stocks.filter(isSynced);
  const previousOpen = new Map(
    previousSynced.filter(isOpen).map((row) => [row.ticker, row]),
  );
  const previousClosed = new Map<string, PortfolioStock[]>();
  for (const row of previousSynced.filter((row) => !isOpen(row))) {
    previousClosed.set(row.ticker, [...(previousClosed.get(row.ticker) ?? []), row]);
  }

  const manualConflictTickers = new Set<string>();
  const claimManual = (ticker: string) => {
    if (manualConflictTickers.has(ticker)) return;
    manualConflictTickers.add(ticker);
    conflicts.push({
      code: "manual-position",
      ticker,
      detail: "A manually entered row uses this symbol; the synced row was skipped.",
    });
  };

  const holdings = mergeHoldings(input.holdings);
  const held = new Set(holdings.map((row) => row.ticker));
  const nextOpen: PortfolioStock[] = [];
  const openPositions: HoldingChange[] = [];
  let unchangedPositions = 0;

  for (const holding of holdings) {
    if (manualKeys.has(`NSE:${holding.ticker}`)) {
      claimManual(holding.ticker);
      continue;
    }

    const previous = previousOpen.get(holding.ticker);
    const firstBuy = earliestBuy.get(holding.ticker);
    const entryDate =
      previous?.entryDate ?? (firstBuy ? formatTradeDate(firstBuy) : formatTradeDate(now));
    if (!previous && !firstBuy) {
      warnings.push(
        `No trade-book BUY was found for ${holding.ticker}; the entry date is set to today.`,
      );
    }

    const row: PortfolioStock = {
      ticker: holding.ticker,
      stockName: previous?.stockName ?? holding.ticker,
      entryDate,
      entryPrice: holding.averagePrice,
      cmp: preservedCmp(previous, holding),
      quantity: holding.quantity,
      status: "Active",
      market: "NSE",
      currency: "INR",
      source: "indmoney",
      brokerRef: holding.brokerRef,
    };
    if (previous?.sector !== undefined) row.sector = previous.sector;
    if (previous?.weekHigh52 !== undefined) row.weekHigh52 = previous.weekHigh52;
    if (previous?.weekLow52 !== undefined) row.weekLow52 = previous.weekLow52;
    if (previous?.dailyChange !== undefined) row.dailyChange = previous.dailyChange;
    if (previous?.notes !== undefined) row.notes = previous.notes;
    nextOpen.push(row);

    if (!previous) {
      openPositions.push(changeOf(row.ticker, null, positionSnapshot(row)));
    } else if (
      !sameNumber(previous.quantity, row.quantity) ||
      !sameNumber(previous.entryPrice, row.entryPrice) ||
      previous.entryDate !== row.entryDate
    ) {
      openPositions.push(
        changeOf(row.ticker, positionSnapshot(previous), positionSnapshot(row)),
      );
    } else {
      unchangedPositions += 1;
    }
  }

  const nextClosed: PortfolioStock[] = [];
  const closedPositions: HoldingChange[] = [];
  const pinnedOpen = new Set<string>();

  for (const lot of derivedLots) {
    if (manualKeys.has(`NSE:${lot.ticker}`)) {
      claimManual(lot.ticker);
      continue;
    }

    const previous = previousClosed.get(lot.ticker) ?? [];
    const storedOpen = previousOpen.get(lot.ticker);
    // A still-held row keeps its journal on the Active row that `nextOpen`
    // already holds, so only a position the broker stopped reporting can
    // donate its note to the derived closed row.
    const openNoteSource =
      storedOpen !== undefined && !held.has(lot.ticker) ? storedOpen : undefined;
    const exitDate = formatTradeDate(lot.soldOn);

    const closedNotes = previous.filter((row) => row.notes !== undefined);
    // With several stored rows, any note-bearing row whose exit date differs
    // cannot be collapsed into one row without losing its note.
    const mixedExitDates =
      previous.length > 1 && closedNotes.some((row) => row.exitDate !== exitDate);
    // An open row that is now closed carries its note too; when several stored
    // rows hold different journals, one aggregated row cannot keep them all.
    const noteRows = [
      ...(openNoteSource?.notes !== undefined ? [openNoteSource] : []),
      ...closedNotes,
    ];
    const distinctNotes = new Set(noteRows.map((row) => notesKey(row.notes)));

    if (mixedExitDates || distinctNotes.size > 1) {
      conflicts.push({
        code: "notes",
        ticker: lot.ticker,
        detail:
          "Several stored rows for this symbol carry notes that cannot be collapsed into one row; they were left unchanged.",
      });
      nextClosed.push(...previous);
      if (openNoteSource !== undefined && openNoteSource.notes !== undefined) {
        nextClosed.push(openNoteSource);
        pinnedOpen.add(lot.ticker);
      }
      continue;
    }

    const notes = noteRows[0]?.notes;
    const first = previous[0];
    const row: PortfolioStock = {
      ticker: lot.ticker,
      stockName: first?.stockName ?? lot.ticker,
      entryDate: formatTradeDate(lot.boughtOn),
      entryPrice: lot.averageBuyPrice,
      cmp: lot.sellPrice,
      quantity: lot.quantity,
      exitPrice: lot.sellPrice,
      exitDate,
      status: lot.sellPrice >= lot.averageBuyPrice ? "Sold Profit" : "Sold Loss",
      market: "NSE",
      currency: "INR",
      source: "indmoney",
      brokerRef: `NSE:${lot.ticker}`,
    };
    if (first?.sector !== undefined) row.sector = first.sector;
    if (first?.weekHigh52 !== undefined) row.weekHigh52 = first.weekHigh52;
    if (first?.weekLow52 !== undefined) row.weekLow52 = first.weekLow52;
    if (first?.dailyChange !== undefined) row.dailyChange = first.dailyChange;
    if (notes !== undefined) row.notes = notes;
    nextClosed.push(row);

    if (previous.length === 0) {
      closedPositions.push(changeOf(row.ticker, null, positionSnapshot(row)));
    } else if (
      previous.length > 1 ||
      !sameNumber(previous[0].quantity, row.quantity) ||
      !sameNumber(previous[0].entryPrice, row.entryPrice) ||
      previous[0].exitPrice === undefined ||
      !sameNumber(previous[0].exitPrice, lot.sellPrice) ||
      previous[0].exitDate !== exitDate ||
      previous[0].status !== row.status
    ) {
      closedPositions.push(
        changeOf(row.ticker, combinedSnapshot(previous), positionSnapshot(row)),
      );
    } else {
      unchangedPositions += 1;
    }
  }

  for (const [ticker, rows] of previousClosed) {
    if (derivedTickers.has(ticker) || manualKeys.has(`NSE:${ticker}`)) continue;
    nextClosed.push(...rows);
    conflicts.push({
      code: "empty-derivation",
      ticker,
      detail:
        "The trade book produced no closed lots for this symbol; its stored closed row(s) were kept.",
    });
  }

  // Removals run last: a note conflict may pin an open row that the broker no
  // longer reports, and a manual row claims its ticker entirely.
  const keptOpen: PortfolioStock[] = [];
  let removedOpen = 0;
  for (const [ticker, previous] of previousOpen) {
    if (manualKeys.has(`NSE:${ticker}`)) {
      claimManual(ticker);
      keptOpen.push(previous);
      continue;
    }
    if (held.has(ticker) || pinnedOpen.has(ticker)) continue;
    openPositions.push(changeOf(ticker, positionSnapshot(previous), null));
    removedOpen += 1;
  }

  // A manual row takes over the open position; any synced closed history for
  // that symbol is still kept so a takeover does not erase the trade record.
  const keptHistory = previousSynced.filter(
    (row) => !isOpen(row) && manualKeys.has(`NSE:${row.ticker}`),
  );

  const nextStocks = [
    ...manualRows,
    ...nextOpen,
    ...nextClosed,
    ...keptHistory,
    ...keptOpen,
  ];
  if (nextStocks.length > MAX_STOCKS) {
    conflicts.push({
      code: "limit",
      detail: `The merged portfolio has ${nextStocks.length} rows; the limit is ${MAX_STOCKS}.`,
    });
  }
  if (executions.length > MAX_EXECUTIONS) {
    conflicts.push({
      code: "limit",
      detail: `The execution ledger has ${executions.length} fills; the limit is ${MAX_EXECUTIONS}.`,
    });
  }

  // The flag guards an empty broker payload wiping the portfolio, so it counts
  // rows actually removed; manual-owned and pinned rows survive.
  const requiresEmptyConfirmation = input.holdings.length === 0 && removedOpen > 0;
  if (requiresEmptyConfirmation) {
    warnings.push(
      "The broker returned no holdings. Applying removes every synced open position, so confirmation is required.",
    );
  }

  return {
    preview: {
      mode: "preview",
      provider: "indmoney",
      generatedAt: now,
      holdingsSeen: input.holdings.length,
      executionsSeen: input.fills.length,
      openPositions,
      closedPositions,
      executionsAdded,
      unmatched: input.unmatched,
      conflicts,
      warnings,
      snapshotUpdateTime: input.snapshotUpdateTime,
      unchangedPositions,
      requiresEmptyConfirmation,
    },
    nextSnapshot: {
      stocks: nextStocks,
      trades: input.snapshot.trades,
      watchlist: input.snapshot.watchlist,
      alerts: input.snapshot.alerts,
      fnoTrades: input.snapshot.fnoTrades,
      executions,
    },
  };
}
