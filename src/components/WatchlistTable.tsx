import { WatchlistStock, getWatchlistStatus } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface WatchlistTableProps {
  watchlist: WatchlistStock[];
}

const WatchlistTable = ({ watchlist }: WatchlistTableProps) => {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Trade Setup Watchlist</h2>
        <p className="text-xs text-muted-foreground mt-1">Stocks being monitored for entry · Live CMP in ₹</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
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
                <TableRow key={stock.stockName} className="border-border hover:bg-accent/50">
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
  );
};

export default WatchlistTable;
