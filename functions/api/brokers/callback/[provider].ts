import { isBrokerProviderId } from "../../../../src/lib/brokers/registry.ts";
import type { BrokerErrorCode } from "../../../../src/lib/brokers/contracts.ts";
import { asBrokerError, BrokerError, logBrokerFailure } from "../_lib/errors.ts";
import { encryptCredentials, decryptCredentials } from "../_lib/crypto.ts";
import { adapterFor } from "../_lib/providers/index.ts";
import { requestTokenSchema, stateQuerySchema } from "../_lib/schemas.ts";
import { hashAuthorizationState } from "../_lib/state.ts";
import { canTransition, statusForError, withStatus } from "../_lib/stateMachine.ts";
import {
  getConnectionRecord,
  putConnectionRecord,
  putCredentialEnvelope,
  publicOrigin,
  requireConnectionRecord,
  requireCredentialEnvelope,
  takeAuthorizationState,
} from "../_lib/store.ts";
import { checkRateLimit, RATE_LIMITS } from "../../_lib/ratelimit.ts";
import { paramValue } from "../_lib/access.ts";
import type { Env, PagesHandler } from "../../_lib/types.ts";

/**
 * Records a failed authorization on the connection it belongs to.
 *
 * Only a connection that is still awaiting authorization is transitioned, so a
 * duplicate/late callback can never overwrite a connection that already
 * succeeded. Failure bookkeeping is best effort and must not affect redirect.
 */
const recordAuthorizationFailure = async (
  env: Env,
  uid: string,
  connectionId: string,
  code: BrokerErrorCode,
): Promise<void> => {
  try {
    const record = await getConnectionRecord(env, uid, connectionId);
    if (!record) return;
    if (record.status !== "pending_authorization" && record.status !== "pending_credentials") return;
    const target = statusForError(code);
    if (!canTransition(record.status, target)) return;
    await putConnectionRecord(
      env,
      withStatus(record, target, new Date(), { lastErrorCode: code }),
    );
  } catch {
    // Never let bookkeeping turn a redirect into a 500.
  }
};

/**
 * GET /api/brokers/callback/:provider — the provider's registered redirect.
 *
 * Unauthenticated by nature (it is a top-level browser navigation), so the
 * one-time `state` is the entire authorization proof. The raw state and the
 * provider's request token appear only in the incoming URL; the response is a
 * clean redirect to the app with a safe code and never includes either value.
 */
export const onRequestGet: PagesHandler = async ({ request, env, params }) => {
  const providerParam = paramValue(params.provider);
  if (!isBrokerProviderId(providerParam)) return new Response("Not found", { status: 404 });
  const provider = providerParam;

  const url = new URL(request.url);
  const origin = publicOrigin(env, request);
  const redirect = (search: Record<string, string>): Response =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/?${new URLSearchParams(search).toString()}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    });
  const fail = (code: string, connectionId?: string): Response =>
    redirect({
      broker: "error",
      provider,
      code,
      ...(connectionId ? { connection: connectionId } : {}),
    });

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rl = checkRateLimit(
    `ip:${ip}:brokerCallback`,
    RATE_LIMITS.brokerCallback.limit,
    RATE_LIMITS.brokerCallback.windowMs,
  );
  if (!rl.allowed) return fail("rate_limited");

  const state = url.searchParams.get("state") ?? "";
  if (!stateQuerySchema.safeParse(state).success) return fail("state_invalid");

  let stateRecord;
  try {
    stateRecord = await takeAuthorizationState(env, provider, await hashAuthorizationState(state));
  } catch (error) {
    const failure = asBrokerError(error);
    logBrokerFailure("callback.state", { code: failure.code, provider });
    return fail(failure.code);
  }

  const connectionId = stateRecord.connectionId;
  try {
    if (stateRecord.provider !== provider) throw new BrokerError("state_invalid");

    const providerStatus = url.searchParams.get("status");
    if (providerStatus && providerStatus !== "success") {
      throw new BrokerError("provider_error", "Provider reported a failed authorization");
    }
    const providerError = url.searchParams.get("error");
    if (providerError) throw new BrokerError("provider_error", "Provider reported an error");

    const adapter = adapterFor(provider);
    if (!adapter.completeAuthorization) throw new BrokerError("unsupported_method");

    // Kite names the value request_token; Upstox OAuth v2 names it code.
    const requestToken =
      url.searchParams.get("request_token") ?? url.searchParams.get("code") ?? "";
    if (!requestTokenSchema.safeParse(requestToken).success) throw new BrokerError("invalid_request");

    // Read the connection before touching credentials or the provider: a
    // callback may only finalize a connection that is still awaiting this
    // authorization. An already-connected connection must never be overwritten
    // by a duplicate or late callback.
    const record = await requireConnectionRecord(env, stateRecord.uid, connectionId);
    if (record.status !== "pending_authorization") throw new BrokerError("conflict");

    const envelope = await requireCredentialEnvelope(env, stateRecord.uid, connectionId);
    const stored = await decryptCredentials(
      env,
      { uid: stateRecord.uid, connectionId, provider },
      envelope,
    );
    const now = new Date();
    const token = await adapter.completeAuthorization(env, stored, requestToken, now);
    const active = { ...stored, accessToken: token.accessToken };

    await putCredentialEnvelope(
      env,
      stateRecord.uid,
      connectionId,
      await encryptCredentials(env, { uid: stateRecord.uid, connectionId, provider }, active),
    );

    const next = withStatus(record, "connected", now, {
      tokenExpiresAt: token.tokenExpiresAt,
      lastErrorCode: null,
      syncLockUntil: null,
    });
    await putConnectionRecord(env, next);

    return redirect({ broker: "connected", provider, connection: connectionId });
  } catch (error) {
    const failure = asBrokerError(error);
    logBrokerFailure("callback.complete", { code: failure.code, provider, connectionId });
    // A completion failure must be visible to the user. Only a connection that
    // is still awaiting authorization is transitioned; a successful connection
    // (or one in another terminal state) is left untouched.
    await recordAuthorizationFailure(env, stateRecord.uid, connectionId, failure.code);
    return fail(failure.code, connectionId);
  }
};
