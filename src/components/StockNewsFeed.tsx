import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { PortfolioStock } from "@/data/sampleData";
import { apiFetch } from "@/lib/api";

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

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function sentimentConfig(sentiment: NewsItem["sentiment"]) {
  if (sentiment === "positive") {
    return {
      Icon: TrendingUp,
      classes: "border-profit/30 bg-profit/10 text-profit",
      dot: "bg-profit",
      label: "Positive",
    };
  }
  if (sentiment === "negative") {
    return {
      Icon: TrendingDown,
      classes: "border-loss/30 bg-loss/10 text-loss",
      dot: "bg-loss",
      label: "Negative",
    };
  }
  return {
    Icon: Minus,
    classes: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Neutral",
  };
}

function NewsSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="border-b border-border/50 px-4 py-4 last:border-b-0 sm:px-5">
          <div className="flex items-start gap-3 motion-safe:animate-pulse">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-11/12 rounded bg-muted" />
              <div className="h-3.5 w-8/12 rounded bg-muted" />
              <div className="h-3 w-5/12 rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsCard({ item, showTicker }: { item: NewsItem; showTicker: boolean }) {
  const sentiment = sentimentConfig(item.sentiment);
  const { Icon } = sentiment;
  const hasLink = item.url !== "#";

  return (
    <a
      href={hasLink ? item.url : undefined}
      target={hasLink ? "_blank" : undefined}
      rel={hasLink ? "noopener noreferrer" : undefined}
      className={`group block border-b border-border/50 bg-card/40 px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/30 sm:px-5 ${hasLink ? focusRing : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${sentiment.classes}`}>
          <Icon size={16} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {showTicker && (
              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold tracking-wide text-primary">
                {item.ticker}
              </span>
            )}
            <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${sentiment.classes}`}>
              {sentiment.label}
            </span>
            <time
              dateTime={item.publishedAt}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground tabular-nums"
            >
              <Clock size={11} aria-hidden="true" /> {timeAgo(item.publishedAt)}
            </time>
          </div>

          <h3 className="text-sm font-semibold leading-6 text-card-foreground">
            {item.headline}
            {hasLink && (
              <ExternalLink
                size={12}
                className="ml-1.5 inline align-middle text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
                aria-hidden="true"
              />
            )}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{item.summary}</p>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">{item.source}</p>
        </div>
      </div>
    </a>
  );
}

export default function StockNewsFeed({ stocks }: Props) {
  const activeTickersKey = [...new Set(
    stocks.filter((s) => s.status === "Active").map((s) => s.ticker),
  )].slice(0, 8).join(",");
  const activeTickers = useMemo(
    () => activeTickersKey ? activeTickersKey.split(",") : [],
    [activeTickersKey],
  );

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState<string>("ALL");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNews = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: activeTickers }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setNews(data.items ?? []);
      setLastUpdated(new Date());
    } catch {
      setNews([]);
      setError("Live news could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [activeTickers]);

  useEffect(() => {
    if (activeTickers.length === 0) {
      setLoading(false);
      return;
    }
    fetchNews();
    timerRef.current = setInterval(() => fetchNews(true), 5 * 60 * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchNews, activeTickers.length]);

  const sentCounts = news.reduce((acc, item) => {
    acc[item.sentiment] = (acc[item.sentiment] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const overallSentiment: NewsItem["sentiment"] =
    (sentCounts.positive ?? 0) > (sentCounts.negative ?? 0)
      ? "positive"
      : (sentCounts.negative ?? 0) > (sentCounts.positive ?? 0)
        ? "negative"
        : "neutral";

  const overall = sentimentConfig(overallSentiment);
  const filtered = activeTicker === "ALL"
    ? news
    : news.filter((item) => item.ticker === activeTicker);

  function tickerSentiment(ticker: string): NewsItem["sentiment"] {
    const tickerNews = news.filter((item) => item.ticker === ticker);
    if (!tickerNews.length) return "neutral";
    const positive = tickerNews.filter((item) => item.sentiment === "positive").length;
    const negative = tickerNews.filter((item) => item.sentiment === "negative").length;
    return positive > negative ? "positive" : negative > positive ? "negative" : "neutral";
  }

  if (activeTickers.length === 0) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/85 px-6 py-12 text-center shadow-sm backdrop-blur-md">
        <Newspaper size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-card-foreground">No active holdings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add stocks to your portfolio to see news here.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card/85 shadow-sm backdrop-blur-md" aria-label="Holdings news">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/35 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Newspaper size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-card-foreground">Holdings News</h2>
            <div className="mt-1 flex items-center gap-1.5" role="status" aria-live="polite">
              {error ? (
                <>
                  <WifiOff size={11} className="shrink-0 text-warning" aria-hidden="true" />
                  <span className="text-xs text-warning">Live news unavailable</span>
                </>
              ) : (
                <>
                  <Wifi size={11} className="shrink-0 text-profit" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">
                    {loading && !lastUpdated ? "Connecting to live newsâ€¦" : "Live Â· Auto-refreshes every 5 min"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {news.length > 0 && !loading && !error && (
            <div className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${overall.classes}`}>
              <overall.Icon size={12} aria-hidden="true" /> {overall.label} overall
            </div>
          )}
          <button
            type="button"
            onClick={() => fetchNews()}
            disabled={loading}
            aria-label="Refresh news"
            title="Refresh news"
            className={`flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-background/50 text-primary transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!loading && !error && news.length > 0 && (
        <div className="grid grid-cols-3 border-b border-border/60" aria-label="News sentiment summary">
          {([
            { key: "positive", label: "Positive", classes: "bg-profit/10 text-profit" },
            { key: "neutral", label: "Neutral", classes: "bg-muted/45 text-muted-foreground" },
            { key: "negative", label: "Negative", classes: "bg-loss/10 text-loss" },
          ] as const).map((sentiment, index) => (
            <div
              key={sentiment.key}
              className={`px-2 py-2.5 text-center ${sentiment.classes} ${index < 2 ? "border-r border-border/50" : ""}`}
            >
              <div className="font-mono text-xl font-bold leading-6 tabular-nums">
                {sentCounts[sentiment.key] ?? 0}
              </div>
              <div className="mt-0.5 text-xs font-semibold uppercase tracking-wider">
                {sentiment.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-muted/35 px-3 py-2 [scrollbar-width:thin] sm:px-4"
        role="group"
        aria-label="Filter news by ticker"
      >
        {(["ALL", ...activeTickers]).map((ticker) => {
          const selected = activeTicker === ticker;
          const sentiment = ticker === "ALL" ? null : sentimentConfig(tickerSentiment(ticker));
          const count = ticker === "ALL"
            ? news.length
            : news.filter((item) => item.ticker === ticker).length;
          return (
            <button
              type="button"
              key={ticker}
              onClick={() => setActiveTicker(ticker)}
              aria-pressed={selected}
              className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors ${selected ? "border-primary/25 bg-primary/10 font-semibold text-primary" : "border-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground"} ${focusRing}`}
            >
              {ticker !== "ALL" && sentiment && (
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${sentiment.dot}`} aria-hidden="true" />
              )}
              {ticker}
              <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="max-h-[560px] flex-1 overflow-y-auto" aria-busy={loading} aria-label="News articles">
        {loading ? (
          <div role="status">
            <span className="sr-only">Loading live news</span>
            <NewsSkeleton />
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center" role="alert">
            <WifiOff size={26} className="mx-auto mb-3 text-warning" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-card-foreground">News is unavailable</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => fetchNews()}
              aria-label="Retry loading news"
              className={`mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 ${focusRing}`}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Newspaper size={28} className="mx-auto mb-2.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-card-foreground">No news found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try selecting a different stock or refresh.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <NewsCard key={item.id} item={item} showTicker={activeTicker === "ALL"} />
          ))
        )}
      </div>

      {lastUpdated && !loading && (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/35 px-4 py-2 sm:px-5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock size={11} aria-hidden="true" /> Updated {timeAgo(lastUpdated.toISOString())}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filtered.length} article{filtered.length !== 1 ? "s" : ""}
          </span>
        </footer>
      )}
    </section>
  );
}
