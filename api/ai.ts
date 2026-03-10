import { GoogleGenerativeAI } from "@google/generative-ai";

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function buildLegacyPrompt(body: any): string | null {
  const { type, portfolioSummary, tradeData } = body ?? {};
  if (type === "portfolio" && portfolioSummary) {
    return `You are a professional Indian stock market analyst. Analyze this portfolio and provide insights with markdown headers.\n\nPortfolio Data:\n${portfolioSummary}`;
  }
  if (type === "risk" && portfolioSummary) {
    return `You are a portfolio risk analyst for Indian equity markets. Identify risks in this portfolio.\n\nPortfolio Data:\n${portfolioSummary}`;
  }
  if (type === "trade" && tradeData) {
    return `You are a stock trade analyst for Indian markets. Analyze this position.\n\nPosition Details:\n${tradeData}`;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_API_KEY is missing from environment variables");
    return res.status(500).json({ error: "GOOGLE_API_KEY is not configured on the server." });
  }

  try {
    const body = req.body ?? {};
    const prompt =
      typeof body.prompt === "string" && body.prompt.trim().length > 0
        ? body.prompt
        : buildLegacyPrompt(body);

    if (!prompt) {
      return res.status(400).json({ error: "A valid prompt is required" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Try models in order — newest stable first
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-pro",
      "gemini-1.0-pro",
    ];

    let text: string | null = null;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        text = result.response.text();
        console.log(`Success with model: ${modelName}`);
        break;
      } catch (err: any) {
        console.error(`Model ${modelName} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!text) {
      const msg = lastError?.message || "All AI models failed";
      console.error("All models failed. Last error:", msg);
      return res.status(500).json({ error: `AI failed: ${msg}` });
    }

    return res.status(200).json({ response: text, insights: text });

  } catch (error: any) {
    console.error("Gemini API top-level error:", error?.message || error);
    return res.status(500).json({ 
      error: error?.message || "Failed to generate AI response" 
    });
  }
}