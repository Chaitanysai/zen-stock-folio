import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Refresh control.
 *
 * The motion is driven by the real price request, never by a timer of its own:
 * a click starts the spin, the spin ends when the parent's `busy` flag falls,
 * and the outcome is read from the same `failed` flag the rest of the dashboard
 * reports. That keeps the badge from claiming success before the request has
 * actually finished, and from ever showing a tick after a failure.
 *
 * A click is ignored while a request is running, so a double click cannot
 * produce two requests (the data hook also collapses duplicates).
 */

export type RefreshPhase = "idle" | "spinning" | "success" | "error";

/** How long the outcome stays on screen before the control returns to idle. */
const SUCCESS_HOLD_MS = 1400;
const ERROR_HOLD_MS = 2200;
/** A request that resolves without ever flipping `busy` (cached reply) still ends. */
const GUARD_MS = 400;

interface RefreshControlProps {
  /** True while the underlying price request is in flight. */
  busy?: boolean;
  /** True when the last request reported an error. */
  failed?: boolean;
  onRefresh: () => void;
}

export function RefreshControl({ busy = false, failed = false, onRefresh }: RefreshControlProps) {
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const requested = useRef(false);
  const sawBusy = useRef(false);
  // Set synchronously on click: React state is not committed yet when a second
  // click lands in the same tick, so a state-only guard still lets it through.
  const inFlight = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (guardTimer.current) clearTimeout(guardTimer.current);
    holdTimer.current = null;
    guardTimer.current = null;
  };

  const settle = useCallback((error: boolean) => {
    requested.current = false;
    sawBusy.current = false;
    inFlight.current = false;
    setPhase(error ? "error" : "success");
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setPhase("idle");
    }, error ? ERROR_HOLD_MS : SUCCESS_HOLD_MS);
  }, []);

  useEffect(() => {
    if (busy) {
      sawBusy.current = true;
      return;
    }
    // Only a click we started can finish the animation; background polls that
    // end on their own must not flash a tick in the header.
    if (!requested.current || !sawBusy.current) return;
    settle(failed);
  }, [busy, failed, settle]);

  useEffect(() => clearTimers, []);

  const handleClick = () => {
    if (busy || inFlight.current || phase === "spinning") return;
    clearTimers();
    inFlight.current = true;
    requested.current = true;
    sawBusy.current = false;
    setPhase("spinning");
    onRefresh();
    // A cached or instantly-failing reply may never raise `busy`.
    guardTimer.current = setTimeout(() => {
      guardTimer.current = null;
      if (requested.current && !sawBusy.current) settle(failed);
    }, GUARD_MS);
  };

  const running = phase === "spinning";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="zf-refresh"
          data-phase={phase}
          aria-label="Refresh dashboard"
          aria-busy={busy || running}
          onClick={handleClick}
        >
          <span className="zf-refresh-orbit" aria-hidden="true" />
          <span className="zf-refresh-comet" aria-hidden="true" />
          <span className="zf-refresh-core">
            <svg className="zf-refresh-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {/* Two arcs chasing each other, with arrowheads on the leading tips. */}
            <path d="M20 12a8 8 0 0 1-13.1 6.1" />
            <path d="M17.4 6.6 20.8 4.9l.7 3.7" />
            <path d="M4 12a8 8 0 0 1 13.1-6.1" />
            <path d="M6.6 17.4 3.2 19.1l-.7-3.7" />
          </svg>
          <svg className="zf-refresh-tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5.2 12.6 9.6 17l9.2-10" pathLength={1} />
            </svg>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {phase === "error" ? "Refresh failed, try again" : phase === "success" ? "Updated" : "Refresh dashboard"}
      </TooltipContent>
    </Tooltip>
  );
}
