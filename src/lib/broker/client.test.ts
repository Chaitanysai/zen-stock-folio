import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("../api", () => ({ apiFetch: api.apiFetch }));

import {
  BrokerApiError,
  brokerErrorMessage,
  isConnectionExpired,
  linkBrokerToken,
  runBrokerSync,
} from "./client";
import type { ApplyResult, BrokerConnectionPayload, PreviewResult } from "./types";

const sealed: BrokerConnectionPayload = {
  ciphertext: "ciphertext-material",
  iv: "initialization-vector",
  keyVersion: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const preview: PreviewResult = {
  mode: "preview",
  provider: "indmoney",
  generatedAt: "2026-11-01T00:00:00.000Z",
  holdingsSeen: 1,
  executionsSeen: 1,
  openPositions: [],
  closedPositions: [],
  executionsAdded: 1,
  unmatched: [],
  conflicts: [],
  warnings: [],
  snapshotUpdateTime: "2026-11-01T00:00:00.000Z",
  unchangedPositions: 0,
  requiresEmptyConfirmation: false,
};

const applied: ApplyResult = {
  mode: "apply",
  provider: "indmoney",
  appliedAt: "2026-11-01T01:00:00.000Z",
  openPositions: 1,
  closedPositions: 0,
  executions: 1,
  snapshotUpdateTime: "2026-11-01T01:00:00.000Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const previewRequest = {
  mode: "preview" as const,
  ciphertext: sealed.ciphertext,
  iv: sealed.iv,
  keyVersion: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkBrokerToken", () => {
  it("posts the trimmed token to the link route and returns sealed material", async () => {
    api.apiFetch.mockResolvedValue(json(sealed));

    await expect(linkBrokerToken("  tok_1234567890abcdef  ")).resolves.toEqual(sealed);
    expect(api.apiFetch).toHaveBeenCalledWith("/api/broker/indmoney/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tok_1234567890abcdef" }),
    });
  });

  it("rejects a blank or absurd token without calling the server", async () => {
    await expect(linkBrokerToken("   ")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(linkBrokerToken("x".repeat(4097))).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["an empty ciphertext", { ...sealed, ciphertext: "" }],
    ["an oversized ciphertext", { ...sealed, ciphertext: "x".repeat(8193) }],
    ["an empty iv", { ...sealed, iv: "" }],
    ["an oversized iv", { ...sealed, iv: "x".repeat(65) }],
    ["a newer key version", { ...sealed, keyVersion: 2 }],
    ["an unparseable expiry", { ...sealed, expiresAt: "tomorrow" }],
  ])("rejects a 200 response carrying %s", async (_label, body) => {
    api.apiFetch.mockResolvedValue(json(body));

    await expect(linkBrokerToken("tok_1234567890abcdef")).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });
});

