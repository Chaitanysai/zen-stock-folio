/**
 * /api/ai.ts  — AI handler for portfolio analysis + chat
 *
 * Primary:  Groq (Llama 3.3 70B) — 14,400 req/day free, ~300 tok/sec, no CC needed
 * Fallback: OpenRouter free models — existing integration
 *
 * Supports two modes:
 *  1. { type: "analysis", portfolioData, question? } — portfolio analysis
 *  2. { type: "chat", messages: [{role,content}], portfolioContext } — multi-turn chat
 */

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── Groq (primary — fastest free LLM available) ───────────────────────────────
async function callGroq(
  messages: { role: string; content: string }[],
  maxTokens = 1200
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { console.warn("GROQ_API_KEY not set"); return null; }

  const models = [
    "llama-3.3-70b-versatile",   // best quality
    "llama-3.1-8b-instant",      // faster fallback
    "deepseek-r1-distill-llama-70b", // strong for finance
  ];

  for (const model of models) {
    try {
      console.log(`Groq trying: ${model}`);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();
      if (!res.ok) {
        console.warn(`Groq ${model}: ${data?.error?.message}`);
        if (res.status === 429) continue; // rate limit — try next model
        break; // auth/other error — skip groq entirely
      }

      const content = data?.choices?.[0]?.message?.content;
      if (content) { console.log(`✅ Groq ${model}`); return content; }
    } catch (e: any) {
      console.warn(`Groq ${model} threw:`, e?.message);
    }
  }
  return null;
}

// ── OpenRouter (fallback — existing integration) ──────────────────────────────
async function callOpenRouter(
  messages: { role: string; content: string }[],
  maxTokens = 1200
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const models = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ];

  for (const model of models) {
    try {
      console.log(`OpenRouter trying: ${model}`);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://zen-stock-folio.vercel.app",
          "X-Title": "Smart Stock Tracker",
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();
      if (!res.ok) { console.warn(`OpenRouter ${model}: ${data?.error?.message}`); continue; }
      const content = data?.choices?.[0]?.message?.content;
      if (content) { console.log(`✅ OpenRouter ${model}`); return content; }
    } catch (e: any) {
      console.warn(`OpenRouter ${model} threw:`, e?.message);
    }
  }
  return null;
}

// ── System prompt factory ─────────────────────────────────────────────────────
function buildSystemPrompt(portfolioContext?: string): string {
  const base = `You are an expert Indian stock market analyst and portfolio advisor.
You specialize in NSE/BSE equities. Always use ₹ for currency.
Be concise, direct, and actionable. Format with markdown where helpful.
Today's date context: Indian markets (NSE/BSE), IST timezone.`;

  if (!portfolioContext) return base;
  return `${base}

User's current portfolio context:
${portfolioContext}

Use this data when answering questions. If asked about specific stocks, refer to their actual positions.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body ?? {};
    const { type, portfolioContext } = body;

    let messages: { role: string; content: string }[] = [];

    if (type === "chat") {
      // Multi-turn chat — messages array comes from client
      const clientMessages: { role: string; content: string }[] = body.messages ?? [];
      if (!clientMessages.length) return res.status(400).json({ error: "messages array required" });

      messages = [
        { role: "system", content: buildSystemPrompt(portfolioContext) },
        ...clientMessages.slice(-12), // keep last 12 messages for context window
      ];

    } else {
      // Legacy analysis mode (portfolio/risk/trade) + new "analysis" type
      const { prompt, portfolioSummary, tradeData, question } = body;
      let userPrompt = "";

      if (typeof prompt === "string" && prompt.trim()) {
        userPrompt = prompt;
      } else if (type === "analysis" || type === "portfolio") {
        userPrompt = `Analyze this portfolio and give key insights, risks, and actionable recommendations:\n\n${portfolioSummary || portfolioContext || "No data provided"}`;
        if (question) userPrompt += `\n\nSpecific question: ${question}`;
      } else if (type === "risk") {
        userPrompt = `Identify key risks in this portfolio and suggest mitigations:\n\n${portfolioSummary}`;
      } else if (type === "trade") {
        userPrompt = `Analyze this trade/position and give specific advice:\n\n${tradeData}`;
      } else {
        return res.status(400).json({ error: "Valid type or prompt required" });
      }

      messages = [
        { role: "system", content: buildSystemPrompt(portfolioContext) },
        { role: "user", content: userPrompt },
      ];
    }

    // Try Groq first, fall back to OpenRouter
    let text = await callGroq(messages);
    let source = "groq";

    if (!text) {
      text = await callOpenRouter(messages);
      source = "openrouter";
    }

    if (!text) {
      return res.status(503).json({
        error: "AI service temporarily unavailable. Both Groq and OpenRouter failed. Try again in a moment.",
      });
    }

    return res.status(200).json({ response: text, insights: text, source });

  } catch (err: any) {
    console.error("AI handler error:", err?.message);
    return res.status(500).json({ error: err?.message || "Unexpected error" });
  }
}