import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshControl } from "./Shell";

function renderControl(busy = false) {
  const onRefresh = vi.fn();
  render(
    <TooltipProvider>
      <RefreshControl busy={busy} onRefresh={onRefresh} />
    </TooltipProvider>,
  );
  return onRefresh;
}

describe("RefreshControl", () => {
  it("keeps the refresh action behind a usable accessible name", () => {
    const onRefresh = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("is reachable by keyboard", () => {
    const onRefresh = renderControl();
    const control = screen.getByRole("button", { name: "Refresh dashboard" });

    act(() => control.focus());
    expect(control).toHaveFocus();
  });

  it("reports the running state without issuing requests on its own", () => {
    const onRefresh = renderControl(true);
    const control = screen.getByRole("button", { name: "Refresh dashboard" });

    expect(control).toHaveAttribute("aria-busy", "true");
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
