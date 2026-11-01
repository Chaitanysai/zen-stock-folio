/**
 * Portfolio valuation policy.
 *
 * Each case corresponds to a way the old dashboard could mislead: a missing
 * price treated as zero, a stored price presented as a market price, a total
 * labelled live when the provider said "delayed", or an "unavailable" portfolio
 * rendered as ₹0.
 */

import { describe, expect, it } from "vitest";
import type { PortfolioStock } from "../../data/sampleData.ts";
import type { DataMode, QuoteEnvelope } from "../market-data/types.ts";
import {
  classifyPosition,
  dayPnlInr,
  describeValuation,
  formatMoney,
  fxPnlInr,
  headlineFor,
  currencyOf,
  isValidPrice,
  portfolioTotals,
  positionKey,
  pricePnlInr,
  realisedPnlInr,
  summarizeValuation,
  toInrStocks,
  valueInr,
  type ValuationPosition,
} from "./valuation.ts";

function position(overrides: Partial<ValuationPosition> = {}): ValuationPosition {
  return { ticker: "RELIANCE", quantity: 10, entryPrice: 100, storedPrice: 150, ...overrides };
}

function envelope(symbol: string, price: number | null, mode: DataMode = "delayed"): QuoteEnvelope {
  return {
    provider: "yahoo",
    dataMode: mode,
    fetchedAt: "2026-10-27T06:00:00.000Z",
    exchangeTimestamp: mode === "unknown" ? null : "2026-10-27T05:45:00.000Z",
    cached: false,
    cacheAgeMs: 0,
    stale: mode === "unknown",
    unavailable: [],
    warnings: [],
    quote:
      price === null
        ? null
        : {
            symbol,
            market: "NSE",
            price,
            change: null,
            changePercent: null,
            previousClose: null,
            dayHigh: null,
            dayLow: null,
            weekHigh52: null,
            weekLow52: null,
            volume: null,
            currency: "INR",
            exchange: "NSE",
            name: null,
          },
  };
}

describe("isValidPrice", () => {
  it("accepts finite positive numbers only", () => {
    expect(isValidPrice(120.5)).toBe(true);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(-1)).toBe(false);
    expect(isValidPrice(Number.NaN)).toBe(false);
    expect(isValidPrice(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPrice(null)).toBe(false);
    expect(isValidPrice("120")).toBe(false);
  });
});

describe("classifyPosition", () => {
  it("treats a provider price with a known mode as verified", () => {
    expect(classifyPosition(position(), { price: 110, dataMode: "delayed" })).toBe("verified");
  });

  it("refuses to verify a price the provider left undated", () => {
    expect(classifyPosition(position(), { price: 110, dataMode: "unknown" })).toBe("stored");
  });

  it("falls back to the stored price when the provider returned none", () => {
    expect(classifyPosition(position(), { price: null, dataMode: "delayed" })).toBe("stored");
  });

  it("reports a missing price when neither source is usable", () => {
    expect(classifyPosition(position({ storedPrice: 0 }), undefined)).toBe("missing");
    expect(classifyPosition(position({ storedPrice: Number.NaN }), { price: 0, dataMode: "eod" })).toBe("missing");
  });
});

