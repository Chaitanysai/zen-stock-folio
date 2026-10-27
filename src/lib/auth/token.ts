/**
 * Returns the bearer token to attach to internal /api/* requests, or null when
 * there is no signed-in Firebase user.
 *
 * The Cloudflare Pages Functions verify Firebase ID tokens, so this is the only
 * credential the browser ever sends. There is no second backend to branch on.
 *
 * `getIdToken()` is intentionally called without `forceRefresh`: it returns the
 * cached token and transparently refreshes it when it is close to expiry, so
 * the 1 s price poll does not trigger a refresh round-trip per request.
 * Failures are swallowed — a missing token must never crash a UI action; the
 * server answers 401 and the caller's existing error handling takes over.
 */
export const getApiAuthToken = async (): Promise<string | null> => {
  try {
    // Dynamic import keeps the Firebase SDK out of the entry chunk.
    const { getFirebaseAuth } = await import("@/lib/firebase/auth");
    const user = getFirebaseAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};
