import { z } from "zod";
import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "./_lib/http";
import { fetchJson } from "./_lib/upstream";
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/ai — portfolio analysis + chat (Groq primary, OpenRouter fallback).
 * Contract preserved from api/ai.ts: { response, insights, source }.
 *
 * Changes from the Vercel version, all deliberate: requires a Firebase ID
 * token (this endpoint spends LLM quota and must never be an open proxy),
 * 10/min per-user rate limit, 32 KB body cap with schema validation and
 * hard input-size limits, and a FINITE fallback chain: Groq (2 models) →
 * OpenRouter (2 models) → 503. No secrets and no upstream error bodies are
 * ever echoed to the client.
 */

const GROQ_TIMEOUT_MS = 15_000;
const OPENROUTER_TIMEOUT_MS = 20_000;
const MAX_CONTEXT_CHARS = 16_000;
const MAX_MESSAGE_CHARS = 8_000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chat"),
    messages: z.array(messageSchema).min(1).max(24),
    portfolioContext: z.string().max(MAX_CONTEXT_CHARS).optional(),
  }),
  z.object({
    type: z.enum(["analysis", "portfolio", "risk", "trade"]),
    prompt: z.string().max(MAX_MESSAGE_CHARS).optional(),
    portfolioSummary: z.string().max(MAX_CONTEXT_CHARS).optional(),
    portfolioContext: z.string().max(MAX_CONTEXT_CHARS).optional(),
    tradeData: z.string().max(MAX_MESSAGE_CHARS).optional(),
    question: z.string().max(2000).optional(),
  }),
]);

type AiBody = z.infer<typeof bodySchema>;

const buildSystemPrompt = (portfolioContext?: string): string => {
  const base = `You are an expert Indian stock market analyst and portfolio advisor.
You specialize in NSE/BSE equities. Always use ₹ for currency.
Be concise, direct, and actionable. Format with markdown where helpful.
Today's date context: Indian markets (NSE/BSE), IST timezone.`;

  if (!portfolioContext) return base;
  return `${base}

User's current portfolio context:
${portfolioContext}

Use this data when answering questions. If asked about specific stocks, refer to their actual positions.`;
};

type ChatMessage = { role: string; content: string };

const callProvider = async (
  url: string,
  apiKey: string | undefined,
  models: string[],
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<string | null> => {
  if (!apiKey) return null;

  for (const model of models) {
    const result = await fetchJson<{ choices?: Array<{ message?: { content?: string } }> }>(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1200,
          temperature: 0.7,
          stream: false,
        }),
      },
      timeoutMs,
    );

    if (result.ok) {
      const content = result.data.choices?.[0]?.message?.content;
      if (content) return content;
      continue;
    }
    // 429 (rate limit) and transient errors: try the next model. Auth errors
    // (401/403) will fail for every model — stop this provider entirely.
    if (result.status === 401 || result.status === 403) break;
  }
  return null;
};

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:ai`,
    RATE_LIMITS.ai.limit,
    RATE_LIMITS.ai.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const body = await readJsonBody(env, request, 32 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return errorResponse(env, request, 400, "Invalid request: expected a valid type with bounded fields");
  }
  const input: AiBody = parsed.data;

  let messages: ChatMessage[];
  if (input.type === "chat") {
    messages = [
      { role: "system", content: buildSystemPrompt(input.portfolioContext) },
      ...input.messages.slice(-12),
    ];
  } else {
    let userPrompt = "";
    if (typeof input.prompt === "string" && input.prompt.trim()) {
      userPrompt = input.prompt;
    } else if (input.type === "analysis" || input.type === "portfolio") {
      userPrompt = `Analyze this portfolio and give key insights, risks, and actionable recommendations:\n\n${input.portfolioSummary || input.portfolioContext || "No data provided"}`;
      if (input.question) userPrompt += `\n\nSpecific question: ${input.question}`;
    } else if (input.type === "risk") {
      userPrompt = `Identify key risks in this portfolio and suggest mitigations:\n\n${input.portfolioSummary ?? ""}`;
    } else {
      userPrompt = `Analyze this trade/position and give specific advice:\n\n${input.tradeData ?? ""}`;
    }
    messages = [
      { role: "system", content: buildSystemPrompt(input.portfolioContext) },
      { role: "user", content: userPrompt },
    ];
  }

  // Finite chain: Groq (2 models) → OpenRouter (2 models) → 503.
  let text = await callProvider(
    "https://api.groq.com/openai/v1/chat/completions",
    env.GROQ_API_KEY,
    ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    messages,
    GROQ_TIMEOUT_MS,
  );
  let source = "groq";

  if (!text) {
    text = await callProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      env.OPENROUTER_API_KEY,
      ["meta-llama/llama-3.3-70b-instruct:free", "meta-llama/llama-3.1-8b-instruct:free"],
      messages,
      OPENROUTER_TIMEOUT_MS,
    );
    source = "openrouter";
  }

  if (!text) {
    return errorResponse(env, request, 503, "AI service temporarily unavailable. Try again in a moment.");
  }

  return jsonResponse(env, request, { response: text, insights: text, source });
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
