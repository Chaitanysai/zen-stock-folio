import { useRef, type CSSProperties } from "react";
import { RouteLink } from "@/components/RouteTransition";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Clock,
  Crosshair,
  FileSpreadsheet,
  Layers,
  LineChart,
  Lock,
  Newspaper,
  PieChart,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import LogoMark from "@/components/LogoMark";
import LandingNav, { SECTIONS } from "@/components/landing/LandingNav";
import DashboardPreview from "@/components/landing/DashboardPreview";
import { useReveal } from "@/components/landing/useReveal";
import "@/styles/landing.css";

const delay = (ms: number) => ({ "--zl-d": `${ms}ms` }) as CSSProperties;

const FEATURES = [
  {
    icon: Crosshair,
    title: "Watchlist with trade setups",
    body: "Write the plan down before you buy: entry zone, stop-loss, three targets, plus RSI and moving averages for context.",
    tags: ["Entry zone", "Stop-loss", "T1 · T2 · T3"],
  },
  {
    icon: BellRing,
    title: "Price alerts",
    body: "Set a level above or below the current price and see at a glance which alerts have triggered.",
    tags: ["Price ≥", "Price ≤"],
  },
  {
    icon: BookOpen,
    title: "Trade journal",
    body: "Log closed trades, review your history and track how each strategy is working over time.",
    tags: ["History", "Strategies"],
  },
  {
    icon: Layers,
    title: "F&O positions",
    body: "Track futures and options next to your equity holdings, with premiums fetched for open contracts.",
    tags: ["Futures", "CE / PE"],
  },
] as const;

const ALSO = [
  { icon: Sparkles, label: "AI portfolio insights" },
  { icon: Newspaper, label: "News for your holdings" },
  { icon: ShieldCheck, label: "Risk analysis" },
  { icon: LineChart, label: "Portfolio charts" },
  { icon: FileSpreadsheet, label: "CSV / XLSX import & export" },
] as const;

const STEPS = [
  {
    title: "Create your account",
    body: "Sign up with your email. Your portfolio is tied to your account from the first holding.",
  },
  {
    title: "Bring in your holdings",
    body: "Add positions one by one, or import past trades from a CSV or Excel file using the template.",
  },
  {
    title: "Track and plan",
    body: "Follow P&L and sector mix, keep a watchlist with trade setups, and set alerts for the levels you care about.",
  },
] as const;

const FACTS = [
  {
    icon: Lock,
    title: "Your data stays in your account",
    body: "Every read and write is checked against the signed-in user, so one account can never load another account's portfolio.",
  },
  {
    icon: UserCheck,
    title: "Clean sign-out",
    body: "Signing out or switching accounts clears the portfolio cached on that device.",
  },
  {
    icon: Clock,
    title: "Indian market hours",
    body: "Market status follows Asia/Kolkata time and the NSE trading-holiday calendar.",
  },
  {
    icon: Wallet,
    title: "Tracking only",
    body: "ZenFolio doesn't connect to your broker to place orders. It's a place to see and plan, not to trade.",
  },
] as const;

const SECTORS = [
  { name: "Financials", pct: 34, color: "hsl(var(--chart-1))" },
  { name: "IT", pct: 22, color: "hsl(var(--chart-2))" },
  { name: "Energy", pct: 18, color: "hsl(var(--chart-3))" },
  { name: "Auto", pct: 14, color: "hsl(var(--chart-4))" },
] as const;

