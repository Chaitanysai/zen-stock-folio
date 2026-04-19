import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Wallet, BarChart3, Activity, Award } from "lucide-react";
import { useLivePrices } from "@/hooks/useLivePrices";

interface DashboardStatsProps {
  stocks: PortfolioStock[];
}

const DashboardStats = ({ stocks }: DashboardStatsProps) => {
  const tickers = stocks.map((s) => s.ticker);
  const { prices } = useLivePrices(tickers);

  // Only count active positions for invested / current value
  const activeStocks = stocks.filter((s) => s.status === "Active");
  const closedStocks = stocks.filter((s) => s.status !== "Active");

  const totalInvested = activeStocks.reduce(
    (sum, s) => sum + s.entryPrice * s.quantity,
    0
  );

  const totalCurrentValue = activeStocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;
    return sum + cmp * s.quantity;
  }, 0);

  const totalPL = totalCurrentValue - totalInvested;
  const profitPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const todayPL = activeStocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    return sum + ((live?.change ?? 0) * s.quantity);
  }, 0);

  // Win rate from closed trades
  const winners = closedStocks.filter((s) => {
    const pl = ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity;
    return pl > 0;
  });
  const winRate =
    closedStocks.length > 0
      ? (winners.length / closedStocks.length) * 100
      : 0;

  const isProfit = totalPL >= 0;
  const isTodayProfit = todayPL >= 0;

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 10_00_000) return `₹${(abs / 1_00_000).toFixed(2)}L`;
    if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`;
    return `₹${abs.toFixed(0)}`;
  };

  const stats = [
    {
      label: "Invested",
      value: fmt(totalInvested),
      sub: `${activeStocks.length} active · ${closedStocks.length} closed`,
      icon: Wallet,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accent: "",
    },
    {
      label: "Portfolio Value",
      value: fmt(totalCurrentValue),
      sub: `${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}% overall`,
      icon: BarChart3,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accent: "",
    },
    {
      label: "Total P&L",
      value: `${isProfit ? "+" : "−"}${fmt(Math.abs(totalPL))}`,
      sub: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}% return`,
      icon: isProfit ? TrendingUp : TrendingDown,
      iconColor: isProfit ? "text-profit" : "text-loss",
      iconBg: isProfit ? "bg-profit/10" : "bg-loss/10",
      accent: isProfit ? "stat-card-profit" : "stat-card-loss",
      valueColor: isProfit ? "text-profit" : "text-loss",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(0)}%`,
      sub: `Today: ${isTodayProfit ? "+" : "−"}${fmt(Math.abs(todayPL))}`,
      icon: Award,
      iconColor:
        winRate >= 50
          ? "text-profit"
          : winRate > 0
          ? "text-warning"
          : "text-muted-foreground",
      iconBg:
        winRate >= 50
          ? "bg-profit/10"
          : winRate > 0
          ? "bg-warning/10"
          : "bg-muted",
      accent: "",
      valueColor:
        winRate >= 50
          ? "text-profit"
          : winRate > 0
          ? "text-warning"
          : "text-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`stat-card animate-fade-up ${stat.accent ?? ""}`}
        >
          {/* Icon + label row */}
          <div className="flex items-center justify-between mb-3">
            <div
              className={`h-8 w-8 rounded-lg flex items-center justify-center ${stat.iconBg}`}
            >
              <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
            </div>
            <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground font-mono">
              {stat.label}
            </span>
          </div>

          {/* Value */}
          <p
            className={`text-xl font-semibold font-mono tracking-tight leading-none mb-1 ${
              stat.valueColor ?? "text-foreground"
            }`}
          >
            {stat.value}
          </p>

          {/* Subtitle */}
          <p className="text-[11px] text-muted-foreground font-mono">
            {stat.sub}
          </p>
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
