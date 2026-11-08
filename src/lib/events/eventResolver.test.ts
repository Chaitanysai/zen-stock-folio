import { describe, expect, it } from "vitest";
import type { AnimationId } from "./animationIds";
import { resolveEvents } from "./eventResolver";
import type { EventDefinition } from "./types";

const baseEvent = (overrides: Partial<EventDefinition> = {}): EventDefinition => ({
  id: "diwali",
  name: "Diwali",
  category: "festival",
  country: "IN",
  date: "2026-11-08",
  timezone: "Asia/Kolkata",
  animationId: "diwali",
  priority: 100,
  displayDaysBefore: 1,
  displayDaysAfter: 1,
  ...overrides,
});

/** An instant that is midday on the given IST date. */
const istNoon = (isoDate: string): Date => new Date(`${isoDate}T12:00:00+05:30`);

describe("resolveEvents — display window", () => {
  const events = [baseEvent()];

  it("is active the day before the event", () => {
    const result = resolveEvents(events, istNoon("2026-11-07"));
    expect(result.active?.event.id).toBe("diwali");
    expect(result.active?.dayOffset).toBe(-1);
    expect(result.active?.isEventDay).toBe(false);
    expect(result.active?.window).toEqual({ start: "2026-11-07", end: "2026-11-09" });
  });

  it("is active on the event day", () => {
    const result = resolveEvents(events, istNoon("2026-11-08"));
    expect(result.active?.event.id).toBe("diwali");
    expect(result.active?.dayOffset).toBe(0);
    expect(result.active?.isEventDay).toBe(true);
  });

  it("is active the day after the event", () => {
    const result = resolveEvents(events, istNoon("2026-11-09"));
    expect(result.active?.event.id).toBe("diwali");
    expect(result.active?.dayOffset).toBe(1);
  });

  it("is inactive on the first day outside the window", () => {
    const result = resolveEvents(events, istNoon("2026-11-10"));
    expect(result.active).toBeNull();
  });

  it("is inactive the day before the window opens", () => {
    const result = resolveEvents(events, istNoon("2026-11-06"));
    expect(result.active).toBeNull();
  });

  it("honours a zero-day window", () => {
    const single = [baseEvent({ displayDaysBefore: 0, displayDaysAfter: 0 })];
    expect(resolveEvents(single, istNoon("2026-11-07")).active).toBeNull();
    expect(resolveEvents(single, istNoon("2026-11-08")).active?.event.id).toBe("diwali");
    expect(resolveEvents(single, istNoon("2026-11-09")).active).toBeNull();
  });

  it("treats a multi-day observance as event days throughout", () => {
    const multi = [baseEvent({ date: "2026-11-08", endDate: "2026-11-10" })];
    const result = resolveEvents(multi, istNoon("2026-11-09"));
    expect(result.active?.isEventDay).toBe(true);
    expect(result.active?.dayOffset).toBe(1);
    expect(result.active?.window).toEqual({ start: "2026-11-07", end: "2026-11-11" });
  });
});

describe("resolveEvents — Asia/Kolkata boundaries", () => {
  const events = [baseEvent()];

  it("uses the IST date, not the UTC date", () => {
    // A zero-day window opens on the event date itself, so the only thing that
    // can make it active is the IST rollover at 18:30 UTC.
    const eventDayOnly = [baseEvent({ displayDaysBefore: 0 })];
    expect(resolveEvents(eventDayOnly, new Date("2026-11-07T18:29:59Z")).active).toBeNull();
    expect(resolveEvents(eventDayOnly, new Date("2026-11-07T18:30:00Z")).active?.event.id).toBe(
      "diwali",
    );
  });

  it("reports today in IST", () => {
    expect(resolveEvents(events, new Date("2026-11-07T18:30:00Z")).today).toBe("2026-11-08");
  });
});

describe("resolveEvents — year boundaries", () => {
  it("handles an event whose window starts in the previous year", () => {
    const newYear = [
      baseEvent({
        id: "new-year",
        name: "New Year's Day",
        date: "2027-01-01",
        animationId: "christmas",
        priority: 60,
      }),
    ];
    const result = resolveEvents(newYear, istNoon("2026-12-31"));
    expect(result.active?.event.id).toBe("new-year");
    expect(result.active?.window).toEqual({ start: "2026-12-31", end: "2027-01-02" });
  });

  it("handles an event whose window ends in the next year", () => {
    const eve = [
      baseEvent({
        id: "new-year",
        name: "New Year's Day",
        date: "2026-12-31",
        animationId: "christmas",
        priority: 60,
      }),
    ];
    expect(resolveEvents(eve, istNoon("2027-01-01")).active?.event.id).toBe("new-year");
    expect(resolveEvents(eve, istNoon("2027-01-02")).active).toBeNull();
  });

  it("selects the event from the correct year", () => {
    const events = [
      baseEvent({ date: "2026-11-08" }),
      baseEvent({ date: "2027-10-29" }),
    ];
    expect(resolveEvents(events, istNoon("2026-11-08")).active?.event.date).toBe("2026-11-08");
    expect(resolveEvents(events, istNoon("2027-10-29")).active?.event.date).toBe("2027-10-29");
    expect(resolveEvents(events, istNoon("2027-10-30")).active?.event.date).toBe("2027-10-29");
  });
});

