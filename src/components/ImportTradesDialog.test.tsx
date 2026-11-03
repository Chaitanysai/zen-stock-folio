import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerImportOutcome, BrokerImportRequest } from "@/lib/portfolio/brokerImport";

const xlsxState = vi.hoisted(() => ({
  matrix: [] as unknown[][],
  records: [] as Record<string, string>[],
}));
const isinFixture = vi.hoisted(() => ({
  default: {
    equities: [
      ["RELIANCE", "INE002A01018", "Reliance Industries Ltd"],
      ["INFY", "INE009A01021", "Infosys Ltd"],
    ],
  },
}));

vi.mock("xlsx", () => ({
  read: vi.fn(() => ({ SheetNames: ["Stocks"], Sheets: { Stocks: {} } })),
  utils: {
    sheet_to_json: vi.fn((_sheet: unknown, opts?: { header?: number }) =>
      opts?.header === 1 ? xlsxState.matrix : xlsxState.records,
    ),
  },
}));

vi.mock("@/lib/market-data/nseIsinMap.json", () => isinFixture);

import ImportTradesDialog from "./ImportTradesDialog";

const GROWW_ROWS: unknown[][] = [
  ...Array.from({ length: 30 }, (_, i) => [`Metadata row ${i + 1}`, "", "", "", "", "", "", "", "", "", ""]),
  [
    "Stock name", "ISIN", "Quantity", "Buy date", "Buy price", "Buy value",
    "Sell date", "Sell price", "Sell value", "Realised P&L", "Remark",
  ],
  ["Reliance Industries", "INE002A01018", "15", "01-03-2024", "2,450.50", "36,757.50", "", "", "", "", ""],
  ["Infosys", "INE009A01021", "20", "12-Dec-2025", "1,890", "37,800", "28-Feb-2026", "1,756.40", "35,128", "-2,672", ""],
];

const okOutcome = (overrides: Partial<BrokerImportOutcome> = {}): BrokerImportOutcome => ({
  ok: true,
  added: 1,
  replaced: 0,
  retained: 0,
  excluded: 0,
  ...overrides,
});

const makeHandler = (overrides: Partial<BrokerImportOutcome> = {}) =>
  vi.fn(
    async (_request: BrokerImportRequest): Promise<BrokerImportOutcome> => okOutcome(overrides),
  );

/** A small file whose byte content is never read unless the component asks. */
const makeFile = (name = "trades.csv", size?: number) => {
  const file = new File(["stub"], name, { type: "text/csv" });
  if (typeof size === "number") Object.defineProperty(file, "size", { value: size });
  const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  return { file, arrayBuffer };
};

const openDialog = async (
  onImport = makeHandler(),
  existingStocks: PortfolioStock[] = [],
) => {
  render(<ImportTradesDialog onImport={onImport} existingStocks={existingStocks} />);
  fireEvent.click(screen.getByRole("button", { name: /import csv\/xlsx/i }));
  const dialog = await screen.findByRole("dialog");
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  return input;
};

beforeEach(() => {
  xlsxState.matrix = [];
  xlsxState.records = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  );
});

describe("ImportTradesDialog file guards", () => {
  it("rejects a file over 5 MB before calling arrayBuffer()", async () => {
    const input = await openDialog();
    const { file, arrayBuffer } = makeFile("huge.csv", 5 * 1024 * 1024 + 1);

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/file is too large/i)).toBeInTheDocument();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("reports when no sheet carries a statement header", async () => {
    const input = await openDialog();
    xlsxState.matrix = [["hello", "world"]];

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/No statement header found/i)).toBeInTheDocument();
    expect(screen.queryByText(/ready to import/i)).not.toBeInTheDocument();
  });

  it("rejects more than 5,000 statement rows", async () => {
    const input = await openDialog();
    const header = GROWW_ROWS[30];
    const dataRow = GROWW_ROWS[31];
    xlsxState.matrix = [...GROWW_ROWS.slice(0, 31), ...Array.from({ length: 5001 }, () => dataRow)];

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/limit is 5,000/i)).toBeInTheDocument();
    expect(screen.queryByText(/ready to import/i)).not.toBeInTheDocument();
  });
});

