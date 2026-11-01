import { describe, expect, it } from "vitest";
import { buildManualPosition } from "./manual.ts";
import { parseSnapshot } from "../data/parseSnapshot.ts";

const base = {
  ticker: "aapl",
  stockName: "Apple",
  entryDate: "2026-01-02",
  entryPrice: 100,
  quantity: 10,
};

describe("buildManualPosition", () => {
  it("marks a U.S. row USD and keeps the FX rate at cost", () => {
    const row = buildManualPosition({ ...base, market: "US", fxAtCost: 80 });
    expect(row).toMatchObject({
      ticker: "AAPL", market: "US", currency: "USD", source: "manual", fxAtCost: 80,
    });
  });

  it("omits fxAtCost when the rate is unavailable instead of guessing", () => {
    expect(buildManualPosition({ ...base, market: "US" })?.fxAtCost).toBeUndefined();
  });

  it("defaults Indian rows to NSE / INR", () => {
    expect(buildManualPosition({ ...base, ticker: "reliance", market: "NSE" })).toMatchObject({
      ticker: "RELIANCE", market: "NSE", currency: "INR", source: "manual",
    });
  });

  it("accepts a dotted U.S. class share but rejects junk", () => {
    expect(buildManualPosition({ ...base, ticker: "BRK.B", market: "US" })?.ticker).toBe("BRK.B");
    expect(buildManualPosition({ ...base, ticker: "$$$", market: "US" })).toBeNull();
    expect(buildManualPosition({ ...base, market: "US", entryPrice: 0 })).toBeNull();
    expect(buildManualPosition({ ...base, market: "US", quantity: 1.5 })).toBeNull();
  });

  it("rejects a closed position without an exit price instead of booking the CMP as realised", () => {
    expect(buildManualPosition({ ...base, market: "US", status: "Sold Profit" })).toBeNull();
    expect(
      buildManualPosition({ ...base, market: "US", status: "Sold Profit", exitPrice: 120 })?.exitPrice,
    ).toBe(120);
    // An open position still needs no exit price.
    expect(buildManualPosition({ ...base, market: "US", status: "Active" })).not.toBeNull();
  });

  it("round-trips a U.S. row through parseSnapshot with market, currency and fxAtCost intact", () => {
    const row = buildManualPosition({ ...base, market: "US", cmp: 120, fxAtCost: 80 });
    expect(row).not.toBeNull();
    const parsed = parseSnapshot({ stocks: [row], trades: [], watchlist: [], alerts: [] });
    expect(parsed?.stocks[0]).toMatchObject({
      ticker: "AAPL", market: "US", currency: "USD", fxAtCost: 80, source: "manual",
    });
  });

  it("omits an unknown daily change instead of writing zero", () => {
    const row = buildManualPosition({ ...base, market: "NSE" });
    expect(row).not.toBeNull();
    expect("dailyChange" in row!).toBe(false);

    const explicitUnknown = buildManualPosition({ ...base, market: "NSE", dailyChange: Number.NaN });
    expect(explicitUnknown).not.toBeNull();
    expect("dailyChange" in explicitUnknown!).toBe(false);

    expect(buildManualPosition({ ...base, market: "NSE", dailyChange: 2.5 })?.dailyChange).toBe(2.5);
  });
});
