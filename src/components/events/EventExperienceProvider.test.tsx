import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventResolution } from "@/lib/events/types";
import { EventExperienceProvider, useFestivalExperience } from "./EventExperienceProvider";
import { useActiveEvent } from "./useActiveEvent";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

vi.mock("./useActiveEvent", () => ({ useActiveEvent: vi.fn() }));
vi.mock("./usePrefersReducedMotion", () => ({ usePrefersReducedMotion: vi.fn() }));

const resolution: EventResolution = {
  today: "2026-11-08",
  next: null,
  active: {
    event: {
      id: "diwali", name: "Diwali", date: "2026-11-08", category: "festival",
      country: "IN", timezone: "Asia/Kolkata", priority: 100, animationId: "diwali",
      displayDaysBefore: 1, displayDaysAfter: 1,
    },
    animationId: "diwali", window: { start: "2026-11-07", end: "2026-11-09" },
    dayOffset: 0, isEventDay: true,
  },
};

/** Records what each consumer saw on every render. */
function makeConsumer(sightings: { active: unknown; reduced: boolean }[]) {
  return function Consumer() {
    const value = useFestivalExperience();
    sightings.push({ active: value.active?.animationId ?? null, reduced: value.reduced });
    return <span>{value.active ? value.active.animationId : "none"}</span>;
  };
}

describe("the shared festival experience", () => {
  beforeEach(() => {
    vi.mocked(useActiveEvent).mockReturnValue(resolution);
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
  });

  it("gives every surface the same resolution", () => {
    const seen: { active: unknown; reduced: boolean }[] = [];
    const seen2: { active: unknown; reduced: boolean }[] = [];
    const First = makeConsumer(seen);
    const Second = makeConsumer(seen2);
    render(
      <EventExperienceProvider>
        <First />
        <Second />
      </EventExperienceProvider>,
    );
    expect(seen[0]).toEqual({ active: "diwali", reduced: false });
    expect(seen2[0]).toEqual(seen[0]);
  });

  it("clears the experience when the display window ends", () => {
    const seen: { active: unknown; reduced: boolean }[] = [];
    const Consumer = makeConsumer(seen);
    const view = render(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(screen.getByText("diwali")).toBeInTheDocument();

    // The resolver answers null once the window closes; the provider must pass
    // that straight through so every surface unmounts together.
    vi.mocked(useActiveEvent).mockReturnValue({ ...resolution, active: null });
    view.rerender(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(seen.at(-1)).toEqual({ active: null, reduced: false });
  });

  it("passes reduced motion through to every consumer", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(true);
    const seen: { active: unknown; reduced: boolean }[] = [];
    const Consumer = makeConsumer(seen);
    render(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(seen[0]).toEqual({ active: "diwali", reduced: true });
  });

  it("hands consumers an inactive null-object outside the provider", () => {
    const seen: { active: unknown; reduced: boolean }[] = [];
    const Consumer = makeConsumer(seen);
    render(<Consumer />);
    expect(seen[0]).toEqual({ active: null, reduced: false });
  });
});
