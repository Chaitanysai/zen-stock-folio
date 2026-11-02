/**
 * Server-side market-phase helper for cache-TTL decisions only.
 *
 * The session logic lives in `src/lib/market/sessions.ts` so the browser and
 * the Worker cannot disagree. This module keeps the existing server-facing
 * names and adds the market parameter.
 */

import {
  isNseMarketOpen as isNseSessionOpen,
  marketSessionState,
} from "../../../src/lib/market/sessions.ts";
import type { Market } from "../../../src/lib/market-data/types.ts";

export const IST_TIME_ZONE = "Asia/Kolkata";
export const OPEN_MINUTES = 9 * 60 + 15;
export const CLOSE_MINUTES = 15 * 60 + 30;
export const EOD_CACHE_TTL_SECONDS = 30 * 60 * 60;

/** NSE equity session: Mon–Fri, 09:15–15:30 IST, holidays from the calendar. */
export const isNseMarketOpen = isNseSessionOpen;

export const sessionState = (market: Market, date = new Date()) => marketSessionState(market, date);

/**
 * KV write policy: an EOD entry is persisted only while the instrument's own
 * market is closed. During that market's session the KV write quota is
 * preserved for genuine end-of-day snapshots, and one market being closed
 * never lets another market's live quote be stored with the EOD TTL. An
 * unknown session (no holiday calendar for the year) is not "closed": we
 * refuse to write rather than persist an intraday quote with the EOD TTL.
 */
export const shouldWriteEodCache = (date = new Date(), market: Market): boolean =>
  marketSessionState(market, date) === "closed";
