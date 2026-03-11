type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

async function fetchPrice(ticker: string): Promise<StockPrice | null> {
  // Use 1m interval with 1d range — this gives live intraday price during market hours
  // Fall back to 5m if 1m is unavailable
  const suffixes = [`${ticker}.NS`, `${ticker}.BO`];

  for (const symbol of suffixes) {
    for (const interval of ["1m", "5m", "1d"]) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=${interval}&includePrePost=false`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const result = data?.chart?.result?.[0];
        const meta   = result?.meta;

        if (!meta) continue;

        // During market hours: regularMarketPrice is the live tick
        // After hours: use the most recent close from quotes array
        let livePrice = meta.regularMarketPrice ?? 0;

        // Double-check with last quote close if available (more accurate intraday)
        const closes = result?.indicators?.quote?.[0]?.close;
        if (Array.isArray(closes) && closes.length > 0) {
          // Get the last non-null close
          for (let i = closes.length - 1; i >= 0; i--) {
            if (closes[i] != null && closes[i] > 0) {
              // Only use if it's more recent than regularMarketPrice
              livePrice = closes[i];
              break;
            }
          }
        }

        if (livePrice <= 0) continue;

        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? livePrice;

        return {
          price:         livePrice,
          weekHigh52:    meta.fiftyTwoWeekHigh  ?? 0,
          weekLow52:     meta.fiftyTwoWeekLow   ?? 0,
          changePercent: prevClose > 0 ? ((livePrice - prevClose) / prevClose) * 100 : 0,
          change:        prevClose > 0 ? livePrice - prevClose : 0,
        };
      } catch (err) {
        console.error(`Failed ${symbol} interval=${interval}:`, err);
      }
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  // No caching — always return fresh prices
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tickers } = req.body ?? {};

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "tickers array required" });
    }

    // Deduplicate
    const unique = [...new Set(tickers as string[])];

    const results = await Promise.allSettled(
      unique.map((ticker: string) =>
        fetchPrice(ticker).then((data) => ({ ticker, data }))
      )
    );

    const prices: Record<string, StockPrice> = {};
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.data) {
        prices[result.value.ticker] = result.value.data;
      }
    }

    console.log(`Fetched ${Object.keys(prices).length}/${unique.length} prices at ${new Date().toISOString()}`);

    return res.status(200).json({
      prices,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Prices API error:", error);
    return res.status(500).json({ error: "Failed to fetch stock prices" });
  }
}