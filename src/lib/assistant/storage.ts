/**
 * Per-user conversation persistence.
 *
 * Same scoping discipline as the portfolio cache (`src/hooks/usePortfolioSync.ts`):
 * the key contains the uid, so an account switch reads a different slot and one
 * user can never see another's conversation on a shared browser. Nothing here is
 * trusted on read — a stored blob is re-validated, capped, and dropped if it is
 * not the shape we wrote. Storage failures (quota, private mode) are non-fatal.
 *
 * What is stored: the visible conversation only. No tokens, no uids, no
 * portfolio snapshot — the server re-reads data on every turn.
 */

import {
  MAX_MESSAGE_CHARS,
  MAX_STORED_MESSAGES,
  assistantCardSchema,
} from "./schemas.ts";
import { ASSISTANT_STORAGE_PREFIX, type AssistantMessage } from "./types.ts";

/** Total characters kept per user, so a long thread cannot fill localStorage. */
const MAX_STORED_CHARS = 24_000;

const GUEST_SCOPE = "guest";

/** The only storage key a given session may touch. */
export const conversationStorageKey = (userId?: string | null): string =>
  `${ASSISTANT_STORAGE_PREFIX}:u:${userId ?? GUEST_SCOPE}`;

const storage = (): Storage | null => {
  try {
    // Present in the browser; absent in tests that run without jsdom storage.
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rebuild one stored message, dropping anything that fails validation. */
function parseMessage(value: unknown): AssistantMessage | null {
  if (!isRecord(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  if (typeof value.content !== "string") return null;

  const content = value.content.slice(0, MAX_MESSAGE_CHARS);
  if (!content.trim()) return null;

  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();

  const id =
    typeof value.id === "string" && value.id.length > 0 && value.id.length <= 64
      ? value.id
      : `${value.role}-${createdAt}`;

  const messages: AssistantMessage = { id, role: value.role, content, createdAt };

  if (Array.isArray(value.cards)) {
    const cards = value.cards
      .map((card) => assistantCardSchema.safeParse(card))
      .flatMap((result) => (result.success ? [result.data] : []));
    if (cards.length > 0) messages.cards = cards;
  }

  return messages;
}

/**
 * Reads the current user's conversation. A malformed blob yields `[]` rather
 * than throwing: a corrupted cache must not break the panel.
 */
export function loadStoredMessages(userId?: string | null): AssistantMessage[] {
  const store = storage();
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(conversationStorageKey(userId));
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseMessage)
      .filter((message): message is AssistantMessage => message !== null)
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

/** Keeps the newest messages that fit both the count and size budgets. */
export function capMessages(messages: AssistantMessage[]): AssistantMessage[] {
  const kept: AssistantMessage[] = [];
  let chars = 0;

  for (let index = messages.length - 1; index >= 0 && kept.length < MAX_STORED_MESSAGES; index -= 1) {
    const message = messages[index];
    const cost = message.content.length;
    if (kept.length > 0 && chars + cost > MAX_STORED_CHARS) break;
    kept.push(message);
    chars += cost;
  }

  return kept.reverse();
}

/** Best-effort write; a quota failure loses history, never the current turn. */
export function saveStoredMessages(userId: string | null | undefined, messages: AssistantMessage[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(conversationStorageKey(userId), JSON.stringify(capMessages(messages)));
  } catch {
    // Quota exceeded or storage disabled — the in-memory thread still works.
  }
}

export function clearStoredMessages(userId?: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(conversationStorageKey(userId));
  } catch {
    // Nothing to do; the key will be overwritten on the next save.
  }
}
