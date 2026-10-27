import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FnOTable from "./FnOTable";
import type { FnOTrade } from "@/data/sampleData";

vi.mock("@/hooks/useMarketStatus", () => ({
  useMarketStatus: () => ({ isOpen: false }),
}));

const openTrade: FnOTrade = {
  id: "fno-test-1",
  symbol: "RELIANCE",
  instrumentType: "FUT",
  expiry: "27-03-2025",
  lotSize: 250,
  lots: 2,
  entryPrice: 2500,
  entryDate: "10-03-2025",
  status: "Open",
  ltp: 2520,
};

function setup(trades: FnOTrade[] = [openTrade]) {
  const onUpdate = vi.fn();
  render(<FnOTable trades={trades} onUpdate={onUpdate} />);
  return { onUpdate };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Keep the external request pending so price updates cannot be mistaken for
  // persistence callbacks in interaction tests.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

describe("FnOTable accessibility", () => {
  it("exposes pressed state on filters and descriptive names on row actions", () => {
    setup();

    const all = screen.getByRole("button", { name: "All" });
    const futures = screen.getByRole("button", { name: "Futures" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(futures).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(futures);
    expect(futures).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Edit RELIANCE trade" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete RELIANCE trade" })).toBeInTheDocument();
  });

  it("opens an accessible dialog and labels every trade form control", async () => {
    setup([]);

    fireEvent.click(screen.getByRole("button", { name: "Add Trade" }));
    const dialog = await screen.findByRole("dialog", { name: "Add F&O Trade" });
    expect(dialog).toHaveAccessibleDescription(/record a futures or options position/i);

    const futures = within(dialog).getByRole("button", { name: "Futures" });
    expect(futures).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Call (CE)" })).toHaveAttribute("aria-pressed", "false");

    for (const label of [
      /^Symbol/,
      /^Expiry Date/,
      /^Lots/,
      /^Lot Size/,
      /^Entry Price/,
      "Entry Date",
      /^Exit Price/,
      "Exit Date",
      "Status",
      "Notes / Trade Reason",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }

    fireEvent.click(within(dialog).getByRole("button", { name: "Call (CE)" }));
    expect(futures).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Call (CE)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByLabelText(/^Strike Price/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Entry Premium/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Exit Premium/)).toBeInTheDocument();
  });

  it("closes the trade dialog with Escape without saving", async () => {
    const { onUpdate } = setup([]);

    fireEvent.click(screen.getByRole("button", { name: "Add Trade" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("FnOTable preserved data flows", () => {
  it("adds a trade with the existing normalized data contract", async () => {
    const { onUpdate } = setup([]);

    fireEvent.click(screen.getByRole("button", { name: "Add Trade" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Symbol/), { target: { value: "reliance" } });
    fireEvent.change(within(dialog).getByLabelText(/^Expiry Date/), { target: { value: "27-03-2025" } });
    fireEvent.change(within(dialog).getByLabelText(/^Lots/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/^Entry Price/), { target: { value: "2500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Trade" }));

    expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({
        symbol: "RELIANCE",
        instrumentType: "FUT",
        expiry: "27-03-2025",
        lotSize: 250,
        lots: 2,
        entryPrice: 2500,
        status: "Open",
      }),
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a trade without dropping its identity or position data", async () => {
    const { onUpdate } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Edit RELIANCE trade" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit F&O Trade" });
    fireEvent.change(within(dialog).getByLabelText(/^Entry Price/), { target: { value: "2600" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ id: "fno-test-1", symbol: "RELIANCE", entryPrice: 2600, lotSize: 250, lots: 2 }),
    ]);
  });

  it("keeps the live-price request and update contracts unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: "upstox",
        ltpMap: { "fno-test-1": { ltp: 2535, change: 35, iv: 18.5, delta: 0.42 } },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onUpdate } = setup();

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({ id: "fno-test-1", ltp: 2535, dayChange: 35, iv: 18.5, delta: 0.42 }),
    ]));
    expect(fetchMock).toHaveBeenCalledWith("/api/fno-prices", expect.objectContaining({
      method: "POST",
      // Headers is now a Headers instance: apiFetch adds the bearer token (or
      // leaves it off when signed out) instead of a plain literal.
      headers: expect.any(Headers),
      body: JSON.stringify({
        trades: [{
          id: "fno-test-1",
          symbol: "RELIANCE",
          instrumentType: "FUT",
          strike: undefined,
          expiry: "27-03-2025",
          lotSize: 250,
          lots: 2,
        }],
      }),
    }));
    const sentHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.get("Content-Type")).toBe("application/json");
  });
});

describe("FnOTable deletion", () => {
  it("requires AlertDialog confirmation and preserves the trade when cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onUpdate } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Delete RELIANCE trade" }));
    const alert = await screen.findByRole("alertdialog", { name: "Delete F&O trade?" });
    expect(alert).toHaveAccessibleDescription(/RELIANCE.*cannot be undone/i);
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
  });

  it("deletes only the confirmed trade through onUpdate", async () => {
    const { onUpdate } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Delete RELIANCE trade" }));
    const alert = await screen.findByRole("alertdialog");
    fireEvent.click(within(alert).getByRole("button", { name: "Delete trade" }));

    expect(onUpdate).toHaveBeenCalledWith([]);
  });
});
