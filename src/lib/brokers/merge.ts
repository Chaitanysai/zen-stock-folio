import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerProviderId, NormalizedHolding } from "./contracts";

/**
 * Merges broker holdings into the user's portfolio.
 *
 * Only rows carrying this connection's provenance key are updated. A manually
 * added row is never overwritten or removed, even when its ticker matches, so a
 * broker sync cannot silently destroy user-entered data.
 */

export const brokerHoldingKey = (
  provider: BrokerProviderId,
  connectionId: string,
  instrumentId: string,
): string => `${provider}:${connectionId}:${instrumentId}`;

export interface HoldingMergeResult {
  stocks: PortfolioStock[];
  added: number;
  updated: number;
  skipped: number;
}

export const mergeBrokerHoldings = (
  stocks: PortfolioStock[],
  provider: BrokerProviderId,
  connectionId: string,
  holdings: NormalizedHolding[],
  syncedAt: string,
): HoldingMergeResult => {
  const pending = new Map<string, NormalizedHolding>();
  for (const holding of holdings) {
    if (!Number.isFinite(holding.quantity) || holding.quantity <= 0) continue;
    pending.set(brokerHoldingKey(provider, connectionId, holding.instrumentId), holding);
  }
  const skipped = holdings.length - pending.size;

  let updated = 0;
  const next = stocks.map((stock) => {
    const key = stock.broker?.key;
    if (!key) return stock;
    const holding = pending.get(key);
    if (!holding) return stock;
    pending.delete(key);
    updated += 1;
    return {
      ...stock,
      quantity: holding.quantity,
      entryPrice: holding.averagePrice,
      cmp: holding.lastPrice ?? stock.cmp,
      status: "Active" as const,
      broker: {
        provider,
        connectionId,
        key,
        instrumentId: holding.instrumentId,
        ...(holding.isin ? { isin: holding.isin } : {}),
        ...(holding.exchange ? { exchange: holding.exchange } : {}),
        source: "holding" as const,
        quantity: holding.quantity,
        averagePrice: holding.averagePrice,
        lastSyncedAt: syncedAt,
      },
    };
  });

  const addedRows: PortfolioStock[] = [];
  for (const [key, holding] of pending) {
    const price = holding.lastPrice ?? holding.averagePrice;
    addedRows.push({
      ticker: holding.ticker,
      stockName: holding.ticker,
      entryDate: syncedAt.slice(0, 10),
      entryPrice: holding.averagePrice,
      cmp: price,
      weekHigh52: Math.max(price, holding.averagePrice),
      quantity: holding.quantity,
      status: "Active",
      broker: {
        provider,
        connectionId,
        key,
        instrumentId: holding.instrumentId,
        ...(holding.isin ? { isin: holding.isin } : {}),
        ...(holding.exchange ? { exchange: holding.exchange } : {}),
        source: "holding",
        quantity: holding.quantity,
        averagePrice: holding.averagePrice,
        lastSyncedAt: syncedAt,
      },
    });
  }

  return { stocks: [...next, ...addedRows], added: addedRows.length, updated, skipped };
};
