import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Briefcase, BarChart3, Target, IndianRupee, Percent, Activity } from "lucide-react";
import { useLivePrices } from "@/hooks/useLivePrices";

interface DashboardStatsProps {
  stocks: PortfolioStock[];
}

const DashboardStats = ({ stocks }: DashboardStatsProps) => {
  const tickers = stocks.map(s => s.ticker);
  const { prices } = useLivePrices(tickers);

  const totalInvested = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);

  const totalCurrentValue = stocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;
    return sum + (cmp * s.quantity);
  }, 0);

  const totalPL = totalCurrentValue - totalInvested;

  const profitPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // ✅ TODAY P&L (REAL)
  const todayPL = stocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    return sum + ((live?.change ?? 0) * s.quantity);
  }, 0);

  const isProfit = totalPL >= 0;

  const stats = [
    { label: "Total Invested", value: `₹${totalInvested.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-primary" },
    { label: "Portfolio Value", value: `₹${totalCurrentValue.toLocaleString("en-IN")}`, icon: Briefcase, color: "text-primary" },
    { 
      label: "Total P&L", 
      value: `${isProfit ? "+" : ""}₹${totalPL.toLocaleString("en-IN")}`, 
      subtitle: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}%`,
      icon: isProfit ? TrendingUp : TrendingDown, 
      color: isProfit ? "text-profit" : "text-loss" 
    },
    { 
      label: "Today's P&L", 
      value: `${todayPL >= 0 ? "+" : ""}₹${todayPL.toLocaleString("en-IN")}`, 
      icon: TrendingUp, 
      color: todayPL >= 0 ? "text-profit" : "text-loss" 
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
          </div>
          <p className={`text-lg font-semibold font-mono ${stat.color}`}>{stat.value}</p>
          {"subtitle" in stat && stat.subtitle && (
            <p className={`text-xs font-mono ${stat.color}`}>{stat.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;