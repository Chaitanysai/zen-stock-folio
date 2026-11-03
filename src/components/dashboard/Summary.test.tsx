import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import { computeMetrics, dailyMovers } from "@/lib/dashboard/overview";
import { StatGrid } from "./Summary";

const stock = (over: Partial<PortfolioStock>): PortfolioStock => ({
  ticker: "AAA", stockName: "Alpha Ltd", sector: "IT", entryDate: "01-Jan-2026",
  entryPrice: 100, cmp: 120, quantity: 10, status: "Active", ...over,
});

function renderGrid(rows: PortfolioStock[], prices: Record<string, { change: number; changePercent?: number }>) {
  const m = computeMetrics(rows, [], prices, new Date(), null);
  const movers = dailyMovers(rows, prices, null);
  return render(<StatGrid loading={false} m={m} movers={movers} dayLabel="Today" priceMode="Live" />);
}

describe("StatGrid", () => {
  it("shows today's P&L with the strongest gainer and no invented loser", () => {
    renderGrid([stock({ cmp: 110, quantity: 10 })], { "NSE:AAA": { change: 2, changePercent: 1.9 } });

    const today = screen.getByLabelText("Today's P&L");
    expect(today).toBeInTheDocument();
    expect(within(today).getByText("+₹20", { selector: ".zf-stat-val" })).toBeInTheDocument();
    expect(within(today).getByText("Top gainer")).toBeInTheDocument();
    expect(within(today).getByText("AAA")).toBeInTheDocument();
    expect(within(today).getByText("+1.9%", { selector: ".zf-stat-mover em" })).toBeInTheDocument();
    expect(within(today).getByText("No loser today")).toBeInTheDocument();
    expect(within(today).getByText("Today · Live")).toBeInTheDocument();
  });

  it("reports unrealised P&L from open positions only", () => {
    const rows = [
      stock({ cmp: 110, quantity: 10 }), // +₹100 unrealised
      stock({ ticker: "SOLD", status: "Sold Profit", entryPrice: 50, exitPrice: 100, quantity: 10 }), // closed
    ];
    renderGrid(rows, { "NSE:AAA": { change: 2 } });

    const unrealised = screen.getByLabelText("Unrealised P&L");
    expect(unrealised).toHaveTextContent("+₹100");
    expect(within(unrealised).getByText("open positions only")).toBeInTheDocument();
    expect(within(unrealised).queryByText(/unrealised \+ realised/i)).not.toBeInTheDocument();
    expect(within(unrealised).queryByText(/₹500/)).not.toBeInTheDocument();
  });

  it("counts open positions only and keeps closed rows out of Home", () => {
    const rows = [
      stock({ cmp: 110, quantity: 10 }),
      stock({ ticker: "SOLD", status: "Sold Profit", entryPrice: 50, exitPrice: 100, quantity: 10 }),
    ];
    renderGrid(rows, {});

    const active = screen.getByLabelText("Active positions");
    expect(within(active).getByText("1", { selector: ".zf-stat-val" })).toBeInTheDocument();
    expect(within(active).getByText(/closed rows stay in Portfolio/)).toBeInTheDocument();
  });

  it("shows no mover rows until quotes carry a day change", () => {
    renderGrid([stock({})], {});

    expect(screen.queryByText("Top gainer")).not.toBeInTheDocument();
    expect(screen.getByText("Awaiting live quotes")).toBeInTheDocument();
  });

  it("labels a closed-market figure as the last session", () => {
    const m = computeMetrics([stock({ cmp: 110 })], [], { "NSE:AAA": { change: 2 } }, new Date(), null);
    render(<StatGrid loading={false} m={m} movers={dailyMovers([stock({ cmp: 110 })], { "NSE:AAA": { change: 2 } }, null)} dayLabel="Last session" priceMode="EOD" />);

    expect(screen.getByText("Last session · EOD")).toBeInTheDocument();
  });
});
