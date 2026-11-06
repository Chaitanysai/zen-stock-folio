import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Refresh control.
 *
 * The visual is one thin circular arc — the HeroUI v3 Spinner shape, drawn here
 * rather than pulled in with the whole library for a single icon. There is no
 * disc, bezel, track, glyph or tick: the arc is the entire control.
 *
 * The arc is a ~270° stroke whose tail fades out through a gradient, which is
 * how the official component reads: a leading edge you can follow and a tail
 * that dissolves instead of stopping dead. Rotation is 0.75s linear, matching
 * HeroUI's `--animate-spin-fast`.
 *
 * The motion is driven by the real price request, never by a timer of its own:
 * a click starts the rotation, it stops when the parent's request settles, and
 * the outcome is read from the same result the rest of the dashboard reports.
 * Success is deliberately silent — the arc simply returns to rest — so the
 * control can never claim an update that did not happen. Failure recolours the
 * same arc instead of swapping in a different mark.
 *
 * A click is ignored while a request is running, so a double click cannot
 * produce two requests (the data hook also collapses duplicates).
 */

export type RefreshPhase = "idle" | "spinning" | "error";
/** The caller owns the request and reports its actual terminal outcome. */
export type RefreshOutcome = "success" | "error" | "skipped";

/** A failed request gets a restrained, same-shape error indication before idling. */
const ERROR_HOLD_MS = 2200;

/** r=9 → circumference 56.55. A 42.4 dash is a ~270° arc; the rest is the gap. */
const ARC_LENGTH = 42.4;
const CIRCUMFERENCE = 56.55;

interface RefreshControlProps {
  /** True while the underlying price request is in flight. */
  busy?: boolean;
  /**
   * Resolves only when this click's request has reached a real terminal state.
   * `skipped` means no request was made (for example a deliberately coalesced
   * poll) and must never be presented as either success or failure.
   */
  onRefresh: () => Promise<RefreshOutcome>;
}

export function RefreshControl({ busy = false, onRefresh }: RefreshControlProps) {
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  // Set synchronously on click: React state is not committed yet when a second
  // click lands in the same tick, so a state-only guard still lets it through.
  const inFlight = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  // Gradient ids must be unique: two controls on one page would collide.
  const gradientId = `zf-refresh-fade-${useId().replace(/:/g, "")}`;

  const clearHoldTimer = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const settle = useCallback((id: number, outcome: Exclude<RefreshOutcome, "skipped">) => {
    // A request completion is only meaningful to the click that started it.
    // This also makes a timer left by an earlier outcome harmless.
    if (id !== requestId.current || !mounted.current) return;
    inFlight.current = false;
    clearHoldTimer();

    // Success deliberately has no confirmation state: the arc simply becomes the
    // quiet idle affordance again. Error keeps the same shape, recoloured briefly.
    if (outcome === "success") {
      setPhase("idle");
      return;
    }

    setPhase("error");
    holdTimer.current = setTimeout(() => {
      if (id !== requestId.current || !mounted.current) return;
      holdTimer.current = null;
      setPhase("idle");
    }, ERROR_HOLD_MS);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearHoldTimer();
    };
  }, []);

  const handleClick = () => {
    if (busy || inFlight.current || phase === "spinning") return;
    clearHoldTimer();
    const id = requestId.current + 1;
    requestId.current = id;
    inFlight.current = true;
    setPhase("spinning");
    let request: Promise<RefreshOutcome>;
    try {
      request = onRefresh();
    } catch {
      settle(id, "error");
      return;
    }
    void request
      .then((outcome) => {
        if (id !== requestId.current || !mounted.current) return;
        if (outcome === "skipped") {
          inFlight.current = false;
          setPhase("idle");
          return;
        }
        settle(id, outcome);
      })
      .catch(() => settle(id, "error"));
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
          <svg className="zf-refresh-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <defs>
              {/* Full strength at the head, dissolving at the tail. */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                <stop offset="55%" stopColor="currentColor" stopOpacity=".82" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".15" />
              </linearGradient>
            </defs>
            <circle
              className="zf-refresh-arc"
              cx="12"
              cy="12"
              r="9"
              stroke={`url(#${gradientId})`}
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            />
          </svg>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {phase === "error" ? "Refresh failed, try again" : "Refresh dashboard"}
      </TooltipContent>
    </Tooltip>
  );
}
