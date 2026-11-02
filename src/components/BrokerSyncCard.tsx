import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, RefreshCw, Unlink } from "lucide-react";
import { useBrokerSync } from "@/hooks/useBrokerSync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { HoldingChange, PreviewResult } from "@/lib/broker/types";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const shareCount = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

const timestamp = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown time";
  return new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const describeSide = (side: HoldingChange["before"]): string =>
  side ? `${shareCount.format(side.quantity)} @ ₹${inr.format(side.averagePrice)}` : "—";

const ChangeRow = ({ change, kind }: { change: HoldingChange; kind: "open" | "closed" }) => {
  const action = change.before === null
    ? "Add"
    : change.after === null
      ? "Remove"
      : kind === "closed"
        ? "Recompute"
        : "Update";

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/60 py-1.5 last:border-0">
      <span className="font-mono text-xs font-semibold text-foreground">{change.ticker}</span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {describeSide(change.before)} → {describeSide(change.after)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{action}</span>
    </li>
  );
};

interface PreviewPanelProps {
  preview: PreviewResult;
  busy: boolean;
  /** The saved token expired or broker sync is not configured: nothing may be applied. */
  locked: boolean;
  onApply: (confirmEmpty: boolean) => Promise<void>;
}

const PreviewPanel = ({ preview, busy, locked, onApply }: PreviewPanelProps) => {
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    setConfirmEmpty(false);
  }, [preview.generatedAt]);

  const limit = preview.conflicts.some((conflict) => conflict.code === "limit");
  const canApply = !busy && !limit && !locked && (!preview.requiresEmptyConfirmation || confirmEmpty);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">Preview</h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {timestamp(preview.generatedAt)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span>{preview.holdingsSeen} holdings read</span>
        <span>{preview.executionsSeen} executions read</span>
        <span>{preview.executionsAdded} new</span>
        <span>{preview.unchangedPositions} unchanged</span>
      </div>

      {preview.openPositions.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Open positions
          </h4>
          <ul aria-label="Open position changes">
            {preview.openPositions.map((change) => (
              <ChangeRow key={`open-${change.ticker}`} change={change} kind="open" />
            ))}
          </ul>
        </div>
      )}

      {preview.closedPositions.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Closed positions
          </h4>
          <ul aria-label="Closed position changes">
            {preview.closedPositions.map((change) => (
              <ChangeRow key={`closed-${change.ticker}`} change={change} kind="closed" />
            ))}
          </ul>
        </div>
      )}

      {preview.conflicts.length > 0 && (
        <ul aria-label="Sync conflicts" className="space-y-1 text-[11px] text-muted-foreground">
          {preview.conflicts.map((conflict, index) => (
            <li key={`${conflict.code}-${conflict.ticker ?? index}`}>
              <span className="font-semibold text-foreground">{conflict.ticker ?? "Portfolio"}</span>
              {" · "}
              {conflict.detail}
            </li>
          ))}
        </ul>
      )}

      {preview.unmatched.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Not imported from the broker
          </h4>
          <ul aria-label="Unmatched broker rows" className="space-y-1 text-[11px] text-muted-foreground">
            {preview.unmatched.map((row) => (
              <li key={row.brokerRef}>
                <span className="font-mono text-foreground">{row.ticker || row.brokerRef}</span>
                {" · "}
                {row.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.warnings.length > 0 && (
        <ul aria-label="Sync warnings" className="space-y-1 text-[11px] text-muted-foreground">
          {preview.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      )}

      {limit && (
        <p className="text-[11px] font-medium text-destructive">
          This preview exceeds a storage limit and cannot be applied. Move or remove rows, then preview again.
        </p>
      )}

      {preview.requiresEmptyConfirmation && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="broker-confirm-empty"
            checked={confirmEmpty}
            onCheckedChange={(checked) => setConfirmEmpty(checked === true)}
          />
          <label htmlFor="broker-confirm-empty" className="text-[11px] leading-relaxed text-muted-foreground">
            The broker returned no holdings. I understand that applying will remove every synced open position.
          </label>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs font-mono"
          disabled={!canApply}
          onClick={() => void onApply(preview.requiresEmptyConfirmation && confirmEmpty)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Apply changes
        </Button>
      </div>
    </div>
  );
};

interface BrokerSyncCardProps {
  userId: string;
  /** Called after a successful apply so the dashboard re-reads the snapshot. */
  onApplied?: () => void | Promise<void>;
}

const BrokerSyncCard = ({ userId, onApplied }: BrokerSyncCardProps) => {
  const sync = useBrokerSync(userId);
  const [token, setToken] = useState("");
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  useEffect(() => {
    setToken("");
    setUnlinkOpen(false);
  }, [userId]);

  const {
    connection, preview, applied, loading, busy, error, expired, disabled,
  } = sync;

  const showLinkForm = !disabled && (!connection || expired);

  const submitLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim() || busy) return;
    const linked = await sync.link(token);
    if (linked) setToken("");
  };

  const applyPreview = async (confirmEmpty: boolean) => {
    const result = await sync.apply(confirmEmpty);
    if (result) await onApplied?.();
  };

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="broker-sync-title" aria-busy={busy || loading}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-b border-border sm:px-5">
        <div>
          <h2 id="broker-sync-title" className="text-base font-semibold text-foreground tracking-tight">
            INDmoney sync
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Read-only · NSE holdings and trade book · values in ₹
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
        >
          {loading ? "Checking" : connection ? "Connected" : "Not linked"}
        </Badge>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {loading && <p role="status" className="text-xs text-muted-foreground">Checking the broker connection…</p>}

        {!loading && disabled && !error && (
          <p role="status" className="text-xs text-muted-foreground">
            Broker sync is not configured on this deployment. Nothing has been linked or changed.
          </p>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!loading && expired && connection && !error && (
          <p role="status" className="text-xs text-muted-foreground">
            The saved broker token expired. Paste a new 24-hour token to continue.
          </p>
        )}

        {!loading && connection && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>
                Token valid until <span className="text-foreground">{timestamp(connection.expiresAt)}</span>
              </span>
              <span>
                Last sync{" "}
                <span className="text-foreground">
                  {connection.syncedAt ? timestamp(connection.syncedAt) : "never"}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs font-mono"
                disabled={busy || expired || disabled}
                onClick={() => void sync.runPreview()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Preview sync
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs font-mono"
                disabled={busy}
                onClick={() => setUnlinkOpen(true)}
              >
                <Unlink className="h-3.5 w-3.5" />
                Unlink
              </Button>
            </div>
          </div>
        )}

        {!loading && showLinkForm && (
          <form onSubmit={submitLink} className="space-y-2">
            <label htmlFor="broker-token" className="block text-xs font-semibold text-foreground">
              INDstocks API token
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="broker-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                disabled={busy}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste the 24-hour token"
                className="h-9 font-mono text-xs sm:max-w-md"
                aria-describedby="broker-token-help"
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 gap-1.5 text-xs font-mono"
                disabled={!token.trim() || busy}
              >
                <Link2 className="h-3.5 w-3.5" />
                {busy ? "Checking token…" : "Link account"}
              </Button>
            </div>
            <p id="broker-token-help" className="text-[11px] leading-relaxed text-muted-foreground">
              Generate a 24-hour API token in INDstocks. It is validated now, encrypted on the server, and never
              stored in this browser in plaintext. Sync is read-only: manual rows are never changed.
            </p>
          </form>
        )}

        {!loading && preview && (
          <PreviewPanel preview={preview} busy={busy} locked={expired || disabled} onApply={applyPreview} />
        )}

        {!loading && applied && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-profit/30 bg-profit/5 px-3 py-2 text-xs text-profit"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Synced {applied.openPositions} open, {applied.closedPositions} closed,{" "}
              {applied.executions} new executions · {timestamp(applied.appliedAt)}
            </span>
          </div>
        )}
      </div>

      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink INDmoney?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the encrypted token from your account. Holdings and executions already synced stay in
              your portfolio; nothing is deleted. You can link again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnlinkOpen(false);
                void sync.disconnect();
              }}
            >
              Unlink account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default BrokerSyncCard;
