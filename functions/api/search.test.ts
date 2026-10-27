// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./search";
import {
  API_ORIGIN,
  makeEnv,
  restoreIdentity,
  stubIdentity,
  stubUpstreamRoutes,
} from "./_lib/testHelpers";

const URL = `${API_ORIGIN}/api/search`;

const searchBody = {
  quotes: [
    {
      symbol: "RELIANCE.NS",
      longname: "Reliance Industries Limited",
      shortname: "Reliance",
      exchange: "NSI",
      quoteType: "EQUITY",
      sector: "Energy",
    },
    {
      // The unscoped response includes foreign listings — must be filtered out.
      symbol: "RELIANCE",
      longname: "Reliance Steel & Aluminum",
      exchange: "NYQ",
      quoteType: "EQUITY",
    },
  ],
};

const get = (query: string, token = "good-token"): Request => {
  const target = query ? `${URL}?${query}` : URL;
  return new Request(target, { headers: { Authorization: `Bearer ${token}` } });
};

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

describe("GET /api/search", () => {
  it("requires authentication (401 without a bearer token)", async () => {
    stubUpstreamRoutes([]);
    const res = await onRequestGet({ request: new Request(`${URL}?q=RELI`), env: makeEnv(), params: {} });
    expect(res.status).toBe(401);
  });

  it("refuses unverified identities (403)", async () => {
    stubIdentity("user-1", false);
    stubUpstreamRoutes([]);
    const res = await onRequestGet({ request: get("q=RELI"), env: makeEnv(), params: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Email verification required");
  });

  it("requires a `q` parameter (400)", async () => {
    stubUpstreamRoutes([]);
    const env = makeEnv();
    for (const query of ["", "q=%20"]) {
      const res = await onRequestGet({ request: get(query), env, params: {} });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("missing_query");
    }
  });

  it("returns SearchHits filtered to NSE with provenance", async () => {
    const fetchMock = stubUpstreamRoutes([{ match: "v1/finance/search", body: searchBody }]);
    const res = await onRequestGet({ request: get("q=RELI"), env: makeEnv(), params: {} });
    const body = (await res.json()) as {
      query: string;
      hits: Array<{ symbol: string; name: string; exchange: string; instrumentType: string | null; sector: string | null; isin: string | null; provider: string }>;
      provider: string;
      fetchedAt: string;
      notes: string[];
    };

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // server-side; browser never reaches Yahoo
    expect(body.query).toBe("RELI");
    expect(body.hits).toHaveLength(1); // the NYQ row is filtered
    expect(body.hits[0].symbol).toBe("RELIANCE");
    expect(body.hits[0].name).toBe("Reliance Industries Limited");
    expect(body.hits[0].exchange).toBe("NSE");
    expect(body.hits[0].instrumentType).toBe("EQUITY");
    expect(body.hits[0].provider).toBe("yahoo");
    expect(body.provider).toBe("yahoo");
    expect(typeof body.fetchedAt).toBe("string");
  });

  it("answers 200 with empty hits and a note when the query matches nothing", async () => {
    stubUpstreamRoutes([{ match: "v1/finance/search", body: { quotes: [] } }]);
    const res = await onRequestGet({ request: get("q=NOPE"), env: makeEnv(), params: {} });
    const body = (await res.json()) as { hits: unknown[]; notes: string[] };
    expect(res.status).toBe(200);
    expect(body.hits).toEqual([]);
    expect(body.notes.some((note) => note.includes("no NSE listing"))).toBe(true);
  });

  it("fails closed with 502 when the only search source is down", async () => {
    stubUpstreamRoutes([{ match: "v1/finance/search", status: 500, body: {} }]);
    const res = await onRequestGet({ request: get("q=RELI"), env: makeEnv(), params: {} });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; hits?: unknown };
    expect(body.code).toBe("provider_unavailable");
    expect(body.hits).toBeUndefined(); // never an empty success
  });

  it("never leaks the upstream URL with query or any secret", async () => {
    stubUpstreamRoutes([{ match: "v1/finance/search", body: searchBody }]);
    const res = await onRequestGet({
      request: get("q=RELI"),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const text = JSON.stringify(await res.json()) + Array.from(res.headers.entries()).map(([k, v]) => `${k}=${v}`).join(",");
    expect(text).not.toContain("upstox-secret-token");
    expect(text).not.toContain("query1.finance.yahoo.com");
    expect(text).not.toContain("test-api-key");
  });

  it("rate-limits per user at 30/min", async () => {
    stubUpstreamRoutes([{ match: "v1/finance/search", body: searchBody }]);
    const env = makeEnv();
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await onRequestGet({ request: get(`q=RELI&bust=${i}`), env, params: {} });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
