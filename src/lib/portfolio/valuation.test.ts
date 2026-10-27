/**
 * Portfolio valuation policy.
 *
 * Each case corresponds to a way the old dashboard could mislead: a missing
 * price treated as zero, a stored price presented as a market price, a total
 * labelled live when the provider said "delayed", or an "unavailable" portfolio
 * rendered as ₹0.
 */

import { describe, expect, it } from "vitest";
import type { DataMode, QuoteEnvelope } from "../market-data/types.ts";
import {
  classifyPosition,
  describeValuation,
  formatMoney,
  headlineFor,
  isValidPrice,
  summarizeValuation,
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
