import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("shows today's P&L with the strongest gainer and no invented loser", async () => {
    renderGrid([stock({ cmp: 110, quantity: 10 })], { "NSE:AAA": { change: 2, changePercent: 1.9 } });

    const today = screen.getByLabelText("Today's P&L");
    expect(today).toBeInTheDocument();
    await waitFor(() =>
      expect(today.querySelector(".zf-stat-val")).toHaveTextContent("+₹20"),
    );
    expect(within(today).getByText("Top gainer")).toBeInTheDocument();
    expect(within(today).getByText("AAA")).toBeInTheDocument();
    expect(within(today).getByText("+1.9%", { selector: ".zf-stat-mover em" })).toBeInTheDocument();
    expect(within(today).getByText("No loser today")).toBeInTheDocument();
    expect(within(today).getByText("Today · Live")).toBeInTheDocument();
  });

  it("rolls today's P&L from zero to the first resolved figure", async () => {
    const { container } = renderGrid([stock({ cmp: 110, quantity: 10 })], { "NSE:AAA": { change: 2 } });
    const figure = container.querySelector(".zf-stat-hl .zf-count");

    expect(figure).toHaveTextContent("₹0");
    await waitFor(() => expect(figure).toHaveTextContent("+₹20"));
  });

  it("rolls a losing day down from zero to a signed loss", async () => {
    const { container } = renderGrid([stock({ cmp: 100, quantity: 10 })], { "NSE:AAA": { change: -3 } });
    const figure = container.querySelector(".zf-stat-hl .zf-count");

    expect(figure).toHaveTextContent("₹0");
    await waitFor(() => expect(figure).toHaveTextContent("−₹30"));
  });

  it("keeps a flat day at a plain zero", async () => {
    const { container } = renderGrid([stock({ cmp: 110, quantity: 10 })], { "NSE:AAA": { change: 0 } });
    const figure = container.querySelector(".zf-stat-hl .zf-count");

    expect(figure).toHaveTextContent("₹0");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(figure).toHaveTextContent("₹0");
  });

  it("rests at zero while quotes are pending instead of showing a blank value", async () => {
    const rows = [stock({ cmp: 110, quantity: 10 })];
    const { container, rerender } = render(
      <StatGrid loading={false} m={computeMetrics(rows, [], {}, new Date(), null)} movers={dailyMovers(rows, {}, null)} quotesPending />,
    );
    const figure = () => container.querySelector(".zf-stat-hl .zf-count");

    expect(figure()).toHaveTextContent("₹0");

    rerender(
      <StatGrid
        loading={false}
        m={computeMetrics(rows, [], { "NSE:AAA": { change: 2 } }, new Date(), null)}
        movers={dailyMovers(rows, { "NSE:AAA": { change: 2 } }, null)}
        quotesPending={false}
      />,
    );
    await waitFor(() => expect(figure()).toHaveTextContent("+₹20"));
  });

  it("stays unavailable when no quote ever arrives", () => {
    const rows = [stock({ cmp: 110, quantity: 10 })];
    const { container } = render(
      <StatGrid loading={false} m={computeMetrics(rows, [], {}, new Date(), null)} movers={dailyMovers(rows, {}, null)} />,
    );

    expect(container.querySelector(".zf-stat-hl .zf-count")).toBeNull();
    expect(screen.getByText("—", { selector: ".zf-stat-val" })).toBeInTheDocument();
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

  it("keeps the active holding count inside the invested tile", () => {
    const rows = [
      stock({ cmp: 110, quantity: 10 }),
      stock({ ticker: "SOLD", status: "Sold Profit", entryPrice: 50, exitPrice: 100, quantity: 10 }),
    ];
    renderGrid(rows, {});

    const invested = screen.getByLabelText("Total invested");
    expect(within(invested).getByText("₹1,000", { selector: ".zf-stat-val" })).toBeInTheDocument();
    expect(within(invested).getByText(/1 active holding · 0 open F&O/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Active positions")).not.toBeInTheDocument();
  });

  it("lists each active holding's ticker and day percentage, strongest first", () => {
    const rows = [
      stock({ ticker: "DOWN", cmp: 90 }),
      stock({ ticker: "UP", cmp: 110 }),
      stock({ ticker: "QUIET" }),
      stock({ ticker: "SOLD", status: "Sold Profit", entryPrice: 50, exitPrice: 100, quantity: 10 }),
    ];
    renderGrid(rows, {
      "NSE:UP": { change: 10, changePercent: 2.5 },
      "NSE:DOWN": { change: -5, changePercent: -1.2 },
    });

    const list = screen.getByLabelText("Active holdings");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("UP");
    expect(items[0]).toHaveTextContent("+2.5%");
    expect(items[0]).toHaveAttribute("data-tone", "up");
    expect(items[1]).toHaveTextContent("DOWN");
    expect(items[1]).toHaveTextContent("−1.2%");
    expect(items[1]).toHaveAttribute("data-tone", "down");
    expect(items[2]).toHaveTextContent("QUIET");
    expect(items[2]).toHaveTextContent("—");
    expect(within(list).queryByText("SOLD")).not.toBeInTheDocument();
  });

  it("shows the active holdings count as a large figure on the list tile", () => {
    const rows = [
      stock({ ticker: "AAA" }),
      stock({ ticker: "BBB" }),
      stock({ ticker: "SOLD", status: "Sold Profit", entryPrice: 50, exitPrice: 100, quantity: 10 }),
    ];
    renderGrid(rows, {});

    const card = screen.getByLabelText("Active holdings");
    expect(within(card).getByText("2", { selector: ".zf-stat-val" })).toBeInTheDocument();
    expect(within(card).queryByText("3", { selector: ".zf-stat-val" })).not.toBeInTheDocument();
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
