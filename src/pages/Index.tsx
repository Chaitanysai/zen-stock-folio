import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Crosshair, Eye, LayoutDashboard, Shield, RefreshCw } from "lucide-react";
import { portfolioData as initialData, PortfolioStock, tradeStrategies as initialTrades, TradeStrategy, watchlistData as initialWatchlist, WatchlistStock } from "@/data/sampleData";
import DashboardStats from "@/components/DashboardStats";
import PortfolioTable from "@/components/PortfolioTable";
import TradeStrategyTable from "@/components/TradeStrategyTable";
import WatchlistTable from "@/components/WatchlistTable";
import PortfolioCharts from "@/components/PortfolioCharts";
import RiskAnalysis from "@/components/RiskAnalysis";
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stocks, setStocks] = useState<PortfolioStock[]>(initialData);
  const [trades, setTrades] = useState<TradeStrategy[]>(initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(initialWatchlist);
  const { toast } = useToast();

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
      return { ...s, cmp: live.price, weekHigh52: live.weekHigh52 || s.weekHigh52 };
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

  useEffect(() => {
    if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" });
  }, [error]);

  const handleAddStock = (stock: PortfolioStock) => {
    setStocks((prev) => [...prev, stock]);
  };

  const handleImportStocks = (imported: PortfolioStock[]) => {
    setStocks((prev) => [...prev, ...imported]);
  };

  const handleEditStock = (originalTicker: string, updated: PortfolioStock) => {
    setStocks((prev) => prev.map((s) => (s.ticker === originalTicker ? updated : s)));
    toast({ title: "Transaction updated", description: `${updated.ticker} has been updated` });
  };

  const handleDeleteStock = (ticker: string) => {
    setStocks((prev) => prev.filter((s) => s.ticker !== ticker));
    toast({ title: "Transaction deleted", description: `${ticker} removed from portfolio` });
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Smart Stock Tracker</h1>
              <p className="text-[10px] text-muted-foreground">Portfolio & Trade Dashboard · ₹ INR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="gap-1.5 text-xs text-muted-foreground hover:text-primary">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Fetching..." : "Refresh"}
            </Button>
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
          <TabsList className="bg-card border border-border h-10">
            <TabsTrigger value="dashboard" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <BarChart3 className="h-3.5 w-3.5" /> Portfolio
            </TabsTrigger>
            <TabsTrigger value="trades" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Crosshair className="h-3.5 w-3.5" /> Trades
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Eye className="h-3.5 w-3.5" /> Watchlist
            </TabsTrigger>
            <TabsTrigger value="risk" className="text-xs gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Shield className="h-3.5 w-3.5" /> Risk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4 space-y-4">
            <PortfolioCharts stocks={stocks} />
            <PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4">
            <PortfolioTable stocks={stocks} onAdd={handleAddStock} onEdit={handleEditStock} onDelete={handleDeleteStock} />
          </TabsContent>

          <TabsContent value="trades" className="mt-4">
            <TradeStrategyTable trades={trades} />
          </TabsContent>

          <TabsContent value="watchlist" className="mt-4">
            <WatchlistTable watchlist={watchlist} />
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <RiskAnalysis stocks={stocks} trades={trades} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
