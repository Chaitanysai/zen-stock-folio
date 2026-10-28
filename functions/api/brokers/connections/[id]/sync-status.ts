import type { BrokerSyncStatusResponse } from "../../../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, paramValue, requireBrokerUser } from "../../_lib/access.ts";
import { BrokerError } from "../../_lib/errors.ts";
import { connectionIdSchema } from "../../_lib/schemas.ts";
import {
  getSyncSummary,
  requireConnectionRecord,
  toPublicConnection,
} from "../../_lib/store.ts";
import { handleOptions, jsonResponse } from "../../../_lib/http.ts";
import type { PagesHandler } from "../../../_lib/types.ts";

/** GET /api/brokers/connections/:id/sync-status — last sanitized summary. */
export const onRequestGet: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.syncStatus", async () => {
    const access = await requireBrokerUser(env, request, "brokerRead");
    if (!access.ok) return access.response;

    const id = connectionIdSchema.safeParse(paramValue(params.id));
    if (!id.success) throw new BrokerError("not_found");
    const record = await requireConnectionRecord(env, access.uid, id.data);
    const report = record.lastSync ?? (await getSyncSummary(env, access.uid, record.id));

    const body: BrokerSyncStatusResponse = { connection: toPublicConnection(record), report };
    return jsonResponse(env, request, body);
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
