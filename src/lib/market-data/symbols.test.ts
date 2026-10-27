/**
 * Symbol normalization — the input boundary for outbound provider HTTP.
 *
 * Anything this module accepts becomes a URL path segment, so the tests are
 * mostly about what it must refuse.
 */

import { describe, expect, it } from "vitest";
import {
  fromYahooSymbol,
  isSupportedIndexSymbol,
  normalizeSymbol,
  normalizeSymbolList,
  toYahooSymbol,
} from "@/lib/market-data/symbols.ts";

describe("normalizeSymbol", () => {
  it("uppercases and trims a bare NSE symbol", () => {
    expect(normalizeSymbol("  reliance ")).toBe("RELIANCE");
  });

  it("strips the .NS suffix", () => {
    expect(normalizeSymbol("TCS.NS")).toBe("TCS");
  });

  it("rejects BSE because only the NSE feed is wired", () => {
    expect(normalizeSymbol("TCS.BO")).toBeNull();
  });

  it("keeps the punctuation real NSE symbols contain", () => {
    expect(normalizeSymbol("M&M")).toBe("M&M");
    expect(normalizeSymbol("BAJAJ-AUTO")).toBe("BAJAJ-AUTO");
    expect(normalizeSymbol("MCDOWELL-N")).toBe("MCDOWELL-N");
  });

  it("rejects non-strings, blanks and index symbols", () => {
    expect(normalizeSymbol(null)).toBeNull();
    expect(normalizeSymbol(42)).toBeNull();
    expect(normalizeSymbol("   ")).toBeNull();
    expect(normalizeSymbol("^NSEI")).toBeNull();
  });

  it("rejects strings that would break out of a URL path", () => {
    expect(normalizeSymbol("RELIANCE/../admin")).toBeNull();
    expect(normalizeSymbol("RELIANCE?x=1")).toBeNull();
    expect(normalizeSymbol("REL IANCE")).toBeNull();
    expect(normalizeSymbol("RELIANCE%2F")).toBeNull();
  });

  it("rejects an over-long symbol", () => {
    expect(normalizeSymbol("A".repeat(21))).toBeNull();
    expect(normalizeSymbol("A".repeat(20))).toBe("A".repeat(20));
  });
});

describe("normalizeSymbolList", () => {
  it("de-duplicates while preserving first-seen order", () => {
    const result = normalizeSymbolList(["TCS", "RELIANCE", "tcs", "RELIANCE.NS"], 10);
    expect(result.symbols).toEqual(["TCS", "RELIANCE"]);
    expect(result.rejected).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("reports rejected entries without echoing them unbounded", () => {
    const long = "x".repeat(500);
    const result = normalizeSymbolList(["TCS", "bad symbol", long], 10);
    expect(result.symbols).toEqual(["TCS"]);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[1].length).toBeLessThanOrEqual(32);
  });

  it("caps the list and flags truncation", () => {
    const result = normalizeSymbolList(["A", "B", "C", "D"], 2);
    expect(result.symbols).toEqual(["A", "B"]);
    expect(result.truncated).toBe(true);
  });

  it("returns nothing for a non-array input instead of throwing", () => {
    expect(normalizeSymbolList("TCS", 10)).toEqual({ symbols: [], rejected: [], truncated: false });
    expect(normalizeSymbolList(null, 10).symbols).toEqual([]);
  });
});

describe("provider symbol mapping", () => {
  it("round-trips an NSE symbol through the Yahoo form", () => {
    expect(toYahooSymbol("RELIANCE")).toBe("RELIANCE.NS");
    expect(fromYahooSymbol("RELIANCE.NS")).toBe("RELIANCE");
  });

  it("refuses to map a foreign listing onto an NSE symbol", () => {
    expect(fromYahooSymbol("INFY")).toBeNull();
    expect(fromYahooSymbol("INFY.BO")).toBeNull();
    expect(fromYahooSymbol("RELIANCE.NYQ")).toBeNull();
  });

  it("whitelists only the indices with a configured provider symbol", () => {
    expect(isSupportedIndexSymbol("^NSEI")).toBe(true);
    expect(isSupportedIndexSymbol("^GSPC")).toBe(false);
  });
});
