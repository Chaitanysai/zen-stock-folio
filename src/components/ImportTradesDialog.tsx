import { useState, useRef, type ReactNode } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBytes, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseRows, SAMPLE_CSV } from "@/lib/portfolio/csvImport";
import { formatNative } from "@/lib/portfolio/display";

interface ImportTradesDialogProps {
  onImport: (stocks: PortfolioStock[]) => void;
  /** Custom opener (rendered inside `DialogTrigger asChild`). Defaults to the standard button. */
  trigger?: ReactNode;
}

const ImportTradesDialog = ({ onImport, trigger }: ImportTradesDialogProps) => {
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

    // Reject before reading: file.size is available without touching the bytes.
    if (file.size > MAX_IMPORT_BYTES) {
      setPreview([]);
      setErrors([`File is too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_IMPORT_BYTES)}.`]);
      return;
    }

    try {
      // xlsx is ~400 KB minified; load it only when a file is picked.
      const [XLSX, buffer] = await Promise.all([import("xlsx"), file.arrayBuffer()]);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });

      if (jsonData.length > MAX_IMPORT_ROWS) {
        setPreview([]);
        setErrors([
          `File has ${jsonData.length.toLocaleString()} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in parts.`,
        ]);
        return;
      }
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
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border">
            <Upload className="h-3.5 w-3.5" /> Import CSV/XLSX
          </Button>
        )}
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
                      <TableHead className="text-xs">Market</TableHead>
                      <TableHead className="text-xs text-right">Entry</TableHead>
                      <TableHead className="text-xs text-right">CMP</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((s, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="font-mono text-xs text-primary">{s.ticker}</TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">{s.stockName}</TableCell>
                        <TableCell className="text-xs font-mono">{s.market ?? "NSE"} · {s.currency ?? "INR"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNative(s.entryPrice, s.currency, 2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNative(s.cmp, s.currency, 2)}</TableCell>
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
