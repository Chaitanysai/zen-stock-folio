import type { PortfolioSnapshot } from "./snapshotTypes";

/**
 * Cloud storage surface for user data, implemented by the Firestore adapter.
 *
 * Method semantics mirror the original usePortfolioSync cloud helpers, with
 * ONE deliberate difference: a failed read is reported as a failure, not as
 * "no data". Conflating the two lets a transient network/permission error look
 * like an empty account, after which the first edit would overwrite the real
 * cloud snapshot with a local (possibly empty) cache. `LoadSnapshotResult`
 * makes that distinction explicit so callers can fail closed.
 *
 * Implementations MUST scope every operation by the caller's userId and the
 * backend MUST enforce ownership (Firestore security rules) with the uid check
 * duplicated in the adapter as client-side defence-in-depth.
 */
export type DataProviderName = "firestore";

export type LoadSnapshotResult =
  | { status: "ok"; snapshot: PortfolioSnapshot | null }
  | { status: "error"; error: string };

export interface PortfolioDataStore {
  readonly name: DataProviderName;
  loadSnapshot(userId: string): Promise<LoadSnapshotResult>;
  saveSnapshot(userId: string, snapshot: PortfolioSnapshot): Promise<string | null>;
  loadDisplayName(userId: string): Promise<string | null>;
  saveDisplayName(userId: string, displayName: string): Promise<string | null>;
}
