/**
 * CSV serialization for user-controlled portfolio data.
 *
 * Two independent hazards, both handled here so no caller has to remember them:
 *  - Spreadsheet formula injection: a cell beginning with `=`, `+`, `-`, `@`,
 *    tab, or CR is executed as a formula by Excel/LibreOffice/Sheets. Imported
 *    tickers and stock names are attacker-controlled, so they must be
 *    neutralized with a leading apostrophe (which spreadsheets treat as a
 *    text marker and do not display).
 *  - RFC 4180 quoting: a value containing a comma, quote, or newline would
 *    otherwise split or corrupt the row.
 */

/** Characters a spreadsheet interprets as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Values needing RFC 4180 quoting. */
const NEEDS_QUOTING = /[",\n\r]/;

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prefix before quoting: the guard must stay at column start to work.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Render a header + row grid as an RFC 4180 CSV document (CRLF-separated). */
export function toCsv(headers: readonly unknown[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
