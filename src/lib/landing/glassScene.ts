/**
 * ZenFolio hero scene: a candlestick skyline.
 *
 * Three rows of extruded candles recede from the viewer on a lit grid floor,
 * with a trend line and a live-price marker over the front row. Every candle is
 * an instanced box pair (body + wick) rather than a transmissive mesh, so the
 * scene stays cheap enough to run full-bleed behind the headline.
 *
 * The canvas is transparent: the page atmosphere shows through, the fog colour
 * matches the page, and the camera looks left of centre so the field mass sits
 * in the right half and runs past the viewport edge.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type GlassSceneTheme = "dark" | "light";

export interface GlassSceneHandle {
  setProgress: (progress: number) => void;
  setPointer: (x: number, y: number) => void;
  setTheme: (theme: GlassSceneTheme) => void;
  setActive: (active: boolean) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

interface Palette {
  up: number;
  down: number;
  wick: number;
  line: number;
  dust: number;
  floor: number;
}

const PAGE_COLOUR: Record<GlassSceneTheme, number> = {
  dark: 0x131210,
  light: 0xf6f4f0,
};

const PALETTE: Record<GlassSceneTheme, Palette> = {
  dark: {
    up: 0xc84812,
    down: 0x4a443d,
    wick: 0x9c8e80,
    line: 0xffb27a,
    dust: 0xffcfa8,
    floor: 0xffb27a,
  },
  light: {
    up: 0xd94d16,
    down: 0x8d8680,
    wick: 0x8a8278,
    line: 0xc9581f,
    dust: 0xb85a2a,
    floor: 0xd0642f,
  },
};

const FLOOR_Y = 0;
const MAIN_HEIGHT = 2.1;

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  up: boolean;
}

interface RowSpec {
  seed: number;
  count: number;
  span: number;
  depth: number;
  height: number;
  bodyWidth: number;
  drift: number;
}

const ROWS: RowSpec[] = [
  { seed: 11, count: 34, span: 4.8, depth: 0, height: MAIN_HEIGHT, bodyWidth: 0.085, drift: 0.012 },
  { seed: 27, count: 24, span: 5.6, depth: -1.7, height: 1.5, bodyWidth: 0.07, drift: 0.008 },
  { seed: 43, count: 18, span: 6.4, depth: -3.4, height: 1.1, bodyWidth: 0.06, drift: 0.005 },
];

/** Deterministic PRNG so the chart is the same on every visit and test run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeries(spec: RowSpec): Candle[] {
  const rand = mulberry32(spec.seed);
  let previous = 0.46;
  const candles: Candle[] = [];
  for (let i = 0; i < spec.count; i += 1) {
    const close = Math.max(0.08, previous + spec.drift + (rand() - 0.5) * 0.18);
    const open = previous;
    const top = Math.max(open, close);
    const bottom = Math.min(open, close);
    candles.push({
      open,
      close,
      high: top + rand() * 0.09,
      low: Math.max(0.03, bottom - rand() * 0.09),
      up: close >= open,
    });
    previous = close;
  }

  const peak = candles.reduce((max, candle) => Math.max(max, candle.high), 0);
  return candles.map((candle) => ({
    ...candle,
    open: candle.open / peak,
    close: candle.close / peak,
    high: candle.high / peak,
    low: candle.low / peak,
  }));
}

function glowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    g.addColorStop(0.35, "rgba(255, 255, 255, 0.30)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dustfield(): THREE.BufferGeometry {
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 9;
    positions[i * 3 + 1] = Math.random() * 3.4 + 0.1;
    positions[i * 3 + 2] = (Math.random() - 0.35) * 7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

interface RowHandle {
  bodies: THREE.InstancedMesh;
  wicks: THREE.InstancedMesh;
  candles: Candle[];
}

function buildRow(
  candles: Candle[],
  spec: RowSpec,
  bodyGeometry: THREE.BoxGeometry,
  wickGeometry: THREE.BoxGeometry,
  bodyMaterial: THREE.Material,
  wickMaterial: THREE.Material,
): RowHandle {
  const count = candles.length;
  const step = spec.span / (count - 1);
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  const wicks = new THREE.InstancedMesh(wickGeometry, wickMaterial, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  candles.forEach((candle, index) => {
    const x = -spec.span / 2 + index * step;
    const bodyHeight = Math.max(Math.abs(candle.close - candle.open) * spec.height, 0.014);
    const bodyBottom = Math.min(candle.open, candle.close) * spec.height;
    const wickHeight = Math.max((candle.high - candle.low) * spec.height, 0.02);
    const wickMiddle = ((candle.high + candle.low) / 2) * spec.height;

    position.set(x, bodyBottom + bodyHeight / 2, spec.depth);
    scale.set(spec.bodyWidth, bodyHeight, spec.bodyWidth);
    matrix.compose(position, rotation, scale);
    bodies.setMatrixAt(index, matrix);

    position.set(x, wickMiddle, spec.depth);
    scale.set(0.013, wickHeight, 0.013);
    matrix.compose(position, rotation, scale);
    wicks.setMatrixAt(index, matrix);
  });

  bodies.instanceMatrix.needsUpdate = true;
  wicks.instanceMatrix.needsUpdate = true;
  bodies.frustumCulled = false;
  wicks.frustumCulled = false;

  return { bodies, wicks, candles };
}

export function createGlassScene(canvas: HTMLCanvasElement, theme: GlassSceneTheme): GlassSceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  const isDark = theme === "dark";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isDark ? 1 : 1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAGE_COLOUR[theme], 7.5, 21);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 1.28, 5.15);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;

  const field = new THREE.Group();
  field.position.y = FLOOR_Y;
  field.rotation.y = -0.24;
  scene.add(field);

  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wickGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.04,
    envMapIntensity: isDark ? 0.45 : 0.65,
  });
  const wickMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE[theme].wick,
    roughness: 0.55,
    metalness: 0.1,
    envMapIntensity: isDark ? 1 : 1.2,
  });

  const rows: RowHandle[] = ROWS.map((spec) => {
    const row = buildRow(makeSeries(spec), spec, bodyGeometry, wickGeometry, bodyMaterial, wickMaterial);
    field.add(row.bodies, row.wicks);
    return row;
  });

  const upColor = new THREE.Color();
  const downColor = new THREE.Color();
  const paintRows = (palette: Palette) => {
    upColor.setHex(palette.up);
    downColor.setHex(palette.down);
    rows.forEach((row) => {
      row.candles.forEach((candle, index) => {
        row.bodies.setColorAt(index, candle.up ? upColor : downColor);
      });
      if (row.bodies.instanceColor) row.bodies.instanceColor.needsUpdate = true;
    });
  };
  paintRows(PALETTE[theme]);

  // Trend line through the front row's highs.
  const main = rows[0];
  const step = ROWS[0].span / (main.candles.length - 1);
  const linePoints = main.candles.map(
    (candle, index) =>
      new THREE.Vector3(-ROWS[0].span / 2 + index * step, candle.high * ROWS[0].height + 0.06, 0),
  );
  const trendCurve = new THREE.CatmullRomCurve3(linePoints, false, "catmullrom", 0.25);
  const trendGeometry = new THREE.TubeGeometry(trendCurve, 180, 0.007, 5, false);
  const trendMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE[theme].line,
    transparent: true,
    opacity: isDark ? 0.9 : 0.75,
    depthWrite: false,
  });
  field.add(new THREE.Mesh(trendGeometry, trendMaterial));

  const texture = glowTexture();
  const markerMaterial = new THREE.SpriteMaterial({
    map: texture,
    color: PALETTE[theme].line,
    transparent: true,
    opacity: isDark ? 0.95 : 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const marker = new THREE.Sprite(markerMaterial);
  const lastPoint = linePoints[linePoints.length - 1];
  marker.position.set(lastPoint.x, lastPoint.y + 0.03, lastPoint.z);
  marker.scale.setScalar(0.4);
  field.add(marker);

  // Floor grid: what makes the candles read as objects in space.
  const grid = new THREE.GridHelper(28, 28, PALETTE[theme].floor, PALETTE[theme].floor);
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = isDark ? 0.16 : 0.1;
  gridMaterial.depthWrite = false;
  grid.position.y = FLOOR_Y - 0.004;
  scene.add(grid);

  const glowMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: isDark ? 0.32 : 0.16,
    blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), glowMaterial);
  glow.position.set(1.1, 1.1, -6.4);
  scene.add(glow);

  const dustMaterial = new THREE.PointsMaterial({
    color: PALETTE[theme].dust,
    size: 0.02,
    sizeAttenuation: true,
    transparent: true,
    opacity: isDark ? 0.7 : 0.32,
    blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustfield(), dustMaterial);
  scene.add(dust);

  const ambient = new THREE.AmbientLight(0xffffff, isDark ? 0.35 : 0.7);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffd2b0, isDark ? 1.28 : 1.4);
  key.position.set(3.4, 4.6, 3.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, isDark ? 1.4 : 0.75);
  rim.position.set(-4, 1.2, -3);
  scene.add(rim);

  let progress = 0;
  let progressTarget = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let active = true;
  let elapsed = 0;
  let last = performance.now();
  let disposed = false;

  let baseZ = 5.15;
  let lookAtX = 0;
  let lookAtTargetX = 0;

  const resize = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Narrow (portrait) stages crop the wide chart too hard; ease the camera back a little.
    baseZ = 5.15 * Math.min(1.18, Math.max(1, Math.pow(0.82 / camera.aspect, 0.3)));
    // Aim left of centre on wide screens: the skyline shifts right, past the edge.
    const wide = Math.min(1, Math.max(0, (camera.aspect - 0.95) / 0.85));
    lookAtTargetX = -0.98 * wide;
    renderer.setSize(width, height, false);
  };

  const render = (now: number) => {
    if (disposed) return;
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!active) return;
    elapsed += delta;

    const ease = 1 - Math.exp(-delta * 6);
    pointerX += (pointerTargetX - pointerX) * ease;
    pointerY += (pointerTargetY - pointerY) * ease;
    progress += (progressTarget - progress) * (1 - Math.exp(-delta * 5));
    lookAtX += (lookAtTargetX - lookAtX) * (1 - Math.exp(-delta * 4));

    // Candles rise out of the floor on first paint, then hold.
    const intro = 1 - Math.pow(1 - Math.min(1, elapsed / 1.1), 3);
    field.scale.y = 0.02 + 0.98 * intro;

    field.rotation.y = -0.24 + pointerX * 0.16 + Math.sin(elapsed * 0.14) * 0.025;
    field.rotation.x = pointerY * 0.045;
    field.position.y = FLOOR_Y - progress * 0.18;

    dust.rotation.y = -elapsed * 0.02 + pointerX * 0.05;
    dust.rotation.x = pointerY * 0.03;

    marker.scale.setScalar(0.4 + Math.sin(elapsed * 1.6) * 0.03);
    markerMaterial.opacity = (isDark ? 0.95 : 0.8) * (0.82 + Math.sin(elapsed * 1.6) * 0.18);

    camera.position.x = pointerX * 0.42;
    camera.position.y = 1.28 - pointerY * 0.2 + progress * 0.12;
    camera.position.z = baseZ - progress * 1.7;
    camera.lookAt(lookAtX, 0.82 - progress * 0.14, 0);

    renderer.render(scene, camera);
  };

  renderer.setAnimationLoop(render);

  return {
    setProgress(value) {
      progressTarget = Math.max(0, Math.min(1, value));
    },
    setPointer(x, y) {
      pointerTargetX = Math.max(-1, Math.min(1, x));
      pointerTargetY = Math.max(-1, Math.min(1, y));
    },
    setTheme(next) {
      const dark = next === "dark";
      const palette = PALETTE[next];
      (scene.fog as THREE.Fog).color = new THREE.Color(PAGE_COLOUR[next]);
      renderer.toneMappingExposure = 1;
      ambient.intensity = dark ? 0.35 : 0.7;
      key.intensity = dark ? 1.28 : 1.4;
      rim.intensity = dark ? 1.4 : 0.75;
      paintRows(palette);
      bodyMaterial.envMapIntensity = dark ? 0.45 : 0.65;
      wickMaterial.color = new THREE.Color(palette.wick);
      wickMaterial.envMapIntensity = dark ? 1 : 1.2;
      trendMaterial.color = new THREE.Color(palette.line);
      trendMaterial.opacity = dark ? 0.9 : 0.75;
      markerMaterial.color = new THREE.Color(palette.line);
      gridMaterial.color = new THREE.Color(palette.floor);
      gridMaterial.opacity = dark ? 0.16 : 0.1;
      glowMaterial.opacity = dark ? 0.32 : 0.16;
      glowMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      dustMaterial.color = new THREE.Color(palette.dust);
      dustMaterial.opacity = dark ? 0.7 : 0.32;
      dustMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      glowMaterial.needsUpdate = true;
      dustMaterial.needsUpdate = true;
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      last = performance.now();
    },
    resize,
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      bodyGeometry.dispose();
      wickGeometry.dispose();
      bodyMaterial.dispose();
      wickMaterial.dispose();
      rows.forEach((row) => {
        row.bodies.dispose();
        row.wicks.dispose();
      });
      trendGeometry.dispose();
      trendMaterial.dispose();
      markerMaterial.dispose();
      texture.dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
      glow.geometry.dispose();
      glowMaterial.dispose();
      dust.geometry.dispose();
      dustMaterial.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
