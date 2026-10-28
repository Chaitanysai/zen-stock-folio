/**
 * Authorization state.
 *
 * The raw value goes to the provider (Kite's `redirect_params`); KV stores only
 * its SHA-256 hash, so a KV dump cannot be replayed against the callback.
 */

export const STATE_TTL_MS = 10 * 60 * 1000;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const createAuthorizationState = (): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const hashAuthorizationState = async (state: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return toHex(new Uint8Array(digest));
};

/** Constant-time comparison for short opaque values (e.g. provider tokens). */
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};
