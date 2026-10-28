import type { Env } from "../../_lib/types.ts";
import type { CredentialBundle } from "./crypto.ts";
import { decryptCredentials } from "./crypto.ts";
import { BrokerError } from "./errors.ts";
import { adapterFor } from "./providers/index.ts";
import type { BrokerConnectionRecord } from "./store.ts";
import { requireCredentialEnvelope } from "./store.ts";
import { tokenExpired } from "./time.ts";
import type { TokenResult } from "./adapter.ts";

/**
 * Decrypts a connection's credentials and refreshes the token once when it has
 * expired and the provider supports refresh. Kite has no refresh flow, so an
 * expired Kite token surfaces as `authentication_expired` (→ reauthorize).
 */
export const activeCredentials = async (
  env: Env,
  record: BrokerConnectionRecord,
  now: Date,
): Promise<{ credentials: CredentialBundle; refreshed: TokenResult | null }> => {
  const envelope = await requireCredentialEnvelope(env, record.uid, record.id);
  const stored = await decryptCredentials(
    env,
    { uid: record.uid, connectionId: record.id, provider: record.provider },
    envelope,
  );

  const missing = !stored.accessToken;
  const expired = tokenExpired(record.tokenExpiresAt, now);
  if (!missing && !expired) return { credentials: stored, refreshed: null };

  const adapter = adapterFor(record.provider);
  if (!adapter.refreshAccessToken) throw new BrokerError("authentication_expired");
  const refreshed = await adapter.refreshAccessToken({ env, credentials: stored, now });
  return {
    credentials: { ...stored, accessToken: refreshed.accessToken },
    refreshed,
  };
};
