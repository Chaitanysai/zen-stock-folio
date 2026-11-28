// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHoldings, getPortfolioSummary } from "./portfolio";
import type { ToolContext } from "../context";

/**
 * The dashboard and the assistant must describe the same portfolio with the
 * same words.
 *
 * Production showed the UI saying "4 holdings" while the assistant said
 * "6 active positions". Both were arithmetically right: the snapshot stores one
 * row per LOT, and a ticker can be held as several lots. The defect was the
 * assistant's wording, which implied it was counting distinct securities.
 *
 * These tests pin both numbers and the wording that distinguishes them.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** One lot row, in the shape the snapshot stores. */
function lot(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id ?? Math.random()),
    ticker: "TICK",
    stockName: "Test Co",
    quantity: 10,
    entryPrice: 100,
    cmp: 110,
    exitPrice: null,
    status: "Active",
    market: "NSE",
    ...overrides,
  };
}

function ctxWith(stocks: unknown[]): ToolContext {
  const snapshot = { stocks, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] };
  // Explicitly typed so each memo entry keeps its own result shape.
  const memo = new Map<string, Promise<unknown>>();
  memo.set("snapshot", Promise.resolve({ status: "ok", snapshot, updateTime: null }));
  memo.set("quotes:", Promise.resolve({ quotes: {}, live: false, note: "quotes suppressed in test" }));
  memo.set("usd-inr", Promise.resolve(null));
  return {
    env: {} as never,
    uid: "user-1",
    token: "t",
    now: Date.UTC(2026, 10, 28, 6, 0, 0),
    memo,
  } as unknown as ToolContext;
}

describe("position counting — lots vs distinct holdings", () => {
  // Two tickers, one of which is held as three separate lots: 4 lots, 2 holdings.
  const snapshotStocks = [
    lot({ id: "a1", ticker: "TCS", quantity: 5 }),
    lot({ id: "a2", ticker: "TCS", quantity: 7 }),
    lot({ id: "a3", ticker: "TCS", quantity: 3 }),
    lot({ id: "b1", ticker: "INFY", quantity: 20 }),
  ];

  it('preserves the "6 active position lots across 4 holdings" regression', async () => {
    const stocks = [
      lot({ id: "r1", ticker: "RELIANCE" }),
      lot({ id: "r2", ticker: "RELIANCE" }),
      lot({ id: "t1", ticker: "TCS" }),
      lot({ id: "i1", ticker: "INFY" }),
      lot({ id: "h1", ticker: "HDFCBANK" }),
      lot({ id: "h2", ticker: "HDFCBANK" }),
    ];
    const outcome = await getPortfolioSummary(ctxWith(stocks));
    if (outcome.status !== "ok") throw new Error("expected ok");

    expect(outcome.summary).toContain("6 active position lots");
    expect(outcome.summary).toContain("across 4 holdings");
  });

  it("reports distinct holdings separately from active lots", async () => {
    const outcome = await getPortfolioSummary(ctxWith(snapshotStocks));
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;

    expect(outcome.data.activeLots).toBe(4);
    expect(outcome.data.holdings).toBe(2);
  });

  it("words the summary so a lot count cannot be mistaken for a holding count", async () => {
    const outcome = await getPortfolioSummary(ctxWith(snapshotStocks));
    if (outcome.status !== "ok") throw new Error("expected ok");

    // The ambiguity that caused the production discrepancy: saying only
    // "4 active positions" next to a UI that shows 2 holdings.
    expect(outcome.summary).toContain("4 active position lots");
    expect(outcome.summary).toContain("2 holdings");
  });

  it("does not say 'lots' for a single-lot-per-holding portfolio", async () => {
    const outcome = await getPortfolioSummary(
      ctxWith([lot({ id: "x", ticker: "TCS" }), lot({ id: "y", ticker: "INFY" })]),
    );
    if (outcome.status !== "ok") throw new Error("expected ok");

    expect(outcome.summary).toContain("2 active position");
    expect(outcome.summary).toContain("2 holdings");
    // With 2 lots across 2 holdings the words must agree, so no lot qualifier.
    expect(outcome.summary).not.toContain("position lots");
  });

  it("counts closed lots separately from closed holdings", async () => {
    const outcome = await getPortfolioSummary(
      ctxWith([
        lot({ id: "o1", ticker: "TCS", status: "Active" }),
        lot({ id: "c1", ticker: "INFY", status: "Sold Profit", exitPrice: 120 }),
        lot({ id: "c2", ticker: "INFY", status: "Sold Profit", exitPrice: 130 }),
      ]),
    );
    if (outcome.status !== "ok") throw new Error("expected ok");

    expect(outcome.data.activeLots).toBe(1);
    expect(outcome.data.closedLots).toBe(2);
    // `holdings` mirrors the dashboard's equity KPI (open tickers only), so it
    // stays 1 here; `closedHoldings` carries the closed side separately.
    expect(outcome.data.holdings).toBe(1);
    expect(outcome.data.closedHoldings).toBe(1);
  });

  it("get_holdings still lists lots, and states the holding count", async () => {
    const outcome = await getHoldings(ctxWith(snapshotStocks), { status: "active", limit: 10 });
    if (outcome.status !== "ok") throw new Error("expected ok");

    expect(outcome.data.count).toBe(4);
    expect(outcome.data.holdings).toBe(2);
    // The rows are lots, so three TCS rows plus one INFY row.
    const rows = outcome.data.rows as Array<{ ticker: string }>;
    expect(rows.filter((r) => r.ticker === "TCS")).toHaveLength(3);
  });

  it("matches the dashboard's own definition of holdings", async () => {
    // The dashboard groups by ticker+market; mirror that exact derivation here so
    // a future change to either side fails this test rather than production.
    const distinct = new Set(
      snapshotStocks.map((s) => `${(s as { market: string }).market}:${(s as { ticker: string }).ticker}`),
    );
    const outcome = await getPortfolioSummary(ctxWith(snapshotStocks));
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.data.holdings).toBe(distinct.size);
  });
});
