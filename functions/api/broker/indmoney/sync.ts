import { requireVerifiedIdentity } from "../../_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "../../_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "../../_lib/http";
import { BrokerError, createIndstocksClient, type HoldingsResult, type TradeBookResult } from "../../_lib/indstocks";
import { assertBrokerTokenKey, BrokerTokenKeyError, decryptBrokerToken } from "../../_lib/brokerToken";
import { consumeDaily, dailyRetryAfterSeconds } from "../../_lib/dailyLimit";
import { commitSnapshot, readPortfolio } from "../../_lib/firestore";
import { buildSyncPlan } from "../../../../src/lib/portfolio/syncPlan.ts";
import type { ApplyResult } from "../../../../src/lib/broker/types.ts";
import type { PortfolioSnapshot } from "../../../../src/lib/data/snapshotTypes.ts";
import type { PagesHandler } from "../../_lib/types";

/**
 * POST /api/broker/indmoney/sync
 *
 * One stateless route for preview and apply. The caller's own Firebase ID
 * token reads and writes `portfolios/{uid}`, so Firestore rules remain the
 * ownership check. Apply recomputes the plan in this request (a client-supplied
 * diff is never trusted) and writes exactly once, guarded by the `updateTime`
 * the client previewed against.
 */

const MAX_CIPHERTEXT_CHARS = 8192;
const MAX_IV_CHARS = 64;
// Matches the link route: the longest accepted token seals to ~5.5 KB of
// base64, so a smaller cap would answer 413 for material this app issued.
const MAX_BODY_BYTES = 8 * 1024;

interface SyncBody {
  mode?: unknown;
  ciphertext?: unknown;
  iv?: unknown;
  keyVersion?: unknown;
  baseUpdateTime?: unknown;
  confirmEmpty?: unknown;
}

const emptySnapshot = (): PortfolioSnapshot => ({
  stocks: [],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
  executions: [],
});

