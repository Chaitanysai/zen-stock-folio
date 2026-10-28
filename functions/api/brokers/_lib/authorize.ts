import type { Env } from "../../_lib/types.ts";
import type { CredentialBundle } from "./crypto.ts";
import { BrokerError } from "./errors.ts";
import { adapterFor } from "./providers/index.ts";
import { createAuthorizationState, hashAuthorizationState } from "./state.ts";
import type { BrokerConnectionRecord } from "./store.ts";
import { callbackUrl, putAuthorizationState } from "./store.ts";

/**
 * Issues a one-time state value and the provider authorization URL. KV holds
 * only the SHA-256 hash of the state; the raw value travels to the provider.
 */
export const startAuthorization = async (
  env: Env,
  request: Request,
  record: BrokerConnectionRecord,
  credentials: CredentialBundle,
  now: Date,
): Promise<{ authorizationUrl: string; expiresAt: string; callbackUrl: string }> => {
  const adapter = adapterFor(record.provider);
  if (!adapter.beginAuthorization) throw new BrokerError("unsupported_method");

  const state = createAuthorizationState();
  const stateHash = await hashAuthorizationState(state);
  const start = await adapter.beginAuthorization(env, credentials, state, now);

  await putAuthorizationState(env, stateHash, {
    uid: record.uid,
    provider: record.provider,
    connectionId: record.id,
    createdAt: now.toISOString(),
    expiresAt: start.expiresAt,
  });

  return {
    authorizationUrl: start.authorizationUrl,
    expiresAt: start.expiresAt,
    callbackUrl: callbackUrl(env, request, record.provider),
  };
};
