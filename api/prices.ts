/**
 * /api/prices.ts  — Multi-source NSE price fetcher with Supabase EOD cache
 *
 * Sources (in order):
 *  1. Upstox live  (when daily token is valid)
 *  2. Yahoo Finance v7 quote batch
 *  3. Yahoo Finance v8 spark batch
 *  4. Yahoo Finance chart API (per-ticker, different endpoint = different rate limit)
 *  5. Supabase EOD cache — persists last known prices across all Vercel invocations
 *     → This is what shows yesterday's close when market is shut
 */

import { createClient } from "@supabase/supabase-js";

type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

// ── Supabase client (server-side) ─────────────────────────────────────────────
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
           ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
           ?? process.env.VITE_SUPABASE_ANON_KEY
           ?? "";
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Supabase price cache table: `eod_price_cache` ─────────────────────────────
// Schema (run once in Supabase SQL editor):
//   create table if not exists eod_price_cache (
//     ticker text primary key,
//     price numeric, week_high52 numeric, week_low52 numeric,
//     change_percent numeric, change numeric,
//     fetched_at timestamptz default now(),
//     source text
//   );
//   alter table eod_price_cache enable row level security;
//   create policy "public read" on eod_price_cache for select using (true);
//   create policy "service write" on eod_price_cache for all using (true);

async function cacheRead(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("eod_price_cache")
      .select("ticker,price,week_high52,week_low52,change_percent,change,fetched_at")
      .in("ticker", tickers);
    if (error || !data?.length) return null;
    const out: Record<string, StockPrice> = {};
    for (const row of data) {
      const age = (Date.now() - new Date(row.fetched_at).getTime()) / 3600000;
      if (age > 30) continue; // stale after 30 hours (skip weekend → Monday)
      out[row.ticker] = {
        price:         row.price,
        weekHigh52:    row.week_high52,
        weekLow52:     row.week_low52,
        changePercent: row.change_percent,
        change:        row.change,
      };
      console.log(`📦 DB cache ${row.ticker}: ₹${row.price} (${age.toFixed(1)}h ago)`);
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) {
    console.warn("Cache read error:", e?.message);
    return null;
  }
}

async function cacheWrite(prices: Record<string, StockPrice>, source: string) {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const rows = Object.entries(prices)
      .filter(([, p]) => p.price > 0)
      .map(([ticker, p]) => ({
        ticker,
        price:          p.price,
        week_high52:    p.weekHigh52,
        week_low52:     p.weekLow52,
        change_percent: p.changePercent,
        change:         p.change,
        fetched_at:     new Date().toISOString(),
        source,
      }));
    if (!rows.length) return;
    await sb.from("eod_price_cache").upsert(rows, { onConflict: "ticker" });
    console.log(`💾 Cached ${rows.length} prices to DB`);
  } catch (e: any) {
    console.warn("Cache write error:", e?.message);
  }
}

// ── IST helpers ───────────────────────────────────────────────────────────────
function isMarketOpen(): boolean {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if ([0, 6].includes(ist.getUTCDay())) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 555 && mins <= 930;
}

function istDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function tf(url: string, opts: RequestInit = {}, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}

const BH = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── SOURCE 1: Upstox ─────────────────────────────────────────────────────────
async function fetchUpstox(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const keys = tickers.map(t => `NSE_EQ|${t}`).join(",");
    const res = await tf(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!res.ok) { console.warn(`Upstox ${res.status}`); return null; }
    const body = await res.json();
    if (body?.status !== "success") return null;
    const out: Record<string, StockPrice> = {};
    for (const t of tickers) {
      const q = body.data?.[`NSE_EQ:${t}`];
      if (!q) continue;
      const ltp = q.last_price ?? 0;
      const pc  = q.ohlc?.close ?? q.prev_close ?? ltp;
      const ch  = ltp - pc;
      out[t] = { price: ltp, weekHigh52: q.week_52_high ?? 0, weekLow52: q.week_52_low ?? 0,
                 changePercent: pc > 0 ? (ch/pc)*100 : 0, change: ch };
      console.log(`✅ Upstox ${t}: ₹${ltp}`);
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) { console.warn("Upstox:", e?.message); return null; }
}

