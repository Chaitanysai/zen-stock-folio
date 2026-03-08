import { PortfolioStock, calcInvestedValue, calcFinalValue, calcProfitLoss, getTradeAnalytics } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Briefcase, BarChart3, Target, IndianRupee, Percent, Activity } from "lucide-react";

interface DashboardStatsProps {
  stocks: PortfolioStock[];
}

const DashboardStats = ({ stocks }: DashboardStatsProps) => {
  const totalInvested = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);
  const totalCurrentValue = stocks.reduce((sum, s) => sum + calcFinalValue(s), 0);
  const totalPL = stocks.reduce((sum, s) => sum + calcProfitLoss(s), 0);
  const profitPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const activePositions = stocks.filter(s => s.status === "Active").length;
  const soldPositions = stocks.filter(s => s.status !== "Active").length;
  const analytics = getTradeAnalytics(stocks);
  const isProfit = totalPL >= 0;

  const stats = [
    { label: "Total Invested", value: `₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: IndianRupee, color: "text-primary" },
    { label: "Current Value", value: `₹${totalCurrentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: Briefcase, color: "text-primary" },
    { label: "Total P&L", value: `${isProfit ? "+" : ""}₹${totalPL.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, subtitle: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}%`, icon: isProfit ? TrendingUp : TrendingDown, color: isProfit ? "text-profit" : "text-loss" },
    { label: "Win Rate", value: `${analytics.winRate.toFixed(1)}%`, icon: Target, color: analytics.winRate >= 50 ? "text-profit" : "text-loss" },
    { label: "Open Positions", value: activePositions.toString(), icon: Activity, color: "text-primary" },
    { label: "Closed Trades", value: soldPositions.toString(), icon: BarChart3, color: "text-muted-foreground" },
    { label: "Risk/Reward", value: analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A", icon: Percent, color: analytics.riskRewardRatio >= 2 ? "text-profit" : "text-warning" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
          </div>
          <p className={`text-lg font-semibold font-mono ${stat.color}`}>{stat.value}</p>
          {"subtitle" in stat && stat.subtitle && (
            <p className={`text-xs font-mono ${stat.color} mt-0.5`}>{stat.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
