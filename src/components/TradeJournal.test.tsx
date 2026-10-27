import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import TradeJournal from "./TradeJournal";

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

describe("TradeJournal empty state", () => {
  it("explains what appears once there are trades", () => {
    render(<TradeJournal stocks={[]} onUpdateNotes={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Nothing to journal yet" })).toBeInTheDocument();
  });
});

describe("TradeJournal editor", () => {
  it("associates each journal field with its visible label and preserves saving", () => {
    const onUpdateNotes = vi.fn();
    render(<TradeJournal stocks={[stock]} onUpdateNotes={onUpdateNotes} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Notes" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Trade Reason"), {
      target: { value: "Breakout above resistance" },
    });
    expect(within(dialog).getByLabelText("Market Condition")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Strategy Used")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Mistakes / Lessons Learned")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(4);

    fireEvent.click(within(dialog).getByRole("button", { name: "Save Journal Entry" }));
    expect(onUpdateNotes).toHaveBeenCalledWith("RELIANCE", {
      tradeReason: "Breakout above resistance",
    });
  });
});
