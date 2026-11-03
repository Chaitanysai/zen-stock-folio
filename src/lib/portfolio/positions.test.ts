/**
 * Canonical position engine.
 *
 * Every case here is a rule the UI depends on: a sold unit is never re-valued at
 * CMP, an unknown cost never becomes zero, an old entry date never closes a
 * position, and a partial sale keeps its realised and unrealised halves apart.
 */

import { describe, expect, it } from "vitest";
import type { PortfolioStock } from "../../data/sampleData.ts";
import {
  buildPositions,
  filterPositions,
  outcomeDistribution,
  positionFact,
  positionInrFactor,
  positionTotalPnl,
  previewImportLifecycle,
  realisedByMonthFromPositions,
  sortPositions,
  sourceBreakdown,
  statementDiscrepancies,
  summarisePositions,
  unrealisedByHolding,
  type Position,
} from "./positions.ts";

function lot(overrides: Partial<PortfolioStock> = {}): PortfolioStock {
  return {
    ticker: "RELIANCE",
    stockName: "Reliance Industries",
    entryPrice: 100,
    cmp: 120,
    quantity: 10,
    status: "Active",
    source: "manual",
    market: "NSE",
    currency: "INR",
    ...overrides,
  };
}

function build(stocks: PortfolioStock[]) {
  return buildPositions(stocks);
}

function one(stocks: PortfolioStock[]): Position {
  const { positions } = build(stocks);
  expect(positions).toHaveLength(1);
  return positions[0];
}

