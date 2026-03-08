import { useState } from "react";
import { WatchlistStock, getWatchlistStatus } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface WatchlistTableProps {
  watchlist: WatchlistStock[];
  onEdit: (originalName: string, updated: WatchlistStock) => void;
  onDelete: (stockName: string) => void;
}

const WatchlistTable = ({ watchlist, onEdit, onDelete }: WatchlistTableProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<WatchlistStock | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const toggleSelect = (name: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };
  const toggleAll = () => {
    setSelected(prev => prev.size === watchlist.length ? new Set() : new Set(watchlist.map(w => w.stockName)));
  };
  const confirmBulkDelete = () => { selected.forEach(n => onDelete(n)); setSelected(new Set()); setBulkDeleteOpen(false); };
  const confirmDelete = () => { if (deleteTarget) { onDelete(deleteTarget); setDeleteTarget(null); } };

  const openEdit = (stock: WatchlistStock) => {
    setEditingStock(stock);
    setEditForm({
      stockName: stock.stockName,
      entryZoneLow: stock.entryZoneLow.toString(),
      entryZoneHigh: stock.entryZoneHigh.toString(),
      stopLoss: stock.stopLoss.toString(),
      target1: stock.target1.toString(),
      target2: stock.target2.toString(),
      target3: stock.target3.toString(),
      rsi: stock.rsi.toString(),
      sma50: stock.sma50.toString(),
      ema10: stock.ema10.toString(),
      ema21: stock.ema21.toString(),
    });
    setEditOpen(true);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    const updated: WatchlistStock = {
      stockName: editForm.stockName || editingStock.stockName,
      cmp: editingStock.cmp,
      entryZoneLow: parseFloat(editForm.entryZoneLow) || editingStock.entryZoneLow,
      entryZoneHigh: parseFloat(editForm.entryZoneHigh) || editingStock.entryZoneHigh,
      stopLoss: parseFloat(editForm.stopLoss) || editingStock.stopLoss,
      target1: parseFloat(editForm.target1) || editingStock.target1,
      target2: parseFloat(editForm.target2) || editingStock.target2,
      target3: parseFloat(editForm.target3) || editingStock.target3,
      rsi: parseFloat(editForm.rsi) || editingStock.rsi,
      sma50: parseFloat(editForm.sma50) || editingStock.sma50,
      ema10: parseFloat(editForm.ema10) || editingStock.ema10,
      ema21: parseFloat(editForm.ema21) || editingStock.ema21,
    };
    onEdit(editingStock.stockName, updated);
    setEditOpen(false);
  };

  const updateField = (field: string, value: string) => setEditForm(prev => ({ ...prev, [field]: value }));

  return (
    <>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Trade Setup Watchlist</h2>
            <p className="text-xs text-muted-foreground mt-1">Stocks being monitored for entry · Live CMP in ₹</p>
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
                  <Checkbox checked={watchlist.length > 0 && selected.size === watchlist.length} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="table-header w-8"></TableHead>
                <TableHead className="table-header">Stock</TableHead>
                <TableHead className="table-header text-right">CMP (₹)</TableHead>
                <TableHead className="table-header text-right">Entry Zone</TableHead>
                <TableHead className="table-header text-right">SL</TableHead>
                <TableHead className="table-header text-right">T1</TableHead>
                <TableHead className="table-header text-right">T2</TableHead>
                <TableHead className="table-header text-right">T3</TableHead>
                <TableHead className="table-header text-right">RSI</TableHead>
                <TableHead className="table-header text-right">SMA 50</TableHead>
                <TableHead className="table-header text-right">EMA 10/21</TableHead>
                <TableHead className="table-header">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {watchlist.map((stock) => {
                const status = getWatchlistStatus(stock);
                return (
                  <TableRow key={stock.stockName} className={`border-border hover:bg-accent/50 ${selected.has(stock.stockName) ? "bg-accent/30" : ""}`}>
                    <TableCell className="w-10 p-2">
                      <Checkbox checked={selected.has(stock.stockName)} onCheckedChange={() => toggleSelect(stock.stockName)} aria-label={`Select ${stock.stockName}`} />
                    </TableCell>
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-popover border-border">
                          <DropdownMenuItem onClick={() => openEdit(stock)} className="gap-2 text-xs cursor-pointer">
                            <Pencil className="h-3 w-3" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(stock.stockName)} className="gap-2 text-xs text-loss cursor-pointer focus:text-loss">
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-primary text-sm">{stock.stockName}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.cmp}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">₹{stock.entryZoneLow}–{stock.entryZoneHigh}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-loss">₹{stock.stopLoss}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.target1}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.target2}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.target3}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{stock.rsi.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{stock.sma50.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{stock.ema10} / {stock.ema21}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${
                        status.level === "entry" ? "text-profit" :
                        status.level === "target" ? "text-primary" :
                        status.level === "sl" ? "text-loss" :
                        "text-muted-foreground"
                      }`}>
                        {status.emoji} {status.label}
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
            <DialogTitle className="text-foreground">Edit Watchlist Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Stock Name</Label>
              <Input value={editForm.stockName} onChange={e => updateField("stockName", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Entry Zone Low (₹)</Label>
                <Input type="number" step="0.01" value={editForm.entryZoneLow} onChange={e => updateField("entryZoneLow", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Entry Zone High (₹)</Label>
                <Input type="number" step="0.01" value={editForm.entryZoneHigh} onChange={e => updateField("entryZoneHigh", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stop Loss (₹)</Label>
                <Input type="number" step="0.01" value={editForm.stopLoss} onChange={e => updateField("stopLoss", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 1 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target1} onChange={e => updateField("target1", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target 2 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target2} onChange={e => updateField("target2", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Target 3 (₹)</Label>
                <Input type="number" step="0.01" value={editForm.target3} onChange={e => updateField("target3", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">RSI</Label>
                <Input type="number" step="0.1" value={editForm.rsi} onChange={e => updateField("rsi", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">SMA 50</Label>
                <Input type="number" step="0.01" value={editForm.sma50} onChange={e => updateField("sma50", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">EMA 10</Label>
                <Input type="number" step="0.01" value={editForm.ema10} onChange={e => updateField("ema10", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">EMA 21</Label>
                <Input type="number" step="0.01" value={editForm.ema21} onChange={e => updateField("ema21", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
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
            <AlertDialogTitle className="text-foreground">Delete Watchlist Entry</AlertDialogTitle>
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
            <AlertDialogTitle className="text-foreground">Delete {selected.size} Entries</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{selected.size}</span> selected watchlist entries? This cannot be undone.
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

export default WatchlistTable;
