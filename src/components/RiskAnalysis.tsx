import { useMemo, useState } from "react";
import { TradeStrategy, PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import { Shield, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RiskAnalysisProps {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  onEditTrade: (originalTicker: string, updated: TradeStrategy) => void;
}

const RiskAnalysis = ({ stocks, trades, onEditTrade }: RiskAnalysisProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeStrategy | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const totalPortfolioValue = stocks.reduce((sum, s) => sum + calcInvestedValue(s), 0);

  const riskData = useMemo(() => {
    return trades.map((t) => {
      const stock = stocks.find((s) => s.ticker === t.ticker);
      const positionValue = stock ? calcInvestedValue(stock) : t.entryPrice * 10;
      const positionPct = totalPortfolioValue > 0 ? (positionValue / totalPortfolioValue) * 100 : 0;
      const riskToSL = t.entryPrice - t.stopLoss;
      const rewardToT3 = t.target3 - t.entryPrice;
      const rrRatio = riskToSL > 0 ? rewardToT3 / riskToSL : 0;

      return {
        trade: t,
        positionPct,
        risk: riskToSL,
        reward: rewardToT3,
        rrRatio,
      };
    });
  }, [trades, stocks, totalPortfolioValue]);

  const openEdit = (trade: TradeStrategy) => {
    setEditingTrade(trade);
    setEditForm({
      ticker: trade.ticker,
      entryPrice: trade.entryPrice.toString(),
      target1: trade.target1.toString(),
      target2: trade.target2.toString(),
      target3: trade.target3.toString(),
      stopLoss: trade.stopLoss.toString(),
      trailingStopLoss: trade.trailingStopLoss.toString(),
    });
    setEditOpen(true);
  };

  const updateField = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrade) return;

    const updated: TradeStrategy = {
      ticker: editForm.ticker || editingTrade.ticker,
      entryPrice: parseFloat(editForm.entryPrice) || editingTrade.entryPrice,
      livePrice: editingTrade.livePrice,
      target1: parseFloat(editForm.target1) || editingTrade.target1,
      target2: parseFloat(editForm.target2) || editingTrade.target2,
      target3: parseFloat(editForm.target3) || editingTrade.target3,
      stopLoss: parseFloat(editForm.stopLoss) || editingTrade.stopLoss,
      trailingStopLoss: parseFloat(editForm.trailingStopLoss) || editingTrade.trailingStopLoss,
    };

    onEditTrade(editingTrade.ticker, updated);
    setEditOpen(false);
  };

  return (
    <>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Risk Analysis</h2>
          <span className="text-xs text-muted-foreground ml-2">All values in ₹ INR</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 p-4">
          {riskData.map((r) => (
            <div key={r.trade.ticker} className="bg-secondary/50 rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono font-semibold text-primary text-sm">{r.trade.ticker}</div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => openEdit(r.trade)}>
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Trade from Risk Analysis</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Ticker</Label>
                <Input value={editForm.ticker ?? ""} onChange={e => updateField("ticker", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Entry Price (₹)</Label>
                <Input type="number" step="0.01" value={editForm.entryPrice ?? ""} onChange={e => updateField("entryPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Target 1 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target1 ?? ""} onChange={e => updateField("target1", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 2 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target2 ?? ""} onChange={e => updateField("target2", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 3 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target3 ?? ""} onChange={e => updateField("target3", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stop Loss (₹)</Label>
                <Input type="number" step="0.01" value={editForm.stopLoss ?? ""} onChange={e => updateField("stopLoss", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Trailing SL (₹)</Label>
                <Input type="number" step="0.01" value={editForm.trailingStopLoss ?? ""} onChange={e => updateField("trailingStopLoss", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <Button type="submit" className="w-full mt-2">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RiskAnalysis;