describe("ImportTradesDialog statement parsing", () => {
  it("parses a Groww-style report with the header 31 rows down and previews open and closed lots", async () => {
    const input = await openDialog();
    xlsxState.matrix = GROWW_ROWS;

    fireEvent.change(input, { target: { files: [makeFile("pnl.xlsx").file] } });

    expect(await screen.findByText(/header on row 31/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 trades ready to import/i)).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText(/1 open \/ 1 closed lots/)).toBeInTheDocument();
    expect(screen.getByText(/Detected Groww/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Groww" })).toBeChecked();
    expect(screen.getByText(/Groww statement · 2 added · 0 replaced · 0 retained · 0 excluded/i)).toBeInTheDocument();
  });

  it("resolves a name-only row through the search fallback and imports the chosen symbol", async () => {
    const onImport = makeHandler();
    const input = await openDialog(onImport);
    xlsxState.matrix = [
      ["Stock name", "Quantity", "Buy price", "Buy value"],
      ["Reliance Industries Overseas Holdings", "15", "2,450.50", "36,757.50"],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/search")) {
          return new Response(
            JSON.stringify({ hits: [{ symbol: "RELIANCE", instrumentType: "EQUITY" }] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/1 trade ready to import/i)).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /import 1 trade/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const request = onImport.mock.calls[0][0];
    expect(request.source).toBe("groww");
    expect(request.stocks[0]).toMatchObject({
      ticker: "RELIANCE",
      entryPrice: 2450.5,
      quantity: 15,
      status: "Active",
    });
  });

  it("lets the user type a symbol for an unresolved row instead of importing it blind", async () => {
    const onImport = makeHandler();
    const input = await openDialog(onImport);
    xlsxState.matrix = [
      ["Stock name", "Quantity", "Buy price", "Buy value"],
      ["Completely Unknown Industries", "5", "100", "500"],
    ];

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/could not be matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/ready to import/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. TATAMOTORS/i), { target: { value: "unk" } });

    expect(await screen.findByText(/1 trade ready to import/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import 1 trade/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0].stocks[0].ticker).toBe("UNK");
  });

  it("requires confirmation before replacing this broker's existing rows", async () => {
    const onImport = makeHandler({ added: 2, replaced: 1, retained: 0 });
    const existing: PortfolioStock[] = [
      {
        ticker: "TCS",
        stockName: "Tata Consultancy Services",
        entryPrice: 3500,
        cmp: 3700,
        quantity: 5,
        status: "Active",
        source: "groww",
        statementFingerprint: "groww|TCS|#0",
      },
    ];
    const input = await openDialog(onImport, existing);
    xlsxState.matrix = GROWW_ROWS;

    fireEvent.change(input, { target: { files: [makeFile("pnl.xlsx").file] } });

    expect(await screen.findByText(/will be compared against this statement/i)).toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: /import 2 trades/i });
    expect(importButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /confirm replacing/i }));
    await waitFor(() => expect(importButton).toBeEnabled());

    fireEvent.click(importButton);
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const request = onImport.mock.calls[0][0];
    expect(request.source).toBe("groww");
    expect(request.stocks).toHaveLength(2);
  });

  it("shows unknown cost and missing dates instead of inventing them", async () => {
    const onImport = makeHandler();
    const input = await openDialog(onImport);
    xlsxState.matrix = [
      ["Stock name", "ISIN", "Quantity", "Market Value"],
      ["Infosys", "INE009A01021", "10", "17,564"],
    ];

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/1 trade ready to import/i)).toBeInTheDocument();
    expect(screen.getByText(/1 row has no purchase price/i)).toBeInTheDocument();
    expect(screen.getByText(/1 row has no transaction date/i)).toBeInTheDocument();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /import 1 trade/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const imported = onImport.mock.calls[0][0].stocks[0];
    expect(imported).toMatchObject({ ticker: "INFY", entryPrice: null, cmp: 1756.4, status: "Active" });
    expect(imported.entryDate).toBeUndefined();
    expect(imported.weekHigh52).toBeUndefined();
  });

  it("reports excluded statement rows and passes the exclusion count to the import", async () => {
    const onImport = makeHandler();
    const input = await openDialog(onImport);
    xlsxState.matrix = [
      ["Stock name", "ISIN", "Quantity", "Buy price"],
      ["Reliance Industries", "INE002A01018", "15", "2,450.50"],
      ["Infosys", "INE009A01021", "abc", "1,890"],
    ];

    fireEvent.change(input, { target: { files: [makeFile().file] } });

    expect(await screen.findByText(/1 row in the statement cannot be imported/i)).toBeInTheDocument();
    expect(screen.getByText(/Row 3 · invalid quantity/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /import 1 trade/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0].excluded).toBe(1);
  });

  it("imports a template CSV as an append-only manual import", async () => {
    const onImport = makeHandler();
    const input = await openDialog(onImport);
    xlsxState.records = [
      {
        Ticker: "RELIANCE",
        "Stock Name": "Reliance Industries",
        "Entry Date": "10-Jan-2026",
        "Entry Price": "2450",
        CMP: "2612.35",
        "52W High": "2856.15",
        Quantity: "15",
        "Exit Price": "",
        "Exit Date": "",
        Status: "Active",
      },
    ];

    fireEvent.change(input, { target: { files: [makeFile("trade_template.csv").file] } });

    expect(await screen.findByText(/Template CSV — rows are added to your portfolio/i)).toBeInTheDocument();
    expect(screen.queryByText(/No statement header found/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/1 trade ready to import/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /import 1 trade/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const request = onImport.mock.calls[0][0];
    expect(request.source).toBeUndefined();
    expect(request.stocks[0]).toMatchObject({ ticker: "RELIANCE", entryPrice: 2450, quantity: 15, source: "manual" });
  });
});
