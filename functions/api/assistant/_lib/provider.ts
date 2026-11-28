/**
 * Server-side tool-calling provider adapters.
 *
 * OpenAI, Groq and OpenRouter share one chat-completions adapter. Gemini uses
 * its native generateContent/function-calling wire format below.
 *
 * Contract, deliberately narrow:
 *  - `complete()` returns parsed text and tool calls, or `null` when the
 *    provider is unconfigured/unavailable. It never throws for an upstream
 *    failure: the orchestrator decides what a failure means.
 *  - Malformed entries in a provider reply are DROPPED, not coerced. A tool call
 *    with no name, or arguments that are not a string, is not an instruction.
 *  - A reply is capped (`MAX_TOOL_CALLS_PER_ROUND`) before it can cause work.
 *  - No provider error body is ever returned or logged by this module.
 *  - A key is read ONLY from its own dedicated env var. Nothing here copies a
 *    key between providers, and nothing reaches the browser bundle: this module
 *    is imported exclusively by Pages Functions.
 */

import { MAX_TOOL_CALLS_PER_ROUND, MAX_REPLY_CHARS } from "../../../../src/lib/assistant/schemas.ts";

export type ProviderName = "gemini" | "openai" | "groq" | "openrouter";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const PROVIDER_BASE_URL: Record<ProviderName, string> = {
  gemini: GEMINI_ENDPOINT,
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

/** Exposed for a configuration assertion in tests; not a secret. */
export const openAiEndpoint = (): string => PROVIDER_BASE_URL.openai;

const DEFAULT_MODELS: Record<ProviderName, string[]> = {
  gemini: ["gemini-3.5-flash-lite"],
  // gpt-4o-mini is tool-calling capable and inexpensive; the second entry is a
  // resilience step only used when the first is rate-limited or removed.
  openai: ["gpt-4o-mini", "gpt-4.1-mini"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  openrouter: ["meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.1-8b-instruct"],
};

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderToolCall {
  id: string;
  name: string;
  /** Raw JSON text as sent by the model. Validated by the registry, not here. */
  arguments: string;
  /** Gemini round-trip metadata; ignored by OpenAI-compatible adapters. */
  providerId?: string;
  thoughtSignature?: string;
}

export type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ProviderToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export interface ProviderRequest {
  system: string;
  messages: ProviderMessage[];
  tools: ToolSpec[];
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderReply {
  text: string | null;
  toolCalls: ProviderToolCall[];
  provider: ProviderName;
  model: string;
}

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  complete(request: ProviderRequest): Promise<ProviderReply | null>;
}

export interface ProviderEnv {
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  ASSISTANT_MODEL_GEMINI?: string;
  ASSISTANT_MODEL_PRIMARY?: string;
  ASSISTANT_MODEL_FALLBACK?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface WireToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface WireMessage {
  content?: unknown;
  tool_calls?: unknown;
}

interface WireReply {
  choices?: Array<{ message?: WireMessage }>;
}

/** Parses one provider reply into the narrow shape the orchestrator uses. */
export function parseProviderReply(
  payload: unknown,
  provider: ProviderName,
  model: string,
): ProviderReply | null {
  if (!isRecord(payload)) return null;
  const choices = (payload as WireReply).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const message = choices[0]?.message;
  if (!isRecord(message)) return null;

  const rawContent = message.content;
  const text =
    typeof rawContent === "string" && rawContent.trim().length > 0
      ? rawContent.slice(0, MAX_REPLY_CHARS)
      : null;

  const calls: ProviderToolCall[] = [];
  if (Array.isArray(message.tool_calls)) {
    for (const entry of message.tool_calls as WireToolCall[]) {
      if (calls.length >= MAX_TOOL_CALLS_PER_ROUND) break;
      if (!isRecord(entry)) continue;
      const fn = entry.function;
      if (!isRecord(fn)) continue;
      const name = typeof fn.name === "string" ? fn.name.trim() : "";
      const args = typeof fn.arguments === "string" ? fn.arguments : "";
      if (!name) continue;
      calls.push({
        id: typeof entry.id === "string" && entry.id ? entry.id : `call_${calls.length}`,
        name: name.slice(0, 64),
        arguments: args.slice(0, 2000),
      });
    }
  }

  // Neither prose nor a usable tool call: not a reply worth acting on.
  if (text === null && calls.length === 0) return null;

  return { text, toolCalls: calls, provider, model };
}

interface ProviderConfig {
  name: ProviderName;
  apiKey: string | undefined;
  models: string[];
}

/**
 * One attempt against one model.
 *
 * `fatal` means an authentication/authorisation failure, which no other model
 * on the same API key can fix — so the caller stops this provider instead of
 * spending the remaining model budget on the same rejection. The flag is
 * returned rather than kept in module state: an isolate serves concurrent
 * requests, and a shared mutable would cross-contaminate them.
 */
type Attempt =
  | { ok: true; reply: ProviderReply }
  | { ok: false; fatal: boolean; failure?: GeminiFailure };

type GeminiFailure =
  | "invalid_api_key"
  | "permission_denied"
  | "quota_exhausted"
  | "rate_limited"
  | "model_unavailable"
  | "network_error"
  | "timeout"
  | "malformed_response"
  | "unsupported_function_call"
  | "request_rejected"
  | "upstream_unavailable";

/**
 * Reads a bounded, non-secret classification from an error body.
 *
 * The body is never returned or logged; only these two booleans survive, so a
 * provider cannot use an error payload to smuggle text into a response.
 */
function classifyErrorBody(text: string): { quota: boolean } {
  // Substring probes only. The body itself is discarded by the caller.
  const quota = /"code"\s*:\s*"(insufficient_quota|billing_hard_limit_reached|quota_exceeded)"/i.test(text);
  return { quota };
}

/**
 * Decides whether an HTTP status ends this provider.
 *
 * Auth failures (401/403) can never be fixed by another model on the same key,
 * so they stop the provider. An exhausted quota (402, or a 429 whose body says
 * quota) also stops it — retrying burns a turn budget for a guaranteed failure.
 * A plain 429 is transient and moves on to the next model instead.
 */
function isFatalStatus(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status === 402) return true;
  if (status === 429) return classifyErrorBody(body).quota;
  return false;
}

function createProvider(config: ProviderConfig): Provider | null {
  const { name, apiKey, models } = config;
  if (!apiKey || models.length === 0) return null;

  return {
    name,
    model: models[0],
    async complete(request: ProviderRequest): Promise<ProviderReply | null> {
      // Model order is a finite fallback chain within one provider: a rate limit
      // or a transient error moves on; a fatal error stops this provider.
      for (const model of models) {
        const attempt = await callModel(name, apiKey, model, request);
        if (attempt.ok) return attempt.reply;
        if (attempt.fatal) break;
      }
      return null;
    },
  };
}

async function callModel(
  provider: ProviderName,
  apiKey: string,
  model: string,
  request: ProviderRequest,
): Promise<Attempt> {
  const body = {
    model,
    messages: [
      { role: "system", content: request.system },
      ...request.messages.map(toWireMessage),
    ],
    tools: request.tools,
    tool_choice: "auto",
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 800,
    stream: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetch(PROVIDER_BASE_URL[provider], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read the body only to classify it, then drop it. Never surfaced, never
      // logged, never attached to the returned value.
      const bodyText = await response.text().catch(() => "");
      const fatal = isFatalStatus(response.status, bodyText);
      return { ok: false, fatal };
    }

    const payload: unknown = await response.json().catch(() => null);
    const reply = parseProviderReply(payload, provider, model);
    return reply ? { ok: true, reply } : { ok: false, fatal: false };
  } catch {
    // Timeout, network failure, malformed JSON.
    return { ok: false, fatal: false };
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  request: ProviderRequest,
): Promise<Attempt> {
  const contents = toGeminiContents(request.messages);
  if (!contents) return { ok: false, fatal: false, failure: "unsupported_function_call" };

  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents,
    tools: [{ functionDeclarations: request.tools.map(toGeminiFunctionDeclaration) }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens ?? 800,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await readLimitedText(response, 16_384).catch(() => "");
      // Classify status without retaining, returning, or logging provider text.
      return {
        ok: false,
        fatal: false,
        failure: classifyGeminiFailure(response.status, errorBody ?? ""),
      };
    }

    const raw = await readLimitedText(response, 1_000_000);
    if (raw === null) return { ok: false, fatal: false, failure: "malformed_response" };
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, fatal: false, failure: "malformed_response" };
    }
    const reply = parseGeminiReply(payload, model);
    if (reply) return { ok: true, reply };
    return {
      ok: false,
      fatal: false,
      failure: hasFunctionCallPart(payload) ? "unsupported_function_call" : "malformed_response",
    };
  } catch (error) {
    // No upstream exception or response body crosses the server boundary.
    return {
      ok: false,
      fatal: false,
      failure: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function classifyGeminiFailure(status: number, body: string): GeminiFailure {
  if (status === 401) return "invalid_api_key";
  if (status === 400 && /api.?key|unauthenticated/i.test(body)) return "invalid_api_key";
  if (status === 403) {
    return /quota|billing|resource_exhausted/i.test(body) ? "quota_exhausted" : "permission_denied";
  }
  if (status === 429) {
    return /quota|resource_exhausted|billing/i.test(body) ? "quota_exhausted" : "rate_limited";
  }
  if (status === 404) return "model_unavailable";
  if (status >= 500) return "upstream_unavailable";
  return "request_rejected";
}

function hasFunctionCallPart(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return false;
  return payload.candidates.some((candidate) => {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return false;
    return candidate.content.parts.some((part) => isRecord(part) && "functionCall" in part);
  });
}

function createGeminiProvider(apiKey: string | undefined, model: string): Provider | null {
  if (!apiKey || !model) return null;
  return {
    name: "gemini",
    model,
    async complete(request: ProviderRequest): Promise<ProviderReply | null> {
      const attempt = await callGemini(apiKey, model, request);
      return attempt.ok ? attempt.reply : null;
    },
  };
}

/** Read provider output incrementally so a hostile or broken response cannot
 * force an unbounded allocation. null means the response exceeded the cap. */
async function readLimitedText(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function toGeminiFunctionDeclaration(tool: ToolSpec): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    parameters: toGeminiSchema(tool.function.parameters),
  };
}

/** Gemini uses uppercase schema types and does not accept JSON Schema's
 * additionalProperties constraint; runtime Zod validation remains authoritative. */
function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "additionalProperties" || key === "minimum" || key === "maximum") continue;
    if (key === "type" && typeof entry === "string") {
      result[key] = entry.toUpperCase();
    } else {
      result[key] = toGeminiSchema(entry);
    }
  }
  return result;
}

