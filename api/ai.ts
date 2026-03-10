function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function buildLegacyPrompt(body: any): string | null {
  const { type, portfolioSummary, tradeData } = body ?? {};
  if (type === "portfolio" && portfolioSummary)
    return `You are a professional Indian stock market analyst. Analyze this portfolio and provide insights with markdown headers.\n\nPortfolio Data:\n${portfolioSummary}`;
  if (type === "risk" && portfolioSummary)
    return `You are a portfolio risk analyst for Indian equity markets. Identify risks.\n\nPortfolio Data:\n${portfolioSummary}`;
  if (type === "trade" && tradeData)
    return `You are a stock trade analyst for Indian markets. Analyze this position.\n\nPosition Details:\n${tradeData}`;
  return null;
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is missing");
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured." });
  }

  try {
    const body = req.body ?? {};
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim().length > 0
        ? body.prompt
        : buildLegacyPrompt(body);

    if (!prompt) return res.status(400).json({ error: "A valid prompt is required" });

    console.log("Calling OpenRouter API...");

    // Free models on OpenRouter — tries in order
    const models = [
      "meta-llama/llama-3.3-70b-instruct:free",
      "meta-llama/llama-3.1-8b-instruct:free",
      "mistralai/mistral-7b-instruct:free",
      "google/gemma-2-9b-it:free",
    ];

    let text: string | null = null;
    let lastError: any = null;

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://zen-stock-folio.vercel.app",
            "X-Title": "Smart Stock Tracker",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            messages: [
              {
                role: "system",
                content: "You are a professional Indian stock market analyst. Always use ₹ for currency. Format responses with markdown headers and bullet points.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error?.message || `HTTP ${response.status}`);
        }

        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          text = content;
          console.log(`Success with model: ${model}`);
          break;
        }
      } catch (err: any) {
        console.error(`Model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!text) {
      return res.status(500).json({ error: lastError?.message || "All AI models failed" });
    }

    return res.status(200).json({ response: text, insights: text });

  } catch (error: any) {
    console.error("AI handler error:", error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to generate AI response" });
  }
}