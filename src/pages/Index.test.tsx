import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "next-themes";
import type { PortfolioSnapshot } from "@/hooks/usePortfolioSync";
import type { PortfolioStock, WatchlistStock } from "@/data/sampleData";

// ── Mocks: no network, no auth backend, deterministic data ──────────────────
// Hook mocks return STABLE references, as the real hooks do; fresh objects per
// render would re-trigger the loader effect forever.
const save = vi.fn().mockResolvedValue(null);
let snapshot: PortfolioSnapshot;
const load = () => Promise.resolve({ status: "ready", snapshot });
const sync = { load, save };
const livePrices = { prices: {}, dataMode: "realtime", refresh: vi.fn(), error: null };
const market = { isOpen: true, label: "Open", description: "NSE open", istTime: "10:15" };
const auth = { user: { id: "u1", email: "asha@example.com" }, signOut: vi.fn(), loading: false };

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/usePortfolioSync", () => ({
  usePortfolioSync: () => sync,
  loadDisplayNameFromServer: () => Promise.resolve(null),
  saveDisplayNameToServer: () => Promise.resolve(null),
  displayNameKeyFor: (id?: string) => `name:${id ?? "anon"}`,
}));
vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => livePrices }));
vi.mock("@/hooks/useMarketStatus", () => ({ useMarketStatus: () => market }));
// Chart library and its OHLC fetch are not under test here.
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
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) })));

import Index from "./Index";

const stock = (ticker: string, entryPrice: number, cmp: number, quantity: number): PortfolioStock => ({
  ticker, stockName: ticker, sector: "Energy", entryPrice, cmp, quantity, status: "Active",
  entryDate: "01-Jan-2026", weekHigh52: cmp, weekLow52: entryPrice,
} as unknown as PortfolioStock);

const wl: WatchlistStock = {
  stockName: "TCS", cmp: 3500, entryZoneLow: 3400, entryZoneHigh: 3600, stopLoss: 3300,
  target1: 3700, target2: 3800, target3: 3900, rsi: 52, sma50: 3450, ema10: 3490, ema21: 3470,
};

const renderIndex = async () => {
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <Index />
    </ThemeProvider>,
  );
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  localStorage.clear();
  save.mockClear();
  snapshot = {
    stocks: [stock("RELIANCE", 100, 120, 10), stock("INFY", 200, 180, 5)],
    trades: [], watchlist: [wl], alerts: [], fnoTrades: [],
  };
});

describe("Index dashboard shell", () => {
  it("renders the portfolio hero from real holdings", async () => {
    await renderIndex();
    const hero = screen.getByRole("article", { name: /portfolio value/i });
    // 10×120 + 5×180 = 2100 → ₹2.1K; P&L 2100 − 2000 = +100
    expect(within(hero).getByText("₹2.1K")).toBeInTheDocument();
    expect(within(hero).getByText(/\+₹100 \(\+5\.0%\)/)).toBeInTheDocument();
  });

  it("exposes primary navigation as buttons with aria-current", async () => {
    await renderIndex();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    const dash = within(nav).getByRole("button", { name: "Dashboard" });
    expect(dash).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(nav).getByRole("button", { name: "Watchlist" }));
    expect(within(nav).getByRole("button", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
  });

  it("switches the holdings breakdown metric with pressed state", async () => {
    await renderIndex();
    const group = screen.getByRole("group", { name: "Breakdown metric" });
    const pnl = within(group).getByRole("button", { name: "P&L" });
    fireEvent.click(pnl);
    expect(pnl).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("list", { name: "Holdings breakdown" });
    expect(within(list).getByText("RELIANCE")).toBeInTheDocument();
    expect(within(list).getByText("+₹200")).toBeInTheDocument();
    expect(within(list).getByText("−₹100")).toBeInTheDocument();
  });

  it("toggles the theme through next-themes", async () => {
    await renderIndex();
    const toggle = screen.getByRole("button", { name: /switch to light theme/i });
    fireEvent.click(toggle);
    expect(await screen.findByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it("migrates the legacy dashboard theme flag once", async () => {
    localStorage.setItem("zf-dark", "0");
    await renderIndex();
    expect(localStorage.getItem("zf-dark")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("does not render a fabricated watchlist sparkline", async () => {
    await renderIndex();
    const card = screen.getByRole("region", { name: "Watchlist" });
    expect(within(card).getByText(/Entry ₹3,400–3,600/)).toBeInTheDocument();
    expect(card.querySelector("polyline")).toBeNull();
  });
});
