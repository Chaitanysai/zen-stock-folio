import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import PortfolioCharts from "./PortfolioCharts";

vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => ({ prices: {} }) }));
vi.mock("@/hooks/useMarketStatus", () => ({
  useMarketStatus: () => ({ isOpen: true, label: "Open", description: "NSE open" }),
}));
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
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) })));

const stocks = [{
  ticker: "RELIANCE",
  stockName: "Reliance Industries",
  entryPrice: 100,
  cmp: 120,
  quantity: 10,
  status: "Active",
  entryDate: "01-Jan-2026",
  weekHigh52: 130,
  weekLow52: 90,
} as PortfolioStock];

describe("PortfolioCharts controls", () => {
  it("labels the ticker selector and exposes the selected range", () => {
    render(<PortfolioCharts stocks={stocks} />);

    expect(screen.getByLabelText("Chart ticker")).toHaveValue("RELIANCE");
    const oneDay = screen.getByRole("button", { name: "1 Day" });
    const fiveDays = screen.getByRole("button", { name: "5 Days" });
    expect(oneDay).toHaveAttribute("aria-pressed", "true");
    expect(fiveDays).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fiveDays);
    expect(fiveDays).toHaveAttribute("aria-pressed", "true");
    expect(oneDay).toHaveAttribute("aria-pressed", "false");
  });
});
