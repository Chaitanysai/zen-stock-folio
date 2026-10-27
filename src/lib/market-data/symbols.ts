/**
 * Symbol normalization and validation.
 *
 * The app's persisted data uses bare NSE trading symbols ("RELIANCE"), while
 * every provider wants its own form ("RELIANCE.NS", "NSE_EQ|INE002A01018",
 * "^NSEI"). All conversion lives here so no handler invents its own.
 */

/** Providers use this shape for a bare NSE symbol. */
const NSE_SYMBOL_RE = /^[A-Z0-9][A-Z0-9&._-]{0,19}$/;

/** A provider-suffixed form we accept on input and strip. */
const SUFFIXED_RE = /^([A-Z0-9][A-Z0-9&._-]{0,19})\.(NS|BO)$/;

/**
 * Canonicalize a user-supplied ticker to a bare uppercase NSE symbol.
 *
 * Returns `null` for anything that is not plausibly an NSE symbol, so callers
 * must handle rejection rather than passing junk upstream. Deliberately strict:
 * this is the input boundary for outbound HTTP.
 */
export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  const suffixed = SUFFIXED_RE.exec(trimmed);
  if (suffixed) {
    // Only NSE (.NS) is supported for quotes; BSE would need a separate feed.
    return suffixed[2] === "NS" ? suffixed[1] : null;
  }
  // Reject index symbols here — those go through `normalizeIndexSymbol`.
  if (trimmed.startsWith("^")) return null;
  return NSE_SYMBOL_RE.test(trimmed) ? trimmed : null;
}

/** Index symbols we expose, with the label a human should see. */
export const SUPPORTED_INDICES = [
  { label: "NIFTY 50", providerSymbol: "^NSEI" },
  { label: "SENSEX", providerSymbol: "^BSESN" },
  { label: "BANK NIFTY", providerSymbol: "^NSEBANK" },
] as const;

export type SupportedIndexSymbol = (typeof SUPPORTED_INDICES)[number]["providerSymbol"];

export function isSupportedIndexSymbol(value: string): value is SupportedIndexSymbol {
  return SUPPORTED_INDICES.some((i) => i.providerSymbol === value);
}

/** Yahoo needs the `.NS` suffix for NSE equities. */
export function toYahooSymbol(symbol: string): string {
  return `${symbol}.NS`;
}

/** Recover a bare NSE symbol from a Yahoo symbol; `null` for non-NSE markets. */
export function fromYahooSymbol(yahooSymbol: string): string | null {
  if (!yahooSymbol.endsWith(".NS")) return null;
  return yahooSymbol.slice(0, -3);
}

/** Normalize and de-duplicate a caller-supplied ticker list. */
export function normalizeSymbolList(
  raw: unknown,
  max: number,
): { symbols: string[]; rejected: string[]; truncated: boolean } {
  const rejected: string[] = [];
  const seen = new Set<string>();
  let truncated = false;

  if (!Array.isArray(raw)) return { symbols: [], rejected, truncated };

  for (const entry of raw) {
    const symbol = normalizeSymbol(entry);
    if (!symbol) {
      if (typeof entry === "string" && entry.trim()) rejected.push(entry.trim().slice(0, 32));
      continue;
    }
    if (seen.has(symbol)) continue;
    if (seen.size >= max) {
      truncated = true;
      continue;
    }
    seen.add(symbol);
  }

  return { symbols: [...seen], rejected, truncated };
}
