import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "next-themes";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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
const fxRate = { rate: 90, asOf: null, stale: false, loading: false, error: null, refresh: vi.fn() };
const market = { isOpen: true, label: "Open", description: "NSE open", istTime: "10:15" };
const auth = { user: { id: "u1", email: "asha@example.com" }, signOut: vi.fn(), loading: false };

// Broker connections decide which synced rows the dashboard may present.
const brokerState = vi.hoisted(() => ({ connections: [] as unknown[] }));
vi.mock("@/lib/brokers/client", () => ({
  brokerApi: {
    connections: () => Promise.resolve({ connections: brokerState.connections, storeReady: true, setupIssues: [] }),
    providers: () => Promise.resolve({ providers: [], storeReady: true, setupIssues: [], callbackOrigin: "" }),
  },
  readBrokerCallback: () => null,
  clearBrokerCallback: () => {},
  BrokerApiError: class BrokerApiError extends Error {},
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/usePortfolioSync", () => ({
  usePortfolioSync: () => sync,
  loadDisplayNameFromServer: () => Promise.resolve(null),
  saveDisplayNameToServer: () => Promise.resolve(null),
  displayNameKeyFor: (id?: string) => `name:${id ?? "anon"}`,
}));
vi.mock("@/hooks/useLivePrices", () => ({ useLivePrices: () => livePrices }));
vi.mock("@/hooks/useFxRate", () => ({ useFxRate: () => fxRate }));
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
// jsdom has no layout engine; the price chart observes its container size.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

import Index from "./Index";

const stock = (ticker: string, entryPrice: number, cmp: number, quantity: number): PortfolioStock => ({
  ticker, stockName: ticker, sector: "Energy", entryPrice, cmp, quantity, status: "Active",
  entryDate: "01-Jan-2026", weekHigh52: cmp, weekLow52: entryPrice,
} as unknown as PortfolioStock);

const wl: WatchlistStock = {
  stockName: "TCS", cmp: 3500, entryZoneLow: 3400, entryZoneHigh: 3600, stopLoss: 3300,
  target1: 3700, target2: 3800, target3: 3900, rsi: 52, sma50: 3450, ema10: 3490, ema21: 3470,
};

const renderIndex = async (entry = "/dashboard") => {
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/dashboard" element={<Index />} />
          <Route path="/dashboard/:section" element={<Index />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  localStorage.clear();
  save.mockClear();
  brokerState.connections = [];
  snapshot = {
    stocks: [stock("RELIANCE", 100, 120, 10), stock("INFY", 200, 180, 5)],
    trades: [], watchlist: [wl], alerts: [], fnoTrades: [],
  };
});

