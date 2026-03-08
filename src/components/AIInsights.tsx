import { useState } from "react";
import { PortfolioStock, TradeStrategy, calcInvestedValue, calcProfitLoss, calcFinalValue, getSectorAllocation } from "@/data/sampleData";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface AIInsightsProps {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
}

const AIInsights = ({ stocks, trades }: AIInsightsProps) => {
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateSummary = () => {
    const totalInvested = stocks.reduce((s, st) => s + calcInvestedValue(st), 0);
    const totalValue = stocks.reduce((s, st) => s + calcFinalValue(st), 0);
    const totalPL = stocks.reduce((s, st) => s + calcProfitLoss(st), 0);
    const sectors = getSectorAllocation(stocks);
    const active = stocks.filter(s => s.status === "Active");
    const closed = stocks.filter(s => s.status !== "Active");

    let summary = `Portfolio Overview:\n`;
    summary += `- Total Invested: ₹${totalInvested.toLocaleString("en-IN")}\n`;
    summary += `- Current Value: ₹${totalValue.toLocaleString("en-IN")}\n`;
    summary += `- Total P&L: ₹${totalPL.toLocaleString("en-IN")} (${((totalPL / totalInvested) * 100).toFixed(1)}%)\n`;
    summary += `- Active Positions: ${active.length}, Closed: ${closed.length}\n\n`;

    summary += `Active Positions:\n`;
    active.forEach(s => {
      const pl = calcProfitLoss(s);
      const trade = trades.find(t => t.ticker === s.ticker);
      summary += `- ${s.ticker} (${s.sector || "Unknown"}): Entry ₹${s.entryPrice}, CMP ₹${s.cmp}, Qty ${s.quantity}, P&L ₹${pl.toFixed(0)}`;
      if (trade) summary += `, SL ₹${trade.stopLoss}, T1 ₹${trade.target1}, T3 ₹${trade.target3}`;
      summary += `\n`;
    });

    summary += `\nSector Allocation:\n`;
    sectors.forEach(s => { summary += `- ${s.sector}: ${s.percentage.toFixed(1)}% (₹${s.value.toLocaleString("en-IN")})\n`; });

    summary += `\nClosed Trades:\n`;
    closed.forEach(s => {
      const pl = calcProfitLoss(s);
      summary += `- ${s.ticker}: ${pl >= 0 ? "Profit" : "Loss"} ₹${Math.abs(pl).toFixed(0)}\n`;
    });

    return summary;
  };

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const summary = generateSummary();
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { portfolioSummary: summary },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInsights(data.insights);
    } catch (e: any) {
      toast({ title: "AI Analysis Failed", description: e.message || "Could not generate insights", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">AI Portfolio Insights</h2>
            <p className="text-xs text-muted-foreground mt-1">Powered by AI analysis of your portfolio</p>
          </div>
        </div>
        <Button size="sm" onClick={fetchInsights} disabled={loading} className="gap-1.5 text-xs">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Analyzing..." : "Generate Insights"}
        </Button>
      </div>
      <div className="p-4">
        {insights ? (
          <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground leading-relaxed">
            <ReactMarkdown>{insights}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-center py-8">
            <Brain className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Click "Generate Insights" to get AI-powered analysis of your portfolio</p>
            <p className="text-xs text-muted-foreground mt-1">Analyzes concentration risk, stop loss exposure, and recommendations</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