function toGeminiContents(messages: ProviderMessage[]): Array<Record<string, unknown>> | null {
  const callsById = new Map<string, { name: string; providerId?: string }>();
  const contents: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        let args: unknown;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          return null;
        }
        if (!isRecord(args)) return null;
        callsById.set(call.id, {
          name: call.name,
          ...(call.providerId ? { providerId: call.providerId } : {}),
        });
        parts.push({
          functionCall: { name: call.name, args },
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }
    if (message.role !== "tool") continue;
    const call = callsById.get(message.tool_call_id);
    if (!call) return null;
    let result: unknown;
    try {
      result = JSON.parse(message.content);
    } catch {
      result = { result: message.content };
    }
    contents.push({
      role: "user",
      parts: [{
        functionResponse: {
          name: call.name,
          response: isRecord(result) ? result : { result },
          ...(call.providerId ? { id: call.providerId } : {}),
        },
      }],
    });
  }
  return contents;
}

function parseGeminiReply(payload: unknown, model: string): ProviderReply | null {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return null;

  let text = "";
  const calls: ProviderToolCall[] = [];
  for (const part of candidate.content.parts) {
    if (!isRecord(part)) continue;
    if (typeof part.text === "string") text += part.text;
    if (!isRecord(part.functionCall)) continue;
    const call = part.functionCall;
    const name = typeof call.name === "string" ? call.name.trim() : "";
    if (!name || !isRecord(call.args) || calls.length >= MAX_TOOL_CALLS_PER_ROUND) continue;
    calls.push({
      id: `gemini_call_${calls.length}`,
      name: name.slice(0, 64),
      arguments: JSON.stringify(call.args).slice(0, 2000),
      ...(typeof call.id === "string" && call.id ? { providerId: call.id.slice(0, 128) } : {}),
      ...(typeof part.thoughtSignature === "string" && part.thoughtSignature
        ? { thoughtSignature: part.thoughtSignature.slice(0, 8192) }
        : {}),
    });
  }
  const cleanText = text.trim().slice(0, MAX_REPLY_CHARS) || null;
  if (cleanText === null && calls.length === 0) return null;
  return { text: cleanText, toolCalls: calls, provider: "gemini", model };
}

