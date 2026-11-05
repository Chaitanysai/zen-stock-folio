import { lazy, Suspense, type ReactNode } from "react";
import { BarChart3, Eye, Layers, Wallet, TrendingUp, Zap } from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerImportHandler } from "@/lib/portfolio/brokerImport";
import type { DayChange, DayMover, DayMovers, OverviewMetrics } from "@/lib/dashboard/overview";
import type { UnrealisedHolding } from "@/lib/portfolio/positions";
import { compact, inr, signedInr, signedPct, stagger, toneOf } from "@/lib/dashboard/format";
import { AddTradeButton, DeltaPill, EmptyState, ImportButton } from "./ui";
import { AnimatedCurrency } from "./AnimatedNumber";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActiveTab } from "./nav";

// recharts is only needed once there is something to plot.
const UnrealisedChart = lazy(() => import("./UnrealisedChart"));

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
  value: ReactNode;
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

function HoldingsDayCard({ loading, changes, index }: { loading: boolean; changes: DayChange[]; index: number }) {
  return (
    <article className="zf-card zf-stat zf-in" style={stagger(index)} aria-label="Active holdings">
      <div className="zf-stat-top">
        <span className="zf-label">Active holdings</span>
        <span className="zf-chip-ico" aria-hidden="true"><Layers /></span>
      </div>
      {loading ? (
        <div className="zf-daylist" aria-busy="true">
          <Skeleton width={44} height={28} radius={6} />
          <Skeleton width="100%" height={14} radius={4} />
          <Skeleton width="100%" height={14} radius={4} />
        </div>
      ) : (
        <>
          <p className="zf-stat-val">{changes.length}</p>
          {changes.length === 0 ? (
            <p className="zf-stat-cap">No open holdings</p>
          ) : (
            <ul className="zf-daylist">
              {changes.map((row) => (
                <li
                  key={row.key}
                  className="zf-dayrow"
                  data-tone={row.dayPct === null ? "flat" : toneOf(row.dayPct)}
                >
                  <span className="zf-dayrow-ticker" title={row.ticker}>{row.ticker}</span>
                  <span className="zf-dayrow-pct">{row.dayPct === null ? "—" : signedPct(row.dayPct)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
  loading, m, movers, dayLabel = "Today", priceMode = "", quotesPending = false,
}: {
  loading: boolean;
  m: OverviewMetrics;
  movers: DayMovers;
  dayLabel?: string;
  priceMode?: string;
  /** True while the first quote request is still in flight (or a retry is). */
  quotesPending?: boolean;
}) {
  // A missing quote is unknown, not zero. While the first response is still on
  // its way the tile rests at zero so the real figure can roll in from it — the
  // gap that used to show "—" and then snap to a number. Once the request has
  // settled, an unresolved figure is genuinely unavailable and if it failed
  // it stays the existing unavailable state rather than an invented ₹0.
  const todayValue = m.hasDayData
    ? <AnimatedCurrency value={m.dayMove} />
    : !m.hasDayData && quotesPending
      ? <AnimatedCurrency value={0} />
      : "—";
  const exclusions = [
    m.unpricedCount > 0 ? `${m.unpricedCount} unpriced` : null,
    m.unknownCostCount > 0 ? `${m.unknownCostCount} unknown cost` : null,
    m.fxIncomplete ? "USD excluded" : null,
  ].filter(Boolean).join(" · ");
  const hasUnrealised = m.pricedCount > 0 && m.invested > 0;
  return (
    <section className="zf-stats" aria-label="Key figures">
      <Stat
        index={1} highlight label="Today's P&L" icon={Zap} loading={loading} value={todayValue}
        pill={m.dayMovePct !== null ? { tone: toneOf(m.dayMove), text: signedPct(m.dayMovePct) } : null}
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
        cap={`${m.active.length} active holding${m.active.length === 1 ? "" : "s"} · ${m.fnoOpen.length} open F&O${m.fxIncomplete ? " · USD excluded" : ""}`}
      />
      <Stat
        index={3} label="Unrealised P&L" icon={TrendingUp} loading={loading}
        value={hasUnrealised ? signedInr(m.pnl) : "—"}
        pill={hasUnrealised ? { tone: toneOf(m.pnl), text: signedPct(m.pnlPct) } : null}
        cap={hasUnrealised
          ? `open positions only${exclusions ? ` · ${exclusions}` : ""}`
          : (m.active.length > 0 ? "No priced position with a known cost" : "No open positions yet")}
      />
      <HoldingsDayCard index={4} loading={loading} changes={movers.rows} />
    </section>
  );
}

// ─── Unrealised P&L by holding ────────────────────────────────────────────────
interface UnrealisedProps {
  loading: boolean;
  holdings: UnrealisedHolding[];
  excluded: number;
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  existingStocks?: PortfolioStock[];
  /** Shown when some rows were excluded from the INR totals. */
  note?: string | null;
}

/**
 * Open equity only: a closed position has nothing unrealised left to show, so
 * it is never plotted here. The Portfolio section holds the complete history.
 */
export function UnrealisedCard({
  loading, holdings, excluded, onAdd, onImport, existingStocks = [], note = null,
}: UnrealisedProps) {
  return (
    <section className="zf-card zf-pnl zf-in" style={stagger(5)} aria-labelledby="zf-pnl-title">
      <div>
        <h2 className="zf-card-title" id="zf-pnl-title">Unrealised P&amp;L by holding</h2>
        <p className="zf-card-sub">Open positions only, ranked by absolute unrealised result</p>
      </div>

      <div className="zf-pnl-panel">
        <div className="zf-pnl-head">
          <b>Open positions</b>
          <span className="zf-legend" aria-hidden="true">
            <span className="zf-chip"><i className="zf-swatch zf-swatch-profit" />Gain</span>
            <span className="zf-chip"><i className="zf-swatch zf-swatch-loss" />Loss</span>
          </span>
        </div>

        {loading ? (
          <div className="zf-pnl-chart" aria-busy="true"><span className="zf-sr-only" role="status">Loading unrealised P&amp;L</span></div>
        ) : holdings.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No unrealised result yet"
            actions={<><AddTradeButton onAdd={onAdd} variant="primary" /><ImportButton onImport={onImport} existingStocks={existingStocks} /></>}
          >
            Unrealised P&amp;L appears once you hold a position with a known cost and a market price. Realised results from closed trades live in Portfolio.
          </EmptyState>
        ) : (
          <>
            <Suspense fallback={<div className="zf-pnl-chart" />}>
              <UnrealisedChart holdings={holdings} />
            </Suspense>
            <table className="zf-sr-only">
              <caption>Unrealised profit and loss by holding</caption>
              <thead><tr><th scope="col">Holding</th><th scope="col">Unrealised P&amp;L</th></tr></thead>
              <tbody>
                {holdings.map((x) => (
                  <tr key={x.key}><th scope="row">{x.axisLabel}</th><td>{signedInr(x.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      {note && !loading && (
        <p className="zf-pnl-foot" role="status" style={{ color: "var(--amber)" }}>{note}</p>
      )}
      {excluded > 0 && !loading && (
        <p className="zf-pnl-foot">
          {excluded} open position{excluded === 1 ? " has" : "s have"} no computable unrealised result and{" "}
          {excluded === 1 ? "is" : "are"} not shown.
        </p>
      )}
    </section>
  );
}
