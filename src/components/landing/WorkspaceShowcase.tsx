import { ArrowDownRight, ArrowUpRight, BellRing } from "lucide-react";

/**
 * Static, coded preview of the ZenFolio dashboard for the landing page, in the
 * same ledger language as the statement hero: hairline rules, Geist Mono
 * figures, no rounded cards. Every figure is invented sample data and the
 * frame says so in two places (header tag + caption). Gains and losses always
 * carry a sign and an arrow, never colour alone. Column density scales with
 * the frame's own width via container queries: Qty and Avg only appear when
 * the table has room for them.
 */

type Row = {
  tick: string;
  abbr: string;
  sector: string;
  qty: string;
  avg: string;
  value: string;
  pnl: string;
  up: boolean;
};

const HOLDINGS: Row[] = [
  { tick: "RELIANCE", abbr: "RIL", sector: "Energy", qty: "40", avg: "₹2,582", value: "₹1,17,480", pnl: "+₹14,220", up: true },
  { tick: "HDFCBANK", abbr: "HDB", sector: "Financials", qty: "58", avg: "₹1,556", value: "₹96,350", pnl: "+₹6,105", up: true },
  { tick: "INFY", abbr: "INF", sector: "IT", qty: "50", avg: "₹1,548", value: "₹74,900", pnl: "−₹2,480", up: false },
  { tick: "TATAMOTORS", abbr: "TTM", sector: "Auto", qty: "74", avg: "₹789", value: "₹68,240", pnl: "+₹9,840", up: true },
];

const WATCHLIST = [
  { tick: "TATAMOTORS", zone: "Entry ₹910–940", status: "In zone", muted: false },
  { tick: "IRCTC", zone: "Entry ₹830–850", status: "Watching", muted: true },
];

function Pnl({ up, children }: { up: boolean; children: string }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`zl-ws-num zl-ws-r ${up ? "zl-up" : "zl-down"}`}>
      <Icon aria-hidden="true" style={{ width: 11, height: 11, display: "inline", verticalAlign: "-1px", marginRight: 2 }} />
      {children}
      <span className="zl-sr">{up ? " gain" : " loss"}</span>
    </span>
  );
}

export default function WorkspaceShowcase() {
  return (
    <figure className="zl-stage" aria-labelledby="zl-preview-cap" style={{ margin: 0 }}>
      <div className="zl-ws">
        <div className="zl-ws-bar">
          <span className="zl-ws-title">ZenFolio — Dashboard</span>
          <span className="zl-ws-tag">Sample data</span>
        </div>

        <div className="zl-ws-body">
          <div className="zl-ws-top">
            <div className="zl-ws-card">
              <span className="zl-ws-lbl">Portfolio value</span>
              <div className="zl-ws-val">₹12,48,560</div>
              <span className="zl-ws-chip zl-up">
                <ArrowUpRight aria-hidden="true" />
                +₹1,62,340 · +14.9%
              </span>
              <div className="zl-ws-split" aria-hidden="true">
                <span style={{ width: "34%", background: "hsl(var(--chart-1))" }} />
                <span style={{ width: "22%", background: "hsl(var(--chart-2))" }} />
                <span style={{ width: "18%", background: "hsl(var(--chart-3))" }} />
                <span style={{ width: "14%", background: "hsl(var(--chart-4))" }} />
                <span style={{ width: "12%", background: "hsl(var(--chart-5))" }} />
              </div>
              <span className="zl-ws-sub">5 sectors · NSE + US</span>
            </div>

            <div className="zl-ws-card">
              <span className="zl-ws-lbl">Day P&amp;L</span>
              <div className="zl-ws-val zl-up">+₹8,412</div>
              <span className="zl-ws-sub">+0.68% today · 9 holdings</span>
            </div>
          </div>

          <div className="zl-ws-card zl-ws-table">
            <div className="zl-ws-th" aria-hidden="true">
              <span>Holding</span>
              <span className="zl-ws-r zl-ws-qty">Qty</span>
              <span className="zl-ws-r zl-ws-avg">Avg</span>
              <span className="zl-ws-r">Value</span>
              <span className="zl-ws-r">P&amp;L</span>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Sample holdings">
              {HOLDINGS.map((h) => (
                <li key={h.tick} className="zl-ws-tr">
                  <span className="zl-ws-tick">
                    <span className="zl-ws-logo" aria-hidden="true">{h.abbr}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="zl-ws-name" style={{ display: "block" }}>{h.tick}</span>
                      <span className="zl-ws-sub" style={{ display: "block", marginTop: 2 }}>{h.sector}</span>
                    </span>
                  </span>
                  <span className="zl-ws-num zl-ws-r zl-ws-qty">{h.qty}</span>
                  <span className="zl-ws-num zl-ws-r zl-ws-avg">{h.avg}</span>
                  <span className="zl-ws-num zl-ws-r">{h.value}</span>
                  <Pnl up={h.up}>{h.pnl}</Pnl>
                </li>
              ))}
            </ul>
          </div>

          <div className="zl-ws-rail">
            {WATCHLIST.map((w) => (
              <div key={w.tick} className="zl-ws-wl-chip">
                <div style={{ minWidth: 0 }}>
                  <div className="zl-ws-lbl">Watchlist</div>
                  <div className="zl-ws-wl-name" style={{ marginTop: 5 }}>{w.tick}</div>
                  <div className="zl-ws-wl-zone">{w.zone}</div>
                </div>
                <span className="zl-ws-badge" data-tone={w.muted ? "muted" : undefined}>
                  ● {w.status}
                </span>
              </div>
            ))}
            <div className="zl-ws-alert">
              <BellRing aria-hidden="true" />
              <span>Alert · INFY ≤ ₹1,480 · armed</span>
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
