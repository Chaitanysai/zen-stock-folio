import type { BrokerSyncResponse } from "../../../../../src/lib/brokers/contracts.ts";
import { handleBrokerRoute, paramValue, requireBrokerUser } from "../../_lib/access.ts";
import { encryptCredentials } from "../../_lib/crypto.ts";
import { asBrokerError, BrokerError } from "../../_lib/errors.ts";
import { persistFailure } from "../../_lib/failures.ts";
import { connectionIdSchema } from "../../_lib/schemas.ts";
import { activeCredentials } from "../../_lib/session.ts";
import { withStatus } from "../../_lib/stateMachine.ts";
import {
  getLedger,
  putConnectionRecord,
  putCredentialEnvelope,
  putLedger,
  putSyncSummary,
  requireConnectionRecord,
  syncLockIsActive,
  toPublicConnection,
} from "../../_lib/store.ts";
import { runSync } from "../../_lib/sync.ts";
import { handleOptions, jsonResponse } from "../../../_lib/http.ts";
import type { PagesHandler } from "../../../_lib/types.ts";

const SYNC_LOCK_MS = 2 * 60 * 1000;
const SYNCABLE = new Set(["connected", "syncing", "error", "temporarily_unavailable", "permission_required"]);

/**
 * POST /api/brokers/connections/:id/sync
 *
 * The lock is written before any provider call and cleared on every exit path,
 * so overlapping syncs for one connection are rejected. Records are returned to
 * the browser, which merges them into the user's portfolio; the server keeps
 * only a dedupe ledger and a sanitized summary.
 */
export const onRequestPost: PagesHandler = async ({ request, env, params }) =>
  handleBrokerRoute(env, request, "connections.sync", async () => {
    const access = await requireBrokerUser(env, request, "brokerSync");
    if (!access.ok) return access.response;

    const id = connectionIdSchema.safeParse(paramValue(params.id));
    if (!id.success) throw new BrokerError("not_found");
    const record = await requireConnectionRecord(env, access.uid, id.data);

    if (record.status === "disconnected" || !SYNCABLE.has(record.status)) {
      throw new BrokerError("connection_not_connected");
    }
    if (syncLockIsActive(record)) throw new BrokerError("sync_in_progress");

    const now = new Date();
    const running = withStatus(record, "syncing", now, {
      syncLockUntil: new Date(now.getTime() + SYNC_LOCK_MS).toISOString(),
    });
    await putConnectionRecord(env, running);

    try {
      const { credentials, refreshed } = await activeCredentials(env, running, now);
      const ledger = await getLedger(env, access.uid, running.id);
      const outcome = await runSync({ env, record: running, credentials, now, ledger });

      if (refreshed) {
        await putCredentialEnvelope(
          env,
          running.uid,
          running.id,
          await encryptCredentials(
            env,
            { uid: running.uid, connectionId: running.id, provider: running.provider },
            outcome.credentials,
          ),
        );
      }
      await putLedger(env, access.uid, running.id, outcome.ledger);
      await putSyncSummary(env, access.uid, running.id, outcome.summary);

      const finishedAt = new Date();
      const next = withStatus(running, "connected", finishedAt, {
        lastSuccessfulSyncAt: outcome.summary.finishedAt,
        lastSync: outcome.summary,
        tokenExpiresAt: refreshed?.tokenExpiresAt ?? running.tokenExpiresAt,
        lastErrorCode: null,
        syncLockUntil: null,
      });
      await putConnectionRecord(env, next);

      const body: BrokerSyncResponse = {
        connection: toPublicConnection(next),
        report: {
          ...outcome.summary,
          connectionId: next.id,
          provider: next.provider,
          records: outcome.records,
        },
      };
      return jsonResponse(env, request, body);
    } catch (error) {
      const failure = asBrokerError(error);
      await persistFailure(env, running, failure, new Date());
      throw failure;
    }
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
