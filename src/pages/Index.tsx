import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Crosshair, Eye, LayoutDashboard, Shield, RefreshCw, History, BookOpen, Bell, Brain, PieChart, Save } from "lucide-react";
import { portfolioData as initialData, PortfolioStock, tradeStrategies as initialTrades, TradeStrategy, watchlistData as initialWatchlist, WatchlistStock, PriceAlert, TradeJournalEntry } from "@/data/sampleData";
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
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

type PortfolioSnapshot = {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  watchlist: WatchlistStock[];
  alerts: PriceAlert[];
};

const STORAGE_KEY = "smart-stock-tracker-data";

const loadPortfolioSnapshot = (): PortfolioSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawData = window.localStorage.getItem(STORAGE_KEY);
  if (!rawData) {
    return null;
  }

  try {
    const parsedData = JSON.parse(rawData) as Partial<PortfolioSnapshot>;
    if (!Array.isArray(parsedData.stocks) || !Array.isArray(parsedData.trades) || !Array.isArray(parsedData.watchlist) || !Array.isArray(parsedData.alerts)) {
      return null;
    }

    return {
      stocks: parsedData.stocks,
      trades: parsedData.trades,
      watchlist: parsedData.watchlist,
      alerts: parsedData.alerts,
    };
  } catch {
    return null;
  }
};

