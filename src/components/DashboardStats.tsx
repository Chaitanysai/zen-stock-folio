import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import { TrendingUp, TrendingDown, Wallet, IndianRupee, BarChart3, Activity } from "lucide-react";
import { useLivePrices } from "@/hooks/useLivePrices";

interface DashboardStatsProps {
  stocks: PortfolioStock[];
}

const DashboardStats = ({ stocks }: DashboardStatsProps) => {
  const tickers = stocks.map((s) => s.ticker);
  const { prices } = useLivePrices(tickers);

  const totalInvested = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);

  const totalCurrentValue = stocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;
    return sum + cmp * s.quantity;
  }, 0);

  const totalPL = totalCurrentValue - totalInvested;
  const profitPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const todayPL = stocks.reduce((sum, s) => {
    const live = prices[s.ticker];
    return sum + ((live?.change ?? 0) * s.quantity);
  }, 0);

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
      sub: `${stocks.length} positions`,
      icon: Wallet,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accent: "stat-card-neutral",
    },
    {
      label: "Portfolio Value",
      value: fmt(totalCurrentValue),
      sub: `${profitPct >= 0 ? "+" : ""}${profitPct.toFixed(2)}% overall`,
      icon: BarChart3,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      accent: "stat-card-neutral",
    },
    {
      label: "Total P&L",
      value: `${isProfit ? "+" : "−"}${fmt(totalPL)}`,
      sub: `${isProfit ? "+" : ""}${profitPct.toFixed(1)}% return`,
      icon: isProfit ? TrendingUp : TrendingDown,
      iconColor: isProfit ? "text-profit" : "text-loss",
      iconBg: isProfit ? "bg-profit/10" : "bg-loss/10",
      accent: isProfit ? "stat-card-profit" : "stat-card-loss",
      valueColor: isProfit ? "text-profit" : "text-loss",
    },
    {
      label: "Today's P&L",
      value: `${isTodayProfit ? "+" : "−"}${fmt(todayPL)}`,
      sub: "intraday change",
      icon: Activity,
      iconColor: isTodayProfit ? "text-profit" : "text-loss",
      iconBg: isTodayProfit ? "bg-profit/10" : "bg-loss/10",
      accent: isTodayProfit ? "stat-card-profit" : "stat-card-loss",
      valueColor: isTodayProfit ? "text-profit" : "text-loss",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
      {stats.map((stat, i) => (
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
          <p className="text-[11px] text-muted-foreground font-mono">{stat.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default DashboardStats;
