import { useLayoutEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkBrokerToken: vi.fn(),
  runBrokerSync: vi.fn(),
  loadBrokerConnection: vi.fn(),
  saveBrokerConnection: vi.fn(),
  markBrokerSynced: vi.fn(),
  clearBrokerConnection: vi.fn(),
}));

vi.mock("@/lib/broker/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/broker/client")>();
  return {
    ...actual,
    linkBrokerToken: mocks.linkBrokerToken,
    runBrokerSync: mocks.runBrokerSync,
  };
});

vi.mock("@/lib/broker/connectionStore", () => ({
  loadBrokerConnection: mocks.loadBrokerConnection,
  saveBrokerConnection: mocks.saveBrokerConnection,
  markBrokerSynced: mocks.markBrokerSynced,
  clearBrokerConnection: mocks.clearBrokerConnection,
}));

import { BrokerApiError } from "@/lib/broker/client";
import { useBrokerSync } from "./useBrokerSync";
import type {
  ApplyResult,
  BrokerConnection,
  BrokerConnectionPayload,
  PreviewResult,
} from "@/lib/broker/types";

const UID = "user-1";

const sealed: BrokerConnectionPayload = {
  ciphertext: "ciphertext-material",
  iv: "initialization-vector",
  keyVersion: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const connection: BrokerConnection = { ...sealed, provider: "indmoney", syncedAt: null };

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

const renderSync = (userId: string | undefined = UID) =>
  renderHook(({ id }: { id: string | undefined }) => useBrokerSync(id), {
    initialProps: { id: userId },
  });

const settled = async () => {
  const hook = renderSync();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection: null });
  mocks.saveBrokerConnection.mockResolvedValue(null);
  mocks.markBrokerSynced.mockResolvedValue(null);
  mocks.clearBrokerConnection.mockResolvedValue(null);
});

describe("connection loading", () => {
  it("shows a linked account", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    const { result } = await settled();

    expect(result.current.connection).toEqual(connection);
    expect(result.current.expired).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("marks a stored token past its expiry as expired", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({
      status: "ok",
      connection: { ...connection, expiresAt: "2000-01-01T00:00:00.000Z" },
    });
    const { result } = await settled();

    expect(result.current.expired).toBe(true);
    expect(result.current.error).toMatch(/expired/i);
  });

  it("reports a failed read without pretending the account is unlinked", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "error", error: "permission denied" });
    const { result } = await settled();

    expect(result.current.connection).toBeNull();
    expect(result.current.error).toBe("permission denied");
  });

  it("discards a connection that resolves after the account changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.loadBrokerConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ status: "ok", connection: null });

    const { result, rerender } = renderSync(UID);
    rerender({ id: "user-2" });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      resolveFirst({ status: "ok", connection });
    });

    expect(result.current.connection).toBeNull();
  });

  it("discards a preview that resolves after the account changes", async () => {
    mocks.loadBrokerConnection
      .mockResolvedValueOnce({ status: "ok", connection })
      .mockResolvedValueOnce({ status: "ok", connection: null });
    let resolvePreview!: (value: unknown) => void;
    mocks.runBrokerSync.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePreview = resolve; }),
    );

    const { result, rerender } = renderSync(UID);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending: Promise<PreviewResult | null> | undefined;
    await act(async () => {
      pending = result.current.runPreview();
    });

    rerender({ id: "user-2" });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      resolvePreview(preview);
      await pending;
    });

    expect(result.current.connection).toBeNull();
    expect(result.current.preview).toBeNull();
  });

  it("resets the previous account's state in the render that switches accounts", async () => {
    mocks.loadBrokerConnection
      .mockResolvedValueOnce({ status: "ok", connection })
      .mockResolvedValueOnce({ status: "ok", connection: null });
    mocks.runBrokerSync.mockResolvedValueOnce(preview);

    const { result, rerender } = renderSync(UID);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.runPreview();
    });

    expect(result.current.connection).toEqual(connection);
    expect(result.current.preview).toEqual(preview);

    rerender({ id: "user-2" });

    // Read immediately, before any effect or waitFor can run: the next
    // account's very first render must not expose the previous account's
    // sealed connection or portfolio preview.
    expect(result.current.connection).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.applied).toBeNull();

    // Let the new account's load settle inside act.
    await act(async () => {});
  });

  it("discards a load that resolves before the switch's passive cleanup", async () => {
    // The exact window this guards — a read that resolves between the switch
    // commit and the passive cleanup that sets the load effect's `cancelled`
    // flag — cannot be opened under React's test renderer: the cleanup is
    // flushed within the commit before the microtask queue drains, so this
    // passes on the pre-hardening code too. It still pins the outcome: a
    // stale read must not reach the account that replaced it.
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    mocks.loadBrokerConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const { result, rerender } = renderSync(UID);
    rerender({ id: "user-2" });

    // user-1's read resolves while user-2's own read is still pending.
    await act(async () => {
      resolveFirst({ status: "ok", connection });
    });

    expect(result.current.connection).toBeNull();
    expect(result.current.error).toBeNull();

    // Let the new account's own read settle inside act.
    await act(async () => {
      resolveSecond({ status: "ok", connection: null });
    });
  });

  it("never commits the previous account's state after a switch", async () => {
    mocks.loadBrokerConnection
      .mockResolvedValueOnce({ status: "ok", connection })
      .mockResolvedValueOnce({ status: "ok", connection: null });
    mocks.runBrokerSync.mockResolvedValueOnce(preview);

    // `renderHook`'s rerender runs inside `act`, which flushes passive effects
    // before it returns, so a plain `result.current` read cannot distinguish a
    // stale commit that would paint for a frame. Record what is actually
    // committed for the new account instead.
    const committed: Array<{
      id: string | undefined;
      connection: BrokerConnection | null;
      preview: PreviewResult | null;
    }> = [];

    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => {
        const sync = useBrokerSync(id);
        useLayoutEffect(() => {
          committed.push({ id, connection: sync.connection, preview: sync.preview });
        });
        return sync;
      },
      { initialProps: { id: UID as string | undefined } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.runPreview();
    });

    rerender({ id: "user-2" });

    const leaked = committed.filter(
      (entry) => entry.id === "user-2" && (entry.connection !== null || entry.preview !== null),
    );
    expect(leaked).toEqual([]);

    // Let the new account's load settle inside act.
    await act(async () => {});
  });
});