describe("summarizeValuation", () => {
  it("values every position when all are priced", () => {
    const summary = summarizeValuation({
      positions: [position({ ticker: "A", quantity: 10, entryPrice: 100 }), position({ ticker: "B", quantity: 5, entryPrice: 200 })],
      quotes: { A: envelope("A", 120), B: envelope("B", 220) },
    });

    expect(summary.pricedCount).toBe(2);
    expect(summary.unpricedCount).toBe(0);
    expect(summary.complete).toBe(true);
    expect(summary.verifiedValue).toBe(10 * 120 + 5 * 220);
    expect(summary.estimatedValue).toBe(summary.verifiedValue);
    expect(summary.invested).toBe(10 * 100 + 5 * 200);
    expect(headlineFor(summary)).toBe("verified");
  });

  it("excludes one unpriced position from the verified total and counts it", () => {
    const summary = summarizeValuation({
      positions: [position({ ticker: "A", quantity: 10, entryPrice: 100 }), position({ ticker: "B", quantity: 5, entryPrice: 200, storedPrice: 900 })],
      quotes: { A: envelope("A", 120) },
    });

    expect(summary.verifiedValue).toBe(1200);
    expect(summary.unpricedCount).toBe(1);
    expect(summary.unpricedSymbols).toEqual(["B"]);
    expect(summary.complete).toBe(false);
    expect(headlineFor(summary)).toBe("estimate");
    // The estimate is separate, and uses the stored price only there.
    expect(summary.estimatedValue).toBe(1200 + 5 * 900);
  });

  it("counts multiple unpriced positions", () => {
    const summary = summarizeValuation({
      positions: [
        position({ ticker: "A", storedPrice: 1 }),
        position({ ticker: "B", storedPrice: 0 }),
        position({ ticker: "C", storedPrice: Number.NaN }),
      ],
      quotes: {},
    });

    expect(summary.pricedCount).toBe(0);
    expect(summary.unpricedCount).toBe(3);
    expect(summary.verifiedValue).toBe(0);
    expect(summary.unpricedSymbols).toEqual(["A", "B", "C"]);
    expect(headlineFor(summary)).toBe("unavailable");
  });

  it("never adds a missing price as zero to a displayed total", () => {
    const summary = summarizeValuation({
      positions: [position({ ticker: "A", quantity: 2, entryPrice: 50 }), position({ ticker: "B", quantity: 3, entryPrice: 10, storedPrice: 0 })],
      quotes: { A: envelope("A", 60) },
    });

    // B contributes nothing to any total, and is reported instead.
    expect(summary.verifiedValue).toBe(120);
    expect(summary.estimatedValue).toBe(120);
    expect(summary.unpricedSymbols).toEqual(["B"]);
  });

  it("handles invalid provider prices without producing NaN", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const summary = summarizeValuation({
        positions: [position({ storedPrice: 0 })],
        quotes: { RELIANCE: envelope("RELIANCE", bad) },
      });
      expect(Number.isFinite(summary.verifiedValue)).toBe(true);
      expect(summary.verifiedValue).toBe(0);
      expect(summary.unpricedCount).toBe(1);
    }
  });

  it("returns an empty summary for an empty portfolio", () => {
    const summary = summarizeValuation({ positions: [], quotes: {} });

    expect(summary.positionCount).toBe(0);
    expect(summary.verifiedValue).toBe(0);
    expect(summary.invested).toBe(0);
    // "Nothing to value" is not "verified".
    expect(headlineFor(summary)).toBe("unavailable");
    expect(describeValuation(summary, "Delayed")).toContain("No active positions");
  });

  it("reports the weakest freshness among priced positions", () => {
    const summary = summarizeValuation({
      positions: [position({ ticker: "A" }), position({ ticker: "B" })],
      quotes: { A: envelope("A", 1, "delayed"), B: envelope("B", 1, "eod") },
    });

    expect(summary.dataMode).toBe("eod");
  });

  it("is unknown when nothing could be verified", () => {
    const summary = summarizeValuation({ positions: [position()], quotes: {} });
    expect(summary.dataMode).toBe("unknown");
  });

  it("ignores a quote for a non-finite quantity rather than valuing it", () => {
    const summary = summarizeValuation({
      positions: [position({ quantity: Number.NaN })],
      quotes: { RELIANCE: envelope("RELIANCE", 100) },
    });
    expect(Number.isFinite(summary.verifiedValue)).toBe(true);
    expect(summary.verifiedValue).toBe(0);
  });
});

describe("describeValuation", () => {
  it("labels a fully priced portfolio as verified with its mode", () => {
    const summary = summarizeValuation({ positions: [position()], quotes: { RELIANCE: envelope("RELIANCE", 120, "delayed") } });
    expect(describeValuation(summary, "Delayed")).toBe("Verified total · 1 of 1 priced · Delayed");
  });

  it("labels a partial valuation as an estimate and names the shortfall", () => {
    const summary = summarizeValuation({
      positions: [position({ ticker: "A" }), position({ ticker: "B" }), position({ ticker: "C" })],
      quotes: { A: envelope("A", 100) },
    });
    expect(describeValuation(summary, "EOD")).toBe("Estimated total · 2 of 3 unpriced (last-known prices used) · EOD");
  });

  it("says no current value is shown when nothing is priced", () => {
    const summary = summarizeValuation({ positions: [position()], quotes: {} });
    expect(describeValuation(summary, "Unverified")).toMatch(/no current value is shown/i);
  });

  it("never claims a live label for stale data", () => {
    const summary = summarizeValuation({ positions: [position()], quotes: { RELIANCE: envelope("RELIANCE", 1, "unknown") } });
    expect(describeValuation(summary, "Unverified")).not.toMatch(/Live/);
  });
});

