import { describe, expect, it } from "vitest";
import type { Execution } from "../data/snapshotTypes.ts";
import { aggregateClosedLots, deriveClosedLots, formatTradeDate } from "./fifo.ts";

const fill = (over: Partial<Execution> = {}): Execution => ({
  id: "x",
  source: "indmoney",
  market: "NSE",
  ticker: "RELIANCE",
  side: "BUY",
  quantity: 1,
  price: 100,
  executedAt: "2026-01-01T04:30:00.000Z",
  currency: "INR",
  ...over,
});

describe("formatTradeDate", () => {
  it("renders the IST calendar date in the dashboard's DD-MMM-YYYY format", () => {
    expect(formatTradeDate("2026-01-10T04:30:00.000Z")).toBe("10-Jan-2026");
  });

  it("rolls over at IST midnight, not UTC midnight", () => {
    expect(formatTradeDate("2026-01-10T18:45:00.000Z")).toBe("11-Jan-2026");
  });
});

describe("deriveClosedLots", () => {
  it("matches a sell against the oldest buys and weights a split sell", () => {
    const lots = deriveClosedLots([
      fill({ id: "b1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
      fill({ id: "b2", quantity: 5, price: 130, executedAt: "2026-02-01T04:30:00.000Z" }),
      fill({ id: "s1", side: "SELL", quantity: 12, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
    ]);

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      ticker: "RELIANCE",
      quantity: 12,
      sellPrice: 150,
      boughtOn: "2026-01-01T04:30:00.000Z",
      soldOn: "2026-03-01T04:30:00.000Z",
    });
    expect(lots[0].averageBuyPrice).toBeCloseTo((10 * 100 + 2 * 130) / 12);
  });

  it("reports an oversell instead of inventing a lot", () => {
    const warnings: string[] = [];
    const lots = deriveClosedLots(
      [
        fill({ id: "b1", quantity: 3, price: 100 }),
        fill({ id: "s1", side: "SELL", quantity: 5, price: 90, executedAt: "2026-02-01T04:30:00.000Z" }),
      ],
      warnings,
    );

    expect(lots[0].quantity).toBe(3);
    expect(warnings[0]).toContain("2 more share(s)");
  });

  it("orders same-timestamp ids numerically, independent of input order", () => {
    const at = "2026-01-01T04:30:00.000Z";
    const buy10 = fill({ id: "indmoney:10", price: 200, executedAt: at });
    const buy9 = fill({ id: "indmoney:9", price: 100, executedAt: at });
    const sell = fill({
      id: "indmoney:S1",
      side: "SELL",
      quantity: 1,
      price: 150,
      executedAt: "2026-02-01T04:30:00.000Z",
    });

    expect(deriveClosedLots([buy10, buy9, sell])[0].averageBuyPrice).toBe(100);
    expect(deriveClosedLots([buy9, buy10, sell])[0].averageBuyPrice).toBe(100);
  });

  it("orders same-timestamp trade ids numerically so T2 precedes T10", () => {
    const at = "2026-01-01T04:30:00.000Z";
    const buy2 = fill({ id: "indmoney:T2", price: 100, executedAt: at });
    const buy10 = fill({ id: "indmoney:T10", price: 200, executedAt: at });
    const sell = fill({ id: "indmoney:S1", side: "SELL", quantity: 1, price: 150, executedAt: "2026-02-01T04:30:00.000Z" });

    expect(deriveClosedLots([buy10, buy2, sell])[0].averageBuyPrice).toBe(100);
    expect(deriveClosedLots([buy2, buy10, sell])[0].averageBuyPrice).toBe(100);
  });

  it("breaks ties the numeric collator treats as equal by raw id", () => {
    const at = "2026-01-01T04:30:00.000Z";
    const leadingZero = fill({ id: "indmoney:T02", price: 120, executedAt: at });
    const plain = fill({ id: "indmoney:T2", price: 100, executedAt: at });
    const sell = fill({ id: "indmoney:S1", side: "SELL", quantity: 1, price: 150, executedAt: "2026-02-01T04:30:00.000Z" });

    expect(deriveClosedLots([plain, leadingZero, sell])[0].averageBuyPrice).toBe(120);
    expect(deriveClosedLots([leadingZero, plain, sell])[0].averageBuyPrice).toBe(120);
  });
});

describe("aggregateClosedLots", () => {
  it("collapses multiple matched lots into one row with weighted prices", () => {
    const rows = aggregateClosedLots([
      { ticker: "TCS", quantity: 2, averageBuyPrice: 100, sellPrice: 120, boughtOn: "2026-01-01T04:30:00.000Z", soldOn: "2026-02-01T04:30:00.000Z" },
      { ticker: "TCS", quantity: 6, averageBuyPrice: 110, sellPrice: 130, boughtOn: "2026-03-01T04:30:00.000Z", soldOn: "2026-04-01T04:30:00.000Z" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticker: "TCS", quantity: 8, soldOn: "2026-04-01T04:30:00.000Z" });
    expect(rows[0].averageBuyPrice).toBeCloseTo((2 * 100 + 6 * 110) / 8);
    expect(rows[0].sellPrice).toBeCloseTo((2 * 120 + 6 * 130) / 8);
  });
});
