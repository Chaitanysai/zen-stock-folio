// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./upstox-callback";
import { makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "../_lib/testHelpers";

const OPS_KEY = "ops-key-0123456789abcdef0123456789abcdef";

const call = (env: Record<string, unknown>, query: string) =>
  onRequestGet({
    request: new Request(`https://zenfolio.pages.dev/api/ops/upstox-callback${query}`),
    env: makeEnv(env),
    params: {},
  });

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

describe("GET /api/ops/upstox-callback (secure redesign)", () => {
  it("answers 404 to callers without the ops key", async () => {
    const noKey = await call({ UPSTOX_OPS_KEY: OPS_KEY }, "?code=abc");
    expect(noKey.status).toBe(404);

    const wrongKey = await call({ UPSTOX_OPS_KEY: OPS_KEY }, `?code=abc&key=wrong`);
    expect(wrongKey.status).toBe(404);

    const unconfigured = await call({}, `?code=abc&key=${OPS_KEY}`);
    expect(unconfigured.status).toBe(404);
  });

  it("exchanges the code for the operator holding the key, showing the token once", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.upstox.com/v2/login/authorization/token");
      const body = String(init?.body);
      expect(body).toContain("code=the-code");
      expect(body).toContain(`redirect_uri=https%3A%2F%2Fzenfolio.pages.dev%2Fapi%2Fops%2Fupstox-callback`);
      return upstreamJson({ access_token: "fresh-upstox-token", expires_in: 90000 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await call(
      { UPSTOX_OPS_KEY: OPS_KEY, UPSTOX_API_KEY: "client", UPSTOX_API_SECRET: "secret" },
      `?code=the-code&key=${OPS_KEY}`,
    );
    const html = await res.text();
    expect(html).toContain("fresh-upstox-token");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("never leaks upstream failure details as a token and never renders for missing code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({}, 400)));
    const failed = await call(
      { UPSTOX_OPS_KEY: OPS_KEY, UPSTOX_API_KEY: "client", UPSTOX_API_SECRET: "secret" },
      `?code=used-code&key=${OPS_KEY}`,
    );
    const failedHtml = await failed.text();
    expect(failedHtml).not.toContain("access_token");

    const noCode = await call(
      { UPSTOX_OPS_KEY: OPS_KEY, UPSTOX_API_KEY: "client", UPSTOX_API_SECRET: "secret" },
      `?key=${OPS_KEY}`,
    );
    expect(await noCode.text()).not.toContain("token generated");
  });
});
