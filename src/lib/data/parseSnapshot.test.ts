import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./parseSnapshot";

const base = {
  stocks: [
    { ticker: "RELIANCE", stockName: "Reliance", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, weekHigh52: 120, quantity: 1, status: "Active" },
    { ticker: "AAPL", stockName: "Apple", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, weekHigh52: 120, quantity: 1, status: "Active", market: "US", currency: "USD" },
  ],
  trades: [],
  watchlist: [],
  alerts: [],
};

describe("parseSnapshot market defaults", () => {
  it("defaults legacy rows to NSE / INR / manual", () => {
    const parsed = parseSnapshot(base);
    expect(parsed?.stocks[0]).toMatchObject({ market: "NSE", currency: "INR", source: "manual" });
    expect(parsed?.stocks[1]).toMatchObject({ market: "US", currency: "USD", source: "manual" });
  });

  it("derives an absent currency from the market, not always INR", () => {
    // A U.S. row without a stored currency must not reload as INR: at fx = 1
    // that would value a dollar position as rupees.
    const parsed = parseSnapshot({
      ...base,
      stocks: [
        { ticker: "AAPL", stockName: "Apple", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, quantity: 1, status: "Active", market: "US" },
        { ticker: "MSFT", stockName: "Microsoft", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, quantity: 1, status: "Active", market: "US", currency: "INR" },
        { ticker: "RELIANCE", stockName: "Reliance", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, quantity: 1, status: "Active", market: "NSE" },
        { ticker: "TSLA", stockName: "Tesla", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, quantity: 1, status: "Active", market: "US", currency: "EUR" },
        { ticker: "INFY", stockName: "Infosys", entryDate: "2025-01-01", entryPrice: 100, cmp: 110, quantity: 1, status: "Active", market: "NSE", currency: "USD" },
      ],
    });
    expect(parsed?.stocks[0]).toMatchObject({ market: "US", currency: "USD" });
    // Market decides: a contradicting INR on a US row would be inert downstream
    // (`currencyOf` reads US as USD), so it is corrected instead of preserved.
    expect(parsed?.stocks[1]).toMatchObject({ market: "US", currency: "USD" });
    expect(parsed?.stocks[2]).toMatchObject({ market: "NSE", currency: "INR" });
    // Garbage falls back to the market default.
    expect(parsed?.stocks[3]).toMatchObject({ market: "US", currency: "USD" });
    expect(parsed?.stocks[4]).toMatchObject({ market: "NSE", currency: "INR" });
  });

  it("defaults executions to an empty array", () => {
    expect(parseSnapshot(base)?.executions).toEqual([]);
  });

  it("keeps valid executions and drops malformed ones", () => {
    const parsed = parseSnapshot({
      ...base,
      executions: [
        { id: "indmoney:1", source: "indmoney", market: "NSE", ticker: "RELIANCE", side: "BUY", quantity: 1, price: 100, executedAt: "2025-01-01T10:00:00.000Z", currency: "INR" },
        { id: "bad", source: "indmoney", market: "NSE", ticker: "", side: "BUY", quantity: 0, price: 0, executedAt: "nope", currency: "INR" },
      ],
    });
    expect(parsed?.executions).toHaveLength(1);
    expect(parsed?.executions?.[0].id).toBe("indmoney:1");
  });
});
