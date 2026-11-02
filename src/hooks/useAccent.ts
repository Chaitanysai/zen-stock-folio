import { useCallback, useEffect, useState } from "react";
import {
  ACCENT_STORAGE_KEY,
  ACCENT_TOKENS,
  DEFAULT_ACCENT,
  accentTokens,
  parseAccent,
  type Accent,
} from "@/lib/theme/accent";

interface StoredAccent {
  accent: Accent;
  light: Record<string, string>;
  dark: Record<string, string>;
}

const isDark = () => document.documentElement.classList.contains("dark");

function readStored(): Accent | null {
  try {
    const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accent?: unknown };
    return parseAccent(parsed?.accent ? JSON.stringify(parsed.accent) : null);
  } catch {
    return null;
  }
}

function applyTokens(tokens: Record<string, string>): void {
  const root = document.documentElement;
  for (const name of ACCENT_TOKENS) {
    const value = tokens[name];
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
  root.dataset.accent = "custom";
}

function clearTokens(): void {
  const root = document.documentElement;
  for (const name of ACCENT_TOKENS) root.style.removeProperty(name);
  root.removeAttribute("data-accent");
}

export function useAccent() {
  const [accent, setAccentState] = useState<Accent>(() => readStored() ?? DEFAULT_ACCENT);

  const setAccent = useCallback((next: Accent) => {
    const stored: StoredAccent = {
      accent: next,
      light: accentTokens(next, "light"),
      dark: accentTokens(next, "dark"),
    };
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage can be unavailable in private modes; keep the in-session accent.
    }
    setAccentState(next);
    applyTokens(isDark() ? stored.dark : stored.light);
    window.dispatchEvent(new Event("zf-accent"));
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    } catch {
      // Ignore storage failures; tokens still reset below.
    }
    clearTokens();
    setAccentState(DEFAULT_ACCENT);
    window.dispatchEvent(new Event("zf-accent"));
  }, []);

  useEffect(() => {
    const sync = () => {
      const stored = readStored();
      setAccentState(stored ?? DEFAULT_ACCENT);
      if (stored) applyTokens(accentTokens(stored, isDark() ? "dark" : "light"));
      else clearTokens();
    };

    // The inline token map is theme-specific, so re-apply it when next-themes
    // flips the class, not only when the accent itself changes.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("zf-accent", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", sync);
      window.removeEventListener("zf-accent", sync);
    };
  }, []);

  return { accent, setAccent, reset };
}

export default useAccent;
