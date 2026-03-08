import { useState, useRef } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";

interface ImportTradesDialogProps {
  onImport: (stocks: PortfolioStock[]) => void;
}

const REQUIRED_FIELDS = ["ticker", "stockName", "entryPrice", "cmp", "quantity"];

const COLUMN_MAP: Record<string, string> = {
  ticker: "ticker",
  symbol: "ticker",
  stock_ticker: "ticker",
  stockname: "stockName",
  stock_name: "stockName",
  name: "stockName",
  "stock name": "stockName",
  entrydate: "entryDate",
  entry_date: "entryDate",
  "entry date": "entryDate",
  date: "entryDate",
  entryprice: "entryPrice",
  entry_price: "entryPrice",
  "entry price": "entryPrice",
  "buy price": "entryPrice",
  buyprice: "entryPrice",
  cmp: "cmp",
  "current price": "cmp",
  currentprice: "cmp",
  ltp: "cmp",
  weekhigh52: "weekHigh52",
  "52w high": "weekHigh52",
  "52 week high": "weekHigh52",
  quantity: "quantity",
  qty: "quantity",
  exitprice: "exitPrice",
  exit_price: "exitPrice",
  "exit price": "exitPrice",
  "sell price": "exitPrice",
  sellprice: "exitPrice",
  exitdate: "exitDate",
  exit_date: "exitDate",
  "exit date": "exitDate",
  status: "status",
};

function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/[^a-z0-9 _]/g, "");
  return COLUMN_MAP[key] || null;
}

function parseStatus(val: string | undefined): PortfolioStock["status"] {
  if (!val) return "Active";
  const v = val.toLowerCase().trim();
  if (v.includes("profit") || v === "sold profit") return "Sold Profit";
  if (v.includes("loss") || v === "sold loss") return "Sold Loss";
  if (v.includes("sold") || v.includes("closed") || v.includes("exit")) return "Sold Profit";
  return "Active";
}

function parseRows(data: Record<string, string>[]): { parsed: PortfolioStock[]; errors: string[] } {
  const parsed: PortfolioStock[] = [];
  const errors: string[] = [];

  if (data.length === 0) {
    errors.push("No data rows found in file");
    return { parsed, errors };
  }

  // Map headers
  const rawHeaders = Object.keys(data[0]);
  const headerMap: Record<string, string> = {};
  rawHeaders.forEach((h) => {
    const mapped = normalizeHeader(h);
    if (mapped) headerMap[h] = mapped;
  });

  const mappedFields = new Set(Object.values(headerMap));
  const missing = REQUIRED_FIELDS.filter((f) => !mappedFields.has(f));
  if (missing.length > 0) {
    errors.push(`Missing required columns: ${missing.join(", ")}. Found: ${rawHeaders.join(", ")}`);
    return { parsed, errors };
  }

  data.forEach((row, i) => {
    const mapped: Record<string, string> = {};
    Object.entries(headerMap).forEach(([raw, field]) => {
      mapped[field] = row[raw]?.toString().trim() || "";
    });

    if (!mapped.ticker || !mapped.entryPrice || !mapped.quantity) {
      errors.push(`Row ${i + 2}: Missing ticker, entry price, or quantity`);
      return;
    }

    const entryPrice = parseFloat(mapped.entryPrice);
    const cmp = parseFloat(mapped.cmp) || entryPrice;
    const quantity = parseInt(mapped.quantity);

    if (isNaN(entryPrice) || isNaN(quantity) || quantity <= 0) {
      errors.push(`Row ${i + 2}: Invalid price or quantity for ${mapped.ticker}`);
      return;
    }

    const stock: PortfolioStock = {
      ticker: mapped.ticker.toUpperCase(),
      stockName: mapped.stockName || mapped.ticker.toUpperCase(),
      entryDate: mapped.entryDate || new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      entryPrice,
      cmp,
      weekHigh52: parseFloat(mapped.weekHigh52) || cmp,
      quantity,
      status: parseStatus(mapped.status),
      ...(mapped.exitPrice ? { exitPrice: parseFloat(mapped.exitPrice) } : {}),
      ...(mapped.exitDate ? { exitDate: mapped.exitDate } : {}),
    };

    parsed.push(stock);
  });

  return { parsed, errors };
}

const SAMPLE_CSV = `Ticker,Stock Name,Entry Date,Entry Price,CMP,52W High,Quantity,Exit Price,Exit Date,Status
RELIANCE,Reliance Industries,10-Jan-2026,2450,2612.35,2856.15,15,,,Active
INFY,Infosys,12-Dec-2025,1890,1756.4,2012,20,1756.4,28-Feb-2026,Sold Loss`;

const ImportTradesDialog = ({ onImport }: ImportTradesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PortfolioStock[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setPreview([]);
    setErrors([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });

      const { parsed, errors: parseErrors } = parseRows(jsonData);
      setPreview(parsed);
      setErrors(parseErrors);

      if (parsed.length === 0 && parseErrors.length === 0) {
        setErrors(["No valid rows found. Check your file format."]);
      }
    } catch (err) {
      setErrors([`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`]);
      setPreview([]);
    }
  };

  const handleImport = () => {
    if (preview.length === 0) return;
    onImport(preview);
    toast({
      title: "Import successful",
      description: `${preview.length} trade${preview.length > 1 ? "s" : ""} imported to portfolio`,
    });
    reset();
    setOpen(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border">
          <Upload className="h-3.5 w-3.5" /> Import CSV/XLSX
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Import Past Trades
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Upload a .csv or .xlsx file with your trade history. Required columns: Ticker, Stock Name, Entry Price, CMP, Quantity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {fileName ? (
                <span className="text-foreground font-medium">{fileName}</span>
              ) : (
                <>Click to upload or drag & drop</>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supports .csv and .xlsx files</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
          </div>

          {/* Download template */}
          <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1.5 text-xs text-muted-foreground">
            <Download className="h-3.5 w-3.5" /> Download template CSV
          </Button>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
              {errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-profit" />
                <span className="text-sm font-medium text-foreground">
                  {preview.length} trade{preview.length > 1 ? "s" : ""} ready to import
                </span>
              </div>
              <div className="border border-border rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="text-xs">Ticker</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs text-right">Entry ₹</TableHead>
                      <TableHead className="text-xs text-right">CMP ₹</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((s, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="font-mono text-xs text-primary">{s.ticker}</TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">{s.stockName}</TableCell>
                        <TableCell className="text-right font-mono text-xs">₹{s.entryPrice}</TableCell>
                        <TableCell className="text-right font-mono text-xs">₹{s.cmp}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{s.quantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {s.status === "Active" ? "🟢 Open" : s.status === "Sold Profit" ? "✅ Profit" : "❌ Loss"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button onClick={handleImport} className="w-full gap-2">
                <CheckCircle2 className="h-4 w-4" /> Import {preview.length} Trade{preview.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportTradesDialog;
