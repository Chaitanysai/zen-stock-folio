import { z } from "zod";
import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "./_lib/http";
import { fetchJson } from "./_lib/upstream";
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/news — stock news for Indian markets.
 * Contract preserved from api/news.ts: { items, source, count }.
 *
 * Correctness change (deliberate): the Vercel version's Groq fallback
 * FABRICATED headlines and presented them as news. That fallback is removed.
 * Sources are NewsAPI → Finnhub only; when neither can serve real articles
 * the endpoint returns 503 and the UI shows its honest "unavailable / mock
 * data" state instead of invented headlines.
 *
 * Requires a Firebase ID token (provider quotas are tiny and must not be
 * burnable by anonymous traffic); 10/min per user; 4 KB body cap.
 */

const NEWS_TIMEOUT_MS = 8000;

const bodySchema = z.object({
  tickers: z.array(z.string().min(1).max(15)).min(1).max(10),
});

interface NewsItem {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: "positive" | "negative" | "neutral";
}

/** Deterministic keyword scorer over REAL headlines (derived metadata only). */
const scoreSentiment = (text: string): NewsItem["sentiment"] => {
  const t = text.toLowerCase();
  const pos = ["surge", "profit", "gain", "beat", "upgrade", "buy", "growth", "record",
    "strong", "rally", "bullish", "outperform", "expand", "dividend", "bonus",
    "buyback", "raises", "wins", "secures", "jumps", "soars"].filter((w) => t.includes(w)).length;
  const neg = ["fall", "loss", "miss", "downgrade", "sell", "weak", "decline", "drop",
    "bearish", "underperform", "concern", "probe", "penalty", "cut", "slump",
    "plunge", "disappoints", "fraud", "lawsuit", "warning", "risk"].filter((w) => t.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
};

const fetchFromNewsAPI = async (
  apiKey: string | undefined,
  tickers: string[],
): Promise<NewsItem[] | null> => {
  if (!apiKey) return null;

  const query = tickers.map((t) => `"${t}"`).join(" OR ");
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(`${query} NSE BSE India stock`)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${encodeURIComponent(apiKey)}`;

  const result = await fetchJson<{
    status?: string;
    articles?: Array<{
      title?: string;
      description?: string;
      url?: string;
      publishedAt?: string;
      source?: { name?: string };
    }>;
  }>(url, {}, NEWS_TIMEOUT_MS);
  if (!result.ok || result.data.status !== "ok") return null;

  const items: NewsItem[] = [];
  for (const article of result.data.articles ?? []) {
    const text = `${article.title ?? ""} ${article.description ?? ""}`;
    const matchedTicker = tickers.find((t) => text.toUpperCase().includes(t)) ?? tickers[0];
    items.push({
      id: `newsapi-${btoa(unescape(encodeURIComponent(article.url ?? ""))).slice(0, 12)}`,
      ticker: matchedTicker,
      headline: article.title ?? "Untitled",
      summary: article.description ?? "",
      source: article.source?.name ?? "NewsAPI",
      url: article.url ?? "#",
      publishedAt: article.publishedAt ?? new Date().toISOString(),
      sentiment: scoreSentiment(text),
    });
  }
  return items.length > 0 ? items : null;
};

const fetchFromFinnhub = async (
  apiKey: string | undefined,
  tickers: string[],
): Promise<NewsItem[] | null> => {
  if (!apiKey) return null;

  const result = await fetchJson<Array<{
    id?: number;
    headline?: string;
    summary?: string;
    source?: string;
    url?: string;
    datetime?: number;
  }>>(
    `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`,
    {},
    NEWS_TIMEOUT_MS,
  );
  if (!result.ok || !Array.isArray(result.data)) return null;

  const items: NewsItem[] = [];
  for (const article of result.data.slice(0, 30)) {
    const text = `${article.headline ?? ""} ${article.summary ?? ""}`;
    const matchedTicker = tickers.find((t) => text.toUpperCase().includes(t)) ?? tickers[0];
    items.push({
      id: `finnhub-${article.id ?? Math.random()}`,
      ticker: matchedTicker,
      headline: article.headline ?? "Untitled",
      summary: article.summary ?? "",
      source: article.source ?? "Finnhub",
      url: article.url ?? "#",
      publishedAt: new Date((article.datetime ?? 0) * 1000).toISOString(),
      sentiment: scoreSentiment(text),
    });
  }
  return items.length > 0 ? items : null;
};

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:news`,
    RATE_LIMITS.news.limit,
    RATE_LIMITS.news.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const body = await readJsonBody(env, request, 4 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return errorResponse(env, request, 400, "tickers must be an array of 1-10 ticker symbols");
  }

  // Sanitise: strip .NS suffix, uppercase, dedupe, cap at 10.
  const clean = [...new Set(
    parsed.data.tickers
      .map((t) => t.replace(/\.NS$/i, "").toUpperCase().trim())
      .filter(Boolean),
  )].slice(0, 10);

  let items: NewsItem[] | null = await fetchFromNewsAPI(env.NEWS_API_KEY, clean);
  let source = items ? "newsapi" : "";

  if (!items || items.length === 0) {
    items = await fetchFromFinnhub(env.FINNHUB_API_KEY, clean);
    source = items ? "finnhub" : "";
  }

  if (!items || items.length === 0) {
    // Honest unavailability — the client renders its mock-data state with a
    // visible badge rather than showing invented headlines.
    return errorResponse(env, request, 503, "No news data available from configured providers");
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return jsonResponse(env, request, { items, source, count: items.length });
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
