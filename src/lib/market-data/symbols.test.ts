/**
 * Symbol normalization — the input boundary for outbound provider HTTP.
 *
 * Anything this module accepts becomes a URL path segment, so the tests are
 * mostly about what it must refuse.
 */

import { describe, expect, it } from "vitest";
import {
  fromYahooSymbol,
  instrumentKey,
  isSupportedIndexSymbol,
  normalizeInstrumentList,
  normalizeSymbol,
  normalizeSymbolList,
  parseInstrument,
  toYahooSymbol,
} from "./symbols.ts";

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

describe("market-aware symbols", () => {
  it("keeps NSE canonicalisation unchanged", () => {
    expect(normalizeSymbol(" reliance ")).toBe("RELIANCE");
    expect(normalizeSymbol("INFY.NS")).toBe("INFY");
    expect(normalizeSymbol("infy.bo")).toBeNull();
    expect(normalizeSymbol("^NSEI")).toBeNull();
  });

  it("accepts US tickers and canonicalises class shares", () => {
    expect(normalizeSymbol("aapl", "US")).toBe("AAPL");
    expect(normalizeSymbol("BRK.B", "US")).toBe("BRK.B");
    expect(normalizeSymbol("BRK-B", "US")).toBe("BRK.B");
    expect(normalizeSymbol("1234", "US")).toBeNull();
    expect(normalizeSymbol("", "US")).toBeNull();
  });

  it("maps US tickers to Yahoo's class-share form and back", () => {
    expect(toYahooSymbol("AAPL", "US")).toBe("AAPL");
    expect(toYahooSymbol("BRK.B", "US")).toBe("BRK-B");
    expect(toYahooSymbol("RELIANCE", "NSE")).toBe("RELIANCE.NS");
    expect(fromYahooSymbol("BRK-B", "US")).toBe("BRK.B");
    expect(fromYahooSymbol("RELIANCE.NS", "NSE")).toBe("RELIANCE");
  });

  it("keys instruments by market", () => {
    expect(instrumentKey({ market: "NSE", ticker: "INFY" })).toBe("NSE:INFY");
    expect(instrumentKey({ market: "US", ticker: "INFY" })).toBe("US:INFY");
  });

  it("parses instruments and drops impossible markets", () => {
    expect(parseInstrument({ ticker: "RELIANCE" })).toEqual({ market: "NSE", ticker: "RELIANCE" });
    expect(parseInstrument({ market: "US", ticker: "brk-b" })).toEqual({ market: "US", ticker: "BRK.B" });
    expect(parseInstrument({ market: "LSE", ticker: "VOD" })).toBeNull();
    expect(parseInstrument("RELIANCE")).toBeNull();
  });

  it("normalizes, de-duplicates, and truncates instrument lists", () => {
    const result = normalizeInstrumentList(
      [
        { market: "US", ticker: "AAPL" },
        { ticker: "RELIANCE" },
        { market: "US", ticker: "aapl" },
        { market: "LSE", ticker: "VOD" },
      ],
      10,
    );
    expect(result.instruments).toEqual([
      { market: "US", ticker: "AAPL" },
      { market: "NSE", ticker: "RELIANCE" },
    ]);
    expect(result.rejected).toHaveLength(1);
    expect(result.truncated).toBe(false);

    const capped = normalizeInstrumentList(
      Array.from({ length: 3 }, (_, index) => ({ market: "US", ticker: `A${index}` })),
      2,
    );
    expect(capped.instruments).toHaveLength(2);
    expect(capped.truncated).toBe(true);
  });
});
