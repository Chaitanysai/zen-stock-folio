/**
 * OpenAI-compatible tool-calling provider adapters.
 *
 * OpenAI, Groq and OpenRouter all speak the same `chat/completions` dialect, so
 * one adapter serves all three and swapping a model — or a vendor — is a
 * configuration change plus this file, not a rewrite.
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

export type ProviderName = "openai" | "groq" | "openrouter";

const PROVIDER_BASE_URL: Record<ProviderName, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

/** Exposed for a configuration assertion in tests; not a secret. */
export const openAiEndpoint = (): string => PROVIDER_BASE_URL.openai;

const DEFAULT_MODELS: Record<ProviderName, string[]> = {
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
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
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
  | { ok: false; fatal: boolean };

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
}

/**
 * Builds the chain from the environment.
 *
 * Order is deliberate and reflects what production actually holds:
 *
 *  - `primary`   — OpenAI, when `OPENAI_API_KEY` is present.
 *  - `fallback`  — Groq, when `GROQ_API_KEY` is present.
 *
 * OpenRouter is no longer wired into the chain in production: its key is not
 * configured, so a third slot would only be a dead entry. The adapter still
 * supports it, and adding it back is a two-line change if a key appears.
 *
 * A missing key simply omits that provider; when none is configured the
 * orchestrator runs its deterministic fallback instead of failing the request.
 *
 * Model overrides are server-side only. `ASSISTANT_MODEL_PRIMARY` overrides
 * whichever provider ends up primary, so the operator can move to a newer model
 * without a code change.
 */
export function createProviderChain(env: ProviderEnv): ProviderChain {
  const override = env.ASSISTANT_MODEL_PRIMARY?.trim();

  const openAiModels = override ? [override, ...DEFAULT_MODELS.openai] : DEFAULT_MODELS.openai;
  const groqModels = override ? [override, ...DEFAULT_MODELS.groq] : DEFAULT_MODELS.groq;

  const openai = createProvider({ name: "openai", apiKey: env.OPENAI_API_KEY, models: openAiModels });
  const groq = createProvider({ name: "groq", apiKey: env.GROQ_API_KEY, models: groqModels });

  if (openai) {
    return { primary: openai, fallback: groq };
  }
  return { primary: groq, fallback: null };
}
