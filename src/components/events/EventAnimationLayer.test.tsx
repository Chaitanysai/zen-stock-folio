import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AnimationId } from "@/lib/events/animationIds";
import type { EventResolution } from "@/lib/events/types";
import { EventAnimationLayerView } from "./EventAnimationLayer";

const resolution = (animationId: string, id = animationId): EventResolution => ({
  today: "2026-11-08",
  active: {
    event: {
      id,
      name: id,
      category: "festival",
      country: "IN",
      date: "2026-11-08",
      timezone: "Asia/Kolkata",
      animationId: animationId as AnimationId,
      priority: 100,
      displayDaysBefore: 1,
      displayDaysAfter: 1,
    },
    animationId: animationId as AnimationId,
    window: { start: "2026-11-07", end: "2026-11-09" },
    dayOffset: 0,
    isEventDay: true,
  },
  next: null,
});

const emptyResolution: EventResolution = { today: "2026-11-10", active: null, next: null };

describe("EventAnimationLayerView", () => {
  it("renders the Diwali animation for a Diwali resolution", async () => {
    const { container } = render(<EventAnimationLayerView resolution={resolution("diwali")} />);

    await waitFor(() => expect(container.querySelector(".zl-ev-diwali")).not.toBeNull());

    const layer = container.querySelector(".zl-event");
    expect(layer).toHaveAttribute("data-animation", "diwali");
    expect(layer).toHaveAttribute("data-event", "diwali");
    expect(layer).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the Christmas animation for a Christmas resolution", async () => {
    const { container } = render(
      <EventAnimationLayerView resolution={resolution("christmas")} />,
    );

    await waitFor(() => expect(container.querySelector(".zl-ev-christmas")).not.toBeNull());
    expect(container.querySelector(".zl-event")).toHaveAttribute("data-animation", "christmas");
  });

  it("renders nothing when no event is active", () => {
    const { container } = render(<EventAnimationLayerView resolution={emptyResolution} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing before the first resolve", () => {
    const { container } = render(<EventAnimationLayerView resolution={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("fails safely for an unknown animation id", () => {
    const { container } = render(
      <EventAnimationLayerView resolution={resolution("not-registered")} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("respects reduced motion", async () => {
    const { container } = render(
      <EventAnimationLayerView resolution={resolution("diwali")} reducedMotion />,
    );

    await waitFor(() => expect(container.querySelector(".zl-ev-diwali")).not.toBeNull());

    expect(container.querySelector(".zl-event")).toHaveAttribute("data-reduced", "1");
    expect(container.querySelectorAll(".zl-ev-particle")).toHaveLength(0);
    // The static composition is still there: three lit diyas.
    expect(container.querySelectorAll(".zl-ev-diya")).toHaveLength(3);
  });

  it("marks the layer paused while the tab is hidden", async () => {
    const { container } = render(
      <EventAnimationLayerView resolution={resolution("christmas")} paused />,
    );

    await waitFor(() => expect(container.querySelector(".zl-ev-christmas")).not.toBeNull());
    expect(container.querySelector(".zl-event")).toHaveAttribute("data-paused", "1");
  });
});
