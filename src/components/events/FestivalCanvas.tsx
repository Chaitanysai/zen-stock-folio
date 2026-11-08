/**
 * The canvas surface. One per page, mounted only while a festival is running.
 *
 * This component does two things and nothing else: it measures the page around
 * itself so the engine knows what to avoid (the greeting, the price clock, the
 * HUD, the chart), and it owns the engine's lifetime.
 *
 * Measurement is the reason this is a component rather than a stylesheet: the
 * keep-clear zones are real elements at real positions, so the snow thins out
 * over a headline because the headline is there, not because a fixed rectangle
 * happened to line up at one viewport width.
 *
 * The canvas is decorative. It never receives pointer events, it is
 * `aria-hidden`, and it renders no DOM for assistive technology. If a browser
 * has no canvas (jsdom in tests), the engine simply draws nothing.
 */
import { useEffect, useRef } from "react";
import type { FestivalFrame, FestivalVariant, FestivalZone } from "./engine/scene";
import { FestivalScene } from "./engine/scene";
import { useFestivalExperience } from "./EventExperienceProvider";

/**
 * Where to look for the elements a zone selector names. Each surface marks its
 * page root, so two surfaces on one page could never measure each other.
 */
const SCOPE_SELECTOR = "[data-festival-scope]";

export interface FestivalZoneSpec {
  /** Free-form name; the engine treats `chip`, `hud`, `copy`, `h1`, `right` specially. */
  role: string;
  selector: string;
  /** Dim over this zone instead of avoiding it (used for a chart behind particles). */
  soft?: boolean;
}

export interface FestivalCanvasProps {
  variant: FestivalVariant;
  zones?: readonly FestivalZoneSpec[];
  /** Where the garland hangs, measured from the top of this host. */
  garnishInset?: number;
  /**
   * Selector for the element whose top edge the host's top edge should match.
   * The host is absolutely positioned, so this only moves the canvas: the page
   * layout never changes.
   */
  alignTo?: string;
  /** Hold the celebration until the surrounding page has settled. */
  ready?: boolean;
  className?: string;
}

function scopeOf(host: HTMLElement): ParentNode {
  return host.closest(SCOPE_SELECTOR) ?? document.body;
}

function isDarkTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Give the host the same top edge as `alignTo`, without touching layout. */
function alignHost(host: HTMLElement, alignTo: string): void {
  const parent = host.parentElement;
  const scope = scopeOf(host);
  const anchor = scope.querySelector(alignTo) ?? document.querySelector(alignTo);
  if (!parent || !anchor) return;
  const rise = Math.max(0, Math.round(parent.getBoundingClientRect().top - anchor.getBoundingClientRect().top));
  const current = host.style.getPropertyValue("--fest-rise");
  const next = `${rise}px`;
  if (current !== next) host.style.setProperty("--fest-rise", next);
}

function measure(
  host: HTMLElement,
  zones: readonly FestivalZoneSpec[],
  garnishInset: number,
  alignTo?: string,
): FestivalFrame {
  if (alignTo) alignHost(host, alignTo);

  // Read the rect after any alignment write above so both agree.
  const rect = host.getBoundingClientRect();
  const scope = scopeOf(host);
  const measured: FestivalZone[] = [];

  for (const spec of zones) {
    for (const node of Array.from(scope.querySelectorAll(spec.selector))) {
      if (!node.getClientRects().length) continue;
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const pad = spec.role === "chip" ? 6 : 14;
      measured.push({
        role: spec.role,
        soft: spec.soft,
        x: box.left - rect.left - pad,
        y: box.top - rect.top - pad,
        w: box.width + pad * 2,
        h: box.height + pad * 2,
      });
    }
  }

  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    phone: typeof window !== "undefined" && window.innerWidth <= 640,
    zones: measured,
    garnishInset,
  };
}

export function FestivalCanvas({
  variant,
  zones,
  garnishInset = 0,
  alignTo,
  ready = true,
  className,
}: FestivalCanvasProps) {
  const { active, reduced } = useFestivalExperience();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<FestivalScene | null>(null);

  const fest = active?.animationId ?? null;
  const running = Boolean(fest) && ready;

  // Zones are read through refs so a caller can pass a fresh array without
  // tearing down and restarting the animation on every render.
  const zonesRef = useRef<readonly FestivalZoneSpec[]>(zones ?? []);
  zonesRef.current = zones ?? [];
  const zoneKey = zonesRef.current.map((z) => `${z.role}:${z.selector}:${z.soft ? 1 : 0}`).join("|");

  useEffect(() => {
    if (!running || !fest) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const scene = new FestivalScene({
      canvas,
      fest,
      variant,
      reduced,
      staticOnly: variant === "minimal",
      measure: () => measure(host, zonesRef.current, garnishInset, alignTo),
      isDark: isDarkTheme,
    });
    sceneRef.current = scene;
    scene.start();

    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
    // `reduced` is applied by the effect below: restarting the engine for it
    // would replay the opening sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoneKey stands in for `zones`
  }, [running, fest, variant, garnishInset, alignTo, zoneKey]);

  useEffect(() => {
    sceneRef.current?.setReduced(reduced);
  }, [reduced]);

  // Light/dark is swapped by a class on <html>; an additive burst has to be
  // repainted in the other blend mode, and a frozen frame has to be redrawn.
  useEffect(() => {
    if (!running) return;
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(() => sceneRef.current?.refresh());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [running]);

  if (!active) return null;

  return (
    <div
      ref={hostRef}
      className={className ? `fest-canvas ${className}` : "fest-canvas"}
      data-surface={variant}
      data-fest={active.animationId}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
