import { useState } from "react";
import { TradeStrategy, calcPercentChange, getTargetStatus, getSLRiskIndicator, getProgressPercent } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface TradeStrategyTableProps {
  trades: TradeStrategy[];
  onEdit: (originalTicker: string, updated: TradeStrategy) => void;
  onDelete: (ticker: string) => void;
}

const TradeStrategyTable = ({ trades, onEdit, onDelete }: TradeStrategyTableProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<TradeStrategy | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const toggleSelect = (ticker: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === trades.length ? new Set() : new Set(trades.map(t => t.ticker)));
  };

  const confirmBulkDelete = () => {
    selected.forEach(ticker => onDelete(ticker));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  const confirmDelete = () => {
    if (deleteTarget) { onDelete(deleteTarget); setDeleteTarget(null); }
  };

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
    onEdit(editingTrade.ticker, updated);
    setEditOpen(false);
  };

  const updateField = (field: string, value: string) => setEditForm(prev => ({ ...prev, [field]: value }));

  return (
    <>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Trade Strategy Tracker</h2>
            <p className="text-xs text-muted-foreground mt-1">Active trade setups with targets & stop losses · Live prices in ₹</p>
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" className="gap-1.5 text-xs" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="table-header w-10">
                  <Checkbox checked={trades.length > 0 && selected.size === trades.length} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="table-header w-8"></TableHead>
                <TableHead className="table-header">Ticker</TableHead>
                <TableHead className="table-header text-right">Entry (₹)</TableHead>
                <TableHead className="table-header text-right">Live (₹)</TableHead>
                <TableHead className="table-header text-right">% Change</TableHead>
                <TableHead className="table-header text-right">T1</TableHead>
                <TableHead className="table-header text-right">T2</TableHead>
                <TableHead className="table-header text-right">T3</TableHead>
                <TableHead className="table-header text-right">SL</TableHead>
                <TableHead className="table-header text-right">TSL</TableHead>
                <TableHead className="table-header">Progress</TableHead>
                <TableHead className="table-header">Target Status</TableHead>
                <TableHead className="table-header">SL Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => {
                const pctChange = calcPercentChange(trade.entryPrice, trade.livePrice);
                const targetStatus = getTargetStatus(trade);
                const slRisk = getSLRiskIndicator(trade);
                const progress = getProgressPercent(trade);
                return (
                  <TableRow key={trade.ticker} className={`border-border hover:bg-accent/50 ${selected.has(trade.ticker) ? "bg-accent/30" : ""}`}>
                    <TableCell className="w-10 p-2">
                      <Checkbox checked={selected.has(trade.ticker)} onCheckedChange={() => toggleSelect(trade.ticker)} aria-label={`Select ${trade.ticker}`} />
                    </TableCell>
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-popover border-border">
                          <DropdownMenuItem onClick={() => openEdit(trade)} className="gap-2 text-xs cursor-pointer">
                            <Pencil className="h-3 w-3" /> Edit Trade
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(trade.ticker)} className="gap-2 text-xs text-loss cursor-pointer focus:text-loss">
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-primary text-sm">{trade.ticker}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{trade.entryPrice.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{trade.livePrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-medium ${pctChange >= 0 ? "text-profit" : "text-loss"}`}>
                        {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{trade.target1}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{trade.target2}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{trade.target3}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-loss">₹{trade.stopLoss}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-warning">₹{trade.trailingStopLoss}</TableCell>
                    <TableCell className="min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-2 flex-1" />
                        <span className="font-mono text-xs text-muted-foreground w-8">{progress.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        targetStatus.includes("T3") ? "bg-profit/10 text-profit" :
                        targetStatus.includes("T2") ? "bg-profit/10 text-profit" :
                        targetStatus.includes("T1") ? "bg-primary/10 text-primary" :
                        "text-muted-foreground"
                      }`}>
                        {targetStatus}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${
                        slRisk.level === "safe" ? "text-profit" :
                        slRisk.level === "risk" ? "text-warning" :
                        "text-loss"
                      }`}>
                        {slRisk.emoji} {slRisk.label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Trade Strategy</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Ticker</Label>
                <Input value={editForm.ticker} onChange={e => updateField("ticker", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Entry Price (₹)</Label>
                <Input type="number" step="0.01" value={editForm.entryPrice} onChange={e => updateField("entryPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Target 1 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target1} onChange={e => updateField("target1", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 2 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target2} onChange={e => updateField("target2", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 3 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target3} onChange={e => updateField("target3", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stop Loss (₹)</Label>
                <Input type="number" step="0.01" value={editForm.stopLoss} onChange={e => updateField("stopLoss", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Trailing SL (₹)</Label>
                <Input type="number" step="0.01" value={editForm.trailingStopLoss} onChange={e => updateField("trailingStopLoss", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <Button type="submit" className="w-full mt-2">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold text-primary">{deleteTarget}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete {selected.size} Trades</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{selected.size}</span> selected trades? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TradeStrategyTable;
