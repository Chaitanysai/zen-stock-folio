import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Crosshair, Eye, LayoutDashboard, Shield,
  RefreshCw, History, BookOpen, Bell, Brain, PieChart,
  Save, Menu, X, IndianRupee, Briefcase, TrendingUp,
  TrendingDown, Target, Activity, Percent, Sun, Moon, Waves
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

// Ocean palette — all 7 swatches
const CARDS = [
  { cls: "stat-card-1", iconBg: "card-icon-bg-1", color: "hsl(230,50%,32%)",  icon: IndianRupee },
  { cls: "stat-card-2", iconBg: "card-icon-bg-2", color: "hsl(0,72%,35%)",    icon: Briefcase },
  { cls: "stat-card-3", iconBg: "card-icon-bg-3", color: "hsl(0,85%,42%)",    icon: TrendingUp },
  { cls: "stat-card-4", iconBg: "card-icon-bg-4", color: "hsl(8,90%,48%)",    icon: Target },
  { cls: "stat-card-5", iconBg: "card-icon-bg-5", color: "hsl(18,95%,52%)",   icon: Activity },
  { cls: "stat-card-6", iconBg: "card-icon-bg-6", color: "hsl(28,98%,50%)",   icon: BarChart3 },
  { cls: "stat-card-7", iconBg: "card-icon-bg-7", color: "hsl(38,100%,46%)",  icon: Percent },
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

// ── Stat cards ────────────────────────────────────────────────────────────────
const StatsPanel = ({ stocks }: { stocks: PortfolioStock[] }) => {
  const totalInvested     = stocks.reduce((s, x) => s + calcInvestedValue(x), 0);
  const totalCurrentValue = stocks.reduce((s, x) => s + calcFinalValue(x), 0);
  const totalPL           = stocks.reduce((s, x) => s + calcProfitLoss(x), 0);
  const profitPct         = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const analytics         = getTradeAnalytics(stocks);
  const isProfit          = totalPL >= 0;

  const stats = [
    { label: "Total Invested",  value: `₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "Current Value",   value: `₹${totalCurrentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "Total P&L",       value: `${isProfit ? "+" : ""}₹${totalPL.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, sub: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}%` },
    { label: "Win Rate",        value: `${analytics.winRate.toFixed(1)}%` },
    { label: "Open Positions",  value: stocks.filter(s => s.status === "Active").length.toString() },
    { label: "Closed Trades",   value: stocks.filter(s => s.status !== "Active").length.toString() },
    { label: "Risk/Reward",     value: analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 stagger">
      {stats.map((stat, i) => {
        const c = CARDS[i];
        const Icon = c.icon;
        return (
          <div key={stat.label} className={`stat-card ${c.cls} animate-fade-up`}>
            <div className="relative z-10">
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center mb-3 ${c.iconBg}`}>
                <Icon className="h-4 w-4" style={{ color: c.color }} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                {stat.label}
              </p>
              <p className="text-xl font-bold ticker leading-none" style={{ color: c.color }}>
                {stat.value}
              </p>
              {"sub" in stat && stat.sub && (
                <p className="text-xs ticker mt-1 font-medium" style={{ color: c.color, opacity: 0.7 }}>
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

// ── Sidebar tray ──────────────────────────────────────────────────────────────
const SidebarTray = ({
  open, onClose, activeTab, setActiveTab, triggeredAlerts
}: {
  open: boolean; onClose: () => void;
  activeTab: string; setActiveTab: (v: string) => void;
  triggeredAlerts: number;
}) => (
  <>
    <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
    <aside className={`sidebar-tray ${open ? "open" : ""}`}>

      {/* Decorative ocean gradient top strip */}
      <div className="absolute inset-x-0 top-0 h-[3px]"
           style={{ background: "linear-gradient(90deg, hsl(230,50%,22%), hsl(8,90%,46%), hsl(28,98%,54%), hsl(46,100%,56%))" }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4"
           style={{ borderBottom: "1px solid hsl(18 50% 40% / 0.15)" }}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center"
               style={{
                 background: "linear-gradient(135deg, hsl(8,90%,46%), hsl(18,95%,52%))",
                 boxShadow: "0 4px 16px hsl(18,95%,52%,0.4)"
               }}>
            <Waves className="h-4 w-4" style={{ color: "hsl(230,55%,6%)", width: 17, height: 17 }} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none text-white">Smart Stock</p>
            <p className="text-[10px] mt-0.5" style={{ color: "hsl(18,60%,65%)" }}>Portfolio Tracker</p>
          </div>
        </div>
        <button onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: "hsl(18 50% 40% / 0.12)", color: "hsl(18,60%,65%)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2"
           style={{ color: "hsl(18,40%,50%)" }}>Navigation</p>
        {NAV_TABS.map(({ value, label, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button key={value}
              onClick={() => { setActiveTab(value); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left relative"
              style={isActive ? {
                background: "linear-gradient(135deg, hsl(8,90%,46%), hsl(18,95%,52%))",
                color: "hsl(230,55%,5%)",
                boxShadow: "0 4px 16px hsl(18,95%,52%,0.35)"
              } : {
                color: "hsl(20,50%,72%)",
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "hsl(200 55% 50% / 0.12)"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
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

      {/* Footer */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid hsl(18 50% 40% / 0.12)" }}>
        <p className="text-[10px] text-center" style={{ color: "hsl(18,60%,52%)" }}>
          Portfolio & Trade Dashboard · ₹ INR
        </p>
      </div>
    </aside>
  </>
);

// ── Main ──────────────────────────────────────────────────────────────────────
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
      if (hit) toast({ title: `🔔 Alert: ${a.ticker}`, description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "Stop loss hit" : "Entry zone"} at ₹${l.price.toFixed(2)}` });
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

  return (
    <div className="min-h-screen mesh-bg">

      <SidebarTray open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        activeTab={activeTab} setActiveTab={setActiveTab} triggeredAlerts={triggeredAlerts} />

      {/* ── Header — frosted ocean glass ── */}
      <header className="sticky top-0 z-50 relative" style={{
        backdropFilter: "blur(28px) saturate(200%) brightness(1.04)",
        WebkitBackdropFilter: "blur(28px) saturate(200%) brightness(1.04)",
        background: "hsl(0 0% 100% / 0.62)",
        borderBottom: "1px solid hsl(18 50% 45% / 0.20)",
        boxShadow: "0 2px 20px hsl(18 95% 52% / 0.08), inset 0 -1px 0 hsl(18 50% 45% / 0.12)"
      }}>
        {/* Ocean gradient top line */}
        <div className="absolute inset-x-0 top-0 h-[3px]"
             style={{ background: "linear-gradient(90deg, hsl(230,50%,18%), hsl(0,85%,36%), hsl(18,95%,52%), hsl(38,100%,52%), hsl(46,100%,56%))" }} />

        <div className="container flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)}
              className="h-9 w-9 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: "hsl(200 60% 50% / 0.10)",
                border: "1px solid hsl(200 60% 50% / 0.22)",
                color: "hsl(18,60%,40%)"
              }}>
              <Menu className="h-4 w-4" />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center relative overflow-hidden"
                   style={{
                     background: "linear-gradient(135deg, hsl(230,50%,20%), hsl(0,85%,36%))",
                     boxShadow: "0 4px 16px hsl(18,95%,52%,0.40)"
                   }}>
                <Waves className="h-4 w-4 text-white" style={{ width: 17, height: 17 }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)" }} />
              </div>
              <div>
                <h1 className="text-[15px] font-bold leading-none" style={{ color: "hsl(230,55%,12%)" }}>
                  Smart Stock Tracker
                </h1>
                <p className="text-[10px] mt-0.5 tracking-wide" style={{ color: "hsl(18,60%,50%)" }}>
                  Portfolio & Trade Dashboard · ₹ INR
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ExportPortfolio stocks={stocks} />

            <Button variant="outline" size="sm" onClick={handleSavePortfolio} disabled={syncing}
              className="gap-1.5 text-xs h-8 rounded-xl font-semibold"
              style={{ borderColor: "hsl(18,60%,50%,0.35)", color: "hsl(18,80%,40%)" }}>
              <Save className="h-3.5 w-3.5" />
              {syncing ? "Saving…" : user ? "Save & Sync" : "Save"}
            </Button>

            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}
              className="gap-1.5 text-xs h-8 rounded-xl"
              style={{ color: "hsl(18,60%,50%)" }}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Fetching…" : "Refresh"}</span>
            </Button>

            <AuthButton />

            {/* Theme toggle */}
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: "hsl(200 60% 50% / 0.10)",
                border: "1px solid hsl(200 60% 50% / 0.22)",
                color: "hsl(18,60%,40%)"
              }}>
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>

            {/* Live badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                 style={{
                   background: "hsl(18 50% 40% / 0.08)",
                   border: "1px solid hsl(18 50% 40% / 0.18)",
                   fontSize: 11
                 }}>
              <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
              <span className="font-medium" style={{ color: "hsl(18,60%,46%)" }}>
                {lastUpdated ? formatTime(lastUpdated) : "Live"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="container px-4 md:px-6 py-6 space-y-5">

        {/* Stat cards */}
        <StatsPanel stocks={stocks} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full animate-fade-up" style={{ animationDelay: "80ms" }}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="inline-flex w-auto min-w-full h-11 p-1 gap-0.5 rounded-2xl"
              style={{
                backdropFilter: "blur(20px) saturate(180%)",
                background: "hsl(0 0% 100% / 0.55)",
                border: "1px solid hsl(18 50% 45% / 0.25)",
                boxShadow: "0 2px 16px hsl(18 95% 52% / 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.70)"
              }}>
              {NAV_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}
                  className="relative text-xs gap-1.5 rounded-xl px-3 font-medium transition-all duration-200 whitespace-nowrap"
                  style={activeTab === value ? {
                    background: "linear-gradient(135deg, hsl(230,50%,20%), hsl(8,90%,46%), hsl(38,100%,52%))",
                    color: "white",
                    boxShadow: "0 4px 16px hsl(18,95%,52%,0.40)"
                  } : { color: "hsl(18,60%,52%)" }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {value === "alerts" && triggeredAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">
                      {triggeredAlerts}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard"  className="mt-5 space-y-5 animate-fade-up"><PortfolioCharts stocks={stocks} /><TradeAnalytics stocks={stocks} /><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="portfolio"  className="mt-5 animate-fade-up"><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="trades"     className="mt-5 animate-fade-up"><TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} /></TabsContent>
          <TabsContent value="history"    className="mt-5 animate-fade-up"><TradeHistory stocks={stocks} /></TabsContent>
          <TabsContent value="watchlist"  className="mt-5 animate-fade-up"><WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} /></TabsContent>
          <TabsContent value="analytics"  className="mt-5 space-y-5 animate-fade-up"><TradeAnalytics stocks={stocks} /><SectorDiversification stocks={stocks} /><PortfolioCharts stocks={stocks} /></TabsContent>
          <TabsContent value="journal"    className="mt-5 animate-fade-up"><TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} /></TabsContent>
          <TabsContent value="alerts"     className="mt-5 animate-fade-up"><PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} /></TabsContent>
          <TabsContent value="risk"       className="mt-5 animate-fade-up"><RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} /></TabsContent>
          <TabsContent value="ai"         className="mt-5 animate-fade-up"><AIInsights stocks={stocks} trades={trades} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;