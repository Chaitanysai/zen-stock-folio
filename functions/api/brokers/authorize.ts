import type { BrokerAuthorizeResponse } from "../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, requireBrokerUser } from "./_lib/access.ts";
import { startAuthorization } from "./_lib/authorize.ts";
import { decryptCredentials } from "./_lib/crypto.ts";
import { BrokerError } from "./_lib/errors.ts";
import { adapterFor } from "./_lib/providers/index.ts";
import { authorizeSchema, readValidatedBody } from "./_lib/schemas.ts";
import { canTransition, withStatus } from "./_lib/stateMachine.ts";
import {
  putConnectionRecord,
  requireConnectionRecord,
  requireCredentialEnvelope,
} from "./_lib/store.ts";
import { handleOptions, jsonResponse } from "../_lib/http.ts";
import type { PagesHandler } from "../_lib/types.ts";

const AUTH_STARTABLE = new Set([
  "pending_credentials",
  "pending_authorization",
  "reauthorization_required",
  "permission_required",
  "error",
]);

/**
 * POST /api/brokers/authorize — issues a fresh one-time state and login URL.
 * A previous pending authorization is simply superseded: only the newest
 * state exists in KV, so an older callback is rejected as invalid.
 */
export const onRequestPost: PagesHandler = async ({ request, env }) =>
  handleBrokerRoute(env, request, "authorize.start", async () => {
    const access = await requireBrokerUser(env, request, "brokerAuthorize");
    if (!access.ok) return access.response;

    const parsed = await readValidatedBody(env, request, authorizeSchema);
    if (!parsed.ok) return parsed.response;

    const record = await requireConnectionRecord(env, access.uid, parsed.data.connectionId);
    if (!AUTH_STARTABLE.has(record.status)) throw new BrokerError("conflict");
    if (!adapterFor(record.provider).beginAuthorization) throw new BrokerError("unsupported_method");

    const now = new Date();
    const envelope = await requireCredentialEnvelope(env, record.uid, record.id);
    const credentials = await decryptCredentials(
      env,
      { uid: record.uid, connectionId: record.id, provider: record.provider },
      envelope,
    );
    const authorization = await startAuthorization(env, request, record, credentials, now);

    let next = record;
    if (record.status !== "pending_authorization") {
      if (canTransition(record.status, "reauthorization_required")) {
        next = withStatus(record, "reauthorization_required", now, { lastErrorCode: null });
      }
      next = withStatus(next, "pending_authorization", now, { lastErrorCode: null });
    }
    await putConnectionRecord(env, next);

    const body: BrokerAuthorizeResponse = {
      authorizationUrl: authorization.authorizationUrl,
      expiresAt: authorization.expiresAt,
      callbackUrl: authorization.callbackUrl,
    };
    return jsonResponse(env, request, body);
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
