/**
 * The conversation engine.
 *
 * Responsibilities, in order: give the model a bounded conversation, let it ask
 * for tools, execute those tools against the caller's own data, feed the results
 * back, stop, and return something the UI can render. It owns no facts of its
 * own — every number in a reply came from a tool, and every tool ran through the
 * registry's validation.
 *
 * Hard bounds (all enforced here, not by the prompt):
 *  - MAX_TOOL_ROUNDS model round-trips
 *  - MAX_TOOL_CALLS tool executions
 *  - MAX_TOOL_CALLS_PER_ROUND calls parsed from one reply (in provider.ts)
 *  - 20 s per provider call, 45 s for the whole turn
 *  - MAX_CARDS_PER_TURN cards rendered
 *
 * When a bound is hit, or no provider answers, the turn degrades to the
 * deterministic router instead of returning a half-finished answer.
 */

import {
  MAX_CARDS_PER_TURN,
  MAX_TOOL_CALLS,
  MAX_TOOL_ROUNDS,
  type AssistantCard,
  type AssistantChatMessage,
  type AssistantConversationContext,
  type AssistantToolTrace,
} from "../../../../src/lib/assistant/schemas.ts";
import { createProviderChain, type ProviderChain, type ProviderMessage, type ProviderReply, type ToolSpec } from "./provider";
import { executeToolDefinition, modelToolSpecs } from "./tools/registry";
import { buildSystemPrompt } from "./prompt";
import { containsMutationClaim, MUTATION_CORRECTION, serializeToolResult } from "./guard";
import { logAssistantEvent } from "./log";
import { runDeterministicFallback } from "./degraded";
import type { ToolContext } from "./context";

const PROVIDER_TIMEOUT_MS = 20_000;
const TURN_BUDGET_MS = 45_000;

export interface AssistantTurnInput {
  ctx: ToolContext;
  conversationId: string;
  messages: AssistantChatMessage[];
  // Derived from the wire schema so client validation and server consumption
  // cannot drift apart. Context never reaches ToolContext, only the prompt.
  context?: AssistantConversationContext;
}

export interface AssistantTurnOutput {
  reply: string;
  cards: AssistantCard[];
  degraded: boolean;
  provider: string | null;
  model: string | null;
  usage: { rounds: number; toolCalls: number; durationMs: number };
  toolTrace: AssistantToolTrace[];
}

const cardKey = (card: AssistantCard): string => {
  switch (card.kind) {
    case "quote":
      return `quote:${card.ticker}`;
    case "navigation":
      return `navigation:${card.path}`;
    case "stocks":
      return `stocks:${card.title}`;
    default:
      return `${card.kind}:${card.title}`;
  }
};

/** Tries the primary provider, then the fallback, for one round. */
async function askProviders(
  chain: ProviderChain,
  system: string,
  conversation: ProviderMessage[],
  tools: ToolSpec[],
): Promise<ProviderReply | null> {
  const request = {
    system,
    messages: [...conversation],
    tools,
    timeoutMs: PROVIDER_TIMEOUT_MS,
  };

  if (chain.primary) {
    const reply = await chain.primary.complete(request);
    if (reply) return reply;
  }
  if (chain.fallback) {
    const reply = await chain.fallback.complete(request);
    if (reply) return reply;
  }
  return null;
}

/**
 * Final text guard. A model that claims to have changed something is always
 * wrong in this phase (there is no write tool), and a wrong claim about a
 * portfolio is worse than no answer.
 */
