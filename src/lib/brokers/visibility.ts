import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerConnectionPublic } from "./contracts";

/**
 * Read-side visibility for broker-synced rows.
 *
 * Disconnecting a broker is a *read* boundary, not a delete. The server keeps
 * the connection record with a terminal `disconnected` status, and every row a
 * sync wrote keeps the provenance that wrote it (`broker.connectionId`). Pairing
 * those two facts lets the dashboard stop presenting an account's data the
 * moment it is disconnected, while the stored snapshot keeps every row: nothing
 * is destroyed, so history and a later export stay intact, and no other
 * broker's rows are touched.
 *
 * Only an explicit disconnect hides rows. A connection that is merely
 * `error`, `reauthorization_required` or `temporarily_unavailable` is still the
 * user's account, so its rows keep showing.
 */

/** Connection ids whose rows must no longer be presented as live portfolio data. */
export const disconnectedConnectionIds = (
  connections: readonly BrokerConnectionPublic[],
): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const connection of connections) {
    if (connection.status === "disconnected") ids.add(connection.id);
  }
  return ids;
};

/**
 * Indices into `stocks` that survive the disconnect filter.
 *
 * Indices, not a filtered array, are what the dashboard needs: the lot editor
 * addresses a stored row by position, so a filtered copy has to keep a mapping
 * back to the row it came from.
 *
 * A row without provenance is always kept, and so is a row whose connection is
 * absent from the list. An unknown connection is not evidence of a disconnect,
 * and hiding rows before the connection list has loaded would blank the
 * dashboard for every user.
 */
export const visibleStockIndices = (
  stocks: readonly PortfolioStock[],
  connections: readonly BrokerConnectionPublic[],
): number[] => {
  const hidden = disconnectedConnectionIds(connections);
  const indices: number[] = [];
  stocks.forEach((stock, index) => {
    const connectionId = stock.broker?.connectionId;
    if (connectionId === undefined || !hidden.has(connectionId)) indices.push(index);
  });
  return indices;
};

/** The stored rows that should still be presented for a set of connections. */
export const filterDisconnectedStocks = (
  stocks: readonly PortfolioStock[],
  connections: readonly BrokerConnectionPublic[],
): PortfolioStock[] => {
  const indices = visibleStockIndices(stocks, connections);
  if (indices.length === stocks.length) return [...stocks];
  return indices.map((index) => stocks[index]);
};
