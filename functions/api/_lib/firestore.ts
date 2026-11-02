import type { PortfolioSnapshot } from "../../../src/lib/data/snapshotTypes.ts";
import type { Env } from "./types";

/**
 * Firestore REST v1, authenticated with the CALLER's Firebase ID token.
 *
 * No service account and no Admin SDK: security rules therefore run as the
 * signed-in user, which is the ownership check for every sync write. The
 * browser still owns all non-sync writes; this module only exists so a Pages
 * Function can read the snapshot it is about to replace and write the merged
 * one under a compare-and-set precondition.
 */

const ORIGIN = "https://firestore.googleapis.com/v1";
const TIMEOUT_MS = 8000;

/**
 * Firestore caps one document at 1 MiB. The write payload is an upper bound on
 * the encoded document (it wraps it), so refusing a payload at the cap can
 * never let an oversized document through.
 */
const MAX_WRITE_PAYLOAD_BYTES = 1_048_576;

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { referenceValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

/** Stable failure codes for callers that branch on the reason. */
export type FirestoreErrorCode = "invalid_uid" | "invalid_input" | "invalid_response" | "too_large";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Firestore cannot store a non-finite number");
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  throw new Error("Unsupported Firestore value");
}

export function encodeFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return fields;
}

/**
 * Marker for a numeric field the strict decoder refuses. Kept internal: the
 * public codec stays total, while document reads propagate it as a typed
 * `invalid_response` so a corrupt number can never reach `commitSnapshot`,
 * which would otherwise throw on the non-finite value.
 */
const INVALID = Symbol("firestore.invalid");

const decodeNumber = (raw: unknown, kind: "integer" | "double"): number | typeof INVALID => {
  if (kind === "integer") {
    if (typeof raw !== "string" || raw.trim() === "") return INVALID;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : INVALID;
  }
  return typeof raw === "number" && Number.isFinite(raw) ? raw : INVALID;
};

function decodeValueStrict(value: unknown): unknown {
  if (!isRecord(value)) return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return decodeNumber(value.integerValue, "integer");
  if ("doubleValue" in value) return decodeNumber(value.doubleValue, "double");
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) {
    const arrayValue = value.arrayValue;
    if (!isRecord(arrayValue)) return null;
    if (arrayValue.values === undefined) return [];
    if (!Array.isArray(arrayValue.values)) return null;
    const out: unknown[] = [];
    for (const entry of arrayValue.values) {
      const decoded = decodeValueStrict(entry);
      if (decoded === INVALID) return INVALID;
      out.push(decoded);
    }
    return out;
  }
  if ("mapValue" in value) {
    const mapValue = value.mapValue;
    if (!isRecord(mapValue)) return null;
    return decodeFieldsStrict(mapValue.fields);
  }
  return null;
}

function decodeFieldsStrict(fields: unknown): Record<string, unknown> | typeof INVALID {
  if (!isRecord(fields)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const decoded = decodeValueStrict(value);
    if (decoded === INVALID) return INVALID;
    out[key] = decoded;
  }
  return out;
}

/**
 * Decodes a Firestore REST value. Total by design: a malformed or unknown
 * shape decodes to `null` rather than throwing, so upstream/CORS proxies that
 * return unexpected JSON cannot crash the function. A corrupt numeric value
 * decodes to `null`, never `NaN`.
 */
export function decodeValue(value: unknown): unknown {
  const decoded = decodeValueStrict(value);
  return decoded === INVALID ? null : decoded;
}

/** Total counterpart of {@link decodeValue}: non-object input decodes to `{}`. */
export function decodeFields(fields: unknown): Record<string, unknown> {
  const decoded = decodeFieldsStrict(fields);
  return decoded === INVALID ? {} : decoded;
}

const documentsBase = (projectId: string) =>
  `${ORIGIN}/projects/${projectId}/databases/(default)/documents`;

const portfolioPath = (projectId: string, uid: string) =>
  `projects/${projectId}/databases/(default)/documents/portfolios/${uid}`;

const isPortfolioShape = (value: unknown): value is PortfolioSnapshot => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<PortfolioSnapshot>;
  return Array.isArray(row.stocks)
    && Array.isArray(row.trades)
    && Array.isArray(row.watchlist)
    && Array.isArray(row.alerts);
};

export type PortfolioRead =
  | { status: "ok"; snapshot: PortfolioSnapshot | null; updateTime: string | null }
  | { status: "error"; snapshot: null; updateTime: null; error: string; code?: FirestoreErrorCode };

const malformedRead = (): PortfolioRead => ({
  status: "error",
  snapshot: null,
  updateTime: null,
  error: "Firestore returned malformed data",
  code: "invalid_response",
});

