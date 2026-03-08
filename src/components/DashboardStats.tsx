import { PortfolioStock, calcInvestedValue, calcFinalValue, calcProfitLoss } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Briefcase, BarChart3, Target, IndianRupee } from "lucide-react";

interface DashboardStatsProps {
  stocks: PortfolioStock[];
}

const DashboardStats = ({ stocks }: DashboardStatsProps) => {
  const totalInvested = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);
  const totalCurrentValue = stocks.reduce((sum, s) => sum + calcFinalValue(s), 0);
  const totalPL = stocks.reduce((sum, s) => sum + calcProfitLoss(s), 0);
  const activePositions = stocks.filter(s => s.status === "Active").length;
  const soldPositions = stocks.filter(s => s.status !== "Active").length;
  const winCount = stocks.filter(s => calcProfitLoss(s) > 0).length;
  const winRate = stocks.length > 0 ? (winCount / stocks.length) * 100 : 0;
  const isProfit = totalPL >= 0;

  const stats = [
    { label: "Total Invested (₹)", value: `₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: IndianRupee, color: "text-primary" },
    { label: "Current Value (₹)", value: `₹${totalCurrentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: Briefcase, color: "text-primary" },
    { label: "Total P&L (₹)", value: `${isProfit ? "+" : ""}₹${totalPL.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: isProfit ? TrendingUp : TrendingDown, color: isProfit ? "text-profit" : "text-loss" },
    { label: "Win Rate", value: `${winRate.toFixed(1)}%`, icon: Target, color: winRate >= 50 ? "text-profit" : "text-loss" },
    { label: "Open Trades", value: activePositions.toString(), icon: BarChart3, color: "text-primary" },
    { label: "Closed Trades", value: soldPositions.toString(), icon: BarChart3, color: "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
          <p className={`text-lg font-semibold font-mono ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
