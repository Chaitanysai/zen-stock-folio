import { useRef } from "react";
import { RouteLink } from "@/components/RouteTransition";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import LandingNav, { SECTIONS } from "@/components/landing/LandingNav";
import StatementHero from "@/components/landing/StatementHero";
import WorkspaceShowcase from "@/components/landing/WorkspaceShowcase";
import { useReveal } from "@/components/landing/useReveal";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import "@/styles/landing.css";

const delay = (ms: number) => ({ "--zl-d": `${ms}ms` }) as import("react").CSSProperties;

const CAPABILITIES = [
  {
    title: "Holdings & P&L",
    body: "Invested, current value and profit or loss per position, totalled in ₹. Price and FX P&L stay separate, so a currency move never reads as a stock call.",
  },
  {
    title: "Watchlist with a plan",
    body: "Write it down before you buy: entry zone, stop-loss and three targets, with RSI and moving averages for context.",
  },
  {
    title: "Price alerts",
    body: "Set a level above or below the current price and see at a glance which alerts have already triggered.",
  },
  {
    title: "Trade journal",
    body: "Log closed trades, review the history and track how each strategy is working over time.",
  },
  {
    title: "F&O positions",
    body: "Futures and options next to your equity holdings, with premiums fetched for open contracts.",
  },
  {
    title: "Import & export",
    body: "Bring past trades in from CSV or Excel, and take your portfolio out whenever you want it.",
  },
] as const;

const BREAKDOWN = [
  { label: "Invested", value: "₹10,86,220", tone: "none" },
  { label: "Current value", value: "₹12,48,560", tone: "none" },
  { label: "Price P&L", value: "+₹1,58,412", tone: "up" },
  { label: "FX P&L", value: "+₹3,928", tone: "up" },
] as const;

const BARS = [
  { name: "Financials", pct: 34, value: "₹4.24L", tone: "1" },
  { name: "IT", pct: 22, value: "₹2.75L", tone: "2" },
  { name: "Energy", pct: 18, value: "₹2.25L", tone: "3" },
  { name: "Auto", pct: 14, value: "₹1.75L", tone: "4" },
  { name: "Other", pct: 12, value: "₹1.50L", tone: "5" },
] as const;

const STEPS = [
  {
    title: "Create your account",
    body: "Sign up with your email. Your portfolio is tied to your account from the first holding.",
  },
  {
    title: "Bring in your holdings",
    body: "Add positions one by one, or import past trades from CSV or Excel using the template.",
  },
  {
    title: "Track and plan",
    body: "Follow P&L and sector mix, keep a watchlist with trade setups, and set alerts for the levels you care about.",
  },
] as const;

const TERMS = [
  {
    key: "Data isolation",
    body: "Every read and write is checked against the signed-in user, so one account can never load another account's portfolio.",
  },
  {
    key: "Clean sign-out",
    body: "Signing out or switching accounts clears the portfolio cached on that device.",
  },
  {
    key: "Tracking only",
    body: "ZenFolio never connects to your broker to place orders. It's a place to see and plan, not to trade.",
  },
  {
    key: "Market hours",
    body: "Market status follows Asia/Kolkata time and the NSE trading-holiday calendar.",
  },
] as const;

const SPEC = [
  { key: "Markets", value: "NSE · BSE · U.S. listings", body: "Indian equities and F&O, plus international listings you hold." },
  { key: "Base currency", value: "INR", body: "International holdings totalled in ₹, FX kept separate." },
  { key: "Import", value: "CSV & XLSX", body: "A template for past trades; columns map cleanly." },
  { key: "Export", value: "Any time", body: "Your data leaves as easily as it arrived." },
  { key: "Market clock", value: "Asia/Kolkata", body: "Status follows NSE hours and the holiday calendar." },
  { key: "Broker link", value: "None", body: "Tracking only — orders stay with your broker." },
] as const;

const TICKER = [
  { name: "NIFTY 50", value: "24,318.40", delta: "+0.68%", up: true },
  { name: "SENSEX", value: "79,820.85", delta: "+0.54%", up: true },
  { name: "NIFTY BANK", value: "51,246.10", delta: "−0.21%", up: false },
  { name: "RELIANCE", value: "2,984.60", delta: "+1.02%", up: true },
  { name: "HDFCBANK", value: "1,718.30", delta: "+0.44%", up: true },
  { name: "INFY", value: "1,492.75", delta: "−0.83%", up: false },
  { name: "TCS", value: "3,941.20", delta: "+0.29%", up: true },
  { name: "TATAMOTORS", value: "942.15", delta: "+1.87%", up: true },
] as const;

