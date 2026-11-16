/**
 * Structured assistant logging.
 *
 * Phase 1 audit policy (decision D4): structured logs only. The Firestore audit
 * collection is deferred to Phase 5 together with the security-rule change it
 * requires.
 *
 * What a record may contain: correlation ids, tool names, statuses, durations,
 * counts and provider/model ids. What it must NOT contain: message text,
 * prompts, prices, quantities, tickers, tokens or any provider payload. Those
 * are the fields that would turn an operations log into a financial record.
 */

export type AssistantLogEvent =
  | {
      event: "chat";
      uid: string;
      conversationId: string;
      status: "ok" | "error" | "rate_limited" | "bad_request" | "unauthenticated";
      httpStatus: number;
      rounds?: number;
      toolCalls?: number;
      durationMs: number;
      provider?: string | null;
      model?: string | null;
      degraded?: boolean;
    }
  | {
      event: "tool";
      uid: string;
      conversationId: string;
      tool: string;
      status: "ok" | "error" | "skipped" | "unknown_tool" | "invalid_args";
      durationMs: number;
    };

/** Never throws: a logging failure must not fail the user's request. */
export function logAssistantEvent(entry: AssistantLogEvent): void {
  try {
    console.log(JSON.stringify({ scope: "assistant", ...entry }));
  } catch {
    // Circular or unserialisable event: drop it rather than 500 the turn.
  }
}
