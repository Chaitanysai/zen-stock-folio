import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Pencil, Search, Trash2, TriangleAlert, Wallet, X } from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import {
  filterPositions,
  positionFact,
  positionInrFactor,
  POSITION_STATUS_LABEL,
  positionTotalPnl,
  sortPositions,
  type Position,
  type PositionFilter,
  type PositionSortKey,
} from "@/lib/portfolio/positions";
import type { BrokerImportHandler } from "@/lib/portfolio/brokerImport";
import { formatInr, formatNative, type Currency } from "@/lib/portfolio/display";
import { signedInr } from "@/lib/dashboard/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EditTransactionDialog from "@/components/EditTransactionDialog";
import { AddTradeButton, EmptyState, ImportButton } from "./ui";

const PAGE_SIZE = 10;

const FILTERS: { value: PositionFilter; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "active", label: "Active" },
  { value: "partial", label: "Partially sold" },
  { value: "closed", label: "Closed" },
  { value: "unvalued", label: "Historical · unvalued" },
  { value: "realised-gain", label: "Realised gain" },
  { value: "realised-loss", label: "Realised loss" },
  { value: "unrealised-gain", label: "Unrealised gain" },
  { value: "unrealised-loss", label: "Unrealised loss" },
  { value: "unknown-cost", label: "Unknown cost" },
];

const statusTone: Record<Position["status"], string> = {
  active: "border-primary/30 text-primary bg-primary/8",
  partial: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/8",
  closed: "border-border text-muted-foreground bg-muted/40",
  unvalued: "border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10",
};

const lotStatusLabel = (stock: PortfolioStock): string => {
  if (stock.status === "Active") return "Open";
  if (stock.status === "Sold Profit") return "Sold · profit";
  if (stock.status === "Sold Loss") return "Sold · loss";
  return "Sold · result unavailable";
};

