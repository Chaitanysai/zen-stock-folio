import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Crosshair, Eye, LayoutDashboard, Shield,
  RefreshCw, History, BookOpen, Bell, Brain, PieChart,
  Save, Menu, X, IndianRupee, Briefcase, TrendingUp,
  TrendingDown, Target, Activity, Percent, Sun, Moon
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

const CARD_COLORS = [
  { accent: "hsl(75,80%,42%)",  bg: "hsl(75,80%,42%,0.1)",  cls: "stat-card-1" },
  { accent: "hsl(38,95%,55%)",  bg: "hsl(38,95%,55%,0.1)",  cls: "stat-card-2" },
  { accent: "hsl(142,60%,36%)", bg: "hsl(142,60%,36%,0.1)", cls: "stat-card-3" },
  { accent: "hsl(200,70%,45%)", bg: "hsl(200,70%,45%,0.1)", cls: "stat-card-4" },
  { accent: "hsl(280,60%,55%)", bg: "hsl(280,60%,55%,0.1)", cls: "stat-card-5" },
  { accent: "hsl(0,70%,52%)",   bg: "hsl(0,70%,52%,0.1)",   cls: "stat-card-6" },
  { accent: "hsl(55,90%,52%)",  bg: "hsl(55,90%,52%,0.1)",  cls: "stat-card-7" },
];

