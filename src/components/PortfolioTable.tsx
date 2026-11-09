import { useState } from "react";
import {
  PortfolioStock,
  calcInvestedValue,
  hasKnownCost,
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
import { MoreHorizontal, Pencil, Trash2, Wallet } from "lucide-react";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportTradesDialog from "@/components/ImportTradesDialog";
import EditTransactionDialog from "@/components/EditTransactionDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLivePrices } from "@/hooks/useLivePrices";
import type { BrokerImportHandler } from "@/lib/portfolio/brokerImport";
import { quoteFor, positionKey, currencyOf, isValidPrice, valueInr } from "@/lib/portfolio/valuation";
import { formatInr, formatNative, marketCode } from "@/lib/portfolio/display";
import type { Instrument } from "@/lib/market-data/types";

interface PortfolioTableProps {
  stocks: PortfolioStock[];
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  onEdit: (key: string, updated: PortfolioStock) => void;
  onDelete: (key: string) => void;
  /** Current USD→INR rate. `null` means a USD row's INR value is unavailable. */
  usdInr?: number | null;
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
  if (status === "Sold")
    return (
      <Badge
        variant="outline"
        className="border-border text-muted-foreground bg-muted/40 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
        title="Closed, but the statement had no cost or realised P&L"
      >
        Closed
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

const PortfolioTable = ({ stocks, onAdd, onImport, onEdit, onDelete, usdInr = null }: PortfolioTableProps) => {
  const [editingStock, setEditingStock] = useState<PortfolioStock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Selection and edit/delete identity are `market:ticker`, so a U.S. row and
  // an NSE row with the same ticker are two different positions.
  const instruments: Instrument[] = stocks.map((s) => ({
    market: s.market ?? "NSE",
    ticker: s.ticker,
  }));
  const { prices } = useLivePrices(instruments);
  const deleteTargetStock = deleteTarget
    ? stocks.find((s) => positionKey(s) === deleteTarget)
    : undefined;

  const handleEdit = (stock: PortfolioStock) => {
    setEditingStock(stock);
    setEditOpen(true);
  };

  const handleSaveEdit = (updated: PortfolioStock) => {
    if (editingStock) onEdit(positionKey(editingStock), updated);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(
      selected.size === stocks.length ? new Set() : new Set(stocks.map(positionKey))
    );
  };

  const confirmBulkDelete = () => {
    selected.forEach((key) => onDelete(key));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-b border-border sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Portfolio Holdings
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {stocks.length} positions · INR values · native prices
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <ImportTradesDialog onImport={onImport} existingStocks={stocks} />
            <AddTransactionDialog onAdd={onAdd} />
          </div>
        </div>

        {/* Table */}
        {stocks.length === 0 ? (
          <div className="zf-empty-state">
            <div className="zf-empty-icon" aria-hidden="true"><Wallet /></div>
            <h3 className="zf-empty-title">No positions yet</h3>
            <p className="zf-empty-body">
              Add a trade or import your history from a CSV or XLSX file. Live prices and P&amp;L show up here once you do.
            </p>
          </div>
        ) : (
        <div
          className="zf-wide-table-scroll"
          role="region"
          aria-label="Portfolio holdings table, scrolls sideways on small screens"
          tabIndex={0}
        >
          <Table className="zf-portfolio-holdings-table [font-variant-numeric:tabular-nums]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 pl-5">
                  <Checkbox
                    checked={stocks.length > 0 && selected.size === stocks.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all positions"
                  />
                </TableHead>
                <TableHead className="w-8" />
                <TableHead className="zf-sticky-col">Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="zf-col-entry-date">Entry Date</TableHead>
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
                const live = quoteFor(prices, stock);
                const cmp = live?.price ?? stock.cmp;
                const priced = isValidPrice(cmp);
                // Each row is priced and P&L'd in its own currency; only the
                // Value column is converted, and only when the rate is known.
                const currency = currencyOf(stock);
                const inrValue = valueInr(stock, cmp, usdInr);
                const changePct = live?.changePercent ?? null;
                const knownCost = hasKnownCost(stock);
                const invested = knownCost ? stock.entryPrice * stock.quantity : null;
                const currentValue = cmp * stock.quantity;
                const pl = invested === null ? null : currentValue - invested;
                const isPos = pl !== null && pl >= 0;

                return (
                  <TableRow
                    key={positionKey(stock)}
                    className={`border-border transition-colors ${
                      selected.has(positionKey(stock)) ? "bg-accent/50" : ""
                    }`}
                  >
                    <TableCell className="w-10 pl-5">
                      <Checkbox
                        checked={selected.has(positionKey(stock))}
                        onCheckedChange={() => toggleSelect(positionKey(stock))}
                        aria-label={`Select ${stock.ticker}`}
                      />
                    </TableCell>
                    <TableCell className="w-8 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions for ${stock.ticker}`}>
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="text-xs">
                          <DropdownMenuItem onClick={() => handleEdit(stock)} className="gap-2 text-xs">
                            <Pencil className="h-3 w-3" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(positionKey(stock))}
                            className="gap-2 text-xs text-loss focus:text-loss"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>

                    <TableCell className="zf-sticky-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{stock.ticker}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono">
                          {marketCode(stock)} · {currency}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-[13px] text-foreground font-medium max-w-[150px] block truncate">
                        {stock.stockName}
                      </span>
                    </TableCell>
                    <TableCell className="zf-col-entry-date">
                      <span className="text-[11px] text-muted-foreground font-mono" title={stock.entryDate ? undefined : "Purchase date not in the statement"}>
                        {stock.entryDate ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      {knownCost ? (
                        formatNative(stock.entryPrice, currency, 2)
                      ) : (
                        <span className="text-muted-foreground" title="Purchase price not in the statement">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] font-medium text-foreground">
                      {priced ? formatNative(cmp, currency, 2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                      {formatNative(live?.weekHigh52 ?? stock.weekHigh52, currency, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      {stock.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground">
                      {invested === null ? (
                        <span className="text-muted-foreground" title="Cost basis is unknown">—</span>
                      ) : (
                        formatNative(invested, currency, 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {changePct === null ? (
                        <span className="font-mono text-[12px] text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`font-mono text-[12px] font-semibold ${
                            changePct >= 0 ? "text-profit" : "text-loss"
                          }`}
                        >
                          {changePct >= 0 ? "+" : "−"}{Math.abs(changePct).toFixed(2)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-muted-foreground">
                      {stock.exitPrice ? formatNative(stock.exitPrice, currency, 2) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={stock.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {!priced || pl === null ? (
                        <div
                          className="text-right font-mono text-[12px] text-muted-foreground"
                          title={priced ? "P&L unavailable because cost basis is unknown" : "P&L unavailable without a market price"}
                        >
                          —
                        </div>
                      ) : (
                        <div className={`font-mono text-[12px] font-semibold ${isPos ? "text-profit" : "text-loss"}`}>
                          {isPos ? "+" : "−"}{formatNative(Math.abs(pl), currency, 0)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12px] text-foreground pr-5">
                      {inrValue === null || !priced
                        ? <span title={priced ? "USD→INR rate unavailable" : "No market price"}>—</span>
                        : formatInr(inrValue)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        )}
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
              <span className="font-mono font-semibold text-primary">{deleteTargetStock?.ticker ?? deleteTarget}</span>{" "}
              from your portfolio? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
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
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PortfolioTable;
