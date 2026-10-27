/**
 * Portfolio value history panel.
 *
 * There is no stored history: `portfolio_snapshots` keeps only the caller's
 * current holdings, and nothing records a dated equity series. This panel used
 * to draw a month-by-month curve by multiplying today's holdings by
 * `0.8 + progress * 0.22` and adding a sine wave — a shape with no relationship
 * to any real data, presented under the labels "Portfolio Value", "1Y" and
 * "2Y".
 *
 * It now reports that the series does not exist instead of inventing points.
 * When dated equity history is actually persisted, plot that here.
 */

import type { PortfolioStock } from "@/data/sampleData";
import { calcFinalValue } from "@/data/sampleData";

export interface PortfolioHistoryPanelProps {
  stocks: PortfolioStock[];
  height?: number;
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.abs(value).toFixed(0)}`;
}

export function PortfolioHistoryPanel({ stocks, height = 130 }: PortfolioHistoryPanelProps) {
  const active = stocks.filter((stock) => stock.status === "Active");
  const current = active.reduce((sum, stock) => sum + calcFinalValue(stock), 0);

  return (
    <div
      data-testid="portfolio-history-unavailable"
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        textAlign: "center",
      }}
    >
      {current > 0 ? (
        <>
          <span style={{ fontSize: 11, color: "var(--tx-500)", fontFamily: "var(--ff-mono)" }}>
            No portfolio history recorded yet
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--tx-300)",
              fontFamily: "var(--ff-mono)",
              maxWidth: 320,
              lineHeight: 1.5,
            }}
          >
            Current value {formatValue(current)} · dated snapshots are not stored, so any
            trend line here would not be real data.
          </span>
        </>
      ) : (
        <span style={{ fontSize: 12, color: "var(--tx-300)" }}>
          Add an active position to track portfolio value
        </span>
      )}
    </div>
  );
}

export default PortfolioHistoryPanel;
