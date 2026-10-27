import type { Env } from "./types";

/**
 * HTTP plumbing for the Pages Functions: restrictive CORS, strict method
 * checks, size-capped body parsing, and uniform safe error envelopes.
 * Every response is no-store — none of these endpoints are cacheable by
 * intermediaries.
 */

export const MAX_BODY_BYTES = 64 * 1024;

const corsHeaders = (env: Env, origin: string | null): Record<string, string> => {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // Same-origin requests send no Origin header (or match the host) and need
  // no CORS headers at all — restrictive by default.
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Max-Age": "600",
    Vary: "Origin",
  };
};

export const jsonResponse = (
  env: Env,
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response => {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    ...corsHeaders(env, request.headers.get("Origin")),
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
};

export const errorResponse = (
  env: Env,
  request: Request,
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
  /** Optional app reason carried to the client, e.g. "provider_unavailable".
   * The market-data client (src/lib/market-data/client.ts) reads `body.code`
   * to distinguish "symbol not found" from "provider unavailable". */
  code?: string,
): Response =>
  jsonResponse(
    env,
    request,
    code === undefined ? { error: message } : { error: message, code },
    status,
    extraHeaders,
  );

/** Handles preflight; returns a Response to short-circuit, or null to continue. */
export const handleOptions = (env: Env, request: Request): Response | null => {
  if (request.method !== "OPTIONS") return null;
  const origin = request.headers.get("Origin");
  if (!origin) return new Response(null, { status: 204 });
  const headers = corsHeaders(env, origin);
  if (!headers["Access-Control-Allow-Origin"]) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
};

export const requireMethod = (
  env: Env,
  request: Request,
  method: "POST" | "GET",
): Response | null => {
  if (request.method === method) return null;
  if (request.method === "OPTIONS") return handleOptions(env, request);
  return errorResponse(env, request, 405, "Method not allowed", { Allow: method });
};

export type BodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Reads and parses the JSON body under a hard byte cap. Oversized or
 * malformed bodies are rejected before any schema validation runs.
 */
export const readJsonBody = async <T = unknown>(
  env: Env,
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<BodyResult<T>> => {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > maxBytes) {
    return { ok: false, response: errorResponse(env, request, 413, "Request body too large") };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: errorResponse(env, request, 400, "Invalid request body") };
  }
  if (text.length > maxBytes) {
    return { ok: false, response: errorResponse(env, request, 413, "Request body too large") };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: errorResponse(env, request, 400, "Invalid JSON body") };
  }
};

export const retryAfterHeader = (resetInMs: number): Record<string, string> => ({
  "Retry-After": String(Math.max(1, Math.ceil(resetInMs / 1000))),
});
