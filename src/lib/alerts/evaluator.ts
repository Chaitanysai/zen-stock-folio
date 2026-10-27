/**
 * Price-alert evaluation.
 *
 * Pure by construction: it takes quote envelopes, the saved alerts, the saved
 * evaluation state and `now`, and returns a new state plus the firings. No
 * `Date.now()`, no storage, no React — so every rule below is unit-testable
 * with a controlled clock.
 *
 * Provenance is the whole point. A firing is only allowed when the quote carries
 * a defensible freshness claim, because an alert that fires on yesterday's close
 * (or on a browser-cached body) is worse than an alert that stays silent:
 *
 *   eligible ⇔ exchangeTimestamp parses
 *            ∧ dataMode ∈ {realtime, delayed}
 *            ∧ stale === false
 *            ∧ envelope.cached === false
 *            ∧ quote.price is a finite number > 0
 *            ∧ the alert is enabled and its targets are valid
 *
 * EOD, unknown mode, cached, stale, unavailable and undated quotes are never
 * eligible. They stay visible in the UI; they simply cannot fire.
 */

import type { QuoteEnvelope } from "@/lib/market-data/types.ts";
import type { PriceAlert } from "@/data/sampleData";

/** Data modes that represent a live-enough observation to alert on. */
const ELIGIBLE_MODES = new Set(["realtime", "delayed"]);

/** Why a quote is not usable for firing. Surfaced so the UI can explain itself. */
export type IneligibilityReason =
  | "missing_quote"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "unknown_mode"
  | "eod_mode"
  | "stale"
  | "cached"
  | "invalid_price";

/**
 * Per (alert, symbol) evaluation memory.
 *
 * `baselineTimestamp` is the first eligible observation we ever saw. It is never
 * trimmed, and it is what stops the "price is already above target when the app
 * loads" case from firing: the first sighting establishes the baseline and only a
 * *subsequent* observation can fire.
 *
 * `firedTimestamp` is the observation that already caused a firing. One-shot:
 * once set, the alert never fires again. It is what makes duplicate suppression
 * survive polling, remounts and reloads (it is persisted with the snapshot).
 */
export interface AlertEvaluationState {
  /** Observation that triggered the firing, or null when never fired. */
  firedTimestamp: string | null;
  /** Observation that first made this pair evaluable; the trust anchor. */
  baselineTimestamp: string | null;
  /** Whether the fired notification has been acknowledged/dismissed in the UI. */
  dismissed: boolean;
}

export type AlertStateMap = Record<string, AlertEvaluationState>;

export interface AlertFiring {
  alertId: string;
  ticker: string;
  /** Price observed at the firing, for the history entry. */
  price: number;
  /** Normalized (ISO) exchange timestamp of the firing observation. */
  exchangeTimestamp: string;
  /** `dataMode` at the firing, so a delayed firing is never shown as realtime. */
  dataMode: QuoteEnvelope["dataMode"];
  provider: QuoteEnvelope["provider"];
}

export interface EvaluateResult {
  /** The state to persist. Contains the previous entries plus any new firing. */
  nextState: AlertStateMap;
  /** Alerts that fired on this call. Usually empty; never a repeat. */
  firings: AlertFiring[];
  /** Per-alert reason it could not be evaluated, for the UI. Absent when fine. */
  ineligible: Record<string, IneligibilityReason>;
  /** Alerts whose targets cannot be evaluated at all (legacy/malformed). */
  invalid: Record<string, string>;
}

/** The identity a firing is keyed by: alert id + canonical symbol. */
const stateKey = (alertId: string, ticker: string) => `${alertId}::${ticker.toUpperCase()}`;

const EMPTY_STATE: AlertEvaluationState = {
  firedTimestamp: null,
  baselineTimestamp: null,
  dismissed: false,
};

/**
 * Normalize any timestamp spelling to a single comparable form.
 *
 * Returns null when the value is absent or unparseable so the caller can treat
 * "no timestamp" and "garbage timestamp" identically — both are ineligible.
 * Normalizing to an ISO string (not to a raw input) means two providers that
 * describe the same instant in different formats compare equal.
 */
export function normalizeExchangeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Decide whether a quote envelope may be used to fire an alert.
 *
 * Exported so the UI can show *why* a symbol is not currently alertable rather
 * than silently doing nothing.
 */
export function quoteIneligibility(envelope: QuoteEnvelope | undefined): IneligibilityReason | null {
  if (!envelope) return "missing_quote";
  if (envelope.exchangeTimestamp === null) return "missing_timestamp";
  if (normalizeExchangeTimestamp(envelope.exchangeTimestamp) === null) return "invalid_timestamp";
  if (envelope.stale) return "stale";
  if (envelope.cached) return "cached";
  if (!ELIGIBLE_MODES.has(envelope.dataMode)) {
    return envelope.dataMode === "eod" ? "eod_mode" : "unknown_mode";
  }
  const price = envelope.quote?.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "invalid_price";
  return null;
}