describe("runBrokerSync", () => {
  it("posts sealed material for a preview", async () => {
    api.apiFetch.mockResolvedValue(json(preview));

    const request = {
      mode: "preview" as const,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
    };
    await expect(runBrokerSync(request)).resolves.toEqual(preview);
    expect(api.apiFetch).toHaveBeenCalledWith("/api/broker/indmoney/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });

  it("sends the previewed updateTime and an explicit empty confirmation on apply", async () => {
    api.apiFetch.mockResolvedValue(json(applied));

    await expect(runBrokerSync({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: null,
      confirmEmpty: true,
    })).resolves.toEqual(applied);

    expect(api.apiFetch).toHaveBeenCalledWith("/api/broker/indmoney/sync", expect.objectContaining({
      body: JSON.stringify({
        mode: "apply",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        keyVersion: 1,
        baseUpdateTime: null,
        confirmEmpty: true,
      }),
    }));
  });

  it("surfaces the server status and code", async () => {
    api.apiFetch.mockResolvedValue(
      json({ error: "The portfolio changed since the preview. Run the preview again.", code: "SNAPSHOT_CHANGED" }, 409),
    );

    await expect(runBrokerSync({
      mode: "preview",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
    })).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 409,
      code: "SNAPSHOT_CHANGED",
    });
  });

  it("turns a transport failure into a typed network error", async () => {
    api.apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(runBrokerSync({
      mode: "preview",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
    })).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("does not mistake an unreadable 200 for a result", async () => {
    api.apiFetch.mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(runBrokerSync({
      mode: "preview",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
  ])("rejects a preview 200 response carrying %s", async (_label, body) => {
    api.apiFetch.mockResolvedValue(json(body));

    await expect(runBrokerSync(previewRequest)).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it.each([
    ["a number", 1735689600000],
    ["a boolean", true],
    ["an object", {}],
    ["an unparseable string", "tomorrow"],
  ])("rejects a preview 200 response whose snapshotUpdateTime is %s", async (_label, value) => {
    api.apiFetch.mockResolvedValue(json({ ...preview, snapshotUpdateTime: value }));

    await expect(runBrokerSync(previewRequest)).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it("accepts a null snapshotUpdateTime for a first sync", async () => {
    api.apiFetch.mockResolvedValue(json({ ...preview, snapshotUpdateTime: null }));

    await expect(runBrokerSync(previewRequest)).resolves.toMatchObject({ snapshotUpdateTime: null });
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
  ])("rejects an apply 200 response carrying %s", async (_label, body) => {
    api.apiFetch.mockResolvedValue(json(body));

    await expect(runBrokerSync({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: preview.snapshotUpdateTime,
    })).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects an apply 200 response whose snapshotUpdateTime is null", async () => {
    api.apiFetch.mockResolvedValue(json({ ...applied, snapshotUpdateTime: null }));

    await expect(runBrokerSync({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: null,
    })).rejects.toMatchObject({
      name: "BrokerApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects a result for the wrong mode or with missing fields", async () => {
    api.apiFetch.mockResolvedValue(json({ ...preview, warnings: undefined }));
    await expect(runBrokerSync(previewRequest)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    api.apiFetch.mockResolvedValue(json({ ...applied, appliedAt: undefined }));
    await expect(runBrokerSync({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: null,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    api.apiFetch.mockResolvedValue(json({ ...applied, mode: "preview" }));
    await expect(runBrokerSync({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: null,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("error copy and expiry", () => {
  it("maps known server codes to user-facing copy", () => {
    expect(brokerErrorMessage(new BrokerApiError(409, "TOKEN_EXPIRED", "raw"))).toMatch(/expired/i);
    expect(brokerErrorMessage(new BrokerApiError(409, "SNAPSHOT_CHANGED", "raw"))).toMatch(/preview again/i);
    expect(brokerErrorMessage(new BrokerApiError(503, "BROKER_DISABLED", "raw"))).toMatch(/not configured/i);
    expect(brokerErrorMessage(new BrokerApiError(429, "RATE_LIMITED", "raw"))).toMatch(/too many/i);
    expect(brokerErrorMessage(new BrokerApiError(400, "SOMETHING_ELSE", "specific message"))).toBe("specific message");
    expect(brokerErrorMessage(new Error("offline"))).toMatch(/failed/i);
  });

  it("does not overstate which positions a confirmed empty sync removes", () => {
    expect(
      brokerErrorMessage(new BrokerApiError(400, "EMPTY_HOLDINGS_CONFIRMATION_REQUIRED", "raw")),
    ).toBe("The broker returned no holdings. Confirm to remove the synced positions.");
  });

  it("treats the expiry instant itself as expired", () => {
    const now = Date.parse("2026-11-01T00:00:00.000Z");
    expect(isConnectionExpired({ ...sealed, expiresAt: "2026-11-01T00:00:01.000Z" }, now)).toBe(false);
    expect(isConnectionExpired({ ...sealed, expiresAt: "2026-11-01T00:00:00.000Z" }, now)).toBe(true);
    expect(isConnectionExpired({ ...sealed, expiresAt: "not-a-date" }, now)).toBe(true);
  });
});
