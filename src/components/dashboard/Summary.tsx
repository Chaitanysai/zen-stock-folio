import { lazy, Suspense, type ReactNode } from "react";
import { Award, BarChart3, Eye, Layers, Wallet, TrendingUp, Zap } from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerImportHandler } from "@/lib/portfolio/brokerImport";
import type { DayMover, DayMovers, MonthBucket, OverviewMetrics } from "@/lib/dashboard/overview";
import { compact, inr, signedInr, signedPct, stagger, toneOf } from "@/lib/dashboard/format";
import { AddTradeButton, DeltaPill, EmptyState, ImportButton } from "./ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActiveTab } from "./nav";

// recharts is only needed once there is something to plot.
const PnlChart = lazy(() => import("./PnlChart"));

interface BalanceProps {
  loading: boolean;
  m: OverviewMetrics;
  watchCount: number;
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  /** Existing holdings, used to preview broker replacement counts. */
  existingStocks?: PortfolioStock[];
  goTo: (id: ActiveTab) => void;
  openFno: () => void;
  /** INR P&L from USD→INR movement, reported separately from price P&L. */
  fxPnl?: number | null;
  /** True when some USD lots have no rate at cost, so the FX figure is partial. */
  fxEstimated?: boolean;
  /** "cached FX" / "unverified FX" when the rate was not a live quote. */
  fxNote?: string | null;
}

