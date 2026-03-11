type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

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
    const instrumentKeys = unique.map((t) => `NSE_EQ|${t}`).join(",");
    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKeys)}`;

    console.log("URL:", url);
    console.log("Token:", token.substring(0, 20) + "...");

    const upstoxRes = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    const body = await upstoxRes.json();
    console.log("Status:", upstoxRes.status);
    console.log("Response:", JSON.stringify(body).substring(0, 800));

    if (!upstoxRes.ok) {
      return res.status(500).json({ error: `Upstox ${upstoxRes.status}`, detail: body });
    }

    const quotes = body?.data ?? {};
    console.log("Keys:", JSON.stringify(Object.keys(quotes)));

    const prices: Record<string, StockPrice> = {};

    for (const ticker of unique) {
      const q = quotes[`NSE_EQ:${ticker}`]
             ?? quotes[`NSE_EQ|${ticker}`]
             ?? (Object.values(quotes) as any[]).find((v: any) =>
                  v?.symbol === ticker || v?.trading_symbol === ticker
                );

      if (!q) {
        console.warn(`No data for ${ticker}`);
        continue;
      }

      const ltp       = q.last_price ?? 0;
      const prevClose = q.ohlc?.close ?? ltp;
      const change    = ltp - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.week_52_high ?? 0,
        weekLow52:     q.week_52_low  ?? 0,
        changePercent: changePct,
        change,
      };
      console.log(`OK ${ticker}: ${ltp}`);
    }

    return res.status(200).json({ prices, fetchedAt: new Date().toISOString() });

  } catch (error: any) {
    console.error("Error:", error?.message);
    return res.status(500).json({ error: error?.message });
  }
}
