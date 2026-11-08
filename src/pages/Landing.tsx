import { useRef, type CSSProperties } from "react";
import { RouteLink } from "@/components/RouteTransition";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  BookOpen,
  Clock,
  Crosshair,
  FileSpreadsheet,
  Layers,
  Lock,
  PieChart,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import LogoMark from "@/components/LogoMark";
import LandingNav, { SECTIONS } from "@/components/landing/LandingNav";
import DashboardPreview from "@/components/landing/DashboardPreview";
import HeroScene from "@/components/landing/HeroScene";
import ScrollStory from "@/components/landing/ScrollStory";
import { FestivalCanvas, type FestivalZoneSpec } from "@/components/events/FestivalCanvas";
import { FestivalGreeting } from "@/components/events/FestivalGreeting";
import { FestivalWash } from "@/components/events/FestivalWash";
import { useReveal } from "@/components/landing/useReveal";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import "@/styles/landing.css";

const delay = (ms: number) => ({ "--zl-d": `${ms}ms` }) as CSSProperties;

/**
 * What the celebration may not paint over. Measured live, so the sky is the
 * space the layout actually left over at this viewport — not a guess.
 */
const HERO_ZONES: readonly FestivalZoneSpec[] = [
  { role: "copy", selector: ".zl-hero-copy" },
  { role: "hud", selector: ".zl-hud" },
  { role: "market", selector: ".zl-hud-chip" },
  { role: "chip", selector: ".zl-hero-visual > .fest-chip" },
  { role: "note", selector: ".zl-stage-note" },
];

