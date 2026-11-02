import { describe, expect, it } from "vitest";
import type { PortfolioStock } from "../../data/sampleData.ts";
import type { Execution, PortfolioSnapshot } from "../data/snapshotTypes.ts";
import type { NormalizedFill, NormalizedHolding } from "../broker/types.ts";
import { buildSyncPlan } from "./syncPlan.ts";

const NOW = "2026-11-01T06:00:00.000Z";

const snapshot = (over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot => ({
  stocks: [],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
  executions: [],
  ...over,
});

const holding = (over: Partial<NormalizedHolding> = {}): NormalizedHolding => ({
  market: "NSE",
  ticker: "RELIANCE",
  isin: null,
  quantity: 15,
  averagePrice: 2450,
  lastPrice: 2612.35,
  brokerRef: "NSE:RELIANCE",
  ...over,
});

const fill = (over: Partial<NormalizedFill> = {}): NormalizedFill => ({
  id: "indmoney:T1",
  market: "NSE",
  ticker: "RELIANCE",
  side: "BUY",
  quantity: 15,
  price: 2450,
  executedAt: "2026-01-10T04:30:00.000Z",
  currency: "INR",
  ...over,
});

const execution = (over: Partial<Execution> = {}): Execution => ({
  id: "indmoney:T0",
  source: "indmoney",
  market: "NSE",
  ticker: "RELIANCE",
  side: "BUY",
  quantity: 10,
  price: 2400,
  executedAt: "2026-01-05T04:30:00.000Z",
  currency: "INR",
  ...over,
});

const stock = (over: Partial<PortfolioStock> = {}): PortfolioStock => ({
  ticker: "RELIANCE",
  stockName: "Reliance",
  entryDate: "10-Jan-2026",
  entryPrice: 2400,
  cmp: 2612.35,
  weekHigh52: 2856.15,
  quantity: 10,
  status: "Active",
  ...over,
});

/** Firestore `setDoc` rejects `undefined`, so the plan must omit absent fields. */
const assertNoUndefined = (value: unknown, path = "plan"): void => {
  expect(value).not.toBeUndefined();
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      expect(child, `undefined at ${path}.${key}`).not.toBeUndefined();
      assertNoUndefined(child, `${path}.${key}`);
    }
  }
};

