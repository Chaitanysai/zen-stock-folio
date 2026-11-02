/** Shared limits for the statement import dialog. Parsing lives in statementImport.ts. */

/** Refuse oversized files before buffering: an XLSX is a zip, so a small file
 * can inflate to arbitrary size in memory and on the main thread. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
