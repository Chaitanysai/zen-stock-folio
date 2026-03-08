import { portfolioData, calcInvestedValue, calcProfitLoss, calcFinalValue, calcWeeklyGainLoss } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "Active") return <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 text-xs">Active</Badge>;
  if (status === "Sold Profit") return <Badge variant="outline" className="border-profit text-profit bg-profit/10 text-xs">Sold ✓</Badge>;
  return <Badge variant="outline" className="border-loss text-loss bg-loss/10 text-xs">Sold ✗</Badge>;
};

const PLCell = ({ value }: { value: number }) => (
  <span className={`font-mono text-sm font-medium ${value >= 0 ? "text-profit" : "text-loss"}`}>
    {value >= 0 ? "+" : ""}₹{value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
  </span>
);

const PortfolioTable = () => {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Portfolio Holdings</h2>
        <p className="text-xs text-muted-foreground mt-1">{portfolioData.length} positions tracked</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="table-header">Ticker</TableHead>
              <TableHead className="table-header">Stock Name</TableHead>
              <TableHead className="table-header">Entry Date</TableHead>
              <TableHead className="table-header text-right">Entry ₹</TableHead>
              <TableHead className="table-header text-right">CMP</TableHead>
              <TableHead className="table-header text-right">52W High</TableHead>
              <TableHead className="table-header text-right">Qty</TableHead>
              <TableHead className="table-header text-right">Invested</TableHead>
              <TableHead className="table-header text-right">Gain %</TableHead>
              <TableHead className="table-header text-right">Exit ₹</TableHead>
              <TableHead className="table-header">Status</TableHead>
              <TableHead className="table-header text-right">P&L</TableHead>
              <TableHead className="table-header text-right">Final Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {portfolioData.map((stock) => {
              const invested = calcInvestedValue(stock);
              const pl = calcProfitLoss(stock);
              const finalVal = calcFinalValue(stock);
              const gainPct = calcWeeklyGainLoss(stock);
              return (
                <TableRow key={stock.ticker} className="border-border hover:bg-accent/50">
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
  );
};

export default PortfolioTable;
