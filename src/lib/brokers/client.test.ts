import { afterEach, describe, expect, it, vi } from "vitest";
import { BrokerApiError, brokerApi, clearBrokerCallback, readBrokerCallback } from "./client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("broker callback parameters", () => {
  it("reads a successful callback and clears it from the URL", () => {
    window.history.replaceState(
      null,
      "",
      "/?tab=holdings&broker=connected&provider=zerodha&connection=conn-1#portfolio",
    );

    expect(readBrokerCallback()).toEqual({
      status: "connected",
      provider: "zerodha",
      code: null,
      connectionId: "conn-1",
    });

    clearBrokerCallback();

    expect(window.location.search).toBe("?tab=holdings");
    expect(window.location.hash).toBe("#portfolio");
    expect(readBrokerCallback()).toBeNull();
  });

  it("reads an error callback", () => {
    window.history.replaceState(null, "", "/?broker=error&provider=groww&code=state_expired");
    expect(readBrokerCallback()).toEqual({
      status: "error",
      provider: "groww",
      code: "state_expired",
      connectionId: null,
    });
  });

  it("ignores unrelated query parameters", () => {
    window.history.replaceState(null, "", "/?broker=sync&provider=zerodha");
    expect(readBrokerCallback()).toBeNull();
  });
});

describe("brokerApi error mapping", () => {
  it("surfaces the server's safe code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "Credentials are missing", code: "authentication_expired" }, 401),
      ),
    );

    const error = await brokerApi.connections().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BrokerApiError);
    expect(error).toMatchObject({
      code: "authentication_expired",
      status: 401,
      message: "Credentials are missing",
    });
  });

  it("maps a transport failure to network_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const error = await brokerApi.providers().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "network_error", status: 0 });
  });

  it("maps a non-JSON success body to internal_error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));

    const error = await brokerApi.providers().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "internal_error", status: 200 });
  });

  it("sends the create payload as JSON to the same-origin endpoint", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
        seen.url = String(url);
        seen.init = init;
        return jsonResponse({ connection: { id: "c1" }, nextStep: "ready" }, 201);
      }),
    );

    await brokerApi.create({
      provider: "groww",
      method: "api_keys",
      apiKey: "key-12345678",
      apiSecret: "secret-12345678",
    });

    expect(seen.url).toContain("/api/brokers/connections");
    expect(seen.init?.method).toBe("POST");
    expect(JSON.parse(String(seen.init?.body))).toMatchObject({ provider: "groww" });
    expect(seen.url).not.toContain("secret-12345678");
  });
});
