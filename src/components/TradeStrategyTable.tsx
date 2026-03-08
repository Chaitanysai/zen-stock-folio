import { tradeStrategies, calcPercentChange, getTargetStatus, getSLRiskIndicator, getProgressPercent } from "@/data/sampleData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

const TradeStrategyTable = () => {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Trade Strategy Tracker</h2>
        <p className="text-xs text-muted-foreground mt-1">Active trade setups with targets & stop losses</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="table-header">Ticker</TableHead>
              <TableHead className="table-header text-right">Entry ₹</TableHead>
              <TableHead className="table-header text-right">Live ₹</TableHead>
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
            {tradeStrategies.map((trade) => {
              const pctChange = calcPercentChange(trade.entryPrice, trade.livePrice);
              const targetStatus = getTargetStatus(trade);
              const slRisk = getSLRiskIndicator(trade);
              const progress = getProgressPercent(trade);
              return (
                <TableRow key={trade.ticker} className="border-border hover:bg-accent/50">
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
  );
};

export default TradeStrategyTable;
