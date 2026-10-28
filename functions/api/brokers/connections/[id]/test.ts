import type { BrokerTestResponse } from "../../../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, paramValue, requireBrokerUser } from "../../_lib/access.ts";
import { encryptCredentials } from "../../_lib/crypto.ts";
import { asBrokerError, BrokerError } from "../../_lib/errors.ts";
import { persistFailure } from "../../_lib/failures.ts";
import { adapterFor } from "../../_lib/providers/index.ts";
import { connectionIdSchema } from "../../_lib/schemas.ts";
import { activeCredentials } from "../../_lib/session.ts";
import { withStatus } from "../../_lib/stateMachine.ts";
import {
  putConnectionRecord,
  putCredentialEnvelope,
  requireConnectionRecord,
  toPublicConnection,
} from "../../_lib/store.ts";
import { handleOptions, jsonResponse } from "../../../_lib/http.ts";
import type { PagesHandler } from "../../../_lib/types.ts";

/** POST /api/brokers/connections/:id/test — one live, read-only provider call. */
export const onRequestPost: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.test", async () => {
    const access = await requireBrokerUser(env, request, "brokerTest");
    if (!access.ok) return access.response;

    const id = connectionIdSchema.safeParse(paramValue(params.id));
    if (!id.success) throw new BrokerError("not_found");
    const record = await requireConnectionRecord(env, access.uid, id.data);
    if (record.status === "disconnected") throw new BrokerError("connection_not_connected");

    const now = new Date();
    const { credentials, refreshed } = await activeCredentials(env, record, now);

    try {
      await adapterFor(record.provider).testConnection({ env, credentials, now });
    } catch (error) {
      const failure = asBrokerError(error);
      await persistFailure(env, record, failure, now);
      throw failure;
    }

    if (refreshed) {
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
    }

    const checkedAt = now.toISOString();
    const next = withStatus(record, "connected", now, {
      lastTestedAt: checkedAt,
      tokenExpiresAt: refreshed?.tokenExpiresAt ?? record.tokenExpiresAt,
      lastErrorCode: null,
    });
    await putConnectionRecord(env, next);

    const body: BrokerTestResponse = { connection: toPublicConnection(next), checkedAt };
    return jsonResponse(env, request, body);
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
