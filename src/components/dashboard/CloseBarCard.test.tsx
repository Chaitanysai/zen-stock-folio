import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChart } from "lightweight-charts";
import type { CandlesEnvelope } from "@/lib/market-data/types";

const chartApi = {
  addSeries: vi.fn(() => ({ setData: vi.fn() })),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  applyOptions: vi.fn(),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  remove: vi.fn(),
};

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  HistogramSeries: {},
  createChart: vi.fn(() => chartApi),
}));

interface HistoryState {
  status: "idle" | "loading" | "ready" | "error";
  envelope: CandlesEnvelope | null;
  error: string | null;
  retry: () => void;
}

const history = vi.hoisted(() => ({
  value: { status: "loading", envelope: null, error: null, retry: vi.fn() } as HistoryState,
}));

vi.mock("@/hooks/useCandleHistory", () => ({ useCandleHistory: () => history.value }));

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import { CloseBarCard } from "./CloseBarCard";

const envelope = (): CandlesEnvelope => ({
  symbol: "RELIANCE",
  resolution: "1d",
  range: "1mo",
  candles: [
    { time: 1_760_000_000, open: 100, high: 106, low: 99, close: 100, volume: null },
    { time: 1_760_086_400, open: 100, high: 107, low: 100, close: 105, volume: null },
    { time: 1_760_172_800, open: 105, high: 112, low: 104, close: 110, volume: null },
  ],
  provider: "yahoo",
  dataMode: "eod",
  fetchedAt: "2026-11-02T09:00:00Z",
  exchangeTimestamp: "2026-11-02T09:00:00Z",
  cached: false,
  cacheAgeMs: 0,
  stale: false,
  unavailable: [],
  warnings: [],
});

beforeEach(() => {
  history.value = { status: "loading", envelope: null, error: null, retry: vi.fn() };
  vi.mocked(createChart).mockClear();
});

describe("CloseBarCard", () => {
  it("shows the symbol, latest close and daily move", () => {
    history.value = { status: "ready", envelope: envelope(), error: null, retry: vi.fn() };
    render(<CloseBarCard symbol="RELIANCE" name="Reliance Industries" />);
    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries")).toBeInTheDocument();
    expect(screen.getByText("₹110")).toBeInTheDocument();
    expect(screen.getByText("+4.76%")).toBeInTheDocument();
    expect(screen.getByText(/Daily close · 3 sessions/)).toBeInTheDocument();
    expect(vi.mocked(createChart)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ layout: expect.objectContaining({ attributionLogo: false }) }),
    );
  });

  it("offers four ranges and switches with aria-pressed", () => {
    history.value = { status: "ready", envelope: envelope(), error: null, retry: vi.fn() };
    render(<CloseBarCard symbol="RELIANCE" name="Reliance Industries" />);
    const group = screen.getByRole("group", { name: /RELIANCE chart range/i });
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { name: /^(1M|3M|6M|1Y)$/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "false");
    expect(group).toBeInTheDocument();
  });

  it("shows a chart error with retry", () => {
    const retry = vi.fn();
    history.value = { status: "error", envelope: null, error: "boom", retry };
    render(<CloseBarCard symbol="RELIANCE" name="Reliance Industries" />);
    expect(screen.getByText("Chart unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows exactly one skeleton inside the canvas while loading", () => {
    const { container } = render(<CloseBarCard symbol="RELIANCE" name="Reliance Industries" />);
    const canvas = container.querySelector(".zf-closecard-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.querySelectorAll(".zf-skeleton-block")).toHaveLength(1);
  });
});
