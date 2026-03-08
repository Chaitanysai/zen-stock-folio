import { PortfolioStock } from "@/data/sampleData";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";

interface ExportPortfolioProps {
  stocks: PortfolioStock[];
}

const ExportPortfolio = ({ stocks }: ExportPortfolioProps) => {
  const exportToExcel = () => {
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

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border" onClick={exportToCSV}>
        <Download className="h-3.5 w-3.5" /> Export CSV
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border" onClick={exportToExcel}>
        <Download className="h-3.5 w-3.5" /> Export XLSX
      </Button>
    </div>
  );
};

export default ExportPortfolio;
