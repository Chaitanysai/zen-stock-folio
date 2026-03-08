type StockPrice = {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
};

async function fetchPrice(ticker: string): Promise<StockPrice | null> {
  const nseSymbol = `${ticker}.NS`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(nseSymbol)}?range=1d&interval=1d&includePrePost=false`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          price: meta.regularMarketPrice ?? 0,
          weekHigh52: meta.fiftyTwoWeekHigh ?? 0,
          weekLow52: meta.fiftyTwoWeekLow ?? 0,
          changePercent:
            meta.regularMarketPrice && meta.previousClose
              ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
              : 0,
          change:
            meta.regularMarketPrice && meta.previousClose
              ? meta.regularMarketPrice - meta.previousClose
              : 0,
        };
      }
    }
  } catch (error) {
    console.error(`NSE fetch failed for ${ticker}:`, error);
  }

  try {
    const bseSymbol = `${ticker}.BO`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(bseSymbol)}?range=1d&interval=1d&includePrePost=false`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          price: meta.regularMarketPrice ?? 0,
          weekHigh52: meta.fiftyTwoWeekHigh ?? 0,
          weekLow52: meta.fiftyTwoWeekLow ?? 0,
          changePercent:
            meta.regularMarketPrice && meta.previousClose
              ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
              : 0,
          change:
            meta.regularMarketPrice && meta.previousClose
              ? meta.regularMarketPrice - meta.previousClose
              : 0,
        };
      }
    }
  } catch (error) {
    console.error(`BSE fetch failed for ${ticker}:`, error);
  }

  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tickers } = req.body ?? {};

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "tickers array required" });
    }

    const results = await Promise.allSettled(
      tickers.map((ticker: string) =>
        fetchPrice(ticker).then((data) => ({ ticker, data })),
      ),
    );

    const prices: Record<string, StockPrice> = {};

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.data) {
        prices[result.value.ticker] = result.value.data;
      }
    }

    return res.status(200).json({
      prices,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Prices API error:", error);
    return res.status(500).json({ error: "Failed to fetch stock prices" });
  }
}
