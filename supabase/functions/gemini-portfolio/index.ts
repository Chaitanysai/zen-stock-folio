import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured. Please configure GOOGLE_API_KEY." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, portfolioSummary, tradeData } = await req.json();

    let prompt = "";
    let systemInstruction = "";

    if (type === "portfolio") {
      systemInstruction = `You are a professional Indian stock market analyst. Provide actionable insights for retail investors. Use ₹ for currency. Be specific with numbers. Format with markdown headers and bullet points.`;
      prompt = `Analyze this stock portfolio and provide insights in these sections:

## Portfolio Insights
Overall health, performance summary

## Risk Warnings
Stocks close to stop loss, high-risk positions

## Diversification Suggestions
Sector concentration, rebalancing advice

## Trade Observations
Stocks approaching targets, momentum analysis

Portfolio Data:
${portfolioSummary}`;
    } else if (type === "trade") {
      systemInstruction = `You are a professional stock trade analyst for Indian markets. Provide concise, actionable analysis. Use ₹ for currency.`;
      prompt = `Analyze this stock position and provide:
• Risk level (Low/Medium/High)
• Probability assessment of reaching targets
• Specific trade advice (hold/exit/add)

Position Details:
${tradeData}`;
    } else if (type === "risk") {
      systemInstruction = `You are a portfolio risk analyst for Indian equity markets. Focus on identifying risks and providing actionable mitigation strategies. Use ₹ for currency.`;
      prompt = `Scan this portfolio and identify:

## High-Risk Positions
Positions with significant downside risk

## Concentration Risk
Over-allocation to specific stocks or sectors

## Sector Exposure
Sectors that are overexposed or underrepresented

## Stop Loss Proximity
Positions near stop loss levels that need attention

Portfolio Data:
${portfolioSummary}`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid analysis type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a minute." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";

    return new Response(JSON.stringify({ insights: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Gemini function error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