function toWireMessage(message: ProviderMessage): Record<string, unknown> {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.tool_calls && message.tool_calls.length > 0
        ? {
            tool_calls: message.tool_calls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.tool_call_id, content: message.content };
  }
  return { role: message.role, content: message.content };
}

export interface ProviderChain {
  primary: Provider | null;
  fallback: Provider | null;
  tertiary: Provider | null;
}

/**
 * Builds the chain from the environment.
 *
 * Order is deliberate and reflects what production actually holds:
 *
 *  - `primary`   — Gemini, when `GEMINI_API_KEY` is present.
 *  - `fallback`  — OpenAI, when `OPENAI_API_KEY` is present.
 *  - `tertiary`  — Groq, when `GROQ_API_KEY` is present.
 *
 * OpenRouter is no longer wired into the chain in production: its key is not
 * configured, so a third slot would only be a dead entry. The adapter still
 * supports it, and adding it back is a two-line change if a key appears.
 *
 * A missing key simply omits that provider; when none is configured the
 * orchestrator runs its deterministic fallback instead of failing the request.
 *
 * Model overrides are server-side only. Gemini has its own model override;
 * ASSISTANT_MODEL_PRIMARY and ASSISTANT_MODEL_FALLBACK continue to select the
 * OpenAI and Groq model chains respectively.
 */
export function createProviderChain(env: ProviderEnv): ProviderChain {
  const primaryOverride = env.ASSISTANT_MODEL_PRIMARY?.trim();
  const fallbackOverride = env.ASSISTANT_MODEL_FALLBACK?.trim();
  const geminiModel = env.ASSISTANT_MODEL_GEMINI?.trim() || DEFAULT_MODELS.gemini[0];

  const gemini = createGeminiProvider(env.GEMINI_API_KEY, geminiModel);
  const openAiModels = primaryOverride ? [primaryOverride, ...DEFAULT_MODELS.openai] : DEFAULT_MODELS.openai;
  const groqModels = fallbackOverride ? [fallbackOverride, ...DEFAULT_MODELS.groq] : DEFAULT_MODELS.groq;
  const openai = createProvider({ name: "openai", apiKey: env.OPENAI_API_KEY, models: openAiModels });
  const groq = createProvider({ name: "groq", apiKey: env.GROQ_API_KEY, models: groqModels });
  const configured = [gemini, openai, groq].filter((provider): provider is Provider => provider !== null);

  return {
    primary: configured[0] ?? null,
    fallback: configured[1] ?? null,
    tertiary: configured[2] ?? null,
  };
}
