import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FestivalGreeting } from "./FestivalGreeting";
import * as providerModule from "./EventExperienceProvider";
import type { FestivalExperienceValue } from "./EventExperienceProvider";
import type { ActiveFestival } from "./types";

const DIWALI_EVENT: ActiveFestival = {
  event: {
    id: "diwali",
    name: "Diwali",
    date: "2026-11-08",
    priority: 100,
    animationId: "diwali",
    displayDaysBefore: 1,
    displayDaysAfter: 1,
  },
  animationId: "diwali",
  window: { start: "2026-11-07", end: "2026-11-09" },
};

const XMAS_EVENT: ActiveFestival = {
  event: {
    id: "christmas",
    name: "Christmas",
    date: "2026-12-25",
    priority: 80,
    animationId: "christmas",
    displayDaysBefore: 1,
    displayDaysAfter: 1,
  },
  animationId: "christmas",
  window: { start: "2026-12-24", end: "2026-12-26" },
};

function mockExperience(overrides: Partial<FestivalExperienceValue> = {}): FestivalExperienceValue {
  return {
    active: DIWALI_EVENT,
    dismissed: false,
    paused: false,
    reduced: false,
    togglePaused: vi.fn(),
    dismiss: vi.fn(),
    restore: vi.fn(),
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
    expect(screen.getByRole("button", { name: "Pause celebration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide celebration" })).toBeInTheDocument();
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

  it("omits pause button on minimal surfaces", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience());
    render(<FestivalGreeting surface="minimal" />);

    expect(screen.queryByRole("button", { name: /pause celebration/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Hide celebration" })).toBeInTheDocument();
  });

  it("calls togglePaused when pause button is clicked", () => {
    const togglePaused = vi.fn();
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience({ togglePaused }));
    render(<FestivalGreeting surface="public-hero" />);

    fireEvent.click(screen.getByRole("button", { name: "Pause celebration" }));
    expect(togglePaused).toHaveBeenCalledTimes(1);
  });

  it("shows play label when paused", () => {
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(mockExperience({ paused: true }));
    render(<FestivalGreeting surface="public-hero" />);

    const btn = screen.getByRole("button", { name: "Play celebration" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows restore button when dismissed", () => {
    const restore = vi.fn();
    vi.spyOn(providerModule, "useFestivalExperience").mockReturnValue(
      mockExperience({ dismissed: true, restore }),
    );
    render(<FestivalGreeting surface="public-hero" />);

    expect(screen.queryByRole("button", { name: "Hide celebration" })).toBeNull();
    const restoreBtn = screen.getByRole("button", { name: "Show celebration again" });
    expect(restoreBtn).toBeInTheDocument();

    fireEvent.click(restoreBtn);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
