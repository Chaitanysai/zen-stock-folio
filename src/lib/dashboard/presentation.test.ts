/**
 * Dashboard honesty rules.
 *
 * Each case is a defect that was present on the Dashboard before this pass:
 * a missing CMP shown as ₹0, a stored CMP indistinguishable from a quote, a
 * manually entered RSI coloured as a gain/loss, a stored F&O premium labelled
 * as a live LTP, and an invented "momentum score".
 */

import { describe, expect, it } from "vitest";
import {
  bestPerformer,
  describeAiTeaser,
  formatStoredPrice,
  formatStoredRsi,
  resolveFnoPremium,
} from "./presentation";
import type { PortfolioStock } from "@/data/sampleData";

function stock(overrides: Partial<PortfolioStock> = {}): PortfolioStock {
  return {
    ticker: "RELIANCE",
    stockName: "Reliance Industries",
    sector: "Energy",
    entryDate: "2026-01-10",
    entryPrice: 2450,
    cmp: 2612.35,
    weekHigh52: 2856.15,
    weekLow52: 2220,
    quantity: 15,
    status: "Active",
    ...overrides,
  } as PortfolioStock;
}

describe("formatStoredPrice", () => {
  it("never renders a missing stored CMP as ₹0", () => {
    expect(formatStoredPrice(undefined)).toBe("—");
    expect(formatStoredPrice(null)).toBe("—");
    expect(formatStoredPrice(0)).toBe("—");
  });

  it("marks a stored CMP so it cannot pass for a live quote", () => {
    expect(formatStoredPrice(1201.8)).toBe("₹1,201.8*");
  });
});

describe("formatStoredRsi", () => {
  it("shows the level without a sign, because RSI has no direction here", () => {
    expect(formatStoredRsi(58.4)).toBe("RSI 58");
  });

  it("reports a missing RSI as missing", () => {
    expect(formatStoredRsi(undefined)).toBe("RSI —");
    expect(formatStoredRsi(0)).toBe("RSI —");
  });
});

describe("resolveFnoPremium", () => {
  it("marks a fetched premium as live", () => {
    expect(resolveFnoPremium(35.5, 40)).toEqual({ premium: 35.5, live: true });
  });

  it("falls back to the stored premium and says it is not live", () => {
    expect(resolveFnoPremium(undefined, 40)).toEqual({ premium: 40, live: false });
    expect(resolveFnoPremium(0, 40)).toEqual({ premium: 40, live: false });
  });
});

describe("describeAiTeaser", () => {
  it("states the best performer on the user's entry price", () => {
    expect(describeAiTeaser(3, { ticker: "TCS", pct: 6.63 })).toContain("TCS at +6.6% on your entry");
  });

  it("uses a real minus sign for a losing best position", () => {
    expect(describeAiTeaser(1, { ticker: "TCS", pct: -1.9 })).toContain("−1.9%");
  });

  it("makes no momentum or breakout claim", () => {
    const text = describeAiTeaser(2, { ticker: "TCS", pct: 1 }).toLowerCase();
    expect(text).not.toContain("momentum");
    expect(text).not.toContain("breakout");
    expect(text).not.toContain("score");
  });

  it("reports the position count when nothing is scorable", () => {
    expect(describeAiTeaser(2, null)).toBe("2 active positions ready for an AI portfolio review.");
    expect(describeAiTeaser(1, null)).toBe("1 active position ready for an AI portfolio review.");
  });

  it("asks for holdings when there are none", () => {
    expect(describeAiTeaser(0, null)).toMatch(/Add holdings/);
  });
});

describe("bestPerformer", () => {
  it("ranks by return on entry price across active positions only", () => {
    const best = bestPerformer([
      stock({ ticker: "AAA", entryPrice: 100, cmp: 110 }),
      stock({ ticker: "BBB", entryPrice: 100, cmp: 130 }),
      // A sold position must not win the comparison.
      stock({ ticker: "CCC", entryPrice: 100, cmp: 900, status: "Sold Profit" }),
    ]);
    expect(best).toEqual({ ticker: "BBB", pct: 30 });
  });

  it("returns null rather than a zero-score placeholder", () => {
    expect(bestPerformer([stock({ entryPrice: 0 })])).toBeNull();
    expect(bestPerformer([])).toBeNull();
  });
});