function finalizeReply(text: string | null, cardCount: number): string {
  const trimmed = (text ?? "").trim();
  if (containsMutationClaim(trimmed)) return MUTATION_CORRECTION;
  if (trimmed.length > 0) return trimmed;
  return cardCount > 0 ? "Here is what I found." : "I could not find an answer to that.";
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnOutput> {
  const startedAt = Date.now();
  const { ctx } = input;

  // Live counters for the turn; `completed` reports them so the client (and the
  // audit log) can see how much work an answer actually cost.
  const counters = { rounds: 0, toolCalls: 0 };

  const completed = (
    fields: Omit<AssistantTurnOutput, "usage">,
  ): AssistantTurnOutput => ({
    ...fields,
    usage: {
      rounds: counters.rounds,
      toolCalls: counters.toolCalls,
      durationMs: Date.now() - startedAt,
    },
  });

  const degradedTurn = async (reason: "no_provider" | "provider_failed"): Promise<AssistantTurnOutput> => {
    const fallback = await runDeterministicFallback(ctx, input.messages, input.context);
    logAssistantEvent({
      event: "chat",
      uid: ctx.uid,
      conversationId: input.conversationId,
      status: "ok",
      httpStatus: 200,
      rounds: 0,
      toolCalls: fallback.toolCalls,
      durationMs: Date.now() - startedAt,
      provider: null,
      model: null,
      degraded: true,
    });
    void reason;
    return completed({
      reply: fallback.reply.slice(0, 4000),
      cards: fallback.cards.slice(0, MAX_CARDS_PER_TURN),
      degraded: true,
      provider: null,
      model: null,
      toolTrace: fallback.toolTrace,
    });
  };

  const chain = createProviderChain(ctx.env);
  if (!chain.primary && !chain.fallback) return degradedTurn("no_provider");

  const tools = modelToolSpecs();
  const system = buildSystemPrompt({ now: ctx.now, ...input.context });
  const conversation: ProviderMessage[] = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const cards: AssistantCard[] = [];
  const toolTrace: AssistantToolTrace[] = [];
  const summaries: string[] = [];
  let usedProvider: string | null = null;
  let usedModel: string | null = null;

  const pushCard = (card: AssistantCard): void => {
    if (cards.length >= MAX_CARDS_PER_TURN) return;
    if (cards.some((existing) => cardKey(existing) === cardKey(card))) return;
    cards.push(card);
  };

  while (counters.rounds < MAX_TOOL_ROUNDS && Date.now() - startedAt < TURN_BUDGET_MS) {
    counters.rounds += 1;

    const reply = await askProviders(chain, system, conversation, tools);
    if (!reply) break;

    usedProvider = reply.provider;
    usedModel = reply.model;

    conversation.push({
      role: "assistant",
      content: reply.text,
      ...(reply.toolCalls.length > 0 ? { tool_calls: reply.toolCalls } : {}),
    });

    if (reply.toolCalls.length === 0) {
      return completed({
        reply: finalizeReply(reply.text, cards.length),
        cards,
        degraded: false,
        provider: usedProvider,
        model: usedModel,
        toolTrace,
      });
    }

    for (const call of reply.toolCalls) {
      if (counters.toolCalls >= MAX_TOOL_CALLS) break;
      counters.toolCalls += 1;

      const callStarted = Date.now();
      const executed = await executeToolDefinition(ctx, call.name, call.arguments);
      const durationMs = Date.now() - callStarted;

      const traceStatus: AssistantToolTrace["status"] =
        executed.status === "ok" ? "ok" : executed.status === "error" ? "error" : "skipped";
      toolTrace.push({ name: call.name, status: traceStatus, durationMs });

      // Counts, names and durations only — never the arguments or the payload.
      logAssistantEvent({
        event: "tool",
        uid: ctx.uid,
        conversationId: input.conversationId,
        tool: call.name,
        status: executed.status,
        durationMs,
      });

      if (executed.outcome.status === "ok") {
        summaries.push(executed.outcome.summary);
        if (executed.outcome.card) pushCard(executed.outcome.card);
      }

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: serializeToolResult(executed.outcome),
      });
    }
  }

  // The model ran out of rounds (or the budget expired) still gathering data.
  // Answering from the tool summaries keeps the turn useful and stays factual.
  if (summaries.length > 0) {
    return completed({
      reply: `${summaries.slice(0, 3).join(" ")} (I stopped there — ask a narrower question if you need more.)`,
      cards,
      degraded: false,
      provider: usedProvider,
      model: usedModel,
      toolTrace,
    });
  }

  return degradedTurn("provider_failed");
}
