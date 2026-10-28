/** Shared parsing helpers for provider payloads. */

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

export const num = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/** Removes NSE/BSE series suffixes so holdings and quotes use the same ticker. */
export const cleanTicker = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "")
    .replace(/-(EQ|BE|BL|BZ)$/i, "");

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const sideOf = (value: unknown): "BUY" | "SELL" | null => {
  const side = text(value)?.toUpperCase();
  if (side === "BUY" || side === "B") return "BUY";
  if (side === "SELL" || side === "S") return "SELL";
  return null;
};

export const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const objectOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Wraps a provider payload that may or may not sit under `payload`. */
export const payloadOf = (body: unknown): Record<string, unknown> => {
  const root = objectOf(body);
  const payload = objectOf(root.payload);
  return Object.keys(payload).length > 0 ? payload : root;
};