describe("buildPositions", () => {
  it("groups lots by source, market and ticker", () => {
    const { positions } = build([
      lot({ ticker: "RELIANCE" }),
      lot({ ticker: "RELIANCE", source: "zerodha" }),
      lot({ ticker: "RELIANCE", market: "US", currency: "USD" }),
      lot({ ticker: "TCS" }),
    ]);
    expect(positions.map((p) => p.key).sort()).toEqual([
      "manual:NSE:RELIANCE",
      "manual:NSE:TCS",
      "manual:US:RELIANCE",
      "zerodha:NSE:RELIANCE",
    ]);
  });

  it("derives an active position from a positive remaining quantity", () => {
    const position = one([lot({ quantity: 10, entryPrice: 100, cmp: 120 })]);
    expect(position.status).toBe("active");
    expect(position.boughtQty).toBe(10);
    expect(position.soldQty).toBe(0);
    expect(position.remainingQty).toBe(10);
    expect(position.unrealised).toBe(200);
    expect(position.realised).toBeNull();
    expect(position.marketValue).toBe(1200);
    expect(position.price).toBe(120);
  });

  it("values a closed lot at its exit price, never its CMP", () => {
    const position = one([
      lot({ status: "Sold Profit", quantity: 10, entryPrice: 100, exitPrice: 110, cmp: 500 }),
    ]);
    expect(position.status).toBe("closed");
    expect(position.realised).toBe(100);
    expect(position.unrealised).toBe(0);
    expect(position.marketValue).toBe(0);
    expect(position.price).toBeNull();
  });

  it("keeps a partial sale's realised and remaining halves separate", () => {
    const position = one([
      lot({ status: "Sold Profit", quantity: 4, entryPrice: 100, exitPrice: 130 }),
      lot({ quantity: 6, entryPrice: 100, cmp: 120 }),
    ]);
    expect(position.status).toBe("partial");
    expect(position.boughtQty).toBe(10);
    expect(position.soldQty).toBe(4);
    expect(position.remainingQty).toBe(6);
    expect(position.realised).toBe(120);
    expect(position.unrealised).toBe(120);
    expect(positionTotalPnl(position)).toBe(240);
  });

  it("never treats an unknown cost as zero", () => {
    const position = one([lot({ entryPrice: null, cmp: 120, quantity: 10 })]);
    expect(position.status).toBe("active");
    expect(position.invested).toBe(0);
    expect(position.investedUnknownLots).toBe(1);
    expect(position.unrealised).toBeNull();
    expect(position.marketValue).toBe(1200);
    expect(positionTotalPnl(position)).toBeNull();
    expect(position.avgBuy).toBeNull();
  });

  it("treats a zero CMP as no price, not as a free position", () => {
    const position = one([lot({ cmp: 0, entryPrice: 100, quantity: 10 })]);
    expect(position.marketValue).toBeNull();
    expect(position.unrealised).toBeNull();
    expect(position.price).toBeNull();
  });

  it("uses the statement's reported realised P&L when the price pair is incomplete", () => {
    const position = one([
      lot({ status: "Sold", quantity: 10, entryPrice: null, exitPrice: 110, statementPnl: 95 }),
    ]);
    const [detail] = position.lots;
    expect(detail.realised).toBe(95);
    expect(detail.realisedBasis).toBe("reported");
    expect(position.realised).toBe(95);
    expect(position.status).toBe("closed");
  });

  it("marks a closed position historical-unvalued when no realised result can be derived", () => {
    const position = one([
      lot({ status: "Sold", quantity: 10, entryPrice: null, exitPrice: undefined }),
    ]);
    expect(position.status).toBe("unvalued");
    expect(position.realised).toBeNull();
    expect(position.realisedUnknownLots).toBe(1);
  });

  it("never closes an old position because its entry date is old", () => {
    const position = one([lot({ entryDate: "10-Jan-2015", status: "Active" })]);
    expect(position.status).toBe("active");
    expect(position.remainingQty).toBe(10);
  });

  it("weights averages and voids them when a contributing lot is incomplete", () => {
    const weighted = one([
      lot({ status: "Sold Profit", quantity: 5, entryPrice: 100, exitPrice: 120 }),
      lot({ quantity: 5, entryPrice: 200, cmp: 220 }),
    ]);
    expect(weighted.avgBuy).toBe(150);
    expect(weighted.avgSell).toBe(120);

    const incomplete = one([
      lot({ status: "Sold Profit", quantity: 5, entryPrice: 100, exitPrice: 120 }),
      lot({ quantity: 5, entryPrice: null, cmp: 220 }),
    ]);
    expect(incomplete.avgBuy).toBeNull();
  });

  it("counts unusable rows as issues instead of inventing positions", () => {
    const { positions, issues } = build([
      lot({ ticker: "" }),
      lot({ quantity: 0 }),
      lot({ quantity: Number.NaN }),
      lot({ ticker: "TCS" }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("TCS");
    expect(issues).toHaveLength(3);
  });

  it("keeps the earliest entry and latest exit date, leaving absent dates absent", () => {
    const position = one([
      lot({ status: "Sold Profit", quantity: 2, entryDate: "1-Feb-2025", exitDate: "3-Mar-2025" }),
      lot({ status: "Sold Loss", quantity: 2, entryDate: "10-Jan-2025", exitDate: "20-Apr-2025" }),
      lot({ quantity: 2, entryDate: undefined }),
    ]);
    expect(position.firstEntryDate).toBe("10-Jan-2025");
    expect(position.lastExitDate).toBe("20-Apr-2025");
    expect(position.lots.some((detail) => detail.stock.entryDate === undefined)).toBe(true);
  });
});

describe("summarisePositions", () => {
  it("reports invested, market value, realised, unrealised and combined once each", () => {
    const { positions } = build([
      lot({ ticker: "RELIANCE", status: "Sold Profit", quantity: 4, entryPrice: 100, exitPrice: 130 }),
      lot({ ticker: "RELIANCE", quantity: 6, entryPrice: 100, cmp: 120 }),
      lot({ ticker: "TCS", quantity: 2, entryPrice: 300, cmp: 280 }),
    ]);
    const summary = summarisePositions(positions, null);
    // 400 + 600 + 600 invested; 720 + 560 market value; 120 realised; 120 - 40 unrealised.
    expect(summary.totalInvested).toBe(1600);
    expect(summary.marketValue).toBe(1280);
    expect(summary.realised).toBe(120);
    expect(summary.unrealised).toBe(80);
    expect(summary.combined).toBe(200);
    expect(summary.activePositions).toBe(2);
    expect(summary.partialPositions).toBe(1);
    expect(summary.closedPositions).toBe(0);
    expect(summary.historicalTransactions).toBe(3);
  });

  it("discloses every excluded lot instead of folding it in as zero", () => {
    const { positions } = build([
      lot({ ticker: "A", entryPrice: null, cmp: 0 }),
      lot({ ticker: "B", status: "Sold", entryPrice: null, exitPrice: undefined }),
    ]);
    const summary = summarisePositions(positions, null);
    expect(summary.totalInvested).toBe(0);
    expect(summary.investedUnknownLots).toBe(2);
    expect(summary.unpricedPositions).toBe(1);
    expect(summary.unrealisedExcluded).toBe(1);
    expect(summary.realised).toBe(0);
    expect(summary.realisedExcluded).toBe(1);
    expect(summary.unvaluedPositions).toBe(1);
  });

  it("excludes a USD position without a rate and counts it", () => {
    const { positions } = build([
      lot({ market: "US", currency: "USD", quantity: 2, entryPrice: 50, cmp: 60 }),
      lot({ ticker: "TCS", quantity: 1, entryPrice: 100, cmp: 110 }),
    ]);
    const excluded = summarisePositions(positions, null);
    expect(excluded.totalInvested).toBe(100);
    expect(excluded.marketValue).toBe(110);
    expect(excluded.fxExcluded).toBe(1);

    const converted = summarisePositions(positions, 80);
    expect(converted.totalInvested).toBe(100 + 2 * 50 * 80);
    expect(converted.marketValue).toBe(110 + 2 * 60 * 80);
    expect(converted.unrealised).toBe(10 + 2 * 10 * 80);
    expect(converted.fxExcluded).toBe(0);
  });
});

describe("positionInrFactor and positionFact", () => {
  it("converts USD only when a finite positive rate exists", () => {
    expect(positionInrFactor({ currency: "INR" }, null)).toBe(1);
    expect(positionInrFactor({ currency: "USD" }, null)).toBeNull();
    expect(positionInrFactor({ currency: "USD" }, 0)).toBeNull();
    expect(positionInrFactor({ currency: "USD" }, 83.5)).toBe(83.5);
  });

  it("multiplies a known native figure and leaves an unknown one unknown", () => {
    expect(positionFact(120, 83.5)).toBe(120 * 83.5);
    expect(positionFact(null, 83.5)).toBeNull();
  });
});

describe("realisedByMonthFromPositions", () => {
  it("groups realised results by exit month and counts undated and unscoreable lots", () => {
    const { positions } = build([
      lot({ ticker: "A", status: "Sold Profit", quantity: 1, entryPrice: 100, exitPrice: 110, exitDate: "5-Jan-2025" }),
      lot({ ticker: "B", status: "Sold Loss", quantity: 1, entryPrice: 100, exitPrice: 90, exitDate: "20-Feb-2025" }),
      lot({ ticker: "C", status: "Sold Profit", quantity: 1, entryPrice: 100, exitPrice: 110 }),
      lot({ ticker: "D", status: "Sold", quantity: 1, entryPrice: null }),
    ]);
    const result = realisedByMonthFromPositions(positions, null);
    expect(result.months.map((month) => [month.key, month.value, month.trades])).toEqual([
      ["2025-01", 10, 1],
      ["2025-02", -10, 1],
    ]);
    expect(result.undated).toBe(1);
    expect(result.unscoreable).toBe(1);
  });
});

describe("unrealisedByHolding", () => {
  it("ranks open positions by absolute unrealised P&L and excludes the unknown", () => {
    const { positions } = build([
      lot({ ticker: "A", quantity: 1, entryPrice: 100, cmp: 300 }),
      lot({ ticker: "B", quantity: 1, entryPrice: 100, cmp: 20 }),
      lot({ ticker: "C", quantity: 1, entryPrice: null, cmp: 120 }),
      lot({ ticker: "D", status: "Sold Profit", quantity: 1, entryPrice: 100, exitPrice: 150 }),
    ]);
    const result = unrealisedByHolding(positions, null);
    expect(result.holdings.map((row) => [row.ticker, row.value])).toEqual([
      ["B", -80],
      ["A", 200],
    ].sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)));
    expect(result.excluded).toBe(1);
  });
});

describe("outcomeDistribution", () => {
  it("counts scored lots, keeps unknown results out of the win rate, and nets the amounts", () => {
    const { positions } = build([
      lot({ status: "Sold Profit", quantity: 1, entryPrice: 100, exitPrice: 150 }),
      lot({ status: "Sold Profit", quantity: 1, entryPrice: 100, exitPrice: 100 }),
      lot({ status: "Sold Loss", quantity: 1, entryPrice: 100, exitPrice: 70 }),
      lot({ status: "Sold", quantity: 1, entryPrice: null }),
      lot({ quantity: 5, entryPrice: 100, cmp: 120 }),
    ]);
    const result = outcomeDistribution(positions, null);
    expect(result).toMatchObject({
      wins: 1, breakEven: 1, losses: 1, unknown: 1,
      grossProfit: 50, grossLoss: -30, net: 20,
    });
  });
});

describe("sourceBreakdown", () => {
  it("keeps each broker's totals separate", () => {
    const { positions } = build([
      lot({ ticker: "A", source: "groww", quantity: 1, entryPrice: 100, cmp: 120 }),
      lot({ ticker: "B", source: "zerodha", quantity: 1, status: "Sold Profit", entryPrice: 100, exitPrice: 130 }),
      lot({ ticker: "C", source: "zerodha", quantity: 1, entryPrice: null, cmp: 0 }),
    ]);
    const rows = sourceBreakdown(positions, null);
    expect(rows.map((row) => [row.source, row.invested, row.realised])).toEqual([
      ["groww", 100, null],
      ["zerodha", 100, 30],
    ]);
    expect(rows[0].label).toBe("Groww");
    expect(rows[1].positions).toBe(2);
  });
});

describe("filterPositions and sortPositions", () => {
  const { positions } = build([
    lot({ ticker: "ALPHA", stockName: "Alpha Ltd", entryPrice: 100, cmp: 150, entryDate: "2-Jan-2025" }),
    lot({ ticker: "BETA", stockName: "Beta Ltd", entryPrice: 100, cmp: 80, entryDate: "10-Mar-2026" }),
    lot({ ticker: "GAMMA", stockName: "Gamma Ltd", status: "Sold Profit", entryPrice: 100, exitPrice: 130, exitDate: "5-Jun-2025" }),
    lot({ ticker: "DELTA", stockName: "Delta Ltd", entryPrice: null, cmp: 110, entryDate: "5-Jun-2025" }),
    lot({ ticker: "OMEGA", stockName: "Omega Ltd", entryPrice: 100, cmp: 100, entryDate: "7-Jul-2025" }),
  ]);

  it("filters by lifecycle, outcome, unknown cost, broker, query and date", () => {
    expect(filterPositions(positions, { filter: "active" }).map((p) => p.ticker)).toEqual(["ALPHA", "BETA", "DELTA", "OMEGA"]);
    expect(filterPositions(positions, { filter: "closed" }).map((p) => p.ticker)).toEqual(["GAMMA"]);
    expect(filterPositions(positions, { filter: "realised-gain" }).map((p) => p.ticker)).toEqual(["GAMMA"]);
    expect(filterPositions(positions, { filter: "unrealised-loss" }).map((p) => p.ticker)).toEqual(["BETA"]);
    expect(filterPositions(positions, { filter: "unknown-cost" }).map((p) => p.ticker)).toEqual(["DELTA"]);
    expect(filterPositions(positions, { query: "beta" }).map((p) => p.ticker)).toEqual(["BETA"]);
    expect(filterPositions(positions, { from: "2025-06-01", to: "2025-06-30" }).map((p) => p.ticker)).toEqual(["DELTA", "GAMMA"]);
    expect(filterPositions(positions, { broker: "manual" })).toHaveLength(5);
    expect(filterPositions(positions, { broker: "groww" })).toHaveLength(0);
  });

  it("sorts numeric fields with unknown values last in both directions", () => {
    // Closed positions have nothing held, so their unrealised result is an exact
    // zero — it ranks with the flat positions rather than as an unknown.
    expect(sortPositions(positions, "unrealised", "desc").map((p) => p.ticker)).toEqual([
      "ALPHA", "GAMMA", "OMEGA", "BETA", "DELTA",
    ]);
    expect(sortPositions(positions, "unrealised", "asc").map((p) => p.ticker)).toEqual([
      "BETA", "GAMMA", "OMEGA", "ALPHA", "DELTA",
    ]);
  });
});

describe("statementDiscrepancies", () => {
  it("surfaces a reported-vs-computed difference without replacing the computed value", () => {
    const rows = [
      lot({ status: "Sold Profit", quantity: 10, entryPrice: 100, exitPrice: 120, statementPnl: 190 }),
      lot({ ticker: "TCS", stockName: "TCS", status: "Sold Profit", quantity: 10, entryPrice: 100, exitPrice: 120, statementPnl: 200 }),
      lot({ ticker: "INFY", stockName: "Infosys", status: "Sold Profit", quantity: 10, entryPrice: 100, exitPrice: 120 }),
    ];
    const result = statementDiscrepancies(rows);
    expect(result.checked).toBe(2);
    expect(result.differing).toHaveLength(1);
    expect(result.differing[0].ticker).toBe("RELIANCE");
    expect(result.differing[0].delta).toBe(-10);
    expect(result.totalDelta).toBe(-10);
  });
});

describe("previewImportLifecycle", () => {
  it("counts lifecycle states with the same engine the dashboard uses", () => {
    const preview = previewImportLifecycle([
      lot({ ticker: "A", quantity: 5, entryPrice: 100, cmp: 120, entryDate: "1-Jan-2025" }),
      lot({ ticker: "B", status: "Sold Profit", quantity: 3, entryPrice: 100, exitPrice: 110, entryDate: "1-Jan-2025" }),
      lot({ ticker: "B", quantity: 2, entryPrice: 100, cmp: 120, entryDate: "1-Feb-2025" }),
      lot({ ticker: "C", status: "Sold", quantity: 1, entryPrice: null, entryDate: "1-Mar-2025" }),
      lot({ ticker: "D", entryPrice: null, entryDate: undefined, cmp: 0 }),
    ]);
    expect(preview).toEqual({
      totalLots: 5,
      openLots: 3,
      closedLots: 2,
      activePositions: 2,
      partialPositions: 1,
      closedPositions: 1,
      unvaluedPositions: 1,
      unknownCostLots: 2,
      missingDateLots: 1,
      closedWithoutPnlLots: 1,
    });
  });
});
