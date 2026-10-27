import { errorResponse, jsonResponse } from "./http";
import type { Env } from "./types";

/**
 * Firebase ID-token verification — THE identity boundary for every function.
 *
 * Implementation: Google's Identity Toolkit `accounts:lookup` REST endpoint
 * (Workers-compatible, no Admin SDK, no Node crypto). Swapping this to local
 * JWT verification (or any other provider) touches only this file.
 *
 * Fail-closed everywhere: a missing/invalid token is 401; a server
 * misconfiguration (no API key) or verification outage is 5xx — never an
 * accidental allow.
 */

const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

export interface RequestIdentity {
  uid: string;
  /**
   * Firebase's own verification flag. Supabase never issued a session to an
   * unconfirmed account, so the Firebase path must refuse the equivalent
   * request explicitly — otherwise an unverified sign-up could consume the
   * authenticated (paid, rate-limited) API surface while the UI treats it as
   * signed out.
   */
  emailVerified: boolean;
}

/** Small per-isolate cache: tokens live 1 h; caching the lookup for 5 min
 * cuts one Google round-trip per call without extending token trust. */
const lookupCache = new Map<string, { uid: string; emailVerified: boolean; expiresAt: number }>();
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKUP_CACHE_MAX = 1000;

const cacheGet = (token: string): { uid: string; emailVerified: boolean } | null => {
  const hit = lookupCache.get(token);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    lookupCache.delete(token);
    return null;
  }
  return { uid: hit.uid, emailVerified: hit.emailVerified };
};

const cacheSet = (token: string, uid: string, emailVerified: boolean): void => {
  if (lookupCache.size >= LOOKUP_CACHE_MAX) {
    const oldest = lookupCache.keys().next().value;
    if (oldest) lookupCache.delete(oldest);
  }
  lookupCache.set(token, { uid, emailVerified, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
};

const extractBearerToken = (request: Request): string | null => {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

/** Testing seam: overridable fetch for deterministic unit tests. */
let verifyFetch: typeof fetch = fetch;
export const setVerifyFetch = (fn: typeof fetch): void => {
  verifyFetch = fn;
};
export const resetVerifyFetch = (): void => {
  verifyFetch = fetch;
};

export type IdentityResult =
  | { ok: true; identity: RequestIdentity }
  | { ok: false; response: Response };

export const requireIdentity = async (env: Env, request: Request): Promise<IdentityResult> => {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: errorResponse(env, request, 401, "Authentication required"),
    };
  }

  if (!env.FIREBASE_API_KEY) {
    // Fail closed — never fall back to unauthenticated handling.
    return {
      ok: false,
      response: errorResponse(env, request, 503, "Authentication is temporarily unavailable"),
    };
  }

  const cached = cacheGet(token);
  if (cached) return { ok: true, identity: cached };

  try {
    const res = await verifyFetch(`${LOOKUP_URL}?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        ok: false,
        response: errorResponse(env, request, 401, "Authentication required"),
      };
    }

    const body = (await res.json()) as {
      users?: Array<{ localId?: string; emailVerified?: boolean }>;
    };
    const user = body.users?.[0];
    const uid = user?.localId;
    if (!uid) {
      return {
        ok: false,
        response: errorResponse(env, request, 401, "Authentication required"),
      };
    }

    const identity: RequestIdentity = { uid, emailVerified: user?.emailVerified === true };
    cacheSet(token, identity.uid, identity.emailVerified);
    return { ok: true, identity };
  } catch {
    // Verification upstream unreachable — fail closed, but as an outage.
    return {
      ok: false,
      response: jsonResponse(env, request, { error: "Verification temporarily unavailable" }, 503),
    };
  }
};

/**
 * Identity + the app's email-verification gate.
 *
 * Google sign-in accounts are always verified; email/password accounts are
 * not until the confirmation link is opened. Refusing unverified identities
 * here restores the guarantee Supabase enforced by never issuing a session.
 */
export const requireVerifiedIdentity = async (env: Env, request: Request): Promise<IdentityResult> => {
  const result = await requireIdentity(env, request);
  if (!result.ok) return result;
  if (!result.identity.emailVerified) {
    return {
      ok: false,
      response: errorResponse(env, request, 403, "Email verification required"),
    };
  }
  return result;
};

/** Test seam: clear the per-isolate lookup cache. */
export const clearIdentityCache = (): void => lookupCache.clear();
