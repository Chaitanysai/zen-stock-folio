import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "../firebase/firestore";
import type { BrokerConnection, BrokerConnectionPayload } from "./types";

/**
 * Browser access to the caller's sealed broker connection.
 *
 * Layout (owner-only, enforced by firestore.rules):
 *   users/{uid}/private/brokerConnection
 *     -> { uid, provider, ciphertext, iv, keyVersion, expiresAt, syncedAt, updatedAt }
 *
 * Only sealed material is stored; the plaintext broker token never reaches the
 * browser. A present-but-malformed or foreign document is treated as absent,
 * because the path is already the caller's own — there is nothing to leak and
 * nothing worth overwriting. A failed read is reported as an error so the UI
 * never confuses "offline" with "not linked".
 */

const USERS_COLLECTION = "users";
const PRIVATE_COLLECTION = "private";
const BROKER_CONNECTION_DOC = "brokerConnection";

const MAX_CIPHERTEXT_CHARS = 8192;
const MAX_IV_CHARS = 64;

export type LoadBrokerConnectionResult =
  | { status: "ok"; connection: BrokerConnection | null }
  | { status: "error"; error: string };

const firestoreErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const connectionRef = (uid: string) =>
  doc(getFirebaseDb(), USERS_COLLECTION, uid, PRIVATE_COLLECTION, BROKER_CONNECTION_DOC);

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const isSealedMaterial = (value: unknown): value is BrokerConnectionPayload => {
  if (!value || typeof value !== "object") return false;
  const payload = value as BrokerConnectionPayload;
  return (
    payload.keyVersion === 1 &&
    typeof payload.ciphertext === "string" &&
    payload.ciphertext.length > 0 &&
    payload.ciphertext.length <= MAX_CIPHERTEXT_CHARS &&
    typeof payload.iv === "string" &&
    payload.iv.length > 0 &&
    payload.iv.length <= MAX_IV_CHARS &&
    isTimestamp(payload.expiresAt)
  );
};

const parseConnection = (uid: string, value: unknown): BrokerConnection | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;

  if (data.uid !== uid || data.provider !== "indmoney") return null;
  if (typeof data.ciphertext !== "string") return null;
  if (!data.ciphertext || data.ciphertext.length > MAX_CIPHERTEXT_CHARS) return null;
  if (typeof data.iv !== "string" || !data.iv || data.iv.length > MAX_IV_CHARS) return null;
  if (data.keyVersion !== 1) return null;
  if (!isTimestamp(data.expiresAt)) return null;

  // Documents written before Task 18 may predate `syncedAt`; a missing value
  // means "never synced", not "not connected". Only a present, non-null value
  // must parse.
  const rawSyncedAt = data.syncedAt;
  let syncedAt: string | null = null;
  if (rawSyncedAt !== undefined && rawSyncedAt !== null) {
    if (!isTimestamp(rawSyncedAt)) return null;
    syncedAt = rawSyncedAt;
  }

  return {
    provider: "indmoney",
    ciphertext: data.ciphertext,
    iv: data.iv,
    keyVersion: 1,
    expiresAt: data.expiresAt,
    syncedAt,
  };
};

export const loadBrokerConnection = async (uid: string): Promise<LoadBrokerConnectionResult> => {
  try {
    const snap = await getDoc(connectionRef(uid));
    if (!snap.exists()) return { status: "ok", connection: null };
    return { status: "ok", connection: parseConnection(uid, snap.data()) };
  } catch (error) {
    return { status: "error", error: firestoreErrorMessage(error, "Could not read the broker connection.") };
  }
};

export const saveBrokerConnection = async (
  uid: string,
  payload: BrokerConnectionPayload,
): Promise<string | null> => {
  if (!isSealedMaterial(payload)) {
    return "The broker returned an invalid connection. Link the account again.";
  }

  try {
    await setDoc(connectionRef(uid), {
      uid,
      provider: "indmoney",
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      keyVersion: 1,
      expiresAt: payload.expiresAt,
      syncedAt: null,
      updatedAt: serverTimestamp(),
    });
    return null;
  } catch (error) {
    return firestoreErrorMessage(error, "Could not save the broker connection.");
  }
};

export const markBrokerSynced = async (uid: string, syncedAt: string): Promise<string | null> => {
  if (!isTimestamp(syncedAt)) return "Invalid sync timestamp.";

  try {
    await updateDoc(connectionRef(uid), { syncedAt, updatedAt: serverTimestamp() });
    return null;
  } catch (error) {
    return firestoreErrorMessage(error, "Could not record the sync.");
  }
};

export const clearBrokerConnection = async (uid: string): Promise<string | null> => {
  try {
    await deleteDoc(connectionRef(uid));
    return null;
  } catch (error) {
    return firestoreErrorMessage(error, "Could not unlink the broker connection.");
  }
};
