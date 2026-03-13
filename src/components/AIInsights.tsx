/**
 * AIInsights.tsx — AI Portfolio Analysis + Chat
 * Uses PortfolioStock interface: entryPrice, quantity, cmp, status ("Active"|"Sold Profit"|"Sold Loss")
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Send, RefreshCw, TrendingUp, Shield, Lightbulb,
  ChevronDown, ChevronUp, Sparkles, User, Bot, Trash2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PortfolioStock, TradeStrategy } from "@/data/sampleData";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface Props {
  stocks: PortfolioStock[];
  trades?: TradeStrategy[];
}

// ── Build portfolio context ──────────────────────────────────────────────────
function buildPortfolioContext(stocks: PortfolioStock[], trades: TradeStrategy[]): string {
  const active = stocks.filter(s => s.status === "Active");
  const soldProfit = stocks.filter(s => s.status === "Sold Profit");
  const soldLoss   = stocks.filter(s => s.status === "Sold Loss");

  const invested = active.reduce((sum, s) => sum + s.entryPrice * s.quantity, 0);
  const current  = active.reduce((sum, s) => sum + (s.cmp ?? s.entryPrice) * s.quantity, 0);
  const unrealPnl = current - invested;
  const unrealPct = invested > 0 ? ((unrealPnl / invested) * 100).toFixed(2) : "0";

  const realPnl = stocks
    .filter(s => s.exitPrice)
    .reduce((sum, s) => sum + ((s.exitPrice! - s.entryPrice) * s.quantity), 0);

  const positions = active.map(s => {
    const currVal  = (s.cmp ?? s.entryPrice) * s.quantity;
    const buyVal   = s.entryPrice * s.quantity;
    const pnl      = currVal - buyVal;
    const pnlPct   = buyVal > 0 ? ((pnl / buyVal) * 100).toFixed(1) : "0";
    const signal   = pnl >= 0 ? "📈" : "📉";
    return `  ${signal} ${s.ticker} (${s.sector ?? "—"}): ${s.quantity} qty @ ₹${s.entryPrice} entry | CMP ₹${s.cmp ?? "N/A"} | P&L ₹${pnl.toFixed(0)} (${pnlPct}%)`;
  }).join("\n");

  const closedList = [...soldProfit, ...soldLoss].map(s => {
    const pnl = ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity;
    return `  ${s.ticker}: ₹${pnl.toFixed(0)} (${s.status})`;
  }).join("\n");

  const sectors = [...new Set(active.map(s => s.sector).filter(Boolean))];

  let ctx = `=== PORTFOLIO SNAPSHOT ===
Active positions: ${active.length}
Total invested:   ₹${invested.toFixed(0)}
Current value:    ₹${current.toFixed(0)}
Unrealised P&L:   ₹${unrealPnl.toFixed(0)} (${unrealPct}%)
Realised P&L:     ₹${realPnl.toFixed(0)} (${soldProfit.length} wins, ${soldLoss.length} losses)
Sectors:          ${sectors.join(", ") || "N/A"}

Active Positions:
${positions || "  (none)"}`;

  if (closedList) {
    ctx += `\n\nClosed Trades:\n${closedList}`;
  }

  if (trades.length > 0) {
    const tradeCtx = trades.slice(0, 5).map(t =>
      `  ${t.ticker}: entry ₹${t.entryPrice}, SL ₹${t.stopLoss}, T1 ₹${t.target1}, T2 ₹${t.target2}`
    ).join("\n");
    ctx += `\n\nTrade Strategies Tracked:\n${tradeCtx}`;
  }

  return ctx;
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: "Portfolio health",  icon: TrendingUp,  prompt: "Give me a comprehensive health check of my portfolio. What's working, what's not, and what should I watch closely?" },
  { label: "Risk analysis",     icon: Shield,      prompt: "What are the key risks in my current portfolio? Check for concentration risk, sector exposure, and any dangerous positions." },
  { label: "What to do next?",  icon: Lightbulb,   prompt: "Based on my positions and P&L, give me your top 3 actionable recommendations right now." },
  { label: "Diversification",   icon: Sparkles,    prompt: "Is my portfolio well diversified? What sectors or asset types am I missing? What would you add?" },
];

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0,1,2].map(i => (
        <div key={i}
          className="h-2 w-2 rounded-full bg-primary/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }}
        />
      ))}
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function MDContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({children}) => <h1 className="text-[15px] font-semibold mt-3 mb-1.5 text-foreground">{children}</h1>,
        h2: ({children}) => <h2 className="text-[14px] font-semibold mt-3 mb-1 text-foreground">{children}</h2>,
        h3: ({children}) => <h3 className="text-[13px] font-medium mt-2 mb-1 text-foreground">{children}</h3>,
        p:  ({children}) => <p className="mb-2 text-[13px] leading-relaxed text-foreground/90">{children}</p>,
        ul: ({children}) => <ul className="mb-2 pl-4 space-y-0.5 list-disc text-foreground/90">{children}</ul>,
        ol: ({children}) => <ol className="mb-2 pl-4 space-y-0.5 list-decimal text-foreground/90">{children}</ol>,
        li: ({children}) => <li className="text-[13px] leading-relaxed">{children}</li>,
        strong: ({children}) => <strong className="font-semibold text-foreground">{children}</strong>,
        code: ({children}) => <code className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-primary/10 text-primary">{children}</code>,
        blockquote: ({children}) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIInsights({ stocks, trades = [] }: Props) {
  const [chatHistory,       setChatHistory]       = useState<ChatMessage[]>([]);
  const [input,             setInput]             = useState("");
  const [chatLoading,       setChatLoading]       = useState(false);
  const [analysisOpen,      setAnalysisOpen]      = useState(true);
  const [analysis,          setAnalysis]          = useState<string | null>(null);
  const [analysisLoading,   setAnalysisLoading]   = useState(false);
  const [analysisError,     setAnalysisError]     = useState<string | null>(null);
  const [chatError,         setChatError]         = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const portfolioCtx = buildPortfolioContext(stocks, trades);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  // ── Fetch portfolio analysis ───────────────────────────────────────────────
  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
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
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAnalysis(data.response || data.insights);
    } catch (e: any) {
      setAnalysisError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  }, [portfolioCtx]);

  useEffect(() => {
    if (stocks.length > 0) fetchAnalysis();
  }, []); // run once on mount

  // ── Send chat ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text, ts: Date.now() };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setInput("");
    setChatLoading(true);
    setChatError(null);

    // auto-resize textarea back
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "chat",
          portfolioContext: portfolioCtx,
          messages: updatedHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: data.response || data.insights || "No response received.",
        ts: Date.now(),
      }]);
    } catch (e: any) {
      setChatError(e.message);
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: `⚠️ ${e.message}\n\nPlease check that GROQ_API_KEY is set in Vercel Environment Variables.`,
        ts: Date.now(),
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, chatHistory, chatLoading, portfolioCtx]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* ── LEFT COLUMN ──────────────────────────────────────── */}
      <div className="lg:w-[40%] flex flex-col gap-3">

        {/* Analysis card */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,hsl(215,72%,38%),hsl(258,60%,52%))" }}>
                <Brain className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Portfolio Analysis</p>
                <p className="text-[10px] text-muted-foreground">Powered by Groq · Llama 3.3 70B</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={fetchAnalysis} disabled={analysisLoading}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-primary/10 transition-colors"
                title="Refresh analysis">
                <RefreshCw className={`h-3.5 w-3.5 text-primary ${analysisLoading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => setAnalysisOpen(o => !o)}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-primary/10 transition-colors">
                {analysisOpen
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {analysisOpen && (
            <>
              {analysisLoading ? (
                <div className="flex items-center gap-3 py-3">
                  <TypingDots />
                  <p className="text-[12px] text-muted-foreground">Analyzing your portfolio…</p>
                </div>
              ) : analysisError ? (
                <div className="rounded-xl p-3"
                  style={{ background: "hsl(2,70%,50%,0.08)", border: "1px solid hsl(2,70%,50%,0.22)" }}>
                  <p className="text-[12px] font-semibold text-red-500 mb-1">Analysis failed</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{analysisError}</p>
                  <button onClick={fetchAnalysis}
                    className="mt-2 text-[11px] font-medium text-primary hover:underline">
                    Try again →
                  </button>
                </div>
              ) : analysis ? (
                <MDContent content={analysis} />
              ) : (
                <p className="text-[12px] text-muted-foreground py-2">Add stocks to your portfolio to get AI analysis.</p>
              )}
            </>
          )}
        </div>

        {/* Quick prompts */}
        <div className="glass-card p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Quick questions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PROMPTS.map(({ label, icon: Icon, prompt }) => (
              <button key={label}
                onClick={() => sendMessage(prompt)}
                disabled={chatLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] shimmer-hover"
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

        {/* Context preview */}
        <div className="glass-card p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Context sent to AI
          </p>
          <pre className="text-[10.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono overflow-auto max-h-48"
               style={{ scrollbarWidth: "thin" }}>
            {portfolioCtx}
          </pre>
        </div>
      </div>

      {/* ── RIGHT COLUMN — Chat ───────────────────────────────── */}
      <div className="lg:flex-1 glass-card flex flex-col overflow-hidden"
           style={{ minHeight: 540, maxHeight: 740 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid hsl(215,35%,70%,0.2)" }}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,hsl(215,72%,38%),hsl(258,60%,52%))" }}>
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Stock AI Chat</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                <p className="text-[10px] text-muted-foreground">Portfolio-aware · Ask anything about stocks</p>
              </div>
            </div>
          </div>
          {chatHistory.length > 0 && (
            <button onClick={() => { setChatHistory([]); setChatError(null); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{ scrollbarWidth: "thin" }}>

          {/* Empty state */}
          {chatHistory.length === 0 && !chatLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10 gap-3">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg,hsl(215,72%,38%,0.12),hsl(258,60%,52%,0.12))",
                  border: "1px solid hsl(215,50%,60%,0.18)",
                }}>
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Ask me anything</p>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  I know your portfolio. Ask about specific stocks,<br />
                  market trends, or trading strategies.
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Try: "Should I hold SARDAEN?" or "What's my biggest risk?"
              </p>
            </div>
          )}

          {/* Chat bubbles */}
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "user" ? "bg-primary" : ""
                }`}
                style={msg.role === "assistant" ? {
                  background: "linear-gradient(135deg,hsl(215,72%,38%),hsl(258,60%,52%))"
                } : {}}>
                {msg.role === "user"
                  ? <User className="h-3.5 w-3.5 text-white" />
                  : <Bot className="h-3.5 w-3.5 text-white" />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                  msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
                }`}
                style={msg.role === "user" ? {
                  background: "linear-gradient(135deg,hsl(222,65%,22%),hsl(215,72%,44%))",
                  color: "white",
                } : {
                  background: "hsl(215,35%,50%,0.07)",
                  border: "1px solid hsl(215,35%,70%,0.18)",
                }}>
                {msg.role === "user"
                  ? <p className="text-[13px] leading-relaxed text-white whitespace-pre-wrap">{msg.content}</p>
                  : <MDContent content={msg.content} />}
                <p className={`text-[10px] mt-1.5 ${
                    msg.role === "user" ? "text-white/50 text-right" : "text-muted-foreground"
                  }`}>{fmt(msg.ts)}</p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {chatLoading && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,hsl(215,72%,38%),hsl(258,60%,52%))" }}>
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-2.5"
                style={{ background: "hsl(215,35%,50%,0.07)", border: "1px solid hsl(215,35%,70%,0.18)" }}>
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: "1px solid hsl(215,35%,70%,0.2)" }}>
          {chatError && (
            <p className="text-[11px] text-red-400 mb-1.5 px-1">{chatError}</p>
          )}
          <div className="flex items-end gap-2 rounded-xl px-3 py-2.5"
            style={{
              background: "hsl(215,35%,50%,0.06)",
              border: "1px solid hsl(215,35%,70%,0.2)",
            }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your stocks, market trends, trading ideas…"
              rows={1}
              disabled={chatLoading}
              className="flex-1 bg-transparent border-none outline-none resize-none text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground"
              style={{ maxHeight: 100, overflow: "auto", fontFamily: "inherit" }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 100) + "px";
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || chatLoading}
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95"
              style={{
                background: input.trim() && !chatLoading
                  ? "linear-gradient(135deg,hsl(222,65%,22%),hsl(215,72%,44%))"
                  : "hsl(215,35%,50%,0.12)",
              }}>
              <Send className={`h-3.5 w-3.5 ${
                input.trim() && !chatLoading ? "text-white" : "text-muted-foreground"
              }`} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
            Enter to send · Shift+Enter for new line · Powered by Groq
          </p>
        </div>
      </div>
    </div>
  );
}