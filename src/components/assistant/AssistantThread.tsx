import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { AssistantCards } from "./AssistantCards";
import { ASSISTANT_SUGGESTIONS } from "@/lib/assistant/toolCatalog";
import type { AssistantMessage } from "@/lib/assistant/types";

interface Props {
  messages: AssistantMessage[];
  sending: boolean;
  onSuggestion: (text: string) => void;
  onRetry: () => void;
}

/**
 * Assistant output is rendered as a restricted subset of markdown.
 *
 * Lists and emphasis make a short answer readable. Links and images are not
 * rendered as such: a model-generated URL is not a trusted destination, so any
 * anchor becomes plain text rather than a click target.
 */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground [&_li]:mb-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        components={{
          a: ({ children }) => <span className="underline decoration-dotted">{children}</span>,
          img: () => null,
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse [animation-duration:900ms]"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

export function AssistantThread({ messages, sending, onSuggestion, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [messages, sending]);

  const lastMessage = messages[messages.length - 1];
  const showRetry = !sending && lastMessage?.role === "assistant" && Boolean(lastMessage.error);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4 px-4 py-6">
        <div className="flex flex-col gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={17} aria-hidden="true" />
          </div>
          <h2 className="m-0 text-sm font-semibold text-foreground">Ask about your portfolio</h2>
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            I can read your positions, totals, P&amp;L, quotes and market state — using the same
            numbers the dashboard shows.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ASSISTANT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border border-border bg-card px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Assistant conversation"
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <p className="m-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">
              {message.content}
            </p>
          </div>
        ) : (
          <div key={message.id} className="flex gap-2">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Bot size={13} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              {message.error ? (
                <p
                  className="m-0 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive"
                  role="status"
                >
                  {message.content}
                </p>
              ) : (
                <AssistantMarkdown content={message.content} />
              )}
              {message.cards && message.cards.length > 0 ? <AssistantCards cards={message.cards} /> : null}
              {message.degraded ? (
                <p className="m-0 mt-1 text-[10.5px] text-muted-foreground">
                  Answered without AI — the model service was unavailable.
                </p>
              ) : null}
            </div>
          </div>
        ),
      )}

      {sending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted">
            <Bot size={13} aria-hidden="true" />
          </div>
          <TypingDots />
          <span className="sr-only">Assistant is looking that up</span>
        </div>
      ) : null}

      {showRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Try again
        </button>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
