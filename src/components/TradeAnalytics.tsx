import { PortfolioStock, calcProfitLoss, calcInvestedValue, getTradeAnalytics } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Target, Trophy, Skull, Clock, Zap } from "lucide-react";

interface TradeAnalyticsProps {
  stocks: PortfolioStock[];
}

const TradeAnalytics = ({ stocks }: TradeAnalyticsProps) => {
  const analytics = getTradeAnalytics(stocks);

  const metrics = [
    { label: "Win Rate", value: `${analytics.winRate.toFixed(1)}%`, icon: Target, color: analytics.winRate >= 50 ? "text-profit" : "text-loss", bg: analytics.winRate >= 50 ? "bg-profit/10" : "bg-loss/10" },
    { label: "Avg Profit / Trade", value: `₹${analytics.avgProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: "text-profit", bg: "bg-profit/10" },
    { label: "Avg Loss / Trade", value: `₹${analytics.avgLoss.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: TrendingDown, color: "text-loss", bg: "bg-loss/10" },
    { label: "Risk/Reward Ratio", value: analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A", icon: Zap, color: analytics.riskRewardRatio >= 2 ? "text-profit" : analytics.riskRewardRatio >= 1 ? "text-warning" : "text-loss", bg: "bg-primary/10" },
    { label: "Largest Win", value: `₹${analytics.largestWin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: Trophy, color: "text-profit", bg: "bg-profit/10" },
    { label: "Largest Loss", value: `₹${Math.abs(analytics.largestLoss).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, icon: Skull, color: "text-loss", bg: "bg-loss/10" },
    { label: "Total Trades", value: analytics.totalTrades.toString(), icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Avg Holding Days", value: `${analytics.avgHoldingDays.toFixed(0)} days`, icon: Clock, color: "text-muted-foreground", bg: "bg-secondary" },
  ];

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Trade Performance Analytics</h2>
        <p className="text-xs text-muted-foreground mt-1">Based on {analytics.closedTrades} closed trades</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        {metrics.map((m) => (
          <div key={m.label} className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-7 w-7 rounded-md ${m.bg} flex items-center justify-center`}>
                <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
              </div>
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </div>
            <p className={`text-lg font-semibold font-mono ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeAnalytics;
