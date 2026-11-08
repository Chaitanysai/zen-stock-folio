/**
 * Calendar provider abstraction.
 *
 * The frontend never talks to a calendar API directly. It asks a provider for
 * one year of records, and the provider is responsible for normalising,
 * caching and failing safely.
 *
 * Why the curated dataset is the default
 * ──────────────────────────────────────
 * Calendarific (https://calendarific.com/api-documentation) can return Indian
 * holidays with regional filtering, but it requires a secret API key, has a
 * monthly request quota, and its lunar-festival dates still need per-festival
 * verification before they can drive a brand surface. Calling it from the
 * browser would expose the key; proxying it would mean adding a credentialed
 * third-party dependency and a new secret to the deployment, which this
 * feature is explicitly not allowed to do.
 *
 * So the shipped provider is the versioned curated dataset. The HTTP provider
 * below is the seam for a same-origin endpoint (an existing Pages Function, or
 * any proxy) if one is ever configured: set VITE_EVENT_CALENDAR_ENDPOINT and
 * the cached provider will prefer it, falling back to the curated data on any
 * error, timeout or malformed payload. No secret ever reaches the bundle.
 */
import { buildEventDefinitions } from "./eventRegistry";
import { CURATED_CALENDARS } from "./data";
import type {
  CalendarCoverage,
  CalendarRecord,
  CalendarYearData,
  EventCategory,
  EventCountry,
  EventDefinition,
} from "./types";

export interface CalendarProvider {
  readonly id: string;
  /** One year of records, or null when the provider has no data for it. */
  getYear(year: number): Promise<CalendarYearData | null>;
}

const EVENT_CATEGORIES: ReadonlySet<string> = new Set<EventCategory>([
  "festival",
  "national-holiday",
  "observance",
  "seasonal",
]);

const EVENT_COUNTRIES: ReadonlySet<string> = new Set<EventCountry>(["IN", "US", "GLOBAL"]);

const COVERAGES: ReadonlySet<string> = new Set<CalendarCoverage>(["verified", "provisional"]);

/** The always-available fallback: the versioned dataset in ./data. */
export const curatedCalendarProvider: CalendarProvider = {
  id: "curated",
  async getYear(year: number): Promise<CalendarYearData | null> {
    return CURATED_CALENDARS[year] ?? null;
  },
};

export interface HttpCalendarProviderOptions {
  /** Same-origin path, e.g. "/api/events/calendar". Never a secret-key API. */
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normaliseRecord(value: unknown): CalendarRecord | null {
  if (!isRecord(value)) return null;
  const { id, name, category, country, date, endDate, timezone, source, regions } = value;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof date !== "string") return null;
  if (typeof category !== "string" || !EVENT_CATEGORIES.has(category)) return null;
  if (typeof country !== "string" || !EVENT_COUNTRIES.has(country)) return null;

  const record: CalendarRecord = {
    id,
    name,
    category: category as EventCategory,
    country: country as EventCountry,
    date,
    timezone: typeof timezone === "string" && timezone.length > 0 ? timezone : "Asia/Kolkata",
  };

  if (typeof endDate === "string") record.endDate = endDate;
  if (typeof source === "string") record.source = source;
  if (Array.isArray(regions)) {
    const codes = regions.filter((code): code is string => typeof code === "string");
    if (codes.length > 0) record.regions = codes;
  }

  return record;
}

/** Accepts either { records: [...] } or { holidays: [...] } payloads. */
function normaliseYearPayload(payload: unknown, year: number): CalendarYearData | null {
  if (!isRecord(payload)) return null;

  const rawRecords = Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.holidays)
      ? payload.holidays
      : null;
  if (!rawRecords) return null;

  const records = rawRecords
    .map(normaliseRecord)
    .filter((record): record is CalendarRecord => record !== null);
  if (records.length === 0) return null;

  const coverage =
    typeof payload.coverage === "string" && COVERAGES.has(payload.coverage)
      ? (payload.coverage as CalendarCoverage)
      : "provisional";

  return {
    year,
    coverage,
    source: typeof payload.source === "string" ? payload.source : "remote calendar provider",
    retrievedAt: typeof payload.retrievedAt === "string" ? payload.retrievedAt : new Date().toISOString(),
    records,
  };
}

