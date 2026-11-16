import { Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AssistantComposer } from "./AssistantComposer";
import { AssistantThread } from "./AssistantThread";
import type { UseAssistantResult } from "./useAssistant";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistant: UseAssistantResult;
}

/**
 * The assistant panel.
 *
 * Built on the app's existing `Sheet` primitive so focus trapping, Escape,
 * scroll locking and the `aria-modal` semantics are the ones the rest of the
 * dashboard already uses — rather than a bespoke overlay that would need all of
 * that re-implemented (and would drift).
 */
export function AssistantPanel({ open, onOpenChange, assistant }: Props) {
  const { messages, status, error, hydration, send, retry, clear, canSend } = assistant;
  const badge = hydration.degraded ? "Fallback" : "Read-only";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="zf-assistant-panel"
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[440px] sm:max-w-[440px]"
        aria-label="ZenFolio assistant"
      >
        <header className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3 pr-12">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-sm font-semibold leading-tight text-foreground">
              ZenFolio Assistant
            </SheetTitle>
            <SheetDescription className="truncate text-[11px] leading-tight text-muted-foreground">
              {hydration.degraded
                ? "AI unavailable — answering from live data"
                : "Asks your portfolio, not the internet"}
            </SheetDescription>
          </div>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={messages.length === 0}
            aria-label="Clear conversation"
            title="Clear conversation"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            className="m-0 border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-[11px] leading-relaxed text-destructive"
          >
            {error}
          </p>
        ) : null}

        <AssistantThread
          messages={messages}
          sending={status === "sending"}
          onSuggestion={send}
          onRetry={retry}
        />

        <AssistantComposer onSend={send} disabled={!canSend} sending={status === "sending"} />
      </SheetContent>
    </Sheet>
  );
}
