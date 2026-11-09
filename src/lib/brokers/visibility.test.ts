import { describe, expect, it } from "vitest";
import type { BrokerConnectionPublic, BrokerProviderId } from "./contracts";
import { disconnectedConnectionIds, filterDisconnectedStocks, visibleStockIndices } from "./visibility";
import type { PortfolioStock } from "@/data/sampleData";

const connection = (
  id: string,
  status: BrokerConnectionPublic["status"],
  provider: BrokerProviderId = "groww",
): BrokerConnectionPublic => ({
  id,
  provider,
  method: "api_keys",
  displayName: id,
  status,
  permissions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  lastTestedAt: null,
  lastSuccessfulSyncAt: null,
  tokenExpiresAt: null,
  lastErrorCode: null,
  disconnectedAt: status === "disconnected" ? "2026-01-03T00:00:00.000Z" : null,
  lastSync: null,
});

const synced = (
  ticker: string,
  connectionId: string,
  provider: BrokerProviderId = "groww",
): PortfolioStock => ({
  ticker,
  stockName: ticker,
  entryPrice: 100,
  cmp: 110,
  quantity: 10,
  status: "Active",
  broker: {
    provider,
    connectionId,
    key: `${provider}:${connectionId}:${ticker}`,
    instrumentId: ticker,
    source: "holding",
    quantity: 10,
    averagePrice: 100,
    lastSyncedAt: "2026-01-02T00:00:00.000Z",
  },
});

const manual = (ticker: string): PortfolioStock => ({
  ticker,
  stockName: ticker,
  entryPrice: 100,
  cmp: 110,
  quantity: 5,
  status: "Active",
});

describe("disconnectedConnectionIds", () => {
  it("collects only explicitly disconnected connections", () => {
    const ids = disconnectedConnectionIds([
      connection("a", "connected"),
      connection("b", "disconnected"),
      connection("c", "error"),
      connection("d", "reauthorization_required"),
      connection("e", "disconnected"),
    ]);
    expect([...ids]).toEqual(["b", "e"]);
  });

  it("is empty for an empty list", () => {
    expect(disconnectedConnectionIds([]).size).toBe(0);
  });
});

describe("visibleStockIndices", () => {
  it("keeps every index when nothing is disconnected", () => {
    const stocks = [synced("A", "conn-1"), manual("B"), synced("C", "conn-1")];
    expect(visibleStockIndices(stocks, [connection("conn-1", "connected")])).toEqual([0, 1, 2]);
  });

  it("drops only the disconnected connection's rows and keeps stored order", () => {
    const stocks = [
      synced("GROWW1", "groww-conn"),
      manual("MANUAL"),
      synced("ZERODHA1", "zerodha-conn", "zerodha"),
      synced("GROWW2", "groww-conn"),
    ];
    const indices = visibleStockIndices(stocks, [
      connection("groww-conn", "disconnected"),
      connection("zerodha-conn", "connected", "zerodha"),
    ]);
    expect(indices).toEqual([1, 2]);
  });

  it("keeps a row whose connection is absent from the list", () => {
    // Absence is not a disconnect: hiding unknown rows would blank the
    // dashboard whenever the connection list failed to load.
    const stocks = [synced("ORPHAN", "unknown-conn")];
    expect(visibleStockIndices(stocks, [])).toEqual([0]);
    expect(visibleStockIndices(stocks, [connection("other", "disconnected")])).toEqual([0]);
  });

  it("never hides manual or statement rows that carry no provenance", () => {
    const stocks = [manual("A"), manual("B")];
    expect(visibleStockIndices(stocks, [connection("groww-conn", "disconnected")])).toEqual([0, 1]);
  });

  it("keeps rows of a broker that is merely in error", () => {
    // A failing session is still the user's account; only a disconnect hides.
    const stocks = [synced("A", "groww-conn")];
    expect(visibleStockIndices(stocks, [connection("groww-conn", "error")])).toEqual([0]);
  });

  it("hides rows from every disconnected connection, not just one provider", () => {
    const stocks = [
      synced("G1", "groww-conn"),
      synced("Z1", "zerodha-conn", "zerodha"),
      synced("U1", "upstox-conn", "upstox"),
    ];
    const indices = visibleStockIndices(stocks, [
      connection("groww-conn", "disconnected"),
      connection("zerodha-conn", "disconnected", "zerodha"),
      connection("upstox-conn", "connected", "upstox"),
    ]);
    expect(indices).toEqual([2]);
  });
});

describe("filterDisconnectedStocks", () => {
  it("returns the same rows when nothing is disconnected", () => {
    const stocks = [synced("A", "conn-1"), manual("B")];
    const result = filterDisconnectedStocks(stocks, [connection("conn-1", "connected")]);
    expect(result).toEqual(stocks);
  });

  it("does not mutate the stored snapshot", () => {
    const stocks = [synced("G1", "groww-conn"), manual("MANUAL")];
    const copy = [...stocks];
    filterDisconnectedStocks(stocks, [connection("groww-conn", "disconnected")]);
    expect(stocks).toEqual(copy);
    expect(stocks).toHaveLength(2);
  });

  it("returns a copy, never the caller's array, so callers cannot alias state", () => {
    const stocks = [manual("A")];
    const result = filterDisconnectedStocks(stocks, []);
    expect(result).not.toBe(stocks);
    expect(result).toEqual(stocks);
  });

  it("hides a disconnected account's rows while keeping every other row", () => {
    const stocks = [
      synced("G1", "groww-conn"),
      manual("MANUAL"),
      synced("Z1", "zerodha-conn", "zerodha"),
    ];
    const result = filterDisconnectedStocks(stocks, [
      connection("groww-conn", "disconnected"),
      connection("zerodha-conn", "connected", "zerodha"),
    ]);
    expect(result.map((row) => row.ticker)).toEqual(["MANUAL", "Z1"]);
  });
});
