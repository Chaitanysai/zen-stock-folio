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

  const accessToken = process.env.DHAN_ACCESS_TOKEN;
  const clientId    = process.env.DHAN_CLIENT_ID;

  if (!accessToken || !clientId) {
    return res.status(500).json({ error: "DHAN_ACCESS_TOKEN or DHAN_CLIENT_ID not configured" });
  }

  try {
    const { tickers } = req.body ?? {};
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "tickers array required" });
    }

    const unique = [...new Set(tickers as string[])];
    console.log("Fetching Dhan prices for:", unique.join(", "));

    // Dhan Market Quote API — batch request
    // POST /v2/marketfeed/quote
    const dhanRes = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
      method: "POST",
      headers: {
        "access-token": accessToken,
        "client-id":    clientId,
        "Content-Type": "application/json",
        "Accept":       "application/json",
      },
      body: JSON.stringify({
        NSE_EQ: unique, // Pass tickers as NSE equity symbols
      }),
    });

    const body = await dhanRes.json();
    console.log("Dhan status:", dhanRes.status);
    console.log("Dhan response:", JSON.stringify(body).substring(0, 800));

    if (!dhanRes.ok) {
      return res.status(500).json({ error: `Dhan API ${dhanRes.status}`, detail: body });
    }

    const quotes = body?.data?.NSE_EQ ?? body?.NSE_EQ ?? body?.data ?? {};
    console.log("Quote keys:", JSON.stringify(Object.keys(quotes)));

    const prices: Record<string, StockPrice> = {};

    for (const ticker of unique) {
      const q = quotes[ticker];

      if (!q) {
        console.warn(`No data for ${ticker}`);
        continue;
      }

      const ltp       = q.last_price ?? q.ltp ?? q.lastTradedPrice ?? 0;
      const prevClose = q.prev_close ?? q.previousClose ?? q.close ?? ltp;
      const change    = ltp - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      prices[ticker] = {
        price:         ltp,
        weekHigh52:    q.fifty_two_week_high ?? q.week52High ?? 0,
        weekLow52:     q.fifty_two_week_low  ?? q.week52Low  ?? 0,
        changePercent: changePct,
        change,
      };
      console.log(`✅ ${ticker}: ₹${ltp} (${changePct.toFixed(2)}%)`);
    }

    return res.status(200).json({ prices, fetchedAt: new Date().toISOString() });

  } catch (error: any) {
    console.error("Error:", error?.message);
    return res.status(500).json({ error: error?.message });
  }
}