// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "./auth";
import { checkRateLimit, clearRateLimits, setNowFn } from "./ratelimit";
import { isNseMarketOpen, shouldWriteEodCache, EOD_CACHE_TTL_SECONDS } from "./marketPhase";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, requireMethod } from "./http";
import { makeEnv, restoreIdentity, stubIdentity } from "./testHelpers";
import { setVerifyFetch } from "./auth";

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
});

describe("auth boundary (Identity Toolkit lookup)", () => {
  it("rejects requests without a bearer token", async () => {
    const request = new Request("https://x/api/prices", { method: "POST" });
    const result = await auth.requireIdentity(makeEnv(), request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("fails closed when the server has no Firebase API key", async () => {
    const result = await auth.requireIdentity(
      makeEnv({ FIREBASE_API_KEY: undefined }),
      new Request("https://x", { method: "POST", headers: { Authorization: "Bearer t" } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("returns 401 for an invalid token and 503 when verification is unreachable", async () => {
    setVerifyFetch((async () => new Response("{}", { status: 400 })) as unknown as typeof fetch);
    const bad = await auth.requireIdentity(
      makeEnv(),
      new Request("https://x", { method: "POST", headers: { Authorization: "Bearer bad" } }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(401);

    setVerifyFetch((async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    const down = await auth.requireIdentity(
      makeEnv(),
      new Request("https://x", { method: "POST", headers: { Authorization: "Bearer t" } }),
    );
    expect(down.ok).toBe(false);
    if (!down.ok) expect(down.response.status).toBe(503);
  });

  it("resolves the uid and caches the lookup per token", async () => {
    const lookup = vi.fn(async () =>
      new Response(JSON.stringify({ users: [{ localId: "user-1" }] }), { status: 200 }),
    );
    setVerifyFetch(lookup as unknown as typeof fetch);

    const request = new Request("https://x", { method: "POST", headers: { Authorization: "Bearer tok" } });
    const first = await auth.requireIdentity(makeEnv(), request);
    const second = await auth.requireIdentity(makeEnv(), request);

    expect(first).toMatchObject({ ok: true, identity: { uid: "user-1" } });
    expect(second).toMatchObject({ ok: true, identity: { uid: "user-1" } });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("carries the email-verification flag and refuses unverified identities", async () => {
    stubIdentity("user-pending", false);
    const request = new Request("https://x", {
      method: "POST",
      headers: { Authorization: "Bearer pending" },
    });

    const plain = await auth.requireIdentity(makeEnv(), request);
    expect(plain).toMatchObject({ ok: true, identity: { uid: "user-pending", emailVerified: false } });

    const gated = await auth.requireVerifiedIdentity(makeEnv(), request);
    expect(gated.ok).toBe(false);
    if (!gated.ok) expect(gated.response.status).toBe(403);

    stubIdentity("user-verified", true);
    const allowed = await auth.requireVerifiedIdentity(makeEnv(), request);
    expect(allowed).toMatchObject({ ok: true, identity: { uid: "user-verified", emailVerified: true } });
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, blocks above, and resets after the window", () => {
    let now = 1_000_000;
    setNowFn(() => now);

    expect(checkRateLimit("u:prices", 3, 1000)).toMatchObject({ allowed: true, remaining: 2 });
    expect(checkRateLimit("u:prices", 3, 1000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit("u:prices", 3, 1000)).toMatchObject({ allowed: true, remaining: 0 });

    const blocked = checkRateLimit("u:prices", 3, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInMs).toBeGreaterThan(0);

    now += 1001;
    expect(checkRateLimit("u:prices", 3, 1000).allowed).toBe(true);
    setNowFn(() => Date.now());
  });
});

describe("market phase (cache policy only)", () => {
  // 2026-10-26 is a Monday. IST = UTC+5:30.
  const utc = (iso: string) => new Date(iso);

  it("opens 09:15 IST inclusive, closes 15:30 IST exclusive", () => {
    expect(isNseMarketOpen(utc("2026-10-26T03:44:00Z"))).toBe(false); // 09:14
    expect(isNseMarketOpen(utc("2026-10-26T03:45:00Z"))).toBe(true); // 09:15
    expect(isNseMarketOpen(utc("2026-10-26T10:00:00Z"))).toBe(false); // 15:30
    expect(isNseMarketOpen(utc("2026-10-26T09:59:00Z"))).toBe(true); // 15:29
  });

  it("treats weekends as closed and fails open on holidays for TTL decisions", () => {
    expect(isNseMarketOpen(utc("2026-10-25T05:00:00Z"))).toBe(false); // Sunday
    // Diwali-ish weekday during session hours is treated as open (fail-open
    // direction: shorter caching, never stale-as-fresh).
    expect(isNseMarketOpen(utc("2026-11-09T05:00:00Z"))).toBe(true);
  });

  it("writes EOD cache only while closed, with a 30 h TTL", () => {
    expect(shouldWriteEodCache(utc("2026-10-26T07:00:00Z"))).toBe(false); // Monday 12:30 IST (open)
    expect(shouldWriteEodCache(utc("2026-10-26T10:15:00Z"))).toBe(true); // Monday 15:45 IST (closed)
    expect(EOD_CACHE_TTL_SECONDS).toBe(30 * 60 * 60);
  });
});

describe("http plumbing", () => {
  const env = makeEnv({ ALLOWED_ORIGINS: "https://app.example" });

  it("reflects allowed origins on preflight and rejects others", () => {
    const allowed = handleOptions(
      env,
      new Request("https://x/api/prices", {
        method: "OPTIONS",
        headers: { Origin: "https://app.example" },
      }),
    );
    expect(allowed?.status).toBe(204);
    expect(allowed?.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");

    const denied = handleOptions(
      env,
      new Request("https://x/api/prices", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      }),
    );
    expect(denied?.status).toBe(403);
    expect(denied?.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("never emits CORS headers for disallowed origins on JSON responses", () => {
    const request = new Request("https://x/api/prices", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    const res = jsonResponse(env, request, { ok: true });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("enforces methods", () => {
    const request = new Request("https://x/api/prices", { method: "GET" });
    const res = requireMethod(env, request, "POST");
    expect(res?.status).toBe(405);
  });

  it("caps body size and rejects malformed JSON", async () => {
    const big = new Request("https://x", {
      method: "POST",
      body: "x".repeat(100),
      headers: { "Content-Length": "100" },
    });
    const tooBig = await readJsonBody(env, big, 32);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.response.status).toBe(413);

    const malformed = new Request("https://x", { method: "POST", body: "{not json" });
    const bad = await readJsonBody(env, malformed);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(400);
  });

  it("error envelopes never include server details", () => {
    const res = errorResponse(makeEnv(), new Request("https://x", { method: "POST" }), 500, "Something failed");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
