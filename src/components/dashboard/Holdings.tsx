import { useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, ListFilter, Search, Wallet } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PortfolioStock } from "@/data/sampleData";
import {
  filterHoldings, sortHoldings, type HoldingFilter, type HoldingRow, type HoldingSortKey,
} from "@/lib/dashboard/overview";
import { inr, num2, sign, signedInr, signedPct, stagger } from "@/lib/dashboard/format";
import { AddTradeButton, EmptyState, ImportButton } from "./ui";
import { Skeleton } from "@/components/ui/skeleton";

const FILTER_LABEL: Record<HoldingFilter, string> = { all: "All holdings", gain: "In gain", loss: "In loss" };
const VISIBLE = 8;

interface Props {
  rows: HoldingRow[];
  loading: boolean;
  /** Selected position key (`market:ticker`), not a bare ticker. */
  selected: string | null;
  onSelect: (key: string) => void;
  openPortfolio: () => void;
  onAdd: (stock: PortfolioStock) => void;
  onImport: (stocks: PortfolioStock[]) => void;
  /** True when U.S. rows were converted so the columns read in one currency. */
  convertedToInr?: boolean;
  /** Shown when some positions could not be included in this INR view. */
  note?: string | null;
}

const COLUMNS: { key: HoldingSortKey; label: string; sortLabel: string }[] = [
  { key: "name", label: "Symbol", sortLabel: "symbol" },
  { key: "qty", label: "Qty", sortLabel: "quantity" },
  { key: "avg", label: "Avg", sortLabel: "average price" },
  { key: "ltp", label: "LTP", sortLabel: "last price" },
  { key: "value", label: "Value", sortLabel: "value" },
  { key: "pnl", label: "P&L", sortLabel: "profit and loss" },
  { key: "pnlPct", label: "P&L %", sortLabel: "profit and loss percent" },
];

export function HoldingsCard({
  rows, loading, selected, onSelect, openPortfolio, onAdd, onImport,
  convertedToInr = false, note = null,
}: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<HoldingFilter>("all");
  const [sortKey, setSortKey] = useState<HoldingSortKey>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(
    () => sortHoldings(filterHoldings(rows, query, mode), sortKey, dir),
    [rows, query, mode, sortKey, dir],
  );
  const shown = expanded ? visible : visible.slice(0, VISIBLE);
  const filtering = query.trim() !== "" || mode !== "all";

  const sortBy = (key: HoldingSortKey) => {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <section className="zf-card zf-holdings zf-in" style={stagger(7)} aria-labelledby="zf-holdings-title">
      <div className="zf-card-head">
        <div>
          <h2 className="zf-card-title" id="zf-holdings-title">Holdings</h2>
          <p className="zf-card-sub">
            Open equity positions at live prices{convertedToInr ? ", converted to INR" : ""}
          </p>
        </div>
        <div className="zf-tools">
          <label className="zf-searchpill">
            <Search aria-hidden="true" />
            <span className="zf-sr-only">Search holdings</span>
            <input
              type="search"
              placeholder="Search holdings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="zf-filterbtn" data-active={mode !== "all"} aria-label={`Filter holdings, showing ${FILTER_LABEL[mode].toLowerCase()}`}>
                <ListFilter aria-hidden="true" /> Filter
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as HoldingFilter)}>
                {(Object.keys(FILTER_LABEL) as HoldingFilter[]).map((k) => (
                  <DropdownMenuRadioItem key={k} value={k}>{FILTER_LABEL[k]}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {note && !loading && (
        <p className="zf-pnl-foot" role="status" style={{ color: "var(--amber)" }}>{note}</p>
      )}

      {loading ? (
        <div className="zf-card-body" aria-busy="true">
          <span className="zf-sr-only" role="status">Loading holdings</span>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid hsl(var(--border))" }}>
              <Skeleton width={36} height={36} radius={999} />
              <Skeleton width="40%" height={12} radius={4} />
              <Skeleton width="20%" height={12} radius={4} />
              <Skeleton width={72} height={14} radius={4} style={{ marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No open holdings yet"
          actions={<><AddTradeButton onAdd={onAdd} variant="primary" /><ImportButton onImport={onImport} /></>}
        >
          Add the trades you hold, or import them from a CSV or XLSX file, to see value and profit here.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No holdings match"
          actions={<button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={() => { setQuery(""); setMode("all"); }}>Clear search and filter</button>}
        >
          {query.trim() ? `Nothing matches “${query.trim()}”` : `No holdings are ${mode === "gain" ? "in gain" : "in loss"}`} right now.
        </EmptyState>
      ) : (
        <>
          <div className="zf-tablewrap" tabIndex={0} role="region" aria-label="Holdings table, scrolls sideways on small screens">
            <table className="zf-tbl">
              <caption className="zf-sr-only">
                Open holdings sorted by {COLUMNS.find((c) => c.key === sortKey)?.sortLabel}, {dir === "asc" ? "ascending" : "descending"}
              </caption>
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sortKey === c.key;
                    const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                        <button type="button" className="zf-th-btn" onClick={() => sortBy(c.key)} aria-label={`Sort by ${c.sortLabel}`}>
                          {c.label}<Icon aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col"><span className="zf-th-plain">Status</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const tone = r.pnl === null ? "flat" : Math.round(r.pnl) === 0 ? "flat" : r.pnl > 0 ? "up" : "down";
                  const cls = tone === "up" ? "zf-up" : tone === "down" ? "zf-down" : "";
                  return (
                    <tr key={r.key} data-selected={selected === r.key}>
                      <td>
                        <button
                          type="button"
                          className="zf-symbtn"
                          aria-pressed={selected === r.key}
                          aria-label={`${r.name}, show price chart`}
                          onClick={() => onSelect(r.key)}
                        >
                          <span className="zf-chip-ico" aria-hidden="true">{r.ticker.slice(0, 3)}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="zf-sym-name">{r.name}</span>
                            <span className="zf-sym-sub">{r.ticker} · {r.sector}</span>
                          </span>
                        </button>
                      </td>
                      <td>{r.qty.toLocaleString("en-IN")}</td>
                      <td>₹{num2(r.avg)}</td>
                      <td>{r.ltp === null ? "—" : `₹${num2(r.ltp)}`}</td>
                      <td>{r.value === null ? "—" : inr(r.value)}</td>
                      <td className={cls}>{r.pnl === null ? "—" : signedInr(r.pnl)}</td>
                      <td className={cls}>{r.pnlPct === null ? "—" : signedPct(r.pnlPct)}</td>
                      <td>
                        <span className="zf-state" data-tone={tone}>
                          <i aria-hidden="true" />
                          {r.pnl === null ? "No price" : tone === "up" ? "Gain" : tone === "down" ? "Loss" : "Flat"}
                          <span className="zf-sr-only"> {r.pnl === null ? "price unavailable" : sign(r.pnl)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="zf-tblfoot">
            <span aria-live="polite">
              Showing {shown.length} of {rows.length}{filtering ? ` (${visible.length} match)` : ""}
            </span>
            <span style={{ display: "flex", gap: 14 }}>
              {visible.length > VISIBLE && (
                <button type="button" className="zf-link" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Show fewer" : `Show all ${visible.length}`}
                </button>
              )}
              <button type="button" className="zf-link" onClick={openPortfolio}>Edit in Portfolio</button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}
