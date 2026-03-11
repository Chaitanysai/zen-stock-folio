type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "UPSTOX_ACCESS_TOKEN is not configured" });
  }

  try {
    const { tickers } = req.body ?? {};
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "tickers array required" });
    }

    const unique = [...new Set(tickers as string[])];

    // Upstox instrument key format for NSE equity: NSE_EQ|TICKER
    // e.g. ASTERDM → NSE_EQ|ASTERDM
    const instrumentKeys = unique
      .map((t) => `NSE_EQ|${t}`)
      .join(",");

    console.log(`Fetching: ${instrumentKeys}`);

    const res2 = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKeys)}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      }
    );

    const body = await res2.json();

    if (!res2.ok) {
      console.error("Upstox API error:", res2.status, JSON.stringify(body));
      return res.status(500).json({
        error: `Upstox API error: ${res2.status}`,
        detail: body,
      });
    }

    const quotes = body?.data ?? {};
    const prices: Record<string, StockPrice> = {};

    for (const ticker of unique) {
      // Upstox keys the response as "NSE_EQ:TICKER" (colon, not pipe)
      const q = quotes[`NSE_EQ:${ticker}`]
             ?? quotes[`NSE_EQ|${ticker}`]
             ?? quotes[ticker];

      if (!q) {
        console.warn(`No data for ${ticker}. Available keys:`, Object.keys(quotes).slice(0, 5));
        continue;
      }

      const ltp       = q.last_price ?? 0;
      const prevClose = q.ohlc?.close ?? ltp;
      const change    = ltp - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.week_52_high ?? q.upper_circuit_limit ?? 0,
        weekLow52:     q.week_52_low  ?? q.lower_circuit_limit ?? 0,
        changePercent: changePct,
        change:        change,
      };

      console.log(`✅ ${ticker}: ₹${ltp} (${changePct.toFixed(2)}%)`);
    }

    return res.status(200).json({ prices, fetchedAt: new Date().toISOString() });

  } catch (error: any) {
    console.error("Prices handler error:", error?.message);
    return res.status(500).json({ error: error?.message || "Failed to fetch prices" });
  }
}
