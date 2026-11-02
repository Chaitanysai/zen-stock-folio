import { useState, useRef, type ReactNode } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, formatBytes } from "@/lib/importTrades";
import { parseRows } from "@/lib/portfolio/csvImport";
import { formatNative } from "@/lib/portfolio/display";
import {
  applySearchSymbol,
  createIsinResolver,
  parseStatementSheets,
  resolveLots,
  toPortfolioStock,
  type ResolvedLot,
  type StatementParseResult,
} from "@/lib/statementImport";

interface ImportTradesDialogProps {
  onImport: (stocks: PortfolioStock[]) => void;
  /** Custom opener (rendered inside `DialogTrigger asChild`). Defaults to the standard button. */
  trigger?: ReactNode;
}

const SAMPLE_CSV = `Ticker,Stock Name,Entry Date,Entry Price,CMP,52W High,Quantity,Exit Price,Exit Date,Status
RELIANCE,Reliance Industries,10-Jan-2026,2450,2612.35,2856.15,15,,,Active
INFY,Infosys,12-Dec-2025,1890,1756.4,2012,20,1756.4,28-Feb-2026,Sold Loss`;

/** Broker statement lookups over the authed symbol-search endpoint. */
const MAX_SEARCH_LOOKUPS = 60;
const ImportTradesDialog = ({ onImport, trigger }: ImportTradesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PortfolioStock[]>([]);
  const [resolved, setResolved] = useState<ResolvedLot[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setPreview([]);
    setResolved([]);
    setOverrides({});
    setSummary(null);
    setErrors([]);
    setWarnings([]);
    setFileName("");
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const rebuildPreview = (list: ResolvedLot[], overridesNow: Record<number, string>) => {
    const applied = list.map((row, index) =>
      overridesNow[index] ? applySearchSymbol(row, overridesNow[index]) : row,
    );
    setResolved(applied);
    setPreview(applied.map(toPortfolioStock).filter((stock): stock is PortfolioStock => stock !== null));
  };

  const searchFallback = async (list: ResolvedLot[]): Promise<Record<number, string>> => {
    const found: Record<number, string> = {};
    const candidates = list
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.source === "unresolved" && row.lot.stockName);
    for (const { row, index } of candidates.slice(0, MAX_SEARCH_LOOKUPS)) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(row.lot.stockName!.slice(0, 40))}&limit=3`);
        if (!response.ok) break;
        const body = (await response.json()) as { hits?: Array<{ symbol?: string; instrumentType?: string | null }> };
        const hit = (body.hits ?? []).find((entry) => entry.symbol && entry.instrumentType === "EQUITY");
        if (hit?.symbol) found[index] = hit.symbol;
      } catch {
        break;
      }
    }
    return found;
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

    setBusy(true);
    try {
      // xlsx is ~400 KB minified; load it only when a file is picked.
      const [XLSX, buffer, isinModule] = await Promise.all([
        import("xlsx"),
        file.arrayBuffer(),
        import("@/lib/market-data/nseIsinMap.json"),
      ]);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheets = workbook.SheetNames.map((name) => ({
        name,
        matrix: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
          header: 1,
          raw: false,
          defval: "",
          blankrows: false,
        }) as unknown[][],
      }));

      const result: StatementParseResult = parseStatementSheets(sheets);

      // The downloadable template is a plain portfolio CSV, not a broker
      // statement. Fall back to the template parser instead of rejecting it.
      if (result.lots.length === 0 && sheets[0]) {
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheets[0].name], {
          raw: false,
        });
        if (jsonData.length > MAX_IMPORT_ROWS) {
          setPreview([]);
          setErrors([
            `File has ${jsonData.length.toLocaleString()} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in parts.`,
          ]);
          return;
        }
        const { parsed, errors: parseErrors } = parseRows(jsonData);
        setPreview(parsed);
        setWarnings([]);
        setErrors(parsed.length === 0 && parseErrors.length === 0
          ? ["No valid rows found. Check your file format."]
          : [...result.errors, ...parseErrors]);
        return;
      }

      setErrors(result.errors);
      setWarnings(result.warnings);
      if (result.lots.length > MAX_IMPORT_ROWS) {
        setPreview([]);
        setErrors([
          `File has ${result.lots.length.toLocaleString()} statement rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in parts.`,
        ]);
        return;
      }

      const resolver = createIsinResolver(isinModule);
      const initial = resolveLots(result.lots, resolver);
      const searched = { ...overrides, ...(await searchFallback(initial)) };
      setOverrides(searched);

      const primary = result.sheets[0];
      setSummary(
        primary
          ? `Statement detected — sheet "${primary.sheetName}", header on row ${primary.headerRowNumber}, ` +
            `${result.lots.filter((lot) => !lot.closed).length} open / ${result.lots.filter((lot) => lot.closed).length} closed lots`
          : null,
      );
      rebuildPreview(initial, searched);
    } catch (err) {
      setErrors([`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`]);
      setPreview([]);
    } finally {
      setBusy(false);
    }
  };

  const unresolvedRows = resolved
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.symbol === null);

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
            Upload a broker P&L statement (.csv/.xlsx from Groww, Zerodha, Upstox, Dhan or INDmoney), or the template CSV.
            The header row is located automatically — banners above it are fine.
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

          {summary && (
            <p className="text-xs text-muted-foreground" role="status">{summary}</p>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
              {warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

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

          {/* Unresolved symbols */}
          {unresolvedRows.length > 0 && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {unresolvedRows.length} row{unresolvedRows.length > 1 ? "s" : ""} could not be matched to an NSE symbol
                (no ISIN or unique name match). Type the symbol to include them, or leave blank to skip.
              </p>
              {unresolvedRows.map(({ row, index }) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {row.lot.stockName ?? row.lot.isin ?? `Row ${index + 1}`}
                  </span>
                  <input
                    className="zf-input h-7 w-32 text-xs"
                    value={overrides[index] ?? ""}
                    placeholder="e.g. TATAMOTORS"
                    onChange={(event) => {
                      const next = { ...overrides };
                      const value = event.target.value.trim();
                      if (value) next[index] = value.toUpperCase();
                      else delete next[index];
                      setOverrides(next);
                      rebuildPreview(resolved, next);
                    }}
                  />
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
                      <TableHead className="text-xs text-right">Exit</TableHead>
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
                        <TableCell className="text-right font-mono text-xs">
                          {s.exitPrice !== undefined ? formatNative(s.exitPrice, s.currency, 2) : "—"}
                        </TableCell>
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
              <Button onClick={handleImport} disabled={busy} className="w-full gap-2">
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
