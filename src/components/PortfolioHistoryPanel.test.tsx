/**
 * The "Performance Matrix" portfolio-value panel.
 *
 * Regression: this panel used to render a month-by-month equity curve computed
 * from `calcFinalValue(stock) * (0.8 + progress * 0.22)` plus a sine wave keyed
 * on `ticker.charCodeAt(0)`. Nothing in the app records dated holdings, so those
 * points implied a real history that did not exist, under the labels
 * "Portfolio Value", "1Y" and "2Y". The panel must now state that no series
 * exists rather than draw one.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortfolioHistoryPanel } from "./PortfolioHistoryPanel";
import type { PortfolioStock } from "@/data/sampleData";

function stock(overrides: Partial<PortfolioStock> = {}): PortfolioStock {
  return {
    ticker: "RELIANCE",
    stockName: "Reliance Industries",
    sector: "Energy",
    entryDate: "10-Jan-2026",
    entryPrice: 2450,
    cmp: 2612.35,
    weekHigh52: 2856.15,
    weekLow52: 2220,
    quantity: 15,
    status: "Active",
    ...overrides,
  } as PortfolioStock;
}

describe("PortfolioHistoryPanel", () => {
  it("says no history exists instead of drawing a series", () => {
    render(<PortfolioHistoryPanel stocks={[stock()]} />);

    expect(screen.getByTestId("portfolio-history-unavailable")).toBeTruthy();
    expect(screen.getByText(/No portfolio history recorded yet/i)).toBeTruthy();
    // The panel must not imply a trend line it cannot source.
    expect(screen.getByText(/would not be real data/i)).toBeTruthy();
  });

  it("renders no SVG path, so no synthetic curve can be produced", () => {
    const { container } = render(<PortfolioHistoryPanel stocks={[stock()]} />);

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelector("path")).toBeNull();
  });

  it("reports the current value it can actually compute", () => {
    // 2612.35 * 15 = 39,185.25 → rendered as ₹39.2K by the shared formatter.
    render(<PortfolioHistoryPanel stocks={[stock()]} />);

    expect(screen.getByText(/₹39\.2K/)).toBeTruthy();
  });

  it("excludes sold positions from the current value", () => {
    render(
      <PortfolioHistoryPanel
        stocks={[
          stock(),
          stock({ ticker: "INFY", status: "Sold Loss", cmp: 1756.4, exitPrice: 1756.4, quantity: 20 }),
        ]}
      />,
    );

    expect(screen.getByText(/₹39\.2K/)).toBeTruthy();
  });

  it("asks for a position when nothing is held", () => {
    render(<PortfolioHistoryPanel stocks={[]} />);

    expect(screen.getByText(/Add an active position/i)).toBeTruthy();
  });
});
