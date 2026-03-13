/**
 * /api/prices.ts  — 5-tier price fallback
 *
 * Tier 1: Upstox live       (requires daily token — best during market hours)
 * Tier 2: Yahoo Finance v8  (free, reliable, EOD/~15 min delayed)
 * Tier 3: Yahoo Finance v7  (alternate Yahoo endpoint)
 * Tier 4: Stooq             (free EOD for NSE stocks)
 * Tier 5: Cached EOD        (saves last known good price in-memory between calls)
 *
 * Returns: { prices, fetchedAt, source, marketOpen }
 */

type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

// ── In-memory EOD cache (persists across warm lambda invocations) ─────────────
// Vercel serverless can reuse the module between invocations on the same instance
const eodCache: Record<string, StockPrice & { cachedAt: number }> = {};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — covers post-market period

// ── Market hours helper ────────────────────────────────────────────────────────
function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930; // 9:15 AM – 3:30 PM IST
}

function getISTDateString(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ── TIER 1: Upstox live ───────────────────────────────────────────────────────
async function fetchUpstox(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return null;

  const instrumentKeys = tickers.map(t => `NSE_EQ|${t}`).join(",");
  try {
    const res = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrumentKeys}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!res.ok) { console.warn(`Upstox HTTP ${res.status}`); return null; }

    const body = await res.json();
    if (body?.status !== "success") { console.warn("Upstox bad status:", body?.status); return null; }

    const data = body?.data ?? {};
    const prices: Record<string, StockPrice> = {};

    for (const ticker of tickers) {
      const q = data[`NSE_EQ:${ticker}`];
      if (!q) { console.warn(`Upstox: no data for ${ticker}`); continue; }
      const ltp = q.last_price ?? 0;
      const pc  = q.ohlc?.close ?? q.prev_close ?? ltp;
      const ch  = ltp - pc;
      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.week_52_high ?? 0,
        weekLow52:     q.week_52_low  ?? 0,
        changePercent: pc > 0 ? (ch / pc) * 100 : 0,
        change:        ch,
      };
      console.log(`✅ Upstox ${ticker}: ₹${ltp}`);
    }
    return Object.keys(prices).length > 0 ? prices : null;
  } catch (e: any) {
    console.warn("Upstox error:", e?.message);
    return null;
  }
}

// ── TIER 2: Yahoo Finance v8 (most reliable free source) ─────────────────────
async function fetchYahooV8(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const symbols = tickers.map(t => `${t}.NS`).join(",");
    const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${symbols}&range=1d&interval=1d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`Yahoo v8 spark HTTP ${res.status}`); return null; }

    const body = await res.json();
    const sparkData = body?.spark?.result ?? [];
    if (!sparkData.length) return null;

    const prices: Record<string, StockPrice> = {};
    for (const item of sparkData) {
      const ticker = (item?.symbol ?? "").replace(/\.NS$/, "");
      if (!ticker) continue;
      const resp = item?.response?.[0];
      const meta = resp?.meta;
      if (!meta) continue;

      const ltp = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
      const pc  = meta.chartPreviousClose ?? meta.previousClose ?? ltp;
      const ch  = ltp - pc;

      prices[ticker] = {
        price:         ltp,
        weekHigh52:    meta.fiftyTwoWeekHigh  ?? 0,
        weekLow52:     meta.fiftyTwoWeekLow   ?? 0,
        changePercent: pc > 0 ? (ch / pc) * 100 : 0,
        change:        ch,
      };
      console.log(`✅ Yahoo-v8 ${ticker}: ₹${ltp}`);
    }
    return Object.keys(prices).length > 0 ? prices : null;
  } catch (e: any) {
    console.warn("Yahoo v8 error:", e?.message);
    return null;
  }
}

// ── TIER 3: Yahoo Finance v7 quote (fallback) ─────────────────────────────────
async function fetchYahooV7(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const symbols = tickers.map(t => `${t}.NS`).join(",");
    const fields = "regularMarketPrice,regularMarketPreviousClose,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketChange,regularMarketChangePercent";
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=${fields}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`Yahoo v7 HTTP ${res.status}`); return null; }

    const body = await res.json();
    const results: any[] = body?.quoteResponse?.result ?? [];
    if (!results.length) return null;

    const prices: Record<string, StockPrice> = {};
    for (const q of results) {
      const ticker = (q.symbol ?? "").replace(/\.NS$/, "");
      if (!ticker) continue;
      const ltp = q.regularMarketPrice ?? 0;
      const pc  = q.regularMarketPreviousClose ?? ltp;
      const ch  = q.regularMarketChange ?? (ltp - pc);
      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.fiftyTwoWeekHigh         ?? 0,
        weekLow52:     q.fiftyTwoWeekLow          ?? 0,
        changePercent: q.regularMarketChangePercent ?? (pc > 0 ? (ch / pc) * 100 : 0),
        change:        ch,
      };
      console.log(`✅ Yahoo-v7 ${ticker}: ₹${ltp}`);
    }
    return Object.keys(prices).length > 0 ? prices : null;
  } catch (e: any) {
    console.warn("Yahoo v7 error:", e?.message);
    return null;
  }
}

