import { describe, expect, it } from "vitest";
import {
  ACCENT_TOKENS, accentToHex, accentTokens, DEFAULT_ACCENT, hexToAccent, parseAccent,
} from "./accent";

describe("accent tokens", () => {
  it("parses only valid objects", () => {
    expect(parseAccent(JSON.stringify({ h: 210, s: 80, l: 50 }))).toEqual({ h: 210, s: 80, l: 50 });
    expect(parseAccent("not json")).toBeNull();
    expect(parseAccent(JSON.stringify({ h: 400, s: 80, l: 50 }))).toBeNull();
  });

  it("round-trips hex", () => {
    expect(accentToHex({ h: 0, s: 100, l: 50 })).toBe("#ff0000");
    const back = hexToAccent("#ff0000");
    expect(back?.h).toBe(0);
    expect(back?.s).toBe(100);
    expect(back?.l).toBe(50);
  });

  it("derives every registered token and never touches profit/loss", () => {
    const light = accentTokens({ h: 210, s: 80, l: 50 }, "light");
    for (const token of ACCENT_TOKENS) expect(light[token]).toBeTruthy();
    expect(light["--profit"]).toBeUndefined();
    expect(light["--loss"]).toBeUndefined();
    expect(light["--brand"]).toBe("210 80% 50%");
    expect(light["--chart-1"]).toBe("210 80% 50%");
  });

  it("chooses a readable foreground for light and dark accents", () => {
    expect(accentTokens({ h: 50, s: 95, l: 62 }, "light")["--brand-foreground"]).toBe("24 14% 10%");
    expect(accentTokens({ h: 220, s: 85, l: 35 }, "light")["--brand-foreground"]).toBe("0 0% 100%");
  });

  it("keeps the default brand close to today's orange", () => {
    expect(DEFAULT_ACCENT).toEqual({ h: 16, s: 88, l: 59 });
  });
});