export async function readPortfolio(
  env: Env,
  uid: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PortfolioRead> {
  if (!env.FIREBASE_PROJECT_ID) {
    return { status: "error", snapshot: null, updateTime: null, error: "Firestore project is not configured" };
  }
  if (!UID_PATTERN.test(uid)) {
    // A uid with `/` (or any other unexpected character) would relocate the
    // document path, so fail closed before touching the network.
    return { status: "error", snapshot: null, updateTime: null, error: "Invalid portfolio id", code: "invalid_uid" };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${documentsBase(env.FIREBASE_PROJECT_ID)}/portfolios/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: "error", snapshot: null, updateTime: null, error: "Firestore is unreachable" };
  }

  if (response.status === 404) return { status: "ok", snapshot: null, updateTime: null };
  if (!response.ok) {
    return { status: "error", snapshot: null, updateTime: null, error: `Firestore read failed (${response.status})` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return malformedRead();
  }
  if (!isRecord(body)) return malformedRead();
  if (!isRecord(body.fields)) return malformedRead();
  if (body.updateTime !== undefined && typeof body.updateTime !== "string") return malformedRead();

  const fields = decodeFieldsStrict(body.fields);
  if (fields === INVALID) return malformedRead();
  const updateTime = typeof body.updateTime === "string" ? body.updateTime : null;
  if (fields.uid !== uid) {
    // The document id is the owner's uid, so a foreign uid means the backend or
    // rules are misconfigured. Refuse to sync rather than overwrite anything.
    return { status: "error", snapshot: null, updateTime: null, error: "Stored portfolio belongs to another account" };
  }
  if (!isPortfolioShape(fields.snapshot)) {
    return { status: "error", snapshot: null, updateTime: null, error: "Stored portfolio is malformed", code: "invalid_response" };
  }
  if (updateTime === null || updateTime.length === 0) {
    // Without a version a consumer would send `{ exists: false }` for an
    // existing document and conflict forever, so fail closed.
    return malformedRead();
  }

  const snapshot: PortfolioSnapshot = {
    stocks: fields.snapshot.stocks,
    trades: fields.snapshot.trades,
    watchlist: fields.snapshot.watchlist,
    alerts: fields.snapshot.alerts,
    fnoTrades: Array.isArray(fields.snapshot.fnoTrades) ? fields.snapshot.fnoTrades : [],
    executions: Array.isArray(fields.snapshot.executions) ? fields.snapshot.executions : [],
  };
  return { status: "ok", snapshot, updateTime };
}

export type SnapshotPrecondition = { updateTime: string } | { exists: false };

export interface CommitResult {
  ok: boolean;
  updateTime: string | null;
  conflict?: boolean;
  error?: string;
  code?: FirestoreErrorCode;
}

const malformedCommit = (): CommitResult => ({
  ok: false,
  updateTime: null,
  error: "Firestore returned malformed data",
  code: "invalid_response",
});

export async function commitSnapshot(
  env: Env,
  uid: string,
  token: string,
  snapshot: PortfolioSnapshot,
  precondition: SnapshotPrecondition,
  fetchImpl: typeof fetch = fetch,
): Promise<CommitResult> {
  if (!env.FIREBASE_PROJECT_ID) {
    return { ok: false, updateTime: null, error: "Firestore project is not configured" };
  }
  if (!UID_PATTERN.test(uid)) {
    return { ok: false, updateTime: null, error: "Invalid portfolio id", code: "invalid_uid" };
  }

  let payload: string;
  try {
    const write = {
      update: {
        name: portfolioPath(env.FIREBASE_PROJECT_ID, uid),
        fields: encodeFields({ uid, snapshot }),
      },
      updateMask: { fieldPaths: ["uid", "snapshot"] },
      updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: precondition,
    };
    payload = JSON.stringify({ writes: [write] });
  } catch {
    // Encoding is not total (`encodeValue` rejects non-finite numbers and
    // unsupported values), so turn it into a typed failure before the fetch.
    return {
      ok: false,
      updateTime: null,
      error: "Portfolio contains a value Firestore cannot store",
      code: "invalid_input",
    };
  }

  if (new TextEncoder().encode(payload).byteLength > MAX_WRITE_PAYLOAD_BYTES) {
    return {
      ok: false,
      updateTime: null,
      error: "Portfolio exceeds Firestore's document size limit",
      code: "too_large",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${documentsBase(env.FIREBASE_PROJECT_ID)}:commit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, updateTime: null, error: "Firestore is unreachable" };
  }

  if (response.status === 409) return { ok: false, updateTime: null, conflict: true };
  if (response.status === 400 || response.status === 412) {
    const text = await response.text().catch(() => "");
    if (response.status === 412 || text.includes("FAILED_PRECONDITION")) {
      return { ok: false, updateTime: null, conflict: true };
    }
    return { ok: false, updateTime: null, error: "Firestore rejected the write" };
  }
  if (!response.ok) {
    return { ok: false, updateTime: null, error: `Firestore write failed (${response.status})` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return malformedCommit();
  }
  if (!isRecord(body) || !Array.isArray(body.writeResults) || body.writeResults.length === 0) {
    return malformedCommit();
  }
  const first = body.writeResults[0];
  if (!isRecord(first) || typeof first.updateTime !== "string" || first.updateTime.length === 0) {
    // A 200 without a version is not a success: we cannot prove the write was
    // applied and the next compare-and-set has no updateTime to send.
    return malformedCommit();
  }
  return { ok: true, updateTime: first.updateTime };
}