// ── SOURCE 2: Yahoo v7 batch ──────────────────────────────────────────────────
async function fetchYahooQuote(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const syms = tickers.map(t => `${t}.NS`).join(",");
    const res = await tf(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketPreviousClose,fiftyTwoWeekHigh,fiftyTwoWeekLow,regularMarketChange,regularMarketChangePercent`,
      { headers: BH }
    );
    if (!res.ok) { console.warn(`Yahoo-v7 ${res.status}`); return null; }
    const body = await res.json();
    const results: any[] = body?.quoteResponse?.result ?? [];
    if (!results.length) return null;
    const out: Record<string, StockPrice> = {};
    for (const q of results) {
      const t = (q.symbol ?? "").replace(/\.NS$/, "");
      if (!t) continue;
      const ltp = q.regularMarketPrice ?? 0;
      const pc  = q.regularMarketPreviousClose ?? ltp;
      const ch  = q.regularMarketChange ?? (ltp - pc);
      out[t] = { price: ltp, weekHigh52: q.fiftyTwoWeekHigh ?? 0, weekLow52: q.fiftyTwoWeekLow ?? 0,
                 changePercent: q.regularMarketChangePercent ?? (pc>0?(ch/pc)*100:0), change: ch };
      console.log(`✅ Yahoo-v7 ${t}: ₹${ltp}`);
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) { console.warn("Yahoo-v7:", e?.message); return null; }
}

// ── SOURCE 3: Yahoo v8 spark ──────────────────────────────────────────────────
async function fetchYahooSpark(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  try {
    const syms = tickers.map(t => `${t}.NS`).join(",");
    const res = await tf(
      `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${syms}&range=1d&interval=1d`,
      { headers: BH }
    );
    if (!res.ok) { console.warn(`Yahoo-v8 ${res.status}`); return null; }
    const body = await res.json();
    const items: any[] = body?.spark?.result ?? [];
    if (!items.length) return null;
    const out: Record<string, StockPrice> = {};
    for (const item of items) {
      const t = (item?.symbol ?? "").replace(/\.NS$/, "");
      const meta = item?.response?.[0]?.meta;
      if (!t || !meta) continue;
      const ltp = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
      const pc  = meta.chartPreviousClose ?? meta.previousClose ?? ltp;
      const ch  = ltp - pc;
      out[t] = { price: ltp, weekHigh52: meta.fiftyTwoWeekHigh ?? 0, weekLow52: meta.fiftyTwoWeekLow ?? 0,
                 changePercent: pc>0?(ch/pc)*100:0, change: ch };
      console.log(`✅ Yahoo-v8 ${t}: ₹${ltp}`);
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) { console.warn("Yahoo-v8:", e?.message); return null; }
}

// ── SOURCE 4: Yahoo chart per-ticker (different rate limit bucket) ────────────
async function fetchYahooChart(ticker: string): Promise<StockPrice | null> {
  try {
    const res = await tf(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?interval=1d&range=5d`,
      { headers: { ...BH, Referer: "https://finance.yahoo.com/" } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    const meta = body?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const ltp = meta.regularMarketPrice ?? meta.previousClose ?? 0;
    const pc  = meta.chartPreviousClose ?? meta.previousClose ?? ltp;
    const ch  = ltp - pc;
    console.log(`✅ Yahoo-chart ${ticker}: ₹${ltp}`);
    return { price: ltp, weekHigh52: meta.fiftyTwoWeekHigh ?? 0, weekLow52: meta.fiftyTwoWeekLow ?? 0,
             changePercent: pc>0?(ch/pc)*100:0, change: ch };
  } catch { return null; }
}

async function fetchYahooChartAll(tickers: string[]): Promise<Record<string, StockPrice> | null> {
  const results = await Promise.allSettled(tickers.map(async t => ({ t, p: await fetchYahooChart(t) })));
  const out: Record<string, StockPrice> = {};
  for (const r of results) if (r.status === "fulfilled" && r.value.p) out[r.value.t] = r.value.p;
  return Object.keys(out).length ? out : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { tickers } = req.body ?? {};
  if (!Array.isArray(tickers) || tickers.length === 0)
    return res.status(400).json({ error: "tickers array required" });

  const unique = [...new Set(tickers as string[])];
  const marketOpen = isMarketOpen();
  console.log(`[${istDateStr()}] market=${marketOpen?"OPEN":"CLOSED"} tickers=${unique.join(",")}`);

  let prices: Record<string, StockPrice> | null = null;
  let source = "";

  // --- Live sources ---
  prices = await fetchUpstox(unique);
  if (prices) source = "upstox-live";

  if (!prices) { prices = await fetchYahooQuote(unique); if (prices) source = "yahoo-v7"; }
  if (!prices) { prices = await fetchYahooSpark(unique);  if (prices) source = "yahoo-v8"; }
  if (!prices) { prices = await fetchYahooChartAll(unique); if (prices) source = "yahoo-chart"; }

  // --- Supabase cache (last known good EOD prices — survives across invocations) ---
  if (!prices || unique.some(t => !prices![t])) {
    const missing = unique.filter(t => !prices?.[t]);
    const cached = await cacheRead(missing);
    if (cached) {
      prices = { ...(prices ?? {}), ...cached };
      source = source ? `${source}+db-cache` : "db-cache";
    }
  }

  // Save any fresh prices back to cache
  if (prices) {
    const fresh = Object.fromEntries(
      Object.entries(prices).filter(([, p]) => p.price > 0)
    );
    if (Object.keys(fresh).length) cacheWrite(fresh, source).catch(() => {});
  }

  if (!prices || Object.keys(prices).length === 0) {
    return res.status(503).json({
      error: "Could not fetch prices from any source. Supabase cache also empty — prices will appear after first successful fetch.",
      sources_tried: ["upstox", "yahoo-v7", "yahoo-v8", "yahoo-chart", "db-cache"],
    });
  }

  // Fill any still-missing tickers with zeros
  for (const t of unique) {
    if (!prices[t]) prices[t] = { price: 0, weekHigh52: 0, weekLow52: 0, changePercent: 0, change: 0 };
  }

  console.log(`→ [${source}] ${Object.entries(prices).map(([t,p]) => `${t}:${p.price}`).join(" ")}`);

  return res.status(200).json({ prices, fetchedAt: new Date().toISOString(), source, marketOpen, istDate: istDateStr() });
}