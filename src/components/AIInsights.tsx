import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Brain,
  Send,
  RefreshCw,
  TrendingUp,
  Shield,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
  User,
  Bot,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PortfolioStock, TradeStrategy } from "@/data/sampleData";
import { fetchApi, getApiUnavailableMessage } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface Props {
  stocks: PortfolioStock[];
  trades?: TradeStrategy[];
}

function buildCtx(stocks: PortfolioStock[], trades: TradeStrategy[]): string {
  const active = stocks.filter((s) => s.status === "Active");
  const soldProfit = stocks.filter((s) => s.status === "Sold Profit");
  const soldLoss = stocks.filter((s) => s.status === "Sold Loss");

  const invested = active.reduce((s, x) => s + x.entryPrice * x.quantity, 0);
  const current = active.reduce((s, x) => s + (x.cmp ?? x.entryPrice) * x.quantity, 0);
  const unrealPnl = current - invested;
  const unrealPct = invested > 0 ? ((unrealPnl / invested) * 100).toFixed(2) : "0";
  const realPnl = stocks
    .filter((s) => s.exitPrice)
    .reduce((s, x) => s + (x.exitPrice! - x.entryPrice) * x.quantity, 0);

  const positions = active
    .map((s) => {
      const pnl = ((s.cmp ?? s.entryPrice) - s.entryPrice) * s.quantity;
      const pnlPct = s.entryPrice > 0
        ? ((pnl / (s.entryPrice * s.quantity)) * 100).toFixed(1)
        : "0";
      return `  ${pnl >= 0 ? "📈" : "📉"} ${s.ticker} (${s.sector ?? "—"}): ${s.quantity} qty @ ₹${s.entryPrice} | CMP ₹${s.cmp ?? "N/A"} | P&L ₹${pnl.toFixed(0)} (${pnlPct}%)`;
    })
    .join("\n");

  const closed = [...soldProfit, ...soldLoss]
    .map((s) => {
      const pnl = ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity;
      return `  ${s.ticker}: ₹${pnl.toFixed(0)} (${s.status})`;
    })
    .join("\n");

  const sectors = [...new Set(active.map((s) => s.sector).filter(Boolean))];

  let ctx = `=== PORTFOLIO SNAPSHOT ===
Active: ${active.length} positions
Invested:  ₹${invested.toFixed(0)}
Current:   ₹${current.toFixed(0)}
Unrealised P&L: ₹${unrealPnl.toFixed(0)} (${unrealPct}%)
Realised P&L:   ₹${realPnl.toFixed(0)} (${soldProfit.length} wins, ${soldLoss.length} losses)
Sectors: ${sectors.join(", ") || "N/A"}

Active Positions:
${positions || "  (none)"}`;

  if (closed) ctx += `\n\nClosed Trades:\n${closed}`;
  if (trades.length > 0) {
    ctx += `\n\nTrade Strategies:\n` + trades.slice(0, 5).map((t) =>
      `  ${t.ticker}: entry ₹${t.entryPrice}, SL ₹${t.stopLoss}, T1 ₹${t.target1}, T2 ₹${t.target2}`,
    ).join("\n");
  }
  return ctx;
}

const QUICK = [
  {
    label: "Portfolio health",
    icon: TrendingUp,
    prompt: "Give me a comprehensive health check of my portfolio. What's working, what's not, and what should I watch closely?",
  },
  {
    label: "Risk analysis",
    icon: Shield,
    prompt: "What are the key risks in my current portfolio? Check for concentration risk, sector exposure, and dangerous positions.",
  },
  {
    label: "What to do next?",
    icon: Lightbulb,
    prompt: "Based on my positions and P&L, give me your top 3 actionable recommendations right now.",
  },
  {
    label: "Diversification",
    icon: Sparkles,
    prompt: "Is my portfolio well diversified? What sectors or asset types am I missing? What would you add?",
  },
];

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const panelClass = "overflow-hidden rounded-xl border border-border/70 bg-card/85 shadow-sm backdrop-blur-md";

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-0.5 py-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse [animation-duration:900ms]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

