import { GoogleGenerativeAI } from "@google/generative-ai";

function buildLegacyPrompt(body: any): string | null {
  const { type, portfolioSummary, tradeData } = body ?? {};

  if (type === "portfolio" && portfolioSummary) {
    return `You are a professional Indian stock market analyst. Provide actionable insights for retail investors. Use ₹ for currency. Be specific with numbers. Format with markdown headers and bullet points.\n\nAnalyze this stock portfolio and provide insights in these sections:\n\n## Portfolio Insights\nOverall health, performance summary\n\n## Risk Warnings\nStocks close to stop loss, high-risk positions\n\n## Diversification Suggestions\nSector concentration, rebalancing advice\n\n## Trade Observations\nStocks approaching targets, momentum analysis\n\nPortfolio Data:\n${portfolioSummary}`;
  }

  if (type === "risk" && portfolioSummary) {
    return `You are a portfolio risk analyst for Indian equity markets. Focus on identifying risks and providing actionable mitigation strategies. Use ₹ for currency.\n\nScan this portfolio and identify:\n\n## High-Risk Positions\nPositions with significant downside risk\n\n## Concentration Risk\nOver-allocation to specific stocks or sectors\n\n## Sector Exposure\nSectors that are overexposed or underrepresented\n\n## Stop Loss Proximity\nPositions near stop loss levels that need attention\n\nPortfolio Data:\n${portfolioSummary}`;
  }

  if (type === "trade" && tradeData) {
    return `You are a professional stock trade analyst for Indian markets. Provide concise, actionable analysis. Use ₹ for currency.\n\nAnalyze this stock position and provide:\n• Risk level (Low/Medium/High)\n• Probability assessment of reaching targets\n• Specific trade advice (hold/exit/add)\n\nPosition Details:\n${tradeData}`;
  }

  return null;
}

function setCors(res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: any, res: any) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_API_KEY is not configured" });
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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json({
      response: text,
      insights: text,
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: "Failed to generate AI response" });
  }
}
