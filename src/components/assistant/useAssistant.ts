import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  assistantChatResponseSchema,
  type AssistantCard,
  type AssistantChatResponse,
  type AssistantPageContext,
} from "@/lib/assistant/schemas";
import { capMessages, clearStoredMessages, loadStoredMessages, saveStoredMessages } from "@/lib/assistant/storage";
import type { AssistantMessage } from "@/lib/assistant/types";

/** Server-declared failure. `status` is 0 for a transport failure. */
class AssistantRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AssistantRequestError";
    this.status = status;
  }
}

/** Turns an HTTP outcome into something a user can act on. */
function messageFor(status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) return "Your session expired. Sign in again to use the assistant.";
  if (status === 429) return serverMessage || "Too many assistant requests. Give it a moment.";
  if (status === 503) return serverMessage || "The assistant is temporarily unavailable.";
  if (status === 413) return "That message is too long — try a shorter question.";
  if (status >= 500) return "The assistant hit an unexpected error. Nothing was changed.";
  return serverMessage || "The assistant could not answer that. Nothing was changed.";
}

const newConversationId = (): string => {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // The server accepts [A-Za-z0-9_-]{8,64}; a UUID already matches.
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64).padEnd(8, "0");
};

let messageCounter = 0;
const nextMessageId = (prefix: string): string => {
  messageCounter += 1;
  return `${prefix}-${Date.now()}-${messageCounter}`;
};

async function requestTurn(
  payload: unknown,
  signal: AbortSignal,
): Promise<AssistantChatResponse> {
  let response: Response;
  try {
    response = await apiFetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    // A supersede/unmount is not a failure the user needs to see.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AssistantRequestError("Could not reach the assistant. Check your connection.", 0);
  }

  if (!response.ok) {
    let serverMessage: string | undefined;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error) serverMessage = body.error;
    } catch {
      // Non-JSON error body: fall back to the status-based message.
    }
    throw new AssistantRequestError(messageFor(response.status, serverMessage), response.status);
  }

  const json: unknown = await response.json().catch(() => null);
  const parsed = assistantChatResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new AssistantRequestError("The assistant returned an unreadable response.", response.status);
  }
  return parsed.data;
}

export type AssistantStatus = "idle" | "sending";

export interface AssistantHydration {
  provider: string | null;
  model: string | null;
  degraded: boolean;
}

export interface UseAssistantResult {
  messages: AssistantMessage[];
  status: AssistantStatus;
  error: string | null;
  hydration: AssistantHydration;
  canSend: boolean;
  send: (text: string) => void;
  retry: () => void;
  clear: () => void;
}

/**
 * Conversation state for one signed-in user.
 *
 * The uid is the only scope: switching accounts swaps both the in-memory thread
 * and the storage key, so one user's conversation can never appear in another's
 * panel. Every response is validated before it is rendered, and a response that
 * arrives after a newer turn (or after the panel was cleared) is discarded.
 */
