import { describe, expect, it } from "vitest";
import { currencySymbol, formatInr, formatNative, marketCode } from "./display.ts";

describe("portfolio display formatting", () => {
  it("uses the row's own currency symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol(undefined)).toBe("₹");
  });

  it("groups by the currency's own locale, not the browser's", () => {
    expect(formatNative(1234.5, "INR", 2)).toBe("₹1,234.50");
    expect(formatNative(1234.5, "USD", 2)).toBe("$1,234.50");
    expect(formatNative(102000, "USD", 0)).toBe("$102,000");
  });

  it("shows an unavailable native value as an em dash, never zero", () => {
    // The 52W High cell can feed a genuinely absent value; Math.abs(null) is 0.
    expect(formatNative(null, "INR", 1)).toBe("—");
    expect(formatNative(undefined, "USD", 2)).toBe("—");
    expect(formatNative(Number.NaN, "USD", 2)).toBe("—");
    expect(formatNative(Number.POSITIVE_INFINITY, "INR", 1)).toBe("—");
  });

  it("formats INR totals with en-IN grouping and never guesses", () => {
    expect(formatInr(102000)).toBe("₹1,02,000");
    expect(formatInr(null)).toBe("—");
    expect(formatInr(Number.NaN)).toBe("—");
  });

  it("treats a missing market as NSE", () => {
    expect(marketCode({ market: "US" })).toBe("US");
    expect(marketCode({})).toBe("NSE");
  });
});
