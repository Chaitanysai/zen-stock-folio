import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const xlsxState = vi.hoisted(() => ({ matrix: [] as unknown[][] }));
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
    sheet_to_json: vi.fn(() => xlsxState.matrix),
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

/** A small file whose byte content is never read unless the component asks. */
const makeFile = (name = "trades.csv", size?: number) => {
  const file = new File(["stub"], name, { type: "text/csv" });
  if (typeof size === "number") Object.defineProperty(file, "size", { value: size });
  const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  return { file, arrayBuffer };
};

const openDialog = async (onImport = vi.fn()) => {
  render(<ImportTradesDialog onImport={onImport} />);
  fireEvent.click(screen.getByRole("button", { name: /import csv\/xlsx/i }));
  const dialog = await screen.findByRole("dialog");
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  return input;
};

beforeEach(() => {
  xlsxState.matrix = [];
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
    const onImport = vi.fn();
    const input = await openDialog(onImport);
    xlsxState.matrix = GROWW_ROWS;

    fireEvent.change(input, { target: { files: [makeFile("pnl.xlsx").file] } });

    expect(await screen.findByText(/header on row 31/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 trades ready to import/i)).toBeInTheDocument();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("INFY")).toBeInTheDocument();
    expect(screen.getByText("❌ Loss")).toBeInTheDocument();
    expect(screen.getByText("🟢 Open")).toBeInTheDocument();
    expect(screen.getByText(/1 open \/ 1 closed lots/)).toBeInTheDocument();
  });

  it("resolves a name-only row through the search fallback and imports the chosen symbol", async () => {
    const onImport = vi.fn();
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
    expect(onImport.mock.calls[0][0][0]).toMatchObject({
      ticker: "RELIANCE",
      entryPrice: 2450.5,
      quantity: 15,
      status: "Active",
    });
  });

  it("lets the user type a symbol for an unresolved row instead of importing it blind", async () => {
    const onImport = vi.fn();
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
    expect(onImport.mock.calls[0][0][0].ticker).toBe("UNK");
  });
});
