import { describe, expect, it } from "vitest";
import { brokerHoldingKey, mergeBrokerHoldings } from "./merge";
import type { PortfolioStock } from "@/data/sampleData";
import type { NormalizedHolding } from "./contracts";

const CONNECTION = "conn-1";
const SYNCED_AT = "2026-10-28T04:00:00.000Z";

const manual: PortfolioStock = {
  ticker: "INFY",
  stockName: "Infosys",
  entryDate: "2025-01-01",
  entryPrice: 100,
  cmp: 110,
  weekHigh52: 120,
  quantity: 3,
  status: "Active",
};

const synced: PortfolioStock = {
  ...manual,
  broker: {
    provider: "zerodha",
    connectionId: CONNECTION,
    key: brokerHoldingKey("zerodha", CONNECTION, "INE009A01021"),
    instrumentId: "INE009A01021",
    source: "holding",
    quantity: 10,
    averagePrice: 1500,
    lastSyncedAt: "2026-10-01T00:00:00.000Z",
  },
};

const otherConnection: PortfolioStock = {
  ...manual,
  broker: {
    provider: "groww",
    connectionId: "conn-2",
    key: brokerHoldingKey("groww", "conn-2", "INE002A01018"),
    instrumentId: "INE002A01018",
    source: "holding",
    quantity: 5,
    averagePrice: 2500,
    lastSyncedAt: "2026-10-01T00:00:00.000Z",
  },
};

const holding = (over: Partial<NormalizedHolding> = {}): NormalizedHolding => ({
  instrumentId: "INE009A01021",
  ticker: "INFY",
  exchange: "NSE",
  currency: "INR",
  quantity: 12,
  averagePrice: 1550,
  lastPrice: 1600,
  asOf: SYNCED_AT,
  ...over,
});

describe("mergeBrokerHoldings", () => {
  it("updates only rows carrying this connection's provenance", () => {
    const result = mergeBrokerHoldings(
      [manual, synced, otherConnection],
      "zerodha",
      CONNECTION,
      [holding()],
      SYNCED_AT,
    );

    expect(result.stocks).toHaveLength(3);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);

    const [nextManual, nextSynced, nextOther] = result.stocks;
    expect(nextManual).toBe(manual);
    expect(nextOther).toBe(otherConnection);
    expect(nextSynced).toMatchObject({
      ticker: "INFY",
      quantity: 12,
      entryPrice: 1550,
      cmp: 1600,
      status: "Active",
      broker: {
        provider: "zerodha",
        connectionId: CONNECTION,
        quantity: 12,
        averagePrice: 1550,
        lastSyncedAt: SYNCED_AT,
      },
    });
  });

  it("adds a new provenance row for a previously unseen holding", () => {
    const result = mergeBrokerHoldings(
      [manual],
      "zerodha",
      CONNECTION,
      [holding({ instrumentId: "INE002A01018", ticker: "RELIANCE", quantity: 7, averagePrice: 2500, lastPrice: undefined })],
      SYNCED_AT,
    );

    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.stocks).toHaveLength(2);
    const added = result.stocks[1];
    expect(added).toMatchObject({
      ticker: "RELIANCE",
      entryDate: "2026-10-28",
      entryPrice: 2500,
      cmp: 2500,
      weekHigh52: 2500,
      quantity: 7,
      status: "Active",
      broker: {
        provider: "zerodha",
        connectionId: CONNECTION,
        key: brokerHoldingKey("zerodha", CONNECTION, "INE002A01018"),
        instrumentId: "INE002A01018",
        source: "holding",
        quantity: 7,
        averagePrice: 2500,
        lastSyncedAt: SYNCED_AT,
      },
    });
  });

  it("skips non-positive quantities instead of importing a closed position", () => {
    const result = mergeBrokerHoldings(
      [],
      "zerodha",
      CONNECTION,
      [holding({ quantity: 0 }), holding({ instrumentId: "X", quantity: -4 })],
      SYNCED_AT,
    );

    expect(result.stocks).toHaveLength(0);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("keeps the existing cmp when the provider omits a last price", () => {
    const result = mergeBrokerHoldings(
      [synced],
      "zerodha",
      CONNECTION,
      [holding({ lastPrice: undefined })],
      SYNCED_AT,
    );

    expect(result.stocks[0].cmp).toBe(manual.cmp);
  });
});
