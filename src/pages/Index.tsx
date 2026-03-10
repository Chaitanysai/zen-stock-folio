import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Crosshair, Eye, LayoutDashboard, Shield,
  RefreshCw, History, BookOpen, Bell, Brain, PieChart,
  Save, Menu, X, IndianRupee, Briefcase, TrendingUp,
  TrendingDown, Target, Activity, Percent, Sun, Moon,
  Waves, ChevronRight
} from "lucide-react";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry,
  calcInvestedValue, calcFinalValue, calcProfitLoss, getTradeAnalytics
} from "@/data/sampleData";
import PortfolioTable from "@/components/PortfolioTable";
import TradeStrategyTable from "@/components/TradeStrategyTable";
import WatchlistTable from "@/components/WatchlistTable";
import PortfolioCharts from "@/components/PortfolioCharts";
import RiskAnalysis from "@/components/RiskAnalysis";
import TradeAnalytics from "@/components/TradeAnalytics";
import TradeHistory from "@/components/TradeHistory";
import TradeJournal from "@/components/TradeJournal";
import SectorDiversification from "@/components/SectorDiversification";
import PriceAlerts from "@/components/PriceAlerts";
import AIInsights from "@/components/AIInsights";
import ExportPortfolio from "@/components/ExportPortfolio";
import { AuthButton } from "@/components/AuthModal";
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/useLivePrices";
import { usePortfolioSync, loadFromLocal } from "@/hooks/usePortfolioSync";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

// ── Palette ────────────────────────────────────────────────────────────────────
const CARDS = [
  { cls: "stat-card-1", iconBg: "card-icon-bg-1", color: "hsl(230,50%,32%)",  icon: IndianRupee, label: "Total Invested"  },
  { cls: "stat-card-2", iconBg: "card-icon-bg-2", color: "hsl(0,72%,35%)",    icon: Briefcase,   label: "Current Value"  },
  { cls: "stat-card-3", iconBg: "card-icon-bg-3", color: "hsl(0,85%,42%)",    icon: TrendingUp,  label: "Total P&L"      },
  { cls: "stat-card-4", iconBg: "card-icon-bg-4", color: "hsl(8,90%,48%)",    icon: Target,      label: "Win Rate"       },
  { cls: "stat-card-5", iconBg: "card-icon-bg-5", color: "hsl(18,95%,52%)",   icon: Activity,    label: "Open Positions" },
  { cls: "stat-card-6", iconBg: "card-icon-bg-6", color: "hsl(28,98%,50%)",   icon: BarChart3,   label: "Closed Trades"  },
  { cls: "stat-card-7", iconBg: "card-icon-bg-7", color: "hsl(38,100%,46%)",  icon: Percent,     label: "Risk/Reward"    },
];

