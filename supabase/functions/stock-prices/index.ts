import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPrice(ticker: string): Promise<{ price: number; weekHigh52: number; changePercent: number; change: number } | null> {
  const symbol = `${ticker}.NS`;
  
  // Try Yahoo v8 chart API (no auth required)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          price: meta.regularMarketPrice ?? 0,
          weekHigh52: meta.fiftyTwoWeekHigh ?? 0,
          changePercent: meta.regularMarketPrice && meta.previousClose
            ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
            : 0,
          change: meta.regularMarketPrice && meta.previousClose
            ? meta.regularMarketPrice - meta.previousClose
            : 0,
        };
      }
    } else {
      const text = await res.text();
      console.error(`Yahoo v8 error for ${symbol}: ${res.status} ${text.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`Fetch error for ${symbol}:`, e);
  }

  // Fallback: try BSE suffix
  try {
    const bseSymbol = `${ticker}.BO`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(bseSymbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        return {
          price: meta.regularMarketPrice ?? 0,
          weekHigh52: meta.fiftyTwoWeekHigh ?? 0,
          changePercent: meta.regularMarketPrice && meta.previousClose
            ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
            : 0,
          change: meta.regularMarketPrice && meta.previousClose
            ? meta.regularMarketPrice - meta.previousClose
            : 0,
        };
      }
    } else {
      const text = await res.text();
      console.error(`Yahoo v8 BSE error for ${bseSymbol}: ${res.status} ${text.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`BSE fetch error for ${ticker}:`, e);
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(JSON.stringify({ error: "tickers array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all tickers in parallel
    const results = await Promise.allSettled(
      tickers.map((t: string) => fetchPrice(t).then((data) => ({ ticker: t, data })))
    );

    const prices: Record<string, { price: number; weekHigh52: number; changePercent: number; change: number }> = {};

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.data) {
        prices[result.value.ticker] = result.value.data;
      }
    }

    return new Response(JSON.stringify({ prices, fetchedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stock-prices error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