const CAPABILITIES = [
  {
    icon: PieChart,
    title: "Holdings & P&L",
    body: "Invested, current value and profit or loss per position, totalled in ₹. Price and FX P&L stay separate, so a currency move never reads as a stock call.",
  },
  {
    icon: Crosshair,
    title: "Watchlist with a plan",
    body: "Write it down before you buy: entry zone, stop-loss and three targets, with RSI and moving averages for context.",
  },
  {
    icon: BellRing,
    title: "Price alerts",
    body: "Set a level above or below the current price and see at a glance which alerts have already triggered.",
  },
  {
    icon: BookOpen,
    title: "Trade journal",
    body: "Log closed trades, review the history and track how each strategy is working over time.",
  },
  {
    icon: Layers,
    title: "F&O positions",
    body: "Futures and options next to your equity holdings, with premiums fetched for open contracts.",
  },
  {
    icon: FileSpreadsheet,
    title: "Import & export",
    body: "Bring past trades in from CSV or Excel, and take your portfolio out whenever you want it.",
  },
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

const ALSO = [
  { icon: Sparkles, label: "AI portfolio insights" },
  { icon: ShieldCheck, label: "Risk analysis" },
  { icon: FileSpreadsheet, label: "CSV / XLSX import" },
] as const;

const Landing = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);
  const market = useMarketStatus();
  const marketLabel = market.isOpen ? "Market live" : market.phase === "pre-open" ? "Pre-open" : "Market closed";

  return (
    <div ref={rootRef} className="zl">
      <a href="#zl-main" className="zl-skip">Skip to content</a>
      <div className="zl-atmos" aria-hidden="true" />

      <LandingNav />

      <main id="zl-main" tabIndex={-1} style={{ outline: "none" }}>
        {/* ── Hero ── */}
        <section className="zl-hero" aria-labelledby="zl-hero-title" data-festival-scope>
          {/* Seasonal detail: decorative, non-interactive, absent when no event is active. */}
          <FestivalWash />
          <HeroScene className="zl-hero-scene" />
          <div className="zl-hero-scrim" aria-hidden="true" />
          <FestivalCanvas variant="public-hero" garnishInset={4} zones={HERO_ZONES} />
          <div className="zl-wrap zl-hero-grid">
            <div className="zl-hero-copy">
              <span className="zl-eyebrow zl-in">
                <span className="zl-eyebrow-dot" aria-hidden="true"><Sparkles size={11} /></span>
                Portfolio intelligence for Indian markets
              </span>
              <h1 id="zl-hero-title" className="zl-h1 zl-in zl-in-1">
                Your wealth. <em>One clear</em> perspective.
              </h1>
              <p className="zl-lede zl-in zl-in-2">
                Track your investments, understand your portfolio and make informed decisions
                from one intelligent workspace.
              </p>
              <div className="zl-cta-row zl-in zl-in-3">
                <RouteLink to="/signup" className="zl-btn zl-btn-primary">
                  Get started <ArrowRight aria-hidden="true" />
                </RouteLink>
                <a href="#story" className="zl-btn zl-btn-ghost">
                  Explore ZenFolio <ArrowDown aria-hidden="true" />
                </a>
              </div>
              <p className="zl-hero-signin zl-in zl-in-3">
                Already have an account? <RouteLink to="/login">Sign in</RouteLink>
              </p>
              <ul className="zl-hero-meta zl-in zl-in-4">
                <li><Lock aria-hidden="true" />Private to your account</li>
                <li><Clock aria-hidden="true" />IST market hours</li>
                <li><FileSpreadsheet aria-hidden="true" />CSV &amp; XLSX import</li>
              </ul>
            </div>

            <div className="zl-hero-visual zl-in-preview">
              <div className="zl-hud">
                <div className="zl-hud-head">
                  <span className="zl-hud-label">Portfolio value</span>
                  <span className="zl-hud-tag">Sample data</span>
                </div>
                <div className="zl-hud-value">₹12,48,560</div>
                <div className="zl-hud-delta">
                  <ArrowUpRight aria-hidden="true" /> +₹1,62,340 <span>+14.9%</span>
                </div>
                <div className="zl-hud-split" aria-hidden="true">
                  <span style={{ width: "34%" }} />
                  <span style={{ width: "22%" }} />
                  <span style={{ width: "18%" }} />
                  <span style={{ width: "14%" }} />
                  <span style={{ width: "12%" }} />
                </div>
                <div className="zl-hud-foot">
                  <span><i aria-hidden="true" />9 holdings</span>
                  <span><i aria-hidden="true" />4 sectors</span>
                  <span><i aria-hidden="true" />NSE · US</span>
                </div>
              </div>
              <div className="zl-hud-chip" data-live={market.isOpen ? "1" : "0"} title={market.description}>
                <span className="zl-pulse" aria-hidden="true" />
                {marketLabel} · {market.istTime} IST
              </div>
              <FestivalGreeting surface="public-hero" />
              <p className="zl-stage-note">Illustrative scene with sample data.</p>
            </div>
          </div>

          <a className="zl-scroll-cue" href="#story" aria-label="Scroll to the product story">
            <span>Scroll</span>
            <ArrowDown aria-hidden="true" />
          </a>
        </section>

        {/* ── Pinned narrative ── */}
        <ScrollStory />

        {/* ── Product ── */}
        <section id="product" className="zl-section" aria-labelledby="zl-product-title">
          <div className="zl-wrap">
            <div className="zl-head zl-head-split zl-reveal">
              <div>
                <p className="zl-kicker">The product</p>
                <h2 id="zl-product-title" className="zl-h2">
                  Everything you track, <em>without</em> the spreadsheet.
                </h2>
              </div>
              <p className="zl-sub zl-head-aside">
                The tools an active Indian investor reaches for every day, in one workspace that
                keeps the numbers readable.
              </p>
            </div>

            <div className="zl-product-grid">
              <div className="zl-product-frame zl-reveal">
                <DashboardPreview />
              </div>

              <ul className="zl-capabilities zl-reveal" style={delay(80)}>
                {CAPABILITIES.map((item) => (
                  <li key={item.title} className="zl-capability">
                    <span className="zl-capability-icon" aria-hidden="true"><item.icon /></span>
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
                {ALSO.map((item) => (
                  <li key={item.label}><item.icon aria-hidden="true" />{item.label}</li>
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
              {STEPS.map((step, index) => (
                <li key={step.title} className="zl-step zl-reveal" style={delay(90 * index)}>
                  <span className="zl-step-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <h3><span className="zl-sr">Step {index + 1}: </span>{step.title}</h3>
                  <p>{step.body}</p>
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
                A portfolio says a lot about you. ZenFolio is designed so it's only ever visible to
                the account that owns it.
              </p>
              <p className="zl-note">
                ZenFolio is a tracking and planning tool. It isn't investment advice, and AI insights
                are a starting point for your own research.
              </p>
            </div>
            <ul className="zl-facts zl-reveal" style={delay(80)}>
              {FACTS.map((fact) => (
                <li key={fact.title} className="zl-fact">
                  <fact.icon aria-hidden="true" />
                  <h3>{fact.title}</h3>
                  <p>{fact.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="zl-section zl-section-cta" aria-labelledby="zl-final-title">
          <div className="zl-wrap">
            <div className="zl-final zl-reveal">
              <div className="zl-final-glow" aria-hidden="true" />
              <div className="zl-final-copy">
                <p className="zl-kicker">Begin</p>
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
                {SECTIONS.map((section) => (
                  <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>
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
