/**
 * Client-side assistant types.
 *
 * `import type` only: this module is erased at runtime, so importing it from
 * `usePortfolioSync` (which needs the storage prefix when clearing caches on
 * sign-out) adds no code to the dashboard bundle.
 */

import type { AssistantCard, AssistantToolTrace, AssistantUsage } from "./schemas.ts";

/**
 * localStorage key prefix for per-user conversation history.
 *
 * Scoped by uid exactly like the portfolio cache (`smart-stock-tracker-data:u:<uid>`)
 * so one account can never read another's conversation on a shared browser.
 * `usePortfolioSync.clearLocalPortfolioCache()` sweeps this prefix on sign-out
 * and account switch.
 */
export const ASSISTANT_STORAGE_PREFIX = "zf-assistant";

/** One rendered turn. `cards` arrive from the server already validated. */
export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Epoch ms, used for ordering and for the storage cap. */
  createdAt: number;
  cards?: AssistantCard[];
  /** True when the deterministic fallback answered this turn. */
  degraded?: boolean;
  /** Set on an assistant message whose request failed; nothing was performed. */
  error?: string | null;
}

/** What the transport layer returns to the UI. */
export interface AssistantTurnResult {
  reply: string;
  cards: AssistantCard[];
  degraded: boolean;
  provider: string | null;
  model: string | null;
  usage: AssistantUsage;
  toolTrace: AssistantToolTrace[];
}

/**
 * Shown in the panel footer. Phase 1 ships read-only tools, so the disclosure is
 * a statement of fact the UI must always make — not a tooltip the user has to
 * hunt for.
 */
export const ASSISTANT_DISCLOSURE =
  "Read-only: this assistant can look things up but cannot add, edit or delete trades, and it can never place a broker order.";
