import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import PortfolioTable from "./PortfolioTable";

vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => ({ prices: {} }) }));
vi.mock("./AddTransactionDialog", () => ({ default: () => <button>Add transaction</button> }));
vi.mock("./ImportTradesDialog", () => ({ default: () => <button>Import trades</button> }));

const stock = {
  ticker: "RELIANCE",
  stockName: "Reliance Industries",
  entryPrice: 100,
  cmp: 120,
  quantity: 10,
  status: "Active",
  entryDate: "01-Jan-2026",
  weekHigh52: 130,
  weekLow52: 90,
} as PortfolioStock;

const usStock = {
  ...stock,
  ticker: "AAPL",
  stockName: "Apple",
  market: "US",
  currency: "USD",
} as PortfolioStock;

const setup = (stocks: PortfolioStock[] = [stock], usdInr: number | null = 85) => {
  const props = {
    onAdd: vi.fn(),
    onImport: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    usdInr,
  };
  render(<PortfolioTable stocks={stocks} {...props} />);
  return props;
};

/** Every dotted path whose value is `undefined`. */
const undefinedPaths = (value: unknown, path = ""): string[] => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (child === undefined) return [childPath];
    return undefinedPaths(child, childPath);
  });
};

describe("PortfolioTable accessible controls", () => {
  it("names the select-all and row selection checkboxes", () => {
    setup();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all positions" }));
    expect(screen.getByRole("checkbox", { name: "Select RELIANCE" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select RELIANCE" }));
    expect(screen.getByRole("checkbox", { name: "Select all positions" })).not.toBeChecked();
  });

  it("names the row action menu with its ticker", () => {
    setup();
    expect(screen.getByRole("button", { name: "Actions for RELIANCE" })).toBeInTheDocument();
  });
});

describe("PortfolioTable position identity", () => {
  it("keeps a U.S. row's market and currency when the edit dialog saves", async () => {
    const { onEdit } = setup([usStock]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for AAPL" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));
    const dialog = await screen.findByRole("dialog");
    // Labels follow the row's currency: a U.S. row must not read in rupees.
    expect(within(dialog).getByText("Edit Transaction — AAPL ($ USD)")).toBeInTheDocument();
    expect(within(dialog).getByText("Entry Price ($)")).toBeInTheDocument();
    expect(within(dialog).getByText("CMP ($) *")).toBeInTheDocument();
    expect(within(dialog).getByText("52W High ($)")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    // The key stays `US:AAPL` and the saved row must not collapse to NSE/INR.
    expect(onEdit).toHaveBeenCalledWith(
      "US:AAPL",
      expect.objectContaining({ market: "US", currency: "USD" }),
    );
  });

  it("keeps rupee labels and title for an Indian row", async () => {
    setup([stock]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for RELIANCE" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Edit Transaction — RELIANCE (₹ INR)")).toBeInTheDocument();
    expect(within(dialog).getByText("Entry Price (₹)")).toBeInTheDocument();
    expect(within(dialog).getByText("CMP (₹) *")).toBeInTheDocument();
  });

  it("saves an active row without any undefined field", async () => {
    const { onEdit } = setup([usStock]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for AAPL" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    const saved = onEdit.mock.calls[0]?.[1] as PortfolioStock;
    // No `ignoreUndefinedProperties` is configured, so Firestore rejects the
    // whole snapshot if any field is `undefined` -- the edit would never sync.
    expect(undefinedPaths(saved)).toEqual([]);
    expect("exitPrice" in saved).toBe(false);
    expect("exitDate" in saved).toBe(false);
  });
});

describe("PortfolioTable native currency", () => {
  it("shows USD prices but converts the Value column to INR", () => {
    setup([usStock], 85);

    expect(screen.getByText("$100.00")).toBeInTheDocument(); // avg cost
    expect(screen.getByText("$120.00")).toBeInTheDocument(); // LTP
    expect(screen.getByText("$1,000")).toBeInTheDocument(); // invested: 10 × 100
    expect(screen.getByText("+$200")).toBeInTheDocument(); // P&L: 10 × (120 − 100)
    expect(screen.getByText("US · USD")).toBeInTheDocument(); // badge
    expect(screen.getByText("₹1,02,000")).toBeInTheDocument(); // 10 × 120 × 85
  });

  it("renders an unavailable INR value rather than a guessed one", () => {
    setup([usStock], null);

    expect(screen.getByTitle("USD→INR rate unavailable")).toHaveTextContent("—");
    // Native cells keep their USD figures; only Value is unavailable.
    expect(screen.getByText("$120.00")).toBeInTheDocument();
  });
});

describe("PortfolioTable unpriced rows", () => {
  it("renders an em dash for LTP, P&L and Value when cmp is the 0 sentinel", () => {
    const unpriced = { ...stock, ticker: "TCS", stockName: "TCS", cmp: 0 } as PortfolioStock;
    setup([stock, unpriced]);

    const pricedRow = screen
      .getByRole("button", { name: "Actions for RELIANCE" })
      .closest("tr") as HTMLElement;
    const unpricedRow = screen
      .getByRole("button", { name: "Actions for TCS" })
      .closest("tr") as HTMLElement;

    // The priced row keeps its numbers.
    expect(within(pricedRow).getByText("₹120.00")).toBeInTheDocument();
    expect(within(pricedRow).getByText("+₹200")).toBeInTheDocument();
    expect(within(pricedRow).getByText("₹1,200")).toBeInTheDocument();

    // LTP, Day %, Exit, P&L and Value are all unknown for the unpriced row.
    expect(within(unpricedRow).getAllByText("—")).toHaveLength(5);
    expect(within(unpricedRow).queryByText("₹0.00")).toBeNull();
    expect(within(unpricedRow).getByTitle("No market price")).toBeInTheDocument();
  });
});