describe("formatMoney", () => {
  it("keeps two decimals and Indian grouping", () => {
    expect(formatMoney(1234567.891)).toBe("₹12,34,567.89");
    expect(formatMoney(0)).toBe("₹0.00");
  });
});

const usStock = (over: Partial<PortfolioStock> = {}): PortfolioStock => ({
  ticker: "AAPL",
  stockName: "Apple",
  entryDate: "2025-01-10",
  entryPrice: 100,
  cmp: 120,
  weekHigh52: 200,
  quantity: 10,
  status: "Active",
  market: "US",
  currency: "USD",
  fxAtCost: 80,
  source: "manual",
  ...over,
});

describe("market valuation", () => {
  it("keys positions by market and ticker", () => {
    expect(positionKey({ market: "US", ticker: "INFY" })).toBe("US:INFY");
    expect(positionKey({ ticker: "INFY" } as PortfolioStock)).toBe("NSE:INFY");
  });

  it("converts USD value and price P&L at the current rate", () => {
    expect(valueInr(usStock(), 120, 85)).toBe(102_000);
    expect(pricePnlInr(usStock(), 120, 85)).toBe(17_000);
  });

  it("treats a US row with no currency as USD, not INR", () => {
    const unlabelled = usStock({ currency: undefined });

    expect(currencyOf(unlabelled)).toBe("USD");
    // A USD row needs the current rate; without it the INR value is unknown.
    expect(valueInr(unlabelled, 120, 85)).toBe(102_000);
    expect(valueInr(unlabelled, 120, null)).toBeNull();
  });

  it("does not value a US row with no currency at an implied fx of 1", () => {
    const unlabelled = usStock({ currency: undefined });
    expect(valueInr(unlabelled, 120, 85)).not.toBe(1_200); // 10 × 120 at fx 1
  });

  it("separates FX P&L from price P&L", () => {
    expect(fxPnlInr(usStock(), 85)).toBe(5_000); // 10 × 100 × (85 − 80)
  });

  it("never estimates FX P&L without the rate at cost", () => {
    expect(fxPnlInr(usStock({ fxAtCost: undefined }), 85)).toBeNull();
  });

  it("treats a null or non-finite rate at cost as unavailable", () => {
    // Firestore can hand back an explicit null; casting reproduces that read.
    const storedNull = { ...usStock(), fxAtCost: null } as unknown as PortfolioStock;
    expect(fxPnlInr(storedNull, 85)).toBeNull();
    expect(fxPnlInr(usStock({ fxAtCost: Number.NaN }), 85)).toBeNull();
    expect(fxPnlInr(usStock({ fxAtCost: Number.POSITIVE_INFINITY }), 85)).toBeNull();
  });

  it("returns null INR value when the rate is unavailable", () => {
    expect(valueInr(usStock(), 120, null)).toBeNull();
    expect(pricePnlInr(usStock(), 120, null)).toBeNull();
  });

  it("sums the FX P&L it can compute and marks a partial total as estimated", () => {
    const totals = portfolioTotals(
      [
        { stock: usStock(), cmp: 120 },
        { stock: usStock({ ticker: "MSFT", fxAtCost: undefined }), cmp: 200 },
      ],
      85,
    );
    expect(totals.investedInr).toBe(170_000);
    expect(totals.valueInr).toBe(102_000 + 170_000);
    expect(totals.pricePnlInr).toBe(17_000 + 85_000);
    expect(totals.fxPnlInr).toBe(5_000); // only AAPL's lot has a rate at cost
    expect(totals.fxEstimated).toBe(true);
    expect(totals.usdExposureInr).toBe((120 * 10 + 200 * 10) * 85);
  });

  it("reports a complete FX total when every USD lot has a rate at cost", () => {
    const totals = portfolioTotals([{ stock: usStock(), cmp: 120 }], 85);
    expect(totals.fxPnlInr).toBe(5_000);
    expect(totals.fxEstimated).toBe(false);
  });

  it("omits FX P&L entirely for an all-INR portfolio", () => {
    const totals = portfolioTotals(
      [{ stock: usStock({ ticker: "INFY", market: "NSE", currency: "INR", fxAtCost: undefined }), cmp: 120 }],
      85,
    );
    expect(totals.fxPnlInr).toBeNull();
    expect(totals.fxEstimated).toBe(false);
    expect(totals.usdExposureInr).toBe(0);
  });

  it("omits FX P&L when no USD lot carries a rate at cost", () => {
    const totals = portfolioTotals([{ stock: usStock({ fxAtCost: undefined }), cmp: 120 }], 85);
    expect(totals.fxPnlInr).toBeNull();
    expect(totals.fxEstimated).toBe(true);
  });

  it("reports unknown USD exposure when the current rate is missing", () => {
    const totals = portfolioTotals([{ stock: usStock(), cmp: 120 }], null);
    expect(totals.usdExposureInr).toBeNull();
    expect(totals.incomplete).toBe(true);
  });

  it("reports zero USD exposure when the portfolio holds no USD rows", () => {
    const totals = portfolioTotals(
      [{ stock: usStock({ ticker: "INFY", market: "NSE", currency: "INR", fxAtCost: undefined }), cmp: 120 }],
      null,
    );
    expect(totals.usdExposureInr).toBe(0);
  });

  it("skips a cmp:0 sentinel row and counts it as unpriced", () => {
    const inr = (ticker: string, entryPrice: number) =>
      usStock({ ticker, market: "NSE", currency: "INR", entryPrice, fxAtCost: undefined });
    const totals = portfolioTotals(
      [
        { stock: inr("RELIANCE", 100), cmp: 120 },
        { stock: inr("TCS", 200), cmp: 0 },
      ],
      85,
    );

    // Only the priced row contributes to value, cost and P&L.
    expect(totals.pricedCount).toBe(1);
    expect(totals.unpricedCount).toBe(1);
    expect(totals.investedInr).toBe(1_000);
    expect(totals.valueInr).toBe(1_200);
    expect(totals.pricePnlInr).toBe(200);
    expect(totals.incomplete).toBe(false);
  });

  it("reports unknown USD exposure when a USD row has no price", () => {
    const totals = portfolioTotals([{ stock: usStock(), cmp: 0 }], 85);

    expect(totals.unpricedCount).toBe(1);
    expect(totals.pricedCount).toBe(0);
    expect(totals.usdExposureInr).toBeNull();
  });

  it("counts an unpriced row once, before the rate check", () => {
    const inr = (ticker: string) =>
      usStock({ ticker, market: "NSE", currency: "INR", fxAtCost: undefined });
    const totals = portfolioTotals(
      [
        { stock: inr("RELIANCE"), cmp: 120 },
        { stock: inr("TCS"), cmp: 0 },
      ],
      null,
    );

    // The unpriced row is skipped before FX, so it is not also "incomplete".
    expect(totals.incomplete).toBe(false);
    expect(totals.unpricedCount).toBe(1);
    expect(totals.pricedCount).toBe(1);
    expect(totals.valueInr).toBe(1_200);
  });
});

