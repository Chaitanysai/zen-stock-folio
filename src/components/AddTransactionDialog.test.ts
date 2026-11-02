import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM,
  buildDialogPosition,
  fxAtCostAt,
  isCurrentQuote,
  quoteRequestKey,
  type TransactionForm,
} from "./AddTransactionDialog";

// Radix Select does not respond to programme-driven pointer events in jsdom, so
// the market-switch race is covered through the pure request-identity predicate
// the dialog uses to gate every quote response.
const usForm = (overrides: Partial<TransactionForm> = {}): TransactionForm => ({
  ...EMPTY_FORM,
  market: "US",
  ticker: "AAPL",
  stockName: "Apple",
  entryPrice: "100",
  quantity: "10",
  ...overrides,
});

const quote = { cmp: 120, high: 130, low: 90, change: 1.5 };
const now = new Date(2026, 10, 1); // 1 Nov 2026, local time

describe("quote request identity", () => {
  it("rejects a quote requested for the previous market", () => {
    const requested = quoteRequestKey("NSE", "AAPL");
    expect(isCurrentQuote(requested, { market: "NSE", ticker: "aapl" })).toBe(true);
    expect(isCurrentQuote(requested, { market: "US", ticker: "AAPL" })).toBe(false);
  });

  it("rejects a quote for a ticker that has since changed", () => {
    const requested = quoteRequestKey("US", "AAPL");
    expect(isCurrentQuote(requested, { market: "US", ticker: "MSFT" })).toBe(false);
    expect(isCurrentQuote(requested, { market: "US", ticker: "aapl" })).toBe(true);
  });
});

describe("fxAtCostAt", () => {
  it("uses today's rate for a trade entered today or with no date", () => {
    expect(fxAtCostAt("US", "2026-11-01", 85, now)).toBe(85);
    expect(fxAtCostAt("US", "", 85, now)).toBe(85);
  });

  it("omits the rate for a back-dated entry instead of passing off today's rate", () => {
    expect(fxAtCostAt("US", "2026-10-31", 85, now)).toBeUndefined();
  });

  it("omits the rate when it is unavailable or the market is not U.S.", () => {
    expect(fxAtCostAt("US", "2026-11-01", null, now)).toBeUndefined();
    expect(fxAtCostAt("NSE", "2026-11-01", 85, now)).toBeUndefined();
  });
});

describe("buildDialogPosition", () => {
  it("rejects a fractional quantity instead of truncating it", () => {
    expect(buildDialogPosition(usForm({ quantity: "1.5" }), quote, 85, now)).toBeNull();
  });

  it("rejects a closed trade with no exit price rather than booking the CMP as realised", () => {
    expect(buildDialogPosition(usForm({ status: "Sold Profit" }), quote, 85, now)).toBeNull();
    expect(
      buildDialogPosition(usForm({ status: "Sold Profit", exitPrice: "130" }), quote, 85, now)?.exitPrice,
    ).toBe(130);
  });

  it("persists today's rate as fxAtCost but omits it for a back-dated lot", () => {
    expect(buildDialogPosition(usForm(), quote, 85, now)?.fxAtCost).toBe(85);
    expect(
      buildDialogPosition(usForm({ entryDate: "2026-10-31" }), quote, 85, now)?.fxAtCost,
    ).toBeUndefined();
  });

  it("keeps a U.S. row native USD when built from the form", () => {
    expect(buildDialogPosition(usForm(), quote, 85, now)).toMatchObject({
      ticker: "AAPL", market: "US", currency: "USD", cmp: 120, source: "manual",
    });
  });
});
