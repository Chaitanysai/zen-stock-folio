import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketStatus } from "./useMarketStatus";

/**
 * Verifies requirement 6 and 10: the status updates itself as the session
 * boundary passes (no page reload, no refetch) and every timer is released on
 * unmount.
 *
 * All instants are UTC; IST is UTC+05:30.
 */
describe("useMarketStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions from LIVE to MARKET CLOSED at 15:30 IST without a reload", () => {
    // 15:29:30 IST on Tuesday 2026-10-13
    vi.setSystemTime(new Date("2026-10-13T09:59:30Z"));

    const { result, unmount } = renderHook(() => useMarketStatus());

    expect(result.current.label).toBe("LIVE");
    expect(result.current.isOpen).toBe(true);

    // Cross 15:30 IST purely by letting time pass.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.istTime).toBe("15:30");
    expect(result.current.isOpen).toBe(false);
    expect(result.current.label).toBe("MARKET CLOSED");

    unmount();
  });

  it("transitions from PRE-OPEN to LIVE at 09:15 IST without a reload", () => {
    // 09:14:30 IST
    vi.setSystemTime(new Date("2026-10-13T03:44:30Z"));

    const { result, unmount } = renderHook(() => useMarketStatus());
    expect(result.current.label).toBe("PRE-OPEN");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.label).toBe("LIVE");
    expect(result.current.isOpen).toBe(true);

    unmount();
  });

  it("releases its timer when the last subscriber unmounts", () => {
    vi.setSystemTime(new Date("2026-10-13T09:59:30Z"));

    const first = renderHook(() => useMarketStatus());
    const second = renderHook(() => useMarketStatus());

    // One shared timer for both subscribers.
    expect(vi.getTimerCount()).toBe(1);

    first.unmount();
    expect(vi.getTimerCount()).toBe(1);

    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
