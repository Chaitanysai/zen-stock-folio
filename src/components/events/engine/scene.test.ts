import { afterEach, describe, expect, it, vi } from "vitest";
import { FestivalScene, type FestivalSceneOptions } from "./scene";

// Inspect the engine's canvas boundary and generated velocities without a GPU.
interface SceneProbe {
  render: (elapsed: number, still?: boolean) => void;
  burst: (x: number, y: number, depth: number, far: boolean) => void;
  parts: { vx: number; vy: number }[];
}
function makeScene(overrides: Partial<FestivalSceneOptions> = {}) {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(null);
  const scene = new FestivalScene({
    canvas, fest: "diwali", variant: "public-hero", reduced: false, paused: false,
    measure: () => ({ width: 1200, height: 700, phone: false, zones: [], garnishInset: 0 }),
    isDark: () => true, ...overrides,
  });
  const probe = scene as unknown as SceneProbe;
  const render = vi.spyOn(probe, "render").mockImplementation(() => {});
  return { scene, probe, render };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("festival scene lifecycle", () => {
  it("cancels animation and paints still output when reduced motion is enabled", () => {
    const request = vi.fn().mockReturnValue(42);
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { scene, render } = makeScene();
    scene.start();
    expect(request).toHaveBeenCalledOnce();
    scene.setReduced(true);
    expect(cancel).toHaveBeenCalledWith(42);
    expect(render).toHaveBeenLastCalledWith(0, true);
    scene.setReduced(false);
    expect(request).toHaveBeenCalledTimes(2);
    scene.destroy();
  });

  it.each([{ staticOnly: true }, { reduced: true }, { paused: true }])(
    "repaints a still frame on refresh with %o", (mode) => {
      const { scene, render } = makeScene(mode);
      scene.refresh();
      expect(render).toHaveBeenLastCalledWith(0, true);
    },
  );

  it("rotates both ring velocity components from the original vector", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2); // selects the ring shape
    const { probe } = makeScene();
    probe.burst(300, 200, 1, false);
    const angle = -0.04 + 0.2 * 0.08;
    const speed = 470 * (0.93 + 0.2 * 0.07);
    const x = Math.cos(angle) * speed;
    const y = Math.sin(angle) * speed * (0.35 + 0.2 * 0.25);
    const tilt = 0.2 * Math.PI;
    expect(probe.parts[0].vx).toBeCloseTo(x * Math.cos(tilt) - y * Math.sin(tilt));
    expect(probe.parts[0].vy).toBeCloseTo(x * Math.sin(tilt) + y * Math.cos(tilt));
  });
});
