import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WatchlistTable from "./WatchlistTable";
import type { WatchlistStock } from "@/data/sampleData";

const makeStock = (stockName: string): WatchlistStock => ({
  stockName,
  cmp: 2612.35,
  entryZoneLow: 2550,
  entryZoneHigh: 2600,
  stopLoss: 2450,
  target1: 2700,
  target2: 2800,
  target3: 2900,
  rsi: 55,
  sma50: 2580,
  ema10: 2600,
  ema21: 2590,
});

const setup = (watchlist: WatchlistStock[] = []) => {
  const onAdd = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <WatchlistTable
      watchlist={watchlist}
      onAdd={onAdd}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );
  return { onAdd, onEdit, onDelete };
};

const openAddDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: "Add Stock" }));
  return screen.getByRole("dialog");
};

const fillRequiredFields = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    "Ticker Symbol": "TCS",
    "CMP": "3845.20",
    "Entry Zone Low": "3800",
    "Entry Zone High": "3860",
    "Stop Loss": "3700",
    "Target 1": "4000",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`, "i")), {
      target: { value },
    });
  }
};

describe("WatchlistTable add flow", () => {
  it("shows an empty state with both a header and empty-state add action", () => {
    setup([]);

    expect(screen.getByText(/no watchlist stocks yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add your first stock" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Stock" }),
    ).toBeInTheDocument();
  });

  it("adds a normalized stock through onAdd", () => {
    const { onAdd } = setup([]);

    openAddDialog();
    fillRequiredFields({ "Ticker Symbol": "  tcs " });
    fireEvent.click(screen.getByRole("button", { name: "Add to Watchlist" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith({
      stockName: "TCS",
      cmp: 3845.2,
      entryZoneLow: 3800,
      entryZoneHigh: 3860,
      stopLoss: 3700,
      target1: 4000,
      target2: 4000,
      target3: 4000,
      rsi: 0,
      sma50: 0,
      ema10: 0,
      ema21: 0,
    });
  });

  it("blocks duplicates and keeps the dialog open with an error", () => {
    const { onAdd } = setup([makeStock("RELIANCE")]);

    openAddDialog();
    fillRequiredFields({ "Ticker Symbol": " reliance " });
    fireEvent.click(screen.getByRole("button", { name: "Add to Watchlist" }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "RELIANCE is already in your watchlist.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a validation error for an inverted entry zone", () => {
    const { onAdd } = setup([]);

    openAddDialog();
    fillRequiredFields({ "Entry Zone Low": "3900", "Entry Zone High": "3800" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Watchlist" }));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Entry zone low cannot be higher than entry zone high.",
    );
  });
});

describe("WatchlistTable existing actions", () => {
  it("preserves edit behavior", async () => {
    const { onEdit } = setup([makeStock("RELIANCE")]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for RELIANCE" }),
      { key: "Enter" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByDisplayValue("RELIANCE"), {
      target: { value: "RELIANCE2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(
      "RELIANCE",
      expect.objectContaining({ stockName: "RELIANCE2", cmp: 2612.35 }),
    );
  });

  it("associates edit inputs with their visible labels", async () => {
    setup([makeStock("RELIANCE")]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for RELIANCE" }),
      { key: "Enter" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /edit/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Stock Name")).toHaveValue("RELIANCE");
    expect(within(dialog).getByLabelText("Entry Zone Low (₹)")).toHaveValue(2550);
    expect(within(dialog).getByLabelText("Target 3 (₹)")).toHaveValue(2900);
    expect(within(dialog).getByLabelText("EMA 21")).toHaveValue(2590);
  });

  it("preserves delete behavior", async () => {
    const { onDelete } = setup([makeStock("RELIANCE")]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for RELIANCE" }),
      { key: "Enter" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));

    const alert = await screen.findByRole("alertdialog");
    fireEvent.click(within(alert).getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("RELIANCE");
  });
});