function TickerStrip() {
  const items = TICKER.map((q) => {
    const Icon = q.up ? ArrowUpRight : ArrowDownRight;
    return (
      <span className="zl-ticker-item" key={q.name}>
        <span className="zl-ticker-name">{q.name}</span>
        <span className="zl-ticker-val">{q.value}</span>
        <span className={`zl-ticker-delta ${q.up ? "zl-up" : "zl-down"}`}>
          <Icon aria-hidden="true" />
          {q.delta}
        </span>
      </span>
    );
  });
  return (
    <div className="zl-ticker" title="Illustrative market quotes">
      <span className="zl-sr">Illustrative market quotes, not live data.</span>
      <div className="zl-ticker-track">
        <div style={{ display: "flex" }}>{items}</div>
        <div style={{ display: "flex" }} aria-hidden="true">{items}</div>
      </div>
    </div>
  );
}

const Landing = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);
  const market = useMarketStatus();
  const marketLabel = market.isOpen
    ? "Market live"
    : market.phase === "pre-open"
      ? "Pre-open"
      : "Market closed";

  return (
    <div ref={rootRef} className="zl">
      <a href="#zl-main" className="zl-skip">Skip to content</a>

      <LandingNav />

      <main id="zl-main" tabIndex={-1} style={{ outline: "none" }}>
        <StatementHero />

        <TickerStrip />

        {/* ── Product ── */}
        <section id="product" className="zl-section" aria-labelledby="zl-product-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">01 · The product</p>
                <h2 id="zl-product-title" className="zl-h2">
                  A workspace, <em>not</em> a spreadsheet.
                </h2>
              </div>
              <p className="zl-sub zl-head-aside">
                Every tool an active Indian investor reaches for daily — holdings,
                watchlist, alerts, journal and F&amp;O — sharing one set of honest numbers.
              </p>
            </div>

            <div className="zl-product-grid">
              <div className="zl-product-frame zl-reveal">
                <WorkspaceShowcase />
              </div>

              <ul className="zl-caps zl-reveal" style={delay(80)}>
                {CAPABILITIES.map((item, index) => (
                  <li key={item.title} className="zl-cap">
                    <span className="zl-cap-idx" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="zl-also zl-reveal">
              <span className="zl-also-lbl">Also included</span>
              <ul>
                <li><Sparkles aria-hidden="true" />AI portfolio insights</li>
                <li>Risk analysis</li>
                <li>CSV / XLSX import</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Performance & intelligence ── */}
        <section id="performance" className="zl-section" aria-labelledby="zl-performance-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">02 · Performance &amp; intelligence</p>
                <h2 id="zl-performance-title" className="zl-h2">
                  Every rupee, <em>accounted</em> for.
                </h2>
              </div>
              <p className="zl-sub zl-head-aside">
                P&amp;L that explains itself: price moves stay separate from currency
                moves, and the total always reconciles.
              </p>
            </div>

            <div className="zl-perf">
              <div className="zl-panel zl-reveal">
                <div className="zl-panel-head">
                  P&amp;L breakdown <span>Sample</span>
                </div>
                {BREAKDOWN.map((row) => (
                  <div key={row.label} className="zl-bd-row">
                    <span className="zl-bd-lbl">{row.label}</span>
                    <span className={`zl-bd-val ${row.tone === "up" ? "zl-up" : ""}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
                <div className="zl-bd-total">
                  <span className="zl-bd-lbl">Total return</span>
                  <span className="zl-bd-val zl-up">+₹1,62,340 <span>+14.9%</span></span>
                </div>
              </div>

              <div className="zl-panel zl-reveal" style={delay(80)}>
                <div className="zl-panel-head">
                  Sector allocation <span>Sample</span>
                </div>
                <div className="zl-bars">
                  {BARS.map((b) => (
                    <div key={b.name} className="zl-bar-row">
                      <span className="zl-bar-name">{b.name}</span>
                      <span className="zl-bar-track">
                        <span
                          className="zl-bar-fill"
                          data-tone={b.tone}
                          style={{ width: `${(b.pct / 34) * 100}%` }}
                        />
                      </span>
                      <span className="zl-bar-val">{b.value} · {b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="zl-insight zl-reveal">
              <span className="zl-insight-lbl"><Sparkles aria-hidden="true" /> AI insight — sample</span>
              <p>
                Financials make up 34% of this portfolio. A 10% move in the sector
                would swing the total by about ₹42,400.
              </p>
              <p className="zl-insight-note">
                AI insights are a starting point for your own research — not investment advice.
              </p>
            </div>

            <p className="zl-sample-cap">Sample data — for illustration only</p>
          </div>
        </section>

        {/* ── Workflow ── */}
        <section id="workflow" className="zl-section" aria-labelledby="zl-workflow-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">03 · Getting started</p>
                <h2 id="zl-workflow-title" className="zl-h2">
                  Signup to statement in <em>three</em> steps.
                </h2>
              </div>
              <p className="zl-sub zl-head-aside">
                An email address and the holdings you already own are all it takes
                to get set up.
              </p>
            </div>
            <ol className="zl-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="zl-step zl-reveal" style={delay(90 * index)}>
                  <span className="zl-step-num" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3><span className="zl-sr">Step {index + 1}: </span>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Security & privacy ── */}
        <section id="security" className="zl-section" aria-labelledby="zl-security-title">
          <div className="zl-wrap">
            <div className="zl-head zl-reveal">
              <p className="zl-kicker">04 · Security &amp; privacy</p>
              <h2 id="zl-security-title" className="zl-h2">
                Private by <em>design</em>.
              </h2>
              <p className="zl-sub">
                A portfolio says a lot about you. ZenFolio is built so it is only
                ever visible to the account that owns it.
              </p>
            </div>
            <div className="zl-terms zl-reveal">
              {TERMS.map((term) => (
                <div key={term.key} className="zl-term">
                  <span className="zl-term-key">{term.key}</span>
                  <p>{term.body}</p>
                </div>
              ))}
            </div>
            <p className="zl-note">
              ZenFolio is a tracking and planning tool, not investment advice.
            </p>
          </div>
        </section>

        {/* ── Markets & data ── */}
        <section id="markets" className="zl-section" aria-labelledby="zl-markets-title">
          <div className="zl-wrap">
            <div className="zl-head zl-reveal">
              <p className="zl-kicker">05 · Markets &amp; data</p>
              <h2 id="zl-markets-title" className="zl-h2">
                Built for the markets <em>you</em> trade.
              </h2>
            </div>
            <div className="zl-reveal">
              <span className="zl-spec-live" title={market.description}>
                <span
                  className="zl-pulse"
                  aria-hidden="true"
                  style={{ background: market.isOpen ? "hsl(var(--profit))" : undefined }}
                />
                NSE {marketLabel} · {market.istTime} IST
              </span>
              <div className="zl-spec">
                {SPEC.map((cell) => (
                  <div key={cell.key} className="zl-spec-cell">
                    <span className="zl-spec-key">{cell.key}</span>
                    <span className="zl-spec-val">{cell.value}</span>
                    <p>{cell.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="zl-section zl-section-cta" aria-labelledby="zl-final-title">
          <div className="zl-wrap">
            <div className="zl-final zl-reveal">
              <div className="zl-final-copy">
                <p className="zl-kicker">Begin · Free account</p>
                <h2 id="zl-final-title">Your first statement is <em>minutes</em> away.</h2>
                <p>
                  Create a free account, add your first holding, and get the full
                  picture in one place.
                </p>
              </div>
              <div className="zl-cta-row">
                <RouteLink to="/signup" className="zl-btn zl-btn-light">
                  Get started <ArrowRight aria-hidden="true" />
                </RouteLink>
                <RouteLink to="/login" className="zl-btn zl-btn-outline-light">Sign in</RouteLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="zl-footer">
        <div className="zl-wrap">
          <div className="zl-foot">
            <div>
              <RouteLink to="/" className="zl-brand" aria-label="ZenFolio home">
                <LogoMark size={26} />
                <span className="zl-brand-name">ZenFolio</span>
              </RouteLink>
              <p className="zl-foot-tag">The calm portfolio tracker for Indian equities.</p>
            </div>
            <nav className="zl-foot-col" aria-label="Product links">
              <h2 className="zl-foot-h">Product</h2>
              <ul>
                {SECTIONS.map((section) => (
                  <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>
                ))}
              </ul>
            </nav>
            <nav className="zl-foot-col" aria-label="Account links">
              <h2 className="zl-foot-h">Account</h2>
              <ul>
                <li><RouteLink to="/login">Sign in</RouteLink></li>
                <li><RouteLink to="/signup">Create account</RouteLink></li>
              </ul>
            </nav>
          </div>
          <div className="zl-legal">
            <span>© {new Date().getFullYear()} ZenFolio</span>
            <span>Not investment advice. Figures shown on this page are sample data.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
