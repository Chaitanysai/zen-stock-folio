/**
 * Festival canvas engine.
 *
 * One canvas per page, one rAF loop, no animation library. This is the engine
 * that produced the approved concept recordings (docs/festival-concepts), ported
 * out of the review board into the app: same burst shapes, same timings, same
 * budgets, same keep-clear behaviour.
 *
 * The three surfaces it serves are deliberately different compositions, not one
 * composition at three opacities:
 *
 *   public-hero      rockets, five burst shapes, distant depth fires, toran,
 *                    petals and diyas on the landing page
 *   dashboard        a much smaller sky confined to the empty space in the
 *                    overview header, plus the top-edge garland
 *   minimal          no timeline at all — the garland and a frozen frame
 *
 * Geometry is measured by the React surface and handed in as a `FestivalFrame`,
 * so the engine never queries the DOM and stays testable. Anything expensive is
 * budgeted: sparks are pooled by count, the canvas is capped at DPR 1.75, and
 * the loop stops entirely when the tab is hidden, the element is off-screen, the
 * visitor pauses, or reduced motion is on.
 */
import type { AnimationId } from "@/lib/events/animationIds";
import {
  BOKEH_COLOURS,
  BULB_COLOURS,
  MARIGOLD,
  easeOut,
  easeOutQuad,
  hexA,
  paletteFor,
  pick,
  rand,
} from "./palette";

export type FestivalVariant = "public-hero" | "dashboard" | "minimal";

export interface FestivalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A region the celebration must not paint over. */
export interface FestivalZone extends FestivalRect {
  /** `copy`, `hud`, `chart`, `chip`, `h1`, `right`, `top`… */
  role: string;
  /** Soft zones are not avoided — particles merely dim over them. */
  soft?: boolean;
}

/**
 * Everything the engine needs to know about the page, measured by React.
 * All rects are relative to the canvas host.
 */
export interface FestivalFrame {
  width: number;
  height: number;
  /** Narrow-viewport composition (≤640 px). */
  phone: boolean;
  zones: FestivalZone[];
  /** Distance from the host's top edge to where the garland hangs. */
  garnishInset: number;
}

export interface FestivalSceneOptions {
  canvas: HTMLCanvasElement;
  fest: AnimationId;
  variant: FestivalVariant;
  reduced: boolean;
  paused: boolean;
  measure: () => FestivalFrame;
  isDark: () => boolean;
  /** Draw one static frame and never start the loop (the minimal variant). */
  staticOnly?: boolean;
}

interface Spark {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; life: number; age: number;
  col: string; c2: string | null; w: number; drag: number; g: number;
  b: number; flick: boolean; far: boolean;
}

interface Rocket {
  sx: number; sy: number; tx: number; ty: number;
  t: number; dur: number; depth: number; col: string;
  trail: [number, number][]; wob: number;
}

interface Petal {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; sw: number; ph: number; sz: number;
  col: string; kind: "petal" | "flower";
}

interface Flake {
  x: number; y: number; vy: number; sw: number; ph: number;
  r: number; layer: number; a: number; x0: number; x1: number;
}

interface Bokeh {
  x: number; y: number; vy: number; r: number; col: string; a: number; ph: number;
}

interface Meteor {
  x: number; y: number; vx: number; vy: number; len: number; age: number; life: number;
}

interface Flash { x: number; y: number; r: number; a: number; age: number }

interface Diya { x: number; y: number; s: number; ph: number; del: number }

interface Bulb { t: number; col: string; ph: number; on: number }

interface LightString {
  y0: number; x0: number; x1: number; sag: number; loops: number; b: Bulb[];
}

interface Pine { x: number; s: number }

interface Sky { x0: number; x1: number; y0: number; y1: number }

const DPR_CAP = 1.75;
const FLASH_LIFE = 0.35;

/** Spark budget per surface: the public sky is the full show. */
function sparkBudget(variant: FestivalVariant, phone: boolean): number {
  if (variant === "public-hero") return phone ? 380 : 1300;
  return phone ? 110 : 300;
}

