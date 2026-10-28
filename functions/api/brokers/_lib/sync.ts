import type { Env } from "../../_lib/types.ts";
import type { BrokerConnectionRecord } from "./store.ts";
import type { CredentialBundle } from "./crypto.ts";
import { BrokerError } from "./errors.ts";
import type { NormalizedOrder, NormalizedTrade } from "../../../../src/lib/brokers/contracts.ts";
import { BROKER_PROVIDERS } from "../../../../src/lib/brokers/registry.ts";
import type {
  BrokerCategoryId,
  BrokerCategoryResult,
  BrokerCoverage,
  BrokerSyncRecords,
  BrokerSyncSummary,
} from "../../../../src/lib/brokers/contracts.ts";
import { adapterFor } from "./providers/index.ts";
import { tokenExpired } from "./time.ts";
import type { BrokerLedger } from "./store.ts";

/**
 * Portfolio synchronization.
 *
 * Categories are fetched sequentially (providers rate-limit per key), a token
 * is refreshed once when it has expired, and any category that fails is
 * reported against its own status instead of being served as empty. Nothing is
 * written to the portfolio here: the browser performs the merge so Firestore
 * remains the only place user-held rows live.
 */

export interface SyncInput {
  env: Env;
  record: BrokerConnectionRecord;
  credentials: CredentialBundle;
  now: Date;
  ledger: BrokerLedger;
}

export interface SyncOutcome {
  summary: BrokerSyncSummary;
  records: BrokerSyncRecords;
  ledger: BrokerLedger;
  /** Credential bundle after a possible token refresh; persist when it changes. */
  credentials: CredentialBundle;
}

const category = (
  status: BrokerCategoryResult["status"],
  count = 0,
  safeErrorCode: BrokerCategoryResult["safeErrorCode"] = null,
  note: string | null = null,
): BrokerCategoryResult => ({ status, count, safeErrorCode, note });

const summariseStatus = (
  categories: Record<BrokerCategoryId, BrokerCategoryResult>,
): BrokerSyncSummary["status"] => {
  const results = Object.values(categories);
  if (results.every((entry) => entry.status === "failed")) return "failed";
  if (results.some((entry) => entry.status === "failed" || entry.status === "partial")) return "partial";
  return "success";
};

const earliest = (values: Array<string | undefined>): string | null => {
  const stamps = values.filter((value): value is string => typeof value === "string");
  if (stamps.length === 0) return null;
  return stamps.reduce((min, value) => (Date.parse(value) < Date.parse(min) ? value : min));
};

const latest = (values: Array<string | undefined>): string | null => {
  const stamps = values.filter((value): value is string => typeof value === "string");
  if (stamps.length === 0) return null;
  return stamps.reduce((max, value) => (Date.parse(value) > Date.parse(max) ? value : max));
};

const fingerprint = (prefix: string, key: string, payload: unknown): string =>
  `${prefix}:${key}:${JSON.stringify(payload)}`;

const applyLedger = (
  ledger: BrokerLedger,
  prefix: string,
  key: string,
  payload: unknown,
): { state: "new" | "updated" | "unchanged"; fingerprint: string } => {
  const next = fingerprint(prefix, key, payload);
  const name = `${prefix}:${key}`;
  const previous = ledger.entries[name];
  if (!previous) return { state: "new", fingerprint: next };
  return { state: previous === next ? "unchanged" : "updated", fingerprint: next };
};

const commitEntries = (
  ledger: BrokerLedger,
  changes: Array<{ name: string; value: string }>,
): void => {
  for (const change of changes) ledger.entries[change.name] = change.value;
};

const counted = <T>(
  ledger: BrokerLedger,
  prefix: string,
  rows: T[],
  keyOf: (row: T) => string | null,
  payloadOf: (row: T) => unknown,
): { records: T[]; newCount: number; updated: number; unchanged: number } => {
  let newCount = 0;
  let updated = 0;
  let unchanged = 0;
  const changes: Array<{ name: string; value: string }> = [];
  const records: T[] = [];

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const verdict = applyLedger(ledger, prefix, key, payloadOf(row));
    changes.push({ name: `${prefix}:${key}`, value: verdict.fingerprint });
    if (verdict.state === "new") newCount += 1;
    else if (verdict.state === "updated") updated += 1;
    else unchanged += 1;
    records.push(row);
  }
  commitEntries(ledger, changes);
  return { records, newCount, updated, unchanged };
};

