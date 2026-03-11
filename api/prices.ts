type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

// Upstox instrument key format: NSE_EQ|INE123A01234
// We need to convert ticker → instrument key via Upstox search API
async function getInstrumentKey(ticker: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.upstox.com/v2/instruments/search?query=${encodeURIComponent(ticker)}&instrument_type=EQUITY`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.data ?? [];
    // Prefer NSE over BSE
    const nse = items.find((i: any) => i.exchange === "NSE" && i.trading_symbol === ticker);
    const bse = items.find((i: any) => i.exchange === "BSE" && i.trading_symbol === ticker);
    const match = nse || bse;
    return match ? `${match.exchange}_EQ|${match.isin}` : null;
  } catch (e: any) {
    console.warn(`Instrument lookup failed for ${ticker}:`, e?.message);
    return null;
  }
}

async function fetchPricesUpstox(
  tickers: string[],
  token: string
): Promise<Record<string, StockPrice>> {
  // Build instrument keys for all tickers in parallel
  const keyEntries = await Promise.all(
    tickers.map(async (ticker) => {
      const key = await getInstrumentKey(ticker, token);
      return { ticker, key };
    })
  );

  const valid = keyEntries.filter((e) => e.key !== null);
  if (valid.length === 0) {
    console.warn("No valid instrument keys found");
    return {};
  }

  // Upstox market quote — batch up to 500 instruments
  const instrumentKeys = valid.map((e) => e.key).join(",");
  try {
    const res = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKeys)}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`Upstox quotes API error ${res.status}:`, err);
      return {};
    }

    const data = await res.json();
    const quotes = data?.data ?? {};
    const prices: Record<string, StockPrice> = {};

    for (const { ticker, key } of valid) {
      // Upstox returns data keyed by instrument_key
      const q = quotes[key!];
      if (!q) continue;

      const ltp        = q.last_price ?? 0;
      const prevClose  = q.ohlc?.close ?? q.last_price ?? ltp;
      const change     = ltp - prevClose;
      const changePct  = prevClose > 0 ? (change / prevClose) * 100 : 0;

      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.week_52_high ?? 0,
        weekLow52:     q.week_52_low  ?? 0,
        changePercent: changePct,
        change:        change,
      };

      console.log(`✅ ${ticker}: ₹${ltp} (${changePct.toFixed(2)}%)`);
    }

    return prices;
  } catch (e: any) {
    console.error("Upstox quotes fetch error:", e?.message);
    return {};
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    console.error("UPSTOX_ACCESS_TOKEN not configured");
    return res.status(500).json({ error: "UPSTOX_ACCESS_TOKEN is not configured" });
  }

  try {
    const { tickers } = req.body ?? {};
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "tickers array required" });
    }

    const unique = [...new Set(tickers as string[])];
    console.log(`Fetching Upstox prices for: ${unique.join(", ")}`);

    const prices = await fetchPricesUpstox(unique, token);

    console.log(`Got ${Object.keys(prices).length}/${unique.length} prices at ${new Date().toISOString()}`);
    return res.status(200).json({ prices, fetchedAt: new Date().toISOString() });

  } catch (error: any) {
    console.error("Prices API error:", error?.message);
    return res.status(500).json({ error: "Failed to fetch prices" });
  }
}