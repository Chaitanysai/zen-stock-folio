import { useMemo, type CSSProperties } from "react";
import {
  AlertTriangle, Archive, CircleDollarSign, History, Layers, ListChecks, PackageCheck, Scale, TrendingUp, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import type { BrokerImportHandler } from "@/lib/portfolio/brokerImport";
import {
  buildPositions,
  outcomeDistribution,
  realisedByMonthFromPositions,
  sourceBreakdown,
  statementDiscrepancies,
  summarisePositions,
  unrealisedByHolding,
} from "@/lib/portfolio/positions";
import { compact, inr, signedInr } from "@/lib/dashboard/format";
import {
  CombinedChartCard, OutcomeChartCard, RealisedChartCard, SourceChartCard, UnrealisedChartCard,
} from "./PortfolioCharts";
import PositionTable from "./PositionTable";

interface PortfolioDashboardProps {
  /** Live equity rows, all statuses, in stored order. */
  stocks: PortfolioStock[];
  usdInr: number | null;
  loading: boolean;
  onAdd: (stock: PortfolioStock) => void;
  onImport: BrokerImportHandler;
  existingStocks?: PortfolioStock[];
  onEditLot: (index: number, updated: PortfolioStock) => void;
  onDeleteLot: (index: number) => void;
  onResetAll: () => void;
}

function SummaryCard({
  label, value, cap, icon: Icon, tone, loading, title, index,
}: {
  label: string;
  value: string;
  cap: string;
  icon: LucideIcon;
  tone?: "up" | "down" | "flat";
  loading: boolean;
  title?: string;
  index: number;
}) {
  return (
    <article className="zf-card zf-pstat zf-in" style={{ "--i": index } as CSSProperties} aria-label={label}>
      <div className="zf-stat-top">
        <span className="zf-label">{label}</span>
        <span className="zf-chip-ico" aria-hidden="true"><Icon /></span>
      </div>
      <div>
        <div className={`zf-stat-val zf-pstat-val${tone ? ` zf-${tone}` : ""}`} title={title}>
          {loading ? "—" : value}
        </div>
        <div className="zf-stat-foot"><span className="zf-stat-cap">{cap}</span></div>
      </div>
    </article>
  );
}

/**
 * The complete portfolio view: every stored equity transaction, open or closed,
 * included in the history. Home deliberately never renders this section's
 * realised or historical figures.
 */
export default function PortfolioDashboard({
  stocks, usdInr, loading, onAdd, onImport, existingStocks = [], onEditLot, onDeleteLot, onResetAll,
}: PortfolioDashboardProps) {
  const { positions, issues } = useMemo(() => buildPositions(stocks), [stocks]);
  const summary = useMemo(
    () => summarisePositions(positions, usdInr, issues.length),
    [positions, usdInr, issues.length],
  );
  const realised = useMemo(() => realisedByMonthFromPositions(positions, usdInr, 240), [positions, usdInr]);
  const unrealised = useMemo(() => unrealisedByHolding(positions, usdInr, 10), [positions, usdInr]);
  const outcome = useMemo(() => outcomeDistribution(positions, usdInr), [positions, usdInr]);
  const sources = useMemo(() => sourceBreakdown(positions, usdInr), [positions, usdInr]);
  const discrepancies = useMemo(() => statementDiscrepancies(stocks), [stocks]);

  const totalCostLabel = summary.investedUnknownLots > 0
    ? `known cost · ${summary.investedUnknownLots} lot${summary.investedUnknownLots === 1 ? "" : "s"} without a recorded price`
    : `all ${summary.historicalTransactions} lot${summary.historicalTransactions === 1 ? "" : "s"} costed`;
  const marketValueLabel = summary.unpricedPositions > 0
    ? `${summary.unpricedPositions} open position${summary.unpricedPositions === 1 ? "" : "s"} unpriced and excluded`
    : "remaining open units";
  const unrealisedLabel = summary.unrealisedExcluded > 0
    ? `${summary.unrealisedExcluded} open position${summary.unrealisedExcluded === 1 ? "" : "s"} excluded (cost or price unavailable)`
    : "open positions only";
  const realisedLabel = summary.realisedExcluded > 0
    ? `${summary.realisedExcluded} sold lot${summary.realisedExcluded === 1 ? "" : "s"} with no derivable result`
    : "completed sales with a known cost and exit";
  const combinedLabel = summary.realisedExcluded > 0 || summary.unrealisedExcluded > 0
    ? "eligible realised + eligible unrealised · partial"
    : "eligible realised + eligible unrealised";

  return (
    <div className="zf-portfolio">
      {summary.fxExcluded > 0 && (
        <div className="zf-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            {summary.fxExcluded} U.S. position{summary.fxExcluded === 1 ? " is" : "s are"} excluded from every INR
            total until the USD→INR rate is available.
          </span>
        </div>
      )}
      {summary.issues > 0 && (
        <div className="zf-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            {summary.issues} stored row{summary.issues === 1 ? "" : "s"} could not be read (missing symbol or invalid
            quantity) and {summary.issues === 1 ? "is" : "are"} not part of these totals.
          </span>
        </div>
      )}
      {discrepancies.differing.length > 0 && (
        <div className="zf-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            {discrepancies.differing.length} closed row
            {discrepancies.differing.length === 1 ? " carries" : "s carry"} a broker-stated P&amp;L that differs from
            the computed result (
            {discrepancies.differing.slice(0, 3).map((row, index) => (
              <span key={row.ticker}>
                {index > 0 ? ", " : ""}
                {row.ticker} {signedInr(row.delta)}
              </span>
            ))}
            {discrepancies.differing.length > 3 && `, and ${discrepancies.differing.length - 3} more`}
            ). Computed results stay in use, so the same units are never counted twice.
          </span>
        </div>
      )}

      <section className="zf-pstats" aria-label="Portfolio summary">
        <SummaryCard
          index={0} label="Total invested capital" icon={Wallet} loading={loading}
          value={compact(summary.totalInvested)} title={inr(summary.totalInvested)}
          cap={totalCostLabel}
        />
        <SummaryCard
          index={1} label="Current market value" icon={CircleDollarSign} loading={loading}
          value={compact(summary.marketValue)} title={inr(summary.marketValue)}
          cap={marketValueLabel}
        />
        <SummaryCard
          index={2} label="Total unrealised" icon={TrendingUp} loading={loading}
          value={signedInr(summary.unrealised, compact)} title={inr(summary.unrealised)}
          tone={summary.unrealised < 0 ? "down" : "up"}
          cap={unrealisedLabel}
        />
        <SummaryCard
          index={3} label="Total realised" icon={Scale} loading={loading}
          value={signedInr(summary.realised, compact)} title={inr(summary.realised)}
          tone={summary.realised < 0 ? "down" : "up"}
          cap={realisedLabel}
        />
        <SummaryCard
          index={4} label="Combined P&L" icon={ListChecks} loading={loading}
          value={signedInr(summary.combined, compact)} title={inr(summary.combined)}
          tone={summary.combined < 0 ? "down" : "up"}
          cap={combinedLabel}
        />
        <SummaryCard
          index={5} label="Active positions" icon={Layers} loading={loading}
          value={`${summary.activePositions}`}
          cap={`${summary.partialPositions} partially sold · units still held`}
        />
        <SummaryCard
          index={6} label="Closed positions" icon={PackageCheck} loading={loading}
          value={`${summary.closedPositions}`}
          cap={`${summary.unvaluedPositions} historical-unvalued`}
        />
        <SummaryCard
          index={7} label="Historical transactions" icon={History} loading={loading}
          value={`${summary.historicalTransactions}`}
          cap={`${summary.importedLots} imported · ${positions.length} position${positions.length === 1 ? "" : "s"}`}
        />
      </section>

      <p className="zf-portfolio-scope">
        <Archive aria-hidden="true" />
        Equity only. Closed and imported rows stay in this history; F&amp;O trades are tracked in Trades and are never
        mixed into these totals. Home shows active holdings only.
      </p>

      <div className="zf-pcharts">
        <RealisedChartCard data={realised} index={8} />
        <UnrealisedChartCard data={unrealised} index={9} />
        <CombinedChartCard summary={summary} index={10} />
        <OutcomeChartCard outcome={outcome} index={11} />
        <SourceChartCard rows={sources} index={12} />
      </div>

      <PositionTable
        stocks={stocks}
        positions={positions}
        usdInr={usdInr}
        loading={loading}
        onAdd={onAdd}
        onImport={onImport}
        existingStocks={existingStocks}
        onEditLot={onEditLot}
        onDeleteLot={onDeleteLot}
        onResetAll={onResetAll}
      />
    </div>
  );
}
