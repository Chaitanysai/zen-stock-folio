import { describe, expect, it } from "vitest";
import type { FnOTrade, PortfolioStock } from "@/data/sampleData";
import {
  computeMetrics, dailyMovers, filterHoldings, realisedByMonth, sortHoldings, toHoldingRow,
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
    const m = computeMetrics([stock({ cmp: 110 })], [], { "NSE:AAA": { change: 2 } });
    expect(m.dayMove).toBe(20);
    expect(m.hasDayData).toBe(true);
    // previous value = 1100 − 20
    expect(m.dayMovePct).toBeCloseTo((20 / 1080) * 100);
  });

  it("keys quotes by market, so a bare ticker never matches", () => {
    const m = computeMetrics([stock({ cmp: 110 })], [], {
      AAA: { change: 2 },
      "US:AAA": { change: 5 },
    });
    expect(m.hasDayData).toBe(false);
    expect(m.dayMove).toBe(0);
  });

  it("excludes unpriced and unconvertible rows from every rupee total", () => {
    const rows = [
      stock({}),
      stock({ ticker: "NOPRICE", cmp: null as unknown as number }),
      stock({ ticker: "AAPL", market: "US", currency: "USD" }),
    ];
    const untimed = computeMetrics(rows, [], {}, new Date(), null);
    expect(untimed.current).toBe(1200);
    expect(untimed.invested).toBe(1000);
    expect(untimed.pricedCount).toBe(1);
    expect(untimed.unpricedCount).toBe(1);
    expect(untimed.fxIncomplete).toBe(true);

    const converted = computeMetrics(rows, [], {}, new Date(), 85);
    expect(converted.current).toBe(1200 + 1200 * 85);
    expect(converted.invested).toBe(1000 + 1000 * 85);
    expect(converted.pricedCount).toBe(2);
    expect(converted.fxIncomplete).toBe(false);
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

describe("dailyMovers", () => {
  it("picks the highest riser and deepest faller from per-holding day moves", () => {
    const rows = [
      stock({ ticker: "UP", cmp: 110, quantity: 10 }), // +₹100
      stock({ ticker: "BIG", cmp: 320, quantity: 10 }), // +₹200
      stock({ ticker: "DOWN", cmp: 90, quantity: 5 }), // −₹50
    ];
    const { gainer, loser, eligible, excluded } = dailyMovers(rows, {
      "NSE:UP": { change: 10, changePercent: 10 },
      "NSE:BIG": { change: 20, changePercent: 6.67 },
      "NSE:DOWN": { change: -10, changePercent: -10 },
    }, null);

    expect(eligible).toBe(3);
    expect(excluded).toBe(0);
    expect(gainer).toMatchObject({ key: "NSE:BIG", ticker: "BIG", dayPnl: 200, dayPct: 6.67 });
    expect(loser).toMatchObject({ key: "NSE:DOWN", ticker: "DOWN", dayPnl: -50, dayPct: -10 });
  });

  it("excludes rows with no quote change instead of treating them as flat", () => {
    const rows = [stock({ ticker: "QUOTED" }), stock({ ticker: "QUIET" })];
    const { gainer, loser, eligible, excluded } = dailyMovers(rows, { "NSE:QUOTED": { change: 3 } }, null);
    expect(eligible).toBe(1);
    expect(excluded).toBe(1);
    expect(gainer?.ticker).toBe("QUOTED");
    expect(loser).toBeNull();
  });

  it("converts a U.S. day move at the supplied rate and drops it without one", () => {
    const rows = [stock({ ticker: "AAPL", market: "US", currency: "USD", quantity: 2 })];
    const prices = { "US:AAPL": { change: 4, changePercent: 1.5 } };

    expect(dailyMovers(rows, prices, null)).toMatchObject({ gainer: null, eligible: 0, excluded: 1 });
    const converted = dailyMovers(rows, prices, 85);
    expect(converted.gainer).toMatchObject({ key: "US:AAPL", dayPnl: 4 * 2 * 85, dayPct: 1.5 });
  });

  it("reports no loser (or no gainer) rather than one with the wrong sign", () => {
    const up = dailyMovers([stock({ ticker: "UP" })], { "NSE:UP": { change: 2 } }, null);
    expect(up.gainer?.ticker).toBe("UP");
    expect(up.loser).toBeNull();

    const down = dailyMovers([stock({ ticker: "DOWN" })], { "NSE:DOWN": { change: -2 } }, null);
    expect(down.gainer).toBeNull();
    expect(down.loser?.ticker).toBe("DOWN");
  });

  it("ranks only open holdings", () => {
    const rows = [
      stock({ ticker: "CLOSED", status: "Sold Profit", exitPrice: 500 }),
      stock({ ticker: "OPEN" }),
    ];
    const { gainer, eligible } = dailyMovers(rows, {
      "NSE:CLOSED": { change: 50 },
      "NSE:OPEN": { change: 1 },
    }, null);
    expect(eligible).toBe(1);
    expect(gainer?.ticker).toBe("OPEN");
  });

  it("lists active holdings by day percentage with unknown quotes last", () => {
    const rows = [
      stock({ ticker: "DOWN", cmp: 90 }),
      stock({ ticker: "UP", cmp: 110 }),
      stock({ ticker: "QUIET" }),
      stock({ ticker: "CLOSED", status: "Sold Profit", exitPrice: 500 }),
    ];
    const { rows: changes } = dailyMovers(rows, {
      "NSE:UP": { change: 10, changePercent: 5 },
      "NSE:DOWN": { change: -5, changePercent: -3 },
      "NSE:CLOSED": { change: 50, changePercent: 12 },
    }, null);

    expect(changes.map((row) => [row.ticker, row.dayPct])).toEqual([
      ["UP", 5],
      ["DOWN", -3],
      ["QUIET", null],
    ]);
  });
});

describe("realisedByMonth", () => {
  it("returns no months, never a placeholder series, without closed trades", () => {
    expect(realisedByMonth([stock({})], [fno({})])).toEqual({ months: [], undated: 0, unscored: 0 });
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
