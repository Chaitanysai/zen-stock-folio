import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FestivalGreeting } from "./FestivalGreeting";
import * as providerModule from "./EventExperienceProvider";
import type { FestivalExperienceValue } from "./EventExperienceProvider";
import type { ResolvedEvent } from "@/lib/events/types";

const DIWALI_EVENT: ResolvedEvent = {
  event: {
    id: "diwali",
    name: "Diwali",
    date: "2026-11-08",
    category: "festival",
    country: "IN",
    timezone: "Asia/Kolkata",
    priority: 100,
    animationId: "diwali",
    displayDaysBefore: 1,
    displayDaysAfter: 1,
  },
  animationId: "diwali",
  dayOffset: 0,
  isEventDay: true,
  window: { start: "2026-11-07", end: "2026-11-09" },
};

const XMAS_EVENT: ResolvedEvent = {
  event: {
    id: "christmas",
    name: "Christmas",
    date: "2026-12-25",
    category: "festival",
    country: "IN",
    timezone: "Asia/Kolkata",
    priority: 80,
    animationId: "christmas",
    displayDaysBefore: 1,
    displayDaysAfter: 1,
  },
  animationId: "christmas",
  dayOffset: 0,
  isEventDay: true,
  window: { start: "2026-12-24", end: "2026-12-26" },
};

function mockExperience(overrides: Partial<FestivalExperienceValue> = {}): FestivalExperienceValue {
  return {
    active: DIWALI_EVENT,
    reduced: false,
    ...overrides,
  };
}

describe("FestivalGreeting component", () => {
  it("renders null when no event is active", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience({ active: null }));
    const { container } = render(<FestivalGreeting surface="public-hero" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Diwali public hero copy and Diya icon", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience());
    const { container } = render(<FestivalGreeting surface="public-hero" />);

    expect(screen.getByText(/Shubh/i)).toBeInTheDocument();
    expect(screen.getByText(/Deepavali/i)).toBeInTheDocument();
    expect(screen.getByText(/· from ZenFolio/i)).toBeInTheDocument();
    expect(container.querySelector(".fest-flame")).toBeInTheDocument();
  });

  it("renders Diwali compact copy for dashboard", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience());
    render(<FestivalGreeting surface="dashboard" />);

    expect(screen.getByText(/Happy/i)).toBeInTheDocument();
    expect(screen.getByText(/Diwali/i)).toBeInTheDocument();
    expect(screen.queryByText(/· from ZenFolio/i)).toBeNull();
  });

  it("renders Christmas copy and Pine icon", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(
      mockExperience({ active: XMAS_EVENT }),
    );
    const { container } = render(<FestivalGreeting surface="public-hero" />);

    expect(screen.getByText(/Merry/i)).toBeInTheDocument();
    expect(screen.getByText(/Christmas/i)).toBeInTheDocument();
    expect(container.querySelector(".fest-star")).toBeInTheDocument();
  });

  it("renders no controls on any surface — the experience is time-driven", () => {
    for (const surface of ["public-hero", "dashboard", "minimal"] as const) {
      vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience());
      const view = render(<FestivalGreeting surface={surface} />);
      expect(screen.queryByRole("button")).toBeNull();
      view.unmount();
    }
  });
});
