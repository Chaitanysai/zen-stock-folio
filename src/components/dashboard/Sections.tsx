import { useState } from "react";
import { Brain, Eye, Layers, PieChart, Plus, Sparkles, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { WatchlistStock } from "@/data/sampleData";
import { formatStoredPrice } from "@/lib/dashboard/presentation";
import type { OverviewMetrics } from "@/lib/dashboard/overview";
import { compact, signedInr, stagger } from "@/lib/dashboard/format";
import MarketCandlestick from "@/components/MarketCandlestick";
import { EmptyState, Skel } from "./ui";
import type { ActiveTab } from "./nav";

// ─── Sector concentration ─────────────────────────────────────────────────────
export interface SectorSlice { sector: string; value: number; percentage: number }

export function SectorCard({ sectors, loading, goTo }: { sectors: SectorSlice[]; loading: boolean; goTo: (id: ActiveTab) => void }) {
  const top = sectors[0];
  const pct = top ? Math.round(top.percentage) : 0;
  return (
    <section className="zf-card zf-sector zf-lift zf-in" style={stagger(6)} aria-labelledby="zf-sector-title">
      <div className="zf-card-head">
        <div>
          <h2 className="zf-card-title" id="zf-sector-title">Sector concentration</h2>
          <p className="zf-card-sub">Share of invested value</p>
        </div>
        <span className="zf-chip-ico" aria-hidden="true"><PieChart /></span>
      </div>
      <div className="zf-card-body">
        {loading ? (
          <div aria-busy="true"><Skel w="40%" h={40} /><div style={{ height: 12 }} /><Skel w="100%" h={12} /></div>
        ) : !top ? (
          <p className="zf-empty">Sector weights appear once you hold at least one position.</p>
        ) : (
          <>
            <p className="zf-label">Largest sector: {top.sector}</p>
            <p className="zf-conc-val">{top.percentage.toFixed(0)}%</p>
            <div
              className="zf-progress"
              role="progressbar"
              aria-label={`${top.sector} share of invested value`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span style={{ width: `${Math.min(100, Math.max(2, top.percentage))}%` }} />
            </div>
            <div className="zf-prog-meta"><span>{compact(top.value)} invested</span><span>of 100%</span></div>
            <ul className="zf-sectors" aria-label="Top sectors">
              {sectors.slice(0, 5).map((s) => (
                <li key={s.sector}>
                  <span className="zf-sector-name">{s.sector}</span>
                  <span className="zf-sector-pct">{s.percentage.toFixed(1)}%</span>
                  <span className="zf-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, s.percentage)}%` }} /></span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="zf-link" onClick={() => goTo("sector")}>Sector details</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Watchlist tiles ──────────────────────────────────────────────────────────
interface WatchProps {
  watchlist: WatchlistStock[];
  loading: boolean;
  onRemove: (stockName: string) => void;
  goTo: (id: ActiveTab) => void;
}

export function WatchlistCard({ watchlist, loading, onRemove, goTo }: WatchProps) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <section className="zf-card zf-watch zf-in" style={stagger(9)} aria-labelledby="zf-wl-title">
      <div className="zf-card-head">
        <div>
          <h2 className="zf-card-title" id="zf-wl-title">Watchlist</h2>
          <p className="zf-card-sub">Entry zones from your own trade plans. Prices are the ones you saved.</p>
        </div>
        <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={() => goTo("watchlist")}>
          <Plus aria-hidden="true" /> {watchlist.length > 0 ? "Manage" : "Add symbol"}
        </button>
      </div>
      <div className="zf-card-body">
        {loading ? (
          <ul className="zf-wl" aria-busy="true">
            {[0, 1, 2].map((i) => <li key={i}><Skel w="100%" h={92} /></li>)}
          </ul>
        ) : watchlist.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="Nothing on your watchlist"
            actions={<button type="button" className="zf-btn zf-btn-primary" onClick={() => goTo("watchlist")}><Plus aria-hidden="true" /> Add a symbol</button>}
          >
            Write down the entry zone, stop-loss and targets for a stock you plan to buy, and it will be tracked here.
          </EmptyState>
        ) : (
          <ul className="zf-wl">
            {watchlist.map((w) => {
              const cmp = w.cmp ?? 0;
              const inZone = cmp >= w.entryZoneLow && cmp <= w.entryZoneHigh;
              return (
                <li key={w.stockName} className="zf-wl-tile">
                  <button type="button" className="zf-wl-open" onClick={() => goTo("watchlist")} aria-label={`${w.stockName}, open watchlist`}>
                    <span className="zf-wl-name">{w.stockName}</span>
                    <span className="zf-wl-zone">{`Entry ₹${w.entryZoneLow.toLocaleString("en-IN")}–${w.entryZoneHigh.toLocaleString("en-IN")}`}</span>
                    <span className="zf-wl-price">{formatStoredPrice(w.cmp)}</span>
                  </button>
                  <span className="zf-status" data-state={inZone ? "on" : "off"}><i aria-hidden="true" />{inZone ? "In entry zone" : "Outside zone"}</span>
                  <button type="button" className="zf-wl-rm" aria-label={`Remove ${w.stockName} from watchlist`} onClick={() => setPending(w.stockName)}>
                    <X aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pending} from your watchlist?</AlertDialogTitle>
            <AlertDialogDescription>Its entry zone, stop-loss and targets will be deleted. You can add it again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) onRemove(pending); setPending(null); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ─── Side cards: AI insights + F&O ────────────────────────────────────────────
export function InsightCard({ text, goTo }: { text: string; goTo: (id: ActiveTab) => void }) {
  return (
    <section className="zf-card zf-ai zf-lift zf-in" style={stagger(8)} aria-labelledby="zf-ai-title">
      <div className="zf-card-head">
        <h2 className="zf-card-title" id="zf-ai-title">AI insights</h2>
        <span className="zf-chip-ico zf-ai-ico" aria-hidden="true"><Sparkles /></span>
      </div>
      <div className="zf-card-body">
        <p className="zf-ai-text">{text}</p>
        <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={() => goTo("ai")}>
          <Brain aria-hidden="true" /> Open AI insights
        </button>
      </div>
    </section>
  );
}

export function FnoCard({ m, loading, openFno }: { m: OverviewMetrics; loading: boolean; openFno: () => void }) {
  const open = m.fnoOpen.length;
  const unrealised = m.fnoValue - m.fnoInvested;
  return (
    <section className="zf-card zf-fno zf-lift zf-in" style={stagger(9)} aria-labelledby="zf-fno-title">
      <div className="zf-card-head">
        <h2 className="zf-card-title" id="zf-fno-title">F&amp;O positions</h2>
        <span className="zf-chip-ico" aria-hidden="true"><Layers /></span>
      </div>
      <div className="zf-card-body">
        {loading ? <Skel w="100%" h={70} /> : open === 0 ? (
          <>
            <p className="zf-ai-text">No open futures or options. Contracts you add under Trades appear here with their P&amp;L.</p>
            <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={openFno}><Plus aria-hidden="true" /> Add F&amp;O trade</button>
          </>
        ) : (
          <>
            <dl className="zf-mini">
              <div><dt>Open</dt><dd>{open}</dd></div>
              <div><dt>Unrealised</dt><dd className={unrealised >= 0 ? "zf-up" : "zf-down"}>{signedInr(unrealised, compact)}</dd></div>
              <div><dt>Closed</dt><dd>{m.fnoClosed.length}</dd></div>
              <div><dt>Premium</dt><dd>{compact(m.fnoInvested)}</dd></div>
            </dl>
            <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={openFno}>Manage F&amp;O</button>
          </>
        )}
      </div>
    </section>
  );
}

// ─── Price chart ──────────────────────────────────────────────────────────────
type Range = "1d" | "5d" | "1mo";

interface ChartProps {
  tickers: string[];
  selected: string | null;
  onSelect: (ticker: string) => void;
  range: Range;
  onRange: (range: Range) => void;
  quote: { price: number; pct: number | null } | null;
}

export function PriceChartCard({ tickers, selected, onSelect, range, onRange, quote }: ChartProps) {
  return (
    <section className="zf-card zf-pricechart zf-in" style={stagger(8)} aria-labelledby="zf-chart-title">
      <div className="zf-card-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="zf-card-title" id="zf-chart-title">{selected ? `${selected} price` : "Price chart"}</h2>
          <p className="zf-card-sub">Candles from the market-data service</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {quote && (
            <div className="zf-quote">
              <b>₹{quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b>
              {quote.pct !== null && (
                <span className={quote.pct >= 0 ? "zf-up" : "zf-down"}>{quote.pct >= 0 ? "+" : "−"}{Math.abs(quote.pct).toFixed(2)}% today</span>
              )}
            </div>
          )}
          <div className="zf-seg" role="group" aria-label="Chart range">
            {(["1d", "5d", "1mo"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => onRange(r)}>{r}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="zf-card-body">
        {selected ? (
          <>
            <MarketCandlestick symbol={selected} range={range} height={250} />
            <div className="zf-chartbar" role="group" aria-label="Chart symbol">
              {tickers.slice(0, 10).map((t) => (
                <button key={t} type="button" className="zf-chipbtn" aria-pressed={selected === t} onClick={() => onSelect(t)}>{t}</button>
              ))}
            </div>
          </>
        ) : (
          <p className="zf-empty" style={{ minHeight: 250, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Add an open position to see its price chart.
          </p>
        )}
      </div>
    </section>
  );
}
