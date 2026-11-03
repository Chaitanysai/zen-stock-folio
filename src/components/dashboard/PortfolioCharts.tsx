import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3, PieChart as PieIcon, Wallet } from "lucide-react";
import type { MonthBucket } from "@/lib/dashboard/overview";
import {
  type OutcomeDistribution,
  type PortfolioSummary,
  type RealisedMonthsResult,
  type SourceBreakdownRow,
  type UnrealisedByHolding,
} from "@/lib/portfolio/positions";
import { inr, signedInr } from "@/lib/dashboard/format";
import { EmptyState } from "./ui";
import PnlChart from "./PnlChart";
import UnrealisedChart from "./UnrealisedChart";

/** Chart shell: one title, one caption, one number-free legend slot. */
function ChartCard({
  title, sub, children, foot, index = 0,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  foot?: ReactNode;
  index?: number;
}) {
  return (
    <section className="zf-card zf-pchart zf-in" style={{ "--i": index } as CSSProperties} aria-label={title}>
      <div>
        <h2 className="zf-card-title">{title}</h2>
        <p className="zf-card-sub">{sub}</p>
      </div>
      <div className="zf-pnl-panel">{children}</div>
      {foot && <p className="zf-pnl-foot">{foot}</p>}
    </section>
  );
}

// ─── Realised P&L over time ──────────────────────────────────────────────────

const toYearly = (months: MonthBucket[]): MonthBucket[] => {
  const totals = new Map<string, { value: number; trades: number }>();
  for (const month of months) {
    const year = month.key.slice(0, 4);
    const bucket = totals.get(year) ?? { value: 0, trades: 0 };
    bucket.value += month.value;
    bucket.trades += month.trades;
    totals.set(year, bucket);
  }
  return [...totals.entries()].map(([year, bucket]) => ({
    key: year,
    label: year,
    value: bucket.value,
    trades: bucket.trades,
  }));
};