const Index = () => {
  const initialSnapshot = loadPortfolioSnapshot();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stocks, setStocks] = useState<PortfolioStock[]>(() => initialSnapshot?.stocks ?? initialData);
  const [trades, setTrades] = useState<TradeStrategy[]>(() => initialSnapshot?.trades ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(() => initialSnapshot?.watchlist ?? initialWatchlist);
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => initialSnapshot?.alerts ?? []);
  const { toast } = useToast();

  const handleSavePortfolio = () => {
    if (typeof window === "undefined") {
      return;
    }

    const snapshot: PortfolioSnapshot = {
      stocks,
      trades,
      watchlist,
      alerts,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    toast({
      title: "Portfolio saved",
      description: "Your latest transactions are now saved for the next visit.",
    });
  };

  const allTickers = [
    ...stocks.filter(s => s.status === "Active").map(s => s.ticker),
    ...trades.map(t => t.ticker),
    ...watchlist.map(w => w.stockName),
  ];

  const { prices, loading, lastUpdated, error, refresh } = useLivePrices(allTickers);

  // Update live prices
  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setStocks(prev => prev.map(s => {
      const live = prices[s.ticker];
      if (!live || s.status !== "Active") return s;
      return {
        ...s,
        cmp: live.price,
        weekHigh52: live.weekHigh52 || s.weekHigh52,
        weekLow52: live.weekLow52 || s.weekLow52,
        dailyChange: live.change,
      };
    }));
    setTrades(prev => prev.map(t => {
      const live = prices[t.ticker];
      if (!live) return t;
      return { ...t, livePrice: live.price };
    }));
    setWatchlist(prev => prev.map(w => {
      const live = prices[w.stockName];
      if (!live) return w;
      return { ...w, cmp: live.price };
    }));
  }, [prices]);

  // Check price alerts
  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setAlerts(prev => prev.map(a => {
      if (a.triggered) return a;
      const live = prices[a.ticker];
      if (!live) return a;
      const triggered =
        (a.direction === "above" && live.price >= a.targetPrice) ||
        (a.direction === "below" && live.price <= a.targetPrice);
      if (triggered) {
        toast({
          title: `🔔 Alert: ${a.ticker}`,
          description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "Stop loss hit" : "Entry zone reached"} at ₹${live.price.toFixed(2)}`,
        });
      }
      return triggered ? { ...a, triggered: true } : a;
    }));
  }, [prices]);

  useEffect(() => {
    if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" });
  }, [error]);

  const handleAddStock = (stock: PortfolioStock) => setStocks(prev => [...prev, stock]);
  const handleImportStocks = (imported: PortfolioStock[]) => setStocks(prev => [...prev, ...imported]);
  const handleEditStock = (originalTicker: string, updated: PortfolioStock) => {
    setStocks(prev => prev.map(s => (s.ticker === originalTicker ? updated : s)));
    toast({ title: "Transaction updated", description: `${updated.ticker} has been updated` });
  };
  const handleDeleteStock = (ticker: string) => {
    setStocks(prev => prev.filter(s => s.ticker !== ticker));
    toast({ title: "Transaction deleted", description: `${ticker} removed from portfolio` });
  };
  const handleEditTrade = (originalTicker: string, updated: TradeStrategy) => {
    setTrades(prev => prev.map(t => (t.ticker === originalTicker ? updated : t)));
    toast({ title: "Trade updated", description: `${updated.ticker} has been updated` });
  };
  const handleDeleteTrade = (ticker: string) => {
    setTrades(prev => prev.filter(t => t.ticker !== ticker));
    toast({ title: "Trade deleted", description: `${ticker} removed from trades` });
  };
  const handleEditWatchlist = (originalName: string, updated: WatchlistStock) => {
    setWatchlist(prev => prev.map(w => (w.stockName === originalName ? updated : w)));
    toast({ title: "Watchlist updated", description: `${updated.stockName} has been updated` });
  };
  const handleDeleteWatchlist = (stockName: string) => {
    setWatchlist(prev => prev.filter(w => w.stockName !== stockName));
    toast({ title: "Watchlist entry deleted", description: `${stockName} removed from watchlist` });
  };
  const handleUpdateNotes = (ticker: string, notes: TradeJournalEntry) => {
    setStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, notes } : s));
    toast({ title: "Journal updated", description: `Notes saved for ${ticker}` });
  };
  const handleAddAlert = (alert: PriceAlert) => setAlerts(prev => [...prev, alert]);
  const handleDeleteAlert = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id));
  const handleDismissAlert = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id));

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="absolute inset-x-0 top-0 h-[1px] gradient-primary opacity-60" />
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shadow-lg">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight gradient-text">Smart Stock Tracker</h1>
              <p className="text-[10px] text-muted-foreground">Portfolio & Trade Dashboard · ₹ INR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ExportPortfolio stocks={stocks} />
            <Button variant="secondary" size="sm" onClick={handleSavePortfolio} className="gap-1.5 text-xs">
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="gap-1.5 text-xs text-muted-foreground hover:text-primary">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Fetching..." : "Refresh"}
            </Button>
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
              <span className="text-xs text-muted-foreground">
                {lastUpdated ? `Updated ${formatTime(lastUpdated)}` : "Live Prices"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-4 space-y-4">
        <DashboardStats stocks={stocks} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto">
             <TabsList className="bg-card/50 backdrop-blur-sm border border-border h-11 inline-flex w-auto min-w-full rounded-xl p-1 gap-0.5">
              <TabsTrigger value="dashboard" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="portfolio" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <BarChart3 className="h-3.5 w-3.5" /> Portfolio
              </TabsTrigger>
              <TabsTrigger value="trades" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Crosshair className="h-3.5 w-3.5" /> Trades
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <History className="h-3.5 w-3.5" /> History
              </TabsTrigger>
              <TabsTrigger value="watchlist" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Eye className="h-3.5 w-3.5" /> Watchlist
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <PieChart className="h-3.5 w-3.5" /> Analytics
              </TabsTrigger>
              <TabsTrigger value="journal" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <BookOpen className="h-3.5 w-3.5" /> Journal
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all relative">
                <Bell className="h-3.5 w-3.5" /> Alerts
                {alerts.filter(a => a.triggered).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-loss text-[10px] font-bold flex items-center justify-center text-primary-foreground">
                    {alerts.filter(a => a.triggered).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="risk" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Shield className="h-3.5 w-3.5" /> Risk
              </TabsTrigger>
              <TabsTrigger value="ai" className="text-xs gap-1.5 rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                <Brain className="h-3.5 w-3.5" /> AI Insights
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="mt-4 space-y-4">
            <PortfolioCharts stocks={stocks} />
            <TradeAnalytics stocks={stocks} />
            <PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4 space-y-4">
            <PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} />
          </TabsContent>

          <TabsContent value="trades" className="mt-4">
            <TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <TradeHistory stocks={stocks} />
          </TabsContent>

          <TabsContent value="watchlist" className="mt-4">
            <WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4 space-y-4">
            <TradeAnalytics stocks={stocks} />
            <SectorDiversification stocks={stocks} />
            <PortfolioCharts stocks={stocks} />
          </TabsContent>

          <TabsContent value="journal" className="mt-4">
            <TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} />
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} />
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} />
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <AIInsights stocks={stocks} trades={trades} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;