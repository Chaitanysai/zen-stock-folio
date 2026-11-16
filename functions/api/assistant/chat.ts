import { requireVerifiedIdentity } from "../_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "../_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "../_lib/http";
import { chatRequestSchema } from "../../../src/lib/assistant/schemas.ts";
import { createToolContext } from "./_lib/context";
import { registryParityIssues } from "./_lib/tools/registry";
import { runAssistantTurn } from "./_lib/orchestrator";
import { logAssistantEvent } from "./_lib/log";
import type { PagesHandler } from "../_lib/types";

/**
 * POST /api/assistant/chat — one assistant turn.
 *
 * Order of checks is the security model, so it is explicit:
 *
 *   1. kill switch (a deployment can disable the feature without a code change)
 *   2. verified Firebase identity — the ONLY source of `uid`
 *   3. per-user rate limit
 *   4. byte-capped body + strict schema (extra keys are rejected, so a smuggled
 *      `uid`/`role`/tool override never reaches the engine)
 *   5. registry/catalog parity — refuse to serve a half-registered tool set
 *   6. orchestrate, then log a bounded audit record (no prompt text, no prices)
 *
 * This route is READ-ONLY by construction: every registered tool is a read, and
 * there is no code path from here to a Firestore write. Writes are a separate,
 * confirmed route in Phase 2.
 */

const MAX_BODY_BYTES = 24 * 1024;

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const startedAt = Date.now();

  if (env.ASSISTANT_ENABLED === "false") {
    return errorResponse(env, request, 503, "The assistant is disabled on this deployment.", {}, "assistant_disabled");
  }

  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const uid = auth.identity.uid;

  const rl = checkRateLimit(`${uid}:assistant`, RATE_LIMITS.assistant.limit, RATE_LIMITS.assistant.windowMs);
  if (!rl.allowed) {
    logAssistantEvent({
      event: "chat",
      uid,
      conversationId: "unknown",
      status: "rate_limited",
      httpStatus: 429,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(
      env,
      request,
      429,
      "Too many assistant requests. Try again in a moment.",
      retryAfterHeader(rl.resetInMs),
      "RATE_LIMITED",
    );
  }

  const body = await readJsonBody(env, request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const parsed = chatRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first && first.path.length > 0 ? first.path.join(".") : "body";
    return errorResponse(
      env,
      request,
      400,
      `Invalid request: ${path} ${first?.message ?? "is not valid"}.`,
      {},
      "invalid_request",
    );
  }

  // A tool advertised in the UI but missing a handler (or vice versa) is a
  // deployment bug. Failing closed is better than a conversation that silently
  // loses a capability mid-answer.
  if (registryParityIssues().length > 0) {
    logAssistantEvent({
      event: "chat",
      uid,
      conversationId: parsed.data.conversationId,
      status: "error",
      httpStatus: 503,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(env, request, 503, "The assistant is temporarily unavailable.", {}, "assistant_misconfigured");
  }

  const ctx = createToolContext({ env, uid, token: auth.identity.token, now: Date.now() });

  try {
    const turn = await runAssistantTurn({
      ctx,
      conversationId: parsed.data.conversationId,
      messages: parsed.data.messages,
      ...(parsed.data.context ? { context: parsed.data.context } : {}),
    });

    logAssistantEvent({
      event: "chat",
      uid,
      conversationId: parsed.data.conversationId,
      status: "ok",
      httpStatus: 200,
      rounds: turn.usage.rounds,
      toolCalls: turn.usage.toolCalls,
      durationMs: turn.usage.durationMs,
      provider: turn.provider,
      model: turn.model,
      degraded: turn.degraded,
    });

    return jsonResponse(env, request, turn);
  } catch {
    // No stack, no upstream body, no internal detail reaches the client.
    logAssistantEvent({
      event: "chat",
      uid,
      conversationId: parsed.data.conversationId,
      status: "error",
      httpStatus: 500,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(env, request, 500, "The assistant hit an unexpected error. Nothing was changed.", {}, "assistant_error");
  }
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