export function RealisedChartCard({ data, index = 0 }: { data: RealisedMonthsResult; index?: number }) {
  const [span, setSpan] = useState<"month" | "year">("month");
  // The engine returns a wide history so yearly aggregation sees every year;
  // the monthly view itself stays at the most recent 12 buckets.
  const months = useMemo(
    () => (span === "year" ? toYearly(data.months) : data.months.slice(-12)),
    [data.months, span],
  );
  const foot = [
    data.undated > 0 ? `${data.undated} sold lot${data.undated === 1 ? " has" : "s have"} no exit date` : null,
    data.unscoreable > 0 ? `${data.unscoreable} sold lot${data.unscoreable === 1 ? " has" : "s have"} no derivable result` : null,
    data.fxExcluded > 0 ? `${data.fxExcluded} USD lot${data.fxExcluded === 1 ? "" : "s"} excluded (no FX rate)` : null,
  ].filter(Boolean).join(" · ");

  return (
    <ChartCard
      index={index}
      title="Realised P&L"
      sub="Completed sales only, by exit period"
      foot={foot || undefined}
    >
      <div className="zf-pnl-head">
        <b>Closed results</b>
        <span className="zf-seg" role="group" aria-label="Realised chart period">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={span === value}
              onClick={() => setSpan(value)}
            >
              {value === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </span>
      </div>
      {months.length === 0 ? (
        <EmptyState icon={BarChart3} title="No realised results yet">
          Realised P&L appears once a recorded sale has a cost and an exit price.
        </EmptyState>
      ) : (
        <>
          <PnlChart months={months} />
          <table className="zf-sr-only">
            <caption>Realised profit and loss by {span}</caption>
            <thead><tr><th scope="col">Period</th><th scope="col">Realised P&amp;L</th><th scope="col">Sold lots</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key}><th scope="row">{m.label}</th><td>{signedInr(m.value)}</td><td>{m.trades}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  );
}

// ─── Unrealised P&L by holding ───────────────────────────────────────────────

export function UnrealisedChartCard({ data, index = 0 }: { data: UnrealisedByHolding; index?: number }) {
  return (
    <ChartCard
      index={index}
      title="Unrealised P&L"
      sub="Open units only, ranked by absolute result"
      foot={data.excluded > 0
        ? `${data.excluded} open position${data.excluded === 1 ? " has" : "s have"} no computable unrealised result and ${data.excluded === 1 ? "is" : "are"} not shown.`
        : undefined}
    >
      <div className="zf-pnl-head">
        <b>Current open positions</b>
        <span className="zf-legend" aria-hidden="true">
          <span className="zf-chip"><i className="zf-swatch zf-swatch-profit" />Gain</span>
          <span className="zf-chip"><i className="zf-swatch zf-swatch-loss" />Loss</span>
        </span>
      </div>
      {data.holdings.length === 0 ? (
        <EmptyState icon={BarChart3} title="No open position with a usable value">
          Unrealised P&L needs remaining units, a recorded cost and a market price.
        </EmptyState>
      ) : (
        <>
          <UnrealisedChart holdings={data.holdings} />
          <table className="zf-sr-only">
            <caption>Unrealised profit and loss by holding</caption>
            <thead><tr><th scope="col">Holding</th><th scope="col">Unrealised P&amp;L</th></tr></thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.key}><th scope="row">{h.axisLabel}</th><td>{signedInr(h.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  );
}

// ─── Combined P&L ────────────────────────────────────────────────────────────

const share = (part: number, total: number): number =>
  total <= 0 ? 0 : Math.min(100, (Math.abs(part) / total) * 100);

export function CombinedChartCard({
  summary, index = 0,
}: { summary: PortfolioSummary; index?: number }) {
  const magnitude = Math.abs(summary.realised) + Math.abs(summary.unrealised);
  const hasAny = summary.realised !== 0 || summary.unrealised !== 0;
  const partial = summary.realisedExcluded > 0 || summary.unrealisedExcluded > 0;
  const foot = [
    partial ? "Combined includes only results that could be derived; excluded lots are counted below." : null,
    summary.realisedExcluded > 0 ? `${summary.realisedExcluded} sold lot${summary.realisedExcluded === 1 ? "" : "s"} without a realised result` : null,
    summary.unrealisedExcluded > 0 ? `${summary.unrealisedExcluded} open position${summary.unrealisedExcluded === 1 ? "" : "s"} without an unrealised result` : null,
    summary.fxExcluded > 0 ? `${summary.fxExcluded} USD position${summary.fxExcluded === 1 ? "" : "s"} excluded (no FX rate)` : null,
  ].filter(Boolean).join(" · ");

  return (
    <ChartCard
      index={index}
      title="Combined P&L"
      sub="Eligible realised plus eligible unrealised, never double counted"
      foot={foot || undefined}
    >
      {!hasAny ? (
        <EmptyState icon={Wallet} title="No eligible result yet">
          Combined P&L appears when a sold lot or an open position has enough information to be valued.
        </EmptyState>
      ) : (
        <div className="zf-combined">
          <div className="zf-combined-total" data-tone={summary.combined < 0 ? "down" : "up"}>
            {signedInr(summary.combined)}
            <span>combined</span>
          </div>
          <div
            className="zf-combined-bar"
            role="img"
            aria-label={`Realised ${signedInr(summary.realised)}, unrealised ${signedInr(summary.unrealised)}, combined ${signedInr(summary.combined)}`}
          >
            <span
              className="zf-combined-part"
              data-tone={summary.realised < 0 ? "down" : "up"}
              style={{ width: `${share(summary.realised, magnitude)}%` }}
            />
            <span
              className="zf-combined-part"
              data-tone={summary.unrealised < 0 ? "down" : "up"}
              style={{ width: `${share(summary.unrealised, magnitude)}%` }}
            />
          </div>
          <dl className="zf-combined-keys">
            <div><dt><i className="zf-key-dot" data-tone={summary.realised < 0 ? "down" : "up"} />Realised</dt><dd>{signedInr(summary.realised)}</dd></div>
            <div><dt><i className="zf-key-dot" data-tone={summary.unrealised < 0 ? "down" : "up"} />Unrealised</dt><dd>{signedInr(summary.unrealised)}</dd></div>
          </dl>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Profit vs loss distribution ─────────────────────────────────────────────

export function OutcomeChartCard({
  outcome, index = 0,
}: { outcome: OutcomeDistribution; index?: number }) {
  const slices = [
    { key: "wins", name: "Winning lots", value: outcome.wins, fill: "hsl(var(--profit))" },
    { key: "losses", name: "Losing lots", value: outcome.losses, fill: "hsl(var(--loss))" },
    { key: "breakEven", name: "Break-even", value: outcome.breakEven, fill: "hsl(var(--chart-ink))" },
    { key: "unknown", name: "Unknown result", value: outcome.unknown, fill: "hsl(var(--border-strong))" },
  ].filter((slice) => slice.value > 0);
  const scored = outcome.wins + outcome.losses + outcome.breakEven;
  const foot = [
    outcome.unknown > 0 ? `${outcome.unknown} sold lot${outcome.unknown === 1 ? " has" : "s have"} no derivable result` : null,
    outcome.fxExcluded > 0 ? `${outcome.fxExcluded} USD lot${outcome.fxExcluded === 1 ? "" : "s"} excluded (no FX rate)` : null,
  ].filter(Boolean).join(" · ");

  return (
    <ChartCard
      index={index}
      title="Profit vs loss"
      sub="Sold lots by outcome, with gross amounts"
      foot={foot || undefined}
    >
      {scored + outcome.unknown === 0 ? (
        <EmptyState icon={PieIcon} title="No completed sale yet">
          The distribution appears after your first recorded sale, valued or not.
        </EmptyState>
      ) : (
        <div className="zf-outcome">
          <div className="zf-outcome-donut" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={68}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {slices.map((slice) => <Cell key={slice.key} fill={slice.fill} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface-2))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="zf-outcome-center">
              <b>{scored}</b>
              <span>scored lots</span>
            </div>
          </div>
          <div className="zf-outcome-body">
            <ul className="zf-outcome-legend">
              {slices.map((slice) => (
                <li key={slice.key}>
                  <i style={{ background: slice.fill }} aria-hidden="true" />
                  <span>{slice.name}</span>
                  <b>{slice.value}</b>
                </li>
              ))}
            </ul>
            <dl className="zf-outcome-money">
              <div><dt>Gross profit</dt><dd className="zf-up">{signedInr(outcome.grossProfit)}</dd></div>
              <div><dt>Gross loss</dt><dd className="zf-down">{signedInr(outcome.grossLoss)}</dd></div>
              <div><dt>Net realised</dt><dd className={outcome.net < 0 ? "zf-down" : "zf-up"}>{signedInr(outcome.net)}</dd></div>
            </dl>
            <table className="zf-sr-only">
              <caption>Profit and loss distribution of sold lots</caption>
              <thead><tr><th scope="col">Outcome</th><th scope="col">Sold lots</th></tr></thead>
              <tbody>
                {slices.map((slice) => (
                  <tr key={slice.key}><th scope="row">{slice.name}</th><td>{slice.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Broker / source breakdown ───────────────────────────────────────────────

export function SourceChartCard({
  rows, index = 0,
}: { rows: SourceBreakdownRow[]; index?: number }) {
  const max = rows.reduce((value, row) => Math.max(value, row.invested), 0);
  const foot = rows.some((row) => row.fxExcluded > 0 || row.investedUnknownLots > 0)
    ? "Sources with USD lots awaiting a rate, or lots with no recorded cost, show lower totals than their full exposure."
    : undefined;

  return (
    <ChartCard index={index} title="Broker breakdown" sub="Invested capital by source, with results where derivable" foot={foot}>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No stored positions">
          Import a broker statement or add a trade to compare sources.
        </EmptyState>
      ) : (
        <ul className="zf-sources">
          {rows.map((row) => (
            <li key={row.source} className="zf-source">
              <div className="zf-source-head">
                <b>{row.label}</b>
                <span>{row.positions} position{row.positions === 1 ? "" : "s"} · {row.lots} lot{row.lots === 1 ? "" : "s"}</span>
              </div>
              <div className="zf-source-bar" aria-hidden="true">
                <span style={{ width: `${max > 0 ? (row.invested / max) * 100 : 0}%` }} />
              </div>
              <div className="zf-source-figures">
                <span><em>Invested</em> {inr(row.invested)}</span>
                <span><em>Realised</em> {row.realised === null ? "—" : signedInr(row.realised)}</span>
                <span><em>Unrealised</em> {row.unrealised === null ? "—" : signedInr(row.unrealised)}</span>
              </div>
              {(row.fxExcluded > 0 || row.investedUnknownLots > 0) && (
                <p className="zf-source-note">
                  {row.fxExcluded > 0 && `${row.fxExcluded} USD position${row.fxExcluded === 1 ? "" : "s"} awaiting FX`}
                  {row.fxExcluded > 0 && row.investedUnknownLots > 0 ? " · " : ""}
                  {row.investedUnknownLots > 0 && `${row.investedUnknownLots} lot${row.investedUnknownLots === 1 ? "" : "s"} without a recorded cost`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