// ── TIER 4: Stooq (reliable free EOD, covers NSE) ────────────────────────────
// Stooq uses TICKER.NS format, returns CSV with date,open,high,low,close,volume
async function fetchStooq(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const prices: Record<string, StockPrice> = {};

    await Promise.all(tickers.map(async (ticker) => {
      try {
        const sym = `${ticker.toLowerCase()}.ns`;
        const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const text = await res.text();
        // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
        const lines = text.trim().split("\n");
        if (lines.length < 2) return;
        const cols = lines[1].split(",");
        // cols: [Symbol, Date, Time, Open, High, Low, Close, Volume]
        const close = parseFloat(cols[6]);
        const open  = parseFloat(cols[3]);
        if (!close || isNaN(close)) return;

        const ch = close - open;
        prices[ticker] = {
          price:         close,
          weekHigh52:    0, // Stooq single-day doesn't give 52w
          weekLow52:     0,
          changePercent: open > 0 ? (ch / open) * 100 : 0,
          change:        ch,
        };
        console.log(`✅ Stooq ${ticker}: ₹${close}`);
      } catch { /* skip */ }
    }));

    return Object.keys(prices).length > 0 ? prices : null;
  } catch (e: any) {
    console.warn("Stooq error:", e?.message);
    return null;
  }
}

// ── TIER 5: In-memory cache — last known good prices ─────────────────────────
function fetchFromCache(tickers: string[]): Record<string, StockPrice> | null {
  const now = Date.now();
  const prices: Record<string, StockPrice> = {};
  for (const t of tickers) {
    const cached = eodCache[t];
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      const { cachedAt, ...p } = cached;
      prices[t] = p;
      console.log(`✅ Cache ${t}: ₹${p.price} (cached ${Math.round((now - cachedAt) / 60000)}m ago)`);
    }
  }
  return Object.keys(prices).length > 0 ? prices : null;
}

function saveToCache(prices: Record<string, StockPrice>) {
  const now = Date.now();
  for (const [ticker, price] of Object.entries(prices)) {
    if (price.price > 0) {
      eodCache[ticker] = { ...price, cachedAt: now };
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  // Allow caching for 15 min — good enough for EOD display
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { tickers } = req.body ?? {};
  if (!Array.isArray(tickers) || tickers.length === 0)
    return res.status(400).json({ error: "tickers array required" });

  const unique = [...new Set(tickers as string[])];
  const marketOpen = isMarketOpen();
  console.log(`[${getISTDateString()}] Fetching ${unique.join(",")} | market ${marketOpen ? "OPEN" : "CLOSED"}`);

  let prices: Record<string, StockPrice> | null = null;
  let source = "";

  // Always try Upstox first (best live data when token is valid)
  prices = await fetchUpstox(unique);
  if (prices) source = "upstox-live";

  // Yahoo v8 — very reliable, works even post-market
  if (!prices) {
    prices = await fetchYahooV8(unique);
    if (prices) source = "yahoo-v8-eod";
  }

  // Yahoo v7 — alternate endpoint
  if (!prices) {
    prices = await fetchYahooV7(unique);
    if (prices) source = "yahoo-v7-eod";
  }

  // Stooq — reliable free EOD
  if (!prices) {
    prices = await fetchStooq(unique);
    if (prices) source = "stooq-eod";
  }

  // Last resort: in-memory cache (survives if all APIs fail temporarily)
  if (!prices) {
    prices = fetchFromCache(unique);
    if (prices) source = "memory-cache";
  }

  if (!prices || Object.keys(prices).length === 0) {
    return res.status(503).json({
      error: "All price sources unavailable. Try again in a few minutes.",
      sources_tried: ["upstox", "yahoo-v8", "yahoo-v7", "stooq", "cache"],
      hint: marketOpen
        ? "Market is open — Upstox token may have expired. Regenerate it."
        : "Market is closed — EOD prices should be available via Yahoo/Stooq.",
    });
  }

  // Save good prices to cache for future fallback
  saveToCache(prices);

  // Fill missing tickers with zeros (don't break UI)
  for (const t of unique) {
    if (!prices[t]) {
      prices[t] = { price: 0, weekHigh52: 0, weekLow52: 0, changePercent: 0, change: 0 };
    }
  }

  console.log(`→ Source: [${source}] | Tickers: ${Object.keys(prices).join(", ")}`);

  return res.status(200).json({
    prices,
    fetchedAt: new Date().toISOString(),
    source,
    marketOpen,
    istDate: getISTDateString(),
  });
}