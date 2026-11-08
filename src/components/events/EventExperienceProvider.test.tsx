import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventResolution } from "@/lib/events/types";
import { EventExperienceProvider, useFestivalExperience } from "./EventExperienceProvider";
import { rememberDismissal } from "./dismissal";
import { useActiveEvent } from "./useActiveEvent";

vi.mock("./useActiveEvent", () => ({ useActiveEvent: vi.fn() }));

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

const renders: boolean[] = [];
function Consumer() {
  const value = useFestivalExperience();
  renders.push(value.dismissed);
  return <>
    <span>{value.dismissed ? "hidden" : "visible"}</span>
    <button onClick={value.dismiss}>Dismiss</button>
    <button onClick={value.restore}>Restore</button>
  </>;
}

describe("shared festival dismissal", () => {
  beforeEach(() => {
    localStorage.clear();
    renders.length = 0;
    vi.mocked(useActiveEvent).mockReturnValue(resolution);
  });

  it("honors stored dismissal on the first consumer render", () => {
    rememberDismissal("diwali", "2026-11-09");
    render(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(renders[0]).toBe(true);
    fireEvent.click(screen.getByText("Restore"));
    expect(screen.getByText("visible")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("reads dismissal when an event resolves and when its window changes", () => {
    rememberDismissal("diwali", "2026-11-09");
    vi.mocked(useActiveEvent).mockReturnValue(null);
    const view = render(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    vi.mocked(useActiveEvent).mockReturnValue(resolution);
    renders.length = 0;
    view.rerender(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(renders[0]).toBe(true);
    vi.mocked(useActiveEvent).mockReturnValue({
      ...resolution,
      active: { ...resolution.active!, window: { start: "2027-10-28", end: "2027-10-30" } },
    });
    view.rerender(<EventExperienceProvider><Consumer /></EventExperienceProvider>);
    expect(screen.getByText("visible")).toBeInTheDocument();
  });
});
