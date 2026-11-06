import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeAtmosphere } from "./HomeAtmosphere";

function setReducedMotion(reduced: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reduced : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("HomeAtmosphere", () => {
  it("opens at night and clears to daylight on its own", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const { container } = render(<HomeAtmosphere />);
    const atmos = () => container.querySelector(".zf-atmos");

    expect(atmos()).toHaveAttribute("data-phase", "night");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(atmos()).toHaveAttribute("data-phase", "dawn");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(atmos()).toHaveAttribute("data-phase", "day");
  });

  it("is decorative and cannot be interacted with", () => {
    setReducedMotion(false);
    const { container } = render(<HomeAtmosphere />);
    const atmos = container.querySelector(".zf-atmos") as HTMLElement;

    expect(atmos).toHaveAttribute("aria-hidden", "true");
    expect(atmos.querySelector("button, a, input, [tabindex]")).toBeNull();
  });

  it("does not replay the sequence later in the same session", () => {
    setReducedMotion(false);
    sessionStorage.setItem("zf.home.atmosphere", "1");

    const { container } = render(<HomeAtmosphere />);

    expect(container.querySelector(".zf-atmos")).toHaveAttribute("data-phase", "day");
  });

  it("skips the sequence entirely under reduced motion", () => {
    setReducedMotion(true);

    const { container } = render(<HomeAtmosphere />);

    expect(container.querySelector(".zf-atmos")).toHaveAttribute("data-phase", "day");
  });

  it("clears its timer on unmount instead of updating a dead component", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<HomeAtmosphere />);

    unmount();

    expect(clear).toHaveBeenCalled();
    // Advancing past both transitions must not throw or touch the old tree.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it("marks the session as seen once it starts", async () => {
    setReducedMotion(false);
    render(<HomeAtmosphere />);

    await waitFor(() => expect(sessionStorage.getItem("zf.home.atmosphere")).toBe("1"));
  });

  it("holds night for the chrome, then finishes the resolve within 1900ms", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const { container } = render(<HomeAtmosphere />);
    const atmos = container.querySelector(".zf-atmos");

    act(() => vi.advanceTimersByTime(649));
    expect(atmos).toHaveAttribute("data-phase", "night");
    act(() => vi.advanceTimersByTime(1));
    expect(atmos).toHaveAttribute("data-phase", "dawn");
    act(() => vi.advanceTimersByTime(1250));
    expect(atmos).toHaveAttribute("data-phase", "day");
  });

  it("releases every decorative sky and veil layer once daylight settles", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const { container } = render(<HomeAtmosphere />);
    expect(container.querySelectorAll(".zf-atmos-veil i")).toHaveLength(24);

    act(() => vi.advanceTimersByTime(650));
    act(() => vi.advanceTimersByTime(1250));

    expect(container.querySelector(".zf-atmos")?.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not mount hidden animation layers when the intro is skipped", () => {
    setReducedMotion(true);
    const { container } = render(<HomeAtmosphere />);
    expect(container.querySelector(".zf-atmos")?.children).toHaveLength(0);
  });

  it("keeps the intro marker stable after settling so card entrances cannot restart", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    const { container } = render(<HomeAtmosphere />);
    const atmos = container.querySelector(".zf-atmos");
    expect(atmos).toHaveAttribute("data-intro");

    act(() => vi.advanceTimersByTime(650));
    act(() => vi.advanceTimersByTime(1250));
    expect(atmos).toHaveAttribute("data-intro");
  });

  it("settles immediately if reduced motion is enabled during the intro", () => {
    vi.useFakeTimers();
    const media = new EventTarget();
    Object.assign(media, { matches: false, media: "(prefers-reduced-motion: reduce)" });
    vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
    const { container } = render(<HomeAtmosphere />);

    act(() => {
      Object.assign(media, { matches: true });
      media.dispatchEvent(new Event("change"));
    });

    expect(container.querySelector(".zf-atmos")).toHaveAttribute("data-phase", "day");
    expect(container.querySelector(".zf-atmos")?.children).toHaveLength(0);

    // jsdom's sessionStorage queues a 0ms macrotask to dispatch its "storage"
    // event. That is the DOM's timer, not ours — flush it so the count below
    // only measures timers this component owns.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
  });
});
