/**
 * AIInsights.tsx — AI Portfolio Analysis + Chat
 *
 * Two panels:
 *  Left  — Quick analysis cards (Portfolio health, Risk, Top movers)
 *  Right — Full chat interface (multi-turn, portfolio-aware)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Brain, Send, RefreshCw, TrendingUp, Shield, Lightbulb,
         ChevronDown, ChevronUp, Sparkles, User, Bot, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Stock {
  ticker: string;
  name?: string;
  buyPrice: number;
  quantity: number;
  cmp?: number;
  status?: string;
}

interface Trade {
  ticker: string;
  buyPrice: number;
  sellPrice?: number;
  quantity: number;
  status?: string;
  pnl?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface Props {
  stocks: Stock[];
  trades?: Trade[];
}

// ── Build portfolio context string for system prompt ─────────────────────────
function buildPortfolioContext(stocks: Stock[], trades: Trade[]): string {
  const active = stocks.filter(s => s.status !== "Closed");
  const closed = trades.filter(t => t.status === "Closed");

  const invested = active.reduce((s, st) => s + st.buyPrice * st.quantity, 0);
  const current  = active.reduce((s, st) => s + (st.cmp ?? st.buyPrice) * st.quantity, 0);
  const pnl      = current - invested;
  const pnlPct   = invested > 0 ? (pnl / invested * 100).toFixed(2) : "0";

  const positions = active.map(s => {
    const cv = (s.cmp ?? s.buyPrice) * s.quantity;
    const sp = s.buyPrice * s.quantity;
    const p  = cv - sp;
    const pp = sp > 0 ? (p / sp * 100).toFixed(1) : "0";
    return `  - ${s.ticker}: ${s.quantity} shares @ ₹${s.buyPrice} avg, CMP ₹${s.cmp ?? "N/A"}, P&L ₹${p.toFixed(0)} (${pp}%)`;
  }).join("\n");

  const closedSummary = closed.length > 0
    ? `\nClosed trades (${closed.length}): ${closed.map(t => `${t.ticker} P&L ₹${(t.pnl ?? 0).toFixed(0)}`).join(", ")}`
    : "";

  return `Portfolio Summary:
- Total invested: ₹${invested.toFixed(0)}
- Current value: ₹${current.toFixed(0)}
- Unrealised P&L: ₹${pnl.toFixed(0)} (${pnlPct}%)
- Active positions: ${active.length}

Positions:
${positions}${closedSummary}`;
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: "Portfolio health", icon: TrendingUp,
    prompt: "Give me a comprehensive health check of my portfolio. What's working, what isn't, and what should I watch?" },
  { label: "Risk analysis", icon: Shield,
    prompt: "What are the key risks in my current portfolio? Any concentration risk, sector exposure, or positions I should be worried about?" },
  { label: "What to do next?", icon: Lightbulb,
    prompt: "Based on my current positions and P&L, what are your top 3 actionable recommendations?" },
  { label: "Diversification", icon: Sparkles,
    prompt: "Is my portfolio well diversified? What sectors or types of stocks am I missing?" },
];

// ── Markdown renderer with styling ───────────────────────────────────────────
function MDContent({ content }: { content: string }) {
  return (
    <div className="ai-md text-[13px] leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({children}) => <h1 className="text-[15px] font-semibold mt-3 mb-1.5 text-foreground">{children}</h1>,
          h2: ({children}) => <h2 className="text-[13.5px] font-semibold mt-3 mb-1 text-foreground">{children}</h2>,
          h3: ({children}) => <h3 className="text-[13px] font-medium mt-2 mb-1 text-foreground">{children}</h3>,
          p:  ({children}) => <p className="mb-2 text-foreground/90 leading-relaxed">{children}</p>,
          ul: ({children}) => <ul className="mb-2 space-y-0.5 pl-4 list-disc text-foreground/90">{children}</ul>,
          ol: ({children}) => <ol className="mb-2 space-y-0.5 pl-4 list-decimal text-foreground/90">{children}</ol>,
          li: ({children}) => <li className="leading-relaxed">{children}</li>,
          strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
          code: ({children}) => <code className="px-1 py-0.5 rounded text-[12px] font-mono bg-primary/10 text-primary">{children}</code>,
          blockquote: ({children}) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0,1,2].map(i => (
        <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
             style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIInsights({ stocks, trades = [] }: Props) {
  const [chatHistory, setChatHistory]   = useState<ChatMessage[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [analysis, setAnalysis]         = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const chatEndRef  = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const portfolioCtx = buildPortfolioContext(stocks, trades);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading]);

  // ── Fetch analysis card ───────────────────────────────────────────────────
  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analysis",
          portfolioContext: portfolioCtx,
          portfolioSummary: portfolioCtx,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.response);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  }, [portfolioCtx]);

  // Auto-load analysis on mount
  useEffect(() => { if (stocks.length > 0) fetchAnalysis(); }, []);

  // ── Send chat message ─────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text, ts: Date.now() };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat",
          portfolioContext: portfolioCtx,
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: data.response,
        ts: Date.now(),
      }]);
    } catch (e: any) {
      setError(e.message);
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't process that. ${e.message}`,
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, chatHistory, loading, portfolioCtx]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => setChatHistory([]);

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* ── LEFT: Analysis panel ── */}
      <div className="lg:w-[42%] flex flex-col gap-3">

        {/* Analysis card */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center"
                   style={{ background: "linear-gradient(135deg,hsl(215,72%,40%),hsl(260,65%,55%))" }}>
                <Brain className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Portfolio Analysis</p>
                <p className="text-[10px] text-muted-foreground">Powered by Groq · Llama 3.3 70B</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={fetchAnalysis} disabled={analysisLoading}
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-all hover:bg-primary/10"
                title="Refresh analysis">
                <RefreshCw className={`h-3.5 w-3.5 text-primary ${analysisLoading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setAnalysisOpen(o => !o)}
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-all hover:bg-primary/10">
                {analysisOpen
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {analysisOpen && (
            analysisLoading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                     style={{ background: "linear-gradient(135deg,hsl(215,72%,40%),hsl(260,65%,55%))" }}>
                  <Brain className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-foreground">Analyzing your portfolio…</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Usually takes 3–5 seconds</p>
                </div>
                <TypingDots />
              </div>
            ) : analysis ? (
              <MDContent content={analysis} />
            ) : error ? (
              <div className="rounded-lg p-3 text-[12px]"
                   style={{ background: "hsl(2,72%,50%,0.08)", border: "1px solid hsl(2,72%,50%,0.20)" }}>
                <p className="text-loss font-medium mb-1">Analysis failed</p>
                <p className="text-muted-foreground">{error}</p>
                <button onClick={fetchAnalysis}
                  className="mt-2 text-primary text-[11px] font-medium hover:underline">Try again →</button>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">Add stocks to your portfolio to get AI analysis.</p>
            )
          )}
        </div>

        {/* Quick prompt chips */}
        <div className="glass-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Quick questions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PROMPTS.map(({ label, icon: Icon, prompt }) => (
              <button key={label}
                onClick={() => sendMessage(prompt)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all shimmer-hover"
                style={{
                  background: "hsl(215,50%,46%,0.07)",
                  border: "1px solid hsl(215,50%,46%,0.15)",
                }}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[12px] font-medium text-foreground leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Portfolio context summary */}
        <div className="glass-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Context sent to AI
          </p>
          <pre className="text-[10.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
            {portfolioCtx || "No portfolio data yet"}
          </pre>
        </div>
      </div>

      {/* ── RIGHT: Chat panel ── */}
      <div className="lg:flex-1 flex flex-col glass-card overflow-hidden"
           style={{ minHeight: 520, maxHeight: 720 }}>

        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3"
             style={{ borderBottom: "1px solid hsl(215,35%,85%,0.35)" }}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: "linear-gradient(135deg,hsl(215,72%,40%),hsl(260,65%,55%))" }}>
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Stock AI Chat</p>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-profit animate-pulse" />
                <p className="text-[10px] text-muted-foreground">Portfolio-aware · Ask anything about stocks</p>
              </div>
            </div>
          </div>
          {chatHistory.length > 0 && (
            <button onClick={clearChat}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground transition-all hover:text-loss hover:bg-loss/10">
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
             style={{ scrollbarWidth: "thin" }}>

          {chatHistory.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
                   style={{ background: "linear-gradient(135deg,hsl(215,72%,40%,0.12),hsl(260,65%,55%,0.12))",
                            border: "1px solid hsl(215,50%,60%,0.20)" }}>
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Ask me anything</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed max-w-xs">
                  I know your portfolio. Ask about specific stocks,<br />
                  market trends, or trading strategies.
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground/60">Try: "Should I hold SARDAEN?" or "What's my biggest risk?"</p>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === "user"
                  ? "bg-primary text-white"
                  : ""
              }`} style={msg.role === "assistant" ? {
                background: "linear-gradient(135deg,hsl(215,72%,40%),hsl(260,65%,55%))"
              } : {}}>
                {msg.role === "user"
                  ? <User className="h-3.5 w-3.5" />
                  : <Bot className="h-3.5 w-3.5 text-white" />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "rounded-tr-sm"
                  : "rounded-tl-sm"
              }`} style={msg.role === "user" ? {
                background: "linear-gradient(135deg,hsl(222,65%,22%),hsl(215,72%,44%))",
                color: "white",
              } : {
                background: "hsl(215,35%,50%,0.08)",
                border: "1px solid hsl(215,35%,70%,0.18)",
              }}>
                {msg.role === "user"
                  ? <p className="text-[13px] leading-relaxed text-white">{msg.content}</p>
                  : <MDContent content={msg.content} />}
                <p className={`text-[10px] mt-1.5 ${
                  msg.role === "user" ? "text-white/60 text-right" : "text-muted-foreground"
                }`}>{formatTime(msg.ts)}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                   style={{ background: "linear-gradient(135deg,hsl(215,72%,40%),hsl(260,65%,55%))" }}>
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3.5 py-2"
                   style={{ background: "hsl(215,35%,50%,0.08)", border: "1px solid hsl(215,35%,70%,0.18)" }}>
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-3 pb-3 pt-2" style={{ borderTop: "1px solid hsl(215,35%,85%,0.35)" }}>
          {error && !loading && (
            <p className="text-[11px] text-loss mb-1.5 px-1">{error}</p>
          )}
          <div className="flex items-end gap-2 rounded-xl px-3 py-2"
               style={{ background: "hsl(215,35%,50%,0.07)", border: "1px solid hsl(215,35%,70%,0.20)" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your stocks, market trends, trading ideas…"
              rows={1}
              disabled={loading}
              style={{
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                flex: 1,
                fontSize: 13,
                lineHeight: "1.5",
                color: "var(--color-text-primary, inherit)",
                maxHeight: 100,
                overflow: "auto",
                fontFamily: "inherit",
              }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 100) + "px";
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all"
              style={{
                background: input.trim() && !loading
                  ? "linear-gradient(135deg,hsl(222,65%,22%),hsl(215,72%,44%))"
                  : "hsl(215,35%,50%,0.12)",
              }}>
              <Send className={`h-3.5 w-3.5 ${input.trim() && !loading ? "text-white" : "text-muted-foreground"}`} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
            Enter to send · Shift+Enter for new line · Powered by Groq
          </p>
        </div>
      </div>
    </div>
  );
}