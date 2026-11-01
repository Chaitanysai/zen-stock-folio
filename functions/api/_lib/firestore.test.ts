import { describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "../../../src/lib/data/snapshotTypes";
import {
  commitSnapshot,
  decodeFields,
  decodeValue,
  encodeFields,
  encodeValue,
  readPortfolio,
  type FirestoreValue,
} from "./firestore";
import { makeEnv } from "./testHelpers";

const snapshot: PortfolioSnapshot = {
  stocks: [{
    ticker: "RELIANCE", stockName: "Reliance", entryDate: "2026-01-01",
    entryPrice: 100, cmp: 110, weekHigh52: 120, quantity: 2, status: "Active",
    market: "NSE", currency: "INR", source: "manual",
  }],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
  executions: [],
};

const env = makeEnv({ FIREBASE_PROJECT_ID: "demo-project" });
const TOKEN = "caller-id-token";

const documentBody = {
  name: "projects/demo-project/databases/(default)/documents/portfolios/user-1",
  fields: {
    uid: { stringValue: "user-1" },
    snapshot: { mapValue: { fields: encodeFields({ ...snapshot }) } },
    updatedAt: { timestampValue: "2026-11-01T00:00:00.000Z" },
  },
  updateTime: "2026-11-01T00:00:00.123456Z",
};

describe("Firestore value codec", () => {
  it("round-trips nested arrays, maps, numbers and nulls", () => {
    const value = { a: [1, 2.5, { b: "x", c: null }], d: true };
    expect(decodeValue(encodeValue(value))).toEqual(value);
  });

  it("omits undefined object fields instead of encoding them as null", () => {
    const fields = encodeFields({ a: 1, b: undefined });
    expect(Object.keys(fields)).toEqual(["a"]);
  });

  it("decodes unknown or structurally malformed values to null instead of throwing", () => {
    const raw = (value: unknown) => value as unknown as FirestoreValue;

    expect(decodeValue(raw(null))).toBeNull();
    expect(decodeValue(raw({}))).toBeNull();
    expect(decodeValue(raw({ unknownValue: true }))).toBeNull();
    expect(decodeValue(raw({ mapValue: { fields: "x" } }))).toEqual({});
    expect(decodeValue(raw({ arrayValue: { values: "x" } }))).toBeNull();
    expect(decodeValue(raw({ mapValue: { fields: { nested: null } } }))).toEqual({ nested: null });
    expect(decodeFields(raw(null) as unknown as Record<string, FirestoreValue>)).toEqual({});
    expect(decodeFields(raw("x") as unknown as Record<string, FirestoreValue>)).toEqual({});
  });

  it("never decodes a corrupt numeric value to NaN", () => {
    expect(decodeValue({ integerValue: "NaN" })).toBeNull();
    expect(decodeValue({ integerValue: "" })).toBeNull();
    expect(decodeValue({ doubleValue: "NaN" })).toBeNull();
    expect(decodeValue({ doubleValue: Number.POSITIVE_INFINITY })).toBeNull();
    expect(decodeValue({ doubleValue: Number.NEGATIVE_INFINITY })).toBeNull();
  });
});

describe("readPortfolio", () => {
  it("returns null snapshot and updateTime for a missing document", async () => {
    const result = await readPortfolio(env, "user-1", TOKEN, async () => new Response("", { status: 404 }));
    expect(result).toEqual({ status: "ok", snapshot: null, updateTime: null });
  });

  it("decodes the stored snapshot and its updateTime", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(documentBody), { status: 200 }));
    const result = await readPortfolio(env, "user-1", TOKEN, fetchImpl);

    expect(result.status).toBe("ok");
    expect(result.snapshot?.stocks[0].ticker).toBe("RELIANCE");
    expect(result.updateTime).toBe("2026-11-01T00:00:00.123456Z");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/projects/demo-project/databases/(default)/documents/portfolios/user-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    // The caller token belongs in the Authorization header only.
    expect(url).not.toContain(TOKEN);
    expect(init.body).toBeUndefined();
  });

  it("treats a foreign or malformed document as an error, never as empty", async () => {
    const foreign = await readPortfolio(env, "user-1", TOKEN, async () =>
      new Response(JSON.stringify({ ...documentBody, fields: { ...documentBody.fields, uid: { stringValue: "user-2" } } }), { status: 200 }));
    expect(foreign.status).toBe("error");

    const malformed = await readPortfolio(env, "user-1", TOKEN, async () =>
      new Response(JSON.stringify({ ...documentBody, fields: { uid: { stringValue: "user-1" }, snapshot: { stringValue: "nope" } } }), { status: 200 }));
    expect(malformed.status).toBe("error");
  });

  it("maps a failed read to an error instead of an empty portfolio", async () => {
    const result = await readPortfolio(env, "user-1", TOKEN, async () => new Response("denied", { status: 403 }));
    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected a read error");
    expect(result.error).toMatch(/403/);
  });

  it.each([
    ["a literal null body", null],
    ["an empty object", {}],
    ["non-object fields", { fields: "x" }],
    ["a non-string updateTime", { ...documentBody, updateTime: 123 }],
    ["a nested malformed value", {
      ...documentBody,
      fields: {
        uid: { stringValue: "user-1" },
        snapshot: { mapValue: { fields: { stocks: null, trades: { arrayValue: {} }, watchlist: { arrayValue: {} }, alerts: { arrayValue: {} } } } },
      },
    }],
  ])("turns %s into a typed failure instead of throwing", async (_label, body) => {
    const result = await readPortfolio(env, "user-1", TOKEN, async () =>
      new Response(JSON.stringify(body), { status: 200 }));

    expect(result).toMatchObject({ status: "error", snapshot: null, code: "invalid_response" });
  });

  it("rejects a document whose integerValue decodes to NaN", async () => {
    const corrupt = {
      ...documentBody,
      fields: {
        uid: { stringValue: "user-1" },
        snapshot: { mapValue: { fields: {
          stocks: { arrayValue: { values: [
            { mapValue: { fields: { ticker: { stringValue: "RELIANCE" }, cmp: { integerValue: "NaN" } } } },
          ] } },
          trades: { arrayValue: { values: [] } },
          watchlist: { arrayValue: { values: [] } },
          alerts: { arrayValue: { values: [] } },
        } } },
      },
    };
    const result = await readPortfolio(env, "user-1", TOKEN, async () =>
      new Response(JSON.stringify(corrupt), { status: 200 }));

    expect(result).toMatchObject({ status: "error", snapshot: null, code: "invalid_response" });
  });

  it.each([
    ["a missing updateTime", { name: documentBody.name, fields: documentBody.fields }],
    ["an empty updateTime", { ...documentBody, updateTime: "" }],
  ])("rejects %s when a snapshot is present", async (_label, body) => {
    const result = await readPortfolio(env, "user-1", TOKEN, async () =>
      new Response(JSON.stringify(body), { status: 200 }));

    expect(result).toMatchObject({ status: "error", snapshot: null, code: "invalid_response" });
  });

  it.each(["../evil", "a/b"])("refuses uid %s before any network call", async (uid) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(documentBody), { status: 200 }));

    const read = await readPortfolio(env, uid, TOKEN, fetchImpl);
    expect(read).toMatchObject({ status: "error", code: "invalid_uid" });

    const write = await commitSnapshot(env, uid, TOKEN, snapshot, { exists: false }, fetchImpl);
    expect(write).toMatchObject({ ok: false, code: "invalid_uid" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("commitSnapshot", () => {
  it("writes only uid/snapshot, stamps updatedAt server-side, and sends the precondition", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ writeResults: [{ updateTime: "2026-11-01T01:00:00.000Z" }] }), { status: 200 }));

    const result = await commitSnapshot(
      env, "user-1", TOKEN, snapshot,
      { updateTime: "2026-11-01T00:00:00.123456Z" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true, updateTime: "2026-11-01T01:00:00.000Z" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/documents:commit");
    const body = JSON.parse(String(init.body));
    expect(body.writes[0].updateMask.fieldPaths).toEqual(["uid", "snapshot"]);
    expect(body.writes[0].updateTransforms[0]).toEqual({ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" });
    expect(body.writes[0].currentDocument).toEqual({ updateTime: "2026-11-01T00:00:00.123456Z" });
    // The caller token belongs in the Authorization header only.
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(url).not.toContain(TOKEN);
    expect(String(init.body)).not.toContain(TOKEN);
  });

  it.each([
    ["a literal null body", null],
    ["an empty object", {}],
    ["a non-array writeResults", { writeResults: {} }],
    ["an empty writeResults", { writeResults: [] }],
    ["an entry without updateTime", { writeResults: [{}] }],
    ["an entry with a non-string updateTime", { writeResults: [{ updateTime: 123 }] }],
  ])("turns %s into a typed failure instead of a fabricated success", async (_label, body) => {
    const result = await commitSnapshot(env, "user-1", TOKEN, snapshot, { exists: false }, async () =>
      new Response(JSON.stringify(body), { status: 200 }));

    expect(result).toMatchObject({ ok: false, code: "invalid_response", updateTime: null });
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("turns a snapshot containing %s into a typed failure without a fetch", async (_label, bad) => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ writeResults: [{ updateTime: "t" }] }), { status: 200 }));
    const withBadNumber: PortfolioSnapshot = {
      ...snapshot,
      stocks: [{ ...snapshot.stocks[0], cmp: bad }],
    };

    const result = await commitSnapshot(env, "user-1", TOKEN, withBadNumber, { exists: false }, fetchImpl);

    expect(result).toMatchObject({ ok: false, updateTime: null, code: "invalid_input" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses exists:false when creating the first document", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ writeResults: [{ updateTime: "t" }] }), { status: 200 }));
    await commitSnapshot(env, "user-1", TOKEN, snapshot, { exists: false }, fetchImpl);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.writes[0].currentDocument).toEqual({ exists: false });
  });

  it("reports a precondition failure as a conflict, not a generic error", async () => {
    const conflict = await commitSnapshot(env, "user-1", TOKEN, snapshot, { updateTime: "old" },
      async () => new Response("", { status: 409 }));
    expect(conflict).toMatchObject({ ok: false, conflict: true });

    const aborted = await commitSnapshot(env, "user-1", TOKEN, snapshot, { updateTime: "old" },
      async () => new Response("FAILED_PRECONDITION: the stored version does not match", { status: 400 }));
    expect(aborted).toMatchObject({ ok: false, conflict: true });
  });

  it("refuses to write without a configured project", async () => {
    const result = await commitSnapshot(makeEnv(), "user-1", TOKEN, snapshot, { exists: false },
      async () => new Response("", { status: 200 }));
    expect(result.ok).toBe(false);
  });

  it("refuses a write payload over the 1 MiB document cap without a fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ writeResults: [{ updateTime: "t" }] }), { status: 200 }));
    const oversized: PortfolioSnapshot = {
      ...snapshot,
      // The encoded document is larger than the raw text: well over 1 MiB.
      stocks: [{ ...snapshot.stocks[0], stockName: "x".repeat(1_100_000) }],
    };

    const result = await commitSnapshot(env, "user-1", TOKEN, oversized, { exists: false }, fetchImpl);

    expect(result).toEqual({
      ok: false,
      updateTime: null,
      error: "Portfolio exceeds Firestore's document size limit",
      code: "too_large",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to write when the project is explicitly unset", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    const result = await commitSnapshot(
      makeEnv({ FIREBASE_PROJECT_ID: undefined }), "user-1", TOKEN, snapshot, { exists: false }, fetchImpl,
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
