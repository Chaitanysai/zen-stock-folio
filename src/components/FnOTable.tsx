/**
 * FnOTable.tsx
 * F&O Portfolio Journal — tracks stock futures and options positions.
 * Sub-tabs: Equity Trades (existing) | F&O Positions | Add F&O Trade
 *
 * Data model:
 *   FnOTrade { symbol, instrumentType: CE/PE/FUT, strike, expiry,
 *              lotSize, lots, entryPrice, exitPrice, ltp, iv, delta }
 * P&L = (ltp - entry) × lots × lotSize  (FUT/CE)
 *       (entry - ltp) × lots × lotSize  (PE)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, TrendingUp, TrendingDown,
  ChevronDown, CheckCircle2, XCircle, Clock,
  AlertCircle, Trash2, Edit2, X
} from "lucide-react";
import {
  FnOTrade, FnOInstrumentType, FnOStatus,
  fnOTradesData, calcFnOPnL, calcFnOInvested,
  fmtExpiry, getLotSize, LOT_SIZES
} from "@/data/sampleData";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  trades: FnOTrade[];
  onUpdate: (trades: FnOTrade[]) => void;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
.fno-wrap { font-family:'DM Sans',-apple-system,sans-serif; height:100%; display:flex; flex-direction:column; background:#fff; }

/* Sub-tabs */
.fno-subtabs { display:flex; align-items:center; gap:2px; padding:14px 20px 0; border-bottom:1px solid #f0f2f5; background:#f8f9fc; }
.fno-stab {
  font-size:12.5px; font-weight:500; color:#6b7280;
  padding:8px 16px; border-radius:8px 8px 0 0; cursor:pointer;
  border:1px solid transparent; border-bottom:none;
  transition:all .14s; background:transparent; position:relative; bottom:-1px;
}
.fno-stab:hover { color:#1f2d3d; background:#fff; }
.fno-stab.on {
  color:#1c3557; font-weight:700;
  background:#fff; border-color:#e5e7eb;
  border-bottom-color:#fff;
}
.fno-stab-badge {
  display:inline-flex; align-items:center; justify-content:center;
  width:18px; height:18px; border-radius:50%;
  background:#eef4fc; color:#1c3557; font-size:9px; font-weight:700;
  margin-left:6px;
}

/* Toolbar */
.fno-toolbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 20px; border-bottom:1px solid #f0f2f5; flex-shrink:0;
  background:#fff; gap:12px;
}
.fno-toolbar-left { display:flex; align-items:center; gap:10px; }
.fno-toolbar-right { display:flex; align-items:center; gap:8px; }
.fno-title { font-size:15px; font-weight:700; color:#111827; font-family:'DM Serif Display',Georgia,serif; letter-spacing:-.2px; }
.fno-sub-text { font-size:11px; color:#9ca3af; font-weight:500; margin-top:1px; }

/* Filter chips */
.fno-filter-row { display:flex; align-items:center; gap:6px; padding:10px 20px; border-bottom:1px solid #f0f2f5; flex-wrap:wrap; background:#f8f9fc; }
.fno-chip {
  font-size:11px; font-weight:600; padding:4px 12px; border-radius:20px;
  border:1px solid #e5e7eb; background:#fff; color:#6b7280; cursor:pointer; transition:all .13s;
}
.fno-chip:hover { border-color:#1c3557; color:#1c3557; }
.fno-chip.on { background:#1c3557; border-color:#1c3557; color:#fff; }
.fno-chip.ce  { background:#ecfdf5; border-color:#a7f3d0; color:#059669; }
.fno-chip.pe  { background:#fef2f2; border-color:#fecaca; color:#dc2626; }
.fno-chip.fut { background:#eef4fc; border-color:#ddeaf8; color:#1c3557; }

/* Summary row */
.fno-summary {
  display:grid; grid-template-columns:repeat(4,1fr); gap:12px;
  padding:14px 20px; border-bottom:1px solid #f0f2f5; background:#fff;
}
.fno-sum-card { background:#f8f9fc; border:1px solid #f0f2f5; border-radius:10px; padding:10px 14px; }
.fno-sum-lbl { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#9ca3af; margin-bottom:4px; }
.fno-sum-val { font-family:'DM Mono','SF Mono',monospace; font-size:18px; font-weight:600; color:#111827; letter-spacing:-.4px; }
.fno-sum-sub { font-size:10px; color:#6b7280; margin-top:3px; font-weight:500; }
.fno-sum-card.green { background:#ecfdf5; border-color:#a7f3d0; }
.fno-sum-card.green .fno-sum-val { color:#059669; }
.fno-sum-card.red   { background:#fef2f2; border-color:#fecaca; }
.fno-sum-card.red   .fno-sum-val { color:#dc2626; }

/* Table */
.fno-table-wrap { flex:1; overflow:auto; }
.fno-table-wrap::-webkit-scrollbar { width:5px; height:5px; }
.fno-table-wrap::-webkit-scrollbar-thumb { background:#e5e7eb; border-radius:5px; }
.fno-table { width:100%; border-collapse:separate; border-spacing:0; }
.fno-table thead th {
  position:sticky; top:0; z-index:2;
  padding:10px 14px; font-size:9.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.09em; color:#9ca3af;
  background:#f8f9fc; border-bottom:1.5px solid #e5e7eb;
  white-space:nowrap; text-align:left;
}
.fno-table thead th.r { text-align:right; }
.fno-table thead th.c { text-align:center; }
.fno-table tbody tr { transition:background .12s; }
.fno-table tbody tr:hover { background:#f8f9fc; }
.fno-table tbody td {
  padding:13px 14px; font-size:12.5px; color:#4b5563;
  border-bottom:1px solid #f0f2f5; vertical-align:middle; white-space:nowrap;
}
.fno-table tbody td.r { text-align:right; }
.fno-table tbody td.c { text-align:center; }
.fno-table tbody tr:last-child td { border-bottom:none; }

/* Instrument badge */
.fno-badge {
  display:inline-flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:800; padding:2px 8px;
  border-radius:5px; letter-spacing:.05em; min-width:34px;
}
.fno-badge-CE  { background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; }
.fno-badge-PE  { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
.fno-badge-FUT { background:#eef4fc; color:#1c3557; border:1px solid #ddeaf8; }

/* Status badge */
.fno-status {
  display:inline-flex; align-items:center; gap:5px;
  font-size:10.5px; font-weight:700; padding:3px 10px;
  border-radius:20px; white-space:nowrap;
}
.fno-status-open   { background:#eef4fc; color:#1c3557; border:1px solid #ddeaf8; }
.fno-status-profit { background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; }
.fno-status-loss   { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
.fno-status-exp    { background:#f9fafb; color:#6b7280; border:1px solid #e5e7eb; }

/* Symbol cell */
.fno-symbol { font-size:13px; font-weight:700; color:#111827; letter-spacing:-.1px; }
.fno-expiry { font-size:10px; color:#9ca3af; margin-top:2px; font-weight:500; }
.fno-strike { font-size:10px; color:#6b7280; margin-top:1px; font-family:'DM Mono',monospace; }

/* P&L cell */
.fno-pnl { font-family:'DM Mono','SF Mono',monospace; font-size:13px; font-weight:700; }
.fno-pnl.pos { color:#059669; }
.fno-pnl.neg { color:#dc2626; }
.fno-pnl-sub { font-size:10px; margin-top:1px; font-family:'DM Mono',monospace; }
.fno-pnl-sub.pos { color:#059669; }
.fno-pnl-sub.neg { color:#dc2626; }

/* Price cells */
.fno-price { font-family:'DM Mono','SF Mono',monospace; font-size:12.5px; color:#374151; font-weight:500; }
.fno-ltp   { font-family:'DM Mono','SF Mono',monospace; font-size:12.5px; font-weight:600; color:#1c3557; }
.fno-ltp.live::before { content:''; display:inline-block; width:5px; height:5px; border-radius:50%; background:#059669; margin-right:4px; vertical-align:middle; }

/* Actions */
.fno-act-btn {
  width:28px; height:28px; border-radius:7px; border:1px solid #f0f2f5;
  background:transparent; display:flex; align-items:center; justify-content:center;
  cursor:pointer; color:#9ca3af; transition:all .13s;
}
.fno-act-btn:hover { background:#fef2f2; border-color:#fecaca; color:#dc2626; }

/* Add button */
.fno-add-btn {
  display:flex; align-items:center; gap:7px;
  background:#1c3557; color:#fff; border:none;
  padding:8px 16px; border-radius:9px; font-size:12.5px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .15s;
  box-shadow:0 2px 8px rgba(28,53,87,.25);
}
.fno-add-btn:hover { background:#224168; transform:translateY(-1px); }

/* Refresh button */
.fno-refresh-btn {
  display:flex; align-items:center; gap:6px;
  background:#f8f9fc; color:#1c3557; border:1px solid #e5e7eb;
  padding:7px 13px; border-radius:9px; font-size:12px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .13s;
}
.fno-refresh-btn:hover { background:#eef4fc; border-color:#ddeaf8; }

/* Empty state */
.fno-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; gap:12px; }
.fno-empty-icon { width:52px; height:52px; border-radius:14px; background:#eef4fc; border:1px solid #ddeaf8; display:flex; align-items:center; justify-content:center; font-size:24px; }
.fno-empty-title { font-size:15px; font-weight:700; color:#111827; }
.fno-empty-sub { font-size:12.5px; color:#6b7280; text-align:center; max-width:320px; line-height:1.6; }

/* ── MODAL ── */
.fno-modal-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:1000;
  display:flex; align-items:center; justify-content:center; padding:20px;
  backdrop-filter:blur(4px);
}
.fno-modal {
  background:#fff; border-radius:16px; width:100%; max-width:540px;
  box-shadow:0 20px 60px rgba(0,0,0,.18); overflow:hidden;
  animation:fno-slide-up .2s ease;
}
@keyframes fno-slide-up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
.fno-modal-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:18px 22px; border-bottom:1px solid #f0f2f5; background:#f8f9fc;
}
.fno-modal-title { font-size:15px; font-weight:700; color:#111827; font-family:'DM Serif Display',Georgia,serif; }
.fno-modal-close {
  width:30px; height:30px; border-radius:8px; border:1px solid #e5e7eb;
  background:#fff; display:flex; align-items:center; justify-content:center;
  cursor:pointer; color:#6b7280; transition:all .13s;
}
.fno-modal-close:hover { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
.fno-modal-body { padding:22px; display:flex; flex-direction:column; gap:16px; max-height:70vh; overflow-y:auto; }
.fno-modal-footer { padding:16px 22px; border-top:1px solid #f0f2f5; display:flex; gap:10px; justify-content:flex-end; background:#f8f9fc; }

/* Form fields */
.fno-field { display:flex; flex-direction:column; gap:5px; }
.fno-field-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.fno-field-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
.fno-label { font-size:11.5px; font-weight:600; color:#4b5563; letter-spacing:.01em; }
.fno-label span { color:#dc2626; margin-left:2px; }
.fno-input {
  padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:9px;
  font-size:13px; color:#111827; background:#f8f9fc;
  font-family:inherit; transition:all .14s; outline:none;
}
.fno-input:focus { border-color:#1c3557; background:#fff; box-shadow:0 0 0 3px rgba(28,53,87,.08); }
.fno-input::placeholder { color:#d1d5db; }
.fno-select {
  padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:9px;
  font-size:13px; color:#111827; background:#f8f9fc;
  font-family:inherit; transition:all .14s; outline:none; cursor:pointer;
  appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 12px center; padding-right:32px;
}
.fno-select:focus { border-color:#1c3557; background-color:#fff; box-shadow:0 0 0 3px rgba(28,53,87,.08); }
.fno-hint { font-size:10.5px; color:#9ca3af; margin-top:1px; }
.fno-seg { display:flex; gap:4px; }
.fno-seg-btn {
  flex:1; padding:8px; border-radius:8px; border:1.5px solid #e5e7eb;
  font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;
  background:#f8f9fc; color:#6b7280; transition:all .13s; text-align:center;
}
.fno-seg-btn:hover { border-color:#1c3557; color:#1c3557; }
.fno-seg-btn.CE.on  { background:#ecfdf5; border-color:#a7f3d0; color:#059669; }
.fno-seg-btn.PE.on  { background:#fef2f2; border-color:#fecaca; color:#dc2626; }
.fno-seg-btn.FUT.on { background:#eef4fc; border-color:#ddeaf8; color:#1c3557; }

/* Lot size hint */
.fno-lot-hint {
  padding:8px 12px; background:#eef4fc; border:1px solid #ddeaf8;
  border-radius:8px; font-size:11.5px; color:#1c3557; font-weight:500;
  display:flex; align-items:center; gap:6px;
}

/* Calc preview */
.fno-preview {
  background:#f8f9fc; border:1px solid #f0f2f5; border-radius:10px;
  padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;
}
.fno-preview-item { text-align:center; }
.fno-preview-lbl { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#9ca3af; margin-bottom:3px; }
.fno-preview-val { font-family:'DM Mono',monospace; font-size:14px; font-weight:700; color:#111827; }

/* Buttons */
.fno-btn-primary {
  background:#1c3557; color:#fff; border:none; padding:9px 22px;
  border-radius:9px; font-size:13px; font-weight:600; cursor:pointer;
  font-family:inherit; transition:all .15s; box-shadow:0 2px 8px rgba(28,53,87,.25);
}
.fno-btn-primary:hover { background:#224168; }
.fno-btn-primary:disabled { opacity:.5; cursor:not-allowed; }
.fno-btn-ghost {
  background:transparent; color:#6b7280; border:1.5px solid #e5e7eb;
  padding:9px 20px; border-radius:9px; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .13s;
}
.fno-btn-ghost:hover { background:#f0f2f5; color:#374151; }

/* Live pulse dot */
@keyframes fno-pulse { 0%,100%{opacity:1}50%{opacity:.35} }
.fno-live-dot {
  display:inline-block; width:6px; height:6px; border-radius:50%;
  background:#059669; animation:fno-pulse 2s infinite;
  vertical-align:middle; margin-right:4px;
}

/* ── Dark mode overrides for F&O Table ── */
.dark .fno-wrap        { background:#1c2128; }
.dark .fno-toolbar     { background:#1c2128; border-bottom-color:#30363d; }
.dark .fno-title       { color:#f0f6fc; }
.dark .fno-sub-text    { color:#6e7681; }
/* Filter row */
.dark .fno-filter-row  { background:#161b22; border-bottom-color:#30363d; }
.dark .fno-chip        { background:#21262d; border-color:#30363d; color:#8b949e; }
.dark .fno-chip:hover  { border-color:#58a6ff; color:#f0f6fc; }
.dark .fno-chip.on     { background:#58a6ff; border-color:#58a6ff; color:#fff; }
.dark .fno-chip.ce     { background:rgba(63,185,80,.12); border-color:rgba(63,185,80,.3); color:#3fb950; }
.dark .fno-chip.pe     { background:rgba(248,81,73,.12); border-color:rgba(248,81,73,.3); color:#f85149; }
.dark .fno-chip.fut    { background:rgba(88,166,255,.12); border-color:rgba(88,166,255,.25); color:#58a6ff; }
/* Summary cards */
.dark .fno-summary     { background:#1c2128; border-bottom-color:#30363d; }
.dark .fno-sum-card    { background:#161b22; border-color:#30363d; }
.dark .fno-sum-lbl     { color:#484f58; }
.dark .fno-sum-val     { color:#f0f6fc; }
.dark .fno-sum-sub     { color:#6e7681; }
.dark .fno-sum-card.green { background:rgba(63,185,80,.08); border-color:rgba(63,185,80,.2); }
.dark .fno-sum-card.green .fno-sum-val { color:#3fb950; }
.dark .fno-sum-card.red   { background:rgba(248,81,73,.08); border-color:rgba(248,81,73,.2); }
.dark .fno-sum-card.red   .fno-sum-val { color:#f85149; }
/* Table */
.dark .fno-table-wrap  { background:#1c2128; }
.dark .fno-table thead th { background:#161b22; color:#484f58; border-bottom-color:#30363d; }
.dark .fno-table tbody tr:hover { background:#21262d; }
.dark .fno-table tbody td { color:#8b949e; border-bottom-color:#21262d; }
/* Type badges */
.dark .fno-badge-CE    { background:rgba(63,185,80,.12); color:#3fb950; border-color:rgba(63,185,80,.3); }
.dark .fno-badge-PE    { background:rgba(248,81,73,.12); color:#f85149; border-color:rgba(248,81,73,.3); }
.dark .fno-badge-FUT   { background:rgba(88,166,255,.12); color:#58a6ff; border-color:rgba(88,166,255,.25); }
/* Status badges */
.dark .fno-status-open   { background:rgba(88,166,255,.12); color:#58a6ff; border-color:rgba(88,166,255,.25); }
.dark .fno-status-profit { background:rgba(63,185,80,.12); color:#3fb950; border-color:rgba(63,185,80,.3); }
.dark .fno-status-loss   { background:rgba(248,81,73,.12); color:#f85149; border-color:rgba(248,81,73,.3); }
.dark .fno-status-exp    { background:#21262d; color:#6e7681; border-color:#30363d; }
/* Text cells */
.dark .fno-symbol  { color:#f0f6fc; }
.dark .fno-expiry  { color:#6e7681; }
.dark .fno-price   { color:#c9d1d9; }
.dark .fno-ltp     { color:#c9d1d9; }
.dark .fno-ltp.live::before { background:#3fb950; }
.dark .fno-pnl.pos     { color:#3fb950; }
.dark .fno-pnl.neg     { color:#f85149; }
.dark .fno-pnl-sub.pos { color:#3fb950; }
.dark .fno-pnl-sub.neg { color:#f85149; }
/* Action buttons */
.dark .fno-act-btn { background:transparent; border-color:#30363d; color:#484f58; }
.dark .fno-act-btn:hover { background:rgba(248,81,73,.12); border-color:rgba(248,81,73,.3); color:#f85149; }
/* Top buttons */
.dark .fno-add-btn     { background:#58a6ff; box-shadow:0 2px 8px rgba(88,166,255,.3); color:#fff; }
.dark .fno-add-btn:hover { background:#79b8ff; }
.dark .fno-refresh-btn { background:#21262d; border-color:#30363d; color:#c9d1d9; }
.dark .fno-refresh-btn:hover { background:#30363d; color:#f0f6fc; }
/* Lot hint */
.dark .fno-lot-hint { background:rgba(88,166,255,.10); border-color:rgba(88,166,255,.2); color:#58a6ff; }
/* Calc preview */
.dark .fno-preview     { background:#161b22; border-color:#30363d; }
.dark .fno-preview-lbl { color:#484f58; }
.dark .fno-preview-val { color:#f0f6fc; }
/* Tab badges */
.dark .fno-stab-badge  { background:rgba(88,166,255,.12); color:#58a6ff; }
/* Empty state */
.dark .fno-empty-icon  { background:rgba(88,166,255,.10); border-color:rgba(88,166,255,.2); }
.dark .fno-empty-title { color:#f0f6fc; }
.dark .fno-empty-sub   { color:#8b949e; }
/* Modal */
.dark .fno-modal           { background:#1c2128; }
.dark .fno-modal-head      { background:#161b22; border-bottom-color:#30363d; }
.dark .fno-modal-title     { color:#f0f6fc; }
.dark .fno-modal-close     { background:#21262d; border-color:#30363d; color:#8b949e; }
.dark .fno-modal-close:hover { background:rgba(248,81,73,.12); color:#f85149; border-color:rgba(248,81,73,.3); }
.dark .fno-modal-body      { background:#1c2128; }
.dark .fno-modal-footer    { background:#161b22; border-top-color:#30363d; }
/* Form fields */
.dark .fno-label           { color:#c9d1d9; }
.dark .fno-label span      { color:#f85149; }
.dark .fno-input,
.dark .fno-select          { background:#0d1117; border-color:#30363d; color:#f0f6fc; }
.dark .fno-input:focus,
.dark .fno-select:focus    { border-color:#58a6ff; background:#0d1117; box-shadow:0 0 0 3px rgba(88,166,255,.15); }
.dark .fno-input::placeholder { color:#484f58; }
.dark .fno-hint            { color:#484f58; }
/* Segment buttons */
.dark .fno-seg-btn         { background:#21262d; border-color:#30363d; color:#8b949e; }
.dark .fno-seg-btn:hover   { border-color:#58a6ff; color:#f0f6fc; }
.dark .fno-seg-btn.CE.on   { background:rgba(63,185,80,.14); border-color:rgba(63,185,80,.35); color:#3fb950; }
.dark .fno-seg-btn.PE.on   { background:rgba(248,81,73,.14); border-color:rgba(248,81,73,.35); color:#f85149; }
.dark .fno-seg-btn.FUT.on  { background:rgba(88,166,255,.14); border-color:rgba(88,166,255,.35); color:#58a6ff; }
/* Buttons */
.dark .fno-btn-primary     { background:#58a6ff; color:#fff; }
.dark .fno-btn-primary:hover { background:#79b8ff; }
.dark .fno-btn-ghost       { background:transparent; border-color:#30363d; color:#8b949e; }
.dark .fno-btn-ghost:hover { background:#21262d; color:#c9d1d9; }
/* Overlay */
.dark .fno-modal-overlay   { background:rgba(0,0,0,.7); }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}
function fmtP(n: number) { return n.toFixed(2); }
function sign(n: number) { return n >= 0 ? "+" : "−"; }
function uid() { return "fno-" + Date.now() + "-" + Math.random().toString(36).slice(2,7); }

// ─── Add/Edit Modal ────────────────────────────────────────────────────────────
interface ModalProps {
  initial?: FnOTrade | null;
  onSave: (t: FnOTrade) => void;
  onClose: () => void;
}

function FnOModal({ initial, onSave, onClose }: ModalProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    symbol:         initial?.symbol         ?? "",
    instrumentType: initial?.instrumentType ?? "FUT" as FnOInstrumentType,
    strike:         initial?.strike?.toString()      ?? "",
    expiry:         initial?.expiry         ?? "",
    lots:           initial?.lots?.toString()         ?? "1",
    lotSize:        initial?.lotSize?.toString()      ?? "",
    entryPrice:     initial?.entryPrice?.toString()   ?? "",
    exitPrice:      initial?.exitPrice?.toString()    ?? "",
    entryDate:      initial?.entryDate      ?? new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"}).split("/").reverse().join("-"),
    exitDate:       initial?.exitDate       ?? "",
    status:         initial?.status         ?? "Open" as FnOStatus,
    notes:          initial?.notes          ?? "",
  });

  // Auto-fill lot size when symbol changes
  const handleSymbol = (val: string) => {
    const up = val.toUpperCase();
    const ls = getLotSize(up);
    setForm(p => ({ ...p, symbol: up, lotSize: ls.toString() }));
  };

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Calc preview
  const lots      = parseFloat(form.lots)       || 0;
  const lotSize   = parseFloat(form.lotSize)    || 0;
  const entryP    = parseFloat(form.entryPrice) || 0;
  const exitP     = parseFloat(form.exitPrice)  || 0;
  const premium   = entryP * lots * lotSize;
  const estPnl    = exitP > 0
    ? (form.instrumentType === "PE"
        ? (entryP - exitP) * lots * lotSize
        : (exitP  - entryP) * lots * lotSize)
    : 0;

  const valid = form.symbol && form.expiry && form.lots && form.lotSize && form.entryPrice &&
    (form.instrumentType === "FUT" || form.strike);

  const handleSave = () => {
    if (!valid) return;
    const t: FnOTrade = {
      id:             initial?.id ?? uid(),
      symbol:         form.symbol,
      instrumentType: form.instrumentType,
      strike:         form.strike ? parseFloat(form.strike) : undefined,
      expiry:         form.expiry,
      lotSize:        parseFloat(form.lotSize),
      lots:           parseFloat(form.lots),
      entryPrice:     parseFloat(form.entryPrice),
      exitPrice:      form.exitPrice ? parseFloat(form.exitPrice) : undefined,
      entryDate:      form.entryDate,
      exitDate:       form.exitDate || undefined,
      status:         form.status,
      notes:          form.notes || undefined,
    };
    onSave(t);
  };

  return (
    <div className="fno-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fno-modal">
        <div className="fno-modal-head">
          <span className="fno-modal-title">{isEdit ? "Edit F&O Trade" : "Add F&O Trade"}</span>
          <button className="fno-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="fno-modal-body">

          {/* Instrument type selector */}
          <div className="fno-field">
            <label className="fno-label">Instrument Type<span>*</span></label>
            <div className="fno-seg">
              {(["FUT","CE","PE"] as FnOInstrumentType[]).map(t => (
                <button key={t}
                  className={`fno-seg-btn ${t} ${form.instrumentType === t ? "on" : ""}`}
                  onClick={() => f("instrumentType", t)}>
                  {t === "FUT" ? "Futures" : t === "CE" ? "Call (CE)" : "Put (PE)"}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol + expiry */}
          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label">Symbol<span>*</span></label>
              <input className="fno-input" placeholder="RELIANCE" value={form.symbol}
                onChange={e => handleSymbol(e.target.value)} style={{ textTransform:"uppercase" }} />
            </div>
            <div className="fno-field">
              <label className="fno-label">Expiry Date<span>*</span></label>
              <input className="fno-input" placeholder="27-03-2025" value={form.expiry}
                onChange={e => f("expiry", e.target.value)} />
              <span className="fno-hint">DD-MM-YYYY</span>
            </div>
          </div>

          {/* Strike (options only) */}
          {form.instrumentType !== "FUT" && (
            <div className="fno-field">
              <label className="fno-label">Strike Price<span>*</span></label>
              <input className="fno-input" placeholder="e.g. 2500" type="number" value={form.strike}
                onChange={e => f("strike", e.target.value)} />
            </div>
          )}

          {/* Lots + Lot size */}
          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label">Lots<span>*</span></label>
              <input className="fno-input" placeholder="1" type="number" min="1" value={form.lots}
                onChange={e => f("lots", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label">Lot Size<span>*</span></label>
              <input className="fno-input" placeholder="250" type="number" value={form.lotSize}
                onChange={e => f("lotSize", e.target.value)} />
            </div>
          </div>

          {/* Lot size hint if known */}
          {form.symbol && LOT_SIZES[form.symbol] && (
            <div className="fno-lot-hint">
              ℹ NSE lot size for {form.symbol} = <strong>{LOT_SIZES[form.symbol]}</strong> units
            </div>
          )}

          {/* Entry price + date */}
          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label">{form.instrumentType === "FUT" ? "Entry Price (₹)" : "Entry Premium (₹)"}<span>*</span></label>
              <input className="fno-input" placeholder="0.00" type="number" step="0.05" value={form.entryPrice}
                onChange={e => f("entryPrice", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label">Entry Date</label>
              <input className="fno-input" type="date" value={form.entryDate?.split("-").reverse().join("-")}
                onChange={e => {
                  const d = e.target.value.split("-").reverse().join("-");
                  f("entryDate", d);
                }} />
            </div>
          </div>

          {/* Exit price + date */}
          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label">{form.instrumentType === "FUT" ? "Exit Price (₹)" : "Exit Premium (₹)"}</label>
              <input className="fno-input" placeholder="Leave blank if still open" type="number" step="0.05" value={form.exitPrice}
                onChange={e => f("exitPrice", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label">Exit Date</label>
              <input className="fno-input" type="date" value={form.exitDate?.split("-").reverse().join("-")}
                onChange={e => {
                  const d = e.target.value ? e.target.value.split("-").reverse().join("-") : "";
                  f("exitDate", d);
                }} />
            </div>
          </div>

          {/* Status */}
          <div className="fno-field">
            <label className="fno-label">Status</label>
            <select className="fno-select" value={form.status} onChange={e => f("status", e.target.value)}>
              <option value="Open">Open</option>
              <option value="Closed Profit">Closed — Profit</option>
              <option value="Closed Loss">Closed — Loss</option>
              <option value="Expired">Expired (worthless)</option>
            </select>
          </div>

          {/* Notes */}
          <div className="fno-field">
            <label className="fno-label">Notes / Trade Reason</label>
            <input className="fno-input" placeholder="e.g. Positional long on breakout" value={form.notes}
              onChange={e => f("notes", e.target.value)} />
          </div>

          {/* Calc preview */}
          {entryP > 0 && lots > 0 && lotSize > 0 && (
            <div className="fno-preview">
              <div className="fno-preview-item">
                <div className="fno-preview-lbl">Total Units</div>
                <div className="fno-preview-val">{(lots * lotSize).toLocaleString("en-IN")}</div>
              </div>
              <div className="fno-preview-item">
                <div className="fno-preview-lbl">{form.instrumentType === "FUT" ? "Margin ~15%" : "Premium Paid"}</div>
                <div className="fno-preview-val">{fmt(premium * (form.instrumentType === "FUT" ? 0.15 : 1))}</div>
              </div>
              {exitP > 0 && (
                <div className="fno-preview-item">
                  <div className="fno-preview-lbl">Estimated P&L</div>
                  <div className="fno-preview-val" style={{ color: estPnl >= 0 ? "#059669" : "#dc2626" }}>
                    {estPnl >= 0 ? "+" : "−"}{fmt(Math.abs(estPnl))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="fno-modal-footer">
          <button className="fno-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="fno-btn-primary" onClick={handleSave} disabled={!valid}>
            {isEdit ? "Save Changes" : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: FnOStatus }) {
  const cfg = {
    "Open":           { cls: "fno-status-open",   icon: <Clock size={11} />,        label: "Open"   },
    "Closed Profit":  { cls: "fno-status-profit",  icon: <CheckCircle2 size={11} />, label: "Profit" },
    "Closed Loss":    { cls: "fno-status-loss",    icon: <XCircle size={11} />,      label: "Loss"   },
    "Expired":        { cls: "fno-status-exp",     icon: <AlertCircle size={11} />,  label: "Expired"},
  }[status];
  return <span className={`fno-status ${cfg.cls}`}>{cfg.icon}{cfg.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function FnOTable({ trades, onUpdate }: Props) {
  const [filter, setFilter] = useState<"ALL" | FnOInstrumentType | "Open" | "Closed">("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editTrade, setEditTrade] = useState<FnOTrade | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ltpMap, setLtpMap]   = useState<Record<string, number>>({});

  // ── Fetch live prices via Upstox ──────────────────────────────────────────
  const fetchLivePrices = useCallback(async () => {
    const openTrades = trades.filter(t => t.status === "Open");
    if (openTrades.length === 0) return;
    setRefreshing(true);
    try {
      const symbols = [...new Set(openTrades.map(t => t.symbol))];
      // Use existing prices API — futures trade at slight premium/discount to spot
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: symbols }),
      });
      const data = await res.json();
      if (data.prices) {
        const newMap: Record<string, number> = {};
        symbols.forEach(sym => {
          if (data.prices[sym]?.price) newMap[sym] = data.prices[sym].price;
        });
        setLtpMap(newMap);
        // Update ltp on open trades
        onUpdate(trades.map(t =>
          t.status === "Open" && newMap[t.symbol]
            ? { ...t, ltp: newMap[t.symbol] }
            : t
        ));
      }
    } catch { /* silently fail */ }
    finally { setRefreshing(false); }
  }, [trades]);

  useEffect(() => {
    fetchLivePrices();
    const id = setInterval(fetchLivePrices, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const addTrade = (t: FnOTrade) => {
    onUpdate([...trades, t]);
    setShowModal(false);
  };
  const saveTrade = (t: FnOTrade) => {
    onUpdate(trades.map(x => x.id === t.id ? t : x));
    setEditTrade(null);
  };
  const deleteTrade = (id: string) => {
    if (confirm("Delete this F&O trade?")) onUpdate(trades.filter(t => t.id !== id));
  };

  // ── Filtered trades ───────────────────────────────────────────────────────
  const filtered = trades.filter(t => {
    if (filter === "ALL")    return true;
    if (filter === "Open")   return t.status === "Open";
    if (filter === "Closed") return t.status !== "Open";
    return t.instrumentType === filter;
  });

  // ── Summary metrics ───────────────────────────────────────────────────────
  const open    = trades.filter(t => t.status === "Open");
  const closed  = trades.filter(t => t.status !== "Open");
  const openPnl = open.reduce((s, t) => s + calcFnOPnL(t), 0);
  const closePnl = closed.reduce((s, t) => s + calcFnOPnL(t), 0);
  const totalPremium = open.reduce((s, t) => s + calcFnOInvested(t), 0);
  const winCount = closed.filter(t => calcFnOPnL(t) > 0).length;
  const winRate  = closed.length > 0 ? winCount / closed.length * 100 : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="fno-wrap">

        {/* Toolbar */}
        <div className="fno-toolbar">
          <div className="fno-toolbar-left">
            <div>
              <div className="fno-title">F&O Positions</div>
              <div className="fno-sub-text">{open.length} open · {closed.length} closed · All values in ₹ INR</div>
            </div>
          </div>
          <div className="fno-toolbar-right">
            <button className="fno-refresh-btn" onClick={fetchLivePrices} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "fno-spinning" : ""} />
              {refreshing ? "Updating…" : "Refresh LTP"}
            </button>
            <button className="fno-add-btn" onClick={() => setShowModal(true)}>
              <Plus size={14} /> Add Trade
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="fno-summary">
          <div className="fno-sum-card">
            <div className="fno-sum-lbl">Open Positions</div>
            <div className="fno-sum-val">{open.length}</div>
            <div className="fno-sum-sub">Premium deployed: {fmt(totalPremium)}</div>
          </div>
          <div className={`fno-sum-card ${openPnl >= 0 ? "green" : "red"}`}>
            <div className="fno-sum-lbl">Unrealised P&L</div>
            <div className="fno-sum-val">{sign(openPnl)}{fmt(Math.abs(openPnl))}</div>
            <div className="fno-sum-sub">{open.length} open positions</div>
          </div>
          <div className={`fno-sum-card ${closePnl >= 0 ? "green" : "red"}`}>
            <div className="fno-sum-lbl">Realised P&L</div>
            <div className="fno-sum-val">{sign(closePnl)}{fmt(Math.abs(closePnl))}</div>
            <div className="fno-sum-sub">{closed.length} closed trades</div>
          </div>
          <div className="fno-sum-card">
            <div className="fno-sum-lbl">F&O Win Rate</div>
            <div className="fno-sum-val" style={{ color: winRate >= 50 ? "#059669" : "#d97706" }}>
              {winRate.toFixed(0)}%
            </div>
            <div className="fno-sum-sub">{winCount}/{closed.length} profitable</div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="fno-filter-row">
          {(["ALL","Open","Closed","FUT","CE","PE"] as const).map(f => (
            <button key={f}
              className={`fno-chip ${f !== "ALL" && f !== "Open" && f !== "Closed" ? f.toLowerCase() : ""} ${filter === f ? "on" : ""}`}
              onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : f === "FUT" ? "Futures" : f === "CE" ? "Call Options" : f === "PE" ? "Put Options" : f}
              {f === "Open"   && <span className="fno-stab-badge">{open.length}</span>}
              {f === "Closed" && <span className="fno-stab-badge">{closed.length}</span>}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="fno-table-wrap">
          {filtered.length === 0 ? (
            <div className="fno-empty">
              <div className="fno-empty-icon">📊</div>
              <div className="fno-empty-title">No F&O trades found</div>
              <div className="fno-empty-sub">
                {filter === "ALL"
                  ? "Add your first F&O trade using the button above. Supports futures and options on NSE stocks."
                  : `No ${filter} trades. Try a different filter or add a new trade.`}
              </div>
              <button className="fno-add-btn" onClick={() => setShowModal(true)}>
                <Plus size={14} /> Add your first F&O trade
              </button>
            </div>
          ) : (
            <table className="fno-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="c">Type</th>
                  <th className="r">Strike</th>
                  <th>Expiry</th>
                  <th className="r">Lots × Size</th>
                  <th className="r">Entry (₹)</th>
                  <th className="r">LTP (₹)</th>
                  <th className="r">P&L (₹)</th>
                  <th className="c">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const ltp    = t.ltp ?? t.exitPrice ?? t.entryPrice;
                  const pnl    = calcFnOPnL(t);
                  const pnlPct = t.entryPrice > 0 ? pnl / (t.entryPrice * t.lots * t.lotSize) * 100 : 0;
                  const pos    = pnl >= 0;
                  const hasLive = t.status === "Open" && !!ltpMap[t.symbol];

                  return (
                    <tr key={t.id}>
                      {/* Symbol */}
                      <td>
                        <div className="fno-symbol">{t.symbol}</div>
                        {t.notes && <div className="fno-expiry" style={{ maxWidth: 160, overflow:"hidden", textOverflow:"ellipsis" }}>{t.notes}</div>}
                      </td>

                      {/* Type badge */}
                      <td className="c">
                        <span className={`fno-badge fno-badge-${t.instrumentType}`}>
                          {t.instrumentType}
                        </span>
                      </td>

                      {/* Strike */}
                      <td className="r">
                        <span className="fno-price">
                          {t.strike ? `₹${t.strike.toLocaleString("en-IN")}` : "—"}
                        </span>
                      </td>

                      {/* Expiry */}
                      <td>
                        <span className="fno-expiry" style={{ fontSize: 12, color:"#374151", fontWeight:600 }}>
                          {fmtExpiry(t.expiry)}
                        </span>
                      </td>

                      {/* Lots × LotSize */}
                      <td className="r">
                        <span className="fno-price">
                          {t.lots} × {t.lotSize.toLocaleString("en-IN")}
                        </span>
                        <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>
                          {(t.lots * t.lotSize).toLocaleString("en-IN")} units
                        </div>
                      </td>

                      {/* Entry */}
                      <td className="r">
                        <span className="fno-price">₹{fmtP(t.entryPrice)}</span>
                        <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>
                          {fmt(t.entryPrice * t.lots * t.lotSize)}
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="r">
                        <span className={`fno-ltp ${hasLive ? "live" : ""}`}>
                          {hasLive && <span className="fno-live-dot" />}
                          ₹{fmtP(ltp)}
                        </span>
                        {t.iv && (
                          <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>
                            IV {t.iv.toFixed(1)}% {t.delta ? `· Δ ${t.delta.toFixed(2)}` : ""}
                          </div>
                        )}
                      </td>

                      {/* P&L */}
                      <td className="r">
                        <div className={`fno-pnl ${pos ? "pos" : "neg"}`}>
                          {sign(pnl)}{fmt(Math.abs(pnl))}
                        </div>
                        <div className={`fno-pnl-sub ${pos ? "pos" : "neg"}`}>
                          {sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%
                        </div>
                      </td>

                      {/* Status */}
                      <td className="c">
                        <StatusBadge status={t.status} />
                      </td>

                      {/* Actions */}
                      <td>
                        <div style={{ display:"flex", gap:4 }}>
                          <button className="fno-act-btn" title="Edit"
                            style={{ color:"#6b7280" }}
                            onClick={() => setEditTrade(t)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#eef4fc"; (e.currentTarget as HTMLElement).style.color="#1c3557"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background=""; (e.currentTarget as HTMLElement).style.color=""; }}>
                            <Edit2 size={12} />
                          </button>
                          <button className="fno-act-btn" title="Delete" onClick={() => deleteTrade(t.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <FnOModal onSave={addTrade} onClose={() => setShowModal(false)} />
      )}
      {/* Edit Modal */}
      {editTrade && (
        <FnOModal initial={editTrade} onSave={saveTrade} onClose={() => setEditTrade(null)} />
      )}
    </>
  );
}