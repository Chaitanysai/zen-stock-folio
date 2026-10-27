import { vi } from "vitest";
import { clearIdentityCache, resetVerifyFetch, setVerifyFetch } from "./auth";
import { clearRateLimits } from "./ratelimit";
import type { Env } from "./types";

/** Shared deterministic test plumbing for the Pages Function suites. */

export const makeEnv = (over: Record<string, unknown> = {}): Env =>
  ({
    FIREBASE_API_KEY: "test-api-key",
    ALLOWED_ORIGINS: "",
    ...over,
  }) as Env;

/** Points the auth boundary's fetch at a deterministic Identity Toolkit stub. */
export const stubIdentity = (uid = "user-1", emailVerified = true): void => {
  setVerifyFetch(
    (async () =>
      new Response(JSON.stringify({ users: [{ localId: uid, emailVerified }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch,
  );
  clearIdentityCache();
  clearRateLimits();
};

export const restoreIdentity = (): void => {
  resetVerifyFetch();
};

export const authedRequest = (
  url: string,
  body: unknown,
  token = "good-token",
  method = "POST",
): Request =>
  new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

export const upstreamJson = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const API_ORIGIN = "https://zenfolio.pages.dev";

/** Routes stubbed upstreams by URL substring (same pattern as prices.test.ts). */
export const stubUpstreamRoutes = (
  routes: Array<{ match: string; status?: number; body?: unknown }>,
) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const route of routes) {
      if (url.includes(route.match)) {
        return upstreamJson(route.body ?? {}, route.status ?? 200);
      }
    }
    return upstreamJson({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

export const kvBinding = (entries: Record<string, unknown> = {}) => ({
  get: vi.fn(async (_keys: string[], _opts?: unknown) => {
    const map = new Map<string, unknown>();
    for (const [key, value] of Object.entries(entries)) {
      map.set(key, value);
    }
    return map;
  }),
  put: vi.fn(async (_key: string, _value: string, _opts?: unknown) => undefined),
});
