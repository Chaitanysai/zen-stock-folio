import { BrokerError } from "./errors.ts";

/**
 * Outbound HTTP for broker adapters.
 *
 * - bounded timeout
 * - at most two retries for 429/5xx/network failures
 * - exponential backoff with jitter, honouring a short Retry-After
 * - returns 4xx responses to the adapter (401 vs 403 mean different things)
 * - never includes an upstream body in an error
 */

export interface ProviderJsonResponse {
  status: number;
  body: unknown;
}

export interface ProviderRequestOptions {
  timeoutMs?: number;
  retries?: number;
}

let sleepFn = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Testing seam: the retry tests use a no-op sleep. */
export const setProviderSleep = (fn: (ms: number) => Promise<void>): void => {
  sleepFn = fn;
};
export const resetProviderSleep = (): void => {
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
};

const retryDelay = (attempt: number, response?: Response): number => {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 2000);
  }
  return Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 100), 2000);
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" || error.name === "AbortError");

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const providerJson = async (
  url: string,
  init: RequestInit,
  options: ProviderRequestOptions = {},
): Promise<ProviderJsonResponse> => {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 10_000;

  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (attempt < retries) {
        await sleepFn(retryDelay(attempt));
        continue;
      }
      throw new BrokerError(isTimeout(error) ? "timeout" : "provider_unavailable");
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < retries) {
      await sleepFn(retryDelay(attempt, response));
      continue;
    }
    if (response.status === 429) throw new BrokerError("rate_limited");
    if (response.status >= 500) throw new BrokerError("provider_unavailable");

    return { status: response.status, body: await parseJson(response) };
  }
};

/** Maps provider auth failures to the shared error vocabulary. */
export const authFailure = (status: number): BrokerError =>
  status === 403
    ? new BrokerError("permission_missing")
    : new BrokerError("authentication_expired");
