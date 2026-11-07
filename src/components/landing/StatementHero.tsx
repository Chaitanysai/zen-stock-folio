import { useState } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  FileSpreadsheet,
  Lock,
} from "lucide-react";
import { RouteLink } from "@/components/RouteTransition";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useCountUp } from "./useCountUp";
import { formatINR } from "./inr";

/**
 * The hero: a typeset portfolio statement — the product's core artefact,
 * rebuilt as the landing centrepiece. One headline, then the sheet: a
 * count-up net value, an interactive 1M/6M/1Y equity curve, a holdings
 * ledger and an allocation strip. Every figure is invented sample data and
 * the sheet says so in three places (stamp, foot note, caption).
 */

const PORTFOLIO = 1_248_560;

type Range = {
  id: "1M" | "6M" | "1Y";
  label: string;
  ret: string;
  start: string;
  startY: number;
  endY: number;
  d: string;
};

const RANGES: Range[] = [
  {
    id: "1M",
    label: "past month",
    ret: "+3.2%",
    start: "₹12.10L",
    startY: 168,
    endY: 92,
    d: "M8 168 C 48 172, 70 178, 108 170 S 176 152, 214 158 S 282 146, 318 150 S 386 128, 424 134 S 492 118, 530 122 S 596 96, 632 92",
  },
  {
    id: "6M",
    label: "past 6 months",
    ret: "+9.8%",
    start: "₹11.37L",
    startY: 186,
    endY: 76,
    d: "M8 186 C 40 178, 66 170, 100 166 S 160 148, 196 150 S 252 166, 286 178 S 330 170, 360 156 S 410 138, 448 132 S 506 118, 540 106 S 600 84, 632 76",
  },
  {
    id: "1Y",
    label: "past year",
    ret: "+14.9%",
    start: "₹10.86L",
    startY: 196,
    endY: 56,
    d: "M8 196 C 36 188, 58 186, 92 178 S 150 160, 186 162 S 232 172, 262 180 S 300 164, 332 148 S 384 132, 420 128 S 462 140, 490 148 S 528 122, 560 100 S 612 68, 632 56",
  },
];

const HOLDINGS = [
  { tick: "RELIANCE", sector: "Energy", value: "₹1,17,480", pnl: "+₹14,220", up: true },
  { tick: "HDFCBANK", sector: "Financials", value: "₹96,350", pnl: "+₹6,105", up: true },
  { tick: "INFY", sector: "IT", value: "₹74,900", pnl: "−₹2,480", up: false },
  { tick: "TATAMOTORS", sector: "Auto", value: "₹68,240", pnl: "+₹9,840", up: true },
] as const;

const SECTORS = [
  { name: "Financials", pct: 34, tone: "1" },
  { name: "IT", pct: 22, tone: "2" },
  { name: "Energy", pct: 18, tone: "3" },
  { name: "Auto", pct: 14, tone: "4" },
  { name: "Other", pct: 12, tone: "5" },
] as const;

