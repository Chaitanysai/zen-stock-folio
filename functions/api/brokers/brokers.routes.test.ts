import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authedRequest, restoreIdentity, stubIdentity } from "../_lib/testHelpers.ts";
import { onRequestGet as listConnections, onRequestPost as createConnection } from "./connections/index.ts";
import { onRequestGet as listProviders } from "./providers.ts";
import { onRequestPost as syncConnection } from "./connections/[id]/sync.ts";
import {
  onRequestDelete as disconnectConnection,
  onRequestGet as getConnection,
  onRequestPatch as updateConnection,
} from "./connections/[id].ts";
import { onRequestGet as brokerCallback } from "./callback/[provider].ts";
import { decryptCredentials, encryptCredentials } from "./_lib/crypto.ts";
import {
  getConnectionRecord,
  getCredentialEnvelope,
  putAuthorizationState,
  putConnectionRecord,
  putCredentialEnvelope,
} from "./_lib/store.ts";
import { brokerEnv, connectionRecord, memoryKv } from "./_lib/testKit.ts";
import { hashAuthorizationState } from "./_lib/state.ts";
import type { Env } from "../_lib/types.ts";
const ORIGIN = "https://zenfolio.pages.dev";
const CONNECTION_ID = "11111111-1111-4111-8111-111111111111";

const brokerEnvWithKv = (over: Record<string, unknown> = {}): { env: Env; values: Map<string, string> } => {
  const { kv, values } = memoryKv();
  return { env: brokerEnv({ BROKER_STORE: kv, ...over }), values };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubGroww = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/token/api/access")) {
        return json({ payload: { token: "groww-access-token" } });
      }
      return json({ payload: [] });
    }),
  );

const stubKiteToken = (accessToken = "kite-access-token") =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ data: { access_token: accessToken, expires_at: "2026-10-29T00:30:00.000Z" } })),
  );

const stubUpstoxToken = (accessToken = "upstox-access-token") =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ access_token: accessToken, expiry_time: "2026-10-28T22:00:00+05:30" })),
  );

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

describe("broker routes — admission", () => {
  it("requires a verified identity", async () => {
    const { env } = brokerEnvWithKv();
    const res = await listConnections({
      request: new Request(`${ORIGIN}/api/brokers/connections`),
      env,
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("fails closed when server storage or keys are missing", async () => {
    const { env } = brokerEnvWithKv({ BROKER_CREDENTIALS_KEYS: undefined });
    const res = await listConnections({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, null, "good-token", "GET"),
      env,
      params: {},
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "setup_required" });
  });

  it("reports setup blockers on the providers listing instead of failing", async () => {
    const env = brokerEnv({ BROKER_STORE: undefined, BROKER_CREDENTIALS_KEYS: undefined, BROKER_PUBLIC_ORIGIN: undefined });
    const res = await listProviders({
      request: authedRequest(`${ORIGIN}/api/brokers/providers`, null, "good-token", "GET"),
      env,
      params: {},
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; enabled: boolean; setupIssues: string[]; callbackUrl: string | null }>;
      storeReady: boolean;
      setupIssues: string[];
    };
    expect(body.storeReady).toBe(false);
    expect(body.setupIssues).toEqual(["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"]);
    expect(body.providers.map((provider) => provider.id)).toEqual(["zerodha", "groww", "upstox"]);
    expect(body.providers.every((provider) => !provider.enabled)).toBe(true);
    expect(body.providers[0].callbackUrl).toBe(`${ORIGIN}/api/brokers/callback/zerodha`);
    // Groww is keys-only: advertising a callback it cannot complete misleads
    // the user into registering an unusable redirect URL.
    expect(body.providers[1].callbackUrl).toBeNull();
    expect(body.providers[2].callbackUrl).toBe(`${ORIGIN}/api/brokers/callback/upstox`);
  });
});

describe("broker routes — connection creation", () => {
  it("validates a keys-only provider live and stores no plaintext", async () => {
    stubGroww();
    const { env, values } = brokerEnvWithKv();

    const res = await createConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, {
        provider: "groww",
        method: "api_keys",
        apiKey: "rk_live_12345678",
        apiSecret: "groww-secret-12345678",
      }),
      env,
      params: {},
    });

    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text) as {
      connection: { id: string; status: string; permissions: string[] };
      nextStep: string;
    };
    expect(body.nextStep).toBe("ready");
    expect(body.connection.status).toBe("connected");
    expect(body.connection.permissions).toEqual([
      "read:holdings",
      "read:positions",
      "read:orders",
      "read:trades",
    ]);
    expect(text).not.toContain("rk_live_12345678");
    expect(text).not.toContain("groww-secret-12345678");
    expect(text).not.toContain("groww-access-token");

    const connectionKey = `conn:user-1:${body.connection.id}`;
    const credentialKey = `cred:user-1:${body.connection.id}`;
    expect(values.get(connectionKey)).toBeDefined();
    expect(values.get(connectionKey)).not.toContain("groww-secret-12345678");
    expect(values.get(credentialKey)).toBeDefined();
    expect(values.get(credentialKey)).not.toContain("rk_live_12345678");

    const envelope = JSON.parse(values.get(credentialKey)!) as Parameters<typeof decryptCredentials>[2];
    const stored = await decryptCredentials(
      env,
      { uid: "user-1", connectionId: body.connection.id, provider: "groww" },
      envelope,
    );
    expect(stored.accessToken).toBe("groww-access-token");
  });

  it("rejects a method the provider does not document", async () => {
    const { env } = brokerEnvWithKv();
    const res = await createConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, {
        provider: "zerodha",
        method: "api_keys",
        apiKey: "api-key-12345678",
        apiSecret: "api-secret-12345678",
      }),
      env,
      params: {},
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "unsupported_method" });
  });

  it("stores only a hashed authorization state for an OAuth provider", async () => {
    const { env, values } = brokerEnvWithKv();
    const res = await createConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, {
        provider: "zerodha",
        method: "oauth",
        apiKey: "api-key-12345678",
        apiSecret: "api-secret-12345678",
      }),
      env,
      params: {},
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      connection: { id: string; status: string };
      nextStep: string;
      authorizationUrl: string;
    };
    expect(body.nextStep).toBe("authorize");
    expect(body.connection.status).toBe("pending_authorization");

    const url = new URL(body.authorizationUrl);
    expect(url.origin).toBe("https://kite.zerodha.com");
    const state = (url.searchParams.get("redirect_params") ?? "").replace(/^state=/, "");
    expect(state.length).toBeGreaterThan(20);

    const hash = await hashAuthorizationState(state);
    expect(values.get(`state:zerodha:${hash}`)).toBeDefined();
    // Raw state is never written to KV.
    expect([...values.keys()].some((key) => key.includes(state))).toBe(false);
  });
});

