import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Crosshair, Eye, LayoutDashboard, Shield,
  RefreshCw, History, BookOpen, Bell, Brain, PieChart, Save
} from "lucide-react";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry
} from "@/data/sampleData";
import DashboardStats from "@/components/DashboardStats";
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
import ThemeToggle from "@/components/ThemeToggle";

const tabs = [
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

const Index = () => {
  const { user } = useAuth();
  const { load, save } = usePortfolioSync(user?.id);
  const { toast } = useToast();

  const local = loadFromLocal();
  const [stocks,    setStocks]    = useState<PortfolioStock[]>(() => local?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(() => local?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(() => local?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(() => local?.alerts    ?? []);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [syncing,   setSyncing]   = useState(false);
  const [mounted,   setMounted]   = useState(false);

  const loadedUserRef = useRef<string | undefined>(undefined);

  useEffect(() => { setMounted(true); }, []);

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
    setTrades(prev => prev.map(t => {
      const live = prices[t.ticker];
      return live ? { ...t, livePrice: live.price } : t;
    }));
    setWatchlist(prev => prev.map(w => {
      const live = prices[w.stockName];
      return live ? { ...w, cmp: live.price } : w;
    }));
  }, [prices]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setAlerts(prev => prev.map(a => {
      if (a.triggered) return a;
      const live = prices[a.ticker];
      if (!live) return a;
      const triggered =
        (a.direction === "above" && live.price >= a.targetPrice) ||
        (a.direction === "below" && live.price <= a.targetPrice);
      if (triggered) toast({
        title: `🔔 Alert: ${a.ticker}`,
        description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "Stop loss hit" : "Entry zone"} at ₹${live.price.toFixed(2)}`,
      });
      return triggered ? { ...a, triggered: true } : a;
    }));
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStock      = (stock: PortfolioStock)                        => setStocks(prev => [...prev, stock]);
  const handleImportStocks  = (imported: PortfolioStock[])                   => setStocks(prev => [...prev, ...imported]);
  const handleEditStock     = (orig: string, updated: PortfolioStock)        => { setStocks(prev => prev.map(s => s.ticker === orig ? updated : s)); toast({ title: "Transaction updated" }); };
  const handleDeleteStock   = (ticker: string)                               => { setStocks(prev => prev.filter(s => s.ticker !== ticker)); toast({ title: "Transaction deleted" }); };
  const handleEditTrade     = (orig: string, updated: TradeStrategy)         => { setTrades(prev => prev.map(t => t.ticker === orig ? updated : t)); toast({ title: "Trade updated" }); };
  const handleDeleteTrade   = (ticker: string)                               => { setTrades(prev => prev.filter(t => t.ticker !== ticker)); toast({ title: "Trade deleted" }); };
  const handleEditWatchlist = (orig: string, updated: WatchlistStock)        => { setWatchlist(prev => prev.map(w => w.stockName === orig ? updated : w)); toast({ title: "Watchlist updated" }); };
  const handleDeleteWatchlist = (name: string)                               => { setWatchlist(prev => prev.filter(w => w.stockName !== name)); toast({ title: "Removed from watchlist" }); };
  const handleUpdateNotes   = (ticker: string, notes: TradeJournalEntry)     => { setStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, notes } : s)); toast({ title: "Journal updated" }); };
  const handleAddAlert      = (alert: PriceAlert)                            => setAlerts(prev => [...prev, alert]);
  const handleDeleteAlert   = (id: string)                                   => setAlerts(prev => prev.filter(a => a.id !== id));
  const handleDismissAlert  = (id: string)                                   => setAlerts(prev => prev.filter(a => a.id !== id));

  const triggeredAlerts = alerts.filter(a => a.triggered).length;

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={`min-h-screen mesh-bg transition-colors duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}
         style={{ transition: "opacity 0.4s ease" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 noise-overlay" style={{
        background: "hsl(var(--card) / 0.7)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderBottom: "1px solid hsl(var(--border) / 0.6)",
        boxShadow: "0 1px 0 hsl(var(--primary) / 0.06), 0 4px 24px hsl(0 0% 0% / 0.04)"
      }}>
        {/* Top gradient line */}
        <div className="absolute inset-x-0 top-0 h-[2px] gradient-primary opacity-80" />

        <div className="container flex items-center justify-between h-16 px-4 md:px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-lg"
                 style={{ boxShadow: "0 4px 16px hsl(var(--primary) / 0.4)" }}>
              <BarChart3 className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
              <div className="absolute inset-0 rounded-xl"
                   style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)" }} />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight gradient-text leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}>
                Smart Stock Tracker
              </h1>
              <p className="text-[10px] text-muted-foreground mt-0.5 tracking-wide">
                Portfolio & Trade Dashboard · ₹ INR
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ExportPortfolio stocks={stocks} />

            <Button
              variant="outline"
              size="sm"
              onClick={handleSavePortfolio}
              disabled={syncing}
              className="gap-1.5 text-xs h-8 rounded-xl border-border/60 hover:border-primary/40 transition-all"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <Save className="h-3.5 w-3.5" />
              {syncing ? "Saving…" : user ? "Save & Sync" : "Save"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="gap-1.5 text-xs h-8 rounded-xl text-muted-foreground hover:text-primary transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Fetching…" : "Refresh"}</span>
            </Button>

            <AuthButton />
            <ThemeToggle />

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                 style={{ background: "hsl(var(--muted) / 0.6)", fontSize: 11 }}>
              <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
              <span className="text-muted-foreground font-medium">
                {lastUpdated ? `${formatTime(lastUpdated)}` : "Live"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="container px-4 md:px-6 py-6 space-y-6">

        {/* Stats row */}
        <div className="animate-fade-up stagger">
          <DashboardStats stocks={stocks} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full animate-fade-up" style={{ animationDelay: "80ms" }}>

          {/* Tab bar */}
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <TabsList
              className="inline-flex w-auto min-w-full h-12 p-1 gap-0.5 rounded-2xl"
              style={{
                background: "hsl(var(--card) / 0.7)",
                backdropFilter: "blur(16px)",
                border: "1px solid hsl(var(--border) / 0.6)",
                boxShadow: "0 2px 12px hsl(0 0% 0% / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.06)"
              }}
            >
              {tabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="relative text-xs gap-1.5 rounded-xl px-3 h-9 transition-all duration-200 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
                  style={activeTab === value ? {
                    background: "linear-gradient(135deg, hsl(var(--gradient-start)), hsl(var(--gradient-mid)), hsl(var(--gradient-end)))",
                    boxShadow: "0 4px 16px hsl(var(--primary) / 0.35)"
                  } : {}}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {value === "alerts" && triggeredAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white shadow-sm">
                      {triggeredAlerts}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Content */}
          <div className="mt-5">
            <TabsContent value="dashboard" className="space-y-5 animate-fade-up">
              <PortfolioCharts stocks={stocks} />
              <TradeAnalytics stocks={stocks} />
              <PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} />
            </TabsContent>

            <TabsContent value="portfolio" className="space-y-5 animate-fade-up">
              <PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} />
            </TabsContent>

            <TabsContent value="trades" className="animate-fade-up">
              <TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} />
            </TabsContent>

            <TabsContent value="history" className="animate-fade-up">
              <TradeHistory stocks={stocks} />
            </TabsContent>

            <TabsContent value="watchlist" className="animate-fade-up">
              <WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-5 animate-fade-up">
              <TradeAnalytics stocks={stocks} />
              <SectorDiversification stocks={stocks} />
              <PortfolioCharts stocks={stocks} />
            </TabsContent>

            <TabsContent value="journal" className="animate-fade-up">
              <TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} />
            </TabsContent>

            <TabsContent value="alerts" className="animate-fade-up">
              <PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} />
            </TabsContent>

            <TabsContent value="risk" className="animate-fade-up">
              <RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} />
            </TabsContent>

            <TabsContent value="ai" className="animate-fade-up">
              <AIInsights stocks={stocks} trades={trades} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;