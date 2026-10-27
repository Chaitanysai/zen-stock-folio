import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/firestore";
import { parseSnapshot } from "./parseSnapshot";
import type { PortfolioDataStore } from "./types";

/**
 * Firestore adapter.
 *
 * Layout (owner-only, enforced by firestore.rules):
 *   portfolios/{uid} -> { uid, snapshot, updatedAt }
 *   users/{uid}      -> { uid, displayName, updatedAt }
 *
 * The document ID IS the owner's uid, so ownership can never be re-pointed —
 * the Firestore analogue of the `WITH CHECK (auth.uid() = user_id)` clause in
 * the Supabase RLS policy. Rules additionally require
 * request.auth.uid == uid and data.uid == uid on every write, and the uid
 * equality checks below are client-side defence-in-depth.
 *
 * Read semantics: a thrown read (offline, permission denied, expired token of
 * a signed-out session) returns status "error" so the caller never mistakes
 * it for an empty account. A present-but-foreign or structurally invalid
 * document is treated as absent: it is the caller's own document id, so there
 * is nothing to leak and nothing to overwrite on another user.
 *
 * saveSnapshot overwrites the caller's OWN document — the live app's existing
 * upsert semantics. (The "never overwrite without explicit conflict policy"
 * rule applies to the migration importer, a separate tool.)
 */
export const PORTFOLIOS_COLLECTION = "portfolios";
export const USERS_COLLECTION = "users";

const firestoreErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Cloud sync failed";

export const firestorePortfolioStore: PortfolioDataStore = {
  name: "firestore",

  async loadSnapshot(userId) {
    try {
      const snap = await getDoc(doc(getFirebaseDb(), PORTFOLIOS_COLLECTION, userId));
      if (!snap.exists()) return { status: "ok", snapshot: null };

      const data = snap.data();
      if (data?.uid !== userId) return { status: "ok", snapshot: null };

      return { status: "ok", snapshot: parseSnapshot(data.snapshot) };
    } catch (error) {
      return { status: "error", error: firestoreErrorMessage(error) };
    }
  },

  async saveSnapshot(userId, snapshot) {
    try {
      await setDoc(doc(getFirebaseDb(), PORTFOLIOS_COLLECTION, userId), {
        uid: userId,
        snapshot,
        updatedAt: serverTimestamp(),
      });
      return null;
    } catch (error) {
      return firestoreErrorMessage(error);
    }
  },

  async loadDisplayName(userId) {
    try {
      const snap = await getDoc(doc(getFirebaseDb(), USERS_COLLECTION, userId));
      if (!snap.exists()) return null;

      const data = snap.data();
      if (data?.uid !== userId) return null;
      return typeof data.displayName === "string" ? data.displayName : null;
    } catch {
      return null;
    }
  },

  async saveDisplayName(userId, displayName) {
    try {
      await setDoc(
        doc(getFirebaseDb(), USERS_COLLECTION, userId),
        { uid: userId, displayName, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return null;
    } catch (error) {
      return firestoreErrorMessage(error);
    }
  },
};
