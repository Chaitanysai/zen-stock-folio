import type {
  BrokerSyncStatusResponse,
  BrokerUpdateResponse,
} from "../../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, paramValue, requireBrokerUser } from "../_lib/access.ts";
import { startAuthorization } from "../_lib/authorize.ts";
import { encryptCredentials } from "../_lib/crypto.ts";
import { BrokerError } from "../_lib/errors.ts";
import { adapterFor } from "../_lib/providers/index.ts";
import { connectionIdSchema, readValidatedBody, updateConnectionSchema } from "../_lib/schemas.ts";
import { canTransition, withStatus } from "../_lib/stateMachine.ts";
import {
  deleteCredentialEnvelope,
  getSyncSummary,
  putConnectionRecord,
  putCredentialEnvelope,
  requireConnectionRecord,
  syncLockIsActive,
  toPublicConnection,
} from "../_lib/store.ts";
import { handleOptions, jsonResponse } from "../../_lib/http.ts";
import type { PagesHandler } from "../../_lib/types.ts";

const idFrom = (params: Record<string, string | string[] | undefined>): string => {
  const parsed = connectionIdSchema.safeParse(paramValue(params.id));
  if (!parsed.success) throw new BrokerError("not_found");
  return parsed.data;
};

/** GET /api/brokers/connections/:id — connection plus last sync summary. */
export const onRequestGet: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.get", async () => {
    const access = await requireBrokerUser(env, request, "brokerRead");
    if (!access.ok) return access.response;

    const record = await requireConnectionRecord(env, access.uid, idFrom(params));
    const report = record.lastSync ?? (await getSyncSummary(env, access.uid, record.id));
    const body: BrokerSyncStatusResponse = { connection: toPublicConnection(record), report };
    return jsonResponse(env, request, body);
  });

/**
 * PATCH /api/brokers/connections/:id
 *
 * A replacement secret is validated before it is stored. For Kite a new app
 * secret also invalidates the old token, so the connection drops back to
 * `pending_authorization` and the caller receives a fresh login URL.
 */
export const onRequestPatch: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.update", async () => {
    const access = await requireBrokerUser(env, request, "brokerWrite");
    if (!access.ok) return access.response;

    const parsed = await readValidatedBody(env, request, updateConnectionSchema);
    if (!parsed.ok) return parsed.response;
    const { displayName, apiKey, apiSecret } = parsed.data;

    let record = await requireConnectionRecord(env, access.uid, idFrom(params));
    if (record.status === "disconnected") throw new BrokerError("connection_not_connected");
    if (syncLockIsActive(record)) throw new BrokerError("sync_in_progress");

    const now = new Date();
    if (displayName !== undefined) {
      record = withStatus(record, record.status, now, { displayName });
    }

    if (apiKey !== undefined && apiSecret !== undefined) {
      const adapter = adapterFor(record.provider);
      const credentials = { apiKey, apiSecret };

      if (record.method === "api_keys") {
        if (!adapter.validateCredentials) throw new BrokerError("unsupported_method");
        const token = await adapter.validateCredentials(env, apiKey, apiSecret, now);
        const active = { ...credentials, accessToken: token.accessToken };
        await adapter.testConnection({ env, credentials: active, now });
        await putCredentialEnvelope(
          env,
          record.uid,
          record.id,
          await encryptCredentials(
            env,
            { uid: record.uid, connectionId: record.id, provider: record.provider },
            active,
          ),
        );
        record = withStatus(record, "connected", now, {
          tokenExpiresAt: token.tokenExpiresAt,
          lastErrorCode: null,
        });
        await putConnectionRecord(env, record);
        const body: BrokerUpdateResponse = { connection: toPublicConnection(record), nextStep: "ready" };
        return jsonResponse(env, request, body);
      }

      await putCredentialEnvelope(
        env,
        record.uid,
        record.id,
        await encryptCredentials(
          env,
          { uid: record.uid, connectionId: record.id, provider: record.provider },
          credentials,
        ),
      );
      if (record.status !== "pending_authorization") {
        if (canTransition(record.status, "reauthorization_required")) {
          record = withStatus(record, "reauthorization_required", now, {
            tokenExpiresAt: null,
            lastErrorCode: null,
            syncLockUntil: null,
          });
        }
        record = withStatus(record, "pending_authorization", now, { lastErrorCode: null });
      }
      await putConnectionRecord(env, record);

      const authorization = await startAuthorization(env, request, record, credentials, now);
      const body: BrokerUpdateResponse = {
        connection: toPublicConnection(record),
        nextStep: "authorize",
        authorizationUrl: authorization.authorizationUrl,
      };
      return jsonResponse(env, request, body);
    }

    await putConnectionRecord(env, record);
    const body: BrokerUpdateResponse = { connection: toPublicConnection(record), nextStep: "ready" };
    return jsonResponse(env, request, body);
  });

/** DELETE /api/brokers/connections/:id — removes the credential envelope. */
export const onRequestDelete: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.disconnect", async () => {
    const access = await requireBrokerUser(env, request, "brokerWrite");
    if (!access.ok) return access.response;

    let record = await requireConnectionRecord(env, access.uid, idFrom(params));
    const now = new Date();
    if (record.status !== "disconnected") {
      // An in-flight sync owns the record; a stale lock (crashed run) must not
      // leave the connection permanently undisconnectable.
      if (syncLockIsActive(record)) throw new BrokerError("sync_in_progress");
      if (record.status === "syncing") record = withStatus(record, "error", now);
      record = withStatus(record, "disconnected", now, {
        tokenExpiresAt: null,
        syncLockUntil: null,
        lastErrorCode: null,
      });
      await putConnectionRecord(env, record);
    }
    await deleteCredentialEnvelope(env, record.uid, record.id);
    return jsonResponse(env, request, { connection: toPublicConnection(record) });
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
