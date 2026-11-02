import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, BellRing, Layers, PieChart, TrendingUp } from "lucide-react";

/**
 * Pinned three-chapter narrative. The page stays a normal scroll: the stage is
 * `position: sticky` inside a tall section and progress is written to a CSS
 * variable, so there is no scroll hijacking and no library to wait for.
 * Below 900px or with reduced motion the chapters stack and every one is shown.
 */

const SECTORS = [
  { name: "Financials", pct: 34, tone: "1" },
  { name: "IT", pct: 22, tone: "2" },
  { name: "Energy", pct: 18, tone: "3" },
  { name: "Auto", pct: 14, tone: "4" },
  { name: "Other", pct: 12, tone: "5" },
] as const;

const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function AllocationVisual() {
  let offset = 0;
  return (
    <div className="zl-viz zl-viz-allocation">
      <div className="zl-ring" aria-hidden="true">
        <svg viewBox="0 0 200 200" focusable="false">
          <circle className="zl-ring-track" cx="100" cy="100" r={RADIUS} />
          {SECTORS.map((sector) => {
            const length = (sector.pct / 100) * CIRCUMFERENCE;
            const dash = `${Math.max(length - 3, 0)} ${CIRCUMFERENCE}`;
            const rotation = (offset / CIRCUMFERENCE) * 360 - 90;
            offset += length;
            return (
              <circle
                key={sector.name}
                className="zl-ring-seg"
                data-tone={sector.tone}
                cx="100"
                cy="100"
                r={RADIUS}
                strokeDasharray={dash}
                transform={`rotate(${rotation} 100 100)`}
              />
            );
          })}
        </svg>
        <div className="zl-ring-center">
          <span>Portfolio</span>
          <strong>₹12.49L</strong>
          <em>
            <ArrowUpRight aria-hidden="true" /> +14.9%
          </em>
        </div>
      </div>
      <ul className="zl-legend">
        {SECTORS.map((sector) => (
          <li key={sector.name}>
            <i data-tone={sector.tone} aria-hidden="true" />
            <span>{sector.name}</span>
            <strong>{sector.pct}%</strong>
          </li>
        ))}
      </ul>
      <p className="zl-viz-cap">Sample data</p>
    </div>
  );
}

const LINE =
  "M0 96 C 24 92, 40 100, 62 84 S 98 74, 118 80 S 150 58, 172 64 S 208 40, 232 46 S 268 26, 292 32 S 324 14, 348 18";

function MarketVisual() {
  return (
    <div className="zl-viz zl-viz-market">
      <div className="zl-ticker" aria-hidden="true">
        <span className="zl-ticker-name">NIFTY 50</span>
        <span className="zl-ticker-val">24,318.40</span>
        <span className="zl-ticker-delta zl-up">
          <ArrowUpRight aria-hidden="true" /> +0.68%
        </span>
      </div>
      <svg className="zl-market-chart" viewBox="0 0 348 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="zl-story-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity=".32" />
            <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 60, 90].map((y) => (
          <line key={y} x1="0" x2="348" y1={y} y2={y} className="zl-market-grid" />
        ))}
        <line x1="0" x2="348" y1="52" y2="52" className="zl-market-level" />
        <path d={`${LINE} L 348 120 L 0 120 Z`} fill="url(#zl-story-area)" />
        <path d={LINE} className="zl-market-line" />
        <circle cx="348" cy="18" r="4" className="zl-market-dot" />
      </svg>
      <ul className="zl-market-meta">
        <li><span>Open</span><strong>24,102</strong></li>
        <li><span>Day range</span><strong>24,058 – 24,364</strong></li>
        <li><span>Your level</span><strong>24,250</strong></li>
      </ul>
      <p className="zl-viz-cap">Sample data</p>
    </div>
  );
}

