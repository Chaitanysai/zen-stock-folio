import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import PortfolioTable from "./PortfolioTable";

vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => ({ prices: {} }) }));
vi.mock("./AddTransactionDialog", () => ({ default: () => <button>Add transaction</button> }));
vi.mock("./ImportTradesDialog", () => ({ default: () => <button>Import trades</button> }));
vi.mock("./EditTransactionDialog", () => ({ default: () => null }));

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

const setup = () => {
  const props = { onAdd: vi.fn(), onImport: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(<PortfolioTable stocks={[stock]} {...props} />);
  return props;
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
