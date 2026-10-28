import { lazy, Suspense } from "react";
import { Award, BarChart3, Eye, Layers, Wallet, TrendingUp, Zap } from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import type { MonthBucket, OverviewMetrics } from "@/lib/dashboard/overview";
import { compact, inr, signedInr, signedPct, stagger, toneOf } from "@/lib/dashboard/format";
import { AddTradeButton, DeltaPill, EmptyState, ImportButton, Skel } from "./ui";
import type { ActiveTab } from "./nav";

// recharts is only needed once there is something to plot.
const PnlChart = lazy(() => import("./PnlChart"));

interface BalanceProps {
  loading: boolean;
  m: OverviewMetrics;
  watchCount: number;
  onAdd: (stock: PortfolioStock) => void;
  onImport: (stocks: PortfolioStock[]) => void;
  goTo: (id: ActiveTab) => void;
  openFno: () => void;
}

export function BalanceCard({ loading, m, watchCount, onAdd, onImport, goTo, openFno }: BalanceProps) {
  const hasEquity = m.active.length > 0;
  const hasFno = m.fnoOpen.length > 0;
  return (
    <article className="zf-card zf-balance zf-lift zf-in" style={stagger(0)} aria-labelledby="zf-balance-label">
      <div className="zf-balance-top">
        <span className="zf-label" id="zf-balance-label">Portfolio value</span>
        <span className="zf-chip" title="All values are in Indian rupees">INR · ₹</span>
      </div>

      <p className="zf-balance-val">{loading ? <Skel w="68%" h={44} /> : inr(m.current)}</p>

      <div className="zf-balance-delta">
        {loading ? (
          <Skel w={150} h={24} />
        ) : m.dayMovePct !== null ? (
          <>
            <DeltaPill tone={toneOf(m.dayMove)}>{signedPct(m.dayMovePct)}</DeltaPill>
            <span className="zf-delta-cap">today ({signedInr(m.dayMove)})</span>
          </>
        ) : (
          <span className="zf-delta-cap">Day change appears once live quotes load</span>
        )}
      </div>
      <p className="zf-balance-note">
        {loading ? <Skel w="80%" h={14} /> : m.invested > 0
          ? <>Unrealised {signedInr(m.pnl)} ({signedPct(m.pnlPct)}) on {inr(m.invested)} invested</>
          : "Nothing invested yet"}
      </p>

      <div className="zf-balance-actions">
        <AddTradeButton onAdd={onAdd} variant="primary" />
        <ImportButton onImport={onImport} variant="outline" />
      </div>

      <div className="zf-inset" role="group" aria-label="Asset mix">
        <div className="zf-inset-head">
          <b>Asset mix</b>
          <span>3 sources</span>
        </div>
        <div className="zf-tiles">
          <button type="button" className="zf-tile" onClick={() => goTo("holdings")} aria-label={`Equity: ${hasEquity ? `${compact(m.equityValue)} across ${m.active.length} holdings` : "no holdings"}. Open portfolio`}>
            <span className="zf-tile-ico"><Wallet aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? "…" : hasEquity ? compact(m.equityValue) : "—"}</span>
            <span className="zf-tile-cap">{m.active.length} equity holding{m.active.length === 1 ? "" : "s"}</span>
            <span className="zf-status" data-state={hasEquity ? "on" : "off"}><i aria-hidden="true" />{hasEquity ? "Active" : "Inactive"}</span>
          </button>
          <button type="button" className="zf-tile" onClick={openFno} aria-label={`F and O: ${m.fnoOpen.length} open positions. Open trades`}>
            <span className="zf-tile-ico"><Layers aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? "…" : hasFno ? compact(m.fnoValue) : "—"}</span>
            <span className="zf-tile-cap">{m.fnoOpen.length} open F&amp;O</span>
            <span className="zf-status" data-state={hasFno ? "on" : "off"}><i aria-hidden="true" />{hasFno ? "Active" : "Inactive"}</span>
          </button>
          <button type="button" className="zf-tile" onClick={() => goTo("watchlist")} aria-label={`Watchlist: ${watchCount} symbols. Open watchlist`}>
            <span className="zf-tile-ico"><Eye aria-hidden="true" /></span>
            <span className="zf-tile-val">{loading ? "…" : watchCount}</span>
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
}

function Stat({ label, icon: Icon, value, loading, pill, cap, highlight, index }: StatProps) {
  return (
    <article className={`zf-card zf-stat zf-lift zf-in${highlight ? " zf-stat-hl" : ""}`} style={stagger(index)} aria-label={label}>
      <div className="zf-stat-top">
        <span className="zf-label">{label}</span>
        <span className="zf-chip-ico" aria-hidden="true"><Icon /></span>
      </div>
      <div>
        <p className="zf-stat-val">{loading ? <Skel w="64%" h={28} /> : value}</p>
        <div className="zf-stat-foot">
          {!loading && pill && <DeltaPill tone={pill.tone}>{pill.text}</DeltaPill>}
          <span className="zf-stat-cap">{cap}</span>
        </div>
      </div>
    </article>
  );
}

export function StatGrid({ loading, m }: { loading: boolean; m: OverviewMetrics }) {
  const todayValue = !m.hasDayData && m.todayPnl === 0 ? "—" : signedInr(m.todayPnl);
  return (
    <section className="zf-stats" aria-label="Key figures">
      <Stat
        index={1} highlight label="Today's P&L" icon={Zap} loading={loading} value={todayValue}
        pill={m.todayPct !== null ? { tone: toneOf(m.todayPnl), text: signedPct(m.todayPct) } : null}
        cap={m.hasDayData ? "Today" : "Awaiting live quotes"}
      />
      <Stat
        index={2} label="Total invested" icon={Wallet} loading={loading} value={inr(m.invested)}
        cap={`${m.active.length + m.fnoOpen.length} open position${m.active.length + m.fnoOpen.length === 1 ? "" : "s"}`}
      />
      <Stat
        index={3} label="Unrealised P&L" icon={TrendingUp} loading={loading}
        value={m.invested > 0 ? signedInr(m.pnl) : "—"}
        pill={m.invested > 0 ? { tone: toneOf(m.pnl), text: signedPct(m.pnlPct) } : null}
        cap={m.invested > 0 ? "on cost" : "No open positions"}
      />
      <Stat
        index={4} label="Win rate" icon={Award} loading={loading}
        value={m.winRate !== null ? `${m.winRate.toFixed(0)}%` : "—"}
        pill={m.closedCount > 0 ? { tone: toneOf(m.totalRealised), text: `${signedInr(m.totalRealised)} realised` } : null}
        cap={m.closedCount > 0 ? `${m.wins} of ${m.closedCount} closed won` : "No closed trades yet"}
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
  onImport: (stocks: PortfolioStock[]) => void;
}

export function PnlCard({ loading, months, undated, onAdd, onImport }: PnlProps) {
  return (
    <section className="zf-card zf-pnl zf-lift zf-in" style={stagger(5)} aria-labelledby="zf-pnl-title">
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
            actions={<><AddTradeButton onAdd={onAdd} variant="primary" /><ImportButton onImport={onImport} /></>}
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
      {undated > 0 && !loading && (
        <p className="zf-pnl-foot">{undated} closed trade{undated === 1 ? " has" : "s have"} no exit date and {undated === 1 ? "is" : "are"} not shown.</p>
      )}
    </section>
  );
}
