import type {
  BrokerConnectionMethod,
  BrokerConnectionPublic,
  BrokerConnectionStatus,
  BrokerErrorCode,
  BrokerProviderId,
  BrokerSyncSummary,
} from "../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../_lib/types.ts";
import type { EncryptedCredentials } from "./crypto.ts";
import { credentialEncryptionReady } from "./crypto.ts";
import { BrokerError } from "./errors.ts";

/**
 * Server-only broker state in KV.
 *
 * Layout:
 *   conn:{uid}:{id}          connection metadata (never credentials)
 *   cred:{uid}:{id}          AES-GCM envelope (never returned to a client)
 *   state:{hash}             one-time authorization state (10 min TTL)
 *   stateused:{hash}         replay marker (10 min TTL)
 *   sync:{uid}:{id}:latest   last sync summary (30 day TTL, no records)
 *   seen:{uid}:{id}          dedupe fingerprints for the connection
 *
 * Every key is namespaced by the verified uid. Reads also compare the record's
 * own uid so a copied key cannot cross accounts.
 */

export interface BrokerConnectionRecord {
  id: string;
  uid: string;
  provider: BrokerProviderId;
  method: BrokerConnectionMethod;
  displayName: string;
  status: BrokerConnectionStatus;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  tokenExpiresAt: string | null;
  lastErrorCode: BrokerErrorCode | null;
  disconnectedAt: string | null;
  lastSync: BrokerSyncSummary | null;
  /** Stale after two minutes so a crashed sync cannot block forever. */
  syncLockUntil: string | null;
}

export interface AuthorizationStateRecord {
  uid: string;
  provider: BrokerProviderId;
  connectionId: string;
  createdAt: string;
  expiresAt: string;
}

export interface BrokerLedger {
  entries: Record<string, string>;
}

const CONN_PREFIX = "conn:";
const CRED_PREFIX = "cred:";
const STATE_PREFIX = "state:";
const STATE_USED_PREFIX = "stateused:";
const SYNC_PREFIX = "sync:";
const SEEN_PREFIX = "seen:";

const STATE_TTL_SECONDS = 10 * 60;
const SYNC_TTL_SECONDS = 30 * 24 * 60 * 60;
const LEDGER_MAX_ENTRIES = 5000;

const kv = (env: Env): KVNamespace => {
  if (!env.BROKER_STORE) {
    throw new BrokerError("setup_required", "BROKER_STORE binding is not configured");
  }
  return env.BROKER_STORE;
};

const getJson = async <T>(env: Env, key: string): Promise<T | null> => {
  const value = await kv(env).get(key, "json");
  return (value as T | null) ?? null;
};

const putJson = async (
  env: Env,
  key: string,
  value: unknown,
  expirationTtl?: number,
): Promise<void> => {
  await kv(env).put(key, JSON.stringify(value), expirationTtl ? { expirationTtl } : undefined);
};

export const brokerSetupState = async (
  env: Env,
): Promise<{ ready: boolean; issues: string[] }> => {
  const issues: string[] = [];
  if (!env.BROKER_STORE) issues.push("BROKER_STORE");
  if (!env.BROKER_CREDENTIALS_KEYS) {
    issues.push("BROKER_CREDENTIALS_KEYS");
  } else if (!(await credentialEncryptionReady(env))) {
    issues.push("BROKER_CREDENTIALS_KEYS");
  }
  if (!env.BROKER_PUBLIC_ORIGIN) issues.push("BROKER_PUBLIC_ORIGIN");
  return { ready: issues.length === 0, issues };
};

export const publicOrigin = (env: Env, request: Request): string => {
  const configured = env.BROKER_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.hostname === "localhost") return url.origin;
    } catch {
      // fall through to the request origin below
    }
  }
  return new URL(request.url).origin;
};

export const callbackUrl = (env: Env, request: Request, provider: BrokerProviderId): string =>
  `${publicOrigin(env, request)}/api/brokers/callback/${provider}`;

const connectionKey = (uid: string, id: string) => `${CONN_PREFIX}${uid}:${id}`;
const credentialKey = (uid: string, id: string) => `${CRED_PREFIX}${uid}:${id}`;
const syncKey = (uid: string, id: string) => `${SYNC_PREFIX}${uid}:${id}:latest`;
const ledgerKey = (uid: string, id: string) => `${SEEN_PREFIX}${uid}:${id}`;

export const newConnectionId = (): string => crypto.randomUUID();

export const getConnectionRecord = async (
  env: Env,
  uid: string,
  id: string,
): Promise<BrokerConnectionRecord | null> => {
  const record = await getJson<BrokerConnectionRecord>(env, connectionKey(uid, id));
  if (!record || record.uid !== uid || record.id !== id) return null;
  return record;
};

/** Cross-account reads return null, not 403, to avoid connection enumeration. */
export const requireConnectionRecord = async (
  env: Env,
  uid: string,
  id: string,
): Promise<BrokerConnectionRecord> => {
  const record = await getConnectionRecord(env, uid, id);
  if (!record) throw new BrokerError("not_found");
  return record;
};

