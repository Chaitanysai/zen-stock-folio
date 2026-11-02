import { useState } from "react";
import type { Market } from "@/lib/market-data/types";
import { CloseBarCard } from "./CloseBarCard";

const VISIBLE = 8;

export interface HoldingChartsProps {
  holdings: { symbol: string; name: string; market?: Market }[];
}

export function HoldingCharts({ holdings }: HoldingChartsProps) {
  const [expanded, setExpanded] = useState(false);
  if (holdings.length === 0) return null;

  const shown = expanded ? holdings : holdings.slice(0, VISIBLE);
  return (
    <section className="zf-chartgrid-wrap" aria-labelledby="zf-chartgrid-title">
      <div className="zf-card-head">
        <div>
          <h2 className="zf-card-title" id="zf-chartgrid-title">Daily closes</h2>
          <p className="zf-card-sub">
            One bar per trading day · last close of each session ·{" "}
            <a className="zf-chartgrid-attrib" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              Charts by TradingView
            </a>
          </p>
        </div>
      </div>
      <div className="zf-chartgrid">
        {shown.map((holding) => (
          <CloseBarCard
            key={`${holding.market ?? "NSE"}:${holding.symbol}`}
            symbol={holding.symbol}
            name={holding.name}
            market={holding.market}
          />
        ))}
      </div>
      {holdings.length > VISIBLE && (
        <button type="button" className="zf-btn zf-btn-outline" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer" : `Show all ${holdings.length} charts`}
        </button>
      )}
    </section>
  );
}
