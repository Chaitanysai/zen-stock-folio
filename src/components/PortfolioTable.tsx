import { useState } from "react";
import { PortfolioStock, calcInvestedValue, calcProfitLoss, calcFinalValue, calcWeeklyGainLoss } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportTradesDialog from "@/components/ImportTradesDialog";
import EditTransactionDialog from "@/components/EditTransactionDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface PortfolioTableProps {
  stocks: PortfolioStock[];
  onAdd: (stock: PortfolioStock) => void;
  onEdit: (originalTicker: string, updated: PortfolioStock) => void;
  onDelete: (ticker: string) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "Active") return <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 text-xs">🟢 Open</Badge>;
  if (status === "Sold Profit") return <Badge variant="outline" className="border-profit text-profit bg-profit/10 text-xs">✅ Closed</Badge>;
  return <Badge variant="outline" className="border-loss text-loss bg-loss/10 text-xs">❌ Closed</Badge>;
};

const PLCell = ({ value }: { value: number }) => (
  <span className={`font-mono text-sm font-medium ${value >= 0 ? "text-profit" : "text-loss"}`}>
    {value >= 0 ? "+" : ""}₹{value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
  </span>
);

const PortfolioTable = ({ stocks, onAdd, onEdit, onDelete }: PortfolioTableProps) => {
  const [editingStock, setEditingStock] = useState<PortfolioStock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  return (
    <>
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Portfolio Holdings</h2>
            <p className="text-xs text-muted-foreground mt-1">{stocks.length} positions tracked · All values in ₹ INR</p>
          </div>
          <AddTransactionDialog onAdd={onAdd} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="table-header w-8"></TableHead>
                <TableHead className="table-header">Ticker</TableHead>
                <TableHead className="table-header">Stock Name</TableHead>
                <TableHead className="table-header">Entry Date</TableHead>
                <TableHead className="table-header text-right">Entry (₹)</TableHead>
                <TableHead className="table-header text-right">CMP (₹)</TableHead>
                <TableHead className="table-header text-right">52W High (₹)</TableHead>
                <TableHead className="table-header text-right">Qty</TableHead>
                <TableHead className="table-header text-right">Invested (₹)</TableHead>
                <TableHead className="table-header text-right">Gain %</TableHead>
                <TableHead className="table-header text-right">Exit (₹)</TableHead>
                <TableHead className="table-header">Status</TableHead>
                <TableHead className="table-header text-right">P&L (₹)</TableHead>
                <TableHead className="table-header text-right">Final Value (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => {
                const invested = calcInvestedValue(stock);
                const pl = calcProfitLoss(stock);
                const finalVal = calcFinalValue(stock);
                const gainPct = calcWeeklyGainLoss(stock);
                return (
                  <TableRow key={stock.ticker} className="border-border hover:bg-accent/50">
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-popover border-border">
                          <DropdownMenuItem onClick={() => handleEdit(stock)} className="gap-2 text-xs cursor-pointer">
                            <Pencil className="h-3 w-3" /> Edit Transaction
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(stock.ticker)} className="gap-2 text-xs text-loss cursor-pointer focus:text-loss">
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-primary text-sm">{stock.ticker}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{stock.stockName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{stock.entryDate}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.entryPrice.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.cmp.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">₹{stock.weekHigh52.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{stock.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-medium ${gainPct >= 0 ? "text-profit" : "text-loss"}`}>
                        {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {stock.exitPrice ? `₹${stock.exitPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={stock.status} /></TableCell>
                    <TableCell className="text-right"><PLCell value={pl} /></TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{finalVal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <EditTransactionDialog
        stock={editingStock}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSaveEdit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold text-primary">{deleteTarget}</span> from your portfolio? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PortfolioTable;