export function useAssistant(
  userId: string | null,
  pageContext?: AssistantPageContext | null,
): UseAssistantResult {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hydration, setHydration] = useState<AssistantHydration>({
    provider: null,
    model: null,
    degraded: false,
  });

  const messagesRef = useRef<AssistantMessage[]>([]);
  const conversationIdRef = useRef<string>(newConversationId());
  const contextRef = useRef<{ market?: "NSE" | "US"; ticker?: string }>({});
  // Screen hint captured at send time. Written during render so a turn always
  // carries the section that was on screen when the user pressed send.
  const pageContextRef = useRef<AssistantPageContext | null>(pageContext ?? null);
  pageContextRef.current = pageContext ?? null;
  /** Consecutive turns with no entity-bearing card; expires a stale antecedent. */
  const entitylessTurnsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const busyRef = useRef(false);

  const commit = useCallback(
    (next: AssistantMessage[]) => {
      messagesRef.current = next;
      setMessages(next);
      saveStoredMessages(userId, next);
    },
    [userId],
  );

  // Scope reset: a new uid (or sign-out) must never inherit the previous thread.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    sequenceRef.current += 1;

    conversationIdRef.current = newConversationId();
    contextRef.current = {};
    entitylessTurnsRef.current = 0;
    setError(null);
    setStatus("idle");
    setHydration({ provider: null, model: null, degraded: false });

    const restored = userId ? loadStoredMessages(userId) : [];
    messagesRef.current = restored;
    setMessages(restored);
  }, [userId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const postTurn = useCallback(
    async (history: AssistantMessage[]) => {
      if (!userId) return;

      busyRef.current = true;
      setStatus("sending");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;

      const entity = contextRef.current;
      const page = pageContextRef.current;
      const context = { ...entity, ...(page ? { page } : {}) };
      const payload = {
        conversationId: conversationIdRef.current,
        messages: history
          .slice(-MAX_HISTORY_MESSAGES)
          .map((message) => ({ role: message.role, content: message.content.slice(0, MAX_MESSAGE_CHARS) })),
        ...(context.market || context.ticker || context.page ? { context } : {}),
      };

      try {
        const turn = await requestTurn(payload, controller.signal);
        if (sequence !== sequenceRef.current) return;

        // Entity continuity (B1): a single unambiguous instrument from any
        // entity-bearing card becomes the antecedent for follow-ups. More than
        // one distinct quote ticker is ambiguous, so the hint is cleared rather
        // than guessed. A long run without an entity card expires stale hints.
        const quotes = turn.cards.filter(
          (card): card is Extract<AssistantCard, { kind: "quote" }> => card.kind === "quote",
        );
        const distinctTickers = new Set(quotes.map((card) => card.ticker));

        if (distinctTickers.size > 1) {
          contextRef.current = {};
          entitylessTurnsRef.current = 0;
        } else {
          let entity: { market: "NSE" | "US"; ticker: string } | null = null;
          const quote = quotes[0];
          if (quote) {
            entity = { market: quote.market, ticker: quote.ticker };
          } else {
            const stocks = turn.cards.find(
              (card): card is Extract<AssistantCard, { kind: "stocks" }> => card.kind === "stocks",
            );
            if (stocks && stocks.hits.length === 1) {
              entity = { market: stocks.hits[0].market, ticker: stocks.hits[0].symbol };
            } else {
              const holdings = turn.cards.find(
                (card): card is Extract<AssistantCard, { kind: "holdings" }> => card.kind === "holdings",
              );
              const rows = holdings?.rows ?? [];
              if (rows.length > 0 && rows.every((row) => row.ticker === rows[0].ticker)) {
                entity = { market: rows[0].market, ticker: rows[0].ticker };
              }
            }
          }

          if (entity) {
            contextRef.current = entity;
            entitylessTurnsRef.current = 0;
          } else {
            entitylessTurnsRef.current += 1;
            if (entitylessTurnsRef.current >= 6) contextRef.current = {};
          }
        }

        setHydration({ provider: turn.provider, model: turn.model, degraded: turn.degraded });
        commit([
          ...messagesRef.current,
          {
            id: nextMessageId("assistant"),
            role: "assistant",
            content: turn.reply,
            createdAt: Date.now(),
            ...(turn.cards.length > 0 ? { cards: turn.cards } : {}),
            ...(turn.degraded ? { degraded: true } : {}),
          },
        ]);
      } catch (caught) {
        if (sequence !== sequenceRef.current) return;
        if (caught instanceof DOMException && caught.name === "AbortError") return;

        const message =
          caught instanceof AssistantRequestError
            ? caught.message
            : "The assistant could not answer that. Nothing was changed.";
        setError(message);
        commit([
          ...messagesRef.current,
          {
            id: nextMessageId("error"),
            role: "assistant",
            content: message,
            createdAt: Date.now(),
            error: message,
          },
        ]);
      } finally {
        if (sequence === sequenceRef.current) {
          busyRef.current = false;
          setStatus("idle");
          abortRef.current = null;
        }
      }
    },
    [commit, userId],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!text || busyRef.current || !userId) return;

      const next = capMessages([
        ...messagesRef.current,
        { id: nextMessageId("user"), role: "user", content: text, createdAt: Date.now() },
      ]);
      commit(next);
      void postTurn(next);
    },
    [commit, postTurn, userId],
  );

  /**
   * Re-sends the last question after a failure.
   *
   * The failed assistant turn is dropped from the history first, so a retry does
   * not stack a second copy of the same reply — and the user's message is never
   * duplicated, which would read as two questions to the model.
   */
  const retry = useCallback(() => {
    if (busyRef.current) return;
    const trimmed = [...messagesRef.current];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "assistant" && trimmed[trimmed.length - 1].error) {
      trimmed.pop();
    }
    if (!trimmed.some((message) => message.role === "user")) return;
    setMessages(trimmed);
    messagesRef.current = trimmed;
    void postTurn(trimmed);
  }, [postTurn]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    sequenceRef.current += 1;

    conversationIdRef.current = newConversationId();
    contextRef.current = {};
    entitylessTurnsRef.current = 0;
    messagesRef.current = [];
    setMessages([]);
    setError(null);
    setStatus("idle");
    setHydration({ provider: null, model: null, degraded: false });
    clearStoredMessages(userId);
  }, [userId]);

  return {
    messages,
    status,
    error,
    hydration,
    canSend: Boolean(userId) && status !== "sending",
    send,
    retry,
    clear,
  };
}
