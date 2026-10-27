/**
 * Bounded upstream fetch: every provider call has a hard timeout and returns
 * a typed failure instead of throwing. No retries here — retry/fallback
 * budgets are declared explicitly per endpoint and are always finite.
 */

export type UpstreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; error: string };

export const fetchJson = async <T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<UpstreamResult<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok || data === null) {
      return { ok: false, status: res.status, error: `upstream responded ${res.status}` };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "upstream fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Runs provider calls in parallel with a per-call timeout. Used for
 * per-ticker Yahoo calls so one slow ticker cannot stall the batch.
 */
export const fetchJsonAll = async <T = unknown>(
  calls: Array<{ url: string; init?: RequestInit }>,
  timeoutMs = 8000,
): Promise<Array<UpstreamResult<T>>> =>
  Promise.all(calls.map(({ url, init }) => fetchJson<T>(url, init, timeoutMs)));
