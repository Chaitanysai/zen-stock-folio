import type { Env } from "../../_lib/types.ts";
import { makeEnv } from "../../_lib/testHelpers.ts";
import type { BrokerConnectionRecord } from "./store.ts";

/** Deterministic helpers for the broker Function suites (not a runtime import). */

export const base64Key = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export interface MemoryKv {
  get(key: string, type?: string): Promise<unknown>;
  put(key: string, value: string, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }>;
}

/** In-memory KVNamespace stand-in. Values are stored as the JSON/text written. */
export const memoryKv = (initial: Record<string, string> = {}) => {
  const values = new Map<string, string>(Object.entries(initial));
  const kv: MemoryKv = {
    get: async (key, type) => {
      const raw = values.get(key);
      if (raw === undefined) return null;
      if (type === "json") {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return raw;
    },
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
    list: async (options = {}) => {
      const prefix = options.prefix ?? "";
      return {
        keys: [...values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      };
    },
  };
  return { kv, values };
};

export const brokerEnv = (over: Record<string, unknown> = {}): Env =>
  makeEnv({
    BROKER_CREDENTIALS_KEYS: JSON.stringify({ "1": base64Key() }),
    BROKER_PUBLIC_ORIGIN: "https://zenfolio.pages.dev",
    ...over,
  }) as Env;

export const connectionRecord = (
  over: Partial<BrokerConnectionRecord> = {},
): BrokerConnectionRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  uid: "user-1",
  provider: "zerodha",
  method: "oauth",
  displayName: "Zerodha account",
  status: "connected",
  permissions: ["read:holdings"],
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  lastTestedAt: null,
  lastSuccessfulSyncAt: null,
  tokenExpiresAt: null,
  lastErrorCode: null,
  disconnectedAt: null,
  lastSync: null,
  syncLockUntil: null,
  ...over,
});
