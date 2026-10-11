/**
 * src/lib/api.ts
 *
 * API utilities for the frontend.
 *
 * IMPORTANT (Vercel):
 *   Serverless functions in /api must be called with RELATIVE paths (e.g. /api/ai).
 *   Never use an absolute base URL — it causes CORS failures and mis-routing on Vercel.
 *   Do NOT use import.meta.env.VITE_API_URL for internal /api calls.
 */

/**
 * Returns the path for an internal API route.
 * Always relative so Vercel routes the request to the correct serverless function.
 *
 * @example
 *   fetch(getApiUrl("/api/ai"), { method: "POST", ... })
 *   // → fetch("/api/ai", ...)     ✅ correct on Vercel
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


// ── Optional: typed fetch wrapper with built-in error logging ─────────────────

interface FetchApiOptions extends RequestInit {
  /** Extra label shown in console errors to identify the call site */
  label?: string;
}

/**
 * Thin wrapper around fetch() for /api/* calls.
 * - Always uses a relative URL via getApiUrl()
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
  const url = getApiUrl(path);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (networkErr: any) {
    console.error(`[fetchApi] Network error for "${label}":`, networkErr);
    throw new Error(`Network error — could not reach ${url}`);
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
      url,
      status: res.status,
    });
    throw new Error(serverMessage);
  }

  try {
    return (await res.json()) as T;
  } catch (parseErr: any) {
    console.error(`[fetchApi] JSON parse error for "${label}":`, parseErr);
    throw new Error("Invalid JSON response from server");
  }
}