// ── Inline colorful stat cards ───────────────────────────────────────────────
const StatsPanel = ({ stocks }: { stocks: PortfolioStock[] }) => {
  const totalInvested     = stocks.reduce((s, x) => s + calcInvestedValue(x), 0);
  const totalCurrentValue = stocks.reduce((s, x) => s + calcFinalValue(x), 0);
  const totalPL           = stocks.reduce((s, x) => s + calcProfitLoss(x), 0);
  const profitPct         = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const activePositions   = stocks.filter(s => s.status === "Active").length;
  const soldPositions     = stocks.filter(s => s.status !== "Active").length;
  const analytics         = getTradeAnalytics(stocks);
  const isProfit          = totalPL >= 0;

  const stats = [
    { label: "Total Invested",  value: `₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: IndianRupee },
    { label: "Current Value",   value: `₹${totalCurrentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: Briefcase },
    { label: "Total P&L",       value: `${isProfit ? "+" : ""}₹${totalPL.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}%`, icon: isProfit ? TrendingUp : TrendingDown },
    { label: "Win Rate",        value: `${analytics.winRate.toFixed(1)}%`, icon: Target },
    { label: "Open Positions",  value: activePositions.toString(), icon: Activity },
    { label: "Closed Trades",   value: soldPositions.toString(), icon: BarChart3 },
    { label: "Risk/Reward",     value: analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A", icon: Percent },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 stagger">
      {stats.map((stat, i) => {
        const col = CARD_COLORS[i];
        const Icon = stat.icon;
        return (
          <div key={stat.label} className={`stat-card ${col.cls} animate-fade-up`}>
            <div className="card-bg" style={{ background: col.accent }} />
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-3">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center"
                     style={{ background: col.accent + "22" }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: col.accent }} />
                </div>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                {stat.label}
              </p>
              <p className="text-lg font-bold ticker leading-none" style={{ color: col.accent }}>
                {stat.value}
              </p>
              {"sub" in stat && stat.sub && (
                <p className="text-xs ticker mt-0.5" style={{ color: col.accent, opacity: 0.75 }}>
                  {stat.sub}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Sidebar nav tray ─────────────────────────────────────────────────────────
const SidebarTray = ({
  open, onClose, activeTab, setActiveTab, triggeredAlerts
}: {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
  triggeredAlerts: number;
}) => {
  return (
    <>
      {/* Overlay */}
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />

      {/* Tray */}
      <aside className={`sidebar-tray ${open ? "open" : ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <BarChart3 className="h-4 w-4 text-white" style={{ color: "hsl(40,25%,8%)" }} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none" style={{ fontFamily: "'Outfit',sans-serif" }}>
                Smart Stock
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Tracker</p>
            </div>
          </div>
          <button onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV_TABS.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button
                key={value}
                onClick={() => { setActiveTab(value); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left relative"
                style={isActive ? {
                  background: "linear-gradient(135deg, hsl(var(--gradient-start)), hsl(var(--gradient-end)))",
                  color: "hsl(40,25%,8%)",
                  boxShadow: "0 4px 16px hsl(var(--primary) / 0.3)"
                } : {
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
                {value === "alerts" && triggeredAlerts > 0 && (
                  <span className="ml-auto h-5 w-5 rounded-full bg-loss text-[10px] font-bold flex items-center justify-center text-white">
                    {triggeredAlerts}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer texture strip */}
        <div className="px-4 py-4 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground text-center tracking-wide">
            Portfolio & Trade Dashboard · ₹ INR
          </p>
        </div>
      </aside>
    </>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const Index = () => {
  const { user }     = useAuth();
  const { load, save } = usePortfolioSync(user?.id);
  const { toast }    = useToast();
  const { theme, setTheme } = useTheme();

  const local = loadFromLocal();
  const [stocks,    setStocks]    = useState<PortfolioStock[]>(() => local?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(() => local?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(() => local?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(() => local?.alerts    ?? []);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [syncing,   setSyncing]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadedUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (loadedUserRef.current === user?.id) return;
    loadedUserRef.current = user?.id;
    load().then(snapshot => {
      if (!snapshot) return;
      setStocks(snapshot.stocks);
      setTrades(snapshot.trades);
      setWatchlist(snapshot.watchlist);
      setAlerts(snapshot.alerts);
      if (user) toast({ title: "Portfolio synced ☁️", description: "Latest data loaded from cloud." });
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePortfolio = async () => {
    setSyncing(true);
    const err = await save({ stocks, trades, watchlist, alerts });
    setSyncing(false);
    if (err) {
      toast({ title: "Save failed", description: err, variant: "destructive" });
    } else {
      toast({
        title: user ? "Saved to cloud ☁️" : "Saved locally",
        description: user ? "Synced across all your devices." : "Sign in to sync across devices.",
      });
    }
  };

  const allTickers = [
    ...stocks.filter(s => s.status === "Active").map(s => s.ticker),
    ...trades.map(t => t.ticker),
    ...watchlist.map(w => w.stockName),
  ];

  const { prices, loading, lastUpdated, error, refresh } = useLivePrices(allTickers);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setStocks(prev => prev.map(s => {
      const live = prices[s.ticker];
      if (!live || s.status !== "Active") return s;
      return { ...s, cmp: live.price, weekHigh52: live.weekHigh52 || s.weekHigh52, weekLow52: live.weekLow52 || s.weekLow52, dailyChange: live.change };
    }));
    setTrades(prev => prev.map(t => { const live = prices[t.ticker]; return live ? { ...t, livePrice: live.price } : t; }));
    setWatchlist(prev => prev.map(w => { const live = prices[w.stockName]; return live ? { ...w, cmp: live.price } : w; }));
  }, [prices]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setAlerts(prev => prev.map(a => {
      if (a.triggered) return a;
      const live = prices[a.ticker];
      if (!live) return a;
      const triggered = (a.direction === "above" && live.price >= a.targetPrice) || (a.direction === "below" && live.price <= a.targetPrice);
      if (triggered) toast({ title: `🔔 Alert: ${a.ticker}`, description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "Stop loss hit" : "Entry zone"} at ₹${live.price.toFixed(2)}` });
      return triggered ? { ...a, triggered: true } : a;
    }));
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStock       = (stock: PortfolioStock)           => setStocks(prev => [...prev, stock]);
  const handleImportStocks   = (imported: PortfolioStock[])      => setStocks(prev => [...prev, ...imported]);
  const handleEditStock      = (orig: string, u: PortfolioStock) => { setStocks(prev => prev.map(s => s.ticker === orig ? u : s)); toast({ title: "Transaction updated" }); };
  const handleDeleteStock    = (ticker: string)                  => { setStocks(prev => prev.filter(s => s.ticker !== ticker)); toast({ title: "Transaction deleted" }); };
  const handleEditTrade      = (orig: string, u: TradeStrategy)  => { setTrades(prev => prev.map(t => t.ticker === orig ? u : t)); toast({ title: "Trade updated" }); };
  const handleDeleteTrade    = (ticker: string)                  => { setTrades(prev => prev.filter(t => t.ticker !== ticker)); toast({ title: "Trade deleted" }); };
  const handleEditWatchlist  = (orig: string, u: WatchlistStock) => { setWatchlist(prev => prev.map(w => w.stockName === orig ? u : w)); toast({ title: "Watchlist updated" }); };
  const handleDeleteWatchlist= (name: string)                    => { setWatchlist(prev => prev.filter(w => w.stockName !== name)); toast({ title: "Removed from watchlist" }); };
  const handleUpdateNotes    = (ticker: string, notes: TradeJournalEntry) => { setStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, notes } : s)); toast({ title: "Journal updated" }); };
  const handleAddAlert       = (alert: PriceAlert)               => setAlerts(prev => [...prev, alert]);
  const handleDeleteAlert    = (id: string)                      => setAlerts(prev => prev.filter(a => a.id !== id));
  const handleDismissAlert   = (id: string)                      => setAlerts(prev => prev.filter(a => a.id !== id));

  const triggeredAlerts = alerts.filter(a => a.triggered).length;

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  const currentTab = NAV_TABS.find(t => t.value === activeTab);

  return (
    <div className="min-h-screen mesh-bg">

      {/* ── Sidebar tray ── */}
      <SidebarTray
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        triggeredAlerts={triggeredAlerts}
      />

      {/* ── Header ── */}
      <header className="sticky top-0 z-50"
        style={{
          background: "hsl(var(--card) / 0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid hsl(var(--border) / 0.7)",
          boxShadow: "0 1px 0 hsl(var(--primary) / 0.08), 0 2px 16px hsl(0 0% 0% / 0.04)"
        }}>
        {/* Top lime gradient line */}
        <div className="absolute inset-x-0 top-0 h-[2.5px] gradient-primary" />

        <div className="container flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all hover:bg-muted"
              style={{ border: "1px solid hsl(var(--border) / 0.7)" }}
            >
              <Menu className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-lg"
                   style={{ boxShadow: "0 4px 14px hsl(var(--primary) / 0.4)" }}>
                <BarChart3 className="h-4 w-4" style={{ color: "hsl(40,25%,8%)", width: 17, height: 17 }} />
              </div>
              <div>
                <h1 className="text-[15px] font-bold leading-none" style={{ fontFamily: "'Outfit',sans-serif" }}>
                  Smart Stock Tracker
                </h1>
                <p className="text-[10px] text-muted-foreground mt-0.5 tracking-wide">
                  Portfolio & Trade Dashboard · ₹ INR
                </p>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Current tab label */}
            {currentTab && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                   style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                <currentTab.icon className="h-3.5 w-3.5" />
                {currentTab.label}
              </div>
            )}

            <ExportPortfolio stocks={stocks} />

            <Button variant="outline" size="sm" onClick={handleSavePortfolio} disabled={syncing}
              className="gap-1.5 text-xs h-8 rounded-xl font-semibold transition-all"
              style={{ borderColor: "hsl(var(--primary) / 0.4)" }}>
              <Save className="h-3.5 w-3.5" />
              {syncing ? "Saving…" : user ? "Save & Sync" : "Save"}
            </Button>

            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}
              className="gap-1.5 text-xs h-8 rounded-xl text-muted-foreground hover:text-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Fetching…" : "Refresh"}</span>
            </Button>

            <AuthButton />

            {/* Theme toggle */}
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 rounded-xl flex items-center justify-center transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
              style={{ border: "1px solid hsl(var(--border) / 0.7)" }}>
              {theme === "dark"
                ? <Sun className="h-3.5 w-3.5" />
                : <Moon className="h-3.5 w-3.5" />}
            </button>

            {/* Live badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                 style={{ background: "hsl(var(--muted) / 0.7)", fontSize: 11, border: "1px solid hsl(var(--border) / 0.5)" }}>
              <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
              <span className="text-muted-foreground font-medium">
                {lastUpdated ? formatTime(lastUpdated) : "Live"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="container px-4 md:px-6 py-6 space-y-6">

        {/* Colorful stat cards */}
        <StatsPanel stocks={stocks} />

        {/* Tab content — no visible tab bar, nav is in sidebar */}
        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>

          {/* Minimal inline pill tabs for quick switching on desktop */}
          <div className="overflow-x-auto pb-2 -mx-1 px-1 mb-5">
            <div className="inline-flex gap-1 p-1 rounded-2xl"
                 style={{
                   background: "hsl(var(--card) / 0.8)",
                   border: "1px solid hsl(var(--border) / 0.6)",
                   backdropFilter: "blur(12px)"
                 }}>
              {NAV_TABS.map(({ value, label, icon: Icon }) => {
                const isActive = activeTab === value;
                return (
                  <button key={value} onClick={() => setActiveTab(value)}
                    className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap"
                    style={isActive ? {
                      background: "linear-gradient(135deg, hsl(var(--gradient-start)), hsl(var(--gradient-end)))",
                      color: "hsl(40,25%,8%)",
                      boxShadow: "0 4px 14px hsl(var(--primary) / 0.3)"
                    } : { color: "hsl(var(--muted-foreground))" }}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                    {value === "alerts" && triggeredAlerts > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">
                        {triggeredAlerts}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab panels */}
          {activeTab === "dashboard"  && <div className="space-y-5 animate-fade-up"><PortfolioCharts stocks={stocks} /><TradeAnalytics stocks={stocks} /><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></div>}
          {activeTab === "portfolio"  && <div className="animate-fade-up"><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></div>}
          {activeTab === "trades"     && <div className="animate-fade-up"><TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} /></div>}
          {activeTab === "history"    && <div className="animate-fade-up"><TradeHistory stocks={stocks} /></div>}
          {activeTab === "watchlist"  && <div className="animate-fade-up"><WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} /></div>}
          {activeTab === "analytics"  && <div className="space-y-5 animate-fade-up"><TradeAnalytics stocks={stocks} /><SectorDiversification stocks={stocks} /><PortfolioCharts stocks={stocks} /></div>}
          {activeTab === "journal"    && <div className="animate-fade-up"><TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} /></div>}
          {activeTab === "alerts"     && <div className="animate-fade-up"><PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} /></div>}
          {activeTab === "risk"       && <div className="animate-fade-up"><RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} /></div>}
          {activeTab === "ai"         && <div className="animate-fade-up"><AIInsights stocks={stocks} trades={trades} /></div>}
        </div>
      </main>
    </div>
  );
};

export default Index;