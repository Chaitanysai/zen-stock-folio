/**
 * Presentation helpers for assistant cards.
 *
 * The server sends raw numbers and a currency; formatting is a client concern so
 * rounding and separators match the rest of the dashboard. `null` means "not
 * known" and renders as an em dash — never as `0`, `NaN`, or an empty cell that
 * could be misread as zero.
 */

export type AssistantCurrency = "INR" | "USD";

const SYMBOL: Record<AssistantCurrency, string> = { INR: "₹", USD: "$" };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** `₹1,23,456.78` / `$1,234.56`, or `—` when the value is unknown. */
export function formatNative(
  value: number | null | undefined,
  currency: AssistantCurrency,
  digits = 2,
): string {
  if (!isFiniteNumber(value)) return "—";
  const formatted = Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${value < 0 ? "−" : ""}${SYMBOL[currency]}${formatted}`;
}

/** `+2.41%` / `−0.80%`, or `—` when unknown. */
export function formatPercent(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** Quantity with grouping, e.g. `1,500`. */
export function formatQuantity(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return value.toLocaleString("en-IN");
}

/** Compact IST clock for card footers, e.g. `09:15`. */
export function formatIstTime(value: string | null | undefined): string {
  return typeof value === "string" && value.trim() ? value : "—";
}

/** Tailwind text colour for a signed figure; neutral when unknown. */
export function signedToneClass(value: number | null | undefined): string {
  if (!isFiniteNumber(value) || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-profit" : "text-loss";
}