/** A resolved, evaluable target: finite bounds with a stable ordering. */
type Target =
  | { kind: "above"; target: number }
  | { kind: "below"; target: number }
  | { kind: "between"; lower: number; upper: number }
  | { kind: "invalid"; reason: string };

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Validate an alert's configured condition.
 *
 * `between` needs two *explicit* bounds (`targetPrice` is the lower bound and
 * `targetPriceUpper` the upper). A legacy `between` alert that never carried the
 * second bound is reported invalid instead of being guessed at — treating one
 * price as both bounds would make the range fire on nothing or everything
 * depending on the comparison, which is worse than declining to evaluate.
 */
export function resolveTarget(alert: PriceAlert): Target {
  const primary = finiteNumber(alert.targetPrice);
  if (primary === null || primary <= 0) {
    return { kind: "invalid", reason: "target price is missing or not a positive number" };
  }
  if (alert.direction === "between") {
    const upper = finiteNumber(alert.targetPriceUpper);
    if (upper === null) {
      return { kind: "invalid", reason: "range alert has no upper bound" };
    }
    if (!(primary < upper)) {
      return { kind: "invalid", reason: "range lower bound must be below its upper bound" };
    }
    return { kind: "between", lower: primary, upper };
  }
  if (alert.direction === "above") return { kind: "above", target: primary };
  if (alert.direction === "below") return { kind: "below", target: primary };
  return { kind: "invalid", reason: `unsupported direction "${String(alert.direction)}"` };
}

/**
 * Does `price` satisfy the target?
 *
 * Boundaries are inclusive: `above` fires at exactly the target ("≥"), `below`
 * fires at exactly the target ("≤"), and a range includes both endpoints —
 * matching how the alert list already renders its condition.
 */
export function priceSatisfies(price: number, target: Target): boolean {
  switch (target.kind) {
    case "above":
      return price >= target.target;
    case "below":
      return price <= target.target;
    case "between":
      return price >= target.lower && price <= target.upper;
    default:
      return false;
  }
}

/**
 * Evaluate every alert against the latest quote envelopes.
 *
 * Contract:
 *  - one-shot: an alert fires at most once, ever, per ticker;
 *  - a baseline is established before firing is allowed, so an app that loads
 *    with the price already past the target does not immediately fire;
 *  - a retained observation (same normalized timestamp) never fires again;
 *  - `target_hit`, `sl_hit` and `entry_zone` all evaluate their direction and
 *    target identically — the type is a label, the direction is the condition.
 *
 * Note on time: there is deliberately no `now` argument. Freshness is decided
 * upstream — the server derives `stale` from the provider's own exchange
 * timestamp and this module only reads that verdict, so the function is pure
 * over its inputs with no clock of its own.
 */
export function evaluateAlerts(
  envelopes: Record<string, QuoteEnvelope>,
  alerts: PriceAlert[],
  state: AlertStateMap | undefined,
): EvaluateResult {
  const previous = state ?? {};
  const nextState: AlertStateMap = { ...previous };
  const firings: AlertFiring[] = [];
  const ineligible: Record<string, IneligibilityReason> = {};
  const invalid: Record<string, string> = {};

  for (const alert of alerts) {
    if (!alert?.id || !alert.ticker) continue;
    const ticker = alert.ticker.toUpperCase();
    const key = stateKey(alert.id, ticker);

    // An alert that is not enabled cannot fire, and cannot advance its state.
    if (alert.enabled === false) {
      ineligible[alert.id] = "missing_quote";
      continue;
    }

    const target = resolveTarget(alert);
    if (target.kind === "invalid") {
      invalid[alert.id] = target.reason;
      continue;
    }

    const envelope = envelopes[ticker];
    const reason = quoteIneligibility(envelope);
    if (reason) {
      ineligible[alert.id] = reason;
      continue;
    }

    const timestamp = normalizeExchangeTimestamp(envelope!.exchangeTimestamp)!;
    const price = envelope!.quote!.price as number;
    const current = nextState[key] ?? EMPTY_STATE;

    // Already fired: one-shot. Remember nothing new and never fire again.
    if (current.firedTimestamp !== null) {
      nextState[key] = current;
      continue;
    }

    // First eligible sighting establishes the baseline; it must not fire.
    if (current.baselineTimestamp === null) {
      nextState[key] = { ...current, baselineTimestamp: timestamp };
      continue;
    }

    // Retained observation (provider repeated or corrected the timestamp to one
    // we have already seen): not a new observation, so it cannot fire.
    if (timestamp === current.baselineTimestamp) {
      nextState[key] = current;
      continue;
    }

    // Conservative treatment of a timestamp that moves *backwards*: a provider
    // correction is more likely than time travel. Re-baseline without firing.
    if (Date.parse(timestamp) < Date.parse(current.baselineTimestamp)) {
      nextState[key] = { ...current, baselineTimestamp: timestamp };
      continue;
    }

    // Genuinely new, eligible, forward observation.
    nextState[key] = { ...current, baselineTimestamp: timestamp };
    if (priceSatisfies(price, target)) {
      nextState[key] = { ...nextState[key], firedTimestamp: timestamp, dismissed: false };
      firings.push({
        alertId: alert.id,
        ticker,
        price,
        exchangeTimestamp: timestamp,
        dataMode: envelope!.dataMode,
        provider: envelope!.provider,
      });
    }
  }

  return { nextState, firings, ineligible, invalid };
}
