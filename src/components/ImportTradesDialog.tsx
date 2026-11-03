import { useMemo, useState, useRef, type ReactNode } from "react";
import { PortfolioStock, hasKnownCost } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, formatBytes } from "@/lib/importTrades";
import { parseRows } from "@/lib/portfolio/csvImport";
import { formatNative } from "@/lib/portfolio/display";
import { previewImportLifecycle, statementDiscrepancies } from "@/lib/portfolio/positions";
import { signedInr } from "@/lib/dashboard/format";
import {
  planBrokerImport,
  type BrokerImportHandler,
  type BrokerImportOutcome,
  type BrokerImportRequest,
  type BrokerImportSource,
} from "@/lib/portfolio/brokerImport";
import {
  applySearchSymbol,
  assignFingerprints,
  createIsinResolver,
  parseStatementSheets,
  resolveLots,
  toPortfolioStock,
  type ResolvedLot,
  type StatementBroker,
  type StatementLot,
  type StatementParseResult,
} from "@/lib/statementImport";

interface ImportTradesDialogProps {
  onImport: BrokerImportHandler;
  /** Current holdings; used only to preview what a broker re-import replaces. */
  existingStocks?: PortfolioStock[];
  /** Custom opener (rendered inside `DialogTrigger asChild`). Defaults to the standard button. */
  trigger?: ReactNode;
}

const SAMPLE_CSV = `Ticker,Stock Name,Entry Date,Entry Price,CMP,52W High,Quantity,Exit Price,Exit Date,Status
RELIANCE,Reliance Industries,10-Jan-2026,2450,2612.35,2856.15,15,,,Active
INFY,Infosys,12-Dec-2025,1890,1756.4,2012,20,1756.4,28-Feb-2026,Sold Loss`;

/** Broker statement lookups over the authed symbol-search endpoint. */
const MAX_SEARCH_LOOKUPS = 60;

const BROKER_LABEL: Record<StatementBroker, string> = { groww: "Groww", zerodha: "Zerodha" };
const SOURCE_LABEL: Record<BrokerImportSource | "manual", string> = {
  groww: "Groww",
  zerodha: "Zerodha",
  manual: "Manual / template",
};

const statusLabel = (status: PortfolioStock["status"]): string => {
  if (status === "Active") return "Open";
  if (status === "Sold Profit") return "Profit";
  if (status === "Sold Loss") return "Loss";
  return "Closed · P&L unavailable";
};

