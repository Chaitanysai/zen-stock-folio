import { describe, expect, it } from "vitest";
import {
  brokerSetupState,
  getConnectionRecord,
  getLedger,
  listConnectionRecords,
  publicOrigin,
  putAuthorizationState,
  putConnectionRecord,
  putLedger,
  requireConnectionRecord,
  syncLockIsActive,
  takeAuthorizationState,
} from "./store.ts";
import { BrokerError } from "./errors.ts";
import { brokerEnv, connectionRecord, memoryKv } from "./testKit.ts";
import type { Env } from "../../_lib/types.ts";
import type { BrokerLedger } from "./store.ts";

const envWithKv = (): { env: Env; values: Map<string, string> } => {
  const { kv, values } = memoryKv();
  return { env: brokerEnv({ BROKER_STORE: kv }), values };
};

const stateRecord = {
  uid: "user-1",
  provider: "zerodha" as const,
  connectionId: "conn-1",
  createdAt: "2026-10-28T00:00:00.000Z",
  expiresAt: "2026-10-28T00:10:00.000Z",
};

describe("broker KV store", () => {
  it("namespaces connection reads by uid and hides foreign records", async () => {
    const { env } = envWithKv();
    await putConnectionRecord(env, connectionRecord());

    expect(await getConnectionRecord(env, "user-1", connectionRecord().id)).not.toBeNull();
    expect(await getConnectionRecord(env, "user-2", connectionRecord().id)).toBeNull();
    await expect(requireConnectionRecord(env, "user-2", connectionRecord().id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("lists only the caller's connections, newest first", async () => {
    const { env } = envWithKv();
    await putConnectionRecord(env, connectionRecord({ id: "a", updatedAt: "2026-10-27T00:00:00.000Z" }));
    await putConnectionRecord(env, connectionRecord({ id: "b", updatedAt: "2026-10-28T00:00:00.000Z" }));
    await putConnectionRecord(env, connectionRecord({ id: "c", uid: "user-2" }));

    const records = await listConnectionRecords(env, "user-1");
    expect(records.map((record) => record.id)).toEqual(["b", "a"]);
  });

  it("consumes authorization state exactly once", async () => {
    const { env } = envWithKv();
    await putAuthorizationState(env, "zerodha", "hash-1", stateRecord);

    expect(
      await takeAuthorizationState(env, "zerodha", "hash-1", new Date("2026-10-28T00:05:00.000Z")),
    ).toEqual(stateRecord);
    await expect(takeAuthorizationState(env, "zerodha", "hash-1")).rejects.toMatchObject({
      code: "state_reused",
    });
    await expect(takeAuthorizationState(env, "zerodha", "never-seen")).rejects.toMatchObject({
      code: "state_invalid",
    });
  });

  it("refuses an expired authorization state", async () => {
    const { env } = envWithKv();
    await putAuthorizationState(env, "zerodha", "hash-2", stateRecord);

    await expect(
      takeAuthorizationState(env, "zerodha", "hash-2", new Date("2026-10-28T00:11:00.000Z")),
    ).rejects.toMatchObject({ code: "state_expired" });
  });

  it("does not let another provider consume a valid state", async () => {
    const { env } = envWithKv();
    await putAuthorizationState(env, "zerodha", "hash-3", stateRecord);

    // A Groww callback with a Zerodha state computes a different key: it must
    // fail without deleting or marking the Zerodha state used.
    await expect(takeAuthorizationState(env, "groww", "hash-3")).rejects.toMatchObject({
      code: "state_invalid",
    });
    expect(
      await takeAuthorizationState(env, "zerodha", "hash-3", new Date("2026-10-28T00:05:00.000Z")),
    ).toEqual(stateRecord);
  });

  it("caps the dedupe ledger", async () => {
    const { env } = envWithKv();
    const entries: BrokerLedger["entries"] = {};
    for (let index = 0; index < 5_005; index++) entries[`h:item-${index}`] = `h:item-${index}:[]`;

    await putLedger(env, "user-1", "conn-1", { entries });

    const stored = await getLedger(env, "user-1", "conn-1");
    expect(Object.keys(stored.entries)).toHaveLength(5_000);
    expect(stored.entries["h:item-0"]).toBeUndefined();
    expect(stored.entries["h:item-5004"]).toBeDefined();
  });

  it("treats a stale sync lock as free and an active one as busy", async () => {
    const base = connectionRecord({ status: "syncing" });
    expect(
      syncLockIsActive(
        { ...base, syncLockUntil: "2026-10-28T00:02:00.000Z" },
        new Date("2026-10-28T00:01:00.000Z"),
      ),
    ).toBe(true);
    expect(
      syncLockIsActive(
        { ...base, syncLockUntil: "2026-10-28T00:00:30.000Z" },
        new Date("2026-10-28T00:01:00.000Z"),
      ),
    ).toBe(false);
    expect(syncLockIsActive({ ...base, status: "connected" })).toBe(false);
  });

  it("reports setup blockers by name only", async () => {
    expect(await brokerSetupState(brokerEnv())).toEqual({
      ready: false,
      issues: ["BROKER_STORE"],
    });

    const { env } = envWithKv();
    expect(await brokerSetupState(env)).toEqual({ ready: true, issues: [] });
  });

  it("builds a callback origin from configuration, rejecting unsafe schemes", async () => {
    const request = new Request("https://preview-abc.zenfolio.pages.dev/api/brokers/providers");
    expect(publicOrigin(brokerEnv(), request)).toBe("https://zenfolio.pages.dev");
    expect(publicOrigin(brokerEnv({ BROKER_PUBLIC_ORIGIN: "https://example.com/" }), request)).toBe(
      "https://example.com",
    );
    expect(publicOrigin(brokerEnv({ BROKER_PUBLIC_ORIGIN: "http://example.com" }), request)).toBe(
      "https://preview-abc.zenfolio.pages.dev",
    );
    expect(publicOrigin(brokerEnv({ BROKER_PUBLIC_ORIGIN: "http://localhost:8788" }), request)).toBe(
      "http://localhost:8788",
    );
  });

  it("fails closed without the KV binding", async () => {
    const env = brokerEnv();
    await expect(getConnectionRecord(env, "user-1", "a")).rejects.toBeInstanceOf(BrokerError);
  });
});
