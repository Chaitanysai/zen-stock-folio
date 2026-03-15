/**
 * StockNewsFeed.tsx — News feed for portfolio holdings
 * Drop into: src/components/StockNewsFeed.tsx
 *
 * Usage:
 *   import StockNewsFeed from "@/components/StockNewsFeed";
 *   <StockNewsFeed stocks={portfolioStocks} />
 *
 * Features:
 *  - Per-ticker news tabs with live sentiment dot
 *  - Sentiment summary bar (Positive / Neutral / Negative counts)
 *  - Skeleton loading states
 *  - Auto-refresh every 5 min
 *  - Graceful mock-data fallback while /api/news isn't wired up
 *  - Full dark mode support (matches your existing .dark CSS variables)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Newspaper, RefreshCw, ExternalLink, TrendingUp,
  TrendingDown, Minus, Clock, Wifi, WifiOff,
} from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NewsItem {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface Props {
  stocks: PortfolioStock[];
}

// ─── Theme tokens — mirrors your existing T object in AIInsights.tsx ──────────
const T = {
  navy:     "#1c3557",
  navyPale: "#eef4fc",
  navyBd:   "rgba(28,53,87,.12)",
  navyTint: "rgba(28,53,87,.06)",
  bg:       "#ffffff",
  bgSurf:   "#f8f9fc",
  bgPage:   "#f4f6f9",
  bdMid:    "#e5e7eb",
  bdSoft:   "#f0f2f5",
  txHi:     "#111827",
  txMed:    "#4b5563",
  txLo:     "#6b7280",
  txGhost:  "#9ca3af",
  profit:   "#059669",
  profitBg: "#ecfdf5",
  profitBd: "#a7f3d0",
  loss:     "#dc2626",
  lossBg:   "#fef2f2",
  lossBd:   "#fecaca",
  warn:     "#d97706",
  shadow:   "0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function sentimentConfig(s: NewsItem["sentiment"]) {
  if (s === "positive") return { Icon: TrendingUp,   color: T.profit, bg: T.profitBg, bd: T.profitBd, label: "Positive" };
  if (s === "negative") return { Icon: TrendingDown, color: T.loss,   bg: T.lossBg,   bd: T.lossBd,   label: "Negative" };
  return                       { Icon: Minus,        color: T.txLo,   bg: T.bgSurf,   bd: T.bdMid,    label: "Neutral"  };
}

// ─── Mock news generator (fallback until /api/news is wired up) ───────────────
function getMockNews(tickers: string[]): NewsItem[] {
  const sources   = ["Economic Times", "Moneycontrol", "Business Standard", "Mint", "NDTV Profit"];
  const templates = [
    { h: "{t} Q3 results: Net profit surges 28% YoY, beats estimates",     s: "positive" as const },
    { h: "{t} announces ₹500 Cr buyback; board approves at premium",        s: "positive" as const },
    { h: "Analysts upgrade {t} to 'Buy'; raise target to ₹{p}",            s: "positive" as const },
    { h: "{t} board approves 1:2 bonus share issue for shareholders",       s: "positive" as const },
    { h: "{t} Q3 profit misses estimates; margins under pressure",           s: "negative" as const },
    { h: "Promoters of {t} offload 2.4% stake via open market block deal",  s: "negative" as const },
    { h: "{t} faces regulatory scrutiny; SEBI initiates inquiry",            s: "negative" as const },
    { h: "{t} revises FY25 guidance downward amid weak demand outlook",      s: "negative" as const },
    { h: "{t} trading flat ahead of quarterly earnings release",              s: "neutral"  as const },
    { h: "Mutual funds increase {t} stake by 1.1% in December quarter",     s: "neutral"  as const },
    { h: "{t} AGM: Management signals cautious optimism for H2 FY25",       s: "neutral"  as const },
    { h: "{t} secures major export contract worth ₹{p} Cr",                 s: "positive" as const },
  ];
  const summaries: Record<NewsItem["sentiment"], string> = {
    positive: "Strong fundamentals and improving business metrics are driving investor confidence. Analysts remain bullish on the medium-term outlook.",
    negative: "Weak quarterly performance and macro headwinds have dented investor sentiment. Analysts advise caution in the near term.",
    neutral:  "Markets await further clarity on business trajectory. No major catalysts expected in the short term. Investors remain watchful.",
  };

  const items: NewsItem[] = [];
  let id = 0;
  tickers.forEach((ticker, ti) => {
    const shuffled = [...templates].sort(() => Math.random() - 0.5).slice(0, 3);
    shuffled.forEach((tmpl, ni) => {
      const price = Math.floor(Math.random() * 3000 + 200);
      items.push({
        id:          `mock-${++id}`,
        ticker,
        headline:    tmpl.h.replace("{t}", ticker).replace("{p}", String(price)),
        summary:     summaries[tmpl.s],
        source:      sources[(ti + ni) % sources.length],
        url:         "#",
        publishedAt: new Date(Date.now() - (id * 47 + ni * 180) * 60000).toISOString(),
        sentiment:   tmpl.s,
      });
    });
  });
  return items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function NewsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ padding: "16px 20px", borderBottom: `1px solid ${T.bdSoft}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: T.bgSurf, flexShrink: 0,
              animation: "news-pulse 1.4s ease infinite",
              animationDelay: `${i * 120}ms`,
            }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 13, borderRadius: 6, background: T.bgSurf, width: "85%", animation: "news-pulse 1.4s ease infinite", animationDelay: `${i * 100}ms` }} />
              <div style={{ height: 13, borderRadius: 6, background: T.bgSurf, width: "65%", animation: "news-pulse 1.4s ease infinite", animationDelay: `${i * 80}ms`  }} />
              <div style={{ height: 11, borderRadius: 6, background: T.bgSurf, width: "38%", animation: "news-pulse 1.4s ease infinite", animationDelay: `${i * 60}ms`  }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Single news card ─────────────────────────────────────────────────────────
function NewsCard({ item, showTicker }: { item: NewsItem; showTicker: boolean }) {
  const [hovered, setHovered] = useState(false);
  const sc = sentimentConfig(item.sentiment);
  const { Icon } = sc;

  return (
    <a
      href={item.url === "#" ? undefined : item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card"
      style={{
        display: "block",
        padding: "15px 20px",
        borderBottom: `1px solid ${T.bdSoft}`,
        background: hovered ? T.bgSurf : T.bg,
        transition: "background .13s",
        cursor: item.url === "#" ? "default" : "pointer",
        textDecoration: "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* Sentiment icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: sc.bg, border: `1px solid ${sc.bd}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: 1,
        }}>
          <Icon size={16} color={sc.color} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Badges row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
            {showTicker && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                background: T.navyPale, color: T.navy, border: `1px solid ${T.navyBd}`,
                letterSpacing: ".04em",
              }}>
                {item.ticker}
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
              background: sc.bg, color: sc.color, border: `1px solid ${sc.bd}`,
            }}>
              {sc.label}
            </span>
            <span style={{
              fontSize: 10, color: T.txGhost, marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 3,
            }}>
              <Clock size={9} /> {timeAgo(item.publishedAt)}
            </span>
          </div>

          {/* Headline */}
          <div className="news-headline" style={{
            fontSize: 13, fontWeight: 600, color: T.txHi, lineHeight: 1.45, marginBottom: 5,
          }}>
            {item.headline}
            {item.url !== "#" && hovered && (
              <ExternalLink size={11} color={T.txGhost} style={{ display: "inline", marginLeft: 5, verticalAlign: "middle" }} />
            )}
          </div>

          {/* Summary */}
          <div className="news-summary" style={{
            fontSize: 11.5, color: T.txLo, lineHeight: 1.55,
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {item.summary}
          </div>

          {/* Source */}
          <div className="news-source" style={{ marginTop: 6, fontSize: 10.5, color: T.txGhost, fontWeight: 500 }}>
            {item.source}
          </div>
        </div>
      </div>
    </a>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StockNewsFeed({ stocks }: Props) {
  const activeTickers = [...new Set(
    stocks.filter(s => s.status === "Active").map(s => s.ticker)
  )].slice(0, 8);

  const [news,         setNews]         = useState<NewsItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState<string>("ALL");
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);
  const [isMock,       setIsMock]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNews = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: activeTickers }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        setNews(data.items ?? []);
        setIsMock(false);
      } else {
        throw new Error(`API ${res.status}`);
      }
    } catch {
      setNews(getMockNews(activeTickers));
      setIsMock(true);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, [activeTickers.join(",")]);

  useEffect(() => {
    if (activeTickers.length === 0) { setLoading(false); return; }
    fetchNews();
    timerRef.current = setInterval(() => fetchNews(true), 5 * 60 * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchNews]);

  const sentCounts = news.reduce((acc, n) => {
    acc[n.sentiment] = (acc[n.sentiment] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const overallSentiment: NewsItem["sentiment"] =
    (sentCounts.positive ?? 0) > (sentCounts.negative ?? 0) ? "positive"
    : (sentCounts.negative ?? 0) > (sentCounts.positive ?? 0) ? "negative"
    : "neutral";

  const osc = sentimentConfig(overallSentiment);

  const filtered = activeTicker === "ALL"
    ? news
    : news.filter(n => n.ticker === activeTicker);

  function tickerSentiment(ticker: string): NewsItem["sentiment"] {
    const t   = news.filter(n => n.ticker === ticker);
    if (!t.length) return "neutral";
    const pos = t.filter(n => n.sentiment === "positive").length;
    const neg = t.filter(n => n.sentiment === "negative").length;
    return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
  }

  if (activeTickers.length === 0) {
    return (
      <div style={{
        background: T.bg, border: `1px solid ${T.bdMid}`,
        borderRadius: 14, boxShadow: T.shadow, padding: "48px 24px", textAlign: "center",
      }}>
        <Newspaper size={32} color={T.txGhost} style={{ margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.txMed }}>No active holdings</div>
        <div style={{ fontSize: 12, color: T.txGhost, marginTop: 4 }}>
          Add stocks to your portfolio to see news here.
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes news-pulse {
          0%, 100% { opacity: .45; }
          50%       { opacity: .90; }
        }
        @keyframes news-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .news-scroll::-webkit-scrollbar { width: 4px; }
        .news-scroll::-webkit-scrollbar-thumb { background: ${T.bdMid}; border-radius: 4px; }

        /* ── Dark mode ── */
        .dark .news-wrap            { background: hsl(220 42% 14%) !important; border-color: hsl(218 32% 21%) !important; }
        .dark .news-header          { background: hsl(220 42% 12%) !important; border-color: hsl(218 32% 19%) !important; }
        .dark .news-tabs            { background: hsl(220 42% 12%) !important; border-color: hsl(218 32% 19%) !important; }
        .dark .news-card            { background: hsl(220 42% 14%) !important; border-color: hsl(218 32% 18%) !important; }
        .dark .news-card:hover      { background: hsl(220 42% 17%) !important; }
        .dark .news-footer          { background: hsl(220 42% 12%) !important; border-color: hsl(218 32% 19%) !important; }
        .dark .news-headline        { color: hsl(215 25% 90%) !important; }
        .dark .news-summary         { color: hsl(215 18% 62%) !important; }
        .dark .news-source          { color: hsl(215 15% 50%) !important; }
        .dark .news-tab-btn         { color: hsl(215 18% 58%) !important; background: transparent !important; border-color: transparent !important; }
        .dark .news-tab-btn.on      { background: hsl(213 52% 20%) !important; color: hsl(210 82% 74%) !important; border-color: hsl(213 50% 30% / .5) !important; }
        .dark .news-tab-btn:hover   { background: hsl(213 42% 18%) !important; color: hsl(210 72% 72%) !important; }
        .dark .news-sentbar         { border-color: hsl(218 32% 19%) !important; }
        .dark .news-sentbar-pos     { background: hsl(160 26% 13%) !important; }
        .dark .news-sentbar-neu     { background: hsl(220 32% 15%) !important; }
        .dark .news-sentbar-neg     { background: hsl(0 26% 13%) !important; }
        .dark .news-sentbar-pos .news-sentlbl { color: hsl(150 52% 50%) !important; }
        .dark .news-sentbar-pos .news-sentval { color: hsl(150 52% 54%) !important; }
        .dark .news-sentbar-neu .news-sentlbl { color: hsl(215 18% 52%) !important; }
        .dark .news-sentbar-neu .news-sentval { color: hsl(215 20% 64%) !important; }
        .dark .news-sentbar-neg .news-sentlbl { color: hsl(2 62% 52%) !important; }
        .dark .news-sentbar-neg .news-sentval { color: hsl(2 70% 58%) !important; }
        .dark .news-empty-title     { color: hsl(215 22% 70%) !important; }
        .dark .news-empty-sub       { color: hsl(215 16% 50%) !important; }
        .dark .news-footer span     { color: hsl(215 16% 50%) !important; }
        .dark .news-scroll::-webkit-scrollbar-thumb { background: hsl(218 32% 24%); }
      `}</style>

      <div className="news-wrap" style={{
        background: T.bg, border: `1px solid ${T.bdMid}`,
        borderRadius: 14, boxShadow: T.shadow,
        overflow: "hidden", display: "flex", flexDirection: "column",
      }}>

        {/* Header */}
        <div className="news-header" style={{
          padding: "14px 20px", background: T.bgSurf,
          borderBottom: `1px solid ${T.bdSoft}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, background: T.navy,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(28,53,87,.3)", flexShrink: 0,
            }}>
              <Newspaper size={16} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txHi }}>Holdings News</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                {isMock ? (
                  <><WifiOff size={9} color={T.warn} />
                    <span style={{ fontSize: 10, color: T.warn }}>Mock data · Add NEWS_API_KEY in Vercel to go live</span></>
                ) : (
                  <><Wifi size={9} color={T.profit} />
                    <span style={{ fontSize: 10, color: T.txLo }}>Live · Auto-refreshes every 5 min</span></>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {news.length > 0 && !loading && (
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 20,
                background: osc.bg, border: `1px solid ${osc.bd}`,
                fontSize: 10.5, fontWeight: 700, color: osc.color,
              }}>
                <osc.Icon size={11} /> {osc.label} overall
              </div>
            )}
            <button
              onClick={() => fetchNews()}
              disabled={loading}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: T.navyTint, border: `1px solid ${T.navyBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: loading ? "default" : "pointer", transition: "all .13s",
              }}
              onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.background = T.navyPale)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = T.navyTint)}
            >
              <RefreshCw size={13} color={T.navy}
                style={loading ? { animation: "news-spin 1s linear infinite" } : {}} />
            </button>
          </div>
        </div>

        {/* Sentiment summary bar */}
        {!loading && news.length > 0 && (
          <div className="news-sentbar" style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            borderBottom: `1px solid ${T.bdSoft}`,
          }}>
            {([
              { key: "positive", label: "Positive", color: T.profit, bg: T.profitBg, divClass: "news-sentbar-pos" },
              { key: "neutral",  label: "Neutral",  color: T.txLo,   bg: T.bgSurf,   divClass: "news-sentbar-neu" },
              { key: "negative", label: "Negative", color: T.loss,   bg: T.lossBg,   divClass: "news-sentbar-neg" },
            ] as const).map((s, i) => (
              <div key={s.key} className={s.divClass} style={{
                padding: "10px 0", background: s.bg, textAlign: "center",
                borderRight: i < 2 ? `1px solid ${T.bdSoft}` : "none",
              }}>
                <div className="news-sentval" style={{
                  fontSize: 20, fontWeight: 700, color: s.color,
                  fontFamily: "'DM Mono',monospace", letterSpacing: "-.5px",
                }}>
                  {sentCounts[s.key] ?? 0}
                </div>
                <div className="news-sentlbl" style={{
                  fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: ".1em", color: s.color, opacity: .75, marginTop: 1,
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ticker tabs */}
        <div className="news-tabs" style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "10px 16px", background: T.bgSurf,
          borderBottom: `1px solid ${T.bdSoft}`,
          overflowX: "auto", flexShrink: 0, scrollbarWidth: "none",
        }}>
          {(["ALL", ...activeTickers]).map(t => {
            const isOn  = activeTicker === t;
            const tSc   = t === "ALL" ? null : sentimentConfig(tickerSentiment(t));
            const count = t === "ALL" ? news.length : news.filter(n => n.ticker === t).length;
            return (
              <button key={t}
                className={`news-tab-btn ${isOn ? "on" : ""}`}
                onClick={() => setActiveTicker(t)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 11px", borderRadius: 20, whiteSpace: "nowrap",
                  fontSize: 11.5, fontWeight: isOn ? 700 : 500,
                  cursor: "pointer", transition: "all .13s", flexShrink: 0,
                  background: isOn ? T.navyPale : "transparent",
                  border: `1px solid ${isOn ? T.navyBd : "transparent"}`,
                  color: isOn ? T.navy : T.txLo,
                }}>
                {t !== "ALL" && tSc && (
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: tSc.color, display: "inline-block", flexShrink: 0,
                  }} />
                )}
                {t}
                <span style={{
                  minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px",
                  background: isOn ? T.navyBd : T.bdSoft,
                  color: isOn ? T.navy : T.txGhost,
                  fontSize: 9, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* News list */}
        <div className="news-scroll" style={{ flex: 1, overflowY: "auto", maxHeight: 560 }}>
          {loading ? (
            <NewsSkeleton />
          ) : error ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: T.loss, marginBottom: 8 }}>{error}</div>
              <button onClick={() => fetchNews()} style={{
                fontSize: 11, fontWeight: 600, color: T.navy,
                background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
              }}>Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Newspaper size={28} color={T.txGhost} style={{ margin: "0 auto 10px" }} />
              <div className="news-empty-title" style={{ fontSize: 13, color: T.txMed, fontWeight: 600 }}>No news found</div>
              <div className="news-empty-sub" style={{ fontSize: 11.5, color: T.txGhost, marginTop: 4 }}>
                Try selecting a different stock or refresh.
              </div>
            </div>
          ) : (
            filtered.map(item => <NewsCard key={item.id} item={item} showTicker={activeTicker === "ALL"} />)
          )}
        </div>

        {/* Footer */}
        {lastUpdated && !loading && (
          <div className="news-footer" style={{
            padding: "8px 20px", borderTop: `1px solid ${T.bdSoft}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: T.bgSurf, flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: T.txGhost, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={9} /> Updated {timeAgo(lastUpdated.toISOString())}
            </span>
            <span style={{ fontSize: 10, color: T.txGhost }}>
              {filtered.length} article{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </>
  );
}