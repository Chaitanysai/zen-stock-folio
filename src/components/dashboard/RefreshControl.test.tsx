import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshControl, type RefreshOutcome } from "./RefreshControl";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderControl(
  initial: { busy?: boolean } = {},
  onRefresh: () => Promise<RefreshOutcome> = () => new Promise(() => {}),
) {
  const refresh = vi.fn(onRefresh);
  const ui = (busy: boolean) => (
    <TooltipProvider>
      <RefreshControl busy={busy} onRefresh={refresh} />
    </TooltipProvider>
  );
  const view = render(ui(initial.busy ?? false));
  return {
    onRefresh: refresh,
    control: () => screen.getByRole("button", { name: "Refresh dashboard" }),
    update: (busy: boolean) => view.rerender(ui(busy)),
    ...view,
  };
}

async function resolve<T>(request: Deferred<T>, value: T) {
  await act(async () => {
    request.resolve(value);
    await request.promise;
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RefreshControl", () => {
  it("rests as an idle circular arc with no loader running", () => {
    const { control } = renderControl();
    const button = control();

    expect(button).toHaveAttribute("data-phase", "idle");
    expect(button).toHaveAttribute("aria-busy", "false");
    // The arc is the whole control: one decorative stroke, nothing layered over it.
    const svg = button.querySelector(".zf-refresh-spinner");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelectorAll("circle")).toHaveLength(1);
    expect(button.querySelector(".zf-refresh-arc")).not.toBeNull();
  });

  it("starts exactly one request and ignores a burst while it is pending", () => {
    const request = deferred<RefreshOutcome>();
    const { control, onRefresh } = renderControl({}, () => request.promise);

    act(() => {
      control().click();
      control().click();
      control().click();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(control()).toHaveAttribute("data-phase", "spinning");
    expect(control()).toHaveAttribute("aria-busy", "true");
  });

  it("returns directly to the quiet idle arc after an instant success", async () => {
    const { control } = renderControl({}, () => Promise.resolve("success"));

    fireEvent.click(control());
    await act(async () => Promise.resolve());

    expect(control()).toHaveAttribute("data-phase", "idle");
    // Success is silent: the same arc, no tick or confirmation phase.
    expect(control().querySelector(".zf-refresh-arc")).not.toBeNull();
    expect(control().querySelector(".zf-refresh-tick")).toBeNull();
  });

  it("shows error for an instant failed response that never raises busy", async () => {
    const { control } = renderControl({}, () => Promise.resolve("error"));

    fireEvent.click(control());
    await act(async () => Promise.resolve());

    expect(control()).toHaveAttribute("data-phase", "error");
    expect(control()).not.toHaveAttribute("data-phase", "success");
    // Failure recolours the arc rather than replacing it with another mark.
    expect(control().querySelector(".zf-refresh-arc")).not.toBeNull();
    expect(control().querySelector(".zf-refresh-failure")).toBeNull();
  });

  it("keeps spinning through a delayed success, including a busy transition", async () => {
    const request = deferred<RefreshOutcome>();
    const { control, update } = renderControl({}, () => request.promise);

    fireEvent.click(control());
    update(true);
    expect(control()).toHaveAttribute("data-phase", "spinning");
    expect(control()).toHaveAttribute("aria-busy", "true");

    await resolve(request, "success");
    expect(control()).toHaveAttribute("data-phase", "idle");

    update(false);
    expect(control()).toHaveAttribute("aria-busy", "false");
  });

  it("shows error after a delayed failure rather than minting a tick", async () => {
    const request = deferred<RefreshOutcome>();
    const { control } = renderControl({}, () => request.promise);

    fireEvent.click(control());
    expect(control()).toHaveAttribute("data-phase", "spinning");

    await resolve(request, "error");
    expect(control()).toHaveAttribute("data-phase", "error");
    expect(control()).not.toHaveAttribute("data-phase", "success");
  });

  it("treats a rejected request as an error", async () => {
    const request = deferred<RefreshOutcome>();
    const { control } = renderControl({}, () => request.promise);

    fireEvent.click(control());
    await act(async () => {
      request.reject(new Error("offline"));
      try {
        await request.promise;
      } catch {
        // The control owns the rejected request and converts it to its error state.
      }
    });

    expect(control()).toHaveAttribute("data-phase", "error");
  });

  it("does not present a coalesced refresh as success or failure", async () => {
    const { control } = renderControl({}, () => Promise.resolve("skipped"));

    fireEvent.click(control());
    await act(async () => Promise.resolve());

    expect(control()).toHaveAttribute("data-phase", "idle");
    expect(control()).not.toHaveAttribute("data-phase", "success");
    expect(control()).not.toHaveAttribute("data-phase", "error");
  });

  it("does not animate when an unrelated background poll starts and settles", () => {
    const { control, update } = renderControl();

    update(true);
    update(false);

    expect(control()).toHaveAttribute("data-phase", "idle");
  });

  it("cannot be completed by the error timer from an earlier refresh", async () => {
    vi.useFakeTimers();
    const first = deferred<RefreshOutcome>();
    const second = deferred<RefreshOutcome>();
    const outcomes = [first, second];
    const { control } = renderControl({}, () => outcomes.shift()!.promise);

    fireEvent.click(control());
    await resolve(first, "error");
    expect(control()).toHaveAttribute("data-phase", "error");

    fireEvent.click(control());
    expect(control()).toHaveAttribute("data-phase", "spinning");
    act(() => vi.advanceTimersByTime(2500));
    expect(control()).toHaveAttribute("data-phase", "spinning");

    await resolve(second, "error");
    expect(control()).toHaveAttribute("data-phase", "error");
  });

  it("shows a failure briefly before returning to idle", async () => {
    vi.useFakeTimers();
    const { control } = renderControl({}, () => Promise.resolve("error"));

    fireEvent.click(control());
    await act(async () => Promise.resolve());
    expect(control()).toHaveAttribute("data-phase", "error");

    act(() => vi.advanceTimersByTime(2500));
    expect(control()).toHaveAttribute("data-phase", "idle");
  });
});