describe("link", () => {
  it("saves the sealed material and previews immediately", async () => {
    mocks.linkBrokerToken.mockResolvedValue(sealed);
    mocks.runBrokerSync.mockResolvedValue(preview);
    const { result } = await settled();

    let linked = false;
    await act(async () => {
      linked = await result.current.link("tok_1234567890abcdef");
    });

    expect(linked).toBe(true);
    expect(mocks.linkBrokerToken).toHaveBeenCalledWith("tok_1234567890abcdef");
    expect(mocks.saveBrokerConnection).toHaveBeenCalledWith(UID, sealed);
    expect(mocks.runBrokerSync).toHaveBeenCalledWith({
      mode: "preview",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
    });
    expect(result.current.connection).toMatchObject({ provider: "indmoney", syncedAt: null });
    expect(result.current.preview).toEqual(preview);
    expect(result.current.busy).toBe(false);
  });

  it("stores nothing when the broker rejects the token", async () => {
    mocks.linkBrokerToken.mockRejectedValue(new BrokerApiError(409, "TOKEN_EXPIRED", "raw"));
    const { result } = await settled();

    let linked = true;
    await act(async () => {
      linked = await result.current.link("tok_1234567890abcdef");
    });

    expect(linked).toBe(false);
    expect(mocks.saveBrokerConnection).not.toHaveBeenCalled();
    expect(result.current.expired).toBe(true);
    expect(result.current.error).toMatch(/expired/i);
  });

  it("reports a disabled deployment", async () => {
    mocks.linkBrokerToken.mockRejectedValue(new BrokerApiError(503, "BROKER_DISABLED", "raw"));
    const { result } = await settled();

    await act(async () => {
      await result.current.link("tok_1234567890abcdef");
    });

    expect(result.current.disabled).toBe(true);
    expect(mocks.saveBrokerConnection).not.toHaveBeenCalled();
  });

  it("reports a failed connection write and keeps no connection", async () => {
    mocks.linkBrokerToken.mockResolvedValue(sealed);
    mocks.saveBrokerConnection.mockResolvedValue("permission denied");
    const { result } = await settled();

    let linked = true;
    await act(async () => {
      linked = await result.current.link("tok_1234567890abcdef");
    });

    expect(linked).toBe(false);
    expect(result.current.connection).toBeNull();
    expect(result.current.error).toBe("permission denied");
    expect(mocks.runBrokerSync).not.toHaveBeenCalled();
  });
});

