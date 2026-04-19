import {
  PortfolioStock,
  getTradeAnalytics,
} from "@/data/sampleData";
import {
  TrendingUp, TrendingDown, Target, Trophy,
  Skull, Clock, Zap, BarChart2,
} from "lucide-react";

interface TradeAnalyticsProps {
  stocks: PortfolioStock[];
}

const TradeAnalytics = ({ stocks }: TradeAnalyticsProps) => {
  const analytics = getTradeAnalytics(stocks);

  const metrics = [
    {
      label: "Win Rate",
      value: `${analytics.winRate.toFixed(1)}%`,
      icon: Target,
      color: analytics.winRate >= 50 ? "text-profit" : "text-loss",
      bg: analytics.winRate >= 50 ? "bg-profit/10" : "bg-loss/10",
      note: `${analytics.closedTrades} closed trades`,
    },
    {
      label: "Avg Profit / Trade",
      value: `₹${analytics.avgProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      icon: TrendingUp,
      color: "text-profit",
      bg: "bg-profit/10",
      note: "per winning trade",
    },
    {
      label: "Avg Loss / Trade",
      value: `₹${analytics.avgLoss.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      icon: TrendingDown,
      color: "text-loss",
      bg: "bg-loss/10",
      note: "per losing trade",
    },
    {
      label: "Risk / Reward",
      value: analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A",
      icon: Zap,
      color:
        analytics.riskRewardRatio >= 2
          ? "text-profit"
          : analytics.riskRewardRatio >= 1
          ? "text-warning"
          : "text-loss",
      bg: "bg-primary/10",
      note: "reward to risk",
    },
    {
      label: "Largest Win",
      value: `₹${analytics.largestWin.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      icon: Trophy,
      color: "text-profit",
      bg: "bg-profit/10",
      note: "single best trade",
    },
    {
      label: "Largest Loss",
      value: `₹${Math.abs(analytics.largestLoss).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      icon: Skull,
      color: "text-loss",
      bg: "bg-loss/10",
      note: "single worst trade",
    },
    {
      label: "Total Trades",
      value: analytics.totalTrades.toString(),
      icon: BarChart2,
      color: "text-primary",
      bg: "bg-primary/10",
      note: `${analytics.closedTrades} closed`,
    },
    {
      label: "Avg Holding",
      value: `${analytics.avgHoldingDays.toFixed(0)}d`,
      icon: Clock,
      color: "text-muted-foreground",
      bg: "bg-secondary",
      note: "days per trade",
    },
  ];

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Trade Performance
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Based on {analytics.closedTrades} closed trades
          </p>
        </div>
        <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full border border-border bg-secondary text-muted-foreground">
          Analytics
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border p-px">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="bg-card px-4 py-4 flex flex-col gap-3 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${m.bg}`}>
                <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
              </div>
              <span className="text-[9.5px] font-mono font-semibold uppercase tracking-widest text-muted-foreground text-right">
                {m.label}
              </span>
            </div>
            <div>
              <p className={`text-lg font-semibold font-mono tracking-tight leading-none ${m.color}`}>
                {m.value}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono mt-1">{m.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeAnalytics;
