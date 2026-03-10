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

async function getFreeModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const data = await res.json();
    const free = (data?.data || [])
      .filter((m: any) => m.id?.endsWith(":free"))
      .map((m: any) => m.id);
    console.log(`Found ${free.length} free models:`, free.slice(0, 5));
    return free;
  } catch (e) {
    console.error("Failed to list models:", e);
    return [];
  }
}

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured." });
  }

  try {
    const body = req.body ?? {};
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim().length > 0
        ? body.prompt
        : buildLegacyPrompt(body);

    if (!prompt) return res.status(400).json({ error: "A valid prompt is required" });

    // Dynamically fetch available free models, fallback to known ones
    const discovered = await getFreeModels(apiKey);
    const fallbacks = [
      "meta-llama/llama-3.3-70b-instruct:free",
      "meta-llama/llama-3.1-8b-instruct:free",
      "qwen/qwen-2.5-7b-instruct:free",
      "mistralai/mistral-small-3.1-24b-instruct:free",
    ];
    // Prefer discovered, keep fallbacks as backup
    const models = discovered.length > 0
      ? [...new Set([...fallbacks, ...discovered])].slice(0, 6)
      : fallbacks;

    let text: string | null = null;
    let lastError: any = null;

    for (const model of models) {
      try {
        console.log(`Trying: ${model}`);
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
                content: "You are a professional Indian stock market analyst. Use ₹ for currency. Format with markdown.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errMsg = data?.error?.message || `HTTP ${response.status}`;
          console.error(`${model} failed: ${errMsg}`);
          lastError = new Error(errMsg);
          continue;
        }

        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          text = content;
          console.log(`✅ Success: ${model}`);
          break;
        }
      } catch (err: any) {
        console.error(`${model} threw:`, err?.message);
        lastError = err;
      }
    }

    if (!text) {
      return res.status(500).json({
        error: `No available AI models found. Last error: ${lastError?.message || "unknown"}`
      });
    }

    return res.status(200).json({ response: text, insights: text });

  } catch (error: any) {
    console.error("AI handler error:", error?.message);
    return res.status(500).json({ error: error?.message || "Failed to generate AI response" });
  }
}