export class FestivalScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly fest: AnimationId;
  private readonly variant: FestivalVariant;
  private readonly measure: () => FestivalFrame;
  private readonly isDark: () => boolean;
  private readonly staticOnly: boolean;

  private reduced: boolean;
  private paused: boolean;

  private W = 0;
  private H = 0;
  private dpr = 1;
  private phone = false;
  private scale = 1;
  private garnishInset = 0;

  private zones: FestivalZone[] = [];
  private sky: Sky = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private launchX: [number, number][] = [];
  private toran = { n: 0, sag: 0, y: 0 };
  private diyas: Diya[] = [];
  private strs: LightString[] = [];
  private pines: Pine[] = [];

  private parts: Spark[] = [];
  private rockets: Rocket[] = [];
  private petals: Petal[] = [];
  private flakes: Flake[] = [];
  private bokeh: Bokeh[] = [];
  private stars: Meteor[] = [];
  private flash: Flash[] = [];

  private events: { ms: number; fn: () => void }[] = [];
  private nextAuto = 0;
  private loopAt = 0;

  private raf = 0;
  private last = 0;
  private t0 = 0;
  private visible = true;
  private hasStatic = false;

  private observer: ResizeObserver | null = null;
  private intersection: IntersectionObserver | null = null;
  private onVisibility = () => this.kick();

  constructor(options: FestivalSceneOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.fest = options.fest;
    this.variant = options.variant;
    this.measure = options.measure;
    this.isDark = options.isDark;
    this.staticOnly = options.staticOnly ?? false;
    this.reduced = options.reduced;
    this.paused = options.paused;
  }

  /** Begin observing and play the opening sequence. */
  start(): void {
    if (typeof window === "undefined") return;
    this.resize();

    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(() => this.resize());
      if (this.canvas.parentElement) this.observer.observe(this.canvas.parentElement);
    }
    if (typeof IntersectionObserver === "function") {
      this.intersection = new IntersectionObserver((entries) => {
        this.visible = entries[0]?.isIntersecting ?? true;
        this.kick();
      });
      this.intersection.observe(this.canvas);
    }
    document.addEventListener("visibilitychange", this.onVisibility);

    this.replay();
  }

  /** Release every observer, timer and queued frame. */
  destroy(): void {
    if (typeof window === "undefined") return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
    this.observer = null;
    this.intersection?.disconnect();
    this.intersection = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.kick();
  }

  setReduced(reduced: boolean): void {
    if (this.reduced === reduced) return;
    this.reduced = reduced;
    if (reduced) {
      this.kick();
    } else {
      this.replay();
    }
  }

  /** Re-measure after a layout change (fonts, theme, resize, tab switch). */
  refresh(): void {
    this.resize();
  }

  // ── measurement ────────────────────────────────────────────────────────────

  private resize(): void {
    const frame = this.measure();
    const { width, height } = frame;
    if (width <= 0 || height <= 0) return;

    this.W = width;
    this.H = height;
    this.phone = frame.phone;
    this.garnishInset = frame.garnishInset;
    this.zones = frame.zones;

    // The public hero has a chart under its HUD. Particles may drift over it —
    // they just dim to 45% instead of 10%, so the curve stays readable without
    // carving a second hole in the sky.
    if (this.variant === "public-hero") {
      for (const zone of frame.zones) {
        if (zone.role !== "hud") continue;
        this.zones.push({
          ...zone,
          role: "chart",
          y: zone.y + zone.h * 0.35,
          h: zone.h * 0.65,
          soft: true,
        });
      }
    }

    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    const w = Math.round(this.W * this.dpr);
    const h = Math.round(this.H * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    this.layout();
    if (this.reduced || this.staticOnly) this.drawStaticFrame();
    else if (this.paused) this.render(0, true);
  }

  private zone(role: string): FestivalZone | undefined {
    return this.zones.find((z) => z.role === role);
  }

  private zonesOf(role: string): FestivalZone[] {
    return this.zones.filter((z) => z.role === role);
  }

  /** Right edge of the left-hand content (name, greeting, copy). */
  private leftEdge(...roles: string[]): number {
    let edge = 0;
    for (const role of roles) {
      for (const zone of this.zonesOf(role)) edge = Math.max(edge, zone.x + zone.w);
    }
    return edge;
  }

  /** Bottom edge of the content a rocket sky must start below. */
  private leftBottom(...roles: string[]): number {
    let edge = 0;
    for (const role of roles) {
      for (const zone of this.zonesOf(role)) edge = Math.max(edge, zone.y + zone.h);
    }
    return edge;
  }

  /** Left edge of the right-hand content (price clock, greeting chip). */
  private rightEdge(...roles: string[]): number | null {
    let edge: number | null = null;
    for (const role of roles) {
      for (const zone of this.zonesOf(role)) edge = edge === null ? zone.x : Math.min(edge, zone.x);
    }
    return edge;
  }

  private get minimal(): boolean {
    return this.variant === "minimal";
  }

  private get dark(): boolean {
    return this.isDark();
  }

  private layout(): void {
    const W = this.W;
    const H = this.H;
    const ph = this.phone;

    if (this.variant === "public-hero") {
      const hud = this.zone("hud");
      const hudTop = hud ? hud.y : H * 0.8;
      const hudLeft = hud ? hud.x - 16 : W * 0.6;
      if (ph) {
        // On a phone the copy is full width, so the sky is the gap between the
        // CTA row and the HUD, and the rockets come in from the side gutters.
        const copyBottom = this.leftBottom("copy") || H * 0.5;
        this.sky = {
          x0: 12,
          x1: W - 12,
          y0: Math.min(copyBottom, hudTop - 90),
          y1: Math.max(copyBottom + 40, hudTop - 6),
        };
        this.scale = 0.55;
      } else {
        const x0 = Math.min(this.leftEdge("copy") + 8 || W * 0.48, W * 0.44);
        this.sky = { x0, x1: W - 30, y0: this.garnishInset + 64, y1: hudTop - 30 };
        this.scale = 1;
      }
      const lane: [number, number] = [this.sky.x0 + 10, Math.max(this.sky.x0 + 20, hudLeft - 10)];
      this.launchX = ph ? [[8, 26], [W - 26, W - 8]] : [lane, lane, [W - 34, W - 14]];
    } else {
      const x0 = this.leftEdge("h1") + 10 || W * 0.4;
      const right = this.rightEdge("right", "chip");
      const x1 = right === null ? W * 0.7 : right - 10;
      const top = this.zone("top");
      const topBarBottom = top ? top.y + top.h + 2 : 4;
      this.sky = { x0, x1: Math.max(x0 + 20, x1), y0: topBarBottom, y1: H - 6 };
      this.scale = ph ? 0.38 : 0.62;
      // No gap wide enough to burst in: keep the garland, drop the fireworks
      // into the sliver under the top bar instead.
      if (ph || this.sky.x1 - this.sky.x0 < 120) {
        const rightZone = this.zonesOf("right")[0];
        this.sky = {
          x0: W * 0.45,
          x1: W - 8,
          y0: 4,
          y1: Math.max(30, (rightZone ? rightZone.y : H * 0.6) - 6),
        };
      }
    }

    this.buildStatic();
  }

  // ── timeline ───────────────────────────────────────────────────────────────

  replay(): void {
    this.t0 = performance.now();
    this.last = this.t0;
    this.parts = [];
    this.rockets = [];
    this.petals = [];
    this.flakes = [];
    this.stars = [];
    this.bokeh = [];
    this.flash = [];
    this.events = [];
    this.nextAuto = 0;

    const pub = this.variant === "public-hero";

    if (this.fest === "diwali") {
      if (pub) {
        this.at(1400, () => this.launchAuto(0));
        this.at(2600, () => this.launchAuto(2));
        this.at(3000, () => this.distant());
        this.at(4200, () => {
          this.launchAuto(1);
          this.launchAuto(2);
        });
        this.at(5600, () => this.distant());
        this.loopAt = 6200;
      } else {
        this.at(1200, () => this.distant(0.7));
        this.at(2400, () => this.distant(0.5));
        this.loopAt = 3600;
      }
    } else {
      this.at(pub ? 3200 : 4000, () => this.star());
      this.loopAt = pub ? 6000 : 9000;
    }

    this.seedAmbient();
    if (this.reduced || this.staticOnly) this.drawStaticFrame();
    else this.kick();
  }

  private at(ms: number, fn: () => void): void {
    this.events.push({ ms, fn });
  }

  private seedAmbient(): void {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";

    // The minimal surface is the garland and nothing else: no petals, no snow,
    // no loop. It is drawn once and left alone.
    if (this.minimal) return;

    if (this.fest === "diwali") {
      const count = pub ? (this.phone ? 10 : 22) : this.phone ? 4 : 7;
      for (let i = 0; i < count; i += 1) this.petals.push(this.petal(true, i / count));
      return;
    }

    const layers = pub
      ? this.phone
        ? [30, 18, 7]
        : [70, 45, 18]
      : this.phone
        ? [10, 6, 0]
        : [18, 10, 3];
    layers.forEach((n, layer) => {
      for (let i = 0; i < n; i += 1) this.flakes.push(this.flake(layer, true));
    });
    if (pub) {
      const bokehCount = this.phone ? 5 : 12;
      for (let i = 0; i < bokehCount; i += 1) this.bokeh.push(this.boke(true));
    }
    // Decorative only: W/H are read by the ambient factories above.
    void W;
    void H;
  }

  private kick(): void {
    const run =
      !this.staticOnly &&
      !this.reduced &&
      !this.paused &&
      !document.hidden &&
      this.visible;
    if (run && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
    if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (!run && (this.reduced || this.paused)) this.drawStaticFrame();
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const elapsed = now - this.t0;

    if (this.events.length) {
      this.events = this.events.filter((event) => {
        if (elapsed >= event.ms) {
          event.fn();
          return false;
        }
        return true;
      });
    }

    if (elapsed > this.loopAt && now > this.nextAuto) this.auto(elapsed);

    this.step(dt);
    this.render(elapsed);
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private auto(elapsed: number): void {
    const pub = this.variant === "public-hero";

    if (this.fest === "diwali") {
      const live = this.rockets.length + this.burstsLive();
      if (pub) {
        if (live < 3) {
          if (Math.random() < 0.28) this.distant();
          else this.launchAuto();
          if (Math.random() < 0.18) setTimeout(() => this.launchAuto(), 260);
        }
        this.nextAuto = performance.now() + rand(1700, 3200);
      } else {
        if (live < 2) this.distant(Math.random() < 0.5 ? 0.45 : 0.7);
        const slow = elapsed > 20000 ? 1.6 : 1;
        this.nextAuto = performance.now() + rand(2600, 4600) * slow;
      }
      return;
    }

    this.star();
    this.nextAuto = performance.now() + (pub ? rand(4500, 8000) : rand(9000, 14000));
  }

  private burstsLive(): number {
    const live = new Set<number>();
    for (const part of this.parts) live.add(part.b);
    return live.size;
  }

  // ── Diwali ─────────────────────────────────────────────────────────────────

  private launchAuto(slot?: number): void {
    const lanes = this.launchX;
    if (!lanes.length) return;
    const lane = lanes[(slot ?? ((Math.random() * lanes.length) | 0)) % lanes.length];
    const sky = this.sky;
    const fromX = rand(lane[0], lane[1]);
    const toX = Math.min(
      sky.x1 - 40,
      Math.max(sky.x0 + 40, fromX + rand(-140, 160)),
    );
    const toY = rand(sky.y0 + 30, sky.y0 + (sky.y1 - sky.y0) * 0.58);
    this.launch(toX, toY, 1, fromX);
  }

  private launch(tx: number, ty: number, depth: number, sx?: number): void {
    const startX = sx ?? Math.min(this.W - 10, Math.max(10, tx + rand(-120, 120)));
    const startY = this.H + 6;
    this.rockets.push({
      sx: startX,
      sy: startY,
      tx,
      ty,
      t: 0,
      dur: rand(0.85, 1.15),
      depth,
      col: pick(paletteFor(this.fest, this.dark)),
      trail: [],
      wob: rand(-18, 18),
    });
  }

  private distant(scale?: number): void {
    const sky = this.sky;
    const pub = this.variant === "public-hero";
    const margin = pub ? 20 : 30;
    const x = rand(sky.x0 + margin, sky.x1 - margin);
    const y = pub
      ? rand(sky.y0 + 8, sky.y0 + (sky.y1 - sky.y0) * 0.55)
      : rand(sky.y0 + 28, sky.y1 - 24);
    this.burst(x, y, scale ?? 0.5, pub);
  }

  private burst(x: number, y: number, depth: number, far: boolean): void {
    const kind = pick(far ? ["peony", "ring", "chrys"] : ["peony", "ring", "willow", "palm", "chrys", "peony"]);
    const pal = paletteFor(this.fest, this.dark);
    const c1 = pick(pal);
    const c2 = Math.random() < 0.5 ? pick(pal) : c1;
    const sc = depth * this.scale;
    const budget = sparkBudget(this.variant, this.phone);
    const room = budget - this.parts.length;
    if (room < 20) return;

    const base =
      kind === "willow" ? 96 : kind === "palm" ? 70 : 124;
    const n = Math.min(room, Math.round(base * (far ? 0.6 : 1) * (this.phone ? 0.7 : 1)));
    const speed = (kind === "willow" ? 300 : kind === "palm" ? 400 : 470) * sc;
    const tilt = rand(0, Math.PI);
    const squash = rand(0.35, 0.6);
    // Burst identity: sparks carrying the same `b` belong to one explosion, so
    // the loop can cap how many are on screen at once.
    const id = (this.burstSeq += 1) % 100000;

    for (let i = 0; i < n; i += 1) {
      let angle = (i / n) * Math.PI * 2 + rand(-0.04, 0.04);
      let v: number;
      if (kind === "ring") v = speed * rand(0.93, 1);
      else if (kind === "palm") {
        const arm = i % 7;
        angle = (arm / 7) * Math.PI * 2 + rand(-0.08, 0.08);
        v = speed * rand(0.45, 1);
      } else v = speed * Math.cbrt(rand(0.05, 1));

      let vx = Math.cos(angle) * v;
      let vy = Math.sin(angle) * v;
      if (kind === "ring") {
        const ry = vy * squash;
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        const rx = vx;
        vx = rx * ct - ry * st;
        vy = rx * st + ry * ct;
      }

      const life = kind === "willow" ? rand(2.2, 2.9) : rand(1.1, 1.7);
      const col = kind === "chrys" ? "#FFF4DC" : i % 2 ? c1 : c2;

      this.parts.push({
        x,
        y,
        px: x,
        py: y,
        vx,
        vy,
        life,
        age: 0,
        col,
        c2: kind === "chrys" ? c1 : null,
        w: (far ? 1.4 : 2.4) * Math.max(0.7, sc),
        drag: kind === "willow" ? 1.5 : 2.25,
        g: (kind === "willow" ? 60 : 46) * sc,
        b: id,
        flick: kind !== "willow" && Math.random() < 0.4,
        far,
      });
    }

    this.flash.push({ x, y, r: 90 * sc, a: far ? 0.3 : 0.6, age: 0 });
  }

  private burstSeq = 0;

  private petal(seed: boolean, fraction: number): Petal {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";
    const sky = this.sky;
    const side = Math.random();

    let x: number;
    let y: number;
    if (!pub) {
      x = rand(sky.x0, sky.x1);
      y = seed ? rand(0, H) : -10;
    } else {
      x = side < 0.6 ? rand(this.phone ? 0 : W * 0.42, W) : side < 0.8 ? rand(-10, 20) : rand(W - 20, W + 10);
      y = seed ? rand(-H * 0.2, H) : -14;
    }
    void fraction;

    const size = rand(4, 8) * (this.phone || !pub ? 0.8 : 1);
    return {
      x,
      y,
      vx: rand(-8, 10),
      vy: rand(14, 30) * (pub ? 1 : 0.6),
      rot: rand(0, 6.28),
      vr: rand(-1.6, 1.6),
      sw: rand(0.6, 1.4),
      ph: rand(0, 6.28),
      sz: size,
      col: pick(MARIGOLD),
      kind: Math.random() < 0.18 ? "flower" : "petal",
    };
  }

  // ── Christmas ──────────────────────────────────────────────────────────────

  private flake(layer: number, seed: boolean): Flake {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";
    const x0 = pub ? 0 : this.sky.x0;
    const x1 = pub ? W : this.sky.x1;
    const speed = [14, 28, 48][layer] ?? 14;
    const size = [1, 1.7, 2.8][layer] ?? 1;
    return {
      x: rand(x0, x1),
      y: seed ? rand(-H, H) : -6,
      vy: speed * rand(0.8, 1.2),
      sw: rand(0.4, 1.2) * (layer + 1) * 4,
      ph: rand(0, 6.28),
      r: size * rand(0.8, 1.2),
      layer,
      a: [0.45, 0.7, 0.9][layer] ?? 0.45,
      x0,
      x1,
    };
  }

  private boke(seed: boolean): Bokeh {
    const W = this.W;
    const H = this.H;
    return {
      x: rand(W * 0.45, W),
      y: seed ? rand(H * 0.2, H) : H + 20,
      vy: -rand(5, 12),
      r: rand(6, 16),
      col: pick(BOKEH_COLOURS),
      a: rand(0.08, 0.2),
      ph: rand(0, 6.28),
    };
  }

  private star(x?: number, y?: number): void {
    const sky = this.sky;
    const pub = this.variant === "public-hero";
    const startX = x ?? rand(sky.x0 + (sky.x1 - sky.x0) * 0.3, sky.x1);
    const startY = y ?? rand(sky.y0, sky.y0 + (sky.y1 - sky.y0) * 0.4);
    const angle = rand(2.55, 2.85);
    const speed = (pub ? rand(520, 680) : rand(260, 320)) * (this.phone ? 0.6 : 1);
    this.stars.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: (pub ? 140 : 60) * (this.phone ? 0.6 : 1),
      age: 0,
      life: pub ? 1.1 : 0.8,
    });
  }

  // ── static art: garland, diyas, light strings, pines ───────────────────────

  private buildStatic(): void {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";
    const ph = this.phone;

    if (this.fest === "diwali") {
      const scallops = Math.max(6, Math.round(W / (ph ? 52 : pub ? 84 : 96)));
      this.toran = { n: scallops, sag: pub ? (ph ? 12 : 18) : this.minimal ? 7 : 10, y: this.garnishInset };
      this.diyas = [];
      if (pub) {
        const fractions = ph ? [0.1, 0.9] : [0.06, 0.16, 0.26, 0.355];
        fractions.forEach((fraction, index) => {
          this.diyas.push({
            x: W * fraction,
            y: H - (ph ? 12 : 20),
            s: ph ? 0.75 : 1,
            ph: rand(0, 6.28),
            del: 600 + index * 180,
          });
        });
      }
    } else {
      const strings = pub ? (ph ? 1 : 2) : 1;
      this.strs = [];
      for (let s = 0; s < strings; s += 1) {
        const base = this.garnishInset + (pub ? 0 : 2);
        const y0 = base + s * 8;
        const x0 = pub ? (s ? W * 0.42 : -10) : -10;
        const x1 = pub ? (s ? W + 10 : W * 0.62) : W + 10;
        const sag = pub ? (ph ? 14 : s ? 26 : 20) : 9;
        const bulbs = Math.max(8, Math.round((x1 - x0) / (ph ? 26 : pub ? 34 : 40)));
        const list: Bulb[] = [];
        for (let i = 0; i <= bulbs; i += 1) {
          const t = i / bulbs;
          list.push({
            t,
            col: BULB_COLOURS[(i + s) % BULB_COLOURS.length],
            ph: rand(0, 6.28),
            on: 200 + t * 1600 * (pub ? 1 : 0.75),
          });
        }
        this.strs.push({ y0, x0, x1, sag, loops: pub && !ph ? 2 : 3, b: list });
      }
      this.pines = pub && !ph
        ? [
            { x: 30, s: 1.15 },
            { x: 78, s: 0.8 },
            { x: 118, s: 1 },
            { x: 162, s: 0.62 },
          ]
        : [];
    }
    this.hasStatic = true;
  }

  // ── update ─────────────────────────────────────────────────────────────────

  private step(dt: number): void {
    const H = this.H;

    for (const rocket of this.rockets) rocket.t += dt / rocket.dur;
    this.rockets = this.rockets.filter((rocket) => {
      if (rocket.t >= 1) {
        this.burst(rocket.tx, rocket.ty, rocket.depth * rand(0.85, 1.05), false);
        return false;
      }
      return true;
    });

    for (const part of this.parts) {
      part.age += dt;
      part.px = part.x;
      part.py = part.y;
      const drag = Math.exp(-part.drag * dt);
      part.vx *= drag;
      part.vy = part.vy * drag + part.g * dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
    }
    this.parts = this.parts.filter((part) => part.age < part.life);

    for (const f of this.flash) f.age += dt;
    this.flash = this.flash.filter((f) => f.age < FLASH_LIFE);

    for (const petal of this.petals) {
      petal.ph += dt * petal.sw;
      petal.x += (petal.vx + Math.sin(petal.ph) * 16) * dt;
      petal.y += petal.vy * dt;
      petal.rot += petal.vr * dt;
    }
    this.petals = this.petals.map((petal) => (petal.y > H + 12 ? this.petal(false, 0) : petal));

    for (const flake of this.flakes) {
      flake.ph += dt;
      flake.y += flake.vy * dt;
      flake.x += Math.sin(flake.ph * 0.9) * flake.sw * dt;
    }
    this.flakes = this.flakes.map((flake) => (flake.y > H + 6 ? this.flake(flake.layer, false) : flake));

    for (const light of this.bokeh) {
      light.y += light.vy * dt;
      light.ph += dt;
    }
    this.bokeh = this.bokeh.map((light) => (light.y < -30 ? this.boke(false) : light));

    for (const star of this.stars) {
      star.age += dt;
      star.x += star.vx * dt;
      star.y += star.vy * dt;
    }
    this.stars = this.stars.filter((star) => star.age < star.life);
  }

  // ── keep-clear ─────────────────────────────────────────────────────────────

  private inZone(x: number, y: number, margin: number): FestivalZone | null {
    for (const zone of this.zones) {
      if (zone.soft) continue;
      if (
        x > zone.x - margin &&
        x < zone.x + zone.w + margin &&
        y > zone.y - margin &&
        y < zone.y + zone.h + margin
      ) {
        return zone;
      }
    }
    return null;
  }

  /** How much a particle at (x, y) is dimmed: 10% inside content, 45% over the chart. */
  private zoneFade(x: number, y: number): number {
    for (const zone of this.zones) {
      if (x > zone.x && x < zone.x + zone.w && y > zone.y && y < zone.y + zone.h) {
        return zone.soft ? 0.45 : 0.1;
      }
    }
    return 1;
  }

  // ── render ─────────────────────────────────────────────────────────────────

  private drawStaticFrame(): void {
    this.render(0, true);
  }

  private render(elapsed: number, still = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.W;
    const H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.hasStatic) return;
    const time = still ? 99999 : elapsed;
    if (this.fest === "diwali") this.drawDiwali(ctx, time, still);
    else this.drawXmas(ctx, time, still);
  }

  private drawDiwali(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";
    const dark = this.dark;

    // ── marigold garland, hanging from the top edge ──
    const toran = this.toran;
    const appear = Math.min(1, Math.max(0, (time - 300) / 900));
    if (appear > 0) {
      const drop = (1 - easeOut(appear)) * -24;
      ctx.save();
      ctx.globalAlpha = appear * (pub ? 1 : 0.75);
      ctx.translate(0, drop);
      const segment = W / toran.n;
      const sway = still ? 0 : Math.sin((time / 1000) * ((Math.PI * 2) / 6)) * 2;
      const sag = toran.sag * 2 + sway;

      ctx.strokeStyle = dark ? "rgba(255,214,140,.5)" : "rgba(140,80,20,.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < toran.n; i += 1) {
        const x0 = i * segment;
        ctx.moveTo(x0, toran.y);
        ctx.quadraticCurveTo(x0 + segment / 2, toran.y + sag, x0 + segment, toran.y);
      }
      ctx.stroke();

      for (let i = 0; i < toran.n; i += 1) {
        const x0 = i * segment;
        for (let k = 0; k <= 8; k += 1) {
          const t = k / 8;
          const x = x0 + segment * t;
          const y = toran.y + sag * 2 * t * (1 - t);
          const r = (pub ? (this.phone ? 3.6 : 4.6) : 3.2) * (k % 2 ? 0.86 : 1);
          ctx.fillStyle = k % 3 === 0 ? "#F77F00" : k % 3 === 1 ? "#FFB627" : "#FF9F1C";
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 7);
          ctx.fill();
          ctx.fillStyle = "rgba(255,240,200,.35)";
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7);
          ctx.fill();
        }

        // scallop low point: a strand of beads
        const midX = x0 + segment / 2;
        const midY = toran.y + sag * 0.5;
        const len = pub ? (this.phone ? 14 : 22) : this.minimal ? 5 : 10;
        const beadSway = still ? 0 : Math.sin(time / 900 + i) * 1.6;
        ctx.strokeStyle = dark ? "rgba(255,214,140,.45)" : "rgba(140,80,20,.3)";
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX + beadSway, midY + len);
        ctx.stroke();
        for (let k = 0; k < 3; k += 1) {
          ctx.fillStyle = k % 2 ? "#FFC94A" : "#E85D04";
          ctx.beginPath();
          ctx.arc(midX + (beadSway * (k + 1)) / 3, midY + (len * (k + 1)) / 3 + 2, pub ? 3.2 : 2.4, 0, 7);
          ctx.fill();
        }

        // mango leaf between scallops (public composition only)
        if (pub) {
          ctx.save();
          ctx.translate(x0, toran.y + 2);
          ctx.rotate(0.08 * Math.sin(time / 1400 + i));
          ctx.fillStyle = dark ? "#3E9E5B" : "#2F7D47";
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(5, 8, 0, 16);
          ctx.quadraticCurveTo(-5, 8, 0, 0);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ── rockets ──
    for (const rocket of this.rockets) {
      const ease = easeOutQuad(rocket.t);
      const x =
        rocket.sx +
        (rocket.tx - rocket.sx) * Math.pow(ease, 2.2) +
        Math.sin(rocket.t * 6) * rocket.wob * (1 - rocket.t) * 0.3;
      const y = rocket.sy + (rocket.ty - rocket.sy) * ease;
      rocket.trail.push([x, y]);
      if (rocket.trail.length > 14) rocket.trail.shift();

      ctx.lineCap = "round";
      for (let i = 1; i < rocket.trail.length; i += 1) {
        const a = i / rocket.trail.length;
        const fade = this.zoneFade(x, y);
        ctx.strokeStyle = hexA(dark ? "#FFD27A" : "#C2410C", a * 0.7 * fade);
        ctx.lineWidth = a * 2.4;
        ctx.beginPath();
        const from = rocket.trail[i - 1];
        const to = rocket.trail[i];
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
      }
      ctx.fillStyle = dark ? "#FFF4DC" : "#B45309";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 7);
      ctx.fill();

      if (!still && Math.random() < 0.6 && this.parts.length < 900) {
        this.parts.push({
          x, y, px: x, py: y,
          vx: rand(-20, 20), vy: rand(10, 40),
          life: rand(0.25, 0.45), age: 0,
          col: "#FFB627", w: 1, drag: 3, g: 30, b: -1, flick: true, far: false,
        });
      }
    }

    // ── ignition flashes ──
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const flash of this.flash) {
      const a = flash.a * (1 - flash.age / FLASH_LIFE);
      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.r);
      glow.addColorStop(0, `rgba(255,240,210,${a * (dark ? 1 : 0.5)})`);
      glow.addColorStop(1, "rgba(255,240,210,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, flash.r, 0, 7);
      ctx.fill();
    }

    // ── sparks: a streak whose length follows its speed ──
    ctx.lineCap = "round";
    for (const part of this.parts) {
      const k = part.age / part.life;
      let a = (1 - k) * (1 - k * 0.3);
      if (part.flick && k > 0.55) a *= Math.random() < 0.5 ? 0.25 : 1;
      a *= this.zoneFade(part.x, part.y);
      if (a < 0.02) continue;

      const col = part.c2 && k > 0.35 ? part.c2 : part.col;
      const dx = part.x - part.px;
      const dy = part.y - part.py;
      const dist = Math.hypot(dx, dy) || 1;
      const length = Math.max(dist * 3.6, part.b >= 0 ? (part.far ? 3 : 6) * (1 - k) : 2);
      const tx = part.x - (dx / dist) * length;
      const ty = part.y - (dy / dist) * length;

      if (!part.far && part.b >= 0 && part.age > 0.08) {
        ctx.strokeStyle = hexA(col, a * (dark ? 0.22 : 0.26));
        ctx.lineWidth = part.w * (dark ? 3.2 : 3.8);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(part.x, part.y);
        ctx.stroke();
      }
      ctx.strokeStyle = hexA(col, Math.min(1, a));
      ctx.lineWidth = part.w * (dark ? 1 : 1.25) * (1 - k * 0.4);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(part.x, part.y);
      ctx.stroke();

      if (part.b >= 0 && k < 0.7) {
        ctx.fillStyle = dark ? `rgba(255,250,235,${a * 0.9})` : hexA(col, a);
        ctx.beginPath();
        ctx.arc(part.x, part.y, part.w * (dark ? 0.75 : 0.85), 0, 7);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // ── reduced motion / paused: one celebratory still ──
    if (still && !this.minimal && !this.parts.length) this.frozenBursts(ctx, pub ? 1 : 0.55);

    // ── petals ──
    const petalAlpha = Math.min(1, Math.max(0, (time - 600) / 1200));
    for (const petal of this.petals) {
      const a = petalAlpha * this.zoneFade(petal.x, petal.y) * (pub ? 0.95 : 0.7);
      if (a < 0.03) continue;
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rot);
      ctx.globalAlpha = a;
      if (petal.kind === "flower") {
        for (let k = 0; k < 6; k += 1) {
          ctx.rotate(Math.PI / 3);
          ctx.fillStyle = petal.col;
          ctx.beginPath();
          ctx.ellipse(petal.sz * 0.55, 0, petal.sz * 0.55, petal.sz * 0.3, 0, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = "#8a3b00";
        ctx.beginPath();
        ctx.arc(0, 0, petal.sz * 0.22, 0, 7);
        ctx.fill();
      } else {
        ctx.fillStyle = petal.col;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          petal.sz * 0.5,
          petal.sz * 0.95 * Math.abs(Math.cos(petal.ph)) + petal.sz * 0.2,
          0,
          0,
          7,
        );
        ctx.fill();
      }
      ctx.restore();
    }

    // ── diyas along the bottom edge ──
    for (const diya of this.diyas) {
      const a = Math.min(1, Math.max(0, (time - diya.del) / 700));
      if (!a) continue;
      this.drawDiya(ctx, diya, time, a, still, dark);
    }

    void W;
    void H;
  }

  private frozenBursts(ctx: CanvasRenderingContext2D, scale: number): void {
    const sky = this.sky;
    const pal = paletteFor(this.fest, this.dark);
    const points: [number, number, number][] = [
      [0.7, 0.3, 1],
      [0.35, 0.55, 0.7],
      [0.9, 0.6, 0.5],
    ];
    ctx.globalCompositeOperation = this.dark ? "lighter" : "source-over";
    points.forEach(([fx, fy, z], index) => {
      const x = sky.x0 + (sky.x1 - sky.x0) * fx;
      const y = sky.y0 + (sky.y1 - sky.y0) * fy;
      const radius = 60 * z * scale * this.scale;
      const col = pal[index % pal.length];
      for (let i = 0; i < 36; i += 1) {
        const angle = (i / 36) * Math.PI * 2;
        const inner = radius * 0.25;
        const outer = radius * (0.8 + 0.2 * Math.sin(i * 3));
        ctx.strokeStyle = hexA(col, 0.75);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
        ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer + outer * 0.06);
        ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = "source-over";
  }

  private drawDiya(
    ctx: CanvasRenderingContext2D,
    diya: Diya,
    time: number,
    alpha: number,
    still: boolean,
    dark: boolean,
  ): void {
    ctx.save();
    ctx.translate(diya.x, diya.y);
    ctx.scale(diya.s, diya.s);
    ctx.globalAlpha = alpha;

    const flicker = still ? 1 : 1 + Math.sin(time / 120 + diya.ph) * 0.06 + Math.sin(time / 53 + diya.ph * 2) * 0.04;
    const glow = ctx.createRadialGradient(0, -16, 0, 0, -16, 46);
    glow.addColorStop(0, `rgba(255,190,90,${dark ? 0.42 : 0.28})`);
    glow.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -16, 46, 0, 7);
    ctx.fill();

    ctx.fillStyle = "#9C3A12";
    ctx.beginPath();
    ctx.moveTo(-17, -6);
    ctx.quadraticCurveTo(0, 10, 17, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#E8A33A";
    ctx.beginPath();
    ctx.ellipse(0, -6, 17, 3.4, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#C2571A";
    for (let k = -2; k <= 2; k += 1) {
      ctx.beginPath();
      ctx.arc(k * 6, 0, 1.2, 0, 7);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, -8);
    ctx.scale(1 / flicker, flicker);
    ctx.rotate(still ? 0 : Math.sin(time / 300 + diya.ph) * 0.06);
    const flame = ctx.createLinearGradient(0, -18, 0, 0);
    flame.addColorStop(0, "rgba(255,246,208,0)");
    flame.addColorStop(0.25, "#FFE9A8");
    flame.addColorStop(0.7, "#FFB02E");
    flame.addColorStop(1, "#FF6A00");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.bezierCurveTo(6, -9, 5, -2, 0, 0);
    ctx.bezierCurveTo(-5, -2, -6, -9, 0, -19);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,240,.85)";
    ctx.beginPath();
    ctx.ellipse(0, -4, 1.6, 3.4, 0, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  private drawXmas(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    const W = this.W;
    const H = this.H;
    const pub = this.variant === "public-hero";
    const dark = this.dark;

    // ── aurora, drawn as soft banded sheets and masked at the edges ──
    const auroraAlpha = this.minimal ? 0 : Math.min(1, time / 1200) * (pub ? 1 : 0.55);
    if (auroraAlpha > 0) {
      ctx.save();
      const x0 = pub ? (this.phone ? 0 : W * 0.38) : this.sky.x0 - 40;
      const x1 = pub ? W : this.sky.x1 + 40;
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      const bands: [string, number][] = dark
        ? [["60,230,190", 0.16], ["120,255,160", 0.1], ["150,120,255", 0.1]]
        : [["60,200,170", 0.1], ["130,150,255", 0.08], ["120,220,170", 0.07]];

      bands.forEach(([rgb, alpha], i) => {
        const baseY = (pub ? H * 0.12 : H * 0.25) + i * (pub ? 28 : 8);
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 24) {
          const y =
            baseY +
            Math.sin(x / 170 + time / 2600 + i * 1.7) * (pub ? 22 : 6) +
            Math.sin(x / 61 + time / 1700 + i) * (pub ? 8 : 2);
          if (x === x0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = x1; x >= x0; x -= 24) {
          const y =
            baseY +
            (pub ? 90 : 24) +
            Math.sin(x / 140 + time / 3100 + i) * (pub ? 26 : 6);
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, baseY - 20, 0, baseY + (pub ? 110 : 30));
        gradient.addColorStop(0, `rgba(${rgb},0)`);
        gradient.addColorStop(0.35, `rgba(${rgb},${alpha * auroraAlpha})`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // A hard edge at either side would read as a painted rectangle: feather it.
      ctx.globalCompositeOperation = "destination-in";
      const mask = ctx.createLinearGradient(x0, 0, x1, 0);
      mask.addColorStop(0, "rgba(0,0,0,0)");
      mask.addColorStop(0.3, "rgba(0,0,0,1)");
      mask.addColorStop(0.85, "rgba(0,0,0,1)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── rising warm lights ──
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const light of this.bokeh) {
      const a =
        light.a *
        (0.7 + 0.3 * Math.sin(light.ph * 1.3)) *
        Math.min(1, time / 1500) *
        this.zoneFade(light.x, light.y) *
        (dark ? 1 : 0.6);
      const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r);
      glow.addColorStop(0, hexA(light.col, a));
      glow.addColorStop(1, hexA(light.col, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.r, 0, 7);
      ctx.fill();
    }

    // ── shooting stars ──
    for (const star of this.stars) {
      const k = star.age / star.life;
      const a = Math.sin(Math.PI * k) * this.zoneFade(star.x, star.y);
      const magnitude = Math.hypot(star.vx, star.vy);
      const ux = star.vx / magnitude;
      const uy = star.vy / magnitude;
      const trail = ctx.createLinearGradient(star.x, star.y, star.x - ux * star.len, star.y - uy * star.len);
      trail.addColorStop(0, `rgba(255,250,235,${a})`);
      trail.addColorStop(1, "rgba(255,250,235,0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = pub ? 2 : 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - ux * star.len, star.y - uy * star.len);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, pub ? 2.2 : 1.5, 0, 7);
      ctx.fill();
    }

    if (still && pub) {
      const sky = this.sky;
      const x = sky.x0 + (sky.x1 - sky.x0) * 0.75;
      const y = sky.y0 + 30;
      const trail = ctx.createLinearGradient(x, y, x + 160, y - 50);
      trail.addColorStop(0, "rgba(255,250,235,.9)");
      trail.addColorStop(1, "rgba(255,250,235,0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 160, y - 50);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    // ── snow, three depths ──
    const snowAlpha = Math.min(1, Math.max(0, (time - 1000) / 2500));
    for (const flake of this.flakes) {
      const layerAlpha = flake.layer === 0 ? Math.min(1, snowAlpha * 1.6) : snowAlpha;
      const a = flake.a * layerAlpha * this.zoneFade(flake.x, flake.y);
      if (a < 0.03) continue;
      ctx.fillStyle = dark ? `rgba(240,248,255,${a})` : `rgba(120,143,175,${a * 0.85})`;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.r, 0, 7);
      ctx.fill();
    }

    // ── evergreens, bottom left ──
    for (const pine of this.pines) {
      ctx.save();
      ctx.translate(pine.x, H);
      ctx.scale(pine.s, pine.s);
      ctx.globalAlpha = Math.min(1, time / 1400);
      ctx.fillStyle = dark ? "#123b34" : "#2c6b57";
      for (let k = 0; k < 3; k += 1) {
        const w = 34 - k * 8;
        const y = -18 - k * 20;
        ctx.beginPath();
        ctx.moveTo(-w, y + 12);
        ctx.lineTo(0, y - 26);
        ctx.lineTo(w, y + 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = dark ? "rgba(240,248,255,.75)" : "rgba(255,255,255,.9)";
      for (let k = 0; k < 3; k += 1) {
        const w = 34 - k * 8;
        const y = -18 - k * 20;
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, y - 2);
        ctx.lineTo(0, y - 26);
        ctx.lineTo(w * 0.5, y - 2);
        ctx.quadraticCurveTo(0, y - 8, -w * 0.5, y - 2);
        ctx.fill();
      }
      ctx.fillStyle = "#5a3a24";
      ctx.fillRect(-3, -18, 6, 18);
      ctx.restore();
    }

    // ── strings of bulbs, switching on left to right ──
    for (const string of this.strs) {
      const x0 = string.x0;
      const width = string.x1 - string.x0;
      const loops = string.loops;
      const yAt = (t: number) => string.y0 + string.sag * Math.abs(Math.sin(t * Math.PI * loops));

      ctx.strokeStyle = dark ? "rgba(200,220,230,.35)" : "rgba(40,60,70,.35)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const t = i / 80;
        const x = x0 + width * t;
        if (i) ctx.lineTo(x, yAt(t));
        else ctx.moveTo(x, yAt(0));
      }
      ctx.stroke();

      for (const bulb of string.b) {
        const x = x0 + width * bulb.t;
        const y = yAt(bulb.t) + 4;
        const on = still ? 1 : Math.min(1, Math.max(0, (time - bulb.on) / 260));
        const breathe = still ? 1 : 0.72 + 0.28 * Math.sin((time / 1000) * ((Math.PI * 2) / 4.8) + bulb.ph);

        ctx.fillStyle = dark ? "#3a4650" : "#55606a";
        ctx.fillRect(x - 1.6, y - 5, 3.2, 3);

        const radius = pub ? (this.phone ? 3.2 : 4.2) : 3;
        if (on > 0) {
          ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
          const glow = ctx.createRadialGradient(x, y + radius * 0.4, 0, x, y + radius * 0.4, radius * (dark ? 5 : 3));
          glow.addColorStop(0, hexA(bulb.col, (dark ? 0.55 : 0.35) * on * breathe));
          glow.addColorStop(1, hexA(bulb.col, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(x, y + radius * 0.4, radius * (dark ? 5 : 3), 0, 7);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.fillStyle = on > 0 ? hexA(bulb.col, 0.35 + 0.65 * on * breathe) : dark ? "#2a333b" : "#c9d1d8";
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.5, radius * 0.78, radius, 0, 0, 7);
        ctx.fill();
      }
    }
  }
}