const NAV_TABS = [
  { value: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { value: "portfolio", label: "Portfolio",   icon: BarChart3 },
  { value: "trades",    label: "Trades",      icon: Crosshair },
  { value: "history",   label: "History",     icon: History },
  { value: "watchlist", label: "Watchlist",   icon: Eye },
  { value: "analytics", label: "Analytics",   icon: PieChart },
  { value: "journal",   label: "Journal",     icon: BookOpen },
  { value: "alerts",    label: "Alerts",      icon: Bell },
  { value: "risk",      label: "Risk",        icon: Shield },
  { value: "ai",        label: "AI Insights", icon: Brain },
];

// Bottom nav shows first 5 most used; rest accessible via sidebar
const BOTTOM_NAV = [
  { value: "dashboard", label: "Home",      icon: LayoutDashboard },
  { value: "portfolio", label: "Portfolio", icon: BarChart3 },
  { value: "trades",    label: "Trades",    icon: Crosshair },
  { value: "watchlist", label: "Watch",     icon: Eye },
  { value: "alerts",    label: "Alerts",    icon: Bell },
];

// ── Stats panel ────────────────────────────────────────────────────────────────
const StatsPanel = ({ stocks }: { stocks: PortfolioStock[] }) => {
  const activeStocks  = stocks.filter(s => s.status === "Active");
  const closedStocks  = stocks.filter(s => s.status !== "Active");

  // Active-only metrics (capital currently deployed)
  const activeInvested     = activeStocks.reduce((s, x) => s + calcInvestedValue(x), 0);
  const activeCurrentValue = activeStocks.reduce((s, x) => s + calcFinalValue(x), 0);
  const activePL           = activeStocks.reduce((s, x) => s + calcProfitLoss(x), 0);
  const activePLPct        = activeInvested > 0 ? (activePL / activeInvested) * 100 : 0;
  const isProfit           = activePL >= 0;

  // Closed-only P&L (realised)
  const closedPL      = closedStocks.reduce((s, x) => s + calcProfitLoss(x), 0);

  // Overall analytics (win rate etc. uses all trades)
  const analytics     = getTradeAnalytics(stocks);

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const values = [
    fmt(activeInvested),                                                           // Active invested
    fmt(activeCurrentValue),                                                       // Active current value
    `${isProfit ? "+" : "-"}${fmt(activePL)}`,                                    // Active P&L
    `${analytics.winRate.toFixed(1)}%`,                                            // Win rate
    `${activeStocks.length}`,                                                      // Open positions
    `${closedStocks.length}`,                                                      // Closed trades
    analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A",
  ];

  const subs = [
    `Excl. ₹${Math.abs(closedPL).toLocaleString("en-IN", { maximumFractionDigits: 0 })} realised`,
    `Active positions only`,
    `${isProfit ? "+" : ""}${activePLPct.toFixed(1)}% on active`,
    null,
    `₹${activeInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })} deployed`,
    `${closedPL >= 0 ? "+" : "-"}₹${Math.abs(closedPL).toLocaleString("en-IN", { maximumFractionDigits: 0 })} realised P&L`,
    null,
  ];

  return (
    /* Mobile: horizontal scroll row — Desktop: 7-col grid */
    <div className="relative">
      {/* Desktop grid */}
      <div className="hidden sm:grid grid-cols-4 lg:grid-cols-7 gap-3 stagger">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`stat-card ${c.cls} animate-fade-up`}>
              <div className="relative z-10">
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center mb-3 ${c.iconBg}`}>
                  <Icon className="h-4 w-4" style={{ color: c.color }} />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{c.label}</p>
                <p className="text-xl font-bold ticker leading-none" style={{ color: c.color }}>{values[i]}</p>
                {subs[i] && <p className="text-xs ticker mt-1 font-medium" style={{ color: c.color, opacity: 0.7 }}>{subs[i]}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: 2×2 prominent cards + horizontal scroll strip */}
      <div className="sm:hidden space-y-3">
        {/* Top 2 hero cards side by side */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 2].map(i => {
            const c = CARDS[i];
            const Icon = c.icon;
            return (
              <div key={c.label} className={`stat-card ${c.cls}`} style={{ padding: "1rem" }}>
                <div className="relative z-10">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center mb-2 ${c.iconBg}`}>
                    <Icon className="h-4 w-4" style={{ color: c.color }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{c.label}</p>
                  <p className="text-base font-bold ticker leading-none" style={{ color: c.color }}>{values[i]}</p>
                  {subs[i] && <p className="text-[11px] ticker mt-0.5" style={{ color: c.color, opacity: 0.7 }}>{subs[i]}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Remaining 5 as compact horizontal scroll chips */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2.5 pb-1" style={{ width: "max-content" }}>
            {[1, 3, 4, 5, 6].map(i => {
              const c = CARDS[i];
              const Icon = c.icon;
              return (
                <div key={c.label} className={`stat-card ${c.cls} shrink-0`}
                     style={{ padding: "0.75rem 1rem", minWidth: 130 }}>
                  <div className="relative z-10 flex items-center gap-2.5">
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${c.iconBg}`}>
                      <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-1">{c.label}</p>
                      <p className="text-sm font-bold ticker leading-none" style={{ color: c.color }}>{values[i]}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sidebar tray ───────────────────────────────────────────────────────────────
const SidebarTray = ({ open, onClose, activeTab, setActiveTab, triggeredAlerts, stocks, onSave, syncing, user }: {
  open: boolean; onClose: () => void;
  activeTab: string; setActiveTab: (v: string) => void;
  triggeredAlerts: number; stocks: PortfolioStock[];
  onSave: () => void; syncing: boolean; user: any;
}) => (
  <>
    <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
    <aside className={`sidebar-tray ${open ? "open" : ""}`}>
      <div className="absolute inset-x-0 top-0 h-[3px]"
           style={{ background: "linear-gradient(90deg, hsl(230,50%,22%), hsl(8,90%,46%), hsl(28,98%,54%), hsl(46,100%,56%))" }} />

      {/* Sidebar header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4"
           style={{ borderBottom: "1px solid hsl(18 50% 40% / 0.15)" }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
               style={{ background: "linear-gradient(135deg, hsl(230,50%,20%), hsl(8,90%,46%))", boxShadow: "0 4px 16px hsl(18,95%,52%,0.4)" }}>
            <Waves style={{ color: "white", width: 17, height: 17 }} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none text-white">Smart Stock</p>
            <p className="text-[10px] mt-0.5" style={{ color: "hsl(18,60%,65%)" }}>Portfolio Tracker</p>
          </div>
        </div>
        <button onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: "hsl(18 50% 40% / 0.15)", color: "hsl(18,60%,65%)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2" style={{ color: "hsl(18,40%,45%)" }}>Navigation</p>
        {NAV_TABS.map(({ value, label, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button key={value}
              onClick={() => { setActiveTab(value); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left relative"
              style={isActive ? {
                background: "linear-gradient(135deg, hsl(230,50%,25%), hsl(8,90%,46%), hsl(28,98%,54%))",
                color: "white",
                boxShadow: "0 4px 16px hsl(18,95%,52%,0.3)"
              } : { color: "hsl(18,50%,68%)" }}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {value === "alerts" && triggeredAlerts > 0 && (
                <span className="h-5 w-5 rounded-full bg-loss text-[10px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
              )}
              {!isActive && <ChevronRight className="h-3.5 w-3.5 opacity-30" />}
            </button>
          );
        })}
      </nav>

      {/* Sidebar footer actions */}
      <div className="px-4 py-4 space-y-2" style={{ borderTop: "1px solid hsl(18 50% 40% / 0.12)" }}>
        <button onClick={onSave} disabled={syncing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "linear-gradient(135deg, hsl(8,90%,46%), hsl(28,98%,54%))", color: "white", opacity: syncing ? 0.7 : 1 }}>
          <Save className="h-4 w-4" />
          {syncing ? "Saving…" : user ? "Save & Sync" : "Save Locally"}
        </button>
        <div className="flex gap-2">
          <div className="flex-1">
            <ExportPortfolio stocks={stocks} />
          </div>
        </div>
        <p className="text-[10px] text-center mt-1" style={{ color: "hsl(18,35%,45%)" }}>Portfolio & Trade Dashboard · ₹ INR</p>
      </div>
    </aside>
  </>
);

// ── Main ───────────────────────────────────────────────────────────────────────
const Index = () => {
  const { user }            = useAuth();
  const { load, save }      = usePortfolioSync(user?.id);
  const { toast }           = useToast();
  const { theme, setTheme } = useTheme();

  const local = loadFromLocal();
  const [stocks,      setStocks]      = useState<PortfolioStock[]>(() => local?.stocks    ?? initialData);
  const [trades,      setTrades]      = useState<TradeStrategy[]>(() => local?.trades    ?? initialTrades);
  const [watchlist,   setWatchlist]   = useState<WatchlistStock[]>(() => local?.watchlist ?? initialWatchlist);
  const [alerts,      setAlerts]      = useState<PriceAlert[]>(() => local?.alerts    ?? []);
  const [activeTab,   setActiveTab]   = useState("dashboard");
  const [syncing,     setSyncing]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadedUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (loadedUserRef.current === user?.id) return;
    loadedUserRef.current = user?.id;
    load().then(snapshot => {
      if (!snapshot) return;
      setStocks(snapshot.stocks); setTrades(snapshot.trades);
      setWatchlist(snapshot.watchlist); setAlerts(snapshot.alerts);
      if (user) toast({ title: "Portfolio synced ☁️", description: "Latest data loaded from cloud." });
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePortfolio = async () => {
    setSyncing(true);
    const err = await save({ stocks, trades, watchlist, alerts });
    setSyncing(false);
    if (err) toast({ title: "Save failed", description: err, variant: "destructive" });
    else toast({ title: user ? "Saved to cloud ☁️" : "Saved locally", description: user ? "Synced across all your devices." : "Sign in to sync across devices." });
  };

  const allTickers = [
    ...stocks.filter(s => s.status === "Active").map(s => s.ticker),
    ...trades.map(t => t.ticker),
    ...watchlist.map(w => w.stockName),
  ];

  const { prices, loading, lastUpdated, error, refresh } = useLivePrices(allTickers);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setStocks(prev => prev.map(s => { const l = prices[s.ticker]; if (!l || s.status !== "Active") return s; return { ...s, cmp: l.price, weekHigh52: l.weekHigh52 || s.weekHigh52, weekLow52: l.weekLow52 || s.weekLow52, dailyChange: l.change }; }));
    setTrades(prev => prev.map(t => { const l = prices[t.ticker]; return l ? { ...t, livePrice: l.price } : t; }));
    setWatchlist(prev => prev.map(w => { const l = prices[w.stockName]; return l ? { ...w, cmp: l.price } : w; }));
  }, [prices]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setAlerts(prev => prev.map(a => {
      if (a.triggered) return a;
      const l = prices[a.ticker]; if (!l) return a;
      const hit = (a.direction === "above" && l.price >= a.targetPrice) || (a.direction === "below" && l.price <= a.targetPrice);
      if (hit) toast({ title: `🔔 Alert: ${a.ticker}`, description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "SL hit" : "Entry zone"} at ₹${l.price.toFixed(2)}` });
      return hit ? { ...a, triggered: true } : a;
    }));
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" }); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStock        = (s: PortfolioStock)            => setStocks(p => [...p, s]);
  const handleImportStocks    = (imp: PortfolioStock[])        => setStocks(p => [...p, ...imp]);
  const handleEditStock       = (o: string, u: PortfolioStock) => { setStocks(p => p.map(s => s.ticker === o ? u : s)); toast({ title: "Transaction updated" }); };
  const handleDeleteStock     = (t: string)                    => { setStocks(p => p.filter(s => s.ticker !== t)); toast({ title: "Transaction deleted" }); };
  const handleEditTrade       = (o: string, u: TradeStrategy)  => { setTrades(p => p.map(t => t.ticker === o ? u : t)); toast({ title: "Trade updated" }); };
  const handleDeleteTrade     = (t: string)                    => { setTrades(p => p.filter(x => x.ticker !== t)); toast({ title: "Trade deleted" }); };
  const handleEditWatchlist   = (o: string, u: WatchlistStock) => { setWatchlist(p => p.map(w => w.stockName === o ? u : w)); toast({ title: "Watchlist updated" }); };
  const handleDeleteWatchlist = (n: string)                    => { setWatchlist(p => p.filter(w => w.stockName !== n)); toast({ title: "Removed from watchlist" }); };
  const handleUpdateNotes     = (t: string, n: TradeJournalEntry) => { setStocks(p => p.map(s => s.ticker === t ? { ...s, notes: n } : s)); toast({ title: "Journal updated" }); };
  const handleAddAlert        = (a: PriceAlert)                => setAlerts(p => [...p, a]);
  const handleDeleteAlert     = (id: string)                   => setAlerts(p => p.filter(a => a.id !== id));
  const handleDismissAlert    = (id: string)                   => setAlerts(p => p.filter(a => a.id !== id));

  const triggeredAlerts = alerts.filter(a => a.triggered).length;
  const formatTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

  const SUNSET_GRAD = "linear-gradient(135deg, hsl(230,50%,20%), hsl(8,90%,46%), hsl(38,100%,52%))";
  const BORDER_CLRS = { borderColor: "hsl(18,60%,50%,0.35)", color: "hsl(18,80%,40%)" };

  return (
    /* pb-20 on mobile to clear bottom nav */
    <div className="min-h-screen mesh-bg pb-20 sm:pb-0">

      <SidebarTray open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        activeTab={activeTab} setActiveTab={setActiveTab}
        triggeredAlerts={triggeredAlerts} stocks={stocks}
        onSave={handleSavePortfolio} syncing={syncing} user={user} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 relative" style={{
        backdropFilter: "blur(28px) saturate(200%) brightness(1.04)",
        WebkitBackdropFilter: "blur(28px) saturate(200%) brightness(1.04)",
        background: "hsl(0 0% 100% / 0.62)",
        borderBottom: "1px solid hsl(18 50% 45% / 0.20)",
        boxShadow: "0 2px 20px hsl(18 95% 52% / 0.08)"
      }}>
        <div className="absolute inset-x-0 top-0 h-[3px]"
             style={{ background: "linear-gradient(90deg, hsl(230,50%,18%), hsl(0,85%,36%), hsl(18,95%,52%), hsl(38,100%,52%), hsl(46,100%,56%))" }} />

        <div className="flex items-center justify-between h-14 sm:h-16 px-4">

          {/* Left */}
          <div className="flex items-center gap-2.5">
            <button onClick={() => setSidebarOpen(true)}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0"
              style={{ background: "hsl(18 50% 45% / 0.10)", border: "1px solid hsl(18 50% 45% / 0.22)", color: "hsl(18,60%,40%)" }}>
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center relative overflow-hidden shrink-0"
                   style={{ background: "linear-gradient(135deg, hsl(230,50%,20%), hsl(0,85%,36%))", boxShadow: "0 4px 16px hsl(18,95%,52%,0.40)" }}>
                <Waves className="h-4 w-4 text-white" style={{ width: 16, height: 16 }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)" }} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[13px] sm:text-[15px] font-bold leading-none truncate" style={{ color: "hsl(230,55%,12%)" }}>
                  Smart Stock Tracker
                </h1>
                <p className="text-[9px] sm:text-[10px] mt-0.5 tracking-wide hidden xs:block" style={{ color: "hsl(18,60%,50%)" }}>
                  Portfolio · ₹ INR
                </p>
              </div>
            </div>
          </div>

          {/* Right — desktop shows all, mobile shows only essentials */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Desktop only */}
            <div className="hidden sm:flex items-center gap-2">
              <ExportPortfolio stocks={stocks} />
              <Button variant="outline" size="sm" onClick={handleSavePortfolio} disabled={syncing}
                className="gap-1.5 text-xs h-8 rounded-xl font-semibold" style={BORDER_CLRS}>
                <Save className="h-3.5 w-3.5" />
                {syncing ? "Saving…" : user ? "Save & Sync" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}
                className="gap-1.5 text-xs h-8 rounded-xl" style={{ color: "hsl(18,60%,50%)" }}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>{loading ? "Fetching…" : "Refresh"}</span>
              </Button>
            </div>

            <AuthButton />

            {/* Mobile refresh icon only */}
            <button onClick={refresh} disabled={loading}
              className="sm:hidden h-8 w-8 rounded-xl flex items-center justify-center transition-all"
              style={{ background: "hsl(18 50% 45% / 0.10)", border: "1px solid hsl(18 50% 45% / 0.22)", color: "hsl(18,60%,40%)" }}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>

            {/* Theme toggle */}
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 rounded-xl flex items-center justify-center transition-all"
              style={{ background: "hsl(18 50% 45% / 0.10)", border: "1px solid hsl(18 50% 45% / 0.22)", color: "hsl(18,60%,40%)" }}>
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            {/* Live badge — desktop only */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                 style={{ background: "hsl(18 50% 40% / 0.08)", border: "1px solid hsl(18 50% 40% / 0.18)", fontSize: 11 }}>
              <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
              <span className="font-medium" style={{ color: "hsl(18,60%,46%)" }}>
                {lastUpdated ? formatTime(lastUpdated) : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile live status bar */}
        <div className="sm:hidden flex items-center justify-between px-4 pb-2 -mt-0.5">
          <div className="flex items-center gap-1.5" style={{ fontSize: 10 }}>
            <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
            <span style={{ color: "hsl(18,60%,46%)" }}>
              {loading ? "Fetching prices…" : lastUpdated ? `Updated ${formatTime(lastUpdated)}` : "Live prices"}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-screen-xl mx-auto">

        <StatsPanel stocks={stocks} />

        {/* Desktop horizontal tab bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden sm:block overflow-x-auto pb-2">
            <TabsList className="inline-flex w-auto min-w-full h-12 p-1.5 gap-1 rounded-2xl"
              style={{
                backdropFilter: "blur(20px) saturate(180%)",
                background: "hsl(0 0% 100% / 0.70)",
                border: "1px solid hsl(18 50% 45% / 0.15)",
                boxShadow: "0 2px 20px hsl(18 95% 52% / 0.06)"
              }}>
              {NAV_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}
                  className="relative flex items-center gap-1.5 rounded-xl px-3.5 h-full font-medium transition-all duration-200 whitespace-nowrap text-xs border-0 outline-none"
                  style={activeTab === value ? {
                    background: SUNSET_GRAD,
                    color: "white",
                    boxShadow: "0 4px 14px hsl(18,95%,52%,0.35)",
                  } : {
                    color: "hsl(18,50%,52%)",
                    background: "transparent",
                  }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                  {value === "alerts" && triggeredAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab contents */}
          <TabsContent value="dashboard"  className="mt-4 sm:mt-5 space-y-4 sm:space-y-5 animate-fade-up"><PortfolioCharts stocks={stocks} /><TradeAnalytics stocks={stocks} /><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="portfolio"  className="mt-4 sm:mt-5 animate-fade-up"><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="trades"     className="mt-4 sm:mt-5 animate-fade-up"><TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} /></TabsContent>
          <TabsContent value="history"    className="mt-4 sm:mt-5 animate-fade-up"><TradeHistory stocks={stocks} /></TabsContent>
          <TabsContent value="watchlist"  className="mt-4 sm:mt-5 animate-fade-up"><WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} /></TabsContent>
          <TabsContent value="analytics"  className="mt-4 sm:mt-5 space-y-4 sm:space-y-5 animate-fade-up"><TradeAnalytics stocks={stocks} /><SectorDiversification stocks={stocks} /><PortfolioCharts stocks={stocks} /></TabsContent>
          <TabsContent value="journal"    className="mt-4 sm:mt-5 animate-fade-up"><TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} /></TabsContent>
          <TabsContent value="alerts"     className="mt-4 sm:mt-5 animate-fade-up"><PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} /></TabsContent>
          <TabsContent value="risk"       className="mt-4 sm:mt-5 animate-fade-up"><RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} /></TabsContent>
          <TabsContent value="ai"         className="mt-4 sm:mt-5 animate-fade-up"><AIInsights stocks={stocks} trades={trades} /></TabsContent>
        </Tabs>
      </main>

      {/* ── Mobile bottom nav bar ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50"
           style={{
             backdropFilter: "blur(24px) saturate(200%)",
             WebkitBackdropFilter: "blur(24px) saturate(200%)",
             background: "hsl(0 0% 100% / 0.88)",
             borderTop: "1px solid hsl(18 50% 45% / 0.22)",
             boxShadow: "0 -4px 24px hsl(18 95% 52% / 0.10)",
             paddingBottom: "env(safe-area-inset-bottom, 0px)"
           }}>
        <div className="flex items-center justify-around px-2 h-16">
          {BOTTOM_NAV.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button key={value} onClick={() => setActiveTab(value)}
                className="flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-200 relative"
                style={{ color: isActive ? "hsl(18,95%,48%)" : "hsl(20,15%,55%)" }}>
                {isActive && (
                  <div className="absolute inset-x-2 top-0 h-[2px] rounded-full"
                       style={{ background: SUNSET_GRAD }} />
                )}
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all ${isActive ? "scale-110" : ""}`}
                     style={isActive ? { background: "hsl(18 95% 52% / 0.12)" } : {}}>
                  <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </div>
                <span className="text-[10px] font-semibold leading-none">{label}</span>
                {value === "alerts" && triggeredAlerts > 0 && (
                  <span className="absolute top-1 right-3 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">
                    {triggeredAlerts}
                  </span>
                )}
              </button>
            );
          })}
          {/* More button opens sidebar */}
          <button onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-2"
            style={{ color: "hsl(20,15%,55%)" }}>
            <div className="h-8 w-8 rounded-xl flex items-center justify-center">
              <Menu style={{ width: 18, height: 18 }} />
            </div>
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Index;