describe("resolveEvents — conflicts and priority", () => {
  it("picks the higher priority when two windows overlap", () => {
    const events = [
      baseEvent({ id: "christmas", name: "Christmas", date: "2026-12-25", animationId: "christmas", priority: 80 }),
      baseEvent({ id: "diwali", name: "Diwali", date: "2026-12-25", priority: 100 }),
    ];
    const result = resolveEvents(events, istNoon("2026-12-25"));
    expect(result.active?.event.id).toBe("diwali");
    expect(result.active?.animationId).toBe("diwali");
  });

  it("never returns two active events", () => {
    const events = [
      baseEvent({ id: "christmas", name: "Christmas", date: "2026-12-25", animationId: "christmas", priority: 80 }),
      baseEvent({ id: "diwali", name: "Diwali", date: "2026-12-25", priority: 100 }),
    ];
    const result = resolveEvents(events, istNoon("2026-12-25"));
    expect(result.active).not.toBeNull();
    expect(Array.isArray(result.active)).toBe(false);
  });

  it("breaks a priority tie by the earlier window start, then by id", () => {
    const samePriority = [
      baseEvent({ id: "b-event", name: "B", date: "2026-11-09", priority: 50 }),
      baseEvent({ id: "a-event", name: "A", date: "2026-11-08", priority: 50 }),
    ];
    expect(resolveEvents(samePriority, istNoon("2026-11-09")).active?.event.id).toBe("a-event");

    const sameStart = [
      baseEvent({ id: "z-event", name: "Z", date: "2026-11-08", priority: 50 }),
      baseEvent({ id: "a-event", name: "A", date: "2026-11-08", priority: 50 }),
    ];
    expect(resolveEvents(sameStart, istNoon("2026-11-08")).active?.event.id).toBe("a-event");
  });
});

describe("resolveEvents — next upcoming event", () => {
  it("returns the nearest future window", () => {
    const events = [
      baseEvent({ id: "diwali", name: "Diwali", date: "2026-11-08" }),
      baseEvent({ id: "christmas", name: "Christmas", date: "2026-12-25", animationId: "christmas", priority: 80 }),
    ];
    const result = resolveEvents(events, istNoon("2026-11-10"));
    expect(result.active).toBeNull();
    expect(result.next?.event.id).toBe("christmas");
    expect(result.next?.startsOn).toBe("2026-12-24");
    expect(result.next?.daysUntil).toBe(44);
  });

  it("returns null when nothing is upcoming", () => {
    const result = resolveEvents([baseEvent()], istNoon("2026-11-10"));
    expect(result.next).toBeNull();
  });

  it("does not report the active event as upcoming", () => {
    const result = resolveEvents([baseEvent()], istNoon("2026-11-08"));
    expect(result.next).toBeNull();
  });
});

describe("resolveEvents — malformed data", () => {
  it("ignores an invalid date", () => {
    expect(resolveEvents([baseEvent({ date: "2026-02-30" })], istNoon("2026-02-28")).active).toBeNull();
  });

  it("ignores an unknown animation id", () => {
    const unknown = baseEvent({ animationId: "not-registered" as AnimationId });
    expect(resolveEvents([unknown], istNoon("2026-11-08")).active).toBeNull();
  });

  it("ignores negative or fractional display windows", () => {
    expect(resolveEvents([baseEvent({ displayDaysBefore: -1 })], istNoon("2026-11-08")).active).toBeNull();
    expect(resolveEvents([baseEvent({ displayDaysAfter: 1.5 })], istNoon("2026-11-08")).active).toBeNull();
  });

  it("ignores an end date before the start date", () => {
    const inverted = baseEvent({ date: "2026-11-08", endDate: "2026-11-01" });
    expect(resolveEvents([inverted], istNoon("2026-11-08")).active).toBeNull();
  });

  it("survives an empty list", () => {
    const result = resolveEvents([], istNoon("2026-11-08"));
    expect(result.active).toBeNull();
    expect(result.next).toBeNull();
    expect(result.today).toBe("2026-11-08");
  });
});

describe("resolveEvents — leap years", () => {
  it("resolves a 29 February event and its window", () => {
    const leap = [baseEvent({ id: "leap", name: "Leap", date: "2028-02-29" })];
    expect(resolveEvents(leap, istNoon("2028-02-28")).active?.event.id).toBe("leap");
    expect(resolveEvents(leap, istNoon("2028-02-29")).active?.isEventDay).toBe(true);
    expect(resolveEvents(leap, istNoon("2028-03-01")).active?.event.id).toBe("leap");
    expect(resolveEvents(leap, istNoon("2028-03-02")).active).toBeNull();
  });
});
