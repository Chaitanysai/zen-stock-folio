import { afterEach, describe, expect, it, vi } from "vitest";
import { authFailure, providerJson, resetProviderSleep, setProviderSleep } from "./providerHttp.ts";

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const stubFetch = (...responses: Array<Response | Error>): ReturnType<typeof vi.fn> => {
  let call = 0;
  const mock = vi.fn(async () => {
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

afterEach(() => {
  resetProviderSleep();
  vi.unstubAllGlobals();
});

describe("providerJson", () => {
  it("retries a 5xx and returns the eventual payload", async () => {
    const sleeps: number[] = [];
    setProviderSleep(async (ms) => {
      sleeps.push(ms);
    });
    const fetchMock = stubFetch(jsonResponse({}, 500), jsonResponse({ ok: true }));

    const result = await providerJson("https://example.test/a", {});

    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toHaveLength(1);
  });

  it("honours a short Retry-After header", async () => {
    const sleeps: number[] = [];
    setProviderSleep(async (ms) => {
      sleeps.push(ms);
    });
    stubFetch(jsonResponse({}, 429, { "Retry-After": "1" }), jsonResponse({}));

    await providerJson("https://example.test/a", {});
    expect(sleeps[0]).toBe(1000);
  });

  it("maps an exhausted rate limit and server failure", async () => {
    setProviderSleep(async () => {});
    stubFetch(jsonResponse({}, 429));
    await expect(providerJson("https://example.test/a", {})).rejects.toMatchObject({
      code: "rate_limited",
    });

    stubFetch(jsonResponse({}, 503));
    await expect(providerJson("https://example.test/a", {})).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  it("maps repeated network failures and timeouts", async () => {
    setProviderSleep(async () => {});
    stubFetch(new TypeError("fetch failed"));
    await expect(providerJson("https://example.test/a", {})).rejects.toMatchObject({
      code: "provider_unavailable",
    });

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    stubFetch(timeout);
    await expect(providerJson("https://example.test/a", {})).rejects.toMatchObject({ code: "timeout" });
  });

  it("returns 4xx responses for the adapter to interpret", async () => {
    stubFetch(jsonResponse({ error: "unauthorised" }, 401));
    const result = await providerJson("https://example.test/a", {});
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "unauthorised" });
  });

  it("returns null for a non-JSON body instead of throwing", async () => {
    stubFetch(new Response("<html>", { status: 200 }));
    const result = await providerJson("https://example.test/a", {});
    expect(result).toEqual({ status: 200, body: null });
  });

  it("maps 403 to a permission error and everything else to authentication", () => {
    expect(authFailure(403)).toMatchObject({ code: "permission_missing" });
    expect(authFailure(401)).toMatchObject({ code: "authentication_expired" });
  });
});
