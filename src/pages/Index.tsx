import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Crosshair, Eye, LayoutDashboard, Shield } from "lucide-react";
import DashboardStats from "@/components/DashboardStats";
import PortfolioTable from "@/components/PortfolioTable";
import TradeStrategyTable from "@/components/TradeStrategyTable";
import WatchlistTable from "@/components/WatchlistTable";
import PortfolioCharts from "@/components/PortfolioCharts";
import RiskAnalysis from "@/components/RiskAnalysis";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Smart Stock Tracker</h1>
              <p className="text-[10px] text-muted-foreground">Portfolio & Trade Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-profit animate-pulse-glow" />
            <span className="text-xs text-muted-foreground">Market Open</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-4 space-y-4">
        <DashboardStats />

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
            <PortfolioCharts />
            <PortfolioTable />
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4">
            <PortfolioTable />
          </TabsContent>

          <TabsContent value="trades" className="mt-4">
            <TradeStrategyTable />
          </TabsContent>

          <TabsContent value="watchlist" className="mt-4">
            <WatchlistTable />
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <RiskAnalysis />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
