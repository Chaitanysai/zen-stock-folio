import { Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onToggle: () => void;
}

/**
 * Floating entry point.
 *
 * Sits above the mobile bottom navigation (which is fixed and would otherwise
 * cover it) and below the sheet overlay, so the panel always wins the stacking
 * contest. `aria-expanded` + `aria-controls` are what make the control honest to
 * a screen reader: the panel is a disclosure, not a page navigation.
 */
export function AssistantLauncher({ open, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="zf-assistant-panel"
      aria-label={open ? "Close AssistZF" : "Open AssistZF"}
      className="fixed right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-3 text-xs font-semibold text-foreground shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:active:scale-95 md:right-6"
      style={{
        // Clear the fixed mobile nav; safe-area inset keeps it off the home bar.
        bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles size={13} aria-hidden="true" />
      </span>
      <span className="hidden sm:inline">Ask ZenFolio</span>
      <span className="sr-only sm:hidden">Ask</span>
    </button>
  );
}
