import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client-side API contract: the bearer token must ride ONLY in the
 * Authorization header, must be absent when there is no signed-in Firebase
 * user, and must never leak into error messages.
 */
const tokenState = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/lib/auth/token", () => ({
  getApiAuthToken: async () => tokenState.token,
}));

import { apiFetch, fetchApi, withAuthHeaders } from "./api";

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  tokenState.token = null;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withAuthHeaders", () => {
  it("adds the bearer token when one is available", async () => {
    tokenState.token = "id-token-abc";
    const headers = await withAuthHeaders({ "Content-Type": "application/json" });

    expect(headers.get("Authorization")).toBe("Bearer id-token-abc");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("sends no Authorization header when the provider issues no token", async () => {
    const headers = await withAuthHeaders();
    expect(headers.get("Authorization")).toBeNull();
  });
});

describe("apiFetch", () => {
  it("sends the token in the header and keeps the path relative", async () => {
    tokenState.token = "id-token-abc";
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/prices", {
      method: "POST",
      body: JSON.stringify({ tickers: ["TCS"] }),
    });

    const [url, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;

    expect(url).toBe("/api/prices");
    expect(url).not.toContain("id-token-abc");
    expect(headers.get("Authorization")).toBe("Bearer id-token-abc");
    expect(String(init.body)).not.toContain("id-token-abc");
  });

  it("does not invent an Authorization header when no token exists", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/api/news", { method: "POST" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBeNull();
  });
});

describe("fetchApi", () => {
  it("returns the parsed JSON body", async () => {
    tokenState.token = "id-token-abc";
    fetchMock.mockResolvedValueOnce(jsonResponse({ prices: { TCS: { price: 100 } } }));

    await expect(fetchApi("/api/prices", { method: "POST" })).resolves.toEqual({
      prices: { TCS: { price: 100 } },
    });
  });

  it("throws the server's error message without echoing the token", async () => {
    tokenState.token = "id-token-secret";
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));

    await expect(fetchApi("/api/prices", { method: "POST" })).rejects.toThrow(
      "Authentication required",
    );

    try {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));
      await fetchApi("/api/prices", { method: "POST" });
    } catch (error) {
      expect(String(error)).not.toContain("id-token-secret");
    }
  });

  it("reports an unreachable endpoint without leaking the token", async () => {
    tokenState.token = "id-token-secret";
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchApi("/api/ai", { method: "POST" })).rejects.toThrow(
      "Network error — could not reach /api/ai",
    );
  });
});