function MDContent({ content }: { content: string }) {
  return (
    <div className="max-w-[70ch] text-sm text-card-foreground">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-1.5 mt-3 font-sans text-base font-bold text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1.5 mt-3 font-sans text-sm font-bold text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 font-sans text-sm font-semibold text-foreground">{children}</h3>,
          p: ({ children }) => <p className="mb-2 font-sans text-sm leading-6 text-muted-foreground last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5 font-sans text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 font-sans text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="mb-1 text-sm leading-6 last:mb-0">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          code: ({ children }) => <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">{children}</code>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`${panelClass} ${className}`}>{children}</section>;
}

function PanelHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border/60 bg-muted/35 px-4 py-3 sm:px-5">
      {children}
    </div>
  );
}

function PrimaryBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
      <Icon size={16} aria-hidden="true" />
    </div>
  );
}

export default function AIInsights({ stocks, trades = [] }: Props) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const analysisId = useId();
  const inputId = useId();
  const ctx = useMemo(() => buildCtx(stocks, trades), [stocks, trades]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chatEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [chatHistory, chatLoading]);

  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const data = await fetchApi<{ response?: string; insights?: string }>("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "analysis", portfolioContext: ctx, portfolioSummary: ctx }),
        label: "AI analysis",
      });
      setAnalysis(data.response || data.insights || null);
    } catch (error: unknown) {
      setAnalysisError(error instanceof Error && error.message
        ? error.message
        : getApiUnavailableMessage("AI analysis"));
    } finally {
      setAnalysisLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    if (stocks.length > 0) fetchAnalysis();
    // Analysis is requested once on mount; refreshes remain user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text, ts: Date.now() };
    const history = [...chatHistory, userMsg];
    setChatHistory(history);
    setInput("");
    setChatLoading(true);
    setChatError(null);
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const data = await fetchApi<{ response?: string; insights?: string }>("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat",
          portfolioContext: ctx,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        label: "AI chat",
      });
      setChatHistory((prev) => [...prev, {
        role: "assistant",
        content: data.response || data.insights || "No response received.",
        ts: Date.now(),
      }]);
    } catch (error: unknown) {
      const message = error instanceof Error && error.message
        ? error.message
        : getApiUnavailableMessage("AI analysis");
      setChatError(message);
      setChatHistory((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${message}\n\nCheck that the AI API is reachable and that the required server environment variables are set.`,
        ts: Date.now(),
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [input, chatHistory, chatLoading, ctx]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel>
          <PanelHead>
            <div className="flex min-w-0 items-center gap-3">
              <PrimaryBadge icon={Brain} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-card-foreground">Portfolio Analysis</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Powered by Groq · Llama 3.3 70B</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={fetchAnalysis}
                aria-label="Refresh portfolio analysis"
                title="Refresh portfolio analysis"
                className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/50 text-primary transition-colors hover:bg-accent disabled:opacity-50 ${focusRing}`}
              >
                <RefreshCw size={15} className={analysisLoading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setAnalysisOpen((open) => !open)}
                aria-label={analysisOpen ? "Collapse portfolio analysis" : "Expand portfolio analysis"}
                aria-expanded={analysisOpen}
                aria-controls={analysisId}
                title={analysisOpen ? "Collapse portfolio analysis" : "Expand portfolio analysis"}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${focusRing}`}
              >
                {analysisOpen
                  ? <ChevronUp size={15} aria-hidden="true" />
                  : <ChevronDown size={15} aria-hidden="true" />}
              </button>
            </div>
          </PanelHead>

          {analysisOpen && (
            <div id={analysisId} className="max-h-[420px] overflow-y-auto px-4 py-4 sm:px-5" aria-label="Portfolio analysis content">
              {analysisLoading ? (
                <div className="flex items-center gap-2.5 py-2" role="status">
                  <TypingDots />
                  <span className="text-sm text-muted-foreground">Analysing your portfolio…</span>
                </div>
              ) : analysisError ? (
                <div className="rounded-lg border border-loss/30 bg-loss/10 p-3.5" role="alert">
                  <p className="text-sm font-semibold text-loss">Analysis failed</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{analysisError}</p>
                  <button
                    type="button"
                    onClick={fetchAnalysis}
                    className={`mt-2 inline-flex h-9 items-center rounded-md px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline ${focusRing}`}
                  >
                    Try again
                  </button>
                </div>
              ) : analysis ? (
                <MDContent content={analysis} />
              ) : (
                <p className="py-1 text-sm text-muted-foreground">Add stocks to get AI analysis.</p>
              )}
            </div>
          )}
        </Panel>

        <Panel>
          <div className="p-4 sm:px-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick questions</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK.map(({ label, icon: Icon, prompt }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => sendMessage(prompt)}
                  disabled={chatLoading}
                  className={`flex min-h-11 items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-left text-sm font-medium text-card-foreground transition-colors hover:border-primary/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  <Icon size={15} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="leading-5">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="p-4 sm:px-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Context sent to AI</h2>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground tabular-nums">
              {ctx}
            </pre>
          </div>
        </Panel>
      </div>

      <Panel className="flex min-h-[560px] max-h-[760px] min-w-0 flex-col">
        <PanelHead>
          <div className="flex min-w-0 items-center gap-3">
            <PrimaryBadge icon={Bot} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-card-foreground">Stock AI Chat</h2>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-profit" aria-hidden="true" />
                <p className="truncate text-xs text-muted-foreground">Portfolio-aware · Ask anything about stocks</p>
              </div>
            </div>
          </div>
          {chatHistory.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setChatHistory([]);
                setChatError(null);
              }}
              aria-label="Clear chat"
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-loss/25 bg-loss/10 px-3 text-xs font-semibold text-loss transition-colors hover:bg-loss/15 ${focusRing}`}
            >
              <Trash2 size={13} aria-hidden="true" /> Clear
            </button>
          )}
        </PanelHead>

        <div
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {chatHistory.length === 0 && !chatLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-5 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Sparkles size={24} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-card-foreground">Ask me anything</h3>
                <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
                  I know your portfolio. Ask about specific stocks,<br className="hidden sm:block" /> market trends, or trading strategies.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Try: &quot;Should I hold SARDAEN?&quot; or &quot;What&apos;s my biggest risk?&quot;</p>
            </div>
          )}

          {chatHistory.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div key={i} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isUser ? "bg-primary text-primary-foreground" : "border border-primary/20 bg-primary/10 text-primary"}`}>
                  {isUser ? <User size={14} aria-hidden="true" /> : <Bot size={14} aria-hidden="true" />}
                </div>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 sm:max-w-[80%] ${isUser ? "rounded-tr-sm bg-primary text-primary-foreground shadow-sm" : "rounded-tl-sm border border-border/70 bg-popover/80"}`}>
                  {isUser
                    ? <p className="whitespace-pre-wrap text-sm leading-6 text-primary-foreground">{msg.content}</p>
                    : <MDContent content={msg.content} />}
                  <time className={`mt-1 block text-xs tabular-nums ${isUser ? "text-right text-primary-foreground/70" : "text-left text-muted-foreground"}`} dateTime={new Date(msg.ts).toISOString()}>
                    {fmtTime(msg.ts)}
                  </time>
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex items-start gap-2.5" role="status">
              <span className="sr-only">Stock AI is responding</span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary" aria-hidden="true">
                <Bot size={14} />
              </div>
              <div className="rounded-xl rounded-tl-sm border border-border/70 bg-popover/80 px-3.5 py-2.5">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 border-t border-border/60 p-3 sm:px-4">
          {chatError && (
            <div className="mb-2 rounded-lg border border-loss/25 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
              {chatError}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-border/70 bg-popover/60 p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <label htmlFor={inputId} className="sr-only">Message Stock AI</label>
            <textarea
              id={inputId}
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your stocks, market trends, trading ideas…"
              rows={1}
              disabled={chatLoading}
              className="max-h-24 min-h-10 flex-1 resize-none self-center overflow-auto border-0 bg-transparent px-2 py-2 font-sans text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onInput={(e) => {
                const target = e.currentTarget;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || chatLoading}
              aria-label="Send message"
              title="Send message"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:border disabled:border-border/70 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none ${focusRing}`}
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Enter to send · Shift+Enter for new line · Powered by Groq</p>
        </div>
      </Panel>
    </div>
  );
}