describe("preview and apply", () => {
  it("requires a linked account", async () => {
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });

    expect(mocks.runBrokerSync).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/link/i);
  });

  it("does not call the broker for a token that has already expired", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({
      status: "ok",
      connection: { ...connection, expiresAt: "2000-01-01T00:00:00.000Z" },
    });
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });

    expect(mocks.runBrokerSync).not.toHaveBeenCalled();
    expect(result.current.expired).toBe(true);
  });

  it("clears a stale preview once the stored token expires", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.runBrokerSync.mockResolvedValueOnce(preview);
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });
    expect(result.current.preview).toEqual(preview);

    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2100-01-01T00:00:00.000Z"));
    try {
      await act(async () => {
        await result.current.runPreview();
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(mocks.runBrokerSync).toHaveBeenCalledTimes(1);
    expect(result.current.expired).toBe(true);
    expect(result.current.preview).toBeNull();
    expect(result.current.applied).toBeNull();
  });

  it("clears a stale preview once the stored token expires before applying", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.runBrokerSync.mockResolvedValueOnce(preview);
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });
    expect(result.current.preview).toEqual(preview);

    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2100-01-01T00:00:00.000Z"));
    try {
      await act(async () => {
        await result.current.apply();
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(mocks.runBrokerSync).toHaveBeenCalledTimes(1);
    expect(mocks.markBrokerSynced).not.toHaveBeenCalled();
    expect(result.current.expired).toBe(true);
    expect(result.current.error).toMatch(/expired/i);
    expect(result.current.preview).toBeNull();
    expect(result.current.applied).toBeNull();
  });

  it("requires a preview before applying", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    const { result } = await settled();

    await act(async () => {
      await result.current.apply();
    });

    expect(mocks.runBrokerSync).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/preview/i);
  });

  it("applies the previewed snapshot and records the sync time", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.runBrokerSync.mockResolvedValueOnce(preview).mockResolvedValueOnce(applied);
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });

    await act(async () => {
      await result.current.apply(true);
    });

    expect(mocks.runBrokerSync).toHaveBeenLastCalledWith({
      mode: "apply",
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      keyVersion: 1,
      baseUpdateTime: preview.snapshotUpdateTime,
      confirmEmpty: true,
    });
    expect(mocks.markBrokerSynced).toHaveBeenCalledWith(UID, applied.appliedAt);
    expect(result.current.applied).toEqual(applied);
    expect(result.current.preview).toBeNull();
    expect(result.current.connection?.syncedAt).toBe(applied.appliedAt);
    expect(result.current.error).toBeNull();
  });

  it("sends an explicit null baseUpdateTime for a first sync", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    const firstPreview = { ...preview, snapshotUpdateTime: null };
    mocks.runBrokerSync.mockResolvedValueOnce(firstPreview).mockResolvedValueOnce(applied);
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });
    await act(async () => {
      await result.current.apply();
    });

    expect(mocks.runBrokerSync).toHaveBeenLastCalledWith(expect.objectContaining({
      baseUpdateTime: null,
    }));
  });

  it("omits confirmEmpty when the caller does not confirm", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.runBrokerSync.mockResolvedValueOnce(preview).mockResolvedValueOnce(applied);
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });
    await act(async () => {
      await result.current.apply();
    });

    const calls = mocks.runBrokerSync.mock.calls;
    const request = calls[calls.length - 1][0];
    expect(request).not.toHaveProperty("confirmEmpty");
    expect(request.baseUpdateTime).toBe(preview.snapshotUpdateTime);
  });

  it("marks the starter as synced but hides its outcome after an account switch", async () => {
    mocks.loadBrokerConnection
      .mockResolvedValueOnce({ status: "ok", connection })
      .mockResolvedValueOnce({ status: "ok", connection: null });

    let resolveApply!: (value: unknown) => void;
    mocks.runBrokerSync
      .mockResolvedValueOnce(preview)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveApply = resolve;
      }));

    const { result, rerender } = renderSync(UID);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.runPreview();
    });

    let pending: Promise<ApplyResult | null> | undefined;
    await act(async () => {
      pending = result.current.apply();
    });

    rerender({ id: "user-2" });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: ApplyResult | null | undefined;
    await act(async () => {
      resolveApply(applied);
      outcome = await pending;
    });

    expect(outcome).toBeNull();
    expect(mocks.markBrokerSynced).toHaveBeenCalledTimes(1);
    expect(mocks.markBrokerSynced).toHaveBeenCalledWith(UID, applied.appliedAt);
    expect(result.current.connection).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("keeps the preview and skips the sync marker when the portfolio changed", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.runBrokerSync
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(new BrokerApiError(409, "SNAPSHOT_CHANGED", "raw"));
    const { result } = await settled();

    await act(async () => {
      await result.current.runPreview();
    });

    let appliedResult: ApplyResult | null = applied;
    await act(async () => {
      appliedResult = await result.current.apply();
    });

    expect(appliedResult).toBeNull();
    expect(mocks.markBrokerSynced).not.toHaveBeenCalled();
    expect(result.current.preview).toEqual(preview);
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toMatch(/preview again/i);
  });
});

describe("disconnect", () => {
  it("deletes the connection and clears every derived value", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    const { result } = await settled();

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mocks.clearBrokerConnection).toHaveBeenCalledWith(UID);
    expect(result.current.connection).toBeNull();
    expect(result.current.preview).toBeNull();
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps the connection when the delete fails", async () => {
    mocks.loadBrokerConnection.mockResolvedValue({ status: "ok", connection });
    mocks.clearBrokerConnection.mockResolvedValue("offline");
    const { result } = await settled();

    let cleared = true;
    await act(async () => {
      cleared = await result.current.disconnect();
    });

    expect(cleared).toBe(false);
    expect(result.current.connection).toEqual(connection);
    expect(result.current.error).toBe("offline");
  });
});
