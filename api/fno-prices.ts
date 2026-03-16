/**
 * /api/fno-prices.ts — Live F&O premium fetcher
 *
 * For CE/PE options: fetches the actual option premium (not underlying spot)
 * using Upstox NFO_OPT instrument keys.
 * For Futures: fetches using NFO_FUT instrument keys.
 *
 * Request body:
 *   { trades: Array<{ id, symbol, instrumentType, strike, expiry, lotSize, lots }> }
 *
 * Response:
 *   { ltpMap: Record<tradeId, number>, source: string }
 *
 * Instrument key format (Upstox):
 *   Options:  NFO_OPT|SYMBOL|YYYY-MM-DD|STRIKE|CE  or  |PE
 *   Futures:  NFO_FUT|SYMBOL|YYYY-MM-DD
 *
 * Expiry format from app: "DD-MM-YYYY"  →  needs conversion to "YYYY-MM-DD"
 */

// ── Types ─────────────────────────────────────────────────────────────────────
interface TradeInput {
  id:             string;
  symbol:         string;
  instrumentType: "CE" | "PE" | "FUT";
  strike?:        number;
  expiry:         string;  // "DD-MM-YYYY"
  lotSize:        number;
  lots:           number;
}

interface FnOPrice {
  ltp:   number;
  iv?:   number;
  delta?: number;
  oi?:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert "DD-MM-YYYY" or "27-Mar-2025" → "YYYY-MM-DD" for Upstox */
function toISODate(expiry: string): string {
  const parts = expiry.split("-");
  if (parts.length !== 3) return expiry;

  // Check if middle part is a month name (e.g. "Mar")
  const monthNames: Record<string, string> = {
    jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
    jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
  };
  const mid = parts[1].toLowerCase();
  if (monthNames[mid]) {
    // "DD-Mon-YYYY" format
    return `${parts[2]}-${monthNames[mid]}-${parts[0].padStart(2,"0")}`;
  }
  // "DD-MM-YYYY" format
  return `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
}

/** Build Upstox instrument key for a trade */
function buildInstrumentKey(trade: TradeInput): string {
  const isoDate = toISODate(trade.expiry);
  if (trade.instrumentType === "FUT") {
    return `NFO_FUT|${trade.symbol}|${isoDate}`;
  }
  // CE or PE option
  const strikeInt = Math.round(trade.strike ?? 0);
  return `NFO_OPT|${trade.symbol}|${isoDate}|${strikeInt}|${trade.instrumentType}`;
}

/** Fetch helper with timeout */
async function tf(url: string, opts: RequestInit = {}, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}

// ── Source 1: Upstox NFO live quotes ─────────────────────────────────────────
async function fetchUpstoxFnO(
  trades: TradeInput[]
): Promise<Record<string, FnOPrice> | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // Build map: instrumentKey → tradeId
    const keyToId: Record<string, string> = {};
    const keys: string[] = [];
    for (const trade of trades) {
      const key = buildInstrumentKey(trade);
      keyToId[key] = trade.id;
      keys.push(key);
    }

    const encodedKeys = keys.map(k => encodeURIComponent(k)).join(",");
    const res = await tf(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodedKeys}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );

    if (!res.ok) {
      console.warn(`[fno-prices] Upstox ${res.status}: ${await res.text()}`);
      return null;
    }

    const body = await res.json();
    if (body?.status !== "success") {
      console.warn("[fno-prices] Upstox non-success:", body?.errors);
      return null;
    }

    const out: Record<string, FnOPrice> = {};
    for (const [rawKey, tradeId] of Object.entries(keyToId)) {
      // Upstox returns keys with ":" separator instead of "|"
      const responseKey = rawKey.replace(/\|/g, ":");
      const q = body.data?.[responseKey];
      if (!q) {
        console.warn(`[fno-prices] No data for key: ${responseKey}`);
        continue;
      }
      const ltp = q.last_price ?? 0;
      out[tradeId] = {
        ltp,
        oi:  q.oi ?? undefined,
        // Upstox v2 option greeks (available in some subscription tiers)
        iv:    q.option_greeks?.iv    ?? undefined,
        delta: q.option_greeks?.delta ?? undefined,
      };
      console.log(`✅ Upstox F&O ${rawKey}: ₹${ltp}`);
    }

    return Object.keys(out).length ? out : null;
  } catch (e: any) {
    console.warn("[fno-prices] Upstox error:", e?.message);
    return null;
  }
}

// ── Source 2: Yahoo Finance — underlying spot price as fallback ───────────────
// NOTE: Yahoo doesn't provide option premiums for Indian options.
// This fallback only works for Futures (which are close to spot price).
// For CE/PE options, it returns null so the frontend keeps the stored LTP.
async function fetchYahooFallback(
  trades: TradeInput[]
): Promise<Record<string, FnOPrice> | null> {
  const futTrades = trades.filter(t => t.instrumentType === "FUT");
  if (futTrades.length === 0) return null;

  try {
    const BH = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept": "application/json",
    };
    const syms = [...new Set(futTrades.map(t => `${t.symbol}.NS`))].join(",");
    const res = await tf(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice`,
      { headers: BH }
    );
    if (!res.ok) return null;
    const body = await res.json();
    const results: any[] = body?.quoteResponse?.result ?? [];
    if (!results.length) return null;