export function BalanceCard({
  loading, m, watchCount, onAdd, onImport, existingStocks = [], goTo, openFno,
  fxPnl = null, fxEstimated = false, fxNote = null,
}: BalanceProps) {
  const hasEquity = m.pricedCount > 0;
  const hasFno = m.fnoOpen.length > 0;
  return (
    <article className="zf-card zf-balance zf-in" style={stagger(0)} aria-labelledby="zf-balance-label">
      <div className="zf-balance-top">
        <span className="zf-label" id="zf-balance-label">Portfolio value</span>
        <span className="zf-chip" title="All values are in Indian rupees">INR · ₹</span>
      </div>

      <div className="zf-balance-val">{loading ? <Skeleton width="68%" height={44} radius={10} /> : inr(m.current)}</div>

      <div className="zf-balance-delta">
        {loading ? (
          <Skeleton width={150} height={24} radius={999} />
        ) : m.dayMovePct !== null ? (
          <>
            <DeltaPill tone={toneOf(m.dayMove)}>{signedPct(m.dayMovePct)}</DeltaPill>
            <span className="zf-delta-cap">today ({signedInr(m.dayMove)})</span>
          </>
        ) : (
          <span className="zf-delta-cap">Day change appears once live quotes load</span>
        )}
        {!loading && fxPnl !== null && (
          <span className="zf-delta-cap" title="USD→INR movement, separate from price P&L">
            FX {signedInr(fxPnl)}{fxEstimated ? " est." : ""}{fxNote ? ` · ${fxNote}` : ""}
          </span>
        )}
      </div>
      <div className="zf-balance-note">
        {loading ? <Skeleton width="80%" height={14} radius={4} /> : m.invested > 0
          ? <>Unrealised {signedInr(m.pnl)} ({signedPct(m.pnlPct)}) on {inr(m.invested)} invested</>
          : m.fxIncomplete
            ? "INR totals are unavailable until the USD→INR rate loads."
            : "Nothing invested yet"}
      </div>

      {!loading && (m.fxIncomplete || m.unpricedCount > 0) && (
        <div role="status">
          {m.fxIncomplete && (
            <p className="zf-balance-note" style={{ color: "var(--amber)" }}>
              U.S. holdings are excluded from INR totals until the USD→INR rate is available.
            </p>
          )}
          {m.unpricedCount > 0 && (
            <p className="zf-balance-note" style={{ color: "var(--amber)" }}>
              {m.unpricedCount} open position{m.unpricedCount === 1 ? "" : "s"}{" "}
              {m.unpricedCount === 1 ? "has" : "have"} no market price and{" "}
              {m.unpricedCount === 1 ? "is" : "are"} excluded from value, cost and P&amp;L.
            </p>
          )}
        </div>
      )}

      <div className="zf-balance-actions">
        <AddTradeButton onAdd={onAdd} variant="primary" />
        <ImportButton onImport={onImport} existingStocks={existingStocks} variant="outline" />
      </div>

      <div className="zf-inset" role="group" aria-label="Asset mix">
        <div className="zf-inset-head">
          <b>Asset mix</b>
          <span>3 sources</span>
        </div>
        <div className="zf-tiles">
          <button type="button" className="zf-tile" onClick={() => goTo("holdings")} aria-label={`Equity: ${hasEquity ? `${compact(m.equityValue)} across ${m.active.length} holdings` : "no holdings"}. Open portfolio`}>
            <span className="zf-tile-ico"><Wallet aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? <Skeleton width={52} height={16} radius={4} /> : hasEquity ? compact(m.equityValue) : "—"}</span>
            <span className="zf-tile-cap">{m.active.length} equity holding{m.active.length === 1 ? "" : "s"}</span>
            <span className="zf-status" data-state={hasEquity ? "on" : "off"}><i aria-hidden="true" />{hasEquity ? "Active" : "Inactive"}</span>
          </button>
          <button type="button" className="zf-tile" onClick={openFno} aria-label={`F and O: ${m.fnoOpen.length} open positions. Open trades`}>
            <span className="zf-tile-ico"><Layers aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? <Skeleton width={52} height={16} radius={4} /> : hasFno ? compact(m.fnoValue) : "—"}</span>
            <span className="zf-tile-cap">{m.fnoOpen.length} open F&amp;O</span>
            <span className="zf-status" data-state={hasFno ? "on" : "off"}><i aria-hidden="true" />{hasFno ? "Active" : "Inactive"}</span>
          </button>
          <button type="button" className="zf-tile" onClick={() => goTo("watchlist")} aria-label={`Watchlist: ${watchCount} symbols. Open watchlist`}>
            <span className="zf-tile-ico"><Eye aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? <Skeleton width={28} height={16} radius={4} /> : watchCount}</span>
            <span className="zf-tile-cap">watchlist symbol{watchCount === 1 ? "" : "s"}</span>
            <span className="zf-status" data-state={watchCount > 0 ? "on" : "off"}><i aria-hidden="true" />{watchCount > 0 ? "Active" : "Inactive"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── 2×2 stat cards ───────────────────────────────────────────────────────────
interface StatProps {
  label: string;
  icon: typeof Zap;
  value: string;
  loading: boolean;
  pill?: { tone: "up" | "down" | "flat"; text: string } | null;
  cap: string;
  highlight?: boolean;
  index: number;
  children?: ReactNode;
}

function Stat({ label, icon: Icon, value, loading, pill, cap, highlight, index, children }: StatProps) {
  return (
    <article className={`zf-card zf-stat zf-in${highlight ? " zf-stat-hl" : ""}`} style={stagger(index)} aria-label={label}>
      <div className="zf-stat-top">
        <span className="zf-label">{label}</span>
        <span className="zf-chip-ico" aria-hidden="true"><Icon /></span>
      </div>
      <div>
        <div className="zf-stat-val">{loading ? <Skeleton width="64%" height={28} radius={6} /> : value}</div>
        <div className="zf-stat-foot">
          {!loading && pill && <DeltaPill tone={pill.tone}>{pill.text}</DeltaPill>}
          <span className="zf-stat-cap">{cap}</span>
        </div>
        {!loading && children}
      </div>
    </article>
  );
}

function MoverLine({ label, mover, tone }: { label: string; mover: DayMover | null; tone: "up" | "down" }) {
  if (!mover) {
    return (
      <span className="zf-stat-mover" data-tone="flat">
        <span className="zf-stat-mover-cap">{label}</span>
        <span className="zf-stat-mover-none">No {tone === "up" ? "gainer" : "loser"} today</span>
      </span>
    );
  }
  return (
    <span className="zf-stat-mover" data-tone={tone}>
      <span className="zf-stat-mover-cap">{label}</span>
      <b>{signedInr(mover.dayPnl)}</b>
      <span className="zf-stat-mover-id">
        <span className="zf-stat-mover-name" title={`${mover.name} (${mover.market})`}>{mover.ticker}</span>
        {mover.dayPct !== null && <em>{signedPct(mover.dayPct)}</em>}
      </span>
    </span>
  );
}

export function StatGrid({
  loading, m, movers, dayLabel = "Today", priceMode = "",
}: {
  loading: boolean;
  m: OverviewMetrics;
  movers: DayMovers;
  dayLabel?: string;
  priceMode?: string;
}) {
  const todayValue = !m.hasDayData && m.todayPnl === 0 ? "—" : signedInr(m.todayPnl);
  const totalPnl = m.pnl + m.totalRealised;
  const hasTotal = m.invested > 0 || m.closedCount > 0;
  const exclusions = [
    m.unpricedCount > 0 ? `${m.unpricedCount} unpriced` : null,
    m.fxIncomplete ? "USD excluded" : null,
    m.realisedExcluded > 0 ? `${m.realisedExcluded} unvalued` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section className="zf-stats" aria-label="Key figures">
      <Stat
        index={1} highlight label="Today's P&L" icon={Zap} loading={loading} value={todayValue}
        pill={m.todayPct !== null ? { tone: toneOf(m.todayPnl), text: signedPct(m.todayPct) } : null}
        cap={m.hasDayData
          ? `${dayLabel}${priceMode ? ` · ${priceMode}` : ""}${m.fxIncomplete ? " · USD excluded" : ""}`
          : "Awaiting live quotes"}
      >
        {m.hasDayData && (
          <span className="zf-stat-movers">
            <MoverLine label="Top gainer" mover={movers.gainer} tone="up" />
            <MoverLine label="Top loser" mover={movers.loser} tone="down" />
          </span>
        )}
      </Stat>
      <Stat
        index={2} label="Total invested" icon={Wallet} loading={loading} value={inr(m.invested)}
        cap={`${m.active.length + m.fnoOpen.length} open position${m.active.length + m.fnoOpen.length === 1 ? "" : "s"}${m.fxIncomplete ? " · USD excluded" : ""}`}
      />
      <Stat
        index={3} label="Total P&L" icon={TrendingUp} loading={loading}
        value={hasTotal ? signedInr(totalPnl) : "—"}
        cap={hasTotal
          ? `unrealised + realised${exclusions ? ` · ${exclusions}` : ""}`
          : (m.active.length > 0 ? "No priced position" : "No positions yet")}
      />
      <Stat
        index={4} label="Win rate" icon={Award} loading={loading}
        value={m.winRate !== null ? `${m.winRate.toFixed(0)}%` : "—"}
        pill={m.closedCount > 0 ? { tone: toneOf(m.totalRealised), text: `${signedInr(m.totalRealised)} realised` } : null}
        cap={m.closedCount > 0
          ? `${m.wins} of ${m.closedCount} closed won${m.realisedExcluded > 0 ? ` · ${m.realisedExcluded} USD unvalued` : ""}`
          : "No closed trades yet"}
      />
    </section>
  );
}

// ─── Realised P&L by month ────────────────────────────────────────────────────
interface PnlProps {
  loading: boolean;
  months: MonthBucket[];
  undated: number;
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  existingStocks?: PortfolioStock[];
  /** Shown when some rows were excluded from the monthly INR totals. */
  note?: string | null;
}

export function PnlCard({
  loading, months, undated, onAdd, onImport, existingStocks = [], note = null,
}: PnlProps) {
  return (
    <section className="zf-card zf-pnl zf-in" style={stagger(5)} aria-labelledby="zf-pnl-title">
      <div>
        <h2 className="zf-card-title" id="zf-pnl-title">Realised P&amp;L by month</h2>
        <p className="zf-card-sub">Closed equity and F&amp;O trades, grouped by exit month</p>
      </div>

      <div className="zf-pnl-panel">
        <div className="zf-pnl-head">
          <b>Profit and Loss</b>
          <span className="zf-legend" aria-hidden="true">
            <span className="zf-chip"><i className="zf-swatch zf-swatch-profit" />Profit</span>
            <span className="zf-chip"><i className="zf-swatch zf-swatch-loss" />Loss</span>
          </span>
        </div>

        {loading ? (
          <div className="zf-pnl-chart" aria-busy="true"><span className="zf-sr-only" role="status">Loading realised P&amp;L</span></div>
        ) : months.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No closed trades yet"
            actions={<><AddTradeButton onAdd={onAdd} variant="primary" /><ImportButton onImport={onImport} existingStocks={existingStocks} /></>}
          >
            Realised P&amp;L by month appears once you close a trade. Add a trade you have already exited, or import your past trades.
          </EmptyState>
        ) : (
          <>
            <Suspense fallback={<div className="zf-pnl-chart" />}>
              <PnlChart months={months} />
            </Suspense>
            <table className="zf-sr-only">
              <caption>Realised profit and loss by month</caption>
              <thead><tr><th scope="col">Month</th><th scope="col">Realised P&amp;L</th><th scope="col">Closed trades</th></tr></thead>
              <tbody>
                {months.map((x) => (
                  <tr key={x.key}><th scope="row">{x.label}</th><td>{signedInr(x.value)}</td><td>{x.trades}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      {note && !loading && (
        <p className="zf-pnl-foot" role="status" style={{ color: "var(--amber)" }}>{note}</p>
      )}
      {undated > 0 && !loading && (
        <p className="zf-pnl-foot">{undated} closed trade{undated === 1 ? " has" : "s have"} no exit date and {undated === 1 ? "is" : "are"} not shown.</p>
      )}
    </section>
  );
}
