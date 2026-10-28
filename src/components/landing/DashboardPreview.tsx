import { ArrowDownRight, ArrowUpRight, BellRing } from "lucide-react";

/**
 * Static, coded preview of the ZenFolio dashboard for the landing page.
 * Every figure is invented sample data and the frame says so in two places
 * (header tag + caption). Gains and losses always carry a sign and an arrow,
 * never colour alone.
 */

type Row = { tick: string; abbr: string; sector: string; value: string; pnl: string; up: boolean };

const HOLDINGS: Row[] = [
  { tick: "RELIANCE", abbr: "RIL", sector: "Energy", value: "₹1,17,480", pnl: "+₹14,220", up: true },
  { tick: "HDFCBANK", abbr: "HDB", sector: "Financials", value: "₹96,350", pnl: "+₹6,105", up: true },
  { tick: "INFY", abbr: "INF", sector: "IT", value: "₹74,900", pnl: "−₹2,480", up: false },
];

// Two entries so the rail spans the same height as the holdings table; the
// values match the app's own sample watchlist.
const WATCHLIST = [
  { tick: "TATAMOTORS", zone: "Entry ₹910–940", status: "In zone", muted: false },
  { tick: "IRCTC", zone: "Entry ₹830–850", status: "Watching", muted: true },
];

// Hand-shaped sample series (viewBox 0 0 320 96)
const LINE =
  "M0 74 C 18 70, 30 76, 46 66 S 76 58, 92 62 S 120 50, 138 52 S 168 40, 186 46 S 214 30, 232 34 S 262 22, 280 26 S 306 14, 320 12";
const AREA = `${LINE} L 320 96 L 0 96 Z`;

function Pnl({ up, children }: { up: boolean; children: string }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`zl-pv-num ${up ? "zl-up" : "zl-down"}`}>
      <Icon aria-hidden="true" style={{ width: 11, height: 11, display: "inline", verticalAlign: "-1px", marginRight: 2 }} />
      {children}
      <span className="zl-sr">{up ? " gain" : " loss"}</span>
    </span>
  );
}

export default function DashboardPreview() {
  return (
    <figure className="zl-stage zl-in-preview" aria-labelledby="zl-preview-cap" style={{ margin: 0 }}>
      <div className="zl-preview">
        <div className="zl-pv-bar">
          <span className="zl-pv-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="zl-pv-title">Dashboard</span>
          <span className="zl-pv-tag">Sample data</span>
        </div>

        <div className="zl-pv-body">
          <div className="zl-pv-top">
            <div className="zl-pv-hero">
              <div className="zl-pv-lbl">Portfolio value</div>
              <div className="zl-pv-val">₹12,48,560</div>
              <span className="zl-pv-chip">
                <ArrowUpRight aria-hidden="true" />
                +₹1,62,340 (+14.9%)
              </span>
              <div className="zl-pv-split" aria-hidden="true">
                <span style={{ width: "62%", background: "hsl(0 0% 100% / .92)" }} />
                <span style={{ width: "26%", background: "hsl(36 100% 80% / .9)" }} />
                <span style={{ width: "12%", background: "hsl(0 0% 0% / .35)" }} />
              </div>
            </div>

            <div className="zl-pv-card">
              <div className="zl-pv-card-lbl">Day P&amp;L</div>
              <div className="zl-pv-pnl zl-up">
                <ArrowUpRight aria-hidden="true" style={{ width: 16, height: 16, display: "inline", verticalAlign: "-2px", marginRight: 2 }} />
                +₹8,412
              </div>
              <div className="zl-pv-sub">+0.68% today · 9 holdings</div>
            </div>
          </div>

          <div className="zl-pv-card zl-pv-chart">
            <div className="zl-pv-chart-head">
              <span className="zl-pv-card-lbl">Portfolio value over time</span>
              <span className="zl-pv-seg" aria-hidden="true">
                <span>1M</span><span data-on="">6M</span><span>1Y</span>
              </span>
            </div>
            <svg viewBox="0 0 320 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="zl-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity=".38" />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="zl-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--chart-4))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" />
                </linearGradient>
              </defs>
              {[24, 48, 72].map((y) => (
                <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="hsl(var(--foreground) / .07)" strokeDasharray="3 4" />
              ))}
              <path d={AREA} fill="url(#zl-area)" />
              <path d={LINE} fill="none" stroke="url(#zl-line)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <circle cx="320" cy="12" r="3.5" fill="hsl(var(--chart-2))" />
            </svg>
          </div>

          <div className="zl-pv-bottom">
            <div className="zl-pv-card zl-pv-table" style={{ padding: "4px 0" }}>
              <div className="zl-pv-th" aria-hidden="true">
                <span>Holding</span><span className="zl-pv-r">Value</span><span className="zl-pv-r">P&amp;L</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Sample holdings">
                {HOLDINGS.map((h) => (
                  <li key={h.tick} className="zl-pv-tr">
                    <span className="zl-pv-tick">
                      <span className="zl-pv-logo" aria-hidden="true">{h.abbr}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="zl-pv-name" style={{ display: "block" }}>{h.tick}</span>
                        <span className="zl-pv-wl-zone" style={{ display: "block", marginTop: 1 }}>{h.sector}</span>
                      </span>
                    </span>
                    <span className="zl-pv-num">{h.value}</span>
                    <Pnl up={h.up}>{h.pnl}</Pnl>
                  </li>
                ))}
              </ul>
            </div>

            <div className="zl-pv-wl">
              {WATCHLIST.map((w) => (
                <div key={w.tick} className="zl-pv-wl-chip">
                  <div style={{ minWidth: 0 }}>
                    <div className="zl-pv-card-lbl">Watchlist</div>
                    <div className="zl-pv-wl-name" style={{ marginTop: 4 }}>{w.tick}</div>
                    <div className="zl-pv-wl-zone">{w.zone}</div>
                  </div>
                  <span className="zl-pv-badge" data-tone={w.muted ? "muted" : undefined}>● {w.status}</span>
                </div>
              ))}
              <div className="zl-pv-alert">
                <BellRing aria-hidden="true" />
                <span>Alert: INFY ≤ ₹1,480</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption id="zl-preview-cap" className="zl-stage-note">
        Illustrative preview with sample data. Not real holdings or returns.
      </figcaption>
    </figure>
  );
}
