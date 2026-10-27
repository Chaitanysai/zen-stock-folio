/**
 * src/lib/api.ts
 *
 * API utilities for the frontend.
 *
 * IMPORTANT (Vercel):
 *   Serverless functions in /api must be called with RELATIVE paths (e.g. /api/ai).
 *   Never use an absolute base URL — it causes CORS failures and mis-routing on Vercel.
 *   Do NOT use import.meta.env.VITE_API_URL for internal /api calls.
 *
 * Authentication: every internal request goes through `apiFetch`, which attaches
 * `Authorization: Bearer <Firebase ID token>` when a Firebase user is signed in.
 * Anonymous calls carry no token and the Functions answer 401, so a missing
 * session fails closed rather than silently reading as an authorised request.
 */

import { getApiAuthToken } from "@/lib/auth/token";

/**
 * Returns the path for an internal API route.
 * Always relative so Vercel/Pages routes the request to the correct function.
 *
 * @example
 *   fetch(getApiUrl("/api/ai"), { method: "POST", ... })
 *   // → fetch("/api/ai", ...)     ✅ correct on Vercel/Cloudflare Pages
 */
export const getApiUrl = (path: string): string => {
  return path;
};

/**
 * Returns a human-readable fallback message when an API call fails.
 * Safe to display directly in the UI.
 */
export const getApiUnavailableMessage = (feature: string): string =>
  `${feature} is temporarily unavailable. Please try again in a moment.`;

/**
 * Copies the caller's headers and adds the bearer token when one is available.
 * Tokens are sent ONLY in the Authorization header — never in the URL, query
 * string, or a request body, where they would land in logs and referrers.
 */
export const withAuthHeaders = async (headers?: HeadersInit): Promise<Headers> => {
  const next = new Headers(headers);
  const token = await getApiAuthToken();
  if (token) next.set("Authorization", `Bearer ${token}`);
  return next;
};

/**
 * fetch() for internal /api/* routes with the auth header applied.
 * Use this instead of a raw fetch() for every internal endpoint.
 */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = await withAuthHeaders(init.headers);
  return fetch(getApiUrl(path), { ...init, headers });
};

// ── Typed fetch wrapper with built-in error logging ───────────────────────────

interface FetchApiOptions extends RequestInit {
  /** Extra label shown in console errors to identify the call site */
  label?: string;
}

/**
 * Thin wrapper around apiFetch() for /api/* calls.
 * - Always uses a relative URL via getApiUrl()
 * - Attaches the provider's bearer token when one exists
 * - Logs the HTTP status + response body on failure for easier debugging
 * - Throws an Error with the server's error message (if JSON) or the status text
 *
 * @example
 *   const data = await fetchApi("/api/ai", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ type: "analysis", portfolioContext: ctx }),
 *     label: "AI analysis",
 *   });
 */
export async function fetchApi<T = unknown>(
  path: string,
  options: FetchApiOptions = {}
): Promise<T> {
  const { label = path, ...init } = options;

  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (networkErr: unknown) {
    console.error(`[fetchApi] Network error for "${label}":`, networkErr);
    throw new Error(`Network error — could not reach ${getApiUrl(path)}`);
  }

  if (!res.ok) {
    // Try to extract the server's error message from JSON
    let serverMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const body = await res.clone().json();
      if (body?.error) serverMessage = body.error;
    } catch {
      // Body wasn't JSON — keep the status string
    }
    console.error(`[fetchApi] "${label}" failed — ${serverMessage}`, {
      status: res.status,
    });
    throw new Error(serverMessage);
  }

  try {
    return (await res.json()) as T;
  } catch (parseErr: unknown) {
    console.error(`[fetchApi] JSON parse error for "${label}":`, parseErr);
    throw new Error("Invalid JSON response from server");
  }
}
