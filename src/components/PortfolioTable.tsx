import { useState } from "react";
// Removed calcWeeklyGainLoss as requested
import { PortfolioStock, calcInvestedValue, calcProfitLoss, calcFinalValue } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportTradesDialog from "@/components/ImportTradesDialog";
import EditTransactionDialog from "@/components/EditTransactionDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// ✅ STEP 1: ADD LIVE PRICE HOOK IMPORT
import { useLivePrices } from "@/hooks/useLivePrices";

interface PortfolioTableProps {
  stocks: PortfolioStock[];
  onAdd: (stock: PortfolioStock) => void;
  onImport: (stocks: PortfolioStock[]) => void;
  onEdit: (originalTicker: string, updated: PortfolioStock) => void;
  onDelete: (ticker: string) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "Active") return <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 text-xs">🟢 Open</Badge>;
  if (status === "Sold Profit") return <Badge variant="outline" className="border-profit text-profit bg-profit/10 text-xs">✅ Closed</Badge>;
  return <Badge variant="outline" className="border-loss text-loss bg-loss/10 text-xs">❌ Closed</Badge>;
};

const PortfolioTable = ({ stocks, onAdd, onImport, onEdit, onDelete }: PortfolioTableProps) => {
  const [editingStock, setEditingStock] = useState<PortfolioStock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // ✅ STEP 1 (Cont): INITIALIZE LIVE PRICES
  const tickers = stocks.map(s => s.ticker);
  const { prices } = useLivePrices(tickers);

  const handleEdit = (stock: PortfolioStock) => {
    setEditingStock(stock);
    setEditOpen(true);
  };

  const handleSaveEdit = (updated: PortfolioStock) => {
    if (editingStock) {
      onEdit(editingStock.ticker, updated);
    }
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const toggleSelect = (ticker: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === stocks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(stocks.map(s => s.ticker)));
    }
  };

  const confirmBulkDelete = () => {
    selected.forEach(ticker => onDelete(ticker));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  return (
    <>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Portfolio Holdings</h2>
            <p className="text-xs text-muted-foreground mt-1">{stocks.length} positions tracked · All values in ₹ INR</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" className="gap-1.5 text-xs" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
              </Button>
            )}
            <ImportTradesDialog onImport={onImport} />
            <AddTransactionDialog onAdd={onAdd} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border text-xs">
                <TableHead className="w-10">
                  <Checkbox
                    checked={stocks.length > 0 && selected.size === stocks.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Stock Name</TableHead>
                <TableHead>Entry Date</TableHead>
                <TableHead className="text-right">Entry (₹)</TableHead>
                <TableHead className="text-right">Live CMP (₹)</TableHead>
                <TableHead className="text-right">52W High (₹)</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Invested (₹)</TableHead>
                <TableHead className="text-right">Day %</TableHead>
                <TableHead className="text-right">Exit (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total P&L (₹)</TableHead>
                <TableHead className="text-right">Final Value (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => {
                // ✅ STEP 2: CALCULATE LIVE DATA
                const live = prices[stock.ticker];
                const cmp = live?.price ?? stock.cmp;
                const changePct = live?.changePercent ?? 0;
                
                const invested = stock.entryPrice * stock.quantity;
                const currentValue = cmp * stock.quantity;
                const pl = currentValue - invested;

                return (
                  <TableRow key={stock.ticker} className={`border-border hover:bg-accent/50 ${selected.has(stock.ticker) ? "bg-accent/30" : ""}`}>
                    <TableCell className="w-10 p-2">
                      <Checkbox
                        checked={selected.has(stock.ticker)}
                        onCheckedChange={() => toggleSelect(stock.ticker)}
                      />
                    </TableCell>
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => handleEdit(stock)} className="gap-2 text-xs">
                            <Pencil className="h-3 w-3" /> Edit Transaction
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(stock.ticker)} className="gap-2 text-xs text-loss focus:text-loss">
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    
                    <TableCell className="font-mono font-semibold text-primary text-sm">{stock.ticker}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{stock.stockName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stock.entryDate}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.entryPrice.toFixed(1)}</TableCell>
                    
                    {/* ✅ LIVE CMP */}
                    <TableCell className="text-right font-mono text-sm">₹{cmp.toFixed(2)}</TableCell>
                    
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      ₹{live?.weekHigh52?.toFixed(1) ?? stock.weekHigh52.toFixed(1)}
                    </TableCell>
                    
                    <TableCell className="text-right font-mono text-sm">{stock.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{invested.toLocaleString("en-IN")}</TableCell>
                    
                    {/* ✅ DAILY % CHANGE */}
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-medium ${changePct >= 0 ? "text-profit" : "text-loss"}`}>
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                      </span>
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {stock.exitPrice ? `₹${stock.exitPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    
                    <TableCell><StatusBadge status={stock.status} /></TableCell>
                    
                    {/* ✅ LIVE P&L */}
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-medium ${pl >= 0 ? "text-profit" : "text-loss"}`}>
                        {pl >= 0 ? "+" : ""}₹{pl.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                      </span>
                    </TableCell>

                    {/* ✅ LIVE FINAL VALUE */}
                    <TableCell className="text-right font-mono text-sm">
                      ₹{currentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* DIALOGS REMAIN UNCHANGED FOR BREVITY */}
      <EditTransactionDialog stock={editingStock} open={editOpen} onOpenChange={setEditOpen} onSave={handleSaveEdit} />
      
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold text-primary">{deleteTarget}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Transactions</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-white">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PortfolioTable;