function PlanVisual() {
  return (
    <div className="zl-viz zl-viz-plan">
      <div className="zl-plan-row">
        <span className="zl-plan-icon" aria-hidden="true"><TrendingUp /></span>
        <span className="zl-plan-body">
          <strong>TATAMOTORS</strong>
          <span>Entry ₹910–940 · SL ₹872</span>
        </span>
        <span className="zl-plan-badge" data-tone="ok">In zone</span>
      </div>
      <div className="zl-plan-row">
        <span className="zl-plan-icon" aria-hidden="true"><Layers /></span>
        <span className="zl-plan-body">
          <strong>INFY · Feb 1480 CE</strong>
          <span>1 lot · premium ₹38.40</span>
        </span>
        <span className="zl-plan-badge" data-tone="muted">Open</span>
      </div>
      <div className="zl-plan-row">
        <span className="zl-plan-icon" aria-hidden="true"><BellRing /></span>
        <span className="zl-plan-body">
          <strong>Alert · HDFCBANK</strong>
          <span>Notify at ≥ ₹1,720</span>
        </span>
        <span className="zl-plan-badge" data-tone="ok">Armed</span>
      </div>
      <div className="zl-plan-foot">
        <span className="zl-plan-foot-label">Journal</span>
        <span className="zl-plan-foot-val zl-up"><ArrowUpRight aria-hidden="true" /> 18 closed · 61% win rate</span>
        <span className="zl-plan-foot-val zl-down"><ArrowDownRight aria-hidden="true" /> avg −1.8R on losses</span>
      </div>
      <p className="zl-viz-cap">Sample data</p>
    </div>
  );
}

type Chapter = {
  kicker: string;
  title: ReactNode;
  body: string;
  points: string[];
  icon: typeof PieChart;
  visual: ReactNode;
};

const CHAPTERS: Chapter[] = [
  {
    kicker: "Portfolio intelligence",
    title: <>Every position in <em>one clear frame</em>.</>,
    body:
      "Invested, current and profit or loss per position, with the sector mix that shows where the risk actually sits — across NSE, BSE and U.S. listings.",
    points: ["Holdings in native currency, totalled in ₹", "Sector concentration before it becomes a problem", "Price and FX P&L kept separate"],
    icon: PieChart,
    visual: <AllocationVisual />,
  },
  {
    kicker: "Market clarity",
    title: <>Price, with the <em>context</em> that matters.</>,
    body:
      "Candles, index movement and the levels you set yourself, so a green day never hides a broken thesis.",
    points: ["Live quotes for NSE and U.S. symbols", "Candle history with a last-close fallback", "Market status in Asia/Kolkata time"],
    icon: TrendingUp,
    visual: <MarketVisual />,
  },
  {
    kicker: "Unified tracking",
    title: <>The plan sits <em>beside</em> the position.</>,
    body:
      "Watchlist setups, price alerts, a trade journal and F&O positions share the same workspace as your holdings.",
    points: ["Entry zone, stop-loss and three targets", "Alerts that show what has already triggered", "FIFO history for closed trades"],
    icon: Layers,
    visual: <PlanVisual />,
  },
];

export default function ScrollStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia?.("(min-width: 901px)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (reduced?.matches || wide?.matches === false) {
        section.style.setProperty("--story", "0");
        setActive(0);
        return;
      }
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const progress = total > 0 ? Math.max(0, Math.min(1, -rect.top / total)) : 0;
      section.style.setProperty("--story", progress.toFixed(4));
      const next = Math.min(CHAPTERS.length - 1, Math.floor(progress * CHAPTERS.length));
      setActive((previous) => (previous === next ? previous : next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={sectionRef} id="story" className="zl-story" aria-labelledby="zl-story-title">
      <div className="zl-story-stage">
        <div className="zl-wrap zl-story-head">
          <p className="zl-kicker">The workspace</p>
          <h2 id="zl-story-title" className="zl-story-title">
            One surface from position to <em>decision</em>.
          </h2>
        </div>

        <div className="zl-wrap zl-story-track">
          {CHAPTERS.map((chapter, index) => {
            const Icon = chapter.icon;
            return (
              <article
                key={chapter.kicker}
                className={`zl-chapter${index === active ? " is-active" : ""}`}
                data-chapter={index}
              >
                <div className="zl-chapter-copy">
                  <span className="zl-chapter-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="zl-kicker">
                    <Icon aria-hidden="true" /> {chapter.kicker}
                  </p>
                  <h3 className="zl-chapter-title">{chapter.title}</h3>
                  <p className="zl-sub">{chapter.body}</p>
                  <ul className="zl-chapter-points">
                    {chapter.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </div>
                <div className="zl-chapter-visual">{chapter.visual}</div>
              </article>
            );
          })}
        </div>

        <div className="zl-story-rail" aria-hidden="true">
          <span className="zl-story-rail-track">
            <i />
          </span>
          <ol>
            {CHAPTERS.map((chapter, index) => (
              <li key={chapter.kicker} data-on={index === active ? "" : undefined}>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
