import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { GlassSceneHandle, GlassSceneTheme } from "@/lib/landing/glassScene";

type Mode = "idle" | "live" | "fallback";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Static candlestick read for reduced motion, no WebGL, or while the chunk loads. */
const FALLBACK_CLOSES = [
  0.34, 0.41, 0.37, 0.46, 0.53, 0.49, 0.57, 0.62, 0.58, 0.65, 0.71, 0.67, 0.73,
  0.79, 0.75, 0.81, 0.77, 0.84, 0.89, 0.85, 0.91, 0.87, 0.93, 0.97, 0.94, 0.99,
];
const FALLBACK_BASE = 300;
const FALLBACK_SCALE = 216;
const FALLBACK_STEP = 22;
const FALLBACK_X0 = 26;
const FALLBACK_WIDTH = 11;

const FALLBACK_CANDLES = FALLBACK_CLOSES.map((close, index) => {
  const open = index === 0 ? 0.3 : FALLBACK_CLOSES[index - 1];
  const top = Math.max(open, close);
  const bottom = Math.min(open, close);
  const x = FALLBACK_X0 + index * FALLBACK_STEP;
  return {
    x,
    cx: x + FALLBACK_WIDTH / 2,
    up: close >= open,
    bodyTop: FALLBACK_BASE - top * FALLBACK_SCALE,
    bodyHeight: Math.max(Math.abs(close - open) * FALLBACK_SCALE, 7),
    wickTop: FALLBACK_BASE - (top + 0.035) * FALLBACK_SCALE,
    wickBottom: FALLBACK_BASE - (bottom - 0.035) * FALLBACK_SCALE,
    closeY: FALLBACK_BASE - close * FALLBACK_SCALE,
  };
});

const FALLBACK_TREND = FALLBACK_CANDLES.map((candle) => `${candle.cx},${candle.closeY}`).join(" ");
const FALLBACK_LAST = FALLBACK_CANDLES[FALLBACK_CANDLES.length - 1];

function supportsWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    // Free the probe context immediately; browsers cap live contexts.
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Lazy three.js host for the hero. The scene module is fetched only when the
 * browser can actually draw it: no WebGL, reduced motion, or a failed chunk
 * leaves the CSS fallback in place instead of an empty box.
 */
export default function HeroScene({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<GlassSceneHandle | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const { resolvedTheme } = useTheme();
  const themeRef = useRef<GlassSceneTheme>("dark");

  themeRef.current = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    if (resolvedTheme) handleRef.current?.setTheme(themeRef.current);
  }, [resolvedTheme]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce || !supportsWebGL()) {
      setMode("fallback");
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frame = 0;
    let idleId = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      handleRef.current?.resize(rect.width, rect.height);
    };

    const readScroll = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      handleRef.current?.setProgress(clamp01(-rect.top / Math.max(rect.height, 1)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(readScroll);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      handleRef.current?.setPointer(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        ((event.clientY - rect.top) / rect.height) * 2 - 1,
      );
    };

    const onPointerOut = () => handleRef.current?.setPointer(0, 0);

    const onVisibility = () => {
      if (document.hidden) {
        handleRef.current?.setActive(false);
      } else {
        const rect = host.getBoundingClientRect();
        handleRef.current?.setActive(rect.bottom > 0 && rect.top < window.innerHeight);
      }
    };

    const boot = async () => {
      try {
        const { createGlassScene } = await import("@/lib/landing/glassScene");
        if (cancelled) return;
        const handle = createGlassScene(canvas, themeRef.current);
        handleRef.current = handle;
        resize();
        readScroll();
        setMode("live");

        observer = new IntersectionObserver(
          (entries) => {
            const visible = entries.some((entry) => entry.isIntersecting);
            handle.setActive(visible && !document.hidden);
          },
          { threshold: 0 },
        );
        observer.observe(host);

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(host);
        } else {
          window.addEventListener("resize", resize, { passive: true });
        }
      } catch {
        if (!cancelled) setMode("fallback");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    // Let the hero copy paint before the 3D chunk starts downloading.
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(() => void boot(), { timeout: 1400 });
    } else {
      idleId = window.setTimeout(() => void boot(), 220);
    }

    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(idleId);
      window.clearTimeout(idleId);
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibility);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={["zl-scene", className].filter(Boolean).join(" ")}
      data-mode={mode}
      aria-hidden="true"
    >
      <div className="zl-scene-fallback">
        <svg className="zl-scene-chart" viewBox="0 0 640 360" focusable="false">
          <g className="zl-scene-grid">
            {[104, 168, 232, 296].map((y) => (
              <line key={y} x1="20" y1={y} x2="620" y2={y} />
            ))}
          </g>
          <polyline className="zl-scene-trend" points={FALLBACK_TREND} />
          {FALLBACK_CANDLES.map((candle) => (
            <g key={candle.x}>
              <line
                className="zl-scene-wick"
                x1={candle.cx}
                x2={candle.cx}
                y1={candle.wickTop}
                y2={candle.wickBottom}
              />
              <rect
                className="zl-scene-candle"
                data-up={candle.up ? 1 : 0}
                x={candle.x}
                y={candle.bodyTop}
                width={FALLBACK_WIDTH}
                height={candle.bodyHeight}
                rx="2"
              />
            </g>
          ))}
          <circle className="zl-scene-marker-ring" cx={FALLBACK_LAST.cx} cy={FALLBACK_LAST.closeY} r="9" />
          <circle className="zl-scene-marker" cx={FALLBACK_LAST.cx} cy={FALLBACK_LAST.closeY} r="3.5" />
        </svg>
      </div>
      <canvas ref={canvasRef} className="zl-scene-canvas" />
    </div>
  );
}