describe("Index dashboard", () => {
  it("renders the portfolio value card from real holdings", async () => {
    await renderIndex();
    const card = screen.getByRole("article", { name: /portfolio value/i });
    // 10×120 + 5×180 = 2100; unrealised P&L 2100 − 2000 = +100 (+5.0%)
    expect(within(card).getByText("₹2,100")).toBeInTheDocument();
    expect(within(card).getByText(/Unrealised \+₹100 \(\+5\.0%\) on ₹2,000 invested/)).toBeInTheDocument();
  });

  it("reports a U.S. holding's unrealised P&L once in both the table and the chart", async () => {
    snapshot = {
      stocks: [{ ...stock("EWZS", 18, 12, 6), market: "US", currency: "USD" }],
      trades: [], watchlist: [], alerts: [], fnoTrades: [],
    };
    await renderIndex();

    // (12 − 18) × 6 shares × ₹90 = −₹3,240. The chart must not convert again.
    const holdings = screen.getByRole("table", { name: /open holdings/i });
    expect(within(holdings).getByText("−₹3,240")).toBeInTheDocument();
    const chart = screen.getByRole("table", { name: /unrealised profit and loss by holding/i });
    expect(within(chart).getByText("−₹3,240")).toBeInTheDocument();
  });

  it("exposes the rail as buttons with aria-current and switches pages", async () => {
    await renderIndex();
    const rail = screen.getByRole("navigation", { name: "Sections" });
    const overview = within(rail).getByRole("button", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(rail).getByRole("button", { name: "Watchlist" }));
    expect(within(rail).getByRole("button", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    // The pill navigation mirrors the active page.
    const pills = screen.getByRole("navigation", { name: "Primary" });
    expect(within(pills).getByRole("button", { name: "Watchlist" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the section named in the URL when loaded directly", async () => {
    await renderIndex("/dashboard/portfolio");
    expect(screen.getByRole("heading", { level: 1, name: "Portfolio holdings" })).toBeInTheDocument();
    const rail = screen.getByRole("navigation", { name: "Sections" });
    expect(within(rail).getByRole("button", { name: "Portfolio" })).toHaveAttribute("aria-current", "page");
  });

  it("shows Not Found for an unknown section instead of falling back", async () => {
    await renderIndex("/dashboard/does-not-exist");
    expect(screen.getByRole("heading", { level: 1, name: /page not found/i })).toBeInTheDocument();
  });

  it("keeps every destination reachable from the rail", async () => {
    await renderIndex();
    const rail = screen.getByRole("navigation", { name: "Sections" });
    for (const name of ["Overview", "Portfolio", "Trades", "History", "Journal", "Charts", "Sectors", "Analytics", "Watchlist", "News", "AI Insights", "Alerts", "Export"]) {
      expect(within(rail).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("sorts the holdings table and shows real per-holding figures", async () => {
    await renderIndex();
    const table = screen.getByRole("table", { name: /open holdings/i });
    fireEvent.click(within(table).getByRole("button", { name: "Sort by profit and loss" }));
    const header = within(table).getByRole("columnheader", { name: /P&L$/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByText("+₹200")).toBeInTheDocument();
    expect(within(table).getByText("−₹100")).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("RELIANCE · Energy")).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "Sort by profit and loss" }));
    expect(within(within(table).getAllByRole("row")[1]).getByText("INFY · Energy")).toBeInTheDocument();
  });

  it("filters holdings by search text and by gain or loss", async () => {
    await renderIndex();
    const table = () => screen.getByRole("table", { name: /open holdings/i });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search holdings" }), { target: { value: "infy" } });
    expect(within(table()).queryByText("RELIANCE · Energy")).toBeNull();
    expect(within(table()).getByText("INFY · Energy")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search holdings" }), { target: { value: "zzz" } });
    expect(screen.getByText("No holdings match")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear search and filter/i }));
    expect(within(table()).getByText("RELIANCE · Energy")).toBeInTheDocument();
  });

  it("switches the theme through next-themes and persists it", async () => {
    await renderIndex();
    const light = screen.getByRole("button", { name: "Light theme" });
    const dark = screen.getByRole("button", { name: "Dark theme" });
    expect(dark).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(light);
    expect(await screen.findByRole("button", { name: "Light theme", pressed: true })).toBeInTheDocument();
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
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

  it("removes a watchlist symbol only after confirmation", async () => {
    await renderIndex();
    const card = screen.getByRole("region", { name: "Watchlist" });
    fireEvent.click(within(card).getByRole("button", { name: "Remove TCS from watchlist" }));
    expect(within(card).getByText("TCS")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await act(async () => { await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ watchlist: [] }));
  });

  it("shows honest empty states, not sample rows, for an empty account", async () => {
    snapshot = { stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [] };
    await renderIndex();
    expect(screen.getByText("No open holdings yet")).toBeInTheDocument();
    expect(screen.getByText("Unrealised P&L appears once you hold a position with a known cost and a market price.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Nothing on your watchlist")).toBeInTheDocument();
    // Real next actions, wired to the existing dialogs.
    expect(screen.getAllByRole("button", { name: /add trade/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /import/i }).length).toBeGreaterThan(0);
    // Home counts active holdings only, so an empty account reports zero.
    const invested = screen.getByRole("article", { name: "Total invested" });
    expect(within(invested).getByText("0 active holdings · 0 open F&O")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Active holdings" })).toHaveTextContent("No open holdings");
  });

  it("plots realised P&L by month only from closed trades", async () => {
    snapshot = {
      ...snapshot,
      stocks: [
        ...snapshot.stocks,
        { ...stock("TCS", 100, 150, 10), status: "Sold Profit", exitPrice: 150, exitDate: "10-Jan-2026" } as unknown as PortfolioStock,
      ],
    };
    await renderIndex();
    // Realised results belong to the Portfolio history, never to Home.
    expect(screen.queryByRole("table", { name: "Realised profit and loss by month" })).not.toBeInTheDocument();
    const rail = screen.getByRole("navigation", { name: "Sections" });
    fireEvent.click(within(rail).getByRole("button", { name: "Portfolio" }));
    const table = await screen.findByRole("table", { name: "Realised profit and loss by month" });
    expect(within(table).getByText("Jan '26")).toBeInTheDocument();
    expect(within(table).getByText("+₹500")).toBeInTheDocument();
  });

  describe("a disconnected broker", () => {
    const synced = (ticker: string, connectionId: string): PortfolioStock => ({
      ...stock(ticker, 100, 120, 10),
      broker: {
        provider: "groww",
        connectionId,
        key: `groww:${connectionId}:${ticker}`,
        instrumentId: ticker,
        source: "holding",
        quantity: 10,
        averagePrice: 100,
        lastSyncedAt: "2026-01-02T00:00:00.000Z",
      },
    } as unknown as PortfolioStock);

    const connection = (id: string, status: string) => ({
      id, provider: "groww", method: "api_keys", displayName: id, status, permissions: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
      lastTestedAt: null, lastSuccessfulSyncAt: null, tokenExpiresAt: null, lastErrorCode: null,
      disconnectedAt: status === "disconnected" ? "2026-01-03T00:00:00.000Z" : null, lastSync: null,
    });

    const settle = async () => { await act(async () => { await Promise.resolve(); }); };

    it("hides its rows from the dashboard and every calculation", async () => {
      snapshot = {
        stocks: [synced("GROWWCO", "groww-1"), stock("MANUAL", 100, 120, 10)],
        trades: [], watchlist: [], alerts: [], fnoTrades: [],
      };
      brokerState.connections = [connection("groww-1", "disconnected")];
      await renderIndex();
      await settle();

      // Only the manual row is left: 10 × 120 = ₹1,200, not ₹2,400.
      const card = screen.getByRole("article", { name: /portfolio value/i });
      expect(within(card).getByText("₹1,200")).toBeInTheDocument();
      const holdings = screen.getByRole("table", { name: /open holdings/i });
      expect(within(holdings).queryByText("GROWWCO · Energy")).toBeNull();
      expect(within(holdings).getByText("MANUAL · Energy")).toBeInTheDocument();
      // The hidden rows stay hidden and are not announced with operational copy:
      // the dashboard shows the current portfolio state, not how it was derived.
      expect(screen.queryByText(/row is hidden because the broker connection/i)).toBeNull();
    });

    it("keeps its rows while the connection is only failing", async () => {
      snapshot = {
        stocks: [synced("GROWWCO", "groww-1")],
        trades: [], watchlist: [], alerts: [], fnoTrades: [],
      };
      brokerState.connections = [connection("groww-1", "error")];
      await renderIndex();
      await settle();

      const holdings = screen.getByRole("table", { name: /open holdings/i });
      expect(within(holdings).getByText("GROWWCO · Energy")).toBeInTheDocument();
      expect(screen.queryByText(/row is hidden because the broker connection/i)).toBeNull();
    });

    it("leaves another broker's rows untouched", async () => {
      snapshot = {
        stocks: [synced("GROWWCO", "groww-1"), synced("ZERODHA", "zerodha-1")],
        trades: [], watchlist: [], alerts: [], fnoTrades: [],
      };
      brokerState.connections = [
        connection("groww-1", "disconnected"),
        { ...connection("zerodha-1", "connected"), provider: "zerodha" },
      ];
      await renderIndex();
      await settle();

      const holdings = screen.getByRole("table", { name: /open holdings/i });
      expect(within(holdings).queryByText("GROWWCO · Energy")).toBeNull();
      expect(within(holdings).getByText("ZERODHA · Energy")).toBeInTheDocument();
    });

    it("keeps the hidden rows in the stored snapshot", async () => {
      snapshot = {
        stocks: [synced("GROWWCO", "groww-1")],
        trades: [], watchlist: [], alerts: [], fnoTrades: [],
      };
      brokerState.connections = [connection("groww-1", "disconnected")];
      await renderIndex();
      await settle();

      // Hiding is a read-side decision: nothing is written back, so the row
      // survives for history and a later reconnect.
      expect(save).not.toHaveBeenCalled();
      expect(snapshot.stocks).toHaveLength(1);
    });
  });
});
