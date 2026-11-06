import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshControl } from "./RefreshControl";

function renderControl(initial: { busy?: boolean; failed?: boolean } = {}) {
  const onRefresh = vi.fn();
  const ui = (busy: boolean, failed: boolean) => (
    <TooltipProvider>
      <RefreshControl busy={busy} failed={failed} onRefresh={onRefresh} />
    </TooltipProvider>
  );
  const view = render(ui(initial.busy ?? false, initial.failed ?? false));
  return {
    onRefresh,
    control: () => screen.getByRole("button", { name: "Refresh dashboard" }),
    update: (busy: boolean, failed = false) => view.rerender(ui(busy, failed)),
    ...view,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RefreshControl", () => {
  it("rests as an idle glass control with a decorative glyph", () => {
    const { control } = renderControl();
    const button = control();

    expect(button).toHaveAttribute("data-phase", "idle");
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button.querySelector(".zf-refresh-glyph")).toHaveAttribute("aria-hidden", "true");
  });

  it("starts the spin on click and reports one request", () => {
    const { control, onRefresh } = renderControl();

    fireEvent.click(control());

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(control()).toHaveAttribute("data-phase", "spinning");
    expect(control()).toHaveAttribute("aria-busy", "true");
  });

  it("ignores a second click while the request is running", () => {
    const { control, onRefresh } = renderControl();

    fireEvent.click(control());
    fireEvent.click(control());

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of clicks in the same tick into one request", () => {
    const { control, onRefresh } = renderControl();

    act(() => {
      const button = control();
      button.click();
      button.click();
      button.click();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps spinning while the request is busy and does not accept clicks", () => {
    const { control, onRefresh, update } = renderControl();
    fireEvent.click(control());

    update(true);
    expect(control()).toHaveAttribute("aria-busy", "true");
    expect(control()).toHaveAttribute("data-phase", "spinning");

    fireEvent.click(control());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("mints into a tick only after the request settles successfully", () => {
    const { control, update } = renderControl();
    fireEvent.click(control());

    update(true);
    expect(control()).toHaveAttribute("data-phase", "spinning");

    update(false, false);
    expect(control()).toHaveAttribute("data-phase", "success");
    expect(control()).toHaveAttribute("aria-busy", "false");
    expect(control().querySelector(".zf-refresh-tick")).not.toBeNull();
  });

  it("shows a restrained error and never the tick after a failed request", () => {
    const { control, update } = renderControl();
    fireEvent.click(control());

    update(true, true);
    update(false, true);

    expect(control()).toHaveAttribute("data-phase", "error");
    expect(control()).not.toHaveAttribute("data-phase", "success");
  });

  it("returns to idle after the outcome has been shown", () => {
    vi.useFakeTimers();
    const { control, update } = renderControl();
    fireEvent.click(control());
    update(true);
    update(false, false);
    expect(control()).toHaveAttribute("data-phase", "success");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(control()).toHaveAttribute("data-phase", "idle");
  });

  it("does not animate on its own when a request finishes elsewhere", () => {
    const { control, update } = renderControl();

    update(true);
    update(false, false);

    expect(control()).toHaveAttribute("data-phase", "idle");
  });
});
