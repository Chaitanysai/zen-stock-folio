/**
 * Minimal IST market-phase helper for cache-TTL decisions only.
 *
 * This is NOT the app's market-status authority — the client keeps its full
 * holiday-aware implementation (src/lib/market/marketStatus.ts). The server
 * needs only open/closed to pick cache freshness policy, and it fails OPEN
 * on the missing holiday calendar: an unknown holiday means we cache LESS
 * (short-TTL), which is the safe direction — the reverse (stale holiday
 * quotes presented as fresh) can never happen from this file.
 */

export const IST_TIME_ZONE = "Asia/Kolkata";
export const OPEN_MINUTES = 9 * 60 + 15; // 09:15 IST
export const CLOSE_MINUTES = 15 * 60 + 30; // 15:30 IST

export const EOD_CACHE_TTL_SECONDS = 30 * 60 * 60; // 30 h — EOD entries only

interface IstParts {
  weekday: number; // 0=Sunday … 6=Saturday
  minutes: number; // minutes since local midnight
}

const istParts = (date: Date): IstParts => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? "Sun",
  );
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday: weekday === -1 ? 0 : weekday, minutes: hour * 60 + minute };
};

/** NSE equity session: Mon–Fri, 09:15–15:30 IST, holidays treated as open. */
export const isNseMarketOpen = (date = new Date()): boolean => {
  const { weekday, minutes } = istParts(date);
  if (weekday === 0 || weekday === 6) return false;
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
};

/**
 * KV write policy: EOD entries are persisted only while the market is
 * closed. During the session the KV write quota is preserved for genuine
 * end-of-day snapshots; live data is served fresh from providers.
 */
export const shouldWriteEodCache = (date = new Date()): boolean => !isNseMarketOpen(date);
