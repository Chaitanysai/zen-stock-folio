import { useState } from "react";
import {
  PortfolioStock,
  calcInvestedValue,
} from "@/data/sampleData";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, TrendingUp, TrendingDown, Upload, Plus } from "lucide-react";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportTradesDialog from "@/components/ImportTradesDialog";
import EditTransactionDialog from "@/components/EditTransactionDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLivePrices } from "@/hooks/useLivePrices";

interface PortfolioTableProps {
  stocks: PortfolioStock[];
  onAdd: (stock: PortfolioStock) => void;
  onImport: (stocks: PortfolioStock[]) => void;
  onEdit: (originalTicker: string, updated: PortfolioStock) => void;
  onDelete: (ticker: string) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "Active")
    return (
      <Badge
        variant="outline"
        className="border-primary/30 text-primary bg-primary/8 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
      >
        Open
      </Badge>
    );
  if (status === "Sold Profit")
    return (
      <Badge
        variant="outline"
        className="border-profit/30 text-profit bg-profit/8 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
      >
        Closed ↑
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="border-loss/30 text-loss bg-loss/8 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
    >
      Closed ↓
    </Badge>
  );
};

const PortfolioTable = ({ stocks, onAdd, onImport, onEdit, onDelete }: PortfolioTableProps) => {
  const [editingStock, setEditingStock] = useState<PortfolioStock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const tickers = stocks.map((s) => s.ticker);
  const { prices } = useLivePrices(tickers);

  const handleEdit = (stock: PortfolioStock) => {
    setEditingStock(stock);
    setEditOpen(true);
  };

  const handleSaveEdit = (updated: PortfolioStock) => {
    if (editingStock) onEdit(editingStock.ticker, updated);
  };

  const confirmDelete = () => {
    if (deleteTarget) { onDelete(deleteTarget); setDeleteTarget(null); }
  };

  const toggleSelect = (ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(
      selected.size === stocks.length ? new Set() : new Set(stocks.map((s) => s.ticker))
    );
  };

  const confirmBulkDelete = () => {
    selected.forEach((ticker) => onDelete(ticker));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  return (
    <>
      <div className="glass-card overflow-hidden wc-ctnr">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Portfolio Holdings
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {stocks.length} positions · All values in ₹ INR
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5 text-xs font-mono"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3" />
                Delete {selected.size}
              </Button>
            )}
            <ImportTradesDialog onImport={onImport} />
            <AddTransactionDialog onAdd={onAdd} />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 pl-5">
                  <Checkbox
                    checked={stocks.length > 0 && selected.size === stocks.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Entry Date</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">LTP</TableHead>
                <TableHead className="text-right">52W High</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Invested</TableHead>
                <TableHead className="text-right">Day %</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right pr-5">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => {
                const live = prices[stock.ticker];
                const cmp = live?.price ?? stock.cmp;
                const changePct = live?.changePercent ?? 0;
                const invested = stock.entryPrice * stock.quantity;
                const currentValue = cmp * stock.quantity;
                const pl = currentValue - invested;
                const isPos = pl >= 0;

                return (
                  <TableRow
                    key={stock.ticker}
                    className={`border-border transition-colors ${
                      selected.has(stock.ticker) ? "bg-accent/50" : ""
                    }`}
                  >
                    <TableCell className="w-10 pl-5">
                      <Checkbox
                        checked={selected.has(stock.ticker)}
                        onCheckedChange={() => toggleSelect(stock.ticker)}
                      />
                    </TableCell>
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="text-xs">
                          <DropdownMenuItem onClick={() => handleEdit(stock)} className="gap-2 text-xs">
                            <Pencil className="h-3 w-3" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(stock.ticker)}
                            className="gap-2 text-xs text-loss focus:text-loss"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono font-bold text-primary text-[13px] tracking-tight">
                        {stock.ticker}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] text-foreground font-medium max-w-[150px] block truncate">
                        {stock.stockName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {stock.entryDate}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      ₹{stock.entryPrice.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] font-medium text-foreground">
                      ₹{cmp.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                      ₹{(live?.weekHigh52 ?? stock.weekHigh52).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      {stock.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      ₹{invested.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-mono text-[12px] font-semibold ${
                          changePct >= 0 ? "text-profit" : "text-loss"
                        }`}
                      >
                        {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                      {stock.exitPrice ? `₹${stock.exitPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={stock.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`font-mono text-[12px] font-semibold ${isPos ? "text-profit" : "text-loss"}`}>
                        {isPos ? "+" : "−"}₹{Math.abs(pl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground pr-5">
                      ₹{currentValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialogs */}
      <EditTransactionDialog
        stock={editingStock} open={editOpen}
        onOpenChange={setEditOpen} onSave={handleSaveEdit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete position</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-mono font-semibold text-primary">{deleteTarget}</span>{" "}
              from your portfolio? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} positions</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all selected positions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-white">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PortfolioTable;
