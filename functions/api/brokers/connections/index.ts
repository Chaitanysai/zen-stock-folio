import type {
  BrokerConnectionsResponse,
  BrokerCreateResponse,
} from "../../../../src/lib/brokers/contracts.ts";
import { BROKER_PROVIDERS } from "../../../../src/lib/brokers/registry.ts";
import { BROKER_READ_PERMISSIONS } from "../../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, requireBrokerUser } from "../_lib/access.ts";
import { startAuthorization } from "../_lib/authorize.ts";
import { encryptCredentials } from "../_lib/crypto.ts";
import { BrokerError } from "../_lib/errors.ts";
import { assertProviderEnabled, adapterFor } from "../_lib/providers/index.ts";
import { createConnectionSchema, readValidatedBody } from "../_lib/schemas.ts";
import {
  listConnectionRecords,
  newConnectionId,
  putConnectionRecord,
  putCredentialEnvelope,
  toPublicConnection,
  type BrokerConnectionRecord,
} from "../_lib/store.ts";
import { handleOptions, jsonResponse } from "../../_lib/http.ts";
import type { PagesHandler } from "../../_lib/types.ts";

/** GET /api/brokers/connections — the caller's connections only. */
export const onRequestGet: PagesHandler = async ({ request, env }) =>
  handleBrokerRoute(env, request, "connections.list", async () => {
    const access = await requireBrokerUser(env, request, "brokerRead");
    if (!access.ok) return access.response;

    const records = await listConnectionRecords(env, access.uid);
    const body: BrokerConnectionsResponse = {
      connections: records.map(toPublicConnection),
      storeReady: true,
      setupIssues: [],
    };
    return jsonResponse(env, request, body);
  });

/**
 * POST /api/brokers/connections
 *
 * Keys-only providers must pass a live provider call before the connection is
 * saved as `connected`. Authorization providers are saved as
 * `pending_authorization` and only become `connected` in the callback.
 */
export const onRequestPost: PagesHandler = async ({ request, env }) =>
  handleBrokerRoute(env, request, "connections.create", async () => {
    const access = await requireBrokerUser(env, request, "brokerWrite");
    if (!access.ok) return access.response;

    const parsed = await readValidatedBody(env, request, createConnectionSchema);
    if (!parsed.ok) return parsed.response;
    const { provider, method, apiKey, apiSecret, displayName } = parsed.data;

    const capability = BROKER_PROVIDERS[provider];
    const supported = method === "oauth" ? capability.methods.oauth : capability.methods.apiKeys;
    if (!supported) throw new BrokerError("unsupported_method");
    assertProviderEnabled(env, provider);

    const adapter = adapterFor(provider);
    const now = new Date();
    const record: BrokerConnectionRecord = {
      id: newConnectionId(),
      uid: access.uid,
      provider,
      method,
      displayName: displayName ?? `${capability.name} account`,
      status: "pending_credentials",
      permissions: [...BROKER_READ_PERMISSIONS],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTestedAt: null,
      lastSuccessfulSyncAt: null,
      tokenExpiresAt: null,
      lastErrorCode: null,
      disconnectedAt: null,
      lastSync: null,
      syncLockUntil: null,
    };

    if (method === "api_keys") {
      if (!adapter.validateCredentials) throw new BrokerError("unsupported_method");
      const token = await adapter.validateCredentials(env, apiKey, apiSecret, now);
      const credentials = { apiKey, apiSecret, accessToken: token.accessToken };
      // A minted token alone is not proof of read access; this call is.
      await adapter.testConnection({ env, credentials, now });

      const envelope = await encryptCredentials(
        env,
        { uid: record.uid, connectionId: record.id, provider },
        credentials,
      );
      await putCredentialEnvelope(env, record.uid, record.id, envelope);
      record.status = "connected";
      record.tokenExpiresAt = token.tokenExpiresAt;
      await putConnectionRecord(env, record);

      const body: BrokerCreateResponse = {
        connection: toPublicConnection(record),
        nextStep: "ready",
      };
      return jsonResponse(env, request, body, 201);
    }

    const credentials = { apiKey, apiSecret };
    const envelope = await encryptCredentials(
      env,
      { uid: record.uid, connectionId: record.id, provider },
      credentials,
    );
    await putCredentialEnvelope(env, record.uid, record.id, envelope);
    record.status = "pending_authorization";
    await putConnectionRecord(env, record);

    const authorization = await startAuthorization(env, request, record, credentials, now);
    const body: BrokerCreateResponse = {
      connection: toPublicConnection(record),
      nextStep: "authorize",
      authorizationUrl: authorization.authorizationUrl,
    };
    return jsonResponse(env, request, body, 201);
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
