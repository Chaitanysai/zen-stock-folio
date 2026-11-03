import { describe, expect, it } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import { planBrokerImport, type BrokerImportRequest } from "./brokerImport";

const stock = (overrides: Partial<PortfolioStock>): PortfolioStock => ({
  ticker: "X",
  stockName: "X Ltd",
  entryPrice: 100,
  cmp: 110,
  quantity: 10,
  status: "Active",
  ...overrides,
});

const groww = (fingerprint: string, overrides: Partial<PortfolioStock> = {}) =>
  stock({ source: "groww", statementFingerprint: fingerprint, ...overrides });

const zerodha = (fingerprint: string, overrides: Partial<PortfolioStock> = {}) =>
  stock({ source: "zerodha", statementFingerprint: fingerprint, ...overrides });

const request = (overrides: Partial<BrokerImportRequest>): BrokerImportRequest => ({
  stocks: [],
  ...overrides,
});

describe("planBrokerImport — broker-scoped replacement", () => {
  it("replaces only the selected broker's rows and keeps every other source intact", () => {
    const manual = stock({ ticker: "MANUAL" });
    const indmoney = stock({ ticker: "INDMONEY", source: "indmoney" });
    const oldGroww = groww("groww|OLD");
    const keptGroww = groww("groww|KEPT");
    const oldZerodha = zerodha("zerodha|OLD");

    const existing = [manual, indmoney, oldGroww, keptGroww, oldZerodha];
    const plan = planBrokerImport(
      existing,
      request({
        source: "groww",
        stocks: [groww("groww|KEPT"), groww("groww|NEW")],
        excluded: 2,
      }),
    );

    expect(plan.error).toBeNull();
    expect(plan).toMatchObject({ added: 1, replaced: 1, retained: 1, excluded: 2 });

    // Non-Groww rows survive by identity, in their original order.
    expect(plan.nextStocks.slice(0, 3)).toEqual([manual, indmoney, oldZerodha]);
    expect(plan.nextStocks.filter((row) => row.source === "groww")).toHaveLength(2);
    expect(plan.nextStocks.map((row) => row.statementFingerprint)).not.toContain("groww|OLD");
  });

  it("leaves Groww rows untouched when the imported statement is Zerodha", () => {
    const growwRow = groww("groww|A");
    const plan = planBrokerImport(
      [growwRow, zerodha("zerodha|OLD")],
      request({ source: "zerodha", stocks: [zerodha("zerodha|NEW")] }),
    );

    expect(plan.nextStocks[0]).toBe(growwRow);
    expect(plan).toMatchObject({ added: 1, replaced: 1, retained: 0 });
  });

  it("reports changed rows as replaced and additional rows as added", () => {
    const plan = planBrokerImport(
      [groww("groww|LOT", { quantity: 10 })],
      request({
        source: "groww",
        stocks: [
          groww("groww|LOT-REVISED", { quantity: 12 }),
          groww("groww|EXTRA"),
        ],
      }),
    );

    expect(plan).toMatchObject({ added: 2, replaced: 1, retained: 0 });
  });
});

describe("planBrokerImport — re-import stability", () => {
  it("importing the same Zerodha statement three times keeps the portfolio unchanged", () => {
    const statement = [
      zerodha("zerodha|A#0"),
      zerodha("zerodha|B#0"),
    ];

    const first = planBrokerImport([], request({ source: "zerodha", stocks: statement }));
    expect(first).toMatchObject({ added: 2, replaced: 0, retained: 0 });
    expect(first.nextStocks).toHaveLength(2);

    const second = planBrokerImport(first.nextStocks, request({ source: "zerodha", stocks: statement }));
    expect(second).toMatchObject({ added: 0, replaced: 0, retained: 2 });
    expect(second.nextStocks.map((row) => row.statementFingerprint)).toEqual(["zerodha|A#0", "zerodha|B#0"]);

    const third = planBrokerImport(second.nextStocks, request({ source: "zerodha", stocks: statement }));
    expect(third).toMatchObject({ added: 0, replaced: 0, retained: 2 });
    expect(third.nextStocks).toHaveLength(2);
  });

  it("keeps genuinely identical lots distinct instead of collapsing them", () => {
    const duplicates = [zerodha("zerodha|SAME#0"), zerodha("zerodha|SAME#1")];

    const first = planBrokerImport([], request({ source: "zerodha", stocks: duplicates }));
    expect(first.nextStocks).toHaveLength(2);

    const second = planBrokerImport(first.nextStocks, request({ source: "zerodha", stocks: duplicates }));
    expect(second).toMatchObject({ added: 0, replaced: 0, retained: 2 });
    expect(second.nextStocks).toHaveLength(2);
  });
});

describe("planBrokerImport — safety", () => {
  it("refuses an empty broker statement without deleting prior rows", () => {
    const existing = [groww("groww|A"), stock({ ticker: "MANUAL" })];
    const plan = planBrokerImport(existing, request({ source: "groww", stocks: [] }));

    expect(plan.error).toMatch(/no importable rows/i);
    expect(plan.nextStocks).toBe(existing);
    expect(plan).toMatchObject({ added: 0, replaced: 0, retained: 0 });
  });
});

describe("planBrokerImport — template CSV", () => {
  const templateRow = stock({ ticker: "RELIANCE", entryDate: "10 Jan 2026", entryPrice: 2450, quantity: 15 });

  it("appends new template rows, tags them manual, and never deletes", () => {
    const existing = stock({ ticker: "EXISTING", source: "manual" });
    const plan = planBrokerImport(
      [existing, { ...templateRow }],
      request({ stocks: [templateRow, stock({ ticker: "INFY", entryPrice: 1890 })] }),
    );

    expect(plan.error).toBeNull();
    expect(plan).toMatchObject({ added: 1, replaced: 0, retained: 1 });
    expect(plan.nextStocks[0]).toBe(existing);
    expect(plan.nextStocks[2].ticker).toBe("INFY");
    expect(plan.nextStocks[2].source).toBe("manual");
  });

  it("does not duplicate a template row that is already present", () => {
    const plan = planBrokerImport(
      [templateRow],
      request({ stocks: [{ ...templateRow }] }),
    );

    expect(plan).toMatchObject({ added: 0, retained: 1 });
    expect(plan.nextStocks).toHaveLength(1);
  });
});
