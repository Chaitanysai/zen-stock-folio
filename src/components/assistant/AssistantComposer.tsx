import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { MAX_MESSAGE_CHARS } from "@/lib/assistant/schemas";
import { ASSISTANT_DISCLOSURE } from "@/lib/assistant/types";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  sending: boolean;
}

const MAX_TEXTAREA_HEIGHT = 128;

export function AssistantComposer({ onSend, disabled, sending }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    // Reset the height after the content is cleared.
    requestAnimationFrame(resize);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_MESSAGE_CHARS - value.length;

  return (
    <div className="border-t border-border/70 bg-card/60 px-3 pb-3 pt-2.5">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="zf-assistant-input" className="sr-only">
          Ask the ZenFolio assistant
        </label>
        <textarea
          id="zf-assistant-input"
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value.slice(0, MAX_MESSAGE_CHARS));
            resize();
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="Ask about your portfolio…"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-describedby="zf-assistant-hint"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label={sending ? "Waiting for the assistant" : "Send message"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
        >
          {sending ? (
            <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <SendHorizontal size={16} aria-hidden="true" />
          )}
        </button>
      </form>

      <p id="zf-assistant-hint" className="m-0 mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
        {remaining < 200 ? `${remaining} characters left. ` : ""}
        {ASSISTANT_DISCLOSURE}
      </p>
    </div>
  );
}