const ImportTradesDialog = ({ onImport, existingStocks = [], trigger }: ImportTradesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "statement" | "template">("idle");
  const [parsed, setParsed] = useState<StatementParseResult | null>(null);
  const [templateStocks, setTemplateStocks] = useState<PortfolioStock[]>([]);
  const [resolved, setResolved] = useState<ResolvedLot[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [source, setSource] = useState<StatementBroker | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setMode("idle");
    setParsed(null);
    setTemplateStocks([]);
    setResolved([]);
    setOverrides({});
    setSource(null);
    setErrors([]);
    setWarnings([]);
    setFileName("");
    setConfirmed(false);
    setBusy(false);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const applied = useMemo(
    () => resolved.map((row, index) =>
      overrides[index] ? applySearchSymbol(row, overrides[index]) : row,
    ),
    [resolved, overrides],
  );

  const preview = useMemo(() => {
    if (!parsed || !source) return [];
    const fingerprints = assignFingerprints(parsed.lots, source);
    const byLot = new Map<StatementLot, string>();
    parsed.lots.forEach((lot, index) => byLot.set(lot, fingerprints[index]));
    return applied
      .map((row) => toPortfolioStock(row, { source, fingerprint: byLot.get(row.lot) ?? "" }))
      .filter((stock): stock is PortfolioStock => stock !== null);
  }, [applied, parsed, source]);

  const request = useMemo<BrokerImportRequest | null>(() => {
    if (mode === "template") return { stocks: templateStocks };
    if (mode !== "statement" || !source || preview.length === 0) return null;
    return { source, stocks: preview, excluded: parsed?.exclusions.length ?? 0 };
  }, [mode, templateStocks, source, preview, parsed]);

  const plan = useMemo(
    () => (request ? planBrokerImport(existingStocks, request) : null),
    [request, existingStocks],
  );

  const existingSourceCount = useMemo(
    () => (source ? existingStocks.filter((stock) => stock.source === source).length : 0),
    [existingStocks, source],
  );
  const needsConfirmation = Boolean(source) && existingSourceCount > 0;

  const unresolvedRows = useMemo(
    () => resolved
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.symbol === null),
    [resolved],
  );

  const blockCount = parsed ? parsed.sheets.reduce((sum, sheet) => sum + sheet.blocks.length, 0) : 0;
  // Lifecycle counts are taken from the portfolio that would exist after the
  // import, using the same engine as the Portfolio dashboard — never from
  // statement age, and never by treating a closed row as active.
  const lifecycle = useMemo(
    () => (plan && !plan.error ? previewImportLifecycle(plan.nextStocks) : null),
    [plan],
  );

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
    setConfirmed(false);

    // Reject before reading: file.size is available without touching the bytes.
    if (file.size > MAX_IMPORT_BYTES) {
      reset();
      setFileName(file.name);
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

      const result: StatementParseResult = parseStatementSheets(sheets, { fileName: file.name });

      // The downloadable template is a plain portfolio CSV, not a broker
      // statement. Fall back to the template parser instead of rejecting it.
      // A sheet that produced a statement report stays a statement even when it
      // yielded no lots, so an unusable statement never turns into a template.
      if (result.lots.length === 0 && result.sheets.length === 0 && sheets[0]) {
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheets[0].name], {
          raw: false,
        });
        if (jsonData.length > MAX_IMPORT_ROWS) {
          reset();
          setFileName(file.name);
          setErrors([
            `File has ${jsonData.length.toLocaleString()} rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in parts.`,
          ]);
          return;
        }
        const { parsed: templateRows, errors: parseErrors } = parseRows(jsonData);
        setMode("template");
        setTemplateStocks(templateRows);
        setWarnings([]);
        // The template has no broker header by design, so the statement parser's
        // "no header found" error is only relevant when nothing parsed at all.
        setErrors(templateRows.length > 0
          ? parseErrors
          : [...result.errors, ...parseErrors].length > 0
            ? [...result.errors, ...parseErrors]
            : ["No valid rows found. Check your file format."]);
        return;
      }

      setMode("statement");
      setErrors(result.errors);
      setWarnings(result.warnings);
      if (result.lots.length > MAX_IMPORT_ROWS) {
        reset();
        setFileName(file.name);
        setErrors([
          `File has ${result.lots.length.toLocaleString()} statement rows; the limit is ${MAX_IMPORT_ROWS.toLocaleString()}. Split the file and import in parts.`,
        ]);
        return;
      }

      const resolver = createIsinResolver(isinModule);
      const initial = resolveLots(result.lots, resolver);
      const searched = await searchFallback(initial);
      setParsed(result);
      setResolved(initial);
      setOverrides(searched);
      setSource(result.broker === "unknown" ? null : result.broker);
    } catch (err) {
      reset();
      setFileName(file.name);
      setErrors([`Failed to read file: ${err instanceof Error ? err.message : "Unknown error"}`]);
    } finally {
      setBusy(false);
    }
  };

  const updateOverride = (index: number, raw: string) => {
    const next = { ...overrides };
    const value = raw.trim();
    if (value) next[index] = value.toUpperCase();
    else delete next[index];
    setOverrides(next);
  };

  const handleImport = async () => {
    if (!request || !plan || importing) return;
    if (plan.error) {
      toast({ title: "Import cancelled", description: plan.error, variant: "destructive" });
      return;
    }
    if (needsConfirmation && !confirmed) {
      toast({
        title: "Confirm the replacement",
        description: `Tick the box to replace your ${existingSourceCount} existing ${BROKER_LABEL[source!]} rows.`,
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    try {
      const outcome: BrokerImportOutcome = await onImport(request);
      if (!outcome.ok) {
        toast({
          title: "Import cancelled",
          description: outcome.message ?? "The statement could not be imported. Existing holdings were left unchanged.",
          variant: "destructive",
        });
        return;
      }
      const counts = [
        `${outcome.added} added`,
        outcome.replaced > 0 ? `${outcome.replaced} replaced` : null,
        outcome.retained > 0 ? `${outcome.retained} retained` : null,
        outcome.excluded > 0 ? `${outcome.excluded} excluded` : null,
      ].filter(Boolean).join(" · ");
      toast({
        title: outcome.persistenceError ? "Import saved on this device" : "Import complete",
        description: outcome.persistenceError
          ? `${counts}. Cloud sync failed: ${outcome.persistenceError}`
          : counts,
        variant: outcome.persistenceError ? "destructive" : "default",
      });
      reset();
      setOpen(false);
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Existing holdings were left unchanged.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
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

  const previewRows = mode === "template" ? templateStocks : preview;
  const openCount = previewRows.filter((stock) => stock.status === "Active").length;
  const closedCount = previewRows.length - openCount;
  const unknownCostCount = previewRows.filter((stock) => !hasKnownCost(stock)).length;
  const missingDateCount = previewRows.filter((stock) => !stock.entryDate).length;
  const closedWithoutPnl = previewRows.filter((stock) => stock.status === "Sold").length;
  const discrepancies = useMemo(
    () => (mode === "statement" && preview.length > 0 ? statementDiscrepancies(preview) : null),
    [mode, preview],
  );
  const canImport = Boolean(request && plan && !plan.error && (!needsConfirmation || confirmed));

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
            Upload a Groww or Zerodha P&amp;L statement (.csv/.xlsx), or the template CSV. A broker statement
            replaces only that broker&apos;s earlier rows — manual, INDmoney and other-broker holdings are kept.
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

          {/* Detected structure */}
          {mode === "statement" && parsed && (
            <div className="border border-border rounded-lg p-3 space-y-2" role="status">
              <p className="text-xs text-muted-foreground">
                Statement detected — sheet &ldquo;{parsed.sheets[0]?.sheetName}&rdquo;, header on row{" "}
                {parsed.sheets[0]?.headerRowNumber} · {blockCount} block{blockCount === 1 ? "" : "s"} ·{" "}
                {openCount} open / {closedCount} closed lots
              </p>
              {parsed.sheets.flatMap((sheet) => sheet.blocks.map((block, index) => (
                <p key={`${sheet.sheetName}-${block.headerRowNumber}`} className="text-[11px] text-muted-foreground">
                  {sheet.sheetName} · block {index + 1} · rows {block.headerRowNumber}
                  {block.endRowNumber ? `–${block.endRowNumber - 1}` : "+"} · {block.section} ·{" "}
                  {block.lots.length} lot{block.lots.length === 1 ? "" : "s"}
                  {block.exclusions.length > 0 ? ` · ${block.exclusions.length} excluded` : ""}
                </p>
              )))}
            </div>
          )}

          {/* Broker */}
          {mode === "statement" && parsed && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs text-foreground font-medium">Broker</p>
              <p className="text-[11px] text-muted-foreground">
                {parsed.broker === "unknown"
                  ? "The column layout did not identify the broker. Choose the broker this statement came from."
                  : `Detected ${BROKER_LABEL[parsed.broker]}. Change it if that is wrong.`}
                {parsed.brokerEvidence.length > 0 && ` Evidence: ${parsed.brokerEvidence.join("; ")}.`}
              </p>
              <div className="flex items-center gap-4">
                {(Object.keys(BROKER_LABEL) as StatementBroker[]).map((broker) => (
                  <label key={broker} className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="statement-broker"
                      value={broker}
                      checked={source === broker}
                      onChange={() => { setSource(broker); setConfirmed(false); }}
                    />
                    {BROKER_LABEL[broker]}
                  </label>
                ))}
              </div>
              {source && existingSourceCount > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {existingSourceCount} existing {BROKER_LABEL[source]} row{existingSourceCount === 1 ? "" : "s"} will be
                  compared against this statement. Rows absent from the new file are removed; other sources are untouched.
                </p>
              )}
            </div>
          )}

          {mode === "template" && templateStocks.length > 0 && (
            <p className="text-[11px] text-muted-foreground" role="status">
              Template CSV — rows are added to your portfolio. Nothing is deleted.
            </p>
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

          {/* Excluded statement rows */}
          {mode === "statement" && parsed && parsed.exclusions.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1" role="status">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                {parsed.exclusions.length} row{parsed.exclusions.length === 1 ? "" : "s"} in the statement cannot be imported
              </p>
              {parsed.exclusions.slice(0, 8).map((row) => (
                <p key={`${row.rowNumber}-${row.reason}`} className="text-[11px] text-amber-600 dark:text-amber-400">
                  Row {row.rowNumber} · {row.reason === "invalid-quantity" ? "invalid quantity" : "missing price"} — {row.detail}
                </p>
              ))}
              {parsed.exclusions.length > 8 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  …and {parsed.exclusions.length - 8} more.
                </p>
              )}
            </div>
          )}

          {/* Unresolved symbols */}
          {mode === "statement" && unresolvedRows.length > 0 && (
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
                    onChange={(event) => updateOverride(index, event.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* What the import will do */}
          {request && plan && !plan.error && previewRows.length > 0 && (
            <div className="border border-border rounded-lg p-3 space-y-1.5" role="status">
              <p className="text-xs text-foreground font-medium">Import summary</p>
              <p className="text-[11px] text-muted-foreground">
                {request.source ? `${SOURCE_LABEL[request.source]} statement` : "Template CSV"} ·{" "}
                {plan.added} added · {plan.replaced} replaced · {plan.retained} retained · {plan.excluded} excluded
              </p>
              {lifecycle && (
                <p className="text-[11px] text-muted-foreground">
                  Portfolio after import: {lifecycle.activePositions} active ·{" "}
                  {lifecycle.partialPositions} partially sold · {lifecycle.closedPositions} closed
                  {lifecycle.unvaluedPositions > 0 && ` · ${lifecycle.unvaluedPositions} historical-unvalued`}.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Home shows active holdings only.{" "}
                {closedCount > 0
                  ? `The ${closedCount} fully closed row${closedCount === 1 ? "" : "s"} in this import go to Portfolio history and do not change Home's value, holding count or P&L.`
                  : "Every row in this import stays open, so Home's active holdings include them."}
              </p>
              {(unknownCostCount > 0 || missingDateCount > 0 || closedWithoutPnl > 0) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {unknownCostCount > 0 && `${unknownCostCount} row${unknownCostCount === 1 ? " has" : "s have"} no purchase price; invested value and P&L stay unavailable for them. `}
                  {missingDateCount > 0 && `${missingDateCount} row${missingDateCount === 1 ? " has" : "s have"} no transaction date; the date is shown as unknown. `}
                  {closedWithoutPnl > 0 && `${closedWithoutPnl} closed row${closedWithoutPnl === 1 ? "" : "s"} cannot derive a realised result.`}
                </p>
              )}
              {discrepancies && discrepancies.differing.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {discrepancies.differing.length} closed row
                  {discrepancies.differing.length === 1 ? " reports" : "s report"} a P&amp;L that differs from the
                  computed result:{" "}
                  {discrepancies.differing.slice(0, 3).map((row) => (
                    <span key={row.ticker}>
                      {row.ticker} computed {signedInr(row.computed)} · reported {signedInr(row.reported)}
                      {discrepancies.differing.length > 3 ? "; " : ""}
                    </span>
                  ))}
                  {discrepancies.differing.length > 3 && `and ${discrepancies.differing.length - 3} more. `}
                  The computed result stays in use; nothing is overwritten.
                </p>
              )}
            </div>
          )}

          {plan?.error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3" role="alert">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{plan.error}</span>
              </div>
            </div>
          )}

          {/* Preview */}
          {previewRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-profit" />
                <span className="text-sm font-medium text-foreground">
                  {previewRows.length} trade{previewRows.length > 1 ? "s" : ""} ready to import
                </span>
              </div>
              <div className="border border-border rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="text-xs">Ticker</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Market</TableHead>
                      <TableHead className="text-xs">Entry date</TableHead>
                      <TableHead className="text-xs text-right">Entry</TableHead>
                      <TableHead className="text-xs text-right">CMP</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Exit</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((s, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="font-mono text-xs text-primary">{s.ticker}</TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">{s.stockName}</TableCell>
                        <TableCell className="text-xs font-mono">{s.market ?? "NSE"} · {s.currency ?? "INR"}</TableCell>
                        <TableCell className="font-mono text-xs" title={s.entryDate ? undefined : "Purchase date not in the statement"}>
                          {s.entryDate ?? <span className="text-muted-foreground">Unknown</span>}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono text-xs"
                          title={hasKnownCost(s) ? undefined : "Purchase price not in the statement"}
                        >
                          {hasKnownCost(s) ? formatNative(s.entryPrice, s.currency, 2) : <span className="text-muted-foreground">Unknown</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {s.cmp > 0 ? formatNative(s.cmp, s.currency, 2) : <span className="text-muted-foreground" title="No current price in the statement">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{s.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {s.exitPrice !== undefined ? formatNative(s.exitPrice, s.currency, 2) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                            {statusLabel(s.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {needsConfirmation && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                    aria-label="Confirm replacing this broker's previous rows"
                  />
                  <span>
                    Replace the {existingSourceCount} existing {BROKER_LABEL[source!]} row
                    {existingSourceCount === 1 ? "" : "s"}. Manual, INDmoney and other-broker holdings stay untouched.
                  </span>
                </label>
              )}

              <Button onClick={() => { void handleImport(); }} disabled={busy || importing || !canImport} className="w-full gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {importing ? "Importing…" : `Import ${previewRows.length} Trade${previewRows.length > 1 ? "s" : ""}`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportTradesDialog;