export const runSync = async (input: SyncInput): Promise<SyncOutcome> => {
  const { env, record, now, ledger } = input;
  const adapter = adapterFor(record.provider);
  const startedAt = now.toISOString();

  let credentials = input.credentials;
  let tokenRefreshed = false;
  if (tokenExpired(credentials.accessToken ? record.tokenExpiresAt : null, now) || !credentials.accessToken) {
    if (!adapter.refreshAccessToken) throw new BrokerError("authentication_expired");
    const refreshed = await adapter.refreshAccessToken({ env, credentials, now });
    credentials = { ...credentials, accessToken: refreshed.accessToken };
    tokenRefreshed = true;
  }

  const context = { env, credentials, now };
  const errors: BrokerError[] = [];
  const categories: Record<BrokerCategoryId, BrokerCategoryResult> = {
    holdings: category("empty"),
    positions: category("empty"),
    orders: category("empty"),
    trades: category("empty"),
  };

  const fatalCodes = new Set(["authentication_expired", "permission_missing", "rate_limited"]);

  const attempt = async <T>(work: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: BrokerError }> => {
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      const failure = error instanceof BrokerError ? error : new BrokerError("internal_error");
      if (fatalCodes.has(failure.code)) throw failure;
      errors.push(failure);
      return { ok: false, error: failure };
    }
  };

  // ── holdings ───────────────────────────────────────────────────────────────
  const holdingsResult = await attempt(() => adapter.fetchHoldings(context));
  const holdings = holdingsResult.ok ? holdingsResult.data : [];
  categories.holdings = holdingsResult.ok
    ? category(holdings.length > 0 ? "ok" : "empty", holdings.length, null, "Snapshot as of the sync time.")
    : category("failed", 0, holdingsResult.error.code);

  // ── positions ──────────────────────────────────────────────────────────────
  const positionsResult = await attempt(() => adapter.fetchPositions(context));
  const positions = positionsResult.ok ? positionsResult.data : [];
  categories.positions = positionsResult.ok
    ? category(positions.length > 0 ? "ok" : "empty", positions.length, null, "Snapshot as of the sync time.")
    : category("failed", 0, positionsResult.error.code);

  // ── orders ─────────────────────────────────────────────────────────────────
  const ordersResult = await attempt(() => adapter.fetchOrders(context));
  const orders = ordersResult.ok ? ordersResult.data : [];
  categories.orders = ordersResult.ok
    ? category(
        orders.length > 0 ? "ok" : "empty",
        orders.length,
        null,
        "The trading API returns the current day's orders only.",
      )
    : category("failed", 0, ordersResult.error.code);

  // ── trades ─────────────────────────────────────────────────────────────────
  let trades: NormalizedTrade[] = [];
  let tradesPartial = false;
  if (!ordersResult.ok) {
    categories.trades = category("failed", 0, ordersResult.error.code, "Orders were unavailable, so trades were not requested.");
  } else {
    const tradesResult = await attempt(() => adapter.fetchTrades(context, orders));
    if (tradesResult.ok) {
      trades = tradesResult.data.trades;
      tradesPartial = tradesResult.data.partial;
      categories.trades = category(
        tradesPartial ? "partial" : trades.length > 0 ? "ok" : "empty",
        trades.length,
        null,
        tradesResult.data.note ?? "The trading API returns the current day's executed trades only.",
      );
    } else {
      categories.trades = category("failed", 0, tradesResult.error.code);
    }
  }

  // ── dedupe and counts ──────────────────────────────────────────────────────
  const holdingRows = counted(ledger, "h", holdings, (row) => row.instrumentId, (row) => [
    row.quantity,
    row.averagePrice,
  ]);
  const positionRows = counted(ledger, "p", positions, (row) => `${row.segment}:${row.instrumentId}`, (row) => [
    row.quantity,
    row.averagePrice,
  ]);
  const orderRows = counted(ledger, "o", orders, (row) => row.orderId, (row: NormalizedOrder) => [
    row.status,
    row.filledQuantity,
    row.averagePrice ?? null,
  ]);
  const tradeRows = counted(ledger, "t", trades, (row) => row.tradeId, (row) => [
    row.quantity,
    row.price,
  ]);

  // ── coverage ───────────────────────────────────────────────────────────────
  const stamps = [
    ...orders.map((order) => order.placedAt),
    ...trades.map((trade) => trade.tradedAt),
  ];
  const provider = BROKER_PROVIDERS[record.provider];
  const start = earliest(stamps);
  const end = latest(stamps);
  const coverage: BrokerCoverage = {
    start,
    end,
    currentDayOnly: true,
    note:
      start && end
        ? `${provider.historyNote} This sync observed records from ${start.slice(0, 10)} to ${end.slice(0, 10)}.`
        : provider.historyNote,
    statementImportRecommended: true,
  };

  const records: BrokerSyncRecords = {
    holdings: holdingRows.records,
    positions: positionRows.records,
    orders: orderRows.records,
    trades: tradeRows.records,
  };

  const summary: BrokerSyncSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    status: summariseStatus(categories),
    categories,
    coverage,
    counts: {
      fetched:
        holdingRows.records.length +
        positionRows.records.length +
        orderRows.records.length +
        tradeRows.records.length,
      new: holdingRows.newCount + positionRows.newCount + orderRows.newCount + tradeRows.newCount,
      updated: holdingRows.updated + positionRows.updated + orderRows.updated + tradeRows.updated,
      unchanged: holdingRows.unchanged + positionRows.unchanged + orderRows.unchanged + tradeRows.unchanged,
    },
    safeErrorCode: errors[0]?.code ?? null,
  };

  return {
    summary,
    records,
    ledger,
    credentials: tokenRefreshed ? credentials : input.credentials,
  };
};
