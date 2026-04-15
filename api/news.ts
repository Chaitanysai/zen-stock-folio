/**
 * /api/news.ts — Stock news aggregator for Indian markets
 * Drop into: api/news.ts  (same folder as your existing api/ai.ts)
 *
 * Priority order:
 *  1. NewsAPI.org  — free, 100 req/day  → set NEWS_API_KEY in Vercel
 *  2. Finnhub      — free, 60 req/min   → set FINNHUB_API_KEY in Vercel
 *  3. Groq AI      — reuses your existing GROQ_API_KEY as a last-resort fallback
 *
 * If none of the above keys are set the frontend falls back to mock data gracefully.
 *
 * Request:  POST { tickers: string[] }
 * Response: { items: NewsItem[], source: string, count: number }
 */

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

// ── Simple keyword-based sentiment scorer ─────────────────────────────────────
function scoreSentiment(text: string): NewsItem["sentiment"] {
  const t   = text.toLowerCase();
  const pos = ["surge", "profit", "gain", "beat", "upgrade", "buy", "growth", "record",
               "strong", "rally", "bullish", "outperform", "expand", "dividend", "bonus",
               "buyback", "raises", "wins", "secures", "jumps", "soars"].filter(w => t.includes(w)).length;
  const neg = ["fall", "loss", "miss", "downgrade", "sell", "weak", "decline", "drop",
               "bearish", "underperform", "concern", "probe", "penalty", "cut", "slump",
               "plunge", "disappoints", "fraud", "lawsuit", "warning", "risk"].filter(w => t.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

// ── NewsAPI.org ───────────────────────────────────────────────────────────────
async function fetchFromNewsAPI(tickers: string[]): Promise<NewsItem[] | null> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return null;

  const query = tickers.map(t => `"${t}"`).join(" OR ");
  const url   = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query + " NSE BSE India stock")}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${key}`;

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") return null;

    const items: NewsItem[] = [];
    for (const article of (data.articles ?? [])) {
      const text          = `${article.title ?? ""} ${article.description ?? ""}`;
      const matchedTicker = tickers.find(t => text.toUpperCase().includes(t.toUpperCase())) ?? tickers[0];
      items.push({
        id:          `newsapi-${Buffer.from(article.url ?? "").toString("base64").slice(0, 12)}`,
        ticker:      matchedTicker,
        headline:    article.title ?? "Untitled",
        summary:     article.description ?? "",
        source:      article.source?.name ?? "NewsAPI",
        url:         article.url ?? "#",
        publishedAt: article.publishedAt ?? new Date().toISOString(),
        sentiment:   scoreSentiment(text),
      });
    }
    return items.length > 0 ? items : null;
  } catch (e: any) {
    console.warn("NewsAPI failed:", e?.message);
    return null;
  }
}

// ── Finnhub ───────────────────────────────────────────────────────────────────
async function fetchFromFinnhub(tickers: string[]): Promise<NewsItem[] | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const res  = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) return null;

    const items: NewsItem[] = [];
    for (const article of data.slice(0, 30)) {
      const text          = `${article.headline ?? ""} ${article.summary ?? ""}`;
      const matchedTicker = tickers.find(t => text.toUpperCase().includes(t.toUpperCase())) ?? tickers[0];
      items.push({
        id:          `finnhub-${article.id ?? Math.random()}`,
        ticker:      matchedTicker,
        headline:    article.headline ?? "Untitled",
        summary:     article.summary  ?? "",
        source:      article.source   ?? "Finnhub",
        url:         article.url      ?? "#",
        publishedAt: new Date((article.datetime ?? 0) * 1000).toISOString(),
        sentiment:   scoreSentiment(text),
      });
    }
    return items.length > 0 ? items : null;
  } catch (e: any) {
    console.warn("Finnhub failed:", e?.message);
    return null;
  }
}

// ── Groq AI-generated news fallback ──────────────────────────────────────────
async function fetchFromGroq(tickers: string[]): Promise<NewsItem[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const prompt = `Generate realistic recent news headlines for these Indian NSE/BSE stocks: ${tickers.join(", ")}.

For each stock write exactly 2–3 news items. Return ONLY a JSON array with no markdown, no preamble, no code fences.

Schema:
[
  {
    "ticker": "RELIANCE",
    "headline": "...",
    "summary": "One to two sentence summary.",
    "source": "Economic Times",
    "sentiment": "positive"
  }
]

Rules:
- sentiment must be exactly one of: "positive", "negative", "neutral"
- Use Indian market context: NSE, BSE, ₹, Crore, Lakh
- Mix result types: quarterly results, analyst upgrades/downgrades, corporate actions, sector news
- Make headlines realistic and specific, not generic`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.75,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (!res.ok) return null;

    let raw = data?.choices?.[0]?.message?.content ?? "";
    raw = raw.replace(/```json|```/g, "").trim();
    const parsed: any[] = JSON.parse(raw);

    return parsed.map((item, i) => ({
      id:          `groq-${i}-${Date.now()}`,
      ticker:      item.ticker ?? tickers[0],
      headline:    item.headline ?? "No headline",
      summary:     item.summary  ?? "",
      source:      item.source   ?? "AI Summary",
      url:         "#",
      publishedAt: new Date(Date.now() - i * 45 * 60000).toISOString(),
      sentiment:   (["positive", "negative", "neutral"].includes(item.sentiment)
        ? item.sentiment
        : scoreSentiment(item.headline)) as NewsItem["sentiment"],
    }));
  } catch (e: any) {
    console.warn("Groq news fallback failed:", e?.message);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { tickers } = req.body ?? {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers array is required" });
  }

  // Sanitise: strip .NS suffix, uppercase, max 10
  const clean = (tickers as string[])
    .map(t => t.replace(/\.NS$/i, "").toUpperCase().trim())
    .filter(Boolean)
    .slice(0, 10);

  let items: NewsItem[] | null = null;
  let source = "none";

  // Try sources in priority order
  items = await fetchFromNewsAPI(clean);
  if (items && items.length > 0) { source = "newsapi"; }

  if (!items || items.length === 0) {
    items = await fetchFromFinnhub(clean);
    if (items && items.length > 0) { source = "finnhub"; }
  }

  if (!items || items.length === 0) {
    items = await fetchFromGroq(clean);
    if (items && items.length > 0) { source = "groq-ai"; }
  }

  if (!items || items.length === 0) {
    return res.status(503).json({
      error: "No news data available. Set NEWS_API_KEY, FINNHUB_API_KEY, or GROQ_API_KEY in Vercel environment variables.",
    });
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return res.status(200).json({ items, source, count: items.length });
}