describe("broker callback", () => {
  const startOAuth = async (env: Env) => {
    const res = await createConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, {
        provider: "zerodha",
        method: "oauth",
        apiKey: "api-key-12345678",
        apiSecret: "api-secret-12345678",
      }),
      env,
      params: {},
    });
    const body = (await res.json()) as {
      connection: { id: string };
      authorizationUrl: string;
    };
    const url = new URL(body.authorizationUrl);
    const state = (url.searchParams.get("redirect_params") ?? "").replace(/^state=/, "");
    return { connectionId: body.connection.id, state };
  };

  const callbackRequest = (provider: string, query: Record<string, string>, ip = "203.0.113.9") =>
    new Request(`${ORIGIN}/api/brokers/callback/${provider}?${new URLSearchParams(query)}`, {
      headers: { "CF-Connecting-IP": ip },
    });

  it("exchanges the request token once and redirects without secrets", async () => {
    const { env } = brokerEnvWithKv();
    const { connectionId, state } = await startOAuth(env);
    stubKiteToken("kite-access-token");

    const res = await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-1" }),
      env,
      params: { provider: "zerodha" },
    });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.searchParams.get("broker")).toBe("connected");
    expect(location.searchParams.get("provider")).toBe("zerodha");
    expect(location.searchParams.get("connection")).toBe(connectionId);
    expect(res.headers.get("Location")).not.toContain(state);
    expect(res.headers.get("Location")).not.toContain("kite-access-token");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const record = await getConnectionRecord(env, "user-1", connectionId);
    expect(record?.status).toBe("connected");
    expect(record?.tokenExpiresAt).toBe("2026-10-29T00:30:00.000Z");
    expect(JSON.stringify(record)).not.toContain("kite-access-token");
  });

  it("completes the Upstox OAuth v2 flow through the code parameter", async () => {
    const { env, values } = brokerEnvWithKv();
    const res = await createConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections`, {
        provider: "upstox",
        method: "oauth",
        apiKey: "upstox-key-123456",
        apiSecret: "upstox-secret-123456",
      }),
      env,
      params: {},
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      connection: { id: string; status: string };
      authorizationUrl: string;
    };
    expect(body.connection.status).toBe("pending_authorization");

    const dialog = new URL(body.authorizationUrl);
    expect(`${dialog.origin}${dialog.pathname}`).toBe("https://api.upstox.com/v2/login/authorization/dialog");
    expect(dialog.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/brokers/callback/upstox`);
    expect(dialog.searchParams.get("response_type")).toBe("code");
    const state = dialog.searchParams.get("state") ?? "";
    expect(state.length).toBeGreaterThan(20);

    stubUpstoxToken();
    const callback = await brokerCallback({
      request: callbackRequest("upstox", { code: "auth-code-1", state }),
      env,
      params: { provider: "upstox" },
    });

    expect(callback.status).toBe(302);
    const location = new URL(callback.headers.get("Location")!);
    expect(location.searchParams.get("broker")).toBe("connected");
    expect(location.searchParams.get("provider")).toBe("upstox");
    expect(location.searchParams.get("connection")).toBe(body.connection.id);
    expect(callback.headers.get("Location")).not.toContain("auth-code-1");
    expect(callback.headers.get("Location")).not.toContain("upstox-access-token");

    const record = await getConnectionRecord(env, "user-1", body.connection.id);
    expect(record?.status).toBe("connected");
    // expiry_time 2026-10-28T22:00:00+05:30 == 16:30 UTC.
    expect(record?.tokenExpiresAt).toBe("2026-10-28T16:30:00.000Z");

    const envelope = await getCredentialEnvelope(env, "user-1", body.connection.id);
    expect(envelope).toBeTruthy();
    // The raw state never reaches KV (only its hash, which is consumed).
    expect([...values.keys()].some((key) => key.includes(state))).toBe(false);
  });

  it("refuses a replayed state", async () => {
    const { env } = brokerEnvWithKv();
    const { state } = await startOAuth(env);
    stubKiteToken();

    await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-1" }),
      env,
      params: { provider: "zerodha" },
    });
    const replay = await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-1" }),
      env,
      params: { provider: "zerodha" },
    });

    expect(replay.status).toBe(302);
    expect(new URL(replay.headers.get("Location")!).searchParams.get("code")).toBe("state_reused");
  });

  it("rejects an unknown provider and an invalid state", async () => {
    const { env } = brokerEnvWithKv();
    const unknown = await brokerCallback({
      request: callbackRequest("dhan", { state: "x".repeat(30) }),
      env,
      params: { provider: "dhan" },
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).not.toContain("state");

    const invalid = await brokerCallback({
      request: callbackRequest("zerodha", { state: "short" }),
      env,
      params: { provider: "zerodha" },
    });
    expect(new URL(invalid.headers.get("Location")!).searchParams.get("code")).toBe("state_invalid");
  });

  it("reports a provider refusal without exchanging anything", async () => {
    const { env } = brokerEnvWithKv();
    const { state } = await startOAuth(env);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await brokerCallback({
      request: callbackRequest("zerodha", { state, error: "access_denied" }),
      env,
      params: { provider: "zerodha" },
    });

    const location = new URL(res.headers.get("Location")!);
    expect(location.searchParams.get("broker")).toBe("error");
    expect(location.searchParams.get("code")).toBe("provider_error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not consume a state when the wrong provider is called", async () => {
    const { env } = brokerEnvWithKv();
    const { connectionId, state } = await startOAuth(env);

    const wrong = await brokerCallback({
      request: callbackRequest("groww", { state }),
      env,
      params: { provider: "groww" },
    });
    expect(new URL(wrong.headers.get("Location")!).searchParams.get("code")).toBe("state_invalid");

    stubKiteToken("kite-access-token");
    const correct = await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-1" }),
      env,
      params: { provider: "zerodha" },
    });
    const location = new URL(correct.headers.get("Location")!);
    expect(location.searchParams.get("broker")).toBe("connected");
    expect(location.searchParams.get("connection")).toBe(connectionId);
  });

  it("records a failed completion on the pending connection", async () => {
    const { env } = brokerEnvWithKv();
    const { connectionId, state } = await startOAuth(env);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid" }, 400)));

    const res = await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-1" }),
      env,
      params: { provider: "zerodha" },
    });

    const code = new URL(res.headers.get("Location")!).searchParams.get("code");
    expect(code).toBe("invalid_credentials");
    const record = await getConnectionRecord(env, "user-1", connectionId);
    expect(record?.status).toBe("error");
    expect(record?.lastErrorCode).toBe("invalid_credentials");
  });

  it("never overwrites a connection that already completed", async () => {
    const { env } = brokerEnvWithKv();
    const record = connectionRecord({ id: CONNECTION_ID, status: "connected" });
    await putConnectionRecord(env, record);
    await putCredentialEnvelope(
      env,
      record.uid,
      record.id,
      await encryptCredentials(
        env,
        { uid: record.uid, connectionId: record.id, provider: record.provider },
        { apiKey: "api-key-1", apiSecret: "api-secret-1", accessToken: "original-token" },
      ),
    );

    // Simulate a late callback whose state survived a race: the connection is
    // already connected, so the completion must be refused before any exchange
    // and must leave the stored token untouched.
    const state = "late-callback-state-1234567890";
    await putAuthorizationState(env, "zerodha", await hashAuthorizationState(state), {
      uid: record.uid,
      provider: "zerodha",
      connectionId: record.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await brokerCallback({
      request: callbackRequest("zerodha", { state, request_token: "request-token-late" }),
      env,
      params: { provider: "zerodha" },
    });

    expect(new URL(res.headers.get("Location")!).searchParams.get("code")).toBe("conflict");
    expect(fetchMock).not.toHaveBeenCalled();
    const after = await getConnectionRecord(env, "user-1", CONNECTION_ID);
    expect(after?.status).toBe("connected");
    expect(after?.lastErrorCode).toBeNull();
    const envelope = await getCredentialEnvelope(env, "user-1", CONNECTION_ID);
    const stored = await decryptCredentials(
      env,
      { uid: record.uid, connectionId: record.id, provider: "zerodha" },
      envelope!,
    );
    expect(stored.accessToken).toBe("original-token");
  });
});