describe("realised, daily, and display conversions", () => {
  it("converts realised P&L at the current rate using the exit price", () => {
    const closed = usStock({ status: "Sold Profit", exitPrice: 130, cmp: 130 });
    expect(realisedPnlInr(closed, 85)).toBe(25_500); // 10 × (130 − 100) × 85
    expect(realisedPnlInr(closed, null)).toBeNull();
  });

  it("converts the day's per-share move, and refuses absent moves", () => {
    expect(dayPnlInr(usStock(), 2, 85)).toBe(1_700); // 10 × 2 × 85
    expect(dayPnlInr(usStock(), null, 85)).toBeNull();
    expect(dayPnlInr(usStock(), 2, null)).toBeNull();
  });

  it("converts aggregate views and drops USD rows without a rate", () => {
    const rows = toInrStocks([usStock(), usStock({ ticker: "INFY", market: "NSE", currency: "INR", fxAtCost: undefined })], 85);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ currency: "INR", entryPrice: 8_500, cmp: 10_200 });
    expect(rows[1].entryPrice).toBe(100);
    expect(toInrStocks([usStock()], null)).toEqual([]);
  });

  it("leaves an unknown 52-week high unknown instead of converting null to zero", () => {
    // A stored document can hold an explicit null despite the required type.
    const storedNull = { ...usStock(), weekHigh52: null } as unknown as PortfolioStock;
    const [row] = toInrStocks([storedNull], 85);
    expect(row.weekHigh52).toBeNull();
    expect(row.cmp).toBe(10_200);
  });

  it("leaves an unknown mark or entry price unknown instead of converting null to zero", () => {
    const storedNull = { ...usStock(), cmp: null, entryPrice: null } as unknown as PortfolioStock;
    const [row] = toInrStocks([storedNull], 85);
    expect(row.cmp).toBeNull();
    expect(row.entryPrice).toBeNull();
  });
});
