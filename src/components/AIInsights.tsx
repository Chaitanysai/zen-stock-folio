import { useState } from "react";
import { PortfolioStock, TradeStrategy, calcInvestedValue, calcProfitLoss, calcFinalValue, getSectorAllocation } from "@/data/sampleData";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Sparkles, Shield, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AIInsightsProps {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
}

const AIInsights = ({ stocks, trades }: AIInsightsProps) => {
  const [portfolioInsights, setPortfolioInsights] = useState<string | null>(null);
  const [riskInsights, setRiskInsights] = useState<string | null>(null);
  const [tradeInsights, setTradeInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const generateSummary = () => {
    const totalInvested = stocks.reduce((s, st) => s + calcInvestedValue(st), 0);
    const totalValue = stocks.reduce((s, st) => s + calcFinalValue(st), 0);
    const totalPL = stocks.reduce((s, st) => s + calcProfitLoss(st), 0);
    const sectors = getSectorAllocation(stocks);
    const active = stocks.filter((s) => s.status === "Active");
    const closed = stocks.filter((s) => s.status !== "Active");

    let summary = `Portfolio Overview:\n`;
    summary += `- Total Invested: ₹${totalInvested.toLocaleString("en-IN")}\n`;
    summary += `- Current Value: ₹${totalValue.toLocaleString("en-IN")}\n`;
    summary += `- Total P&L: ₹${totalPL.toLocaleString("en-IN")} (${((totalPL / totalInvested) * 100).toFixed(1)}%)\n`;
    summary += `- Active Positions: ${active.length}, Closed: ${closed.length}\n\n`;

    summary += `Active Positions:\n`;
    active.forEach((s) => {
      const pl = calcProfitLoss(s);
      const trade = trades.find((t) => t.ticker === s.ticker);
      summary += `- ${s.ticker} (${s.sector || "Unknown"}): Entry ₹${s.entryPrice}, CMP ₹${s.cmp}, Qty ${s.quantity}, P&L ₹${pl.toFixed(0)}`;
      if (trade) summary += `, SL ₹${trade.stopLoss}, T1 ₹${trade.target1}, T3 ₹${trade.target3}`;
      summary += `\n`;
    });

    summary += `\nSector Allocation:\n`;
    sectors.forEach((s) => {
      summary += `- ${s.sector}: ${s.percentage.toFixed(1)}% (₹${s.value.toLocaleString("en-IN")})\n`;
    });

    summary += `\nClosed Trades:\n`;
    closed.forEach((s) => {
      const pl = calcProfitLoss(s);
      summary += `- ${s.ticker}: ${pl >= 0 ? "Profit" : "Loss"} ₹${Math.abs(pl).toFixed(0)}\n`;
    });

    return summary;
  };

  const callAiApi = async (prompt: string) => {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data?.error || `AI analysis failed (${response.status}).`);
    }

    return (data?.response || data?.insights) as string;
  };

  const fetchAnalysis = async (type: "portfolio" | "risk") => {
    setLoading(type);
    try {
      const summary = generateSummary();
      const prompt =
        type === "portfolio"
          ? `You are a professional Indian stock market analyst. Provide actionable insights for retail investors. Use ₹ for currency. Be specific with numbers. Format with markdown headers and bullet points.\n\nAnalyze this stock portfolio and provide insights in these sections:\n\n## Portfolio Insights\nOverall health, performance summary\n\n## Risk Warnings\nStocks close to stop loss, high-risk positions\n\n## Diversification Suggestions\nSector concentration, rebalancing advice\n\n## Trade Observations\nStocks approaching targets, momentum analysis\n\nPortfolio Data:\n${summary}`
          : `You are a portfolio risk analyst for Indian equity markets. Focus on identifying risks and providing actionable mitigation strategies. Use ₹ for currency.\n\nScan this portfolio and identify:\n\n## High-Risk Positions\nPositions with significant downside risk\n\n## Concentration Risk\nOver-allocation to specific stocks or sectors\n\n## Sector Exposure\nSectors that are overexposed or underrepresented\n\n## Stop Loss Proximity\nPositions near stop loss levels that need attention\n\nPortfolio Data:\n${summary}`;

      const aiResponse = await callAiApi(prompt);

      if (type === "portfolio") setPortfolioInsights(aiResponse);
      else setRiskInsights(aiResponse);
    } catch (e: any) {
      toast({ title: "AI Analysis Failed", description: e.message || "Could not generate insights", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const fetchTradeInsight = async (stock: PortfolioStock) => {
    setLoading(`trade-${stock.ticker}`);
    try {
      const trade = trades.find((t) => t.ticker === stock.ticker);
      const tradeData = `Ticker: ${stock.ticker}\nSector: ${stock.sector || "Unknown"}\nEntry Price: ₹${stock.entryPrice}\nCurrent Price: ₹${stock.cmp}\nQuantity: ${stock.quantity}\nP&L: ₹${calcProfitLoss(stock).toFixed(0)}${trade ? `\nStop Loss: ₹${trade.stopLoss}\nTarget 1: ₹${trade.target1}\nTarget 2: ₹${trade.target2}\nTarget 3: ₹${trade.target3}` : ""}`;
      const prompt = `You are a professional stock trade analyst for Indian markets. Provide concise, actionable analysis. Use ₹ for currency.\n\nAnalyze this stock position and provide:\n• Risk level (Low/Medium/High)\n• Probability assessment of reaching targets\n• Specific trade advice (hold/exit/add)\n\nPosition Details:\n${tradeData}`;

      const aiResponse = await callAiApi(prompt);
      setTradeInsights((prev) => ({ ...prev, [stock.ticker]: aiResponse }));
    } catch (e: any) {
      toast({ title: "Trade Insight Failed", description: e.message || "Could not analyze trade", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const activeStocks = stocks.filter((s) => s.status === "Active");

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">AI Portfolio Insights</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Powered by Google Gemini AI</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="portfolio" className="w-full">
          <div className="px-4 pt-3">
            <TabsList className="bg-muted/50 h-9">
              <TabsTrigger value="portfolio" className="text-xs gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Portfolio Analysis
              </TabsTrigger>
              <TabsTrigger value="risk" className="text-xs gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Risk Scanner
              </TabsTrigger>
              <TabsTrigger value="trades" className="text-xs gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Trade Insights
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="portfolio" className="p-4 pt-3">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => fetchAnalysis("portfolio")} disabled={loading !== null} className="gap-1.5 text-xs">
                {loading === "portfolio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading === "portfolio" ? "Analyzing portfolio..." : "Analyze Portfolio"}
              </Button>
            </div>
            {portfolioInsights ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                <ReactMarkdown>{portfolioInsights}</ReactMarkdown>
              </div>
            ) : (
              <EmptyState icon={BarChart3} text="Click 'Analyze Portfolio' to get AI-powered portfolio analysis" sub="Includes insights, risk warnings, diversification suggestions, and trade observations" />
            )}
          </TabsContent>

          <TabsContent value="risk" className="p-4 pt-3">
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => fetchAnalysis("risk")} disabled={loading !== null} className="gap-1.5 text-xs" variant="destructive">
                {loading === "risk" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {loading === "risk" ? "Scanning risks..." : "Scan Risks"}
              </Button>
            </div>
            {riskInsights ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground leading-relaxed">
                <ReactMarkdown>{riskInsights}</ReactMarkdown>
              </div>
            ) : (
              <EmptyState icon={Shield} text="Click 'Scan Risks' to identify portfolio vulnerabilities" sub="Identifies high-risk positions, concentration risk, and stop loss proximity" />
            )}
          </TabsContent>

          <TabsContent value="trades" className="p-4 pt-3">
            {activeStocks.length === 0 ? (
              <EmptyState icon={TrendingUp} text="No active positions to analyze" sub="Add active stock positions to get trade-level AI insights" />
            ) : (
              <div className="space-y-3">
                {activeStocks.map((stock) => (
                  <div key={stock.ticker} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-sm">{stock.ticker}</span>
                        <span className="text-xs text-muted-foreground ml-2">{stock.sector}</span>
                        <span className={`text-xs ml-2 ${calcProfitLoss(stock) >= 0 ? "text-profit" : "text-loss"}`}>
                          ₹{calcProfitLoss(stock).toFixed(0)}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => fetchTradeInsight(stock)} disabled={loading !== null} className="gap-1.5 text-xs">
                        {loading === `trade-${stock.ticker}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                        {loading === `trade-${stock.ticker}` ? "Analyzing..." : "AI Trade Insight"}
                      </Button>
                    </div>
                    {tradeInsights[stock.ticker] && (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground leading-relaxed mt-2 pt-2 border-t border-border">
                        <ReactMarkdown>{tradeInsights[stock.ticker]}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const EmptyState = ({ icon: Icon, text, sub }: { icon: any; text: string; sub: string }) => (
  <div className="text-center py-8">
    <Icon className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
    <p className="text-sm text-muted-foreground">{text}</p>
    <p className="text-xs text-muted-foreground mt-1">{sub}</p>
  </div>
);

export default AIInsights;
