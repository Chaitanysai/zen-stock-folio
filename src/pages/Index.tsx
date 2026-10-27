import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell, RefreshCw,
  LogOut, Settings, PieChart, Zap, ChevronLeft,
  ChevronRight, Sun, Moon, Menu, MoreHorizontal, Sparkles, BookOpen,
  Activity, Wallet, Award, Newspaper, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import "@/styles/dashboard.css";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry,
  calcInvestedValue, calcFinalValue, calcProfitLoss,
  FnOTrade, fnOTradesData, calcFnOInvested, calcFnOPnL,
} from "@/data/sampleData";
import PortfolioTable        from "@/components/PortfolioTable";
import TradeStrategyTable    from "@/components/TradeStrategyTable";
import FnOTable             from "@/components/FnOTable";
import WatchlistTable        from "@/components/WatchlistTable";
import PortfolioCharts       from "@/components/PortfolioCharts";
import RiskAnalysis          from "@/components/RiskAnalysis";
import TradeAnalytics        from "@/components/TradeAnalytics";
import TradeHistory          from "@/components/TradeHistory";
import TradeJournal          from "@/components/TradeJournal";
import SectorDiversification from "@/components/SectorDiversification";
import PriceAlerts           from "@/components/PriceAlerts";
import AIInsights            from "@/components/AIInsights";
import StockNewsFeed         from "@/components/StockNewsFeed";
import ExportPortfolio       from "@/components/ExportPortfolio";
import AuthModal             from "@/components/AuthModal";
import { useToast }          from "@/hooks/use-toast";
import { useLivePrices }     from "@/hooks/useLivePrices";
import { useMarketStatus }   from "@/hooks/useMarketStatus";
import { usePortfolioSync, displayNameKeyFor, loadDisplayNameFromServer, saveDisplayNameToServer, PortfolioSnapshot } from "@/hooks/usePortfolioSync";
import { useAuth }           from "@/contexts/AuthContext";
import LogoMark              from "@/components/LogoMark";
import { buildTrendSeries, isSameTradingDay } from "@/lib/trading";
import { journalNotesPatch } from "@/lib/portfolio/snapshotUpdates";
import { evaluateAlerts } from "@/lib/portfolio/priceAlerts";

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export" | "news";

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { id: "overview",   label: "Dashboard",   icon: LayoutDashboard },
      { id: "holdings",   label: "Portfolio",   icon: Wallet },
      { id: "trades",     label: "Trades",      icon: ScrollText },
      { id: "history",    label: "History",     icon: History },
      { id: "journal",    label: "Journal",     icon: BookOpen },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "charts",     label: "Charts",      icon: BarChart3 },
      { id: "sector",     label: "Sectors",     icon: PieChart },
      { id: "analytics",  label: "Performance", icon: Activity },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "watchlist",  label: "Watchlist",   icon: Eye },
      { id: "news",       label: "News Feed",   icon: Newspaper },
      { id: "ai",         label: "AI Insights", icon: Brain },
      { id: "alerts",     label: "Alerts",      icon: Bell },
      { id: "export",     label: "Export",      icon: Zap },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.abs(n).toFixed(0)}`;
}
function fmtNum(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function sign(n: number) { return n >= 0 ? "+" : "−"; }
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Styles live in src/styles/dashboard.css (imported above).

// Categorical palette for sector slices: indigo-led, distinct from the
// green/red reserved for gains and losses.
const SECTOR_PALETTE = [
  "hsl(246 72% 62%)", "hsl(206 84% 54%)", "hsl(186 70% 42%)",
  "hsl(276 56% 60%)", "hsl(36 86% 54%)", "hsl(226 16% 56%)",
];

// ─── Donut Chart Widget ───────────────────────────────────────────────────────
function DonutWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const map = new Map<string, number>();
  active.forEach(s => map.set(s.sector ?? "Other", (map.get(s.sector ?? "Other") ?? 0) + calcInvestedValue(s)));
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  const entries = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
  const COLORS = SECTOR_PALETTE;

  const R = 36, r = 22, cx = 50, cy = 50;
  let startAngle = -Math.PI / 2;
  const slices = entries.map(([name, val], i) => {
    const pct   = val / total;
    const angle = pct * 2 * Math.PI;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(startAngle + angle), y2 = cy + R * Math.sin(startAngle + angle);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(startAngle + angle), iy2 = cy + r * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix2.toFixed(2)},${iy2.toFixed(2)} A${r},${r} 0 ${large},0 ${ix1.toFixed(2)},${iy1.toFixed(2)} Z`;
    startAngle += angle;
    return { name, val, pct, d, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className="zf-donut">
      <svg viewBox="0 0 100 100" className="zf-donut-svg" aria-hidden="true">
        {slices.map(s => <path key={s.name} d={s.d} fill={s.color} />)}
        <text x="50" y="47" textAnchor="middle" fontSize="9.5" fontWeight="700" className="zf-donut-total">{fmt(total)}</text>
        <text x="50" y="57" textAnchor="middle" fontSize="7" className="zf-donut-cap">invested</text>
      </svg>
      <ul className="zf-donut-legend">
        {slices.map(s => (
          <li key={s.name}>
            <span className="zf-donut-name">
              <i style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </span>
            <span className="zf-donut-pct">{(s.pct*100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Holdings Breakdown ───────────────────────────────────────────────────────
// Real per-holding figures only (current value, invested, unrealised P&L).
// Replaces an earlier month-by-month line that was synthesised from sine waves.
type BreakdownMetric = "value" | "invested" | "pnl";

function HoldingsBreakdown({ stocks, metric }: { stocks: PortfolioStock[]; metric: BreakdownMetric }) {
  const items = stocks
    .filter(s => s.status === "Active")
    .map(s => {
      const inv = calcInvestedValue(s);
      const cur = calcFinalValue(s);
      return { ticker: s.ticker, inv, cur, pnl: cur - inv, pct: inv > 0 ? (cur - inv) / inv * 100 : 0 };
    })
    .map(i => ({ ...i, v: metric === "value" ? i.cur : metric === "invested" ? i.inv : i.pnl }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 6);

  if (items.length === 0) {
    return <div className="zf-empty">No active holdings yet. Add a position to see the breakdown.</div>;
  }

  const maxV = Math.max(...items.map(i => Math.abs(i.v))) || 1;

  return (
    <ul className="zf-hbar-list" aria-label="Holdings breakdown" style={{ listStyle: "none", margin: 0 }}>
      {items.map(i => {
        const pos = metric !== "pnl" || i.v >= 0;
        const fill = metric === "pnl"
          ? (pos ? "var(--green)" : "var(--red)")
          : metric === "invested" ? "var(--accent-2)" : "var(--grad-accent)";
        return (
          <li key={i.ticker} className="zf-hbar">
            <span className="zf-hbar-name" title={i.ticker}>{i.ticker}</span>
            <span className="zf-hbar-track" aria-hidden="true">
              <span className="zf-hbar-fill" style={{ width: `${Math.max(2, Math.abs(i.v) / maxV * 100)}%`, background: fill }} />
            </span>
            <span className="zf-hbar-val">
              {metric === "pnl" ? `${sign(i.v)}${fmt(Math.abs(i.v))}` : fmt(i.v)}
              <small style={{ color: i.pct >= 0 ? "var(--green)" : "var(--red)" }}>
                {sign(i.pct)}{Math.abs(i.pct).toFixed(1)}%
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [tab,       setTab]       = useState<ActiveTab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [breakdownMetric, setBreakdownMetric] = useState<BreakdownMetric>("value");

  // One theme source: next-themes (App.tsx). The old dashboard-only "zf-dark"
  // flag is migrated once so an existing light/dark choice is preserved.
  const { resolvedTheme, setTheme } = useTheme();
  const darkMode = resolvedTheme !== "light";
  useEffect(() => {
    try {
      const legacy = localStorage.getItem("zf-dark");
      if (legacy === null) return;
      if (localStorage.getItem("theme") === null) setTheme(legacy === "1" ? "dark" : "light");
      localStorage.removeItem("zf-dark");
    } catch { /* storage unavailable: keep the provider default */ }
  }, [setTheme]);

  const goTo = useCallback((id: ActiveTab) => { setTab(id); setMobileNav(false); }, []);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!mobileNav) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNav(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNav]);

  // Close settings popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { user, signOut, loading: authLoading } = useAuth();

  const handleSaveDisplayName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setNameSaving(true);
    try {
      // Save to this account's own scope (never a shared global key) first so
      // the change survives a failed cloud write.
      localStorage.setItem(displayNameKeyFor(user?.id), name);
      setDisplayName(name);
      // Persist through the neutral data-store abstraction, which writes
      // users/{uid} in Firestore.
      if (user?.id) {
        const error = await saveDisplayNameToServer(user.id, name);
        if (error) {
          toast({
            title: "Name saved on this device",
            description: "Profile sync could not be completed.",
            variant: "destructive",
          });
        }
      }
      setSettingsOpen(false);
      setNameInput("");
    } finally {
      setNameSaving(false);
    }
  };

  // Load display name for the current account only.
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;

    try {
      setDisplayName(localStorage.getItem(displayNameKeyFor(userId)) ?? "");
    } catch {
      setDisplayName("");
    }
    if (!userId) return;

    loadDisplayNameFromServer(userId)
      .then((remoteName) => {
        // An empty/missing cloud value never erases a valid local name, and a
        // reply for a previous account is dropped.
        if (cancelled || !remoteName) return;
        setDisplayName(remoteName);
        try {
          localStorage.setItem(displayNameKeyFor(userId), remoteName);
        } catch {
          // storage disabled - the in-memory name is still correct
        }
      })
      .catch(() => {
        // Offline or provider unavailable: the locally cached name stands.
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const [uMenu,     setUMenu]     = useState(false);
  const [showAuth,  setShowAuth]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayName,  setDisplayName]  = useState("");
  const [nameInput,    setNameInput]    = useState("");
  const [nameSaving,   setNameSaving]   = useState(false);
  const uMenuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Per-account data is never seeded from a shared/global cache. State starts
  // empty and is filled by the scoped loader effect below once the Supabase
  // session is known, so one account can never render another's rows.
  const [stocks,    setStocks]    = useState<PortfolioStock[]>([]);
  const [trades,    setTrades]    = useState<TradeStrategy[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>([]);
  const [fnoTrades, setFnoTrades] = useState<FnOTrade[]>([]);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string | null>(null);
  const [tradesSubTab, setTradesSubTab] = useState<"equity"|"fno">("equity");
  const [dashboardCandleRange, setDashboardCandleRange] = useState<"1d"|"5d"|"1mo">("1d");

  const { toast }         = useToast();
  const { load, save }    = usePortfolioSync(user?.id);
  const tickers = useMemo(
    () => Array.from(new Set([
      ...stocks.map((s) => s.ticker),
      ...alerts.filter((a) => !a.triggered && !a.dismissedAt).map((a) => a.ticker),
    ])),
    [stocks, alerts],
  );
  const { prices, dataMode, refresh, error: priceError } = useLivePrices(tickers);
  // Exchange status: clock + NSE calendar only (Asia/Kolkata). Shared by every
  // market indicator in the app.
  const market = useMarketStatus();
  const marketLive = market.isOpen;
  // Data/API availability is deliberately a SEPARATE signal — a successful
  // price response must never make the exchange look live after 15:30 IST.
  const dataFresh = dataMode !== "unknown";
  const snapshotRef = useRef<PortfolioSnapshot>({ stocks, trades, watchlist, alerts, fnoTrades });

  useEffect(() => {
    snapshotRef.current = { stocks, trades, watchlist, alerts, fnoTrades };
  }, [alerts, fnoTrades, stocks, trades, watchlist]);

  useEffect(() => {
    // Wait until the Supabase session is resolved so we never load the wrong scope.
    if (authLoading) return;

    let cancelled = false;
    const userId = user?.id;
    const empty: PortfolioSnapshot = { stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [] };

    // Hard reset first: on sign-out or account switch the previous account's
    // rows must disappear even when the new scope has nothing to load.
    setStocks([]);
    setTrades([]);
    setWatchlist([]);
    setAlerts([]);
    setFnoTrades([]);
    setSelectedChartTicker(null);
    snapshotRef.current = empty;

    load().then((result) => {
      if (cancelled) return;
      const snapshot = result.snapshot;

      if (snapshot) {
        setStocks(snapshot.stocks);
        setTrades(snapshot.trades);
        setWatchlist(snapshot.watchlist);
        setAlerts(snapshot.alerts);
        setFnoTrades(snapshot.fnoTrades);
        setSelectedChartTicker(snapshot.stocks.find((stock) => stock.status === "Active")?.ticker ?? null);
        return;
      }

      // Signed-out demo view only. Sample data is never seeded into an account.
      if (!userId) {
        setStocks(initialData);
        setTrades(initialTrades);
        setWatchlist(initialWatchlist);
        setFnoTrades(fnOTradesData);
        setSelectedChartTicker(initialData.find((stock) => stock.status === "Active")?.ticker ?? null);
      }
    });

    return () => { cancelled = true; };
  }, [load, authLoading, user?.id]);

  const persistSnapshot = useCallback(async (nextSnapshot: PortfolioSnapshot, actionLabel?: string) => {
    const error = await save(nextSnapshot);
    if (error) {
      toast({ title: `${actionLabel ?? "Changes"} saved locally`, description: "Cloud sync could not be completed.", variant: "destructive" });
    }
  }, [save, toast]);

  const applySnapshot = useCallback(async (partial: Partial<PortfolioSnapshot>, actionLabel?: string) => {
    const nextSnapshot: PortfolioSnapshot = { ...snapshotRef.current, ...partial };
    snapshotRef.current = nextSnapshot;
    if (partial.stocks)    setStocks(partial.stocks);
    if (partial.trades)    setTrades(partial.trades);
    if (partial.watchlist) setWatchlist(partial.watchlist);
    if (partial.alerts)    setAlerts(partial.alerts);
    if (partial.fnoTrades) setFnoTrades(partial.fnoTrades);
    await persistSnapshot(nextSnapshot, actionLabel);
  }, [persistSnapshot]);

  const live = useMemo(() => stocks.map((stock) => {
    const livePrice = prices[stock.ticker];
    return livePrice?.price ? { ...stock, cmp: livePrice.price, weekHigh52: livePrice.weekHigh52 || stock.weekHigh52, weekLow52: livePrice.weekLow52 || stock.weekLow52, dailyChange: livePrice.change } : stock;
  }), [prices, stocks]);

  const handlePortfolioAdd    = useCallback((stock: PortfolioStock) => { void applySnapshot({ stocks: [...snapshotRef.current.stocks, stock] }, "Portfolio update"); }, [applySnapshot]);
  const handlePortfolioImport = useCallback((importedStocks: PortfolioStock[]) => { void applySnapshot({ stocks: [...snapshotRef.current.stocks, ...importedStocks] }, "Portfolio import"); }, [applySnapshot]);
  const handlePortfolioEdit   = useCallback((originalTicker: string, updatedStock: PortfolioStock) => {
    const nextStocks = snapshotRef.current.stocks.map((s) => s.ticker === originalTicker ? updatedStock : s);
    const nextTrades = snapshotRef.current.trades.map((t) => t.ticker === originalTicker ? { ...t, ticker: updatedStock.ticker, livePrice: updatedStock.cmp } : t);
    const nextAlerts = snapshotRef.current.alerts.map((a) => a.ticker === originalTicker ? { ...a, ticker: updatedStock.ticker } : a);
    void applySnapshot({ stocks: nextStocks, trades: nextTrades, alerts: nextAlerts }, "Transaction update");
  }, [applySnapshot]);
  const handlePortfolioDelete = useCallback((ticker: string) => {
    const nextStocks = snapshotRef.current.stocks.filter((s) => s.ticker !== ticker);
    const nextTrades = snapshotRef.current.trades.filter((t) => t.ticker !== ticker);
    const nextAlerts = snapshotRef.current.alerts.filter((a) => a.ticker !== ticker);
    if (selectedChartTicker === ticker) setSelectedChartTicker(nextStocks.find((s) => s.status === "Active")?.ticker ?? null);
    void applySnapshot({ stocks: nextStocks, trades: nextTrades, alerts: nextAlerts }, "Transaction deletion");
  }, [applySnapshot, selectedChartTicker]);
  const handleTradeEdit       = useCallback((originalTicker: string, updatedTrade: TradeStrategy) => { void applySnapshot({ trades: snapshotRef.current.trades.map((t) => t.ticker === originalTicker ? updatedTrade : t) }, "Trade update"); }, [applySnapshot]);
  const handleTradeDelete     = useCallback((ticker: string) => { void applySnapshot({ trades: snapshotRef.current.trades.filter((t) => t.ticker !== ticker) }, "Trade deletion"); }, [applySnapshot]);
  const handleWatchlistAdd    = useCallback((stock: WatchlistStock) => { void applySnapshot({ watchlist: [...snapshotRef.current.watchlist, stock] }, "Watchlist update"); }, [applySnapshot]);
  const handleWatchlistEdit   = useCallback((originalName: string, updatedStock: WatchlistStock) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.map((s) => s.stockName === originalName ? updatedStock : s) }, "Watchlist update"); }, [applySnapshot]);
  const handleWatchlistDelete = useCallback((stockName: string) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.filter((s) => s.stockName !== stockName) }, "Watchlist deletion"); }, [applySnapshot]);
  const handleJournalNotesUpdate = useCallback((ticker: string, notes: TradeJournalEntry) => {
    void applySnapshot(journalNotesPatch(snapshotRef.current, ticker, notes), "Journal update");
  }, [applySnapshot]);
  const handleAlertAdd        = useCallback((alert: PriceAlert) => { void applySnapshot({ alerts: [...snapshotRef.current.alerts, alert] }, "Alert update"); }, [applySnapshot]);
  const handleAlertDelete     = useCallback((id: string) => { void applySnapshot({ alerts: snapshotRef.current.alerts.filter((a) => a.id !== id) }, "Alert update"); }, [applySnapshot]);
  const handleAlertDismiss    = useCallback((id: string) => {
    const dismissedAt = new Date().toISOString();
    void applySnapshot({ alerts: snapshotRef.current.alerts.map((a) => a.id === id ? { ...a, dismissedAt } : a) }, "Alert update");
  }, [applySnapshot]);
  const handleFnoTradesUpdate = useCallback((nextTrades: FnOTrade[]) => {
    const sanitize = (t: FnOTrade) => { const { ltp, dayChange, iv, delta, ...rest } = t; return rest; };
    const prev = JSON.stringify(snapshotRef.current.fnoTrades.map(sanitize));
    const next = JSON.stringify(nextTrades.map(sanitize));
    if (prev === next) { snapshotRef.current = { ...snapshotRef.current, fnoTrades: nextTrades }; setFnoTrades(nextTrades); return; }
    void applySnapshot({ fnoTrades: nextTrades }, "F&O update");
  }, [applySnapshot]);

  // Alerts are evaluated only while this app is open, against quotes the
  // dashboard already polls. A quote must be a recent, timestamped observation
  // of a still-tracked symbol that postdates the alert; a failed refresh
  // invalidates the whole pass. Triggered and dismissed alerts are terminal,
  // so a repeated price refresh cannot notify twice.
  useEffect(() => {
    const { alerts: nextAlerts, newlyTriggered } = evaluateAlerts(
      snapshotRef.current.alerts,
      prices,
      {
        refreshFailed: priceError !== null,
        activeTickers: new Set(tickers),
      },
    );
    if (newlyTriggered.length === 0) return;

    void applySnapshot({ alerts: nextAlerts }, "Alert trigger");
    toast({
      title: newlyTriggered.length === 1 ? "Price alert triggered" : `${newlyTriggered.length} price alerts triggered`,
      description: newlyTriggered
        .map((a) => `${a.ticker} ${a.direction === "above" ? "≥" : "≤"} ₹${a.targetPrice}`)
        .join(" · "),
    });
  }, [prices, alerts, applySnapshot, toast, priceError, tickers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (uMenuRef.current && !uMenuRef.current.contains(e.target as Node)) setUMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUMenu(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, []);

  const activePos   = live.filter(s => s.status === "Active");
  const closedPos   = live.filter(s => s.status !== "Active");
  const activeStocks = live.filter(s => s.status === "Active");
  const closedStocks = live.filter(s => s.status !== "Active");

  const equityInvested   = activeStocks.reduce((sum, s) => sum + (s.entryPrice * s.quantity), 0);
  const activeCurr       = activeStocks.reduce((sum, s) => sum + (s.cmp * s.quantity), 0);
  const unrealisedPnl    = activeCurr - equityInvested;
  const realisedPnl      = closedStocks.reduce((sum, s) => sum + ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity, 0);

  const fnoOpen        = fnoTrades.filter(t => t.status === "Open");
  const fnoClosed      = fnoTrades.filter(t => t.status !== "Open");
  const fnoInvested    = fnoOpen.reduce((s, t) => s + calcFnOInvested(t), 0);
  const fnoUnrealised  = fnoOpen.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoRealised    = fnoClosed.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoActiveCurr  = fnoInvested + fnoUnrealised;

  const invested       = equityInvested + fnoInvested;
  const current        = activeCurr + fnoActiveCurr;
  const pnl            = unrealisedPnl + fnoUnrealised;
  const pnlPct         = invested > 0 ? pnl / invested * 100 : 0;
  const totalRealised  = realisedPnl + fnoRealised;

  const winners  = closedPos.filter(s => calcProfitLoss(s) > 0);
  const winRate  = closedPos.length > 0 ? winners.length / closedPos.length * 100 : 0;
  const today    = new Date();
  const todayEquityUnrealised = activePos.reduce((acc, s) => { const pd = prices[s.ticker]; if (pd?.change !== undefined) return acc + pd.change * s.quantity; return acc; }, 0);
  const todayFnOUnrealised    = fnoOpen.reduce((acc, t) => acc + (t.dayChange ?? 0) * t.lots * t.lotSize, 0);
  const todayRealisedEquity   = closedPos.filter((s) => isSameTradingDay(s.exitDate, today)).reduce((acc, s) => acc + calcProfitLoss(s), 0);
  const todayRealisedFnO      = fnoClosed.filter((t) => isSameTradingDay(t.exitDate, today)).reduce((acc, t) => acc + calcFnOPnL(t), 0);
  const todayPnl = todayEquityUnrealised + todayFnOUnrealised + todayRealisedEquity + todayRealisedFnO;

  const performers = activePos.filter(s => s.entryPrice > 0).map(s => ({ ticker: s.ticker, pct: (s.cmp - s.entryPrice) / s.entryPrice * 100 })).sort((a, b) => b.pct - a.pct);
  const best  = performers[0];
  const worst = performers[performers.length - 1];

  useEffect(() => {
    const nextTicker = selectedChartTicker && activePos.some((s) => s.ticker === selectedChartTicker) ? selectedChartTicker : activePos[0]?.ticker ?? null;
    if (nextTicker !== selectedChartTicker) setSelectedChartTicker(nextTicker);
  }, [activePos, selectedChartTicker]);

  const selectedChartStock     = activePos.find((s) => s.ticker === selectedChartTicker) ?? activePos[0] ?? null;
  const selectedChartPrice     = selectedChartStock ? prices[selectedChartStock.ticker] : undefined;
  const selectedChartDayPct    = selectedChartPrice?.changePercent ?? (selectedChartStock && selectedChartStock.entryPrice > 0 ? ((selectedChartStock.cmp - selectedChartStock.entryPrice) / selectedChartStock.entryPrice) * 100 : 0);

  const sectorMap = new Map<string, number>();
  activePos.forEach(s => { const sec = s.sector ?? "Other"; sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + calcInvestedValue(s)); });
  const sectorTotal = invested > 0 ? activePos.reduce((s, x) => s + calcInvestedValue(x), 0) : 1;
  const sectors = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, val]) => ({ name, val, pct: val / sectorTotal * 100 }));
  const SECTOR_COLORS = SECTOR_PALETTE;

  // IST wall clock from the shared market-status service (never browser-local).
  const now = market.istTime;

  const PAGE_TITLES: Record<ActiveTab, string> = {
    overview: "Dashboard", holdings: "Portfolio Holdings", trades: "Trades & F&O",
    watchlist: "Watchlist", ai: "AI Insights", charts: "Charts & Analytics",
    analytics: "Trade Analytics", history: "Trade History", journal: "Trade Journal",
    sector: "Sector Allocation", alerts: "Price Alerts", export: "Export Data",
    news: "Holdings News Feed",
  };

  if (authLoading) return (
    <div className="zf" style={{ alignItems:"center", justifyContent:"center" }} role="status" aria-live="polite">
      <div style={{ textAlign:"center" }}>
        <div className="zf-spin" style={{ width:32, height:32, border:"2.5px solid var(--bd-100)", borderTopColor:"var(--accent)", borderRadius:"50%", margin:"0 auto 12px" }} />
        <div style={{ fontSize:12, color:"var(--tx-400)", fontFamily:"var(--ff-mono)" }}>Loading your portfolio…</div>
      </div>
    </div>
  );

  if (!user) return (
    <>
      <style>{`
        .lp { min-height:100vh; background:hsl(220 16% 97%); font-family:'Geist',-apple-system,sans-serif; display:flex; flex-direction:column; }
        .lp-nav { background:#fff; border-bottom:1px solid hsl(220 14% 89%); padding:0 40px; height:60px; display:flex; align-items:center; justify-content:space-between; }
        .lp-brand { display:flex; align-items:center; gap:10px; }
        .lp-logo { width:30px; height:30px; background:hsl(220 85% 48%); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        .lp-name { font-size:16px; font-weight:700; color:hsl(220 25% 10%); letter-spacing:-.3px; }
        .lp-signin-btn { background:hsl(220 85% 48%); color:white; border:none; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .15s; }
        .lp-signin-btn:hover { background:hsl(220 85% 42%); }
        .lp-hero { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; text-align:center; }
        .lp-hero-badge { display:inline-flex; align-items:center; gap:6px; background:hsl(220 85% 48% / .08); color:hsl(220 85% 48%); border:1px solid hsl(220 85% 48% / .2); border-radius:20px; padding:5px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin-bottom:24px; }
        .lp-hero-dot { width:5px; height:5px; border-radius:50%; background:hsl(152 70% 38%); }
        .lp-h1 { font-size:clamp(32px,5vw,52px); font-weight:800; color:hsl(220 25% 10%); line-height:1.1; letter-spacing:-1.5px; max-width:680px; margin-bottom:18px; }
        .lp-h1 span { color:hsl(220 85% 48%); }
        .lp-sub { font-size:16px; color:hsl(220 12% 52%); max-width:500px; line-height:1.6; margin-bottom:36px; }
        .lp-cta-row { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .lp-cta-primary { background:hsl(220 85% 48%); color:white; border:none; padding:12px 30px; border-radius:9px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
        .lp-cta-primary:hover { background:hsl(220 85% 42%); transform:translateY(-1px); }
        .lp-cta-ghost { background:transparent; color:hsl(220 85% 48%); border:1.5px solid hsl(220 14% 89%); padding:12px 30px; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .lp-cta-ghost:hover { background:hsl(220 85% 48% / .05); border-color:hsl(220 85% 48% / .3); }
        .lp-features { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; max-width:840px; width:100%; margin-top:60px; }
        .lp-feat { background:#fff; border:1px solid hsl(220 14% 89%); border-radius:12px; padding:24px 20px; text-align:left; }
        .lp-feat-icon { width:38px; height:38px; border-radius:9px; background:hsl(220 85% 48% / .08); border:1px solid hsl(220 85% 48% / .18); display:flex; align-items:center; justify-content:center; margin-bottom:12px; font-size:18px; }
        .lp-feat-title { font-size:13.5px; font-weight:700; color:hsl(220 25% 10%); margin-bottom:6px; }
        .lp-feat-desc { font-size:12px; color:hsl(220 12% 52%); line-height:1.6; }
        @media(max-width:640px){ .lp-features{grid-template-columns:1fr;} .lp-h1{font-size:30px;} }
      `}</style>
      <div className="lp">
        <nav className="lp-nav">
          <div className="lp-brand">
            <div className="lp-logo">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="white" /></svg>
            </div>
            <span className="lp-name">ZenFolio</span>
          </div>
          <button className="lp-signin-btn" onClick={() => setShowAuth(true)}>Sign in</button>
        </nav>
        <div className="lp-hero">
          <div className="lp-hero-badge"><div className="lp-hero-dot" />NSE Live Prices · AI-Powered</div>
          <h1 className="lp-h1">Track your <span>Indian stocks</span> like a pro trader</h1>
          <p className="lp-sub">Real-time portfolio tracking, AI-powered insights, trade journal, and sector analysis — built for NSE/BSE investors.</p>
          <div className="lp-cta-row">
            <button className="lp-cta-primary" onClick={() => setShowAuth(true)}>Get started free →</button>
            <button className="lp-cta-ghost" onClick={() => setShowAuth(true)}>Sign in to your account</button>
          </div>
          <div className="lp-features">
            {[
              { icon:"📊", title:"Live Portfolio Tracker", desc:"Real-time NSE prices via Upstox with 5-tier fallback. Watch your P&L update every 60 seconds during market hours." },
              { icon:"🤖", title:"AI Portfolio Analyst", desc:"Powered by Groq's Llama 3.3 70B. Get instant analysis, risk assessment, and actionable trade recommendations." },
              { icon:"📈", title:"Trade Journal & Analytics", desc:"Track every trade with entry/exit, win rate, sector allocation, and performance charts. Know what's working." },
            ].map(f => (
              <div key={f.title} className="lp-feat">
                <div className="lp-feat-icon">{f.icon}</div>
                <div className="lp-feat-title">{f.title}</div>
                <div className="lp-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );

  const MOBILE_PRIMARY: { id: ActiveTab; label: string; icon: typeof Wallet }[] = [
    { id: "overview",  label: "Home",      icon: LayoutDashboard },
    { id: "holdings",  label: "Portfolio", icon: Wallet },
    { id: "watchlist", label: "Watchlist", icon: Eye },
    { id: "alerts",    label: "Alerts",    icon: Bell },
  ];
  const onMobilePrimary = MOBILE_PRIMARY.some((m) => m.id === tab);

  return (
    <>
      <div className="zf">
        {/* ══════════ SIDEBAR ══════════ */}
        <div className={`zf-scrim${mobileNav ? " open" : ""}`} onClick={() => setMobileNav(false)} aria-hidden="true" />
        <aside
          id="zf-primary-nav"
          className={`zf-sidebar${collapsed ? " collapsed" : ""}${mobileNav ? " mobile-open" : ""}`}
          aria-label="Primary"
        >
          <div className="zf-brand">
            <div className="zf-logo">
              <LogoMark size={28} />
            </div>
            <div className="zf-brand-text">
              <div className="zf-brand-name">ZenFolio</div>
              <div className="zf-brand-sub">Portfolio Tracker</div>
            </div>
          </div>
          <button
            type="button"
            className="zf-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="zf-primary-nav"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          <nav className="zf-nav-scroll" aria-label="Sections">
            {NAV_GROUPS.map(grp => (
              <div key={grp.label} role="group" aria-labelledby={`zf-grp-${grp.label}`}>
                <div className="zf-nav-grp" id={`zf-grp-${grp.label}`}>{grp.label}</div>
                <ul className="zf-nav-list">
                  {grp.items.map(({ id, label, icon: Icon }) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={`zf-nav-item${tab === id ? " active" : ""}`}
                        onClick={() => goTo(id as ActiveTab)}
                        aria-current={tab === id ? "page" : undefined}
                        title={collapsed ? label : undefined}
                      >
                        <Icon strokeWidth={tab === id ? 2.2 : 1.8} size={16} aria-hidden="true" />
                        <span className="zf-nav-label">{label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="zf-sidebar-foot">
            <div className="zf-user-row" title={collapsed ? (user?.email ?? "Guest") : undefined}>
              <div className="zf-user-avatar" aria-hidden="true">{(user?.email?.[0] ?? "G").toUpperCase()}</div>
              <div className="zf-user-info">
                <div className="zf-user-name">{user?.email?.split("@")[0] ?? "Guest"}</div>
                <div className="zf-user-role">Trader</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <div className="zf-main">
          <header className="zf-header">
            <button
              type="button"
              className="zf-hbtn zf-menu-btn"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="zf-primary-nav"
            >
              <Menu size={16} aria-hidden="true" />
            </button>

            <h1 className="zf-page-title">{PAGE_TITLES[tab]}</h1>

            <div className={`zf-live${marketLive ? "" : " cached"}`} title={market.description} role="status">
              <div className="zf-ldot" aria-hidden="true" />
              <span className="zf-live-label">NSE {market.label}</span>
              <span className="zf-live-time">· {now} IST</span>
            </div>

            <button type="button" className="zf-hbtn" onClick={refresh} aria-label="Refresh prices" title="Refresh prices">
              <RefreshCw size={14} className={!dataFresh ? "zf-spin" : ""} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="zf-hbtn"
              onClick={() => setTheme(darkMode ? "light" : "dark")}
              aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
              title={darkMode ? "Light theme" : "Dark theme"}
            >
              {darkMode ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            </button>

            <div style={{ position: "relative" }} ref={uMenuRef}>
              <button
                type="button"
                className="zf-hbtn"
                onClick={() => setUMenu(p => !p)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={uMenu}
              >
                <Settings size={14} aria-hidden="true" />
              </button>
              {uMenu && (
                <div className="zf-umenu" role="menu" aria-label="Account">
                  <div className="zf-umenu-head">
                    <div className="zf-umenu-lbl">Signed in as</div>
                    <div className="zf-umenu-email">{user?.email ?? "Not signed in"}</div>
                  </div>
                  {user ? (
                    <button type="button" role="menuitem" autoFocus className="zf-umenu-btn danger" onClick={() => { signOut(); setUMenu(false); }}>
                      <LogOut size={13} aria-hidden="true" /> Sign out
                    </button>
                  ) : (
                    <button type="button" role="menuitem" autoFocus className="zf-umenu-btn primary" onClick={() => { setShowAuth(true); setUMenu(false); }}>
                      <LogOut size={13} aria-hidden="true" /> Sign in
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Greeting */}
          {tab === "overview" && (
            <div className="zf-greet-wrap">
              <div className="zf-greeting">
                <div>
                  <h2 className="zf-greeting-name">{getGreeting()}, {user?.email?.split("@")[0] ?? "Trader"}</h2>
                  <p className="zf-greeting-desc">
                    {activePos.length > 0 ? (
                      <>
                        Open positions are{" "}
                        <span style={{ color: pnl>=0 ? "var(--green)" : "var(--red)", fontWeight:650, fontFamily:"var(--ff-mono)" }}>
                          {pnl >= 0 ? "up" : "down"} {sign(pnl)}{Math.abs(pnlPct).toFixed(1)}%
                        </span>{" "}
                        against cost.
                      </>
                    ) : "Add your first position to start tracking performance."}
                  </p>
                </div>
                <div className="zf-greeting-right">
                  <div className="zf-greeting-pill" title={market.description}>
                    <span aria-hidden="true" style={{ width:6, height:6, borderRadius:"50%", background:marketLive?"var(--green)":"var(--amber)", display:"inline-block" }} />
                    {market.label} · {now} IST
                  </div>
                  <button type="button" className="zf-greeting-pill" onClick={refresh}>
                    <RefreshCw size={12} aria-hidden="true" className={!dataFresh ? "zf-spin" : ""} /> Refresh prices
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="zf-content">

            {/* ══════════ OVERVIEW ══════════ */}
            {tab === "overview" && (<>

              {/* KPI row: one gradient hero + three quiet metrics */}
              <section className="zf-kpi-row" aria-label="Portfolio summary">
                <article className="zf-kpi zf-hero zf-a1" aria-labelledby="zf-kpi-value">
                  <div className="zf-kpi-lbl" id="zf-kpi-value"><Wallet size={14} aria-hidden="true" /> Portfolio value</div>
                  <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                    <div className="zf-kpi-val">{fmt(current)}</div>
                    <span className="zf-hero-chip">
                      {pnl >= 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
                      {sign(pnl)}{fmt(Math.abs(pnl))} ({sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="zf-kpi-sub">Unrealised on {fmt(invested)} invested · {activePos.length + fnoOpen.length} open positions</div>
                  {current > 0 && (
                    <div className="zf-hero-split">
                      <div className="zf-hero-split-bar" role="img"
                        aria-label={`Equity ${(activeCurr / current * 100).toFixed(0)} percent, F&O ${(fnoActiveCurr / current * 100).toFixed(0)} percent of current value`}>
                        <span style={{ width:`${Math.max(0, activeCurr / current * 100)}%`, background:"hsl(0 0% 100% / .92)" }} />
                        <span style={{ width:`${Math.max(0, fnoActiveCurr / current * 100)}%`, background:"hsl(190 95% 72%)" }} />
                      </div>
                      <div className="zf-hero-split-legend">
                        <span><i style={{ background:"hsl(0 0% 100% / .92)" }} />Equity {fmt(activeCurr)}</span>
                        <span><i style={{ background:"hsl(190 95% 72%)" }} />F&amp;O {fmt(fnoActiveCurr)}</span>
                      </div>
                    </div>
                  )}
                </article>

                <article className="zf-kpi zf-a2">
                  <div className="zf-kpi-lbl"><Zap size={14} aria-hidden="true" /> Today's P&amp;L</div>
                  <div className="zf-kpi-val zf-kpi-val-row" style={{ color: todayPnl > 0 ? "var(--green)" : todayPnl < 0 ? "var(--red)" : undefined }}>
                    {todayPnl > 0 && <ArrowUpRight size={18} aria-hidden="true" />}
                    {todayPnl < 0 && <ArrowDownRight size={18} aria-hidden="true" />}
                    {sign(todayPnl)}{fmt(Math.abs(todayPnl))}
                  </div>
                  <div className="zf-kpi-sub">
                    {dataFresh ? "Quotes as of " : "Awaiting quotes · "}{now} IST
                  </div>
                </article>

                <article className="zf-kpi zf-a3">
                  <div className="zf-kpi-lbl"><TrendingUp size={14} aria-hidden="true" /> Total invested</div>
                  <div className="zf-kpi-val">{fmt(invested)}</div>
                  <div className="zf-kpi-sub">{activePos.length} active · {closedPos.length} closed equity</div>
                </article>

                <article className="zf-kpi zf-a4">
                  <div className="zf-kpi-lbl"><Award size={14} aria-hidden="true" /> Win rate</div>
                  <div className="zf-kpi-val" style={{ color: closedPos.length === 0 ? "var(--tx-400)" : undefined }}>
                    {closedPos.length > 0 ? `${winRate.toFixed(0)}%` : "—"}
                  </div>
                  <div className="zf-kpi-sub">
                    Realised{" "}
                    <span style={{ color: totalRealised >= 0 ? "var(--green)" : "var(--red)", fontWeight:650, fontFamily:"var(--ff-mono)" }}>
                      {sign(totalRealised)}{fmt(Math.abs(totalRealised))}
                    </span>
                    {" "}· {winners.length}/{closedPos.length} wins
                  </div>
                </article>
              </section>

              {/* Mid Row: Holdings breakdown + Sector */}
              <div className="zf-mid-row zf-a5">
                <section className="zf-card" aria-labelledby="zf-breakdown-title">
                  <div className="zf-card-head">
                    <div>
                      <h3 className="zf-card-title" id="zf-breakdown-title">Holdings breakdown</h3>
                      <div style={{ fontSize:11.5, color:"var(--tx-400)", marginTop:3 }}>Top positions by {breakdownMetric === "value" ? "current value" : breakdownMetric === "invested" ? "amount invested" : "unrealised P&L"}</div>
                    </div>
                    <div className="zf-seg" role="group" aria-label="Breakdown metric">
                      {([["value","Value"],["invested","Invested"],["pnl","P&L"]] as const).map(([id, label]) => (
                        <button key={id} type="button" aria-pressed={breakdownMetric === id} onClick={() => setBreakdownMetric(id)}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <HoldingsBreakdown stocks={live} metric={breakdownMetric} />
                </section>

                <section className="zf-card zf-sector-side" aria-labelledby="zf-sector-title">
                  <div className="zf-card-head">
                    <h3 className="zf-card-title" id="zf-sector-title">Sector weights</h3>
                    <button type="button" className="zf-card-link" onClick={() => goTo("sector")}>Details</button>
                  </div>
                  {sectors.length === 0 ? (
                    <div className="zf-empty">No sector exposure yet.</div>
                  ) : (
                    <>
                      <div style={{ padding:"16px 18px 12px" }}>
                        <DonutWidget stocks={live} />
                      </div>
                      <div className="zf-sector-list">
                        {sectors.slice(0,5).map((s, i) => (
                          <div key={s.name} className="zf-sector-item">
                            <div className="zf-sector-row">
                              <span className="zf-sector-name">{s.name}</span>
                              <span className="zf-sector-pct">{fmt(s.val)}</span>
                            </div>
                            <div className="zf-sector-bar" aria-hidden="true">
                              <div className="zf-sector-fill" style={{ width:`${s.pct}%`, background:SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              </div>

              {/* Bot Row: Holdings + Watchlist */}
              <div className="zf-bot-row zf-a6">
                <section className="zf-card" aria-labelledby="zf-holdings-title">
                  <div className="zf-card-head">
                    <h3 className="zf-card-title" id="zf-holdings-title">Current holdings</h3>
                    <button type="button" className="zf-card-link" onClick={() => goTo("holdings")}>View all</button>
                  </div>
                  <div className="zf-card-body">
                    <div className="zf-tbl-head" aria-hidden="true">
                      <span className="zf-th">Asset</span>
                      <span className="zf-th r">Qty</span>
                      <span className="zf-th r">Avg</span>
                      <span className="zf-th r">LTP</span>
                      <span className="zf-th r">P&amp;L</span>
                    </div>
                    {activePos.length === 0 ? (
                      <div className="zf-empty">
                        No active holdings.{" "}
                        <button type="button" className="zf-link-btn" onClick={() => goTo("holdings")}>Add a position</button>
                      </div>
                    ) : activePos.slice(0, 5).map((s) => {
                      const pl    = s.entryPrice > 0 ? (s.cmp - s.entryPrice) / s.entryPrice * 100 : 0;
                      const plAmt = (s.cmp - s.entryPrice) * s.quantity;
                      const pos   = pl >= 0;
                      const initials = s.ticker.slice(0, 4);
                      const selected = selectedChartStock?.ticker === s.ticker;
                      return (
                        <button key={s.ticker} type="button" className={`zf-trow${selected ? " selected" : ""}`}
                          aria-pressed={selected}
                          aria-label={`${s.stockName ?? s.ticker}: ${s.quantity} shares, average ₹${fmtNum(s.entryPrice)}, last ₹${fmtNum(s.cmp)}, ${pos ? "gain" : "loss"} ${Math.abs(pl).toFixed(1)} percent. Show in price chart`}
                          onClick={() => setSelectedChartTicker(s.ticker)}>
                          <span className="zf-stock-cell">
                            <span className="zf-logo-wrap" aria-hidden="true">
                              <img src={`https://logo.clearbit.com/${(s.stockName??s.ticker).toLowerCase().replace(/\s+/g,"")}.com`} alt=""
                                onError={e => { (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).parentElement!.textContent=initials; }} />
                            </span>
                            <span style={{ minWidth:0 }}>
                              <span className="zf-ticker-name" style={{ display:"block" }}>{s.stockName ?? s.ticker}</span>
                              <span className="zf-sector-tag">{s.sector}</span>
                            </span>
                          </span>
                          <span className="zf-td r">{s.quantity}</span>
                          <span className="zf-td r">₹{fmtNum(s.entryPrice)}</span>
                          <span className="zf-td r">₹{fmtNum(s.cmp)}</span>
                          <span style={{ textAlign:"right" }}>
                            <span className="zf-pl" style={{ display:"block", color:pos?"var(--green)":"var(--red)" }}>
                              {pos ? "+" : "−"}₹{Math.abs(plAmt).toLocaleString("en-IN",{maximumFractionDigits:0})}
                            </span>
                            <span className="zf-pl-sub" style={{ display:"block", color:pos?"var(--green)":"var(--red)" }}>
                              {sign(pl)}{Math.abs(pl).toFixed(1)}%
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="zf-card" aria-labelledby="zf-wl-title">
                  <div className="zf-card-head">
                    <h3 className="zf-card-title" id="zf-wl-title">Watchlist</h3>
                    <button type="button" className="zf-card-link" onClick={() => goTo("watchlist")}>
                      {watchlist.length > 0 ? "Manage" : "+ Add"}
                    </button>
                  </div>
                  <div className="zf-card-body" style={{ flex:1 }}>
                    {watchlist.length === 0 ? (
                      <div className="zf-empty">
                        Nothing on your watchlist yet.{" "}
                        <button type="button" className="zf-link-btn" onClick={() => goTo("watchlist")}>Add a symbol</button>
                      </div>
                    ) : watchlist.slice(0, 4).map((w) => {
                      const cmp = w.cmp ?? 0;
                      const inZone = cmp >= w.entryZoneLow && cmp <= w.entryZoneHigh;
                      return (
                        <button key={w.stockName} type="button" className="zf-wl-row"
                          aria-label={`${w.stockName}, ₹${cmp.toLocaleString("en-IN")}${inZone ? ", inside entry zone" : ""}. Open watchlist`}
                          onClick={() => goTo("watchlist")}>
                          <span style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                            <span aria-hidden="true" className="zf-logo-wrap" style={{ width:34, height:34 }}>
                              {w.stockName.slice(0,3).toUpperCase()}
                            </span>
                            <span style={{ minWidth:0 }}>
                              <span className="zf-wl-name" style={{ display:"block" }}>{w.stockName}</span>
                              <span className="zf-wl-sub" style={{ display:"block" }}>{w.sector ?? "NSE"}</span>
                            </span>
                          </span>
                          <span className="zf-wl-zone">
                            Entry ₹{w.entryZoneLow.toLocaleString("en-IN")}–{w.entryZoneHigh.toLocaleString("en-IN")}
                          </span>
                          <span style={{ textAlign:"right" }}>
                            <span className="zf-wl-price" style={{ display:"block" }}>₹{cmp.toLocaleString("en-IN")}</span>
                            <span className="zf-wl-chg" style={{ display:"block", color: inZone ? "var(--green)" : "var(--tx-400)" }}>
                              {inZone ? "In zone" : `RSI ${w.rsi?.toFixed(0) ?? "—"}`}
                            </span>
                          </span>
                        </button>
                      );
                    })}

                    <button type="button" className="zf-ai-teaser" onClick={() => goTo("ai")}>
                      <span style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                        <Sparkles size={13} color="var(--accent)" aria-hidden="true" />
                        <span style={{ fontSize:11.5, fontWeight:650, color:"var(--tx-900)" }}>AI insights</span>
                      </span>
                      <span style={{ display:"block", fontSize:12, lineHeight:1.55, color:"var(--tx-500)" }}>
                        {activePos.length > 0 && best
                          ? <>Ask for a review of your positions. Best performer right now: <strong style={{ color:"var(--tx-900)", fontFamily:"var(--ff-mono)" }}>{best.ticker} {sign(best.pct)}{Math.abs(best.pct).toFixed(1)}%</strong>.</>
                          : <>Add holdings to get an AI review of risk and allocation.</>
                        }
                      </span>
                      <span style={{ display:"inline-block", marginTop:8, fontSize:11.5, fontWeight:650, color:"var(--accent)" }}>Open AI insights →</span>
                    </button>
                  </div>
                </section>
              </div>

              {/* F&O Positions */}
              <section className="zf-card zf-a6" aria-labelledby="zf-fno-title">
                <div className="zf-card-head">
                  <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <h3 className="zf-card-title" id="zf-fno-title">F&amp;O positions</h3>
                    <span className="zf-card-badge">{fnoOpen.length} open</span>
                    {fnoClosed.length > 0 && <span style={{ fontSize:11.5, color:"var(--tx-400)", fontFamily:"var(--ff-mono)" }}>· {fnoClosed.length} closed</span>}
                  </div>
                  <div className="zf-card-meta">
                    <button type="button" className="zf-card-link" onClick={() => { goTo("trades"); setTradesSubTab("fno"); }}>
                      {fnoOpen.length > 0 ? "Manage F&O →" : "+ Add F&O trade"}
                    </button>
                  </div>
                </div>
                <div className="zf-fno-metrics">
                  {([
                    { lbl:"Open positions", val:String(fnoOpen.length), sub:`Premium ${fmt(fnoInvested)}`, clr:"var(--tx-900)" },
                    { lbl:"Unrealised P&L", val:`${sign(fnoUnrealised)}${fmt(Math.abs(fnoUnrealised))}`, sub:`${fnoOpen.length} position${fnoOpen.length!==1?"s":""}`, clr:fnoUnrealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Realised P&L",   val:`${sign(fnoRealised)}${fmt(Math.abs(fnoRealised))}`, sub:`${fnoClosed.length} closed`, clr:fnoRealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Win rate",       val:fnoClosed.length>0?`${Math.round(fnoClosed.filter(t=>calcFnOPnL(t)>0).length/fnoClosed.length*100)}%`:"—", sub:`${fnoClosed.filter(t=>calcFnOPnL(t)>0).length}/${fnoClosed.length} profitable`, clr:"var(--tx-900)" },
                  ] as const).map((m) => (
                    <div key={m.lbl} className="zf-fno-metric">
                      <div className="zf-fno-lbl">{m.lbl}</div>
                      <div className="zf-fno-val" style={{ color:m.clr }}>{m.val}</div>
                      <div className="zf-fno-sub">{m.sub}</div>
                    </div>
                  ))}
                </div>
                {fnoOpen.length === 0 ? (
                  <div style={{ padding:"18px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--tx-700)", marginBottom:2 }}>No open F&amp;O positions</div>
                      <div style={{ fontSize:12, color:"var(--tx-400)" }}>Futures and options you add under Trades → F&amp;O appear here.</div>
                    </div>
                    <button type="button" className="zf-btn-primary" onClick={() => { goTo("trades"); setTradesSubTab("fno"); }}>
                      + Add F&amp;O trade
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX:"auto" }}>
                    <table className="zf-fno-tbl">
                      <caption className="zf-sr-only">Open F&amp;O positions</caption>
                      <thead>
                        <tr>
                          {(["Instrument","Type","Strike","Expiry","Lots×Size","Entry","LTP","P&L","Status"] as const).map(h => (
                            <th key={h} scope="col" style={{
                              textAlign: (["Entry","LTP","P&L"] as string[]).includes(h) ? "right" : (["Type","Status"] as string[]).includes(h) ? "center" : "left",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fnoOpen.map(t => {
                          const ltp = t.ltp ?? t.entryPrice;
                          const fPnl = t.instrumentType === "PE" ? (t.entryPrice-ltp)*t.lots*t.lotSize : (ltp-t.entryPrice)*t.lots*t.lotSize;
                          const pct  = t.entryPrice > 0 ? fPnl/(t.entryPrice*t.lots*t.lotSize)*100 : 0;
                          const pos  = fPnl >= 0;
                          const typeTone = t.instrumentType === "CE" ? "green" : t.instrumentType === "PE" ? "red" : "blue";
                          const ep = t.expiry.split("-");
                          const mo = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                          const ed = ep.length===3 ? `${parseInt(ep[0])} ${mo[parseInt(ep[1])]} '${ep[2].slice(-2)}` : t.expiry;
                          return (
                            <tr key={t.id} tabIndex={0}
                              aria-label={`${t.symbol} ${t.instrumentType}, open. Manage in Trades`}
                              onClick={() => { goTo("trades"); setTradesSubTab("fno"); }}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo("trades"); setTradesSubTab("fno"); } }}>
                              <td>
                                <div style={{ fontSize:12.5, fontWeight:700, color:"var(--tx-900)" }}>{t.symbol}</div>
                                {t.notes && <div style={{ fontSize:10.5, color:"var(--tx-400)", marginTop:1, maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes}</div>}
                              </td>
                              <td style={{ textAlign:"center" }}>
                                <span className={`zf-tag zf-chip-${typeTone}`}>{t.instrumentType}</span>
                              </td>
                              <td style={{ fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.strike ? `₹${t.strike.toLocaleString("en-IN")}` : "—"}</td>
                              <td style={{ fontSize:12, fontWeight:600, color:"var(--tx-700)", whiteSpace:"nowrap" }}>{ed}</td>
                              <td style={{ fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.lots} × {t.lotSize.toLocaleString("en-IN")}</td>
                              <td style={{ fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)", textAlign:"right" }}>₹{t.entryPrice.toFixed(2)}</td>
                              <td style={{ textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12, fontWeight:600, color:"var(--tx-900)", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4, fontVariantNumeric:"tabular-nums" }}>
                                  {t.ltp && <span aria-label="live quote" style={{ width:5, height:5, borderRadius:"50%", background:"var(--green)", display:"inline-block" }} />}
                                  ₹{ltp.toFixed(2)}
                                </div>
                              </td>
                              <td style={{ textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12.5, fontWeight:700, color:pos?"var(--green)":"var(--red)" }}>{sign(fPnl)}{fmt(Math.abs(fPnl))}</div>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:10.5, color:pos?"var(--green)":"var(--red)" }}>{sign(pct)}{Math.abs(pct).toFixed(1)}%</div>
                              </td>
                              <td style={{ textAlign:"center" }}>
                                <span className="zf-tag zf-tag-pill zf-chip-blue">Open</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Price chart */}
              <section className="zf-card zf-a6" aria-labelledby="zf-candle-title">
                <div className="zf-card-head">
                  <div style={{ minWidth:0 }}>
                    <h3 className="zf-card-title" id="zf-candle-title">
                      {selectedChartStock ? `${selectedChartStock.ticker} · Price` : "Price chart"}
                    </h3>
                    {activePos.length > 0 && (
                      <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }} role="group" aria-label="Chart symbol">
                        {activePos.slice(0, 8).map((stock) => (
                          <button key={stock.ticker} type="button" className="zf-chip-btn"
                            aria-pressed={selectedChartStock?.ticker === stock.ticker}
                            onClick={() => setSelectedChartTicker(stock.ticker)}>
                            {stock.ticker}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    {selectedChartStock && (
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontFamily:"var(--ff-mono)", fontSize:18, fontWeight:600, color:"var(--tx-900)", fontVariantNumeric:"tabular-nums" }}>₹{fmtNum(selectedChartStock.cmp)}</div>
                        <div style={{ fontSize:11, fontWeight:600, fontFamily:"var(--ff-mono)", color:selectedChartDayPct >= 0 ? "var(--green)" : "var(--red)" }}>
                          {sign(selectedChartDayPct)}{Math.abs(selectedChartDayPct).toFixed(2)}% today
                        </div>
                      </div>
                    )}
                    <div className="zf-seg mono" role="group" aria-label="Chart range">
                      {(["1d","5d","1mo"] as const).map((r) => (
                        <button key={r} type="button" aria-pressed={dashboardCandleRange === r} onClick={() => setDashboardCandleRange(r)}>{r}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ padding:"10px 16px 14px" }}>
                  {selectedChartTicker
                    ? <DashboardCandlestick key={darkMode ? "dark" : "light"} ticker={selectedChartTicker} range={dashboardCandleRange} />
                    : <div className="zf-empty" style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center" }}>Add an active position to view its price chart.</div>
                  }
                </div>
              </section>
            </>)}

            {/* ══════════ OTHER TABS ══════════ */}
            {tab !== "overview" && (
              <div key={tab} className="zf-tab-panel" style={{ flex: 1, minHeight: "calc(100dvh - 140px)" }}>
                {tab === "holdings"  && <PortfolioTable stocks={live} onAdd={handlePortfolioAdd} onImport={handlePortfolioImport} onEdit={handlePortfolioEdit} onDelete={handlePortfolioDelete} />}
                {tab === "trades" && (
                  <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
                    <div className="zf-subtabs" role="tablist" aria-label="Trade type">
                      {([
                        { id:"equity", label:"Equity trades", count: live.length },
                        { id:"fno",    label:"F&O positions", count: fnoTrades.length },
                      ] as const).map(st => (
                        <button key={st.id} type="button" role="tab" id={`zf-subtab-${st.id}`}
                          className="zf-subtab"
                          aria-selected={tradesSubTab === st.id}
                          aria-controls="zf-trades-panel"
                          tabIndex={tradesSubTab === st.id ? 0 : -1}
                          onClick={() => setTradesSubTab(st.id)}
                          onKeyDown={e => {
                            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                              e.preventDefault();
                              const next = st.id === "equity" ? "fno" : "equity";
                              setTradesSubTab(next);
                              document.getElementById(`zf-subtab-${next}`)?.focus();
                            }
                          }}>
                          {st.label}
                          <span className="zf-subtab-count">{st.count}</span>
                        </button>
                      ))}
                    </div>
                    <div id="zf-trades-panel" role="tabpanel" aria-labelledby={`zf-subtab-${tradesSubTab}`} style={{ flex:1, overflow:"auto", minHeight:0 }}>
                      {tradesSubTab === "equity" && <TradeStrategyTable trades={trades} onEdit={handleTradeEdit} onDelete={handleTradeDelete} />}
                      {tradesSubTab === "fno"    && <FnOTable trades={fnoTrades} onUpdate={handleFnoTradesUpdate} />}
                    </div>
                  </div>
                )}
                {tab === "watchlist" && <WatchlistTable watchlist={watchlist} onAdd={handleWatchlistAdd} onEdit={handleWatchlistEdit} onDelete={handleWatchlistDelete} />}
                {tab === "news"      && <StockNewsFeed stocks={live} />}
                {tab === "charts"    && <PortfolioCharts stocks={live} />}
                {tab === "analytics" && <TradeAnalytics stocks={live} />}
                {tab === "history"   && <TradeHistory stocks={live} />}
                {tab === "journal"   && <TradeJournal stocks={stocks} onUpdateNotes={handleJournalNotesUpdate} />}
                {tab === "sector"    && <SectorDiversification stocks={live} />}
                {tab === "alerts"    && <PriceAlerts alerts={alerts} onAddAlert={handleAlertAdd} onDeleteAlert={handleAlertDelete} onDismissAlert={handleAlertDismiss} />}
                {tab === "ai"        && <AIInsights stocks={live} />}
                {tab === "export"    && <ExportPortfolio stocks={live} />}
              </div>
            )}
          </div>
        </div>

        {/* ══════════ MOBILE BOTTOM NAV (≤768px) ══════════ */}
        <nav className="zf-bnav" aria-label="Quick navigation">
          <ul>
            {MOBILE_PRIMARY.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button type="button" onClick={() => goTo(id)} aria-current={tab === id ? "page" : undefined}>
                  <Icon size={19} strokeWidth={tab === id ? 2.2 : 1.8} aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setMobileNav(true)}
                aria-current={!onMobilePrimary ? "page" : undefined}
                aria-expanded={mobileNav} aria-controls="zf-primary-nav">
                <MoreHorizontal size={19} aria-hidden="true" />
                More
              </button>
            </li>
          </ul>
        </nav>
      </div>

      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );
}

// ─── Chart colours ────────────────────────────────────────────────────────────
// lightweight-charts draws on canvas and needs concrete colour strings, so the
// .zf tokens are resolved at chart creation. Fallbacks mirror those tokens for
// environments without the stylesheet (e.g. tests).
const CHART_FALLBACK = {
  light: { up: "hsl(156 72% 27%)", down: "hsl(356 70% 44%)", text: "hsl(230 11% 43%)", grid: "hsl(230 24% 93%)", border: "hsl(230 24% 89%)" },
  dark:  { up: "hsl(152 62% 56%)", down: "hsl(356 86% 68%)", text: "hsl(228 12% 60%)", grid: "hsl(230 22% 100% / .05)", border: "hsl(230 22% 100% / .08)" },
} as const;

function readChartColors(el: HTMLElement) {
  const scope = el.closest(".zf") ?? document.documentElement;
  const css = getComputedStyle(scope);
  const fb = document.documentElement.classList.contains("dark") ? CHART_FALLBACK.dark : CHART_FALLBACK.light;
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    up: v("--green", fb.up),
    down: v("--red", fb.down),
    text: v("--tx-400", fb.text),
    grid: v("--bd-50", fb.grid),
    border: v("--bd-100", fb.border),
  };
}

// ─── Dashboard Candlestick (lightweight-charts v5.1) ───────────────────────────────
function DashboardCandlestick({ ticker, range }: { ticker: string; range: "1d"|"5d"|"1mo" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading"|"ok"|"error">("loading");
  const [errMsg, setErrMsg] = useState("");
  // The chart is created asynchronously; the data effect waits for it so the
  // first ticker/range load is not skipped.
  const [ready, setReady] = useState(false);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    let isMounted = true;

    (async () => {
      try {
        // Dynamic import with validation
        const lwc = await import("lightweight-charts");
        
        if (destroyed || !isMounted) return;

        const createChart = lwc.createChart;
        const ColorType = lwc.ColorType;
        const CandlestickSeries = lwc.CandlestickSeries;

        // Validate exports
        if (!createChart || !ColorType) {
          console.error("Missing exports from lightweight-charts:", { createChart, ColorType });
          setStatus("error");
          setErrMsg("lightweight-charts module missing exports. Check console.");
          return;
        }

        if (typeof createChart !== 'function') {
          console.error("createChart is not a function:", typeof createChart);
          setStatus("error");
          setErrMsg("createChart is not a function");
          return;
        }

        // Colours come from the .zf tokens in src/styles/dashboard.css, so the
        // chart always matches the active theme (it is re-created on theme
        // change via its `key`). up = --green, down = --red.
        const c = readChartColors(containerRef.current!);
        const chart = createChart(containerRef.current!, {
          width: containerRef.current!.clientWidth,
          height: 220,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: c.text,
            fontFamily: "'Geist Mono', ui-monospace, monospace",
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { color: c.grid },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: c.border },
          timeScale: {
            borderColor: c.border,
            timeVisible: range === "1d",
            secondsVisible: false,
          },
          handleScroll: true,
          handleScale: true,
        });

        // Use the v5.1 API: addSeries(CandlestickSeries, options)
        const { up, down } = c;
        const series = chart.addSeries(CandlestickSeries, {
          upColor: up, downColor: down,
          borderUpColor: up, borderDownColor: down,
          wickUpColor: up, wickDownColor: down,
        });

        if (isMounted && !destroyed) {
          chartRef.current = chart;
          seriesRef.current = series;
          setReady(true);

          const ro = new ResizeObserver(() => {
            if (containerRef.current && chartRef.current && !destroyed) {
              chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
            }
          });
          ro.observe(containerRef.current!);

          return () => { destroyed = true; ro.disconnect(); };
        }
      } catch (e: any) {
        console.error("Dashboard candlestick error:", e);
        if (isMounted) {
          setStatus("error");
          setErrMsg(`Error: ${e?.message || 'Failed to load chart'}`);
        }
      }
    })();

    return () => {
      destroyed = true;
      isMounted = false;
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch OHLC on ticker/range change
  useEffect(() => {
    if (!ready || !seriesRef.current) return;
    setStatus("loading");

    const iv = range === "1d" ? "5m" : range === "5d" ? "15m" : "1d";
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?range=${range}&interval=${iv}`)
      .then(r => r.json())
      .then(data => {
        const result = data?.chart?.result?.[0];
        if (!result) { setStatus("error"); setErrMsg("No data for this symbol."); return; }
        const ts: number[] = result.timestamp ?? [];
        const q = result.indicators?.quote?.[0] ?? {};
        const candles = ts
          .map((t, i) => ({ time: t as any, open: q.open?.[i]??0, high: q.high?.[i]??0, low: q.low?.[i]??0, close: q.close?.[i]??0 }))
          .filter(c => c.open > 0 && c.close > 0)
          .filter((c, i, a) => i === 0 || c.time > a[i-1].time);
        if (!candles.length) { setStatus("error"); setErrMsg("Empty candle data for this range."); return; }
        seriesRef.current?.setData(candles);
        chartRef.current?.timeScale().fitContent();
        setStatus("ok");
      })
      .catch(() => { setStatus("error"); setErrMsg("Network error fetching chart data."); });
  }, [ticker, range, ready]);

  return (
    <div style={{ position:"relative", minHeight:220 }} aria-busy={status === "loading"}>
      {status === "loading" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", justifyContent:"flex-end", gap:8, padding:"12px 4px", zIndex:10 }} role="status">
          <span className="zf-sr-only">Loading price chart</span>
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:150 }} aria-hidden="true">
            {[52, 68, 44, 80, 62, 90, 74, 58, 84, 70, 96, 66].map((h, i) => (
              <div key={i} className="zf-skeleton" style={{ flex:1, height:`${h}%` }} />
            ))}
          </div>
          <div className="zf-skeleton" style={{ height:8, width:"100%" }} aria-hidden="true" />
        </div>
      )}
      {status === "error" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, zIndex:10 }} role="alert">
          <BarChart3 size={20} color="var(--tx-400)" aria-hidden="true" />
          <span style={{ fontSize:12, color:"var(--tx-400)", fontFamily:"var(--ff-mono)", textAlign:"center", maxWidth:300 }}>{errMsg}</span>
        </div>
      )}
      <div ref={containerRef} style={{ width:"100%", height:220, opacity: status === "ok" ? 1 : 0, transition:"opacity .2s" }} />
    </div>
  );
}


function StockLineChartWidget({ stock, dayChangePercent }: { stock: PortfolioStock | null; dayChangePercent: number; }) {
  const W = 500, H = 150;
  const pad = { l: 16, r: 16, t: 10, b: 24 };

  const series = useMemo(() => {
    if (!stock) return [];
    return buildTrendSeries(stock.cmp || stock.entryPrice, dayChangePercent, stock.ticker, 28);
  }, [dayChangePercent, stock]);

  if (!stock || series.length === 0) {
    return (<div style={{ height:150, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--tx-300)", fontSize:12 }}>Select a stock to view its chart</div>);
  }

  const values = series.map((p) => p.price);
  const minV = Math.min(...values) * 0.995;
  const maxV = Math.max(...values) * 1.005;
  const range = maxV - minV || 1;
  const xStep = (W - pad.l - pad.r) / Math.max(series.length - 1, 1);
  const yOf = (v: number) => pad.t + (1 - (v - minV) / range) * (H - pad.t - pad.b);
  const xOf = (i: number) => pad.l + i * xStep;
  const line = series.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ");
  const area = `M${xOf(0).toFixed(1)},${yOf(series[0].price).toFixed(1)} ` +
    series.slice(1).map((p, i) => `L${xOf(i + 1).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ") +
    ` L${xOf(series.length - 1).toFixed(1)},${(H - pad.b).toFixed(1)} L${xOf(0).toFixed(1)},${(H - pad.b).toFixed(1)} Z`;
  const positive = dayChangePercent >= 0;
  const stroke   = positive ? "var(--green)" : "var(--red)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width:"100%", height:150 }}>
      <defs>
        <linearGradient id="zfStockArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={positive ? "hsl(152 70% 38%)" : "hsl(4 84% 52%)"} stopOpacity=".18" />
          <stop offset="100%" stopColor={positive ? "hsl(152 70% 38%)" : "hsl(4 84% 52%)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#zfStockArea)" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {["Open","Mid","Now"].map((label, index) => {
        const pointIndex = index === 0 ? 0 : index === 1 ? Math.floor((series.length - 1) / 2) : series.length - 1;
        return (
          <text key={label} x={xOf(pointIndex).toFixed(1)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--tx-400)" fontFamily="var(--ff-mono)">{label}</text>
        );
      })}
      <circle cx={xOf(series.length - 1).toFixed(1)} cy={yOf(series[series.length - 1].price).toFixed(1)} r="3.5" fill="var(--bg-card)" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
