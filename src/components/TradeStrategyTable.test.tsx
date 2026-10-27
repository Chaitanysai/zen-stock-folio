import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TradeStrategy } from "@/data/sampleData";
import TradeStrategyTable from "./TradeStrategyTable";

const trade: TradeStrategy = {
  ticker: "RELIANCE",
  entryPrice: 2450,
  livePrice: 2612.35,
  target1: 2700,
  target2: 2850,
  target3: 3000,
  stopLoss: 2300,
  trailingStopLoss: 2400,
};

const openEdit = async () => {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for RELIANCE" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: /edit trade/i }));
  return screen.findByRole("dialog");
};

describe("TradeStrategyTable edit dialog", () => {
  it("associates every field with its visible label", async () => {
    render(<TradeStrategyTable trades={[trade]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const dialog = await openEdit();

    expect(within(dialog).getByLabelText("Ticker")).toHaveValue("RELIANCE");
    expect(within(dialog).getByLabelText("Entry Price (₹)")).toHaveValue(2450);
    expect(within(dialog).getByLabelText("Target 1 (₹)")).toHaveValue(2700);
    expect(within(dialog).getByLabelText("Target 2 (₹)")).toHaveValue(2850);
    expect(within(dialog).getByLabelText("Target 3 (₹)")).toHaveValue(3000);
    expect(within(dialog).getByLabelText("Stop Loss (₹)")).toHaveValue(2300);
    expect(within(dialog).getByLabelText("Trailing SL (₹)")).toHaveValue(2400);
  });

  it("saves edits through onEdit with the original ticker", async () => {
    const onEdit = vi.fn();
    render(<TradeStrategyTable trades={[trade]} onEdit={onEdit} onDelete={vi.fn()} />);
    const dialog = await openEdit();

    fireEvent.change(within(dialog).getByLabelText("Target 1 (₹)"), { target: { value: "2750" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(onEdit).toHaveBeenCalledWith("RELIANCE", expect.objectContaining({ target1: 2750, livePrice: 2612.35 }));
  });

  it("shows a designed empty state when there are no setups", () => {
    render(<TradeStrategyTable trades={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "No trade setups yet" })).toBeInTheDocument();
  });
});