export default function StatementHero() {
  const [rangeId, setRangeId] = useState<Range["id"]>("6M");
  const market = useMarketStatus();
  const value = useCountUp(PORTFOLIO, 1200);
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[1];
  const marketLabel = market.isOpen
    ? "Market live"
    : market.phase === "pre-open"
      ? "Pre-open"
      : "Market closed";

  const issued = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <section className="zl-hero" aria-labelledby="zl-hero-title">
      <div className="zl-wrap zl-hero-inner">
        <span className="zl-eyebrow zl-in">
          <span className="zl-eyebrow-mark" aria-hidden="true" />
          Portfolio intelligence for Indian markets
        </span>
        <h1 id="zl-hero-title" className="zl-h1 zl-in zl-in-1">
          Know <em>exactly</em> where you stand.
        </h1>
        <p className="zl-lede zl-in zl-in-2">
          ZenFolio turns your NSE, BSE and U.S. holdings into one clear statement —
          invested value, live P&amp;L, sector mix and the plan behind every position.
        </p>
        <div className="zl-cta-row zl-in zl-in-3">
          <RouteLink to="/signup" className="zl-btn zl-btn-primary">
            Get started <ArrowRight aria-hidden="true" />
          </RouteLink>
          <a href="#product" className="zl-btn zl-btn-ghost">
            See the product <ArrowDown aria-hidden="true" />
          </a>
        </div>
        <p className="zl-hero-signin zl-in zl-in-3">
          Already have an account? <RouteLink to="/login">Sign in</RouteLink>
        </p>
        <ul className="zl-hero-meta zl-in zl-in-4">
          <li><Lock aria-hidden="true" />Private by default</li>
          <li><Clock aria-hidden="true" />IST market clock</li>
          <li><FileSpreadsheet aria-hidden="true" />CSV &amp; XLSX import</li>
        </ul>

        {/* The statement sheet — the product's artefact, in sample form. */}
        <section
          className="zl-stmt-wrap zl-in-preview"
          aria-label="Sample portfolio statement"
        >
          <div className="zl-sheet">
            <span className="zl-stamp" aria-hidden="true">Sample</span>

            <div className="zl-sheet-head">
              <span className="zl-sheet-title">ZenFolio — Portfolio statement</span>
              <span className="zl-sheet-meta">No. ZF-2026-0114 · Issued {issued}</span>
            </div>

            <div className="zl-stmt-top">
              <div>
                <span className="zl-stmt-label">
                  Net portfolio value · 9 holdings
                  <span className="zl-stmt-aux"> · NSE + US</span>
                </span>
                <div className="zl-stmt-value">₹{formatINR(value)}</div>
              </div>
              <div className="zl-stmt-side">
                <span className="zl-stmt-delta">
                  <ArrowUpRight aria-hidden="true" /> +₹1,62,340 <span>+14.9%</span>
                </span>
                <span className="zl-stmt-range-stat">
                  {range.ret} · {range.label}
                </span>
              </div>
            </div>

            <div className="zl-curve">
              <div className="zl-curve-head">
                <span className="zl-curve-lbl">Portfolio value over time</span>
                <div className="zl-range" role="group" aria-label="Chart range">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={r.id === rangeId}
                      onClick={() => setRangeId(r.id)}
                    >
                      {r.id}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ position: "relative" }}>
                <svg
                  className="zl-curve-svg"
                  viewBox="0 0 640 240"
                  aria-hidden="true"
                  focusable="false"
                >
                  <defs>
                    <linearGradient id="zl-curve-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity=".15" />
                      <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line className="zl-curve-base" x1="8" y1="208" x2="632" y2="208" />
                  <path
                    key={`${rangeId}-area`}
                    className="zl-curve-area"
                    d={`${range.d} L632 208 L8 208 Z`}
                  />
                  <path key={rangeId} className="zl-curve-line" pathLength={1} d={range.d} />
                  <circle className="zl-curve-ring" cx="632" cy={range.endY} r="10" />
                  <circle className="zl-curve-dot" cx="632" cy={range.endY} r="4.5" />
                </svg>
                <span
                  className="zl-curve-tag is-start"
                  style={{ top: `${(range.startY / 240) * 100}%` }}
                >
                  {range.start}
                </span>
                <span
                  className="zl-curve-tag"
                  style={{ top: `${(range.endY / 240) * 100}%` }}
                >
                  <ArrowUpRight aria-hidden="true" />
                  <strong>₹12.49L</strong> today
                </span>
              </div>
            </div>

            <div className="zl-stmt-cols">
              <div className="zl-stmt-col">
                <p className="zl-panel-lbl">Holdings — 4 of 9 shown</p>
                <ul className="zl-ledger">
                  {HOLDINGS.map((h) => {
                    const Icon = h.up ? ArrowUpRight : ArrowDownRight;
                    return (
                      <li key={h.tick} className="zl-ledger-row">
                        <span className="zl-ledger-tick">
                          <strong>{h.tick}</strong>
                          <span className="zl-ledger-sub">{h.sector}</span>
                        </span>
                        <span className="zl-ledger-val">{h.value}</span>
                        <span className={`zl-pnl ${h.up ? "zl-up" : "zl-down"}`}>
                          <Icon aria-hidden="true" />
                          {h.pnl}
                          <span className="zl-sr">{h.up ? " gain" : " loss"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="zl-stmt-col">
                <p className="zl-panel-lbl">Allocation</p>
                <div className="zl-alloc">
                  <div className="zl-alloc-bar" aria-hidden="true">
                    {SECTORS.map((s) => (
                      <span
                        key={s.name}
                        className="zl-alloc-seg"
                        data-tone={s.tone}
                        style={{ width: `${s.pct}%` }}
                      />
                    ))}
                  </div>
                  <ul className="zl-alloc-legend">
                    {SECTORS.map((s) => (
                      <li key={s.name}>
                        <i data-tone={s.tone} aria-hidden="true" />
                        <span>{s.name}</span>
                        <strong>{s.pct}%</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="zl-sheet-foot">
              <span className="zl-sample-note">Sample data — for illustration only</span>
              <span
                className="zl-mkt-chip"
                data-live={market.isOpen ? "1" : "0"}
                title={market.description}
              >
                <span className="zl-pulse" aria-hidden="true" />
                NSE {marketLabel} · {market.istTime} IST
              </span>
            </div>
          </div>

          <p className="zl-stmt-cap">
            Illustrative statement with sample data — not a real portfolio or returns.
          </p>
        </section>
      </div>
    </section>
  );
}