    // Build symbol → price map
    const spotMap: Record<string, number> = {};
    for (const q of results) {
      const sym = (q.symbol ?? "").replace(/\.NS$/, "");
      spotMap[sym] = q.regularMarketPrice ?? 0;
    }

    const out: Record<string, FnOPrice> = {};
    for (const trade of futTrades) {
      const spot = spotMap[trade.symbol];
      if (spot && spot > 0) {
        // Futures trade at spot ± basis (typically < 1%). Use spot as approximation.
        out[trade.id] = { ltp: spot };
        console.log(`✅ Yahoo FUT fallback ${trade.symbol}: ₹${spot}`);
      }
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) {
    console.warn("[fno-prices] Yahoo fallback error:", e?.message);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0"); // Never cache live premiums

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { trades } = req.body ?? {};
  if (!Array.isArray(trades) || trades.length === 0) {
    return res.status(400).json({ error: "trades array required" });
  }

  const validTrades = trades.filter(
    (t: any) => t.id && t.symbol && t.instrumentType && t.expiry
  ) as TradeInput[];

  if (validTrades.length === 0) {
    return res.status(400).json({ error: "No valid trades in request" });
  }

  console.log(`[fno-prices] Fetching ${validTrades.length} trades: ${validTrades.map(t => `${t.symbol} ${t.instrumentType}`).join(", ")}`);

  let ltpMap: Record<string, FnOPrice> | null = null;
  let source = "";

  // Try Upstox first (real option premiums)
  ltpMap = await fetchUpstoxFnO(validTrades);
  if (ltpMap) source = "upstox-nfo";

  // Fall back to Yahoo spot for any missing Futures
  const missingIds = validTrades.filter(t => !ltpMap?.[t.id]).map(t => t.id);
  if (missingIds.length > 0) {
    const missingTrades = validTrades.filter(t => missingIds.includes(t.id));
    const fallback = await fetchYahooFallback(missingTrades);
    if (fallback) {
      ltpMap = { ...(ltpMap ?? {}), ...fallback };
      source = source ? `${source}+yahoo-spot` : "yahoo-spot-futures-only";
    }
  }

  if (!ltpMap || Object.keys(ltpMap).length === 0) {
    // Inform frontend: options need Upstox token, futures need Yahoo
    return res.status(503).json({
      error: "Could not fetch F&O prices",
      hint: "For live option premiums, ensure UPSTOX_ACCESS_TOKEN is set in Vercel env vars. Futures will fall back to Yahoo spot price.",
      sources_tried: ["upstox-nfo", "yahoo-spot"],
    });
  }

  console.log(`[fno-prices] → [${source}] ${Object.entries(ltpMap).map(([id, p]) => `${id}:₹${p.ltp}`).join(" ")}`);

  return res.status(200).json({
    ltpMap,
    source,
    fetchedAt: new Date().toISOString(),
    note: "CE/PE LTP = option premium. FUT LTP = futures price (≈ spot).",
  });
}