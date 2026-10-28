import type { CSSProperties, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Plus, Upload, type LucideIcon } from "lucide-react";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportTradesDialog from "@/components/ImportTradesDialog";
import type { PortfolioStock } from "@/data/sampleData";
import type { Tone } from "@/lib/dashboard/format";

/** Placeholder with the final size of the value it stands in for (no layout shift). */
export function Skel({ w = "60%", h = "1em" }: { w?: string | number; h?: string | number }) {
  const style: CSSProperties = { width: w, height: h };
  return <span className="zf-skel" style={style} aria-hidden="true" />;
}

/** Delta pill. The arrow and the sign in `children` carry direction; colour is secondary. */
export function DeltaPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = tone === "up" ? ArrowUpRight : tone === "down" ? ArrowDownRight : Minus;
  return (
    <span className={`zf-delta zf-delta-${tone}`}>
      <Icon size={12} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon, title, children, actions,
}: { icon: LucideIcon; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="zf-empty-state">
      <span className="zf-empty-icon" aria-hidden="true"><Icon /></span>
      <p className="zf-empty-title">{title}</p>
      {children && <p className="zf-empty-body">{children}</p>}
      {actions && <div className="zf-empty-actions">{actions}</div>}
    </div>
  );
}

/** The two portfolio actions, wired to the existing dialogs. */
export function AddTradeButton({ onAdd, variant = "primary" }: { onAdd: (stock: PortfolioStock) => void; variant?: "primary" | "outline" }) {
  return (
    <AddTransactionDialog
      onAdd={onAdd}
      trigger={
        <button type="button" className={`zf-btn zf-btn-${variant}`}>
          <Plus aria-hidden="true" /> Add trade
        </button>
      }
    />
  );
}

export function ImportButton({ onImport, variant = "outline" }: { onImport: (stocks: PortfolioStock[]) => void; variant?: "primary" | "outline" }) {
  return (
    <ImportTradesDialog
      onImport={onImport}
      trigger={
        <button type="button" className={`zf-btn zf-btn-${variant}`}>
          <Upload aria-hidden="true" /> Import
        </button>
      }
    />
  );
}