describe("broker routes — sync", () => {
  const seedConnection = async (env: Env, over: Record<string, unknown> = {}) => {
    const record = connectionRecord({
      id: CONNECTION_ID,
      tokenExpiresAt: "2099-01-01T00:30:00.000Z",
      ...over,
    });
    await putConnectionRecord(env, record);
    await putCredentialEnvelope(
      env,
      record.uid,
      record.id,
      await encryptCredentials(
        env,
        { uid: record.uid, connectionId: record.id, provider: record.provider },
        { apiKey: "api-key-1", apiSecret: "api-secret-1", accessToken: "kite-token" },
      ),
    );
    return record;
  };

  const stubKiteSync = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/portfolio/holdings")) {
          return json({
            data: [{ tradingsymbol: "INFY", exchange: "NSE", quantity: 4, average_price: 1500 }],
          });
        }
        if (url.includes("/portfolio/positions")) return json({ data: { net: [], day: [] } });
        if (url.includes("/orders")) return json({ data: [] });
        if (url.includes("/trades")) return json({ data: [] });
        return json({}, 404);
      }),
    );

  const syncRequest = (id = CONNECTION_ID) =>
    authedRequest(`${ORIGIN}/api/brokers/connections/${id}/sync`, {}, "good-token", "POST");

  it("runs a sync and persists only the summary and ledger", async () => {
    stubKiteSync();
    const { env } = brokerEnvWithKv();
    await seedConnection(env);

    const res = await syncConnection({
      request: syncRequest(),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connection: { status: string; lastSuccessfulSyncAt: string | null };
      report: { counts: { new: number }; records: { holdings: unknown[] } };
    };
    expect(body.connection.status).toBe("connected");
    expect(body.connection.lastSuccessfulSyncAt).not.toBeNull();
    expect(body.report.counts.new).toBe(1);
    expect(body.report.records.holdings).toHaveLength(1);

    const record = await getConnectionRecord(env, "user-1", CONNECTION_ID);
    expect(record?.syncLockUntil).toBeNull();
    expect(record?.lastSync?.counts.new).toBe(1);
  });

  it("rejects a disconnected, foreign or locked connection", async () => {
    stubKiteSync();
    const { env } = brokerEnvWithKv();
    await seedConnection(env, { status: "disconnected", disconnectedAt: "2026-10-28T00:00:00.000Z" });

    const disconnected = await syncConnection({
      request: syncRequest(),
      env,
      params: { id: CONNECTION_ID },
    });
    expect(disconnected.status).toBe(409);
    expect(await disconnected.json()).toMatchObject({ code: "connection_not_connected" });

    const { env: otherEnv } = brokerEnvWithKv();
    await seedConnection(otherEnv, { uid: "user-2" });
    const foreign = await syncConnection({
      request: syncRequest(),
      env: otherEnv,
      params: { id: CONNECTION_ID },
    });
    expect(foreign.status).toBe(404);

    await seedConnection(env, {
      status: "syncing",
      syncLockUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    const locked = await syncConnection({ request: syncRequest(), env, params: { id: CONNECTION_ID } });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "sync_in_progress" });
  });

  it("rejects an unknown connection id format", async () => {
    const { env } = brokerEnvWithKv();
    const res = await syncConnection({
      request: syncRequest("not-a-uuid"),
      env,
      params: { id: "not-a-uuid" },
    });
    expect(res.status).toBe(404);
  });
});

