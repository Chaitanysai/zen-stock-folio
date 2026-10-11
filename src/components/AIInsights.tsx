/**
 * AIInsights.tsx — AI Portfolio Analysis + Chat
 * Clean white theme matching dashboard. No hardcoded dark blues.
 * Uses PortfolioStock: entryPrice, quantity, cmp, status
 * White theme: #ffffff cards, #f4f6f9 page bg, #1c3557 navy accent
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Send, RefreshCw, TrendingUp, Shield,
  Lightbulb, ChevronDown, ChevronUp, Sparkles,
  User, Bot, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PortfolioStock, TradeStrategy } from "@/data/sampleData";
import { getApiUnavailableMessage, fetchApi } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage { role: "user" | "assistant"; content: string; ts: number; }
interface Props { stocks: PortfolioStock[]; trades?: TradeStrategy[]; }

// ── Theme tokens — white theme matching dashboard ─────────────────────────────
const T = {
  navy:      "#1c3557",
  navyMid:   "#2a4a70",
  navyPale:  "#eef4fc",
  navyBd:    "rgba(28,53,87,.12)",
  navyTint:  "rgba(28,53,87,.06)",
  navyTint2: "rgba(28,53,87,.10)",
  bg:        "#ffffff",
  bgSurf:    "#f8f9fc",
  bgPage:    "#f4f6f9",
  bdMid:     "#e5e7eb",
  bdSoft:    "#f0f2f5",
  txHi:      "#111827",
  txMed:     "#4b5563",
  txLo:      "#6b7280",
  txGhost:   "#9ca3af",
  profit:    "#059669",
  profitBg:  "#ecfdf5",
  profitBd:  "#a7f3d0",
  loss:      "#dc2626",
  lossBg:    "#fef2f2",
  lossBd:    "#fecaca",
  shadow:    "0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)",
};

// ── Build portfolio context ──────────────────────────────────────────────────
function buildCtx(stocks: PortfolioStock[], trades: TradeStrategy[]): string {
  const active     = stocks.filter(s => s.status === "Active");
  const soldProfit = stocks.filter(s => s.status === "Sold Profit");
  const soldLoss   = stocks.filter(s => s.status === "Sold Loss");

  const invested  = active.reduce((s, x) => s + x.entryPrice * x.quantity, 0);
  const current   = active.reduce((s, x) => s + (x.cmp ?? x.entryPrice) * x.quantity, 0);
  const unrealPnl = current - invested;
  const unrealPct = invested > 0 ? ((unrealPnl / invested) * 100).toFixed(2) : "0";
  const realPnl   = stocks.filter(s => s.exitPrice)
    .reduce((s, x) => s + ((x.exitPrice! - x.entryPrice) * x.quantity), 0);

  const positions = active.map(s => {
    const pnl    = ((s.cmp ?? s.entryPrice) - s.entryPrice) * s.quantity;
    const pnlPct = s.entryPrice > 0 ? ((pnl / (s.entryPrice * s.quantity)) * 100).toFixed(1) : "0";
    return `  ${pnl >= 0 ? "📈" : "📉"} ${s.ticker} (${s.sector ?? "—"}): ${s.quantity} qty @ ₹${s.entryPrice} | CMP ₹${s.cmp ?? "N/A"} | P&L ₹${pnl.toFixed(0)} (${pnlPct}%)`;
  }).join("\n");

  const closed = [...soldProfit, ...soldLoss].map(s => {
    const pnl = ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity;
    return `  ${s.ticker}: ₹${pnl.toFixed(0)} (${s.status})`;
  }).join("\n");

  const sectors = [...new Set(active.map(s => s.sector).filter(Boolean))];

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
    ctx += `\n\nTrade Strategies:\n` + trades.slice(0, 5).map(t =>
      `  ${t.ticker}: entry ₹${t.entryPrice}, SL ₹${t.stopLoss}, T1 ₹${t.target1}, T2 ₹${t.target2}`
    ).join("\n");
  }
  return ctx;
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK = [
  { label: "Portfolio health",  icon: TrendingUp, prompt: "Give me a comprehensive health check of my portfolio. What's working, what's not, and what should I watch closely?" },
  { label: "Risk analysis",     icon: Shield,     prompt: "What are the key risks in my current portfolio? Check for concentration risk, sector exposure, and dangerous positions." },
  { label: "What to do next?",  icon: Lightbulb,  prompt: "Based on my positions and P&L, give me your top 3 actionable recommendations right now." },
  { label: "Diversification",   icon: Sparkles,   prompt: "Is my portfolio well diversified? What sectors or asset types am I missing? What would you add?" },
];

// ── Sub-components ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 2px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%",
          background: T.navy, opacity: .4,
          animation: "ai-bounce .8s ease infinite",
          animationDelay: `${i * 150}ms`,
        }} />
      ))}
    </div>
  );
}

function MDContent({ content }: { content: string }) {
  const base: React.CSSProperties = { fontFamily: "inherit" };
  return (
    <ReactMarkdown components={{
      h1: ({ children }) => <h1 style={{ ...base, fontSize: 15, fontWeight: 700, color: T.navy, margin: "12px 0 6px" }}>{children}</h1>,
      h2: ({ children }) => <h2 style={{ ...base, fontSize: 14, fontWeight: 700, color: T.navy, margin: "10px 0 5px" }}>{children}</h2>,
      h3: ({ children }) => <h3 style={{ ...base, fontSize: 13, fontWeight: 600, color: T.navyMid, margin: "8px 0 4px" }}>{children}</h3>,
      p:  ({ children }) => <p  style={{ ...base, fontSize: 13, lineHeight: 1.65, color: T.txMed, marginBottom: 8 }}>{children}</p>,
      ul: ({ children }) => <ul style={{ ...base, paddingLeft: 18, marginBottom: 8, color: T.txMed }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ ...base, paddingLeft: 18, marginBottom: 8, color: T.txMed }}>{children}</ol>,
      li: ({ children }) => <li style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 3 }}>{children}</li>,
      strong: ({ children }) => <strong style={{ fontWeight: 700, color: T.txHi }}>{children}</strong>,
      code: ({ children }) => (
        <code style={{ fontSize: 11.5, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4, background: T.navyPale, color: T.navy }}>{children}</code>
      ),
      blockquote: ({ children }) => (
        <blockquote style={{ borderLeft: `3px solid ${T.navyBd}`, paddingLeft: 12, margin: "8px 0", color: T.txLo, fontStyle: "italic" }}>{children}</blockquote>
      ),
    }}>
      {content}
    </ReactMarkdown>
  );
}

// ── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.bdMid}`,
      borderRadius: 14,
      boxShadow: T.shadow,
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Panel header ─────────────────────────────────────────────────────────────
function PanelHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "13px 18px",
      background: T.bgSurf,
      borderBottom: `1px solid ${T.bdSoft}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      {children}
    </div>
  );
}

// ── Icon badge ───────────────────────────────────────────────────────────────
function NavyBadge({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
      background: T.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 8px rgba(28,53,87,.3)",
    }}>
      <Icon size={16} color="white" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function AIInsights({ stocks, trades = [] }: Props) {
  const [chatHistory,     setChatHistory]     = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState("");
  const [chatLoading,     setChatLoading]     = useState(false);
  const [analysisOpen,    setAnalysisOpen]    = useState(true);
  const [analysis,        setAnalysis]        = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError,   setAnalysisError]   = useState<string | null>(null);
  const [chatError,       setChatError]       = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const ctx = buildCtx(stocks, trades);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  // ── Analysis ──────────────────────────────────────────────────────────────
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
      setAnalysis(data.response || data.insights);
    } catch (e: any) {
      setAnalysisError(e?.message || getApiUnavailableMessage("AI analysis"));
    } finally {
      setAnalysisLoading(false);
    }
  }, [ctx]);

  useEffect(() => { if (stocks.length > 0) fetchAnalysis(); }, []);

  // ── Chat ──────────────────────────────────────────────────────────────────
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
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
        label: "AI chat",
      });
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: data.response || data.insights || "No response received.",
        ts: Date.now(),
      }]);
    } catch (e: any) {
      const message = e?.message || getApiUnavailableMessage("AI analysis");
      setChatError(message);
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: `⚠️ ${message}\n\nCheck that the AI API is reachable and that the required server environment variables are set.`,
        ts: Date.now(),
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [input, chatHistory, chatLoading, ctx]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // ── Icon btn helper ──────────────────────────────────────────────────────
  const IconBtn = ({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 8,
      background: T.navyTint, border: `1px solid ${T.navyBd}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "all .13s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.navyPale; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.navyTint; }}
    >
      {children}
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes ai-bounce {
          0%,100% { transform: translateY(0); opacity: .4; }
          50%      { transform: translateY(-4px); opacity: 1; }
        }
        .ai-scroll::-webkit-scrollbar { width: 4px; }
        .ai-scroll::-webkit-scrollbar-thumb { background: ${T.bdMid}; border-radius: 4px; }
        .ai-msg-user:hover, .ai-msg-ai:hover { opacity: .95; }
      `}</style>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── LEFT: Analysis + Quick prompts + Context ── */}
        <div style={{ flex: "0 0 380px", minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Analysis card */}
          <Panel>
            <PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <NavyBadge icon={Brain} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txHi }}>Portfolio Analysis</div>
                  <div style={{ fontSize: 10, color: T.txLo, marginTop: 1 }}>Powered by Groq · Llama 3.3 70B</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <IconBtn onClick={fetchAnalysis} title="Refresh">
                  <RefreshCw size={13} color={T.navy} style={analysisLoading ? { animation: "ai-spin 1s linear infinite" } : {}} />
                </IconBtn>
                <IconBtn onClick={() => setAnalysisOpen(o => !o)} title={analysisOpen ? "Collapse" : "Expand"}>
                  {analysisOpen
                    ? <ChevronUp size={13} color={T.txLo} />
                    : <ChevronDown size={13} color={T.txLo} />}
                </IconBtn>
              </div>
            </PanelHead>

            {analysisOpen && (
              <div style={{ padding: "14px 18px", maxHeight: 420, overflowY: "auto" }} className="ai-scroll">
                {analysisLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                    <TypingDots />
                    <span style={{ fontSize: 12, color: T.txLo }}>Analysing your portfolio…</span>
                  </div>
                ) : analysisError ? (
                  <div style={{ background: T.lossBg, border: `1px solid ${T.lossBd}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.loss, marginBottom: 4 }}>Analysis failed</div>
                    <div style={{ fontSize: 12, color: T.txMed, lineHeight: 1.5 }}>{analysisError}</div>
                    <button onClick={fetchAnalysis} style={{
                      marginTop: 8, fontSize: 11, fontWeight: 600, color: T.navy,
                      background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
                    }}>Try again →</button>
                  </div>
                ) : analysis ? (
                  <MDContent content={analysis} />
                ) : (
                  <p style={{ fontSize: 12, color: T.txLo, padding: "6px 0" }}>Add stocks to get AI analysis.</p>
                )}
              </div>
            )}
          </Panel>

          {/* Quick prompts */}
          <Panel>
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: T.txGhost, marginBottom: 12 }}>
                Quick questions
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {QUICK.map(({ label, icon: Icon, prompt }) => (
                  <button key={label} onClick={() => sendMessage(prompt)} disabled={chatLoading}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                      background: T.navyTint, border: `1px solid ${T.navyBd}`,
                      transition: "all .13s", opacity: chatLoading ? .6 : 1,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.navyPale; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.navyTint; }}
                  >
                    <Icon size={13} color={T.navy} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: T.txHi, lineHeight: 1.3 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* Context preview */}
          <Panel>
            <div style={{ padding: "12px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: T.txGhost, marginBottom: 8 }}>
                Context sent to AI
              </div>
              <pre className="ai-scroll" style={{
                fontSize: 10.5, color: T.txLo, lineHeight: 1.6,
                whiteSpace: "pre-wrap", fontFamily: "monospace",
                maxHeight: 160, overflowY: "auto",
                background: T.bgPage, borderRadius: 8, padding: "10px 12px",
                border: `1px solid ${T.bdSoft}`,
              }}>
                {ctx}
              </pre>
            </div>
          </Panel>
        </div>

        {/* ── RIGHT: Chat ── */}
        <div style={{ flex: "1 1 360px", minWidth: 300 }}>
          <Panel style={{ display: "flex", flexDirection: "column", minHeight: 560, maxHeight: 760 }}>
            {/* Header */}
            <PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <NavyBadge icon={Bot} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txHi }}>Stock AI Chat</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e", display: "inline-block" }} />
                    <span style={{ fontSize: 10, color: T.txLo }}>Portfolio-aware · Ask anything about stocks</span>
                  </div>
                </div>
              </div>
              {chatHistory.length > 0 && (
                <button onClick={() => { setChatHistory([]); setChatError(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                    color: T.loss, background: T.lossBg, border: `1px solid ${T.lossBd}`,
                    cursor: "pointer", transition: "all .13s",
                  }}>
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </PanelHead>

            {/* Messages */}
            <div className="ai-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Empty state */}
              {chatHistory.length === 0 && !chatLoading && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, textAlign: "center", padding: "40px 20px" }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: T.navyPale, border: `1px solid ${T.navyBd}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Sparkles size={24} color={T.navy} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.txHi }}>Ask me anything</div>
                    <div style={{ fontSize: 12, color: T.txLo, marginTop: 5, lineHeight: 1.6 }}>
                      I know your portfolio. Ask about specific stocks,<br />market trends, or trading strategies.
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.txGhost }}>
                    Try: "Should I hold SARDAEN?" or "What's my biggest risk?"
                  </div>
                </div>
              )}

              {/* Bubbles */}
              {chatHistory.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} style={{ display: "flex", gap: 10, flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}>
                    {/* Avatar */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                      background: isUser ? T.navy : T.navyPale,
                      border: isUser ? "none" : `1px solid ${T.navyBd}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isUser
                        ? <User size={13} color="white" />
                        : <Bot size={13} color={T.navy} />}
                    </div>

                    {/* Bubble */}
                    <div style={{
                      maxWidth: "80%",
                      borderRadius: isUser ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                      padding: "10px 14px",
                      background: isUser ? T.navy : T.bg,
                      border: isUser ? "none" : `1px solid ${T.bdMid}`,
                      boxShadow: isUser ? "0 2px 8px rgba(28,53,87,.2)" : T.shadow,
                    }}>
                      {isUser
                        ? <p style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.92)", whiteSpace: "pre-wrap" }}>{msg.content}</p>
                        : <MDContent content={msg.content} />}
                      <div style={{
                        fontSize: 10, marginTop: 5,
                        color: isUser ? "rgba(255,255,255,.45)" : T.txGhost,
                        textAlign: isUser ? "right" : "left",
                      }}>{fmtTime(msg.ts)}</div>
                    </div>
                  </div>
                );
              })}

              {/* Typing */}
              {chatLoading && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: T.navyPale, border: `1px solid ${T.navyBd}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Bot size={13} color={T.navy} />
                  </div>
                  <div style={{
                    borderRadius: "4px 14px 14px 14px", padding: "10px 14px",
                    background: T.bg, border: `1px solid ${T.bdMid}`, boxShadow: T.shadow,
                  }}>
                    <TypingDots />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.bdSoft}`, flexShrink: 0 }}>
              {chatError && (
                <div style={{ fontSize: 11, color: T.loss, marginBottom: 8, padding: "6px 10px", background: T.lossBg, borderRadius: 7, border: `1px solid ${T.lossBd}` }}>
                  {chatError}
                </div>
              )}
              <div style={{
                display: "flex", alignItems: "flex-end", gap: 10,
                background: T.bgPage, border: `1px solid ${T.bdMid}`,
                borderRadius: 12, padding: "10px 12px",
                boxShadow: "inset 0 1px 3px rgba(120,80,20,.05)",
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about your stocks, market trends, trading ideas…"
                  rows={1}
                  disabled={chatLoading}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    resize: "none", fontSize: 13, lineHeight: 1.55, color: T.txHi,
                    fontFamily: "inherit", maxHeight: 100, overflow: "auto",
                  }}
                  onInput={e => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 100) + "px";
                  }}
                />
                <button onClick={() => sendMessage()} disabled={!input.trim() || chatLoading}
                  style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: input.trim() && !chatLoading ? T.navy : T.navyTint,
                    border: input.trim() && !chatLoading ? "none" : `1px solid ${T.navyBd}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: input.trim() && !chatLoading ? "pointer" : "default",
                    transition: "all .15s",
                    boxShadow: input.trim() && !chatLoading ? "0 2px 8px rgba(28,53,87,.3)" : "none",
                  }}>
                  <Send size={14} color={input.trim() && !chatLoading ? "white" : T.txGhost} />
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.txGhost, textAlign: "center", marginTop: 6 }}>
                Enter to send · Shift+Enter for new line · Powered by Groq
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
