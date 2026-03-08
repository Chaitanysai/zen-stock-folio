import { TradeStrategy, PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import { Shield, AlertTriangle } from "lucide-react";

interface RiskAnalysisProps {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
}

const RiskAnalysis = ({ stocks, trades }: RiskAnalysisProps) => {
  const totalPortfolioValue = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);

  const riskData = trades.map((t) => {
    const stock = stocks.find((s) => s.ticker === t.ticker);
    const positionValue = stock ? calcInvestedValue(stock) : t.entryPrice * 10;
    const positionPct = totalPortfolioValue > 0 ? (positionValue / totalPortfolioValue) * 100 : 0;
    const riskToSL = t.entryPrice - t.stopLoss;
    const rewardToT3 = t.target3 - t.entryPrice;
    const rrRatio = riskToSL > 0 ? rewardToT3 / riskToSL : 0;

    return {
      ticker: t.ticker,
      positionPct,
      risk: riskToSL,
      reward: rewardToT3,
      rrRatio,
    };
  });

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Risk Analysis</h2>
        <span className="text-xs text-muted-foreground ml-2">All values in ₹ INR</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 p-4">
        {riskData.map((r) => (
          <div key={r.ticker} className="bg-secondary/50 rounded-lg p-3 border border-border">
            <div className="font-mono font-semibold text-primary text-sm mb-2">{r.ticker}</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Position Size</span>
                <span className="font-mono">{r.positionPct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Risk to SL</span>
                <span className="font-mono text-loss">₹{r.risk.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reward to T3</span>
                <span className="font-mono text-profit">₹{r.reward.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="text-muted-foreground">R:R Ratio</span>
                <span className={`font-mono font-semibold ${r.rrRatio >= 2 ? "text-profit" : r.rrRatio >= 1 ? "text-warning" : "text-loss"}`}>
                  1:{r.rrRatio.toFixed(1)}
                </span>
              </div>
              {r.rrRatio < 1.5 && (
                <div className="flex items-center gap-1 text-warning mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="text-[10px]">Low R:R — review setup</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskAnalysis;