const Landing = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);

  return (
    <div ref={rootRef} className="zl">
      <a href="#zl-main" className="zl-skip">Skip to content</a>
      <div className="zl-atmos" aria-hidden="true" />

      <LandingNav />

      <main id="zl-main" tabIndex={-1} style={{ outline: "none" }}>
        {/* ── Hero ── */}
        <section className="zl-hero" aria-labelledby="zl-hero-title">
          <div className="zl-wrap zl-hero-grid">
            <div className="zl-hero-copy">
              <span className="zl-eyebrow zl-in">
                <span className="zl-eyebrow-dot" aria-hidden="true"><LineChart size={11} /></span>
                Portfolio tracker for NSE &amp; BSE investors
              </span>
              <h1 id="zl-hero-title" className="zl-h1 zl-in zl-in-1">
                Your whole portfolio, <em>calmly</em> in one place.
              </h1>
              <p className="zl-lede zl-in zl-in-2">
                ZenFolio brings your holdings, watchlist, trade journal and F&amp;O positions into one
                clear dashboard, so you can see where you stand and plan the next move with a level head.
              </p>
              <div className="zl-cta-row zl-in zl-in-3">
                <RouteLink to="/signup" className="zl-btn zl-btn-primary">
                  Create free account <ArrowRight aria-hidden="true" />
                </RouteLink>
                <RouteLink to="/login" className="zl-btn zl-btn-ghost">Sign in</RouteLink>
              </div>
              <ul className="zl-hero-meta zl-in zl-in-4">
                <li><Lock aria-hidden="true" />Private to your account</li>
                <li><Clock aria-hidden="true" />IST market hours</li>
                <li><FileSpreadsheet aria-hidden="true" />CSV &amp; XLSX import</li>
              </ul>
            </div>

            <DashboardPreview />
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="zl-section" aria-labelledby="zl-features-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">Features</p>
                <h2 id="zl-features-title" className="zl-h2">Everything you track, <em>without</em> the spreadsheet.</h2>
              </div>
              <p className="zl-sub zl-head-aside">
                The tools an active Indian investor reaches for every day, in one workspace that keeps the numbers readable.
              </p>
            </div>

            <div className="zl-bento">
              <article className="zl-card zl-card-wide zl-reveal">
                <div className="zl-card-wide-grid">
                  <div>
                    <span className="zl-card-icon" aria-hidden="true"><PieChart /></span>
                    <h3>Holdings, P&amp;L and sector mix</h3>
                    <p>
                      See invested value, current value and profit or loss per position, then check how your
                      money is spread across sectors before concentration becomes a problem.
                    </p>
                    <ul className="zl-card-tags">
                      <li>Holdings table</li><li>Sector diversification</li><li>All values in ₹</li>
                    </ul>
                  </div>
                  <div className="zl-mini" aria-label="Sample sector allocation" role="img">
                    {SECTORS.map((s) => (
                      <div key={s.name} className="zl-mini-row" aria-hidden="true">
                        <span>{s.name}</span>
                        <span className="zl-mini-track"><i style={{ width: `${s.pct * 2.4}%`, background: s.color }} /></span>
                        <span>{s.pct}%</span>
                      </div>
                    ))}
                    <p className="zl-mini-cap">Sample data</p>
                  </div>
                </div>
              </article>

              {FEATURES.map((f, i) => (
                <article key={f.title} className="zl-card zl-reveal" style={delay(60 * (i + 1))}>
                  <span className="zl-card-icon" aria-hidden="true"><f.icon /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ul className="zl-card-tags">
                    {f.tags.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </article>
              ))}
            </div>

            <div className="zl-also zl-reveal">
              <span className="zl-also-lbl">Also included</span>
              <ul>
                {ALSO.map((a) => (
                  <li key={a.label}><a.icon aria-hidden="true" />{a.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Workflow ── */}
        <section id="workflow" className="zl-section" aria-labelledby="zl-workflow-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">How it works</p>
                <h2 id="zl-workflow-title" className="zl-h2">Set up in minutes, <em>not</em> a weekend.</h2>
              </div>
              <p className="zl-sub zl-head-aside">
                An email address and the holdings you already own are all it takes to get set up.
              </p>
            </div>
            <ol className="zl-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="zl-step zl-reveal" style={delay(90 * i)}>
                  <span className="zl-step-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <h3><span className="zl-sr">Step {i + 1}: </span>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Trust ── */}
        <section id="trust" className="zl-section" aria-labelledby="zl-trust-title">
          <div className="zl-wrap zl-trust">
            <div className="zl-trust-copy zl-reveal">
              <p className="zl-kicker">Your data</p>
              <h2 id="zl-trust-title" className="zl-h2">Built to keep your portfolio <em>yours</em>.</h2>
              <p className="zl-sub">
                A portfolio says a lot about you. ZenFolio is designed so it's only ever visible to the account that owns it.
              </p>
              <p className="zl-note">
                ZenFolio is a tracking and planning tool. It isn't investment advice, and AI insights are a
                starting point for your own research.
              </p>
            </div>
            <ul className="zl-facts zl-reveal" style={delay(80)}>
              {FACTS.map((f) => (
                <li key={f.title} className="zl-fact">
                  <f.icon aria-hidden="true" />
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="zl-section" aria-labelledby="zl-final-title" style={{ borderTop: "none", paddingBottom: 0 }}>
          <div className="zl-wrap">
            <div className="zl-final zl-reveal">
              <div>
                <h2 id="zl-final-title">See your portfolio <em>clearly</em>, starting today.</h2>
                <p>Create a free account, add your first holding, and get the full picture in one place.</p>
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
                <LogoMark size={28} />
                <span className="zl-brand-name">ZenFolio</span>
              </RouteLink>
              <p className="zl-foot-tag">A calm portfolio tracker for Indian equities.</p>
            </div>
            <nav aria-label="Footer">
              <ul>
                {SECTIONS.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>
                ))}
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