describe("buildSyncPlan", () => {
  it("adds broker holdings and fills while copying manual rows through untouched", () => {
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual] }),
      snapshotUpdateTime: "2026-10-31T10:00:00.000Z",
      holdings: [holding()],
      unmatched: [],
      fills: [fill()],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks[0]).toBe(manual);
    expect(plan.nextSnapshot.stocks[1]).toMatchObject({
      ticker: "RELIANCE",
      entryDate: "10-Jan-2026",
      entryPrice: 2450,
      quantity: 15,
      cmp: 0,
      status: "Active",
      market: "NSE",
      currency: "INR",
      source: "indmoney",
      brokerRef: "NSE:RELIANCE",
    });
    expect(plan.nextSnapshot.executions).toHaveLength(1);
    expect(plan.nextSnapshot.executions?.[0].id).toBe("indmoney:T1");
    expect(plan.preview).toMatchObject({
      mode: "preview",
      provider: "indmoney",
      generatedAt: NOW,
      holdingsSeen: 1,
      executionsSeen: 1,
      executionsAdded: 1,
      unchangedPositions: 0,
      requiresEmptyConfirmation: false,
      snapshotUpdateTime: "2026-10-31T10:00:00.000Z",
    });
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: null, after: { quantity: 15, averagePrice: 2450 } },
    ]);
  });

  it("lets a manual row win and removes a position the broker no longer reports", () => {
    const manual = stock();
    const gone = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 5, source: "indmoney", market: "NSE", currency: "INR" });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual, gone] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks.map((row) => row.ticker)).toEqual(["RELIANCE"]);
    expect(plan.nextSnapshot.stocks[0]).toBe(manual);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "manual-position", ticker: "RELIANCE" }),
    ]);
    expect(plan.preview.openPositions).toEqual([
      { ticker: "TCS", before: { quantity: 5, averagePrice: 3900 }, after: null },
    ]);
  });

  it("preserves the stored quote and entry date when the broker quantity changes", () => {
    const previous = stock({ quantity: 10, entryPrice: 2400, cmp: 2750, source: "indmoney", market: "NSE", currency: "INR" });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [previous] }),
      snapshotUpdateTime: "t",
      holdings: [holding({ quantity: 15, averagePrice: 2450 })],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks[0]).toMatchObject({ cmp: 2750, quantity: 15, entryPrice: 2450, entryDate: "10-Jan-2026" });
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: { quantity: 10, averagePrice: 2400 }, after: { quantity: 15, averagePrice: 2450 } },
    ]);
  });

  it("derives closed rows FIFO and carries the journal note", () => {
    const previousClosed = stock({
      status: "Sold Profit",
      quantity: 10,
      entryPrice: 100,
      exitPrice: 150,
      exitDate: "1-Mar-2026",
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      notes: { tradeReason: "kept" },
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [previousClosed] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toHaveLength(1);
    expect(plan.nextSnapshot.stocks[0]).toMatchObject({
      ticker: "RELIANCE",
      status: "Sold Profit",
      entryDate: "1-Jan-2026",
      exitDate: "1-Mar-2026",
      entryPrice: 100,
      exitPrice: 150,
      quantity: 10,
      notes: { tradeReason: "kept" },
      source: "indmoney",
    });
    expect(plan.preview.closedPositions).toEqual([]);
    expect(plan.preview.unchangedPositions).toBe(1);
    expect(plan.preview.requiresEmptyConfirmation).toBe(false);
  });

  it("dedupes a fill that is already in the ledger", () => {
    const plan = buildSyncPlan({
      snapshot: snapshot({ executions: [execution({ id: "indmoney:T1" })] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [fill()],
      now: NOW,
    });

    expect(plan.nextSnapshot.executions).toHaveLength(1);
    expect(plan.preview.executionsAdded).toBe(0);
  });

  it("requires confirmation before an empty holdings apply wipes synced positions", () => {
    const open = stock({ source: "indmoney", market: "NSE", currency: "INR", quantity: 15 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [open] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.preview.requiresEmptyConfirmation).toBe(true);
    expect(plan.preview.warnings.join(" ")).toContain("confirmation");
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: { quantity: 15, averagePrice: 2400 }, after: null },
    ]);
    expect(plan.nextSnapshot.stocks).toEqual([]);
  });

  it("does not require confirmation when a manual row claims every synced open row", () => {
    const manual = stock({ quantity: 4, notes: { tradeReason: "manual" } });
    const synced = stock({ source: "indmoney", market: "NSE", currency: "INR", quantity: 15 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual, synced] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.preview.openPositions).toEqual([]);
    expect(plan.preview.requiresEmptyConfirmation).toBe(false);
    expect(plan.preview.warnings.join(" ")).not.toContain("confirmation");
    expect(plan.nextSnapshot.stocks).toContain(synced);
  });

  it("still requires confirmation when an empty holdings payload removes a synced row", () => {
    const manual = stock({ ticker: "TCS", stockName: "TCS", quantity: 2 });
    const claimed = stock({ ticker: "TCS", stockName: "TCS", source: "indmoney", market: "NSE", currency: "INR", quantity: 5 });
    const removed = stock({ ticker: "INFY", stockName: "Infosys", source: "indmoney", market: "NSE", currency: "INR", quantity: 20 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual, claimed, removed] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.preview.requiresEmptyConfirmation).toBe(true);
    expect(plan.preview.warnings.join(" ")).toContain("confirmation");
    expect(plan.preview.openPositions).toEqual([
      { ticker: "INFY", before: { quantity: 20, averagePrice: 2400 }, after: null },
    ]);
    expect(plan.nextSnapshot.stocks).toContain(claimed);
  });

  it("keeps closed history the trade book cannot reproduce", () => {
    const previousClosed = stock({
      status: "Sold Loss",
      quantity: 4,
      entryPrice: 100,
      exitPrice: 90,
      exitDate: "1-Feb-2026",
      source: "indmoney",
      market: "NSE",
      currency: "INR",
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [previousClosed] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toEqual([previousClosed]);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "empty-derivation", ticker: "RELIANCE" }),
    ]);
    expect(plan.preview.requiresEmptyConfirmation).toBe(false);
  });

  it("flags a merge that would exceed the Firestore row cap", () => {
    const many = Array.from({ length: 1001 }, (_, index) => holding({ ticker: `S${index}` }));

    const plan = buildSyncPlan({
      snapshot: snapshot(),
      snapshotUpdateTime: null,
      holdings: many,
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "limit" }),
    ]);
    assertNoUndefined(plan);
  });

  it("is idempotent: re-planning the applied snapshot reports no changes", () => {
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2, notes: { tradeReason: "manual" } });
    const previousOpen = stock({
      ticker: "INFY",
      stockName: "Infosys",
      entryDate: "12-Dec-2025",
      entryPrice: 1890,
      cmp: 1756.4,
      quantity: 20,
      source: "indmoney",
      market: "NSE",
      currency: "INR",
    });
    const previousClosed = stock({
      ticker: "SBIN",
      stockName: "State Bank",
      entryDate: "25-Jan-2026",
      entryPrice: 782,
      cmp: 805.5,
      quantity: 30,
      exitPrice: 805.5,
      exitDate: "5-Mar-2026",
      status: "Sold Profit",
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      notes: { tradeReason: "kept" },
    });
    const input = {
      snapshot: snapshot({ stocks: [manual, previousOpen, previousClosed] }),
      snapshotUpdateTime: "t",
      holdings: [
        holding({ ticker: "INFY", quantity: 20, averagePrice: 1890, lastPrice: 1756.4, brokerRef: "NSE:INFY" }),
        holding(),
      ],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:I1", ticker: "INFY", quantity: 20, price: 1890, executedAt: "2025-12-12T04:30:00.000Z" }),
        fill({ id: "indmoney:B1", ticker: "SBIN", quantity: 30, price: 782, executedAt: "2026-01-25T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", ticker: "SBIN", side: "SELL", quantity: 30, price: 805.5, executedAt: "2026-03-05T04:30:00.000Z" }),
        fill(),
      ],
      now: NOW,
    };

    const first = buildSyncPlan(input);
    const second = buildSyncPlan({ ...input, snapshot: first.nextSnapshot });

    expect(second.preview.openPositions).toEqual([]);
    expect(second.preview.closedPositions).toEqual([]);
    expect(second.preview.executionsAdded).toBe(0);
    expect(second.preview.requiresEmptyConfirmation).toBe(false);
    expect(second.nextSnapshot).toEqual(first.nextSnapshot);
    expect(second.nextSnapshot.stocks.map((row) => row.ticker)).toEqual(["TCS", "INFY", "RELIANCE", "SBIN"]);
  });

  it("keeps a manual row and its journal byte-identical when the broker also reports it", () => {
    const notes = { tradeReason: "manual thesis", marketCondition: "choppy", mistakesLearned: "none" };
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2, cmp: 3780, notes });
    const before = JSON.stringify(manual);

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual] }),
      snapshotUpdateTime: "t",
      holdings: [
        holding({ ticker: "TCS", quantity: 9, averagePrice: 4000, brokerRef: "NSE:TCS" }),
        holding(),
      ],
      unmatched: [],
      fills: [fill()],
      now: NOW,
    });

    const written = plan.nextSnapshot.stocks.find((row) => row.ticker === "TCS");
    expect(written).toBe(manual);
    expect(JSON.stringify(written)).toBe(before);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "manual-position", ticker: "TCS" }),
    ]);
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: null, after: { quantity: 15, averagePrice: 2450 } },
    ]);
  });

  it("keeps a note-bearing closed row whose exit date does not match the derived one", () => {
    const february = stock({ status: "Sold Profit", quantity: 5, entryPrice: 100, exitPrice: 120, exitDate: "1-Feb-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "february" } });
    const march = stock({ status: "Sold Profit", quantity: 10, entryPrice: 100, exitPrice: 150, exitDate: "1-Mar-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "march" } });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [february, march] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    // February's note would be silently dropped by a row-level exitDate match,
    // so both stored rows stay and the collapse is refused.
    expect(plan.nextSnapshot.stocks).toEqual([february, march]);
    expect(plan.preview.closedPositions).toEqual([]);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "notes", ticker: "RELIANCE" }),
    ]);
  });

  it("carries an open row's journal note into the derived closed row", () => {
    const open = stock({
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      quantity: 10,
      notes: { tradeReason: "active thesis" },
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [open] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toHaveLength(1);
    expect(plan.nextSnapshot.stocks[0]).toMatchObject({
      ticker: "RELIANCE",
      status: "Sold Profit",
      exitDate: "1-Mar-2026",
      notes: { tradeReason: "active thesis" },
    });
    expect(plan.preview.conflicts).toEqual([]);
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: { quantity: 10, averagePrice: 2400 }, after: null },
    ]);
  });

  it("keeps a still-held open row's journal and does not copy it onto the derived closed row", () => {
    const open = stock({
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      quantity: 15,
      entryPrice: 100,
      notes: { tradeReason: "active thesis" },
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [open] }),
      snapshotUpdateTime: "t",
      holdings: [holding({ quantity: 15, averagePrice: 100 })],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    const active = plan.nextSnapshot.stocks.filter((row) => row.status === "Active");
    const closed = plan.nextSnapshot.stocks.filter((row) => row.status !== "Active");

    expect(active).toHaveLength(1);
    expect(active[0].notes).toEqual({ tradeReason: "active thesis" });
    expect(closed).toHaveLength(1);
    expect(closed[0].exitDate).toBe("1-Mar-2026");
    expect(Object.prototype.hasOwnProperty.call(closed[0], "notes")).toBe(false);
  });

  it("does not turn a still-held open row into a second Active row on a notes conflict", () => {
    const open = stock({
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      quantity: 15,
      entryPrice: 100,
      notes: { tradeReason: "active thesis" },
    });
    const february = stock({ status: "Sold Profit", quantity: 5, entryPrice: 100, exitPrice: 120, exitDate: "1-Feb-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "february" } });
    const april = stock({ status: "Sold Loss", quantity: 5, entryPrice: 100, exitPrice: 90, exitDate: "1-Apr-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "april" } });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [open, february, april] }),
      snapshotUpdateTime: "t",
      holdings: [holding({ quantity: 15, averagePrice: 100 })],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 130, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks.filter((row) => row.status === "Active")).toHaveLength(1);
    expect(plan.nextSnapshot.stocks.filter((row) => row.status !== "Active")).toEqual([february, april]);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "notes", ticker: "RELIANCE" }),
    ]);
  });

  it("keeps every note-bearing row and reports notes when an open and a closed row disagree", () => {
    const open = stock({
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      quantity: 10,
      notes: { tradeReason: "active thesis" },
    });
    const closed = stock({
      status: "Sold Profit",
      quantity: 5,
      entryPrice: 100,
      exitPrice: 120,
      exitDate: "1-Feb-2026",
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      notes: { tradeReason: "february" },
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [open, closed] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toEqual([closed, open]);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "notes", ticker: "RELIANCE" }),
    ]);
  });

  it("keeps every stored closed row and reports notes when no exit date matches", () => {
    const february = stock({ status: "Sold Profit", quantity: 5, entryPrice: 100, exitPrice: 120, exitDate: "1-Feb-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "february" } });
    const april = stock({ status: "Sold Loss", quantity: 5, entryPrice: 100, exitPrice: 90, exitDate: "1-Apr-2026", source: "indmoney", market: "NSE", currency: "INR", notes: { tradeReason: "april" } });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [february, april] }),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 10, price: 130, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toEqual([february, april]);
    expect(plan.preview.closedPositions).toEqual([]);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "notes", ticker: "RELIANCE" }),
    ]);
  });

  it("produces deeply equal plans for identical inputs", () => {
    const input = {
      snapshot: snapshot({
        stocks: [stock({ source: "indmoney", market: "NSE" as const, currency: "INR" as const, cmp: 0 })],
      }),
      snapshotUpdateTime: "t",
      holdings: [holding(), holding({ ticker: "TCS", quantity: 4, averagePrice: 3900, lastPrice: null, brokerRef: "NSE:TCS" })],
      unmatched: [],
      fills: [fill()],
      now: NOW,
    };

    expect(buildSyncPlan(input)).toEqual(buildSyncPlan(input));
  });

  it("does not mutate its inputs and never emits an explicit undefined", () => {
    const input = {
      snapshot: snapshot({ stocks: [stock({ source: "indmoney", market: "NSE" as const, currency: "INR", notes: { tradeReason: "x" } })] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [fill()],
      now: NOW,
    };
    const before = JSON.stringify(input);

    const plan = buildSyncPlan(input);

    expect(JSON.stringify(input)).toBe(before);
    assertNoUndefined(plan);
    expect(Object.prototype.hasOwnProperty.call(plan.nextSnapshot.stocks[0], "sector")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(plan.nextSnapshot.stocks[0], "exitDate")).toBe(false);
  });

  it("does not remove a synced row whose ticker has a manual row", () => {
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2 });
    const synced = stock({
      ticker: "TCS",
      stockName: "TCS",
      entryPrice: 3900,
      quantity: 5,
      source: "indmoney",
      market: "NSE",
      currency: "INR",
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [manual, synced] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toContain(manual);
    expect(plan.nextSnapshot.stocks).toContain(synced);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "manual-position", ticker: "TCS" }),
    ]);
    expect(plan.preview.openPositions).toEqual([
      { ticker: "RELIANCE", before: null, after: { quantity: 15, averagePrice: 2450 } },
    ]);
  });

  it("leaves a synced row alone when a manual row is added after it", () => {
    const synced = stock({
      ticker: "TCS",
      stockName: "TCS",
      entryPrice: 3900,
      quantity: 5,
      source: "indmoney",
      market: "NSE",
      currency: "INR",
    });
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [synced, manual] }),
      snapshotUpdateTime: "t",
      holdings: [holding({ ticker: "TCS", quantity: 9, averagePrice: 4000, brokerRef: "NSE:TCS" })],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toContain(synced);
    expect(plan.nextSnapshot.stocks).toContain(manual);
    expect(plan.preview.conflicts).toEqual([
      expect.objectContaining({ code: "manual-position", ticker: "TCS" }),
    ]);
    expect(plan.preview.openPositions).toEqual([]);
  });

  it("keeps stored execution rows it cannot use and reports them as warnings", () => {
    const malformed = execution({ id: "indmoney:BROKEN", quantity: 0 });
    const first = execution();
    const duplicate = execution({ price: 9999 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ executions: [malformed, first, duplicate] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.executions).toHaveLength(3);
    expect(plan.nextSnapshot.executions).toContain(malformed);
    expect(plan.nextSnapshot.executions).toContain(first);
    expect(plan.nextSnapshot.executions).toContain(duplicate);
    expect(plan.preview.executionsAdded).toBe(0);
    expect(plan.preview.warnings.join(" ")).toContain("unreadable");
    expect(plan.preview.warnings.join(" ")).toContain("duplicated");
  });

  it("ignores a duplicate fill with a different payload and warns", () => {
    const stored = execution({ id: "indmoney:T1", quantity: 10, price: 2400 });

    const plan = buildSyncPlan({
      snapshot: snapshot({ executions: [stored] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [fill({ quantity: 15, price: 2500 })],
      now: NOW,
    });

    expect(plan.nextSnapshot.executions).toHaveLength(1);
    expect(plan.nextSnapshot.executions?.[0]).toBe(stored);
    expect(plan.preview.executionsAdded).toBe(0);
    expect(plan.preview.warnings.join(" ")).toContain("different");
  });

  it("rescues a non-finite stored cmp from the broker's last price", () => {
    const previous = stock({
      cmp: Number.NaN,
      source: "indmoney",
      market: "NSE",
      currency: "INR",
    });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [previous] }),
      snapshotUpdateTime: "t",
      holdings: [holding({ lastPrice: 2612.35 })],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks[0].cmp).toBe(2612.35);
  });

  it("aggregates several sells into one weighted closed row", () => {
    const plan = buildSyncPlan({
      snapshot: snapshot(),
      snapshotUpdateTime: "t",
      holdings: [],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:B1", quantity: 10, price: 100, executedAt: "2026-01-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", side: "SELL", quantity: 4, price: 120, executedAt: "2026-02-01T04:30:00.000Z" }),
        fill({ id: "indmoney:S2", side: "SELL", quantity: 6, price: 150, executedAt: "2026-03-01T04:30:00.000Z" }),
      ],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks).toHaveLength(1);
    expect(plan.nextSnapshot.stocks[0]).toMatchObject({
      ticker: "RELIANCE",
      status: "Sold Profit",
      quantity: 10,
      entryDate: "1-Jan-2026",
      exitDate: "1-Mar-2026",
      entryPrice: 100,
    });
    expect(plan.nextSnapshot.stocks[0].exitPrice).toBeCloseTo((4 * 120 + 6 * 150) / 10);
  });

  it("omits weekHigh52 for a new synced row instead of fabricating zero", () => {
    const plan = buildSyncPlan({
      snapshot: snapshot(),
      snapshotUpdateTime: null,
      holdings: [holding()],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    const row = plan.nextSnapshot.stocks[0];
    expect(Object.prototype.hasOwnProperty.call(row, "weekHigh52")).toBe(false);
  });

  it("keeps the stored weekHigh52 when the broker reports the ticker", () => {
    const previous = stock({ source: "indmoney", market: "NSE", currency: "INR" });

    const plan = buildSyncPlan({
      snapshot: snapshot({ stocks: [previous] }),
      snapshotUpdateTime: "t",
      holdings: [holding()],
      unmatched: [],
      fills: [],
      now: NOW,
    });

    expect(plan.nextSnapshot.stocks[0].weekHigh52).toBe(2856.15);
  });

  it("is idempotent over a snapshot that includes notes and manual rows", () => {
    const manual = stock({ ticker: "TCS", stockName: "TCS", entryPrice: 3900, quantity: 2, notes: { tradeReason: "manual" } });
    const previousOpen = stock({
      ticker: "INFY",
      stockName: "Infosys",
      entryDate: "12-Dec-2025",
      entryPrice: 1890,
      cmp: 1756.4,
      quantity: 20,
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      notes: { tradeReason: "open thesis" },
    });
    const previousClosed = stock({
      ticker: "SBIN",
      stockName: "State Bank",
      entryDate: "25-Jan-2026",
      entryPrice: 782,
      cmp: 805.5,
      quantity: 30,
      exitPrice: 805.5,
      exitDate: "5-Mar-2026",
      status: "Sold Profit",
      source: "indmoney",
      market: "NSE",
      currency: "INR",
      notes: { tradeReason: "closed thesis" },
    });
    const input = {
      snapshot: snapshot({ stocks: [manual, previousOpen, previousClosed] }),
      snapshotUpdateTime: "t",
      holdings: [
        holding({ ticker: "INFY", quantity: 20, averagePrice: 1890, lastPrice: 1756.4, brokerRef: "NSE:INFY" }),
        holding(),
      ],
      unmatched: [],
      fills: [
        fill({ id: "indmoney:I1", ticker: "INFY", quantity: 20, price: 1890, executedAt: "2025-12-12T04:30:00.000Z" }),
        fill({ id: "indmoney:B1", ticker: "SBIN", quantity: 30, price: 782, executedAt: "2026-01-25T04:30:00.000Z" }),
        fill({ id: "indmoney:S1", ticker: "SBIN", side: "SELL", quantity: 30, price: 805.5, executedAt: "2026-03-05T04:30:00.000Z" }),
        fill(),
      ],
      now: NOW,
    };

    const first = buildSyncPlan(input);
    const second = buildSyncPlan({ ...input, snapshot: first.nextSnapshot });

    expect(second.preview.openPositions).toEqual([]);
    expect(second.preview.closedPositions).toEqual([]);
    expect(second.preview.executionsAdded).toBe(0);
    expect(second.nextSnapshot).toEqual(first.nextSnapshot);
    expect(second.nextSnapshot.stocks.find((row) => row.ticker === "INFY")?.notes).toEqual({ tradeReason: "open thesis" });
    expect(second.nextSnapshot.stocks.find((row) => row.ticker === "SBIN")?.notes).toEqual({ tradeReason: "closed thesis" });
  });
});
