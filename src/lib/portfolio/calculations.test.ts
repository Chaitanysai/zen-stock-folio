import { describe, it, expect } from "vitest";
import {
  costBasis,
  marketValue,
  profitLoss,
  returnPercent,
  portfolioTotals,
  allocationBy,
  type Position,
} from "./calculations";

// Expected values below are worked by hand, not computed by the code under test.

describe("single position", () => {
  it("active: 10 @ 100 bought, cmp 120 -> cost 1000, value 1200, P/L +200, +20%", () => {
    const p: Position = { quantity: 10, entryPrice: 100, cmp: 120, status: "Active" };
    expect(costBasis(p)).toBe(1000);
    expect(marketValue(p)).toBe(1200);
    expect(profitLoss(p)).toBe(200);
    expect(returnPercent(p)).toBeCloseTo(20, 10);
  });

  it("active loss: 10 @ 100, cmp 80 -> P/L -200, -20%", () => {
    const p: Position = { quantity: 10, entryPrice: 100, cmp: 80, status: "Active" };
    expect(profitLoss(p)).toBe(-200);
    expect(returnPercent(p)).toBeCloseTo(-20, 10);
  });

  it("closed: value uses exitPrice, not cmp", () => {
    // 5 @ 200 bought, sold at 260; cmp is stale at 999 and must be ignored
    const p: Position = {
      quantity: 5,
      entryPrice: 200,
      cmp: 999,
      exitPrice: 260,
      status: "Sold Profit",
    };
    expect(marketValue(p)).toBe(1300);
    expect(profitLoss(p)).toBe(300); // 1300 - 1000
    expect(returnPercent(p)).toBeCloseTo(30, 10);
  });

  it("closed but missing exitPrice falls back to cmp (matches existing helper)", () => {
    const p: Position = { quantity: 2, entryPrice: 50, cmp: 60, status: "Sold Profit" };
    expect(marketValue(p)).toBe(120);
    expect(profitLoss(p)).toBe(20);
  });

  it("zero cost basis gives 0% return, never NaN or Infinity", () => {
    const p: Position = { quantity: 0, entryPrice: 100, cmp: 120, status: "Active" };
    expect(costBasis(p)).toBe(0);
    expect(profitLoss(p)).toBe(0);
    expect(returnPercent(p)).toBe(0);
  });

  it("break-even: cmp equals entry -> P/L 0, 0%", () => {
    const p: Position = { quantity: 7, entryPrice: 33.5, cmp: 33.5, status: "Active" };
    expect(profitLoss(p)).toBe(0);
    expect(returnPercent(p)).toBe(0);
  });
});

describe("portfolioTotals", () => {
  it("empty portfolio is all zeros", () => {
    expect(portfolioTotals([])).toEqual({
      invested: 0,
      currentValue: 0,
      profitLoss: 0,
      returnPercent: 0,
    });
  });

  it("mixed open and closed positions", () => {
    // A: 10 @ 100, cmp 120  -> cost 1000, value 1200,  P/L +200
    // B: 4 @ 250, cmp 200   -> cost 1000, value 800,   P/L -200
    // C: 5 @ 200, exit 260  -> cost 1000, value 1300,  P/L +300 (closed)
    const positions: Position[] = [
      { quantity: 10, entryPrice: 100, cmp: 120, status: "Active" },
      { quantity: 4, entryPrice: 250, cmp: 200, status: "Active" },
      { quantity: 5, entryPrice: 200, cmp: 999, exitPrice: 260, status: "Sold Profit" },
    ];
    const t = portfolioTotals(positions);
    expect(t.invested).toBe(3000);
    expect(t.currentValue).toBe(3300);
    expect(t.profitLoss).toBe(300);
    expect(t.returnPercent).toBeCloseTo(10, 10); // 300 / 3000
  });

  it("aggregate return is weighted by cost, not an average of per-position %", () => {
    // A: cost 100,  +100%  (value 200)
    // B: cost 9900, 0%     (value 9900)
    // Simple average of percentages would be 50%; true return is 100 / 10000 = 1%
    const positions: Position[] = [
      { quantity: 1, entryPrice: 100, cmp: 200, status: "Active" },
      { quantity: 99, entryPrice: 100, cmp: 100, status: "Active" },
    ];
    const t = portfolioTotals(positions);
    expect(t.invested).toBe(10000);
    expect(t.profitLoss).toBe(100);
    expect(t.returnPercent).toBeCloseTo(1, 10);
  });

  it("all-zero cost portfolio returns 0%, not NaN", () => {
    const positions: Position[] = [
      { quantity: 0, entryPrice: 100, cmp: 100, status: "Active" },
    ];
    expect(portfolioTotals(positions).returnPercent).toBe(0);
  });
});

describe("allocationBy", () => {
  const rows = [
    { ticker: "A", sector: "IT", value: 600 },
    { ticker: "B", sector: "Banking", value: 300 },
    { ticker: "C", sector: "IT", value: 100 },
  ];

  it("groups by key, sums values, and sorts by value descending", () => {
    const out = allocationBy(rows, r => r.sector, r => r.value);
    expect(out.map(s => s.key)).toEqual(["IT", "Banking"]);
    expect(out[0].value).toBe(700); // 600 + 100
    expect(out[1].value).toBe(300);
  });

  it("percentages are value ÷ grand total (1000) and sum to 100", () => {
    const out = allocationBy(rows, r => r.sector, r => r.value);
    expect(out[0].percent).toBeCloseTo(70, 10);
    expect(out[1].percent).toBeCloseTo(30, 10);
    const sum = out.reduce((s, x) => s + x.percent, 0);
    expect(sum).toBeCloseTo(100, 10);
  });

  it("all-zero total gives 0% per slice, not NaN", () => {
    const out = allocationBy(
      [{ s: "X", v: 0 }, { s: "Y", v: 0 }],
      r => r.s,
      r => r.v
    );
    expect(out.every(x => x.percent === 0)).toBe(true);
  });

  it("empty input gives empty output", () => {
    expect(allocationBy([], () => "x", () => 1)).toEqual([]);
  });
});
