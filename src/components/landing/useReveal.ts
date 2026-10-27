import { RefObject, useLayoutEffect } from "react";

/**
 * Scroll-reveal for `.zl-reveal` descendants of `root`.
 *
 * The hidden state is opt-in: CSS only hides `.zl-reveal` under `.zl-js`, which
 * is added here and only when IntersectionObserver exists and the user allows
 * motion. Without JS, without the observer, or with reduced motion, content is
 * simply visible. Each element reveals once and is then unobserved.
 */
export function useReveal(root: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(el.querySelectorAll<HTMLElement>(".zl-reveal"));
    if (targets.length === 0) return;

    el.classList.add("zl-js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      // Reveal as soon as any part is on screen, so anchor jumps and keyboard
      // focus never land next to a still-hidden block.
      { rootMargin: "0px 0px 0px 0px", threshold: 0 },
    );
    targets.forEach((t) => io.observe(t));

    return () => {
      io.disconnect();
      el.classList.remove("zl-js");
    };
  }, [root]);
}
