import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PriceAlerts from "./PriceAlerts";
import type { PriceAlert } from "@/data/sampleData";

const makeAlert = (overrides: Partial<PriceAlert> = {}): PriceAlert => ({
  id: "alert-1",
  ticker: "RELIANCE",
  type: "target_hit",
  targetPrice: 2700,
  direction: "above",
  triggered: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const setup = (alerts: PriceAlert[] = []) => {
  const onAddAlert = vi.fn();
  const onDeleteAlert = vi.fn();
  const onDismissAlert = vi.fn();
  render(
    <PriceAlerts
      alerts={alerts}
      onAddAlert={onAddAlert}
      onDeleteAlert={onDeleteAlert}
      onDismissAlert={onDismissAlert}
    />,
  );
  return { onAddAlert, onDeleteAlert, onDismissAlert };
};

const openAddDialog = () => {
  fireEvent.click(screen.getByRole("button", { name: "New Alert" }));
  return screen.getByRole("dialog");
};

const fillAlert = (ticker: string, price: string) => {
  fireEvent.change(screen.getByLabelText(/^Ticker/i), {
    target: { value: ticker },
  });
  fireEvent.change(screen.getByLabelText(/^Target Price/i), {
    target: { value: price },
  });
};

describe("PriceAlerts monitoring limitation", () => {
  it("states that alerts are evaluated only while the app is open", () => {
    setup([]);

    expect(
      screen.getByText(/evaluated while this app is open/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no background or push notifications/i),
    ).toBeInTheDocument();
  });

  it("does not count dismissed alerts as active or triggered", () => {
    setup([
      makeAlert({ id: "active" }),
      makeAlert({ id: "triggered", triggered: true, triggeredAt: "2026-10-02T00:00:00.000Z" }),
      makeAlert({
        id: "dismissed",
        triggered: true,
        triggeredAt: "2026-10-02T00:00:00.000Z",
        dismissedAt: "2026-10-03T00:00:00.000Z",
      }),
    ]);

    expect(screen.getByText("1 active · 1 triggered")).toBeInTheDocument();
    expect(screen.queryByText(/dismissed/i)).not.toBeInTheDocument();
  });
});

describe("PriceAlerts creation", () => {
  it("creates a normalized alert through onAddAlert", () => {
    const { onAddAlert } = setup([]);

    openAddDialog();
    fillAlert(" reliance ", "2700");
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));

    expect(onAddAlert).toHaveBeenCalledTimes(1);
    expect(onAddAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: "RELIANCE",
        targetPrice: 2700,
        direction: "above",
        triggered: false,
      }),
    );
  });

  it("rejects a non-positive target price", () => {
    const { onAddAlert } = setup([]);

    openAddDialog();
    fillAlert("RELIANCE", "0");
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));

    expect(onAddAlert).not.toHaveBeenCalled();
  });

  it("rejects an empty ticker", () => {
    const { onAddAlert } = setup([]);

    openAddDialog();
    fillAlert("   ", "2700");
    fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));

    expect(onAddAlert).not.toHaveBeenCalled();
  });
});

describe("PriceAlerts row actions", () => {
  it("labels dismiss and delete actions with the ticker", () => {
    const { onDismissAlert, onDeleteAlert } = setup([
      makeAlert({ id: "triggered", triggered: true, triggeredAt: "2026-10-02T00:00:00.000Z" }),
      makeAlert({ id: "active" }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss alert for RELIANCE" }),
    );
    expect(onDismissAlert).toHaveBeenCalledWith("triggered");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete alert for RELIANCE" }),
    );
    expect(onDeleteAlert).toHaveBeenCalledWith("active");
  });
});
