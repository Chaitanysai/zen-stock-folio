import type { PortfolioSnapshot } from "@/lib/data/snapshotTypes";
import type { TradeJournalEntry } from "@/data/sampleData";

/**
 * Builds the stocks patch for a journal edit. Callers must apply the patch
 * through the snapshot pipeline (`applySnapshot`) so `snapshotRef` and the
 * persisted snapshot stay in sync — updating stocks state directly is what
 * caused notes to be overwritten by the next mutation.
 */
export function journalNotesPatch(
  snapshot: PortfolioSnapshot,
  ticker: string,
  notes: TradeJournalEntry,
): Pick<PortfolioSnapshot, "stocks"> {
  if (!snapshot.stocks.some((stock) => stock.ticker === ticker)) {
    return { stocks: snapshot.stocks };
  }

  return {
    stocks: snapshot.stocks.map((stock) =>
      stock.ticker === ticker ? { ...stock, notes } : stock,
    ),
  };
}
