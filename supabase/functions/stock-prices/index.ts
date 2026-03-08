import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Build Yahoo Finance symbols (append .NS for NSE)
    const symbols = tickers.map((t: string) => `${t}.NS`).join(",");
    
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,fiftyTwoWeekHigh,regularMarketChangePercent,regularMarketChange`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Yahoo Finance error:", response.status, text);
      return new Response(JSON.stringify({ error: "Failed to fetch stock data", status: response.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    const prices: Record<string, { price: number; weekHigh52: number; changePercent: number; change: number }> = {};

    for (const quote of quotes) {
      const ticker = quote.symbol?.replace(".NS", "").replace(".BO", "");
      if (ticker) {
        prices[ticker] = {
          price: quote.regularMarketPrice ?? 0,
          weekHigh52: quote.fiftyTwoWeekHigh ?? 0,
          changePercent: quote.regularMarketChangePercent ?? 0,
          change: quote.regularMarketChange ?? 0,
        };
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
