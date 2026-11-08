import { describe, expect, it, vi } from "vitest";
import {
  createCachedCalendarProvider,
  createHttpCalendarProvider,
  curatedCalendarProvider,
  loadEventsForYears,
  type CalendarProvider,
} from "./calendarProvider";
import type { CalendarYearData } from "./types";

const yearData = (year: number, records: CalendarYearData["records"]): CalendarYearData => ({
  year,
  coverage: "verified",
  source: "test",
  retrievedAt: "2026-11-08",
  records,
});

const diwaliRecord = {
  id: "diwali",
  name: "Diwali",
  category: "festival" as const,
  country: "IN" as const,
  date: "2026-11-08",
  timezone: "Asia/Kolkata",
};

describe("curated provider", () => {
  it("returns the transcribed 2026 calendar", async () => {
    const data = await curatedCalendarProvider.getYear(2026);
    expect(data?.year).toBe(2026);
    expect(data?.coverage).toBe("verified");
    expect(data?.records.map((record) => record.id)).toEqual(
      expect.arrayContaining(["diwali", "christmas"]),
    );
    expect(data?.records.find((record) => record.id === "diwali")?.date).toBe("2026-11-08");
  });

  it("returns the transcribed 2027 calendar", async () => {
    const data = await curatedCalendarProvider.getYear(2027);
    expect(data?.records.find((record) => record.id === "diwali")?.date).toBe("2027-10-29");
    expect(data?.records.find((record) => record.id === "christmas")?.date).toBe("2027-12-25");
  });

  it("returns null for a year that has not been transcribed", async () => {
    expect(await curatedCalendarProvider.getYear(2031)).toBeNull();
  });
});

describe("cached provider", () => {
  it("requests a year once and serves the rest from cache", async () => {
    const primary: CalendarProvider = {
      id: "spy",
      getYear: vi.fn(async (year: number) => yearData(year, [diwaliRecord])),
    };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    await provider.getYear(2026);
    await provider.getYear(2026);
    await provider.getYear(2026);

    expect(primary.getYear).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const primary: CalendarProvider = {
      id: "slow",
      getYear: vi.fn(async (year: number) => yearData(year, [diwaliRecord])),
    };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    await Promise.all([provider.getYear(2026), provider.getYear(2026), provider.getYear(2026)]);

    expect(primary.getYear).toHaveBeenCalledTimes(1);
  });

  it("falls back when the primary throws", async () => {
    const primary: CalendarProvider = {
      id: "broken",
      getYear: vi.fn(async () => {
        throw new Error("upstream down");
      }),
    };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    const data = await provider.getYear(2026);
    expect(data?.records.some((record) => record.id === "diwali")).toBe(true);
  });

  it("falls back when the primary returns null", async () => {
    const primary: CalendarProvider = { id: "empty", getYear: async () => null };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    expect((await provider.getYear(2026))?.year).toBe(2026);
  });

  it("falls back when the primary returns no records", async () => {
    const primary: CalendarProvider = {
      id: "blank",
      getYear: async (year) => yearData(year, []),
    };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    expect((await provider.getYear(2026))?.records.length).toBeGreaterThan(0);
  });

  it("returns null when neither provider has the year", async () => {
    const primary: CalendarProvider = { id: "empty", getYear: async () => null };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    expect(await provider.getYear(2031)).toBeNull();
  });

  it("clear() drops the cache", async () => {
    const primary: CalendarProvider = {
      id: "spy",
      getYear: vi.fn(async (year: number) => yearData(year, [diwaliRecord])),
    };
    const provider = createCachedCalendarProvider(primary, curatedCalendarProvider);

    await provider.getYear(2026);
    provider.clear();
    await provider.getYear(2026);

    expect(primary.getYear).toHaveBeenCalledTimes(2);
  });
});

describe("http provider", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  it("normalises a records payload", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        coverage: "provisional",
        source: "test endpoint",
        records: [
          {
            id: "diwali",
            name: "Diwali",
            category: "festival",
            country: "IN",
            date: "2026-11-08",
            timezone: "Asia/Kolkata",
            regions: ["IN-TG"],
          },
        ],
      }),
    );

    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const data = await provider.getYear(2026);
    expect(data?.coverage).toBe("provisional");
    expect(data?.records).toHaveLength(1);
    expect(data?.records[0].regions).toEqual(["IN-TG"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/events/calendar?year=2026",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });

  it("accepts a holidays payload", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ holidays: [{ ...diwaliRecord }] }),
    );
    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect((await provider.getYear(2026))?.records).toHaveLength(1);
  });

  it("drops records with an unknown category or country", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        records: [
          { ...diwaliRecord },
          { ...diwaliRecord, id: "bad-category", category: "space-weather" },
          { ...diwaliRecord, id: "bad-country", country: "ZZ" },
          { ...diwaliRecord, id: "no-name", name: "" },
        ],
      }),
    );
    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const data = await provider.getYear(2026);
    expect(data?.records.map((record) => record.id)).toEqual(["diwali"]);
  });

  it("returns null for a malformed payload", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));
    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.getYear(2026)).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ records: [diwaliRecord] }, 503));
    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.getYear(2026)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });
    const provider = createHttpCalendarProvider({
      endpoint: "/api/events/calendar",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await provider.getYear(2026)).toBeNull();
  });
});

describe("loadEventsForYears", () => {
  it("maps calendar records through the event registry", async () => {
    const events = await loadEventsForYears([2026], curatedCalendarProvider);
    expect(events.map((event) => event.id).sort()).toEqual(["christmas", "diwali"]);
    expect(events.every((event) => event.displayDaysBefore === 1)).toBe(true);
  });

  it("ignores years with no data", async () => {
    const events = await loadEventsForYears([2031], curatedCalendarProvider);
    expect(events).toEqual([]);
  });

  it("dedupes the same event across years", async () => {
    const events = await loadEventsForYears([2026, 2026], curatedCalendarProvider);
    expect(events.filter((event) => event.id === "diwali")).toHaveLength(1);
  });

  it("never throws when the provider fails", async () => {
    const broken: CalendarProvider = {
      id: "broken",
      getYear: async () => {
        throw new Error("down");
      },
    };
    await expect(loadEventsForYears([2026], broken)).resolves.toEqual([]);
  });
});
