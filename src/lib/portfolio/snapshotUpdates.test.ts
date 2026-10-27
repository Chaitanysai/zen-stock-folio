import { describe, expect, it } from "vitest";
import { journalNotesPatch } from "./snapshotUpdates";
import type { PortfolioSnapshot } from "@/lib/data/snapshotTypes";
import type { PortfolioStock } from "@/data/sampleData";

const makeStock = (
  ticker: string,
  overrides: Partial<PortfolioStock> = {},
): PortfolioStock => ({
  ticker,
  stockName: `${ticker} Ltd`,
  entryDate: "2026-01-05",
  entryPrice: 100,
  cmp: 110,
  weekHigh52: 150,
  weekLow52: 80,
  quantity: 10,
  status: "Active",
  ...overrides,
});

const baseSnapshot = (): PortfolioSnapshot => ({
  stocks: [
    makeStock("ALPHA"),
    makeStock("BETA", { notes: { tradeReason: "original" } }),
  ],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
});

/** Mirrors the merge Index's applySnapshot performs. */
const applySnapshot = (
  current: PortfolioSnapshot,
  partial: Partial<PortfolioSnapshot>,
): PortfolioSnapshot => ({ ...current, ...partial });

describe("journalNotesPatch", () => {
  it("updates notes while preserving every unrelated stock field", () => {
    const snapshot = baseSnapshot();

    const patch = journalNotesPatch(snapshot, "ALPHA", {
      tradeReason: "Breakout above resistance",
      mistakesLearned: "Size down next time",
    });

    const updated = patch.stocks.find((stock) => stock.ticker === "ALPHA");
    expect(updated?.notes).toEqual({
      tradeReason: "Breakout above resistance",
      mistakesLearned: "Size down next time",
    });
    expect(updated).toMatchObject({
      ticker: "ALPHA",
      stockName: "ALPHA Ltd",
      entryDate: "2026-01-05",
      entryPrice: 100,
      cmp: 110,
      weekHigh52: 150,
      weekLow52: 80,
      quantity: 10,
      status: "Active",
    });
    // Immutable: the source snapshot is not mutated.
    expect(snapshot.stocks[0].notes).toBeUndefined();
  });

  it("keeps updated notes when a later persisted mutation reuses the snapshot", () => {
    let snapshotRef = baseSnapshot();

    snapshotRef = applySnapshot(
      snapshotRef,
      journalNotesPatch(snapshotRef, "ALPHA", { tradeReason: "Breakout" }),
    );
    // A subsequent persisted mutation (adding a trade) merges the snapshot
    // that already carries the note instead of a stale stocks array.
    snapshotRef = applySnapshot(snapshotRef, {
      stocks: [...snapshotRef.stocks, makeStock("GAMMA")],
    });

    expect(
      snapshotRef.stocks.find((stock) => stock.ticker === "ALPHA")?.notes,
    ).toEqual({ tradeReason: "Breakout" });
    expect(snapshotRef.stocks.map((stock) => stock.ticker)).toEqual([
      "ALPHA",
      "BETA",
      "GAMMA",
    ]);
  });

  it("survives a serialized reload of the persisted snapshot", () => {
    const afterNotes = applySnapshot(
      baseSnapshot(),
      journalNotesPatch(baseSnapshot(), "BETA", {
        tradeReason: "Support bounce",
        marketCondition: "Sideways",
      }),
    );

    const reloaded = JSON.parse(JSON.stringify(afterNotes)) as PortfolioSnapshot;

    expect(
      reloaded.stocks.find((stock) => stock.ticker === "BETA")?.notes,
    ).toEqual({
      tradeReason: "Support bounce",
      marketCondition: "Sideways",
    });
  });

  it("leaves the stocks array untouched for an unknown ticker", () => {
    const snapshot = baseSnapshot();

    const patch = journalNotesPatch(snapshot, "MISSING", {
      tradeReason: "No-op",
    });

    expect(patch.stocks).toBe(snapshot.stocks);
  });
});