const invalidTokenMessage = "The stored broker token is invalid. Link the account again.";

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:broker-sync`,
    RATE_LIMITS.broker.limit,
    RATE_LIMITS.broker.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs), "RATE_LIMITED");
  }

  // Configuration and request validation precede the daily budget: a 503 or a
  // 400 never reaches the broker, so it must not spend one of the 20 units.
  if (
    !env.INDSTOCKS_BASE_URL ||
    !env.INDSTOCKS_API_KEY ||
    !env.BROKER_TOKEN_KEY ||
    !env.FIREBASE_PROJECT_ID
  ) {
    return errorResponse(env, request, 503, "Broker sync is not configured", {}, "BROKER_DISABLED");
  }

  // Present but malformed key material is still a configuration failure: fail
  // closed here, before any broker call or daily-unit spend.
  try {
    assertBrokerTokenKey(env.BROKER_TOKEN_KEY);
  } catch (caught) {
    if (!(caught instanceof BrokerTokenKeyError)) throw caught;
    return errorResponse(env, request, 503, "Broker sync is not configured", {}, "BROKER_DISABLED");
  }

  const body = await readJsonBody<SyncBody>(env, request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  const data = body.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return errorResponse(env, request, 400, "Expected a JSON object body", {}, "INVALID_REQUEST");
  }

  if (data.mode !== "preview" && data.mode !== "apply") {
    return errorResponse(env, request, 400, "mode must be preview or apply", {}, "INVALID_REQUEST");
  }
  const isApply = data.mode === "apply";

  const ciphertext = typeof data.ciphertext === "string" ? data.ciphertext : "";
  const iv = typeof data.iv === "string" ? data.iv : "";
  if (
    !ciphertext ||
    ciphertext.length > MAX_CIPHERTEXT_CHARS ||
    !iv ||
    iv.length > MAX_IV_CHARS ||
    data.keyVersion !== 1
  ) {
    return errorResponse(env, request, 400, invalidTokenMessage, {}, "BAD_CIPHERTEXT");
  }

  // Apply needs the version it previewed against; `null` means "create".
  if (isApply && !("baseUpdateTime" in data)) {
    return errorResponse(
      env, request, 400,
      "baseUpdateTime is required for apply; run the preview again.",
      {}, "MISSING_BASE_UPDATE_TIME",
    );
  }
  const rawBaseUpdateTime = data.baseUpdateTime;
  if (
    rawBaseUpdateTime !== undefined &&
    rawBaseUpdateTime !== null &&
    typeof rawBaseUpdateTime !== "string"
  ) {
    return errorResponse(
      env, request, 400,
      "baseUpdateTime must be a string or null",
      {}, "INVALID_REQUEST",
    );
  }
  // Presence was enforced above, so an absent value can only mean `null`.
  const baseUpdateTime: string | null =
    typeof rawBaseUpdateTime === "string" ? rawBaseUpdateTime : null;

  let token: string;
  try {
    token = await decryptBrokerToken({ ciphertext, iv, keyVersion: 1 }, auth.identity.uid, env.BROKER_TOKEN_KEY);
  } catch {
    return errorResponse(env, request, 400, invalidTokenMessage, {}, "BAD_CIPHERTEXT");
  }

  // The unit is spent only now, immediately before the broker is called.
  const daily = await consumeDaily(env, auth.identity.uid, RATE_LIMITS.broker.daily);
  if (!daily.allowed) {
    return errorResponse(
      env, request, 429,
      "Daily broker limit reached",
      { "Retry-After": String(dailyRetryAfterSeconds()) },
      "RATE_LIMITED",
    );
  }

  let holdingsResult: HoldingsResult;
  let tradeBookResult: TradeBookResult;
  try {
    const client = createIndstocksClient({
      baseUrl: env.INDSTOCKS_BASE_URL,
      apiKey: env.INDSTOCKS_API_KEY,
      token,
    });
    [holdingsResult, tradeBookResult] = await Promise.all([client.holdings(), client.tradeBook()]);
  } catch (caught) {
    if (caught instanceof BrokerError && caught.kind === "auth") {
      return errorResponse(
        env, request, 409,
        "That broker token is expired. Generate a new one and link the account again.",
        {}, "TOKEN_EXPIRED",
      );
    }
    if (caught instanceof BrokerError && caught.kind === "contract") {
      return errorResponse(
        env, request, 502,
        "The broker returned an unexpected response. Nothing was written.",
        {}, "BROKER_CONTRACT",
      );
    }
    return errorResponse(
      env, request, 502,
      "The broker is temporarily unavailable. Nothing was written.",
      {}, "BROKER_UNAVAILABLE",
    );
  }

  const read = await readPortfolio(env, auth.identity.uid, auth.identity.token);
  if (read.status === "error") {
    return errorResponse(env, request, 502, read.error, {}, "SNAPSHOT_UNAVAILABLE");
  }

  const plan = buildSyncPlan({
    snapshot: read.snapshot ?? emptySnapshot(),
    snapshotUpdateTime: read.updateTime,
    holdings: holdingsResult.holdings,
    unmatched: holdingsResult.unmatched,
    fills: tradeBookResult.fills,
    warnings: [...holdingsResult.warnings, ...tradeBookResult.warnings],
  });

  // A preview is the whole plan's observable surface: never the next snapshot,
  // the decrypted token, or a raw broker payload.
  if (!isApply) return jsonResponse(env, request, plan.preview);

  // The storage bound is checked before the empty-holdings panic: an oversized
  // plan must be reported as a limit, not as an empty-broker warning.
  if (plan.preview.conflicts.some((conflict) => conflict.code === "limit")) {
    return errorResponse(
      env, request, 409,
      "This sync would exceed a storage limit and was not applied.",
      {}, "SNAPSHOT_LIMIT_EXCEEDED",
    );
  }

  if (plan.preview.requiresEmptyConfirmation && data.confirmEmpty !== true) {
    return errorResponse(
      env, request, 409,
      "The broker returned no holdings. Confirm to remove every synced position.",
      {}, "EMPTY_HOLDINGS_CONFIRMATION_REQUIRED",
    );
  }

  if (read.updateTime !== baseUpdateTime) {
    return errorResponse(
      env, request, 409,
      "The portfolio changed since the preview. Run the preview again.",
      {}, "SNAPSHOT_CHANGED",
    );
  }

  const precondition = read.updateTime === null
    ? { exists: false as const }
    : { updateTime: read.updateTime };

  const commit = await commitSnapshot(
    env,
    auth.identity.uid,
    auth.identity.token,
    plan.nextSnapshot,
    precondition,
  );
  if (!commit.ok) {
    if (commit.conflict) {
      return errorResponse(
        env, request, 409,
        "The portfolio changed while applying. Run the preview again.",
        {}, "SNAPSHOT_CHANGED",
      );
    }
    if (commit.code === "too_large") {
      return errorResponse(
        env, request, 409,
        "This sync would exceed a storage limit and was not applied.",
        {}, "SNAPSHOT_LIMIT_EXCEEDED",
      );
    }
    return errorResponse(
      env, request, 502,
      commit.error ?? "The portfolio could not be written.",
      {}, "SNAPSHOT_WRITE_FAILED",
    );
  }

  // The write version is never fabricated: without it the next compare-and-set
  // would silently conflict, so the caller re-previews instead.
  if (commit.updateTime === null) {
    return errorResponse(
      env, request, 502,
      "The portfolio was written but Firestore returned no version. Run the preview again.",
      {}, "SNAPSHOT_WRITE_FAILED",
    );
  }

  const result: ApplyResult = {
    mode: "apply",
    provider: "indmoney",
    appliedAt: new Date().toISOString(),
    openPositions: plan.preview.openPositions.length,
    closedPositions: plan.preview.closedPositions.length,
    executions: plan.preview.executionsAdded,
    snapshotUpdateTime: commit.updateTime,
  };
  return jsonResponse(env, request, result);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
