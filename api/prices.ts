/**
 * /api/prices.ts  — Multi-source NSE price fetcher with Supabase EOD cache
 * ✅ FIXED: removed CDN cache + improved fallback order
 */

import { createClient } from "@supabase/supabase-js";

type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

// ── Supabase client ─────────────────────────────────────────
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "";
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Cache Read ─────────────────────────────────────────────
async function cacheRead(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;

    const { data } = await sb
      .from("eod_price_cache")
      .select("*")
      .in("ticker", tickers);

    if (!data?.length) return null;

    const out: Record<string, StockPrice> = {};
    for (const row of data) {
      const age = (Date.now() - new Date(row.fetched_at).getTime()) / 3600000;
      if (age > 30) continue;

      out[row.ticker] = {
        price: row.price,
        weekHigh52: row.week_high52,
        weekLow52: row.week_low52,
        changePercent: row.change_percent,
        change: row.change,
      };
    }

    return out;
  } catch {
    return null;
  }
}

// ── Cache Write ────────────────────────────────────────────
async function cacheWrite(prices: Record<string, StockPrice>, source: string) {
  try {
    const sb = getSupabase();
    if (!sb) return;

    const rows = Object.entries(prices).map(([ticker, p]) => ({
      ticker,
      price: p.price,
      week_high52: p.weekHigh52,
      week_low52: p.weekLow52,
      change_percent: p.changePercent,
      change: p.change,
      fetched_at: new Date().toISOString(),
      source,
    }));

    await sb.from("eod_price_cache").upsert(rows, { onConflict: "ticker" });
  } catch {}
}

// ── IST helpers ───────────────────────────────────────────
function isMarketOpen(): boolean {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if ([0, 6].includes(ist.getUTCDay())) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930;
}

// ── Fetch helper ──────────────────────────────────────────
async function tf(url: string, opts: RequestInit = {}) {
  return fetch(url, opts);
}

// ── Upstox (REAL-TIME) ────────────────────────────────────
async function fetchUpstox(tickers: string[]) {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const keys = tickers.map(t => `NSE_EQ|${t}`).join(",");
    const res = await tf(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;

    const body = await res.json();
    const out: Record<string, StockPrice> = {};

    for (const t of tickers) {
      const q = body.data?.[`NSE_EQ:${t}`];
      if (!q) continue;

      const ltp = q.last_price;
      const pc = q.prev_close;
      const ch = ltp - pc;

      out[t] = {
        price: ltp,
        weekHigh52: q.week_52_high ?? 0,
        weekLow52: q.week_52_low ?? 0,
        changePercent: (ch / pc) * 100,
        change: ch,
      };
    }

    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

// ── Yahoo Chart (FASTEST fallback) ─────────────────────────
async function fetchYahooChartAll(tickers: string[]) {
  const out: Record<string, StockPrice> = {};

  await Promise.all(
    tickers.map(async (t) => {
      try {
        const res = await tf(`https://query1.finance.yahoo.com/v8/finance/chart/${t}.NS`);
        const body = await res.json();
        const meta = body?.chart?.result?.[0]?.meta;

        if (!meta) return;

        const ltp = meta.regularMarketPrice;
        const pc = meta.previousClose;
        const ch = ltp - pc;

        out[t] = {
          price: ltp,
          weekHigh52: meta.fiftyTwoWeekHigh ?? 0,
          weekLow52: meta.fiftyTwoWeekLow ?? 0,
          changePercent: (ch / pc) * 100,
          change: ch,
        };
      } catch {}
    })
  );

  return Object.keys(out).length ? out : null;
}

// ── MAIN HANDLER ─────────────────────────────────────────
export default async function handler(req: any, res: any) {

  // 🚨 FIX 1: REMOVE VERCEL CACHE (CRITICAL)
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { tickers } = req.body ?? {};
  if (!Array.isArray(tickers) || tickers.length === 0)
    return res.status(400).json({ error: "tickers required" });

  const unique = [...new Set(tickers)];

  let prices: Record<string, StockPrice> | null = null;
  let source = "";

  // ✅ 1. Upstox (REAL-TIME)
  prices = await fetchUpstox(unique);
  if (prices) source = "upstox-live";

  // ✅ 2. Yahoo Chart (better fallback)
  if (!prices) {
    prices = await fetchYahooChartAll(unique);
    if (prices) source = "yahoo-chart";
  }

  // ✅ 3. DB Cache
  if (!prices) {
    prices = await cacheRead(unique);
    if (prices) source = "db-cache";
  }

  if (!prices) {
    return res.status(503).json({ error: "No data available" });
  }

  await cacheWrite(prices, source);

  console.log("SOURCE USED:", source);

  return res.status(200).json({
    prices,
    fetchedAt: new Date().toISOString(),
    source,
  });
}