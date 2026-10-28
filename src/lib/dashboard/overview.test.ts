import { describe, expect, it } from "vitest";
import type { FnOTrade, PortfolioStock } from "@/data/sampleData";
import {
  computeMetrics, filterHoldings, realisedByMonth, sortHoldings, toHoldingRow,
} from "./overview";
import { compact, inr, signedInr, signedPct } from "./format";

const stock = (over: Partial<PortfolioStock>): PortfolioStock => ({
  ticker: "AAA", stockName: "Alpha", sector: "IT", entryDate: "01-Jan-2026", entryPrice: 100, cmp: 120,
  weekHigh52: 130, quantity: 10, status: "Active", ...over,
});
const fno = (over: Partial<FnOTrade>): FnOTrade => ({
  id: "f1", symbol: "NIFTY", instrumentType: "CE", strike: 100, expiry: "27-Mar-2026", lotSize: 10, lots: 1,
  entryPrice: 10, entryDate: "01-Mar-2026", status: "Open", ...over,
});

describe("computeMetrics", () => {
  it("values holdings from live prices and reports unrealised P&L on cost", () => {
    const m = computeMetrics([stock({}), stock({ ticker: "BBB", entryPrice: 200, cmp: 180, quantity: 5 })], [], {});
    expect(m.current).toBe(2100);
    expect(m.invested).toBe(2000);
    expect(m.pnl).toBe(100);
    expect(m.pnlPct).toBeCloseTo(5);
  });

  it("reports no day data, and no percentage, when quotes carry no change", () => {
    const m = computeMetrics([stock({})], [], {});
    expect(m.hasDayData).toBe(false);
    expect(m.dayMovePct).toBeNull();
    expect(m.todayPct).toBeNull();
  });

  it("derives the day move from received quote changes only", () => {
    const m = computeMetrics([stock({ cmp: 110 })], [], { AAA: { change: 2 } });
    expect(m.dayMove).toBe(20);
    expect(m.hasDayData).toBe(true);
    // previous value = 1100 − 20
    expect(m.dayMovePct).toBeCloseTo((20 / 1080) * 100);
  });

  it("has no win rate until a trade is closed, then counts equity and F&O", () => {
    expect(computeMetrics([stock({})], [], {}).winRate).toBeNull();
    const closed = [
      stock({ ticker: "W", status: "Sold Profit", exitPrice: 150, exitDate: "10-Feb-2026" }),
      stock({ ticker: "L", status: "Sold Loss", exitPrice: 80, exitDate: "11-Feb-2026" }),
    ];
    const m = computeMetrics(closed, [fno({ status: "Closed Profit", exitPrice: 20, exitDate: "12-Feb-2026" })], {});
    expect(m.closedCount).toBe(3);
    expect(m.wins).toBe(2);
    expect(m.winRate).toBeCloseTo((2 / 3) * 100);
  });
});

describe("realisedByMonth", () => {
  it("returns no months, never a placeholder series, without closed trades", () => {
    expect(realisedByMonth([stock({})], [fno({})])).toEqual({ months: [], undated: 0 });
  });

  it("sums closed equity and F&O by exit month and zero-fills the gap", () => {
    const { months, undated } = realisedByMonth(
      [
        stock({ ticker: "W", status: "Sold Profit", exitPrice: 150, exitDate: "10-Jan-2026" }), // +500
        stock({ ticker: "L", status: "Sold Loss", exitPrice: 90, exitDate: "20-Mar-2026" }), // −100
      ],
      [fno({ status: "Closed Profit", exitPrice: 20, exitDate: "21-Mar-2026" })], // +100
    );
    expect(undated).toBe(0);
    expect(months.map((m) => [m.label, m.value, m.trades])).toEqual([
      ["Jan '26", 500, 1],
      ["Feb '26", 0, 0],
      ["Mar '26", 0, 2],
    ]);
  });

  it("counts closed trades with no exit date instead of guessing a month", () => {
    const { months, undated } = realisedByMonth([stock({ status: "Sold Profit", exitPrice: 150 })], []);
    expect(months).toEqual([]);
    expect(undated).toBe(1);
  });

  it("keeps only the latest months", () => {
    const trades = Array.from({ length: 15 }, (_, i) =>
      stock({ ticker: `T${i}`, status: "Sold Profit", exitPrice: 150, exitDate: `5-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"][i]}-${i < 12 ? 2025 : 2026}` }),
    );
    const { months } = realisedByMonth(trades, [], 12);
    expect(months).toHaveLength(12);
    expect(months[months.length - 1].label).toBe("Mar '26");
  });
});

describe("holdings rows", () => {
  const rows = [
    toHoldingRow(stock({ ticker: "AAA", stockName: "Alpha", cmp: 120 })),
    toHoldingRow(stock({ ticker: "BBB", stockName: "Beta Bank", sector: "Banking", entryPrice: 200, cmp: 150, quantity: 2 })),
  ];

  it("filters by text across ticker, name and sector, and by gain or loss", () => {
    expect(filterHoldings(rows, "bank", "all").map((r) => r.ticker)).toEqual(["BBB"]);
    expect(filterHoldings(rows, "", "gain").map((r) => r.ticker)).toEqual(["AAA"]);
    expect(filterHoldings(rows, "", "loss").map((r) => r.ticker)).toEqual(["BBB"]);
  });

  it("sorts in both directions without mutating the input", () => {
    expect(sortHoldings(rows, "pnlPct", "desc").map((r) => r.ticker)).toEqual(["AAA", "BBB"]);
    expect(sortHoldings(rows, "pnlPct", "asc").map((r) => r.ticker)).toEqual(["BBB", "AAA"]);
    expect(sortHoldings(rows, "name", "asc").map((r) => r.ticker)).toEqual(["AAA", "BBB"]);
    expect(rows.map((r) => r.ticker)).toEqual(["AAA", "BBB"]);
  });
});

describe("format", () => {
  it("formats magnitudes and signs", () => {
    expect(inr(-123456)).toBe("₹1,23,456");
    expect(compact(2100)).toBe("₹2.1K");
    expect(compact(125000)).toBe("₹1.25L");
    expect(compact(12000000)).toBe("₹1.20Cr");
    expect(signedInr(100)).toBe("+₹100");
    expect(signedInr(-100)).toBe("−₹100");
    expect(signedInr(0)).toBe("₹0");
    expect(signedPct(5)).toBe("+5.0%");
    expect(signedPct(-2.34)).toBe("−2.3%");
    expect(signedPct(0)).toBe("0.0%");
  });
});
