export interface Accent { h: number; s: number; l: number }
export type AccentTheme = "light" | "dark";

export const ACCENT_STORAGE_KEY = "zf-accent";
export const DEFAULT_ACCENT: Accent = { h: 16, s: 88, l: 59 };

export const ACCENT_PRESETS: { id: string; label: string; accent: Accent }[] = [
  { id: "ember", label: "Ember", accent: DEFAULT_ACCENT },
  { id: "teal", label: "Teal", accent: { h: 174, s: 72, l: 38 } },
  { id: "emerald", label: "Emerald", accent: { h: 152, s: 62, l: 36 } },
  { id: "blue", label: "Blue", accent: { h: 214, s: 78, l: 48 } },
  { id: "violet", label: "Violet", accent: { h: 262, s: 68, l: 52 } },
  { id: "rose", label: "Rose", accent: { h: 344, s: 74, l: 50 } },
];

export const ACCENT_TOKENS = [
  "--brand", "--brand-strong", "--brand-ink", "--brand-foreground", "--on-brand",
  "--ring", "--accent", "--accent-foreground", "--shadow-brand", "--grad-brand",
  "--glass-sheen", "--atmosphere", "--chart-1",
] as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n);

export function parseAccent(raw: string | null): Accent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Accent>;
    if (typeof value.h !== "number" || typeof value.s !== "number" || typeof value.l !== "number") return null;
    if (value.h < 0 || value.h > 360 || value.s < 0 || value.s > 100 || value.l < 0 || value.l > 100) return null;
    return { h: round(value.h), s: round(value.s), l: round(value.l) };
  } catch {
    return null;
  }
}

export function accentToHex({ h, s, l }: Accent): string {
  const sat = s / 100, light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (n: number) => round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${to(0)}${to(8)}${to(4)}`;
}

export function hexToAccent(hex: string): Accent | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: round((h + 360) % 360), s: round(s * 100), l: round(l * 100) };
}

export const formatHsl = (a: Accent) => `hsl(${a.h} ${a.s}% ${a.l}%)`;

export const formatRgb = (a: Accent) => {
  const hex = accentToHex(a);
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
};

function luminanceAccent(a: Accent): number {
  const hex = accentToHex(a);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const darkInk = "24 14% 10%";
const lightInk = "0 0% 100%";

export function accentTokens(a: Accent, theme: AccentTheme): Record<string, string> {
  const h = clamp(a.h, 0, 360);
  const s = clamp(a.s, 0, 100);
  const l = theme === "light" ? clamp(a.l, 34, 62) : clamp(a.l, 46, 70);
  const strongL = theme === "light" ? Math.max(30, l - 17) : Math.max(34, Math.min(l, 48));
  const inkL = theme === "light" ? Math.max(22, l - 24) : Math.min(80, l + 12);
  const ringL = theme === "light" ? Math.max(28, l - 13) : Math.min(78, l + 4);
  const foreground = luminanceAccent({ h, s, l }) > 0.42 ? darkInk : lightInk;
  const tintL = theme === "light" ? 95 : 16;
  return {
    "--brand": `${h} ${s}% ${l}%`,
    "--brand-strong": `${h} ${s}% ${strongL}%`,
    "--brand-ink": `${h} ${s}% ${inkL}%`,
    "--brand-foreground": foreground,
    "--on-brand": foreground,
    "--ring": `${h} ${s}% ${ringL}%`,
    "--accent": `${h} ${Math.round(s * 0.55)}% ${tintL}%`,
    "--accent-foreground": `${h} ${s}% ${inkL}%`,
    "--shadow-brand": `0 22px 40px -22px hsl(${h} ${s}% ${strongL}% / .65)`,
    "--grad-brand": `linear-gradient(135deg, hsl(${h} ${s}% ${Math.max(24, l - 16)}%) 0%, hsl(${(h + 356) % 360} ${s}% ${Math.max(20, l - 23)}%) 100%)`,
    "--glass-sheen": `radial-gradient(120% 90% at 0% 0%, hsl(${h} ${s}% ${l}% / .20), transparent 60%), linear-gradient(160deg, hsl(0 0% 100% / .65), hsl(${h} 80% 96% / 0) 55%)`,
    "--atmosphere": `radial-gradient(46rem 28rem at 88% -6%, hsl(${h} ${s}% ${l}% / .14), transparent 62%), radial-gradient(40rem 26rem at -4% 4%, hsl(${h} 80% ${theme === "light" ? 78 : 30}% / .16), transparent 60%), radial-gradient(36rem 24rem at 50% 112%, hsl(${h} ${s}% ${l}% / .06), transparent 62%)`,
    "--chart-1": `${h} ${s}% ${l}%`,
  };
}
