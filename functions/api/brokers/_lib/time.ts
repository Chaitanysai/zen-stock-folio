/**
 * Broker clocks.
 *
 * Both Kite Connect and Groww retire access tokens at 06:00 IST. IST is a
 * fixed UTC+05:30 offset (no DST), so 06:00 IST is 00:30 UTC.
 */

const SIX_AM_IST_AS_UTC_HOUR = 0;
const SIX_AM_IST_AS_UTC_MINUTE = 30;

export const nextSixAmIst = (now: Date = new Date()): string => {
  const expiry = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      SIX_AM_IST_AS_UTC_HOUR,
      SIX_AM_IST_AS_UTC_MINUTE,
      0,
      0,
    ),
  );
  if (expiry.getTime() <= now.getTime()) expiry.setUTCDate(expiry.getUTCDate() + 1);
  return expiry.toISOString();
};

/** Parses provider timestamps; Kite returns IST wall-clock strings without an offset. */
export const parseProviderTimestamp = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) {
    const date = new Date(`${text.replace(" ", "T")}+05:30`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

export const tokenExpired = (expiresAt: string | null | undefined, now: Date = new Date()): boolean => {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? false : parsed <= now.getTime();
};