describe("broker routes — connection lifecycle", () => {
  const seedConnected = async (env: Env, over: Record<string, unknown> = {}) => {
    const record = connectionRecord({ id: CONNECTION_ID, ...over });
    await putConnectionRecord(env, record);
    await putCredentialEnvelope(
      env,
      record.uid,
      record.id,
      await encryptCredentials(
        env,
        { uid: record.uid, connectionId: record.id, provider: record.provider },
        { apiKey: "api-key-1", apiSecret: "api-secret-1" },
      ),
    );
    return record;
  };

  it("returns the connection and its last report", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env);

    const res = await getConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`, null, "good-token", "GET"),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connection: { id: string }; report: unknown };
    expect(body.connection.id).toBe(CONNECTION_ID);
    expect(body.report).toBeNull();
  });

  it("renames a connection without touching credentials", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env);

    const res = await updateConnection({
      request: authedRequest(
        `${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`,
        { displayName: "Long-term Kite" },
        "good-token",
        "PATCH",
      ),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { connection: { displayName: string; status: string } };
    expect(body.connection).toMatchObject({ displayName: "Long-term Kite", status: "connected" });
    expect(await getCredentialEnvelope(env, "user-1", CONNECTION_ID)).not.toBeNull();
  });

  it("replaces Kite app credentials and issues a new authorization", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env);

    const res = await updateConnection({
      request: authedRequest(
        `${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`,
        { apiKey: "new-api-key-1", apiSecret: "new-api-secret-1" },
        "good-token",
        "PATCH",
      ),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as {
      connection: { status: string; tokenExpiresAt: string | null };
      nextStep: string;
      authorizationUrl: string;
    };
    expect(body.nextStep).toBe("authorize");
    expect(body.connection.status).toBe("pending_authorization");
    expect(body.connection.tokenExpiresAt).toBeNull();
    expect(new URL(body.authorizationUrl).origin).toBe("https://kite.zerodha.com");
    expect(text).not.toContain("new-api-secret-1");

    const envelope = await getCredentialEnvelope(env, "user-1", CONNECTION_ID);
    const stored = await decryptCredentials(
      env,
      { uid: "user-1", connectionId: CONNECTION_ID, provider: "zerodha" },
      envelope!,
    );
    expect(stored).toMatchObject({ apiKey: "new-api-key-1", apiSecret: "new-api-secret-1" });
    expect(stored.accessToken).toBeUndefined();
  });

  it("disconnects, deletes the credential envelope and stays idempotent", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env);

    const first = await disconnectConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`, null, "good-token", "DELETE"),
      env,
      params: { id: CONNECTION_ID },
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { connection: { status: string } }).connection.status).toBe(
      "disconnected",
    );
    expect(await getCredentialEnvelope(env, "user-1", CONNECTION_ID)).toBeNull();

    const second = await disconnectConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`, null, "good-token", "DELETE"),
      env,
      params: { id: CONNECTION_ID },
    });
    expect(second.status).toBe(200);
  });

  it("disconnects a connection left behind by a crashed sync", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env, {
      status: "syncing",
      syncLockUntil: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await disconnectConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`, null, "good-token", "DELETE"),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { connection: { status: string } }).connection.status).toBe(
      "disconnected",
    );
  });

  it("refuses to disconnect while a sync is running", async () => {
    const { env } = brokerEnvWithKv();
    await seedConnected(env, {
      status: "syncing",
      syncLockUntil: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await disconnectConnection({
      request: authedRequest(`${ORIGIN}/api/brokers/connections/${CONNECTION_ID}`, null, "good-token", "DELETE"),
      env,
      params: { id: CONNECTION_ID },
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "sync_in_progress" });
  });
});
