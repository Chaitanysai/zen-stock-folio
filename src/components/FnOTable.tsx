/**
 * FnOTable.tsx
 * F&O Portfolio Journal â€” tracks stock futures and options positions.
 *
 * P&L = (ltp - entry) Ã— lots Ã— lotSize  (FUT/CE)
 *       (entry - ltp) Ã— lots Ã— lotSize  (PE)
 */

import { useState, useEffect, useCallback } from "react";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { apiFetch } from "@/lib/api";
import {
  Plus, RefreshCw, CheckCircle2, XCircle, Clock,
  AlertCircle, Trash2, Edit2,
} from "lucide-react";
import {
  FnOTrade, FnOInstrumentType, FnOStatus,
  calcFnOPnL, calcFnOInvested,
  fmtExpiry, getLotSize, LOT_SIZES,
} from "@/data/sampleData";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  trades: FnOTrade[];
  onUpdate: (trades: FnOTrade[]) => void;
}

interface LivePrice {
  ltp: number;
  change?: number;
  iv?: number;
  delta?: number;
}

// Scoped to F&O. Portalled surfaces use the equivalent global shadcn tokens as
// fallbacks because they render outside the .zf token scope.
const CSS = `
.fno-wrap {
  font-family:var(--ff-body,'Inter',-apple-system,sans-serif); height:100%;
  display:flex; flex-direction:column; background:var(--bg-card,hsl(var(--card)));
  color:var(--tx-700,hsl(var(--foreground)));
}
.fno-wrap button { font-family:inherit; }
.fno-wrap button:focus-visible, .fno-modal button:focus-visible,
.fno-alert button:focus-visible, .fno-input:focus-visible, .fno-select:focus-visible {
  outline:2px solid var(--accent,hsl(var(--ring))); outline-offset:2px;
}

/* Toolbar */
.fno-toolbar {
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 20px; border-bottom:1px solid var(--bd-50,hsl(var(--border)));
  background:var(--bg-card,hsl(var(--card))); flex-shrink:0;
}
.fno-toolbar-left { min-width:0; }
.fno-toolbar-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.fno-title { font-size:15px; font-weight:700; color:var(--tx-900,hsl(var(--foreground))); letter-spacing:-.02em; }
.fno-sub-text { font-size:11px; color:var(--tx-400,hsl(var(--muted-foreground))); font-weight:500; margin-top:3px; }

/* Filters */
.fno-filter-row {
  display:flex; align-items:center; gap:6px; padding:10px 20px;
  border-bottom:1px solid var(--bd-50,hsl(var(--border)));
  background:var(--bg-surface,hsl(var(--secondary))); overflow-x:auto;
}
.fno-chip {
  flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center;
  min-height:30px; padding:5px 12px; border-radius:999px;
  border:1px solid var(--bd-100,hsl(var(--border))); background:var(--bg-solid,hsl(var(--card)));
  color:var(--tx-500,hsl(var(--muted-foreground))); cursor:pointer;
  font-size:11px; font-weight:600; white-space:nowrap;
  transition:background var(--dur-fast,120ms), color var(--dur-fast,120ms), border-color var(--dur-fast,120ms);
}
.fno-chip:hover { border-color:var(--accent,hsl(var(--ring))); color:var(--accent,hsl(var(--primary))); }
.fno-chip.on { background:var(--accent-fill,hsl(var(--primary))); border-color:var(--accent-fill,hsl(var(--primary))); color:var(--fno-accent-ink,hsl(var(--primary-foreground))); }
.fno-chip.ce.on { background:var(--green-bg,hsl(var(--profit)/.08)); border-color:var(--green-bd,hsl(var(--profit)/.22)); color:var(--green,hsl(var(--profit))); }
.fno-chip.pe.on { background:var(--red-bg,hsl(var(--loss)/.07)); border-color:var(--red-bd,hsl(var(--loss)/.22)); color:var(--red,hsl(var(--loss))); }
.fno-chip.fut.on { background:var(--accent-dim,hsl(var(--accent))); border-color:var(--accent-bd,hsl(var(--ring))); color:var(--accent,hsl(var(--accent-foreground))); }
.fno-count {
  display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px;
  padding:0 5px; margin-left:6px; border-radius:999px; background:var(--accent-dim,hsl(var(--accent)));
  color:currentColor; font-size:9px; font-weight:700; font-variant-numeric:tabular-nums;
}

/* Summary */
.fno-summary {
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px;
  padding:14px 20px; border-bottom:1px solid var(--bd-50,hsl(var(--border)));
  background:var(--bg-card,hsl(var(--card)));
}
.fno-sum-card {
  min-width:0; padding:12px 14px; background:var(--bg-surface,hsl(var(--secondary)));
  border:1px solid var(--bd-50,hsl(var(--border))); border-radius:var(--r-md,12px);
  box-shadow:var(--sh-1,none);
}
.fno-sum-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--tx-400,hsl(var(--muted-foreground))); margin-bottom:5px; }
.fno-sum-val { font-family:var(--ff-mono,'DM Mono',monospace); font-size:19px; line-height:1.2; font-weight:600; color:var(--tx-900,hsl(var(--foreground))); letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.fno-sum-sub { font-size:10px; color:var(--tx-500,hsl(var(--muted-foreground))); margin-top:5px; font-weight:500; font-variant-numeric:tabular-nums; }
.fno-sum-card.green { background:var(--green-bg,hsl(var(--profit)/.08)); border-color:var(--green-bd,hsl(var(--profit)/.22)); }
.fno-sum-card.green .fno-sum-val { color:var(--green,hsl(var(--profit))); }
.fno-sum-card.red { background:var(--red-bg,hsl(var(--loss)/.07)); border-color:var(--red-bd,hsl(var(--loss)/.22)); }
.fno-sum-card.red .fno-sum-val { color:var(--red,hsl(var(--loss))); }
.fno-sum-card.amber .fno-sum-val { color:var(--amber,hsl(var(--warning))); }

/* Table */
.fno-table-wrap { flex:1; min-height:0; overflow:auto; background:var(--bg-solid,hsl(var(--card))); }
.fno-table-wrap::-webkit-scrollbar { width:6px; height:6px; }
.fno-table-wrap::-webkit-scrollbar-thumb { background:var(--bd-200,hsl(var(--border))); border-radius:6px; }
.fno-table { width:100%; min-width:980px; border-collapse:separate; border-spacing:0; }
.fno-table thead th {
  position:sticky; top:0; z-index:2; padding:10px 14px;
  font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  color:var(--tx-400,hsl(var(--muted-foreground))); background:var(--bg-surface,hsl(var(--secondary)));
  border-bottom:1px solid var(--bd-100,hsl(var(--border))); white-space:nowrap; text-align:left;
}
.fno-table thead th.r, .fno-table tbody td.r { text-align:right; }
.fno-table thead th.c, .fno-table tbody td.c { text-align:center; }
.fno-table tbody tr { transition:background var(--dur-fast,120ms); }
.fno-table tbody tr:hover { background:var(--bg-hover,hsl(var(--accent))); }
.fno-table tbody td {
  padding:12px 14px; font-size:12.5px; color:var(--tx-500,hsl(var(--muted-foreground)));
  border-bottom:1px solid var(--bd-50,hsl(var(--border))); vertical-align:middle; white-space:nowrap;
}
.fno-table tbody tr:last-child td { border-bottom:none; }
.fno-symbol { font-size:13px; font-weight:700; color:var(--tx-900,hsl(var(--foreground))); letter-spacing:-.01em; }
.fno-expiry { font-size:10px; color:var(--tx-400,hsl(var(--muted-foreground))); margin-top:2px; font-weight:500; }
.fno-expiry-date { font-size:12px; color:var(--tx-700,hsl(var(--foreground))); font-weight:600; }
.fno-cell-sub { font-size:10px; color:var(--tx-400,hsl(var(--muted-foreground))); margin-top:2px; font-variant-numeric:tabular-nums; }
.fno-price, .fno-ltp, .fno-pnl, .fno-pnl-sub { font-family:var(--ff-mono,'DM Mono',monospace); font-variant-numeric:tabular-nums; }
.fno-price { font-size:12.5px; color:var(--tx-700,hsl(var(--foreground))); font-weight:500; }
.fno-ltp { font-size:12.5px; font-weight:600; color:var(--accent,hsl(var(--primary))); }
.fno-ltp.live::before { content:''; display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--green,hsl(var(--profit))); margin-right:4px; vertical-align:middle; }
.fno-pnl { font-size:13px; font-weight:700; }
.fno-pnl-sub { font-size:10px; margin-top:2px; }
.fno-pnl.pos, .fno-pnl-sub.pos { color:var(--green,hsl(var(--profit))); }
.fno-pnl.neg, .fno-pnl-sub.neg { color:var(--red,hsl(var(--loss))); }

/* Badges */
.fno-badge, .fno-status {
  display:inline-flex; align-items:center; justify-content:center; white-space:nowrap;
  font-size:10px; font-weight:700; border:1px solid transparent;
}
.fno-badge { min-width:34px; padding:3px 8px; border-radius:var(--r-sm,8px); letter-spacing:.05em; }
.fno-badge-CE { background:var(--green-bg,hsl(var(--profit)/.08)); color:var(--green,hsl(var(--profit))); border-color:var(--green-bd,hsl(var(--profit)/.22)); }
.fno-badge-PE { background:var(--red-bg,hsl(var(--loss)/.07)); color:var(--red,hsl(var(--loss))); border-color:var(--red-bd,hsl(var(--loss)/.22)); }
.fno-badge-FUT, .fno-status-open { background:var(--accent-dim,hsl(var(--accent))); color:var(--accent,hsl(var(--accent-foreground))); border-color:var(--accent-bd,hsl(var(--border))); }
.fno-status { gap:5px; padding:3px 10px; border-radius:999px; }
.fno-status-profit { background:var(--green-bg,hsl(var(--profit)/.08)); color:var(--green,hsl(var(--profit))); border-color:var(--green-bd,hsl(var(--profit)/.22)); }
.fno-status-loss { background:var(--red-bg,hsl(var(--loss)/.07)); color:var(--red,hsl(var(--loss))); border-color:var(--red-bd,hsl(var(--loss)/.22)); }
.fno-status-exp { background:var(--bg-surface,hsl(var(--secondary))); color:var(--tx-500,hsl(var(--muted-foreground))); border-color:var(--bd-100,hsl(var(--border))); }

/* Actions */
.fno-actions { display:flex; gap:5px; }
.fno-act-btn {
  width:30px; height:30px; border-radius:var(--r-sm,8px);
  border:1px solid var(--bd-50,hsl(var(--border))); background:transparent;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  color:var(--tx-400,hsl(var(--muted-foreground)));
  transition:background var(--dur-fast,120ms), color var(--dur-fast,120ms), border-color var(--dur-fast,120ms);
}
.fno-act-btn:hover { background:var(--red-bg,hsl(var(--loss)/.07)); border-color:var(--red-bd,hsl(var(--loss)/.22)); color:var(--red,hsl(var(--loss))); }
.fno-act-btn.fno-edit-btn { color:var(--tx-500,hsl(var(--muted-foreground))); }
.fno-act-btn.fno-edit-btn:hover { background:var(--accent-dim,hsl(var(--accent))); border-color:var(--accent-bd,hsl(var(--ring))); color:var(--accent,hsl(var(--primary))); }

/* Buttons */
.fno-add-btn, .fno-refresh-btn, .fno-btn-primary, .fno-btn-ghost {
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  min-height:36px; padding:8px 14px; border-radius:var(--r-sm,8px);
  font-size:12px; font-weight:600; cursor:pointer;
  transition:background var(--dur-fast,120ms), color var(--dur-fast,120ms), border-color var(--dur-fast,120ms), transform var(--dur-fast,120ms) var(--ease-out);
}
.fno-add-btn, .fno-btn-primary {
  background:var(--accent-fill,hsl(var(--primary))); color:var(--fno-accent-ink,hsl(var(--primary-foreground)));
  border:1px solid var(--accent-fill,hsl(var(--primary))); box-shadow:var(--sh-1,none);
}
.fno-add-btn:hover, .fno-btn-primary:hover { filter:brightness(1.06); transform:translateY(-1px); }
.fno-refresh-btn, .fno-btn-ghost {
  background:var(--bg-surface,hsl(var(--secondary))); color:var(--tx-700,hsl(var(--foreground)));
  border:1px solid var(--bd-100,hsl(var(--border)));
}
.fno-refresh-btn:hover, .fno-btn-ghost:hover { background:var(--accent-dim,hsl(var(--accent))); border-color:var(--accent-bd,hsl(var(--ring))); color:var(--accent,hsl(var(--accent-foreground))); }
.fno-add-btn:disabled, .fno-refresh-btn:disabled, .fno-btn-primary:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.fno-btn-primary { min-height:38px; padding:9px 20px; font-size:13px; }
.fno-btn-ghost { min-height:38px; padding:9px 20px; font-size:13px; background:transparent; }
.fno-btn-danger { background:var(--red,hsl(var(--destructive))); color:hsl(var(--destructive-foreground)); border-color:var(--red,hsl(var(--destructive))); }
.fno-btn-danger:hover { background:var(--red,hsl(var(--destructive))); color:hsl(var(--destructive-foreground)); filter:brightness(1.06); }

/* Empty state */
.fno-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:56px 20px; gap:12px; }
.fno-empty-icon { width:48px; height:48px; border-radius:var(--r-md,12px); background:var(--accent-dim,hsl(var(--accent))); border:1px solid var(--accent-bd,hsl(var(--border))); display:flex; align-items:center; justify-content:center; font-size:22px; }
.fno-empty-title { font-size:15px; font-weight:700; color:var(--tx-900,hsl(var(--foreground))); }
.fno-empty-sub { font-size:12.5px; color:var(--tx-500,hsl(var(--muted-foreground))); text-align:center; max-width:340px; line-height:1.6; }

/* Radix Dialog / AlertDialog surfaces */
.fno-modal, .fno-alert {
  --fno-accent-ink:hsl(var(--primary-foreground));
  background:var(--bg-solid,hsl(var(--popover))); color:var(--tx-700,hsl(var(--popover-foreground)));
  border-color:var(--bd-100,hsl(var(--border))); box-shadow:var(--sh-3,0 24px 64px hsl(var(--foreground)/.16));
}
.fno-modal { max-width:560px; padding:0; gap:0; border-radius:var(--r-lg,16px); }
.fno-alert { max-width:440px; border-radius:var(--r-lg,16px); }
.fno-modal-head { padding:20px 52px 16px 22px; border-bottom:1px solid var(--bd-50,hsl(var(--border))); background:var(--bg-surface,hsl(var(--secondary))); text-align:left; }
.fno-modal-title { font-size:16px; font-weight:700; color:var(--tx-900,hsl(var(--popover-foreground))); letter-spacing:-.02em; }
.fno-modal-description { margin-top:5px; font-size:12px; line-height:1.5; color:var(--tx-500,hsl(var(--muted-foreground))); }
.fno-modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:16px; }
.fno-modal-footer { padding:14px 22px; border-top:1px solid var(--bd-50,hsl(var(--border))); display:flex; flex-direction:row; gap:10px; justify-content:flex-end; background:var(--bg-surface,hsl(var(--secondary))); }
.fno-alert-title { color:var(--tx-900,hsl(var(--popover-foreground))); }
.fno-alert-description { color:var(--tx-500,hsl(var(--muted-foreground))); line-height:1.6; }
.fno-alert-footer { gap:8px; }

/* Form */
.fno-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
.fno-field-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.fno-label { font-size:11.5px; font-weight:600; color:var(--tx-500,hsl(var(--muted-foreground))); letter-spacing:.01em; }
.fno-label span { color:var(--red,hsl(var(--destructive))); margin-left:2px; }
.fno-input, .fno-select {
  width:100%; min-height:40px; padding:9px 12px; border:1px solid var(--bd-100,hsl(var(--input)));
  border-radius:var(--r-sm,8px); font-size:13px; color:var(--tx-900,hsl(var(--foreground)));
  background:var(--bg-surface,hsl(var(--secondary))); font-family:inherit; outline:none;
  transition:border-color var(--dur-fast,120ms), background var(--dur-fast,120ms), box-shadow var(--dur-fast,120ms);
}
.fno-input:focus, .fno-select:focus { border-color:var(--accent,hsl(var(--ring))); background:var(--bg-solid,hsl(var(--card))); box-shadow:0 0 0 3px var(--accent-dim,hsl(var(--accent))); }
.fno-input::placeholder { color:var(--tx-300,hsl(var(--muted-foreground))); }
.fno-input[type='number'] { font-variant-numeric:tabular-nums; }
.fno-select { cursor:pointer; }
.fno-hint { font-size:10.5px; color:var(--tx-400,hsl(var(--muted-foreground))); }
.fno-seg { display:flex; gap:5px; }
.fno-seg-btn {
  flex:1; min-height:38px; padding:8px; border-radius:var(--r-sm,8px);
  border:1px solid var(--bd-100,hsl(var(--border))); font-size:12px; font-weight:600;
  cursor:pointer; font-family:inherit; background:var(--bg-surface,hsl(var(--secondary)));
  color:var(--tx-500,hsl(var(--muted-foreground))); text-align:center;
  transition:background var(--dur-fast,120ms), color var(--dur-fast,120ms), border-color var(--dur-fast,120ms);
}
.fno-seg-btn:hover { border-color:var(--accent,hsl(var(--ring))); color:var(--accent,hsl(var(--primary))); }
.fno-seg-btn.on { background:var(--accent-dim,hsl(var(--accent))); border-color:var(--accent-bd,hsl(var(--ring))); color:var(--accent,hsl(var(--accent-foreground))); }
.fno-seg-btn.CE.on { background:var(--green-bg,hsl(var(--profit)/.08)); border-color:var(--green-bd,hsl(var(--profit)/.22)); color:var(--green,hsl(var(--profit))); }
.fno-seg-btn.PE.on { background:var(--red-bg,hsl(var(--loss)/.07)); border-color:var(--red-bd,hsl(var(--loss)/.22)); color:var(--red,hsl(var(--loss))); }
.fno-lot-hint { padding:9px 12px; background:var(--accent-dim,hsl(var(--accent))); border:1px solid var(--accent-bd,hsl(var(--border))); border-radius:var(--r-sm,8px); font-size:11.5px; color:var(--accent,hsl(var(--accent-foreground))); font-weight:500; }
.fno-preview { background:var(--bg-surface,hsl(var(--secondary))); border:1px solid var(--bd-50,hsl(var(--border))); border-radius:var(--r-md,12px); padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fno-preview-item { text-align:center; min-width:0; }
.fno-preview-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--tx-400,hsl(var(--muted-foreground))); margin-bottom:4px; }
.fno-preview-val { font-family:var(--ff-mono,'DM Mono',monospace); font-size:14px; font-weight:700; color:var(--tx-900,hsl(var(--foreground))); font-variant-numeric:tabular-nums; }
.fno-preview-val.pos { color:var(--green,hsl(var(--profit))); }
.fno-preview-val.neg { color:var(--red,hsl(var(--loss))); }

@keyframes fno-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes fno-spin { to { transform:rotate(360deg); } }
.fno-live-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--green,hsl(var(--profit))); animation:fno-pulse 2s infinite; vertical-align:middle; margin-right:4px; }
.fno-spinning { animation:fno-spin .8s linear infinite; }

/* Pinned instrument column while the wide table scrolls (matches the dashboard
   tables). Backgrounds layer the row's translucent state over the solid surface
   so scrolled cells never show through. !important beats the .zf-tab-panel
   th/td reskin in dashboard.css, which would otherwise make the pin translucent. */
@media (max-width:768px) {
  .fno-table .fno-pin {
    position:sticky; left:0; z-index:1;
    background:var(--bg-solid,hsl(var(--card))) !important;
    box-shadow:1px 0 0 var(--bd-100,hsl(var(--border)));
  }
  .fno-table thead th.fno-pin {
    z-index:3;
    background:linear-gradient(var(--bg-surface,hsl(var(--secondary))),var(--bg-surface,hsl(var(--secondary)))),var(--bg-solid,hsl(var(--card))) !important;
  }
  .fno-table tbody tr:hover > .fno-pin {
    background:linear-gradient(var(--bg-hover,hsl(var(--accent))),var(--bg-hover,hsl(var(--accent)))),var(--bg-solid,hsl(var(--card))) !important;
  }
}
@media (max-width:720px) {
  .fno-toolbar { align-items:stretch; flex-direction:column; gap:12px; padding:12px 14px; }
  .fno-toolbar-right { display:grid; grid-template-columns:1fr 1fr; width:100%; }
  .fno-summary { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:12px 14px; }
  .fno-sum-card { padding:11px 12px; }
  .fno-sum-val { font-size:17px; }
  .fno-filter-row { padding:9px 14px; scrollbar-width:thin; }
}
@media (max-width:560px) {
  .fno-modal { width:calc(100% - 1rem); max-height:calc(100dvh - 1rem); }
  .fno-modal-head { padding:18px 48px 14px 16px; }
  .fno-modal-body { padding:16px; gap:14px; }
  .fno-modal-footer { padding:12px 16px; }
  .fno-field-row { grid-template-columns:1fr; }
  .fno-preview { flex-wrap:wrap; }
  .fno-preview-item { flex:1 1 30%; }
  .fno-alert { width:calc(100% - 2rem); }
}
@media (prefers-reduced-motion:reduce) {
  .fno-wrap *, .fno-modal *, .fno-alert * { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
}
`;

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 100000) return `â‚¹${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `â‚¹${(n / 1000).toFixed(1)}K`;
  return `â‚¹${n.toFixed(0)}`;
}
function fmtP(n: number) { return n.toFixed(2); }
function sign(n: number) { return n >= 0 ? "+" : "âˆ’"; }
function uid() { return "fno-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7); }

interface ModalProps {
  initial?: FnOTrade | null;
  onSave: (t: FnOTrade) => void;
  onClose: () => void;
}

function FnOModal({ initial, onSave, onClose }: ModalProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    symbol: initial?.symbol ?? "",
    instrumentType: initial?.instrumentType ?? "FUT" as FnOInstrumentType,
    strike: initial?.strike?.toString() ?? "",
    expiry: initial?.expiry ?? "",
    lots: initial?.lots?.toString() ?? "1",
    lotSize: initial?.lotSize?.toString() ?? "",
    entryPrice: initial?.entryPrice?.toString() ?? "",
    exitPrice: initial?.exitPrice?.toString() ?? "",
    entryDate: initial?.entryDate ?? new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").reverse().join("-"),
    exitDate: initial?.exitDate ?? "",
    status: initial?.status ?? "Open" as FnOStatus,
    notes: initial?.notes ?? "",
  });

  const handleSymbol = (val: string) => {
    const up = val.toUpperCase();
    const ls = getLotSize(up);
    setForm(p => ({ ...p, symbol: up, lotSize: ls.toString() }));
  };
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const lots = parseFloat(form.lots) || 0;
  const lotSize = parseFloat(form.lotSize) || 0;
  const entryP = parseFloat(form.entryPrice) || 0;
  const exitP = parseFloat(form.exitPrice) || 0;
  const premium = entryP * lots * lotSize;
  const estPnl = exitP > 0
    ? (form.instrumentType === "PE"
      ? (entryP - exitP) * lots * lotSize
      : (exitP - entryP) * lots * lotSize)
    : 0;

  const valid = form.symbol && form.expiry && form.lots && form.lotSize && form.entryPrice &&
    (form.instrumentType === "FUT" || form.strike);

  const handleSave = () => {
    if (!valid) return;
    const t: FnOTrade = {
      id: initial?.id ?? uid(),
      symbol: form.symbol,
      instrumentType: form.instrumentType,
      strike: form.strike ? parseFloat(form.strike) : undefined,
      expiry: form.expiry,
      lotSize: parseFloat(form.lotSize),
      lots: parseFloat(form.lots),
      entryPrice: parseFloat(form.entryPrice),
      exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : undefined,
      entryDate: form.entryDate,
      exitDate: form.exitDate || undefined,
      status: form.status,
      notes: form.notes || undefined,
    };
    onSave(t);
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="fno-modal">
        <DialogHeader className="fno-modal-head">
          <DialogTitle className="fno-modal-title">{isEdit ? "Edit F&O Trade" : "Add F&O Trade"}</DialogTitle>
          <DialogDescription className="fno-modal-description">
            {isEdit ? "Update the details of this F&O position." : "Record a futures or options position and its trade details."}
          </DialogDescription>
        </DialogHeader>
        <div className="fno-modal-body">
          <div className="fno-field">
            <span className="fno-label" id="fno-instrument-label">Instrument Type<span>*</span></span>
            <div className="fno-seg" role="group" aria-labelledby="fno-instrument-label">
              {(["FUT", "CE", "PE"] as FnOInstrumentType[]).map(t => (
                <button key={t} type="button" aria-pressed={form.instrumentType === t}
                  className={`fno-seg-btn ${t} ${form.instrumentType === t ? "on" : ""}`}
                  onClick={() => f("instrumentType", t)}>
                  {t === "FUT" ? "Futures" : t === "CE" ? "Call (CE)" : "Put (PE)"}
                </button>
              ))}
            </div>
          </div>

          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-symbol">Symbol<span>*</span></label>
              <input id="fno-symbol" className="fno-input" placeholder="RELIANCE" value={form.symbol}
                onChange={e => handleSymbol(e.target.value)} style={{ textTransform: "uppercase" }} />
            </div>
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-expiry">Expiry Date<span>*</span></label>
              <input id="fno-expiry" className="fno-input" placeholder="27-03-2025" value={form.expiry}
                onChange={e => f("expiry", e.target.value)} aria-describedby="fno-expiry-hint" />
              <span className="fno-hint" id="fno-expiry-hint">DD-MM-YYYY</span>
            </div>
          </div>

          {form.instrumentType !== "FUT" && (
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-strike">Strike Price<span>*</span></label>
              <input id="fno-strike" className="fno-input" placeholder="e.g. 2500" type="number" value={form.strike}
                onChange={e => f("strike", e.target.value)} />
            </div>
          )}

          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-lots">Lots<span>*</span></label>
              <input id="fno-lots" className="fno-input" placeholder="1" type="number" min="1" value={form.lots}
                onChange={e => f("lots", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-lot-size">Lot Size<span>*</span></label>
              <input id="fno-lot-size" className="fno-input" placeholder="250" type="number" value={form.lotSize}
                onChange={e => f("lotSize", e.target.value)} />
            </div>
          </div>

          {form.symbol && LOT_SIZES[form.symbol] && (
            <div className="fno-lot-hint">
              NSE lot size for {form.symbol} = <strong>{LOT_SIZES[form.symbol]}</strong> units
            </div>
          )}

          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-entry-price">{form.instrumentType === "FUT" ? "Entry Price (â‚¹)" : "Entry Premium (â‚¹)"}<span>*</span></label>
              <input id="fno-entry-price" className="fno-input" placeholder="0.00" type="number" step="0.05" value={form.entryPrice}
                onChange={e => f("entryPrice", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-entry-date">Entry Date</label>
              <input id="fno-entry-date" className="fno-input" type="date" value={form.entryDate?.split("-").reverse().join("-")}
                onChange={e => f("entryDate", e.target.value.split("-").reverse().join("-"))} />
            </div>
          </div>

          <div className="fno-field-row">
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-exit-price">{form.instrumentType === "FUT" ? "Exit Price (â‚¹)" : "Exit Premium (â‚¹)"}</label>
              <input id="fno-exit-price" className="fno-input" placeholder="Leave blank if still open" type="number" step="0.05" value={form.exitPrice}
                onChange={e => f("exitPrice", e.target.value)} />
            </div>
            <div className="fno-field">
              <label className="fno-label" htmlFor="fno-exit-date">Exit Date</label>
              <input id="fno-exit-date" className="fno-input" type="date" value={form.exitDate?.split("-").reverse().join("-")}
                onChange={e => f("exitDate", e.target.value ? e.target.value.split("-").reverse().join("-") : "")} />
            </div>
          </div>

          <div className="fno-field">
            <label className="fno-label" htmlFor="fno-status">Status</label>
            <select id="fno-status" className="fno-select" value={form.status} onChange={e => f("status", e.target.value)}>
              <option value="Open">Open</option>
              <option value="Closed Profit">Closed â€” Profit</option>
              <option value="Closed Loss">Closed â€” Loss</option>
              <option value="Expired">Expired (worthless)</option>
            </select>
          </div>

          <div className="fno-field">
            <label className="fno-label" htmlFor="fno-notes">Notes / Trade Reason</label>
            <input id="fno-notes" className="fno-input" placeholder="e.g. Positional long on breakout" value={form.notes}
              onChange={e => f("notes", e.target.value)} />
          </div>

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
                  <div className={`fno-preview-val ${estPnl >= 0 ? "pos" : "neg"}`}>
                    {estPnl >= 0 ? "+" : "âˆ’"}{fmt(Math.abs(estPnl))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="fno-modal-footer">
          <button type="button" className="fno-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="fno-btn-primary" onClick={handleSave} disabled={!valid}>
            {isEdit ? "Save Changes" : "Add Trade"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: FnOStatus }) {
  const cfg = {
    "Open": { cls: "fno-status-open", icon: <Clock size={11} />, label: "Open" },
    "Closed Profit": { cls: "fno-status-profit", icon: <CheckCircle2 size={11} />, label: "Profit" },
    "Closed Loss": { cls: "fno-status-loss", icon: <XCircle size={11} />, label: "Loss" },
    "Expired": { cls: "fno-status-exp", icon: <AlertCircle size={11} />, label: "Expired" },
  }[status];
  return <span className={`fno-status ${cfg.cls}`}>{cfg.icon}{cfg.label}</span>;
}

export default function FnOTable({ trades, onUpdate }: Props) {
  const market = useMarketStatus();
  const [filter, setFilter] = useState<"ALL" | FnOInstrumentType | "Open" | "Closed">("ALL");
  const [showModal, setShowModal] = useState(false);
  const [editTrade, setEditTrade] = useState<FnOTrade | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FnOTrade | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ltpMap, setLtpMap] = useState<Record<string, number>>({});
  const [ltpSource, setLtpSource] = useState<string>("");

  const fetchLivePrices = useCallback(async () => {
    const openTrades = trades.filter(t => t.status === "Open");
    if (openTrades.length === 0) return;
    setRefreshing(true);
    try {
      const payload = openTrades.map(t => ({
        id: t.id,
        symbol: t.symbol,
        instrumentType: t.instrumentType,
        strike: t.strike,
        expiry: t.expiry,
        lotSize: t.lotSize,
        lots: t.lots,
      }));
      const res = await apiFetch("/api/fno-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades: payload }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ltpMap) {
        const newMap: Record<string, number> = {};
        for (const [id, priceObj] of Object.entries(data.ltpMap as Record<string, LivePrice>)) {
          if (priceObj?.ltp > 0) newMap[id] = priceObj.ltp;
        }
        setLtpMap(newMap);
        setLtpSource(data.source ?? "");
        onUpdate(trades.map(t => {
          const p = (data.ltpMap as Record<string, LivePrice>)[t.id];
          if (t.status === "Open" && p?.ltp > 0) {
            return {
              ...t,
              ltp: p.ltp,
              dayChange: p.change ?? t.dayChange,
              iv: p.iv ?? t.iv,
              delta: p.delta ?? t.delta,
            };
          }
          return t;
        }));
      }
    } catch { /* silently fail */ }
    finally { setRefreshing(false); }
  }, [onUpdate, trades]);

  useEffect(() => {
    fetchLivePrices();
    const id = setInterval(fetchLivePrices, market.isOpen ? 60_000 : 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchLivePrices, market.isOpen]);

  const addTrade = (t: FnOTrade) => {
    onUpdate([...trades, t]);
    setShowModal(false);
  };
  const saveTrade = (t: FnOTrade) => {
    onUpdate(trades.map(x => x.id === t.id ? t : x));
    setEditTrade(null);
  };
  const deleteTrade = (id: string) => {
    onUpdate(trades.filter(t => t.id !== id));
  };

  const filtered = trades.filter(t => {
    if (filter === "ALL") return true;
    if (filter === "Open") return t.status === "Open";
    if (filter === "Closed") return t.status !== "Open";
    return t.instrumentType === filter;
  });

  const open = trades.filter(t => t.status === "Open");
  const closed = trades.filter(t => t.status !== "Open");
  const openPnl = open.reduce((s, t) => s + calcFnOPnL(t), 0);
  const closePnl = closed.reduce((s, t) => s + calcFnOPnL(t), 0);
  const totalPremium = open.reduce((s, t) => s + calcFnOInvested(t), 0);
  const winCount = closed.filter(t => calcFnOPnL(t) > 0).length;
  const winRate = closed.length > 0 ? winCount / closed.length * 100 : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="fno-wrap">
        <div className="fno-toolbar">
          <div className="fno-toolbar-left">
            <div>
              <div className="fno-title">F&O Positions</div>
              <div className="fno-sub-text">{open.length} open Â· {closed.length} closed Â· All values in â‚¹ INR</div>
            </div>
          </div>
          <div className="fno-toolbar-right">
            <button type="button" className="fno-refresh-btn" onClick={fetchLivePrices} disabled={refreshing}
              title={ltpSource ? "Last source: " + ltpSource + ". Fetches live option premiums via Upstox NFO keys, futures via Upstox/Yahoo." : "Fetches live option premiums (CE/PE) via Upstox and futures prices via Upstox/Yahoo."}>
              <RefreshCw size={13} className={refreshing ? "fno-spinning" : ""} />
              {refreshing ? "Updatingâ€¦" : ltpSource ? "Live âœ“" : "Refresh LTP"}
            </button>
            <button type="button" className="fno-add-btn" onClick={() => setShowModal(true)}>
              <Plus size={14} /> Add Trade
            </button>
          </div>
        </div>

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
          <div className={`fno-sum-card ${winRate < 50 ? "amber" : ""}`}>
            <div className="fno-sum-lbl">F&O Win Rate</div>
            <div className="fno-sum-val">{winRate.toFixed(0)}%</div>
            <div className="fno-sum-sub">{winCount}/{closed.length} profitable</div>
          </div>
        </div>

        <div className="fno-filter-row" role="group" aria-label="Filter F&O trades">
          {(["ALL", "Open", "Closed", "FUT", "CE", "PE"] as const).map(f => (
            <button key={f} type="button" aria-pressed={filter === f}
              className={`fno-chip ${f !== "ALL" && f !== "Open" && f !== "Closed" ? f.toLowerCase() : ""} ${filter === f ? "on" : ""}`}
              onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : f === "FUT" ? "Futures" : f === "CE" ? "Call Options" : f === "PE" ? "Put Options" : f}
              {f === "Open" && <span className="fno-count">{open.length}</span>}
              {f === "Closed" && <span className="fno-count">{closed.length}</span>}
            </button>
          ))}
        </div>

        <div className="fno-table-wrap">
          {filtered.length === 0 ? (
            <div className="fno-empty">
              <div className="fno-empty-icon">ðŸ“Š</div>
              <div className="fno-empty-title">No F&O trades found</div>
              <div className="fno-empty-sub">
                {filter === "ALL"
                  ? "Add your first F&O trade using the button above. Supports futures and options on NSE stocks."
                  : `No ${filter} trades. Try a different filter or add a new trade.`}
              </div>
              <button type="button" className="fno-add-btn" onClick={() => setShowModal(true)}>
                <Plus size={14} /> Add your first F&O trade
              </button>
            </div>
          ) : (
            <table className="fno-table">
              <thead>
                <tr>
                  <th className="fno-pin">Instrument</th>
                  <th className="c">Type</th>
                  <th className="r">Strike</th>
                  <th>Expiry</th>
                  <th className="r">Lots Ã— Size</th>
                  <th className="r">Entry (â‚¹)</th>
                  <th className="r">LTP (â‚¹)</th>
                  <th className="r">P&L (â‚¹)</th>
                  <th className="c">Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const ltp = t.ltp ?? t.exitPrice ?? t.entryPrice;
                  const pnl = calcFnOPnL(t);
                  const pnlPct = t.entryPrice > 0 ? pnl / (t.entryPrice * t.lots * t.lotSize) * 100 : 0;
                  const pos = pnl >= 0;
                  const hasLive = market.isOpen && t.status === "Open" && !!ltpMap[t.id];

                  return (
                    <tr key={t.id}>
                      <td className="fno-pin">
                        <div className="fno-symbol">{t.symbol}</div>
                        {t.notes && <div className="fno-expiry" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{t.notes}</div>}
                      </td>
                      <td className="c"><span className={`fno-badge fno-badge-${t.instrumentType}`}>{t.instrumentType}</span></td>
                      <td className="r"><span className="fno-price">{t.strike ? `â‚¹${t.strike.toLocaleString("en-IN")}` : "â€”"}</span></td>
                      <td><span className="fno-expiry fno-expiry-date">{fmtExpiry(t.expiry)}</span></td>
                      <td className="r">
                        <span className="fno-price">{t.lots} Ã— {t.lotSize.toLocaleString("en-IN")}</span>
                        <div className="fno-cell-sub">{(t.lots * t.lotSize).toLocaleString("en-IN")} units</div>
                      </td>
                      <td className="r">
                        <span className="fno-price">â‚¹{fmtP(t.entryPrice)}</span>
                        <div className="fno-cell-sub">{fmt(t.entryPrice * t.lots * t.lotSize)}</div>
                      </td>
                      <td className="r">
                        <span className={`fno-ltp ${hasLive ? "live" : ""}`}>
                          {hasLive && <span className="fno-live-dot" />}
                          â‚¹{fmtP(ltp)}
                        </span>
                        {t.iv && <div className="fno-cell-sub">IV {t.iv.toFixed(1)}% {t.delta ? `Â· Î” ${t.delta.toFixed(2)}` : ""}</div>}
                      </td>
                      <td className="r">
                        <div className={`fno-pnl ${pos ? "pos" : "neg"}`}>{sign(pnl)}{fmt(Math.abs(pnl))}</div>
                        <div className={`fno-pnl-sub ${pos ? "pos" : "neg"}`}>{sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%</div>
                      </td>
                      <td className="c"><StatusBadge status={t.status} /></td>
                      <td>
                        <div className="fno-actions">
                          <button type="button" className="fno-act-btn fno-edit-btn" aria-label={`Edit ${t.symbol} trade`} title={`Edit ${t.symbol} trade`} onClick={() => setEditTrade(t)}>
                            <Edit2 size={12} />
                          </button>
                          <button type="button" className="fno-act-btn" aria-label={`Delete ${t.symbol} trade`} title={`Delete ${t.symbol} trade`} onClick={() => setDeleteTarget(t)}>
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

      {showModal && <FnOModal onSave={addTrade} onClose={() => setShowModal(false)} />}
      {editTrade && <FnOModal initial={editTrade} onSave={saveTrade} onClose={() => setEditTrade(null)} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={openState => { if (!openState) setDeleteTarget(null); }}>
        <AlertDialogContent className="fno-alert">
          <AlertDialogHeader>
            <AlertDialogTitle className="fno-alert-title">Delete F&amp;O trade?</AlertDialogTitle>
            <AlertDialogDescription className="fno-alert-description">
              Delete the {deleteTarget?.symbol} {deleteTarget?.instrumentType} position? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="fno-alert-footer">
            <AlertDialogCancel className="fno-btn-ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction className="fno-btn-primary fno-btn-danger" onClick={() => { if (deleteTarget) deleteTrade(deleteTarget.id); }}>
              Delete trade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
