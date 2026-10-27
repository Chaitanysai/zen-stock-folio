import { PortfolioStock } from "@/data/sampleData";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
interface ExportPortfolioProps {
  stocks: PortfolioStock[];
}

const ExportPortfolio = ({ stocks }: ExportPortfolioProps) => {
  const exportToExcel = async () => {
    // xlsx is ~400 KB minified; load it only when the user actually exports.
    const XLSX = await import("xlsx");
    const data = stocks.map(s => ({
      Ticker: s.ticker,
      "Stock Name": s.stockName,
      Sector: s.sector || "",
      "Entry Date": s.entryDate,
      "Entry Price": s.entryPrice,
      CMP: s.cmp,
      "52W High": s.weekHigh52,
      "52W Low": s.weekLow52 || "",
      Quantity: s.quantity,
      "Exit Price": s.exitPrice || "",
      "Exit Date": s.exitDate || "",
      Status: s.status,
      "Invested Value": s.entryPrice * s.quantity,
      "Current/Final Value": s.status === "Active" ? s.cmp * s.quantity : (s.exitPrice || s.cmp) * s.quantity,
      "P&L": s.status === "Active" ? (s.cmp - s.entryPrice) * s.quantity : ((s.exitPrice || s.cmp) - s.entryPrice) * s.quantity,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio");
    XLSX.writeFile(wb, `portfolio_export_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportToCSV = () => {
    const headers = ["Ticker", "Stock Name", "Sector", "Entry Date", "Entry Price", "CMP", "52W High", "Quantity", "Exit Price", "Exit Date", "Status"];
    const rows = stocks.map(s => [s.ticker, s.stockName, s.sector || "", s.entryDate, s.entryPrice, s.cmp, s.weekHigh52, s.quantity, s.exitPrice || "", s.exitDate || "", s.status]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = stocks.filter(s => s.status === "Active").length;

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="zf-export-title">
      <div className="zf-panel-head">
        <div>
          <h2 id="zf-export-title" className="zf-panel-title">Export portfolio</h2>
          <p className="zf-panel-sub">
            {stocks.length} positions · {active} open · {stocks.length - active} closed
          </p>
        </div>
      </div>
      {stocks.length === 0 ? (
        <div className="zf-empty-state">
          <div className="zf-empty-icon" aria-hidden="true"><Download /></div>
          <h3 className="zf-empty-title">Nothing to export yet</h3>
          <p className="zf-empty-body">Add positions to your portfolio, then download them here as CSV or XLSX.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">CSV</h3>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Plain text, opens anywhere. Core fields for each position.</p>
            <Button variant="outline" size="sm" className="mt-auto gap-1.5 self-start text-xs border-border" onClick={exportToCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Excel (XLSX)</h3>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Includes 52-week low, invested value, current value and P&amp;L.</p>
            <Button variant="outline" size="sm" className="mt-auto gap-1.5 self-start text-xs border-border" onClick={exportToExcel}>
              <Download className="h-3.5 w-3.5" /> Export XLSX
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ExportPortfolio;
