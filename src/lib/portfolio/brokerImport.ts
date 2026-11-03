import type { PortfolioStock } from "@/data/sampleData";
import { statementKey } from "@/lib/statementImport";

export type BrokerImportSource = "groww" | "zerodha";

export interface BrokerImportRequest {
  /** Undefined for the plain portfolio template, which appends instead of replacing. */
  source?: BrokerImportSource;
  stocks: PortfolioStock[];
  /** Statement rows rejected for missing/invalid data, reported in the preview. */
  excluded?: number;
}

export interface BrokerImportPlan {
  nextStocks: PortfolioStock[];
  added: number;
  replaced: number;
  retained: number;
  excluded: number;
  /** Set when applying the request would be unsafe. */
  error: string | null;
}

export interface BrokerImportOutcome {
  ok: boolean;
  source?: BrokerImportSource | "manual";
  added: number;
  replaced: number;
  retained: number;
  excluded: number;
  /** Set when the rows were committed locally but cloud sync failed. */
  persistenceError?: string | null;
  message?: string;
}

/** Applies a planned import. Resolves with counts and any persistence error. */
export type BrokerImportHandler = (request: BrokerImportRequest) => Promise<BrokerImportOutcome>;

const fingerprintOf = (stock: PortfolioStock): string =>
  stock.statementFingerprint || statementKey(stock);

const countBy = (stocks: PortfolioStock[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const stock of stocks) {
    const key = fingerprintOf(stock);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/**
 * Pure replacement planner for broker statements.
 *
 * A broker statement is authoritative for its own rows only: importing Groww
 * removes/replaces previous `groww` rows and leaves manual, INDmoney, Zerodha,
 * and every other source untouched. Rows are matched on the parser's stable
 * fingerprint, never on the import date.
 */
export function planBrokerImport(
  existing: PortfolioStock[],
  request: BrokerImportRequest,
): BrokerImportPlan {
  const excluded = request.excluded ?? 0;

  // Template CSV: append rows that are not already present. It never deletes.
  if (!request.source) {
    const seen = new Set(existing.map(statementKey));
    const fresh = request.stocks
      .filter((stock) => {
        const key = statementKey(stock);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((stock) => ({ ...stock, source: stock.source ?? "manual" as const }));
    return {
      nextStocks: [...existing, ...fresh],
      added: fresh.length,
      replaced: 0,
      retained: request.stocks.length - fresh.length,
      excluded,
      error: null,
    };
  }

  if (request.stocks.length === 0) {
    return {
      nextStocks: existing,
      added: 0,
      replaced: 0,
      retained: 0,
      excluded,
      error:
        "The statement produced no importable rows. Existing holdings were left unchanged.",
    };
  }

  const source = request.source;
  const incoming = request.stocks.map((stock) => ({ ...stock, source }));

  // Multiplicity matters: identical lots carry distinct occurrence suffixes.
  const incomingCounts = countBy(incoming);
  const remainingIncoming = new Map(incomingCounts);

  let retained = 0;
  let replaced = 0;
  for (const previous of existing) {
    if (previous.source !== source) continue;
    const key = fingerprintOf(previous);
    const available = remainingIncoming.get(key) ?? 0;
    if (available > 0) {
      remainingIncoming.set(key, available - 1);
      retained += 1;
    } else {
      replaced += 1;
    }
  }

  const previousCounts = countBy(existing.filter((stock) => stock.source === source));
  let added = 0;
  for (const stock of incoming) {
    const key = fingerprintOf(stock);
    const available = previousCounts.get(key) ?? 0;
    if (available > 0) previousCounts.set(key, available - 1);
    else added += 1;
  }

  // Other sources keep their exact objects and order.
  const untouched = existing.filter((stock) => stock.source !== source);
  return {
    nextStocks: [...untouched, ...incoming],
    added,
    replaced,
    retained,
    excluded,
    error: null,
  };
}
