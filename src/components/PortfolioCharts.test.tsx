import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import PortfolioCharts from "./PortfolioCharts";

vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => ({ prices: {} }) }));
vi.mock("@/hooks/useMarketStatus", () => ({
  useMarketStatus: () => ({ isOpen: true, label: "Open", description: "NSE open" }),
}));
// No signed-in user: the token lookup resolves to null without loading Firebase.
vi.mock("@/lib/firebase/auth", () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));
vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  CandlestickSeries: {},
  createChart: () => ({
    addSeries: () => ({ setData: () => {} }),
    applyOptions: () => {},
    timeScale: () => ({ fitContent: () => {} }),
    remove: () => {},
  }),
}));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    BarChart: Container,
    Bar: Container,
    Cell: Empty,
    PieChart: Container,
    Pie: Container,
    XAxis: Empty,
    YAxis: Empty,
    Tooltip: Empty,
    ResponsiveContainer: Container,
    CartesianGrid: Empty,
  };
});

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL) =>
    new Response(JSON.stringify({ candles: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
);

const row = (over: Partial<PortfolioStock>): PortfolioStock =>
  ({
    ticker: "RELIANCE",
    stockName: "Reliance Industries",
    entryPrice: 100,
    cmp: 120,
    quantity: 10,
    status: "Active",
    entryDate: "01-Jan-2026",
    weekHigh52: 130,
    weekLow52: 90,
    ...over,
  }) as PortfolioStock;

const stocks = [row({})];

/** `INFY` listed on both exchanges: two rows, one ticker. */
const dualListed = [
  row({ ticker: "INFY", stockName: "Infosys", market: "NSE" }),
  row({ ticker: "INFY", stockName: "Infosys ADR", market: "US", currency: "USD" }),
];

const requestedUrls = (): string[] => fetchMock.mock.calls.map(([input]) => String(input));

/**
 * The panel imports `lightweight-charts` inside an effect, so wait for the
 * initial series request to settle before changing the selection.
 */
const waitForChart = () => screen.findByText("No candle data available for this range.");

beforeEach(() => {
  // jsdom has no layout engine, so the chart container cannot be observed.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("PortfolioCharts controls", () => {
  it("labels the ticker selector and exposes the selected range", async () => {
    render(<PortfolioCharts stocks={stocks} />);
    await waitForChart();

    expect(screen.getByLabelText("Chart ticker")).toHaveValue("NSE:RELIANCE");
    const oneDay = screen.getByRole("button", { name: "1 Day" });
    const fiveDays = screen.getByRole("button", { name: "5 Days" });
    expect(oneDay).toHaveAttribute("aria-pressed", "true");
    expect(fiveDays).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fiveDays);
    expect(fiveDays).toHaveAttribute("aria-pressed", "true");
    expect(oneDay).toHaveAttribute("aria-pressed", "false");
  });

  it("lists the same ticker on two markets as two selectable options", async () => {
    render(<PortfolioCharts stocks={dualListed} />);
    await waitForChart();

    const select = screen.getByLabelText("Chart ticker") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "NSE:INFY",
      "US:INFY",
    ]);
    // The market is visible, or two identical labels cannot be told apart.
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "INFY (NSE)",
      "INFY (US)",
    ]);
  });

  it("requests the selected listing's own market", async () => {
    render(<PortfolioCharts stocks={dualListed} />);
    await waitForChart();

    fireEvent.change(screen.getByLabelText("Chart ticker"), { target: { value: "US:INFY" } });

    await waitFor(() =>
      expect(
        requestedUrls().some(
          (url) => url.includes("symbol=INFY") && url.includes("market=US"),
        ),
      ).toBe(true),
    );
    // The first chart request was for the NSE row, not the selected U.S. one.
    expect(requestedUrls().some((url) => url.includes("market=NSE"))).toBe(true);
  });

  it("falls back to a row that still exists when the selected listing is deleted", async () => {
    const { rerender } = render(<PortfolioCharts stocks={dualListed} />);
    await waitForChart();
    fireEvent.change(screen.getByLabelText("Chart ticker"), { target: { value: "US:INFY" } });

    rerender(<PortfolioCharts stocks={[dualListed[0]]} />);

    // The remaining row is charted by name, not by guessing a market for a
    // deleted ticker.
    expect(screen.getByLabelText("Chart ticker")).toHaveValue("NSE:INFY");
  });

  it("charts nothing when the selected row is gone and no rows remain", async () => {
    const { rerender } = render(<PortfolioCharts stocks={dualListed} />);
    await waitForChart();
    fireEvent.change(screen.getByLabelText("Chart ticker"), { target: { value: "US:INFY" } });

    rerender(<PortfolioCharts stocks={[]} />);

    expect(screen.getByText(/Add stocks to your portfolio/)).toBeInTheDocument();
    expect(screen.queryByText(/Candlestick —/)).not.toBeInTheDocument();
  });

  it("excludes a position without a market price from the P&L chart and says so", async () => {
    render(<PortfolioCharts stocks={[row({}), row({ ticker: "TCS", stockName: "TCS", cmp: 0 })]} />);
    await waitForChart();

    expect(
      screen.getByText("1 position without a market price is excluded from this chart."),
    ).toBeInTheDocument();
  });
});