const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function SortHead({
  label, sortKey, sort, onSort, align = "left", className,
}: {
  label: string;
  sortKey: PositionSortKey;
  sort: { key: PositionSortKey; dir: "asc" | "desc" };
  onSort: (key: PositionSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const headClassName = [align === "right" ? "text-right" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <TableHead
      className={headClassName || undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={`zf-th-sort${active ? " is-active" : ""}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span aria-hidden="true">{active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </TableHead>
  );
}

interface PositionTableProps {
  /** The live rows, in stored order; a lot's index identifies its saved row. */
  stocks: PortfolioStock[];
  positions: Position[];
  usdInr: number | null;
  loading: boolean;
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  existingStocks?: PortfolioStock[];
  onEditLot: (index: number, updated: PortfolioStock) => void;
  onDeleteLot: (index: number) => void;
  /** Clears every account-owned collection so fresh imports start clean. */
  onResetAll: () => void;
}

export default function PositionTable({
  stocks, positions, usdInr, loading, onAdd, onImport, existingStocks = [], onEditLot, onDeleteLot, onResetAll,
}: PositionTableProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PositionFilter>("all");
  const [broker, setBroker] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: PositionSortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ index: number; stock: PortfolioStock } | null>(null);
  const [deleting, setDeleting] = useState<{ index: number; stock: PortfolioStock; ticker: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");

  const brokers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const position of positions) seen.set(position.source, position.sourceLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [positions]);

  const filtered = useMemo(
    () => sortPositions(
      filterPositions(positions, {
        query,
        filter,
        broker,
        from: from || null,
        to: to || null,
      }),
      sort.key,
      sort.dir,
    ),
    [positions, query, filter, broker, from, to, sort],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, filter, broker, from, to]);

  const toggleSort = (key: PositionSortKey) => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" ? "asc" : "desc" });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
    setBroker("all");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    const header = [
      "Ticker", "Name", "ISIN", "Market", "Currency", "Source", "Status",
      "Bought Qty", "Sold Qty", "Remaining Qty", "Avg Buy", "Avg Sell", "CMP",
      "Invested INR", "Market Value INR", "Realised INR", "Unrealised INR", "Total P&L INR",
      "Entry Date", "Exit Date",
    ];
    const rows = filtered.map((position) => {
      const factor = positionInrFactor(position, usdInr);
      const inr = (value: number | null) => {
        const converted = positionFact(value, factor);
        return converted === null ? "" : converted.toFixed(2);
      };
      const total = positionTotalPnl(position);
      return [
        position.ticker,
        position.name,
        position.isin ?? "",
        position.market,
        position.currency,
        position.sourceLabel,
        POSITION_STATUS_LABEL[position.status],
        position.boughtQty,
        position.soldQty,
        position.remainingQty,
        position.avgBuy?.toFixed(2) ?? "",
        position.avgSell?.toFixed(2) ?? "",
        position.price?.toFixed(2) ?? "",
        inr(position.invested),
        inr(position.marketValue),
        inr(position.realised),
        inr(position.unrealised),
        inr(total),
        position.firstEntryDate ?? "",
        position.lastExitDate ?? "",
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `portfolio-positions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="glass-card overflow-hidden zf-in" aria-labelledby="zf-positions-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground" id="zf-positions-title">
              Position history
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {positions.length} position{positions.length === 1 ? "" : "s"} · open and closed · INR totals, native prices
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <ImportButton onImport={onImport} existingStocks={existingStocks} />
            <AddTradeButton onAdd={onAdd} variant="primary" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-loss/40 text-loss hover:bg-loss/10 hover:text-loss"
              onClick={() => setResetOpen(true)}
            >
              <TriangleAlert className="h-3.5 w-3.5" /> Reset data
            </Button>
          </div>
        </div>

        <div className="zf-filters">
          <label className="zf-field zf-field-search">
            <span className="zf-field-label">Search</span>
            <span className="zf-search-wrap">
              <Search aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ticker, name, ISIN, sector"
                className="zf-input h-8 pl-8 text-xs"
              />
            </span>
          </label>
          <div className="zf-field">
            <span className="zf-field-label">Status</span>
            <Select value={filter} onValueChange={(value) => setFilter(value as PositionFilter)}>
              <SelectTrigger className="zf-select" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-52">
                {FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="zf-field">
            <span className="zf-field-label">Broker / source</span>
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger className="zf-select" aria-label="Broker / source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-52">
                <SelectItem value="all">All sources</SelectItem>
                {brokers.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="zf-field">
            <span className="zf-field-label">From</span>
            <input type="date" className="zf-input h-8 text-xs" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="zf-field">
            <span className="zf-field-label">To</span>
            <input type="date" className="zf-input h-8 text-xs" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={resetFilters}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        </div>

        {loading ? (
          <div className="zf-table-status" role="status">Loading positions…</div>
        ) : positions.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              icon={Wallet}
              title="No positions yet"
              actions={<><AddTradeButton onAdd={onAdd} variant="primary" /><ImportButton onImport={onImport} existingStocks={existingStocks} /></>}
            >
              Add a trade or import a Groww or Zerodha statement. Closed and historical rows stay here even after the position is sold.
            </EmptyState>
          </div>
        ) : filtered.length === 0 ? (
          <div className="zf-table-status" role="status">
            No position matches these filters.{" "}
            <button type="button" className="zf-link" onClick={resetFilters}>Clear filters</button>
          </div>
        ) : (
          <>
            <div
              className="zf-wide-table-scroll"
              role="region"
              aria-label="Position history table, scrolls sideways on small screens"
              tabIndex={0}
            >
              <Table className="zf-position-table [font-variant-numeric:tabular-nums]">
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead className="zf-position-key zf-sticky-col">Position</TableHead>
                    <TableHead className="zf-col-source">Source</TableHead>
                    <SortHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    <SortHead label="Bought" sortKey="qty" sort={sort} onSort={toggleSort} align="right" />
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                    <SortHead label="Avg buy" sortKey="avgBuy" sort={sort} onSort={toggleSort} align="right" />
                    <TableHead className="text-right">Avg sell</TableHead>
                    <SortHead label="CMP" sortKey="price" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Invested" sortKey="invested" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Market value" sortKey="value" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Realised" sortKey="realised" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Unrealised" sortKey="unrealised" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Total P&L" sortKey="total" sort={sort} onSort={toggleSort} align="right" />
                    <SortHead label="Entry" sortKey="entry" sort={sort} onSort={toggleSort} className="zf-col-date" />
                    <SortHead label="Exit" sortKey="exit" sort={sort} onSort={toggleSort} className="zf-col-date" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((position) => {
                    const factor = positionInrFactor(position, usdInr);
                    const currency: Currency = position.currency;
                    const total = positionTotalPnl(position);
                    const realised = positionFact(position.realised, factor);
                    const unrealised = positionFact(position.unrealised, factor);
                    const totalInr = positionFact(total, factor);
                    const marketValue = positionFact(position.marketValue, factor);
                    const invested = positionFact(position.invested, factor);
                    const isOpen = expanded.has(position.key);
                    const detailId = `zf-detail-${position.key.replace(/[^a-z0-9]/gi, "-")}`;
                    return (
                      <PositionRow
                        key={position.key}
                        position={position}
                        detailId={detailId}
                        expanded={isOpen}
                        onToggle={() => toggleExpanded(position.key)}
                        currency={currency}
                        invested={invested}
                        marketValue={marketValue}
                        realised={realised}
                        unrealised={unrealised}
                        totalInr={totalInr}
                        stocks={stocks}
                        usdInr={usdInr}
                        onEdit={(index, stock) => setEditing({ index, stock })}
                        onDelete={(index, stock) => setDeleting({ index, stock, ticker: stock.ticker })}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="zf-table-foot">
              <span>
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
                {filtered.length !== positions.length ? ` (filtered from ${positions.length})` : ""}
              </span>
              <div className="zf-pager">
                <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
                <span>Page {safePage} of {pageCount}</span>
                <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <EditTransactionDialog
        stock={editing?.stock ?? null}
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSave={(updated) => {
          if (editing) onEditLot(editing.index, updated);
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the {deleting?.stock.entryDate ? `${deleting.stock.entryDate} ` : ""}transaction for{" "}
              <span className="font-mono font-semibold text-primary">{deleting?.ticker ?? ""}</span> from your portfolio?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (deleting) onDeleteLot(deleting.index); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetPhrase("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-loss" aria-hidden="true" />
              Reset all account data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes everything recorded in this account so you can import fresh statements.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div role="note" className="rounded-lg border border-loss/40 bg-loss/10 p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-loss">
              This cannot be undone
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-foreground">
              <li>
                <span className="font-mono font-semibold">{stocks.length}</span> recorded transaction
                {stocks.length === 1 ? "" : "s"} — manual and imported, open and closed
              </li>
              <li>Every journal trade and F&amp;O trade</li>
              <li>Every watchlist entry and price alert</li>
              <li>Every imported broker fill</li>
            </ul>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Your broker connection and downloaded Excel files are untouched, so you can re-import straight away.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zf-reset-phrase" className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">RESET</span> to confirm
            </Label>
            <Input
              id="zf-reset-phrase"
              value={resetPhrase}
              onChange={(event) => setResetPhrase(event.target.value)}
              placeholder="RESET"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="bg-secondary border-border font-mono text-sm"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              // The default alert-action classes paint the primary gradient over
              // the destructive fill; clear it so the confirm stays red.
              style={{ backgroundImage: "none" }}
              disabled={resetPhrase !== "RESET"}
              onClick={onResetAll}
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PositionRow({
  position, detailId, expanded, onToggle, currency,
  invested, marketValue, realised, unrealised, totalInr,
  stocks, usdInr, onEdit, onDelete,
}: {
  position: Position;
  detailId: string;
  expanded: boolean;
  onToggle: () => void;
  currency: Currency;
  invested: number | null;
  marketValue: number | null;
  realised: number | null;
  unrealised: number | null;
  totalInr: number | null;
  stocks: PortfolioStock[];
  usdInr: number | null;
  onEdit: (index: number, stock: PortfolioStock) => void;
  onDelete: (index: number, stock: PortfolioStock) => void;
}) {
  const factor = positionInrFactor(position, usdInr);
  const tone = (value: number | null) => value === null ? "" : value >= 0 ? "text-profit" : "text-loss";
  const money = (value: number | null) => value === null ? "—" : formatInr(value);
  const signed = (value: number | null) => value === null ? "—" : signedInr(value);

  return (
    <>
      <TableRow className="border-border align-top">
        <TableCell className="p-2">
          <button
            type="button"
            className="zf-row-toggle"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? "Hide" : "Show"} transaction details for ${position.ticker}`}
            onClick={onToggle}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        </TableCell>
        <TableCell className="zf-position-key zf-sticky-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{position.ticker}</span>
            <span className="shrink-0 whitespace-nowrap rounded border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
              {position.market} · {position.currency}
            </span>
          </div>
          <span className="block max-w-[190px] truncate text-[12px] text-muted-foreground">{position.name}</span>
          {position.isin && <span className="block font-mono text-[10px] text-muted-foreground/80">{position.isin}</span>}
        </TableCell>
        <TableCell className="zf-col-source text-[12px] text-muted-foreground">{position.sourceLabel}</TableCell>
        <TableCell>
          <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusTone[position.status]}`}>
            {POSITION_STATUS_LABEL[position.status]}
          </span>
        </TableCell>
        <TableCell className="text-right font-mono text-[12px]">{position.boughtQty}</TableCell>
        <TableCell className="text-right font-mono text-[12px]">{position.soldQty || "—"}</TableCell>
        <TableCell className="text-right font-mono text-[12px]">{position.remainingQty || "—"}</TableCell>
        <TableCell className="text-right font-mono text-[12px]">{formatNative(position.avgBuy, currency, 2)}</TableCell>
        <TableCell className="text-right font-mono text-[12px]">{formatNative(position.avgSell, currency, 2)}</TableCell>
        <TableCell className="text-right font-mono text-[12px]">{formatNative(position.price, currency, 2)}</TableCell>
        <TableCell className="text-right font-mono text-[12px]" title={position.investedUnknownLots > 0 ? `Excludes ${position.investedUnknownLots} lot(s) with no recorded cost` : undefined}>
          {invested === null ? "—" : money(invested)}
          {position.investedUnknownLots > 0 && <sup aria-hidden="true">*</sup>}
        </TableCell>
        <TableCell className="text-right font-mono text-[12px]">
          {position.remainingQty === 0 ? "—" : money(marketValue)}
        </TableCell>
        <TableCell className={`text-right font-mono text-[12px] ${tone(realised)}`} title={position.realised === null && position.soldQty > 0 ? "Realised result unavailable" : undefined}>
          {signed(realised)}
        </TableCell>
        <TableCell className={`text-right font-mono text-[12px] ${tone(unrealised)}`} title={position.remainingQty > 0 && position.unrealised === null ? "Unrealised result unavailable" : undefined}>
          {position.remainingQty === 0 ? "—" : signed(unrealised)}
        </TableCell>
        <TableCell className={`text-right font-mono text-[12px] font-semibold ${tone(totalInr)}`}>
          {signed(totalInr)}
        </TableCell>
        <TableCell className="zf-col-date font-mono text-[11px] text-muted-foreground">{position.firstEntryDate ?? "—"}</TableCell>
        <TableCell className="zf-col-date font-mono text-[11px] text-muted-foreground">{position.lastExitDate ?? "—"}</TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="border-border bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={17} className="p-0" id={detailId}>
            <div className="zf-lots">
              <p className="zf-lots-title">
                {position.lots.length} recorded transaction{position.lots.length === 1 ? "" : "s"} ·{" "}
                {position.realisedUnknownLots > 0 && `${position.realisedUnknownLots} sold without a derivable result · `}
                {position.investedUnknownLots > 0 && `${position.investedUnknownLots} without a recorded cost`}
                {position.realisedUnknownLots === 0 && position.investedUnknownLots === 0 && "all values derived from stored cost and prices"}
              </p>
              <div
                className="zf-wide-table-scroll zf-lot-table-scroll"
                role="region"
                aria-label={`Transactions for ${position.ticker}, scrolls sideways on small screens`}
                tabIndex={0}
              >
                <Table className="zf-lot-table">
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead>Transaction</TableHead>
                      <TableHead>Entry date</TableHead>
                      <TableHead className="text-right">Entry price</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Exit date</TableHead>
                      <TableHead className="text-right">Exit price</TableHead>
                      <TableHead className="text-right">Result</TableHead>
                      <TableHead>Statement</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {position.lots.map((lot, index) => {
                      const stock = lot.stock;
                      const stockIndex = stocks.indexOf(stock);
                      const result = positionFact(lot.realised, factor);
                      return (
                        <TableRow key={`${stock.statementFingerprint ?? "lot"}-${index}`} className="border-border">
                          <TableCell>
                            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px]">
                              {lotStatusLabel(stock)}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">{stock.entryDate ?? <span className="text-muted-foreground">Unknown</span>}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{formatNative(stock.entryPrice, currency, 2)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{stock.quantity}</TableCell>
                          <TableCell className="font-mono text-[11px]">{stock.exitDate ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{formatNative(stock.exitPrice, currency, 2)}</TableCell>
                          <TableCell className={`text-right font-mono text-[11px] ${tone(result)}`}>
                            {result === null ? "—" : signedInr(result)}
                            {lot.realisedBasis === "reported" && <span className="ml-1 text-[9px] text-muted-foreground">reported</span>}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate font-mono text-[10px] text-muted-foreground" title={stock.statementFingerprint}>
                            {stock.statementFingerprint ? stock.statementFingerprint.slice(0, 18) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                aria-label={`Edit ${stock.ticker} transaction`}
                                disabled={stockIndex < 0}
                                onClick={() => onEdit(stockIndex, stock)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-loss"
                                aria-label={`Delete ${stock.ticker} transaction`}
                                disabled={stockIndex < 0}
                                onClick={() => onDelete(stockIndex, stock)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
