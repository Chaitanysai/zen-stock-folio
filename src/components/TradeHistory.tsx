import { useState } from "react";
import { PortfolioStock, calcProfitLoss, calcHoldingDays } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

interface TradeHistoryProps {
  stocks: PortfolioStock[];
}

type FilterPeriod = "7d" | "30d" | "all";

const TradeHistory = ({ stocks }: TradeHistoryProps) => {
  const [filter, setFilter] = useState<FilterPeriod>("all");

  const closedTrades = stocks.filter(s => s.status !== "Active");

  const parseDate = (d: string) => {
    const parts = d.split("-");
    return new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
  };

  const filtered = closedTrades.filter(s => {
    if (filter === "all" || !s.exitDate) return true;
    const exitDate = parseDate(s.exitDate);
    const now = new Date();
    const diff = (now.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24);
    if (filter === "7d") return diff <= 7;
    if (filter === "30d") return diff <= 30;
    return true;
  });

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Trade History</h2>
            <p className="text-xs text-muted-foreground mt-1">{filtered.length} completed trades</p>
          </div>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "all"] as FilterPeriod[]).map(p => (
            <Button
              key={p}
              variant={filter === p ? "default" : "ghost"}
              size="sm"
              className="text-xs h-7 px-2.5"
              onClick={() => setFilter(p)}
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="table-header">Ticker</TableHead>
              <TableHead className="table-header">Stock Name</TableHead>
              <TableHead className="table-header text-right">Entry (₹)</TableHead>
              <TableHead className="table-header text-right">Exit (₹)</TableHead>
              <TableHead className="table-header text-right">Qty</TableHead>
              <TableHead className="table-header text-right">P&L (₹)</TableHead>
              <TableHead className="table-header text-right">P&L %</TableHead>
              <TableHead className="table-header text-right">Holding Days</TableHead>
              <TableHead className="table-header">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                  No completed trades in this period
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(stock => {
                const pl = calcProfitLoss(stock);
                const plPct = ((stock.exitPrice! - stock.entryPrice) / stock.entryPrice) * 100;
                const days = calcHoldingDays(stock.entryDate, stock.exitDate);
                return (
                  <TableRow key={stock.ticker} className="border-border hover:bg-accent/50">
                    <TableCell className="font-mono font-semibold text-primary text-sm">{stock.ticker}</TableCell>
                    <TableCell className="text-sm truncate max-w-[140px]">{stock.stockName}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.entryPrice.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">₹{stock.exitPrice?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{stock.quantity}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm font-medium ${pl >= 0 ? "text-profit" : "text-loss"}`}>
                        {pl >= 0 ? "+" : ""}₹{pl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-mono text-sm ${plPct >= 0 ? "text-profit" : "text-loss"}`}>
                        {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{days}d</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${pl >= 0 ? "border-profit text-profit bg-profit/10" : "border-loss text-loss bg-loss/10"}`}>
                        {pl >= 0 ? "✅ Profit" : "❌ Loss"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TradeHistory;