/**
 * Reads a same-origin calendar endpoint. The endpoint is expected to return
 * already-normalised records; anything else is rejected so a bad upstream can
 * never inject an arbitrary component name into the renderer.
 */
export function createHttpCalendarProvider(options: HttpCalendarProviderOptions): CalendarProvider {
  const { endpoint, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  return {
    id: `http:${endpoint}`,
    async getYear(year: number): Promise<CalendarYearData | null> {
      const doFetch = fetchImpl ?? (typeof fetch === "function" ? fetch : null);
      if (!doFetch) return null;

      const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}year=${year}`;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const response = await doFetch(url, {
          headers: { accept: "application/json" },
          signal: controller?.signal,
        });
        if (!response.ok) return null;
        const payload = await response.json();
        return normaliseYearPayload(payload, year);
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

export interface CachedCalendarProvider extends CalendarProvider {
  /** Drops every cached year. Tests and manual refreshes only. */
  clear(): void;
}

/**
 * Wraps a primary provider with an in-memory per-year cache and a fallback.
 *
 * - Successful years are cached for the lifetime of the page, so a re-render or
 *   a midnight re-resolve never re-requests the calendar.
 * - Concurrent requests for the same year share one in-flight promise.
 * - A failure is NOT cached: the next resolve may retry, and the fallback is
 *   used in the meantime. The site always has data.
 */
export function createCachedCalendarProvider(
  primary: CalendarProvider,
  fallback: CalendarProvider,
): CachedCalendarProvider {
  const cache = new Map<number, CalendarYearData>();
  const inFlight = new Map<number, Promise<CalendarYearData | null>>();

  return {
    id: `${primary.id}+cache`,
    async getYear(year: number): Promise<CalendarYearData | null> {
      const cached = cache.get(year);
      if (cached) return cached;

      const pending = inFlight.get(year);
      if (pending) return pending;

      const request = (async () => {
        let data: CalendarYearData | null = null;
        try {
          data = await primary.getYear(year);
        } catch {
          data = null;
        }

        if (!data || data.records.length === 0) {
          try {
            data = await fallback.getYear(year);
          } catch {
            data = null;
          }
        }

        if (data) cache.set(year, data);
        return data;
      })().finally(() => {
        inFlight.delete(year);
      });

      inFlight.set(year, request);
      return request;
    },
    clear() {
      cache.clear();
      inFlight.clear();
    },
  };
}

/**
 * The provider the app uses. A remote endpoint is opt-in at build time; with no
 * endpoint configured this is the curated dataset behind the same cache, so the
 * call sites never change.
 */
const remoteEndpoint = import.meta.env.VITE_EVENT_CALENDAR_ENDPOINT as string | undefined;

export const calendarProvider: CachedCalendarProvider = createCachedCalendarProvider(
  remoteEndpoint ? createHttpCalendarProvider({ endpoint: remoteEndpoint }) : curatedCalendarProvider,
  curatedCalendarProvider,
);

/**
 * Loads and normalises several years at once.
 * Never throws: a year that fails contributes no records.
 */
export async function loadEventsForYears(
  years: readonly number[],
  provider: CalendarProvider = calendarProvider,
): Promise<EventDefinition[]> {
  const uniqueYears = Array.from(new Set(years.filter((year) => Number.isInteger(year))));
  if (uniqueYears.length === 0) return [];

  const results = await Promise.all(
    uniqueYears.map(async (year) => {
      try {
        return await provider.getYear(year);
      } catch {
        return null;
      }
    }),
  );

  const records = results.flatMap((data) => data?.records ?? []);
  return buildEventDefinitions(records);
}
