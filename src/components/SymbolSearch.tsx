/**
 * Symbol search for the header field.
 *
 * Queries our own `GET /api/search` rather than a provider: the browser cannot
 * reach Yahoo (no CORS) and hitting a provider directly would expose whatever
 * key we hold. Debounced, and every keystroke cancels the previous request.
 */

import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import type { SearchHit, SearchResponse } from "@/lib/market-data/types.ts";
import { searchSymbols } from "@/lib/market-data/client.ts";

export interface SymbolSearchProps {
  /** Called with the chosen hit. The caller decides what to do with it. */
  onSelect: (hit: SearchHit) => void;
  placeholder?: string;
  /** Characters required before a request is sent. */
  minChars?: number;
  debounceMs?: number;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; response: SearchResponse }
  | { kind: "error"; message: string };

export function SymbolSearch({
  onSelect,
  placeholder = "Search stocks…",
  minChars = 2,
  debounceMs = 300,
}: SymbolSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when focus moves outside, so the popover never traps the cursor.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setState({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ kind: "searching" });

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await searchSymbols(trimmed, { signal: controller.signal, limit: 12 });
          if (!controller.signal.aborted) setState({ kind: "done", response });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({ kind: "error", message: error instanceof Error ? error.message : "Search failed." });
        }
      })();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minChars, debounceMs]);

  const pick = (hit: SearchHit) => {
    onSelect(hit);
    setOpen(false);
    setQuery("");
    setState({ kind: "idle" });
  };

  const hits = state.kind === "done" ? state.response.hits : [];

  return (
    <div className="zf-search" ref={rootRef} style={{ position: "relative" }}>
      <SearchIcon size={12} color="var(--tx-300)" />
      <input
        placeholder={placeholder}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && hits.length > 0) pick(hits[0]);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls="zf-symbol-results"
        aria-autocomplete="list"
      />

      {open && query.trim().length >= minChars && (
        <div
          id="zf-symbol-results"
          role="listbox"
          className="glass-pop"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 320,
            maxHeight: 320,
            overflowY: "auto",
            borderRadius: 12,
            zIndex: 60,
            padding: 4,
          }}
        >
          {state.kind === "searching" && (
            <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--tx-400)", fontFamily: "var(--ff-mono)" }}>
              Searching…
            </div>
          )}

          {state.kind === "error" && (
            <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--red)", fontFamily: "var(--ff-mono)" }}>
              {state.message}
            </div>
          )}

          {state.kind === "done" && hits.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--tx-400)", fontFamily: "var(--ff-mono)" }}>
              No match for “{state.response.query}”.
              {state.response.notes.length > 0 && (
                <div style={{ marginTop: 4, color: "var(--tx-300)" }}>{state.response.notes.join(" · ")}</div>
              )}
            </div>
          )}

          {hits.map((hit) => (
            <button
              key={`${hit.provider}:${hit.symbol}`}
              role="option"
              aria-selected={false}
              onClick={() => pick(hit)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--ff-mono)", color: "var(--tx-900)" }}>
                  {hit.symbol}
                </span>
                <span style={{ fontSize: 9.5, fontFamily: "var(--ff-mono)", color: "var(--tx-300)" }}>
                  {hit.exchange}{hit.instrumentType ? ` · ${hit.instrumentType}` : ""}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--tx-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {hit.name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SymbolSearch;
