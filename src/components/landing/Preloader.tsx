import { useEffect, useRef, useState, type CSSProperties } from "react";
import LogoMark from "@/components/LogoMark";

type Phase = "hidden" | "showing" | "leaving";

const STORAGE_KEY = "zenfolio:brand-reveal";

/**
 * Short brand reveal. It is an overlay, not a gate: scrolling, a tap or any key
 * dismisses it, it never traps focus, and it is skipped entirely for reduced
 * motion or a repeat visit in the same tab.
 */
export default function Preloader() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [skippable, setSkippable] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // Private mode can throw on storage access; the reveal is optional.
    }

    setPhase("showing");
    const skipTimer = window.setTimeout(() => setSkippable(true), 380);
    const leaveTimer = window.setTimeout(() => finish(), 1100);
    return () => {
      window.clearTimeout(skipTimer);
      window.clearTimeout(leaveTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("hidden"), 620);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!skippable || phase !== "showing") return;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase("leaving");
    };
    const events: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "wheel", "touchstart"];
    events.forEach((name) => window.addEventListener(name, finish, { passive: true, once: true }));
    return () => events.forEach((name) => window.removeEventListener(name, finish));
  }, [skippable, phase]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage is optional.
    }
    setPhase("leaving");
  }

  if (phase === "hidden") return null;

  return (
    <div className="zl-preloader" data-phase={phase} role="status" aria-label="Opening ZenFolio">
      <div className="zl-preloader-inner" aria-hidden="true">
        <div className="zl-preloader-mark">
          <span className="zl-preloader-sheen" />
          <LogoMark size={44} />
        </div>
        <div className="zl-preloader-word">
          {"ZenFolio".split("").map((letter, index) => (
            <span key={`${letter}-${index}`} style={{ "--i": index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </div>
        <p className="zl-preloader-tag">Your wealth. One clear perspective.</p>
        <span className="zl-preloader-line" />
      </div>
    </div>
  );
}
