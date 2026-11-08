/**
 * The greeting chip: the one piece of the celebration that is not decoration.
 *
 * It says which festival this is, and it is the only place the visitor can
 * pause or hide the animation. Hiding the animation leaves this in place — the
 * greeting is the part that belongs to the page, the particles are the part
 * that can be turned off — and the chip offers the animation back until the
 * display window ends.
 *
 * The wording follows the approved concepts: a full greeting with the ZenFolio
 * signature on the public page, a short one beside the price clock, and no
 * pause control on the static minimal pages where there is nothing to pause.
 */
import { useId } from "react";
import type { AnimationId } from "@/lib/events/animationIds";
import { useFestivalExperience } from "./EventExperienceProvider";

export type FestivalSurface = "public-hero" | "dashboard" | "minimal";

interface GreetingCopy {
  lead: string;
  accent: string;
  from: boolean;
}

const COPY: Record<AnimationId, Record<"public" | "compact", GreetingCopy>> = {
  diwali: {
    public: { lead: "Shubh", accent: "Deepavali", from: true },
    compact: { lead: "Happy", accent: "Diwali", from: false },
  },
  christmas: {
    public: { lead: "Merry", accent: "Christmas", from: true },
    compact: { lead: "Merry", accent: "Christmas", from: false },
  },
};

/** A diya with a flame that flickers, drawn at 22 px like the concept chip. */
function DiyaIcon() {
  const id = useId();
  return (
    <svg className="fest-chip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-flame`} cx="50%" cy="70%" r="60%">
          <stop offset="0" stopColor="#fff6d0" />
          <stop offset=".45" stopColor="#ffc24a" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        className="fest-flame"
        d="M12 3c2.6 3.4 3.6 5.6 3.6 7.4A3.6 3.6 0 0 1 12 14a3.6 3.6 0 0 1-3.6-3.6C8.4 8.6 9.4 6.4 12 3z"
        fill={`url(#${id}-flame)`}
      />
      <path d="M3 14.5h18c-.8 3.6-4.3 6-9 6s-8.2-2.4-9-6z" fill="#b8481c" />
      <ellipse cx="12" cy="14.5" rx="9" ry="1.6" fill="#e8a33a" />
    </svg>
  );
}

/** A small pine whose star twinkles. */
function PineIcon() {
  return (
    <svg className="fest-chip-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        className="fest-star"
        d="M12 1.6l1.1 2.2 2.4.3-1.8 1.6.5 2.4L12 7l-2.2 1.1.5-2.4-1.8-1.6 2.4-.3z"
        fill="#ffd36b"
      />
      <path d="M12 7l5 6h-2.6l3.8 4.6H5.8L9.6 13H7z" fill="#1f8a6e" />
      <rect x="11" y="17.6" width="2" height="3.4" rx=".6" fill="#7a4a2a" />
      <circle cx="10" cy="14.6" r=".9" fill="#ff5a4e" />
      <circle cx="14.2" cy="16" r=".9" fill="#ffc65c" />
      <circle cx="12.6" cy="11.4" r=".8" fill="#6cc4ff" />
    </svg>
  );
}

export function FestivalGreeting({
  surface,
  className,
}: {
  surface: FestivalSurface;
  className?: string;
}) {
  const { active, dismissed, paused, togglePaused, dismiss, restore } = useFestivalExperience();
  if (!active) return null;

  const theme = surface === "public-hero" ? "public" : "compact";
  const copy = COPY[active.animationId][theme];
  // Nothing moves on the minimal pages, so there is nothing to pause.
  const canPause = surface !== "minimal";

  return (
    <span
      className={className ? `fest-chip ${className}` : "fest-chip"}
      data-surface={surface}
      data-fest={active.animationId}
      data-hidden={dismissed ? "1" : "0"}
    >
      {active.animationId === "diwali" ? <DiyaIcon /> : <PineIcon />}
      <span className="fest-chip-label">
        {copy.lead} <em>{copy.accent}</em>
        {copy.from && <span className="fest-chip-from"> · from ZenFolio</span>}
      </span>
      {canPause && (
        <button
          type="button"
          className="fest-chip-btn"
          onClick={togglePaused}
          aria-pressed={paused}
          aria-label={paused ? "Play celebration" : "Pause celebration"}
          title={paused ? "Play animation" : "Pause animation"}
        >
          <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
        </button>
      )}
      {dismissed ? (
        <button
          type="button"
          className="fest-chip-btn"
          onClick={restore}
          aria-label="Show celebration again"
          title="Show celebration"
        >
          <span aria-hidden="true">↺</span>
        </button>
      ) : (
        <button
          type="button"
          className="fest-chip-btn"
          onClick={dismiss}
          aria-label="Hide celebration"
          title="Hide celebration"
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </span>
  );
}
