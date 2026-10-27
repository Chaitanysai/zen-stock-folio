import { describe, expect, it } from "vitest";
import {
  buildWatchlistStock,
  isDuplicateWatchlistTicker,
  normalizeTicker,
  type WatchlistDraft,
} from "./watchlist";
import type { WatchlistStock } from "@/data/sampleData";

const existing: WatchlistStock[] = [
  {
    stockName: "RELIANCE",
    cmp: 2612.35,
    entryZoneLow: 2550,
    entryZoneHigh: 2600,
    stopLoss: 2450,
    target1: 2700,
    target2: 2800,
    target3: 2900,
    rsi: 55,
    sma50: 2580,
    ema10: 2600,
    ema21: 2590,
  },
];

const draft = (overrides: Partial<WatchlistDraft> = {}): WatchlistDraft => ({
  ticker: "tcs",
  cmp: "3845.20",
  entryZoneLow: "3800",
  entryZoneHigh: "3860",
  stopLoss: "3700",
  target1: "4000",
  ...overrides,
});

describe("normalizeTicker", () => {
  it("uppercases and trims the symbol", () => {
    expect(normalizeTicker("  reliance ")).toBe("RELIANCE");
  });
});

describe("isDuplicateWatchlistTicker", () => {
  it("detects duplicates case-insensitively", () => {
    expect(isDuplicateWatchlistTicker(existing, " reliance ")).toBe(true);
    expect(isDuplicateWatchlistTicker(existing, "TCS")).toBe(false);
  });
});

describe("buildWatchlistStock", () => {
  it("builds a normalized stock with sensible optional defaults", () => {
    const result = buildWatchlistStock(draft(), existing);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.stock).toEqual({
      stockName: "TCS",
      cmp: 3845.2,
      entryZoneLow: 3800,
      entryZoneHigh: 3860,
      stopLoss: 3700,
      target1: 4000,
      target2: 4000,
      target3: 4000,
      rsi: 0,
      sma50: 0,
      ema10: 0,
      ema21: 0,
    });
  });

  it("keeps provided optional values and sector", () => {
    const result = buildWatchlistStock(
      draft({
        ticker: "infy",
        sector: "IT",
        target2: "4200",
        target3: "4400",
        rsi: "62.5",
        sma50: "3800.5",
        ema10: "3820",
        ema21: "3810",
      }),
      existing,
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.stock).toMatchObject({
      stockName: "INFY",
      sector: "IT",
      target2: 4200,
      target3: 4400,
      rsi: 62.5,
      sma50: 3800.5,
      ema10: 3820,
      ema21: 3810,
    });
  });

  it("rejects an empty ticker", () => {
    const result = buildWatchlistStock(draft({ ticker: "   " }), existing);

    expect(result).toEqual({ status: "error", error: "Ticker symbol is required." });
  });

  it("rejects a duplicate symbol regardless of case or whitespace", () => {
    const result = buildWatchlistStock(draft({ ticker: " reliance " }), existing);

    expect(result).toEqual({
      status: "error",
      error: "RELIANCE is already in your watchlist.",
    });
  });

  it("rejects missing or non-positive required prices", () => {
    for (const field of ["cmp", "entryZoneLow", "entryZoneHigh", "stopLoss", "target1"] as const) {
      const result = buildWatchlistStock(draft({ [field]: "0" }), existing);
      expect(result.status, `${field}=0 should be rejected`).toBe("error");
    }
    expect(buildWatchlistStock(draft({ cmp: "" }), existing).status).toBe("error");
    expect(buildWatchlistStock(draft({ stopLoss: "abc" }), existing).status).toBe("error");
  });

  it("rejects an inverted entry zone", () => {
    const result = buildWatchlistStock(
      draft({ entryZoneLow: "3900", entryZoneHigh: "3800" }),
      existing,
    );

    expect(result).toEqual({
      status: "error",
      error: "Entry zone low cannot be higher than entry zone high.",
    });
  });

  it("rejects invalid optional technical values when supplied", () => {
    const result = buildWatchlistStock(draft({ rsi: "not-a-number" }), existing);

    expect(result).toEqual({
      status: "error",
      error: "Technical values must be valid numbers.",
    });
  });
});