export const putConnectionRecord = async (
  env: Env,
  record: BrokerConnectionRecord,
): Promise<void> => {
  await putJson(env, connectionKey(record.uid, record.id), record);
};

export const listConnectionRecords = async (
  env: Env,
  uid: string,
): Promise<BrokerConnectionRecord[]> => {
  const listed = await kv(env).list({ prefix: `${CONN_PREFIX}${uid}:` });
  const records: BrokerConnectionRecord[] = [];
  for (const key of listed.keys) {
    const record = await getJson<BrokerConnectionRecord>(env, key.name);
    if (record && record.uid === uid) records.push(record);
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const putCredentialEnvelope = async (
  env: Env,
  uid: string,
  id: string,
  envelope: EncryptedCredentials,
): Promise<void> => {
  await putJson(env, credentialKey(uid, id), envelope);
};

export const getCredentialEnvelope = async (
  env: Env,
  uid: string,
  id: string,
): Promise<EncryptedCredentials | null> => {
  return getJson<EncryptedCredentials>(env, credentialKey(uid, id));
};

export const requireCredentialEnvelope = async (
  env: Env,
  uid: string,
  id: string,
): Promise<EncryptedCredentials> => {
  const envelope = await getCredentialEnvelope(env, uid, id);
  if (!envelope) throw new BrokerError("authentication_expired", "Credentials are missing");
  return envelope;
};

export const deleteCredentialEnvelope = async (
  env: Env,
  uid: string,
  id: string,
): Promise<void> => {
  await kv(env).delete(credentialKey(uid, id));
};

export const putAuthorizationState = async (
  env: Env,
  hash: string,
  record: AuthorizationStateRecord,
): Promise<void> => {
  await putJson(env, `${STATE_PREFIX}${hash}`, record, STATE_TTL_SECONDS);
};

/**
 * Reads and consumes a state record. Deletion happens before the caller does
 * any network work, so a repeated callback finds only the replay marker.
 */
export const takeAuthorizationState = async (
  env: Env,
  hash: string,
  now: Date = new Date(),
): Promise<AuthorizationStateRecord> => {
  const key = `${STATE_PREFIX}${hash}`;
  const record = await getJson<AuthorizationStateRecord>(env, key);
  if (!record) {
    const used = await getJson<{ usedAt: string }>(env, `${STATE_USED_PREFIX}${hash}`);
    throw new BrokerError(used ? "state_reused" : "state_invalid");
  }
  await kv(env).delete(key);
  if (Date.parse(record.expiresAt) <= now.getTime()) {
    throw new BrokerError("state_expired");
  }
  await putJson(env, `${STATE_USED_PREFIX}${hash}`, { usedAt: now.toISOString() }, STATE_TTL_SECONDS);
  return record;
};

export const putSyncSummary = async (
  env: Env,
  uid: string,
  id: string,
  summary: BrokerSyncSummary,
): Promise<void> => {
  await putJson(env, syncKey(uid, id), summary, SYNC_TTL_SECONDS);
};

export const getSyncSummary = async (
  env: Env,
  uid: string,
  id: string,
): Promise<BrokerSyncSummary | null> => getJson<BrokerSyncSummary>(env, syncKey(uid, id));

export const getLedger = async (
  env: Env,
  uid: string,
  id: string,
): Promise<BrokerLedger> => {
  const ledger = await getJson<BrokerLedger>(env, ledgerKey(uid, id));
  return ledger && typeof ledger.entries === "object" && ledger.entries !== null
    ? ledger
    : { entries: {} };
};

export const putLedger = async (
  env: Env,
  uid: string,
  id: string,
  ledger: BrokerLedger,
): Promise<void> => {
  const names = Object.keys(ledger.entries);
  if (names.length > LEDGER_MAX_ENTRIES) {
    for (const name of names.slice(0, names.length - LEDGER_MAX_ENTRIES)) {
      delete ledger.entries[name];
    }
  }
  await putJson(env, ledgerKey(uid, id), ledger);
};

export const syncLockIsActive = (
  record: BrokerConnectionRecord,
  now: Date = new Date(),
): boolean => {
  if (record.status !== "syncing" || !record.syncLockUntil) return false;
  const until = Date.parse(record.syncLockUntil);
  return !Number.isNaN(until) && until > now.getTime();
};

export const toPublicConnection = (record: BrokerConnectionRecord): BrokerConnectionPublic => ({
  id: record.id,
  provider: record.provider,
  method: record.method,
  displayName: record.displayName,
  status: record.status,
  permissions: record.permissions,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  lastTestedAt: record.lastTestedAt,
  lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
  tokenExpiresAt: record.tokenExpiresAt,
  lastErrorCode: record.lastErrorCode,
  disconnectedAt: record.disconnectedAt,
  lastSync: record.lastSync,
});
