import { useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brokerApi, BrokerApiError } from "@/lib/brokers/client";
import type { BrokerConnectionPublic, BrokerErrorCode, BrokerProviderPublic } from "@/lib/brokers/contracts";
import { BROKER_ERROR_MESSAGES } from "@/lib/brokers/messages";

interface BrokerFormDialogProps {
  provider: BrokerProviderPublic;
  method: "oauth" | "api_keys";
  connection?: BrokerConnectionPublic;
  onClose: () => void;
  onDone: (authorizationUrl?: string) => Promise<void> | void;
}

const HELPER: Record<string, string> = {
  zerodha:
    "Use the API key and secret from your own Kite Connect app. The secret is encrypted on the server with AES-256-GCM and is never returned to the browser.",
  groww:
    "Approve this key on Groww's Cloud API Keys page before saving. The server exchanges the key and secret for a daily token and verifies a read-only holdings call.",
  upstox:
    "Use the API key and secret from your own Upstox app, with this site's callback URL registered as its redirect URL. You will be sent to Upstox to sign in; the secret stays server-side.",
};

const secretProblem = (value: string): string | null => {
  if (value.length < 8) return "must be at least 8 characters";
  if (value.length > 2048) return "must be at most 2048 characters";
  if (/\s/.test(value)) return "must not contain spaces";
  return null;
};

/** Collects credentials in component memory only; state dies with the dialog. */
export function BrokerFormDialog({ provider, method, connection, onClose, onDone }: BrokerFormDialogProps) {
  const titleId = useId();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [displayName, setDisplayName] = useState(connection?.displayName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const editing = Boolean(connection);
  const title = editing ? "Update credentials" : method === "oauth" ? "Connect account" : "Use my API keys";

  const secretError = !editing && secretProblem(apiSecret) ? `Secret ${secretProblem(apiSecret)}.` : null;
  const keyError = !editing && secretProblem(apiKey) ? `API key ${secretProblem(apiKey)}.` : null;
  const canSubmit = !submitting && !keyError && !secretError && (!editing || (apiKey !== "" && apiSecret !== ""));

  const close = () => {
    setApiKey("");
    setApiSecret("");
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const label = displayName.trim() === "" ? undefined : displayName.trim();
    try {
      if (connection) {
        const result = await brokerApi.update(connection.id, {
          ...(label ? { displayName: label } : {}),
          apiKey,
          apiSecret,
        });
        setApiKey("");
        setApiSecret("");
        await onDone(result.authorizationUrl);
      } else {
        const result = await brokerApi.create({
          provider: provider.id,
          method,
          apiKey,
          apiSecret,
          ...(label ? { displayName: label } : {}),
        });
        setApiKey("");
        setApiSecret("");
        await onDone(result.authorizationUrl);
      }
    } catch (caught) {
      // invalid_request details name fields only, never credential values, so show them.
      const message =
        caught instanceof BrokerApiError
          ? caught.code === "invalid_request"
            ? caught.message
            : BROKER_ERROR_MESSAGES[caught.code as BrokerErrorCode] ?? caught.message
          : "The request could not be completed.";
      setError(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) close(); }}>
      <DialogContent className="zf-dialog zf-dialog-compact">
        <DialogHeader className="zf-dialog-header">
          <DialogTitle id={titleId}>{title}</DialogTitle>
          <DialogDescription>
            {editing
              ? "A replacement secret is required; stored secrets are never shown again."
              : `${provider.name} · ${provider.authProduct}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="zf-dialog-form zf-broker-form">
          <div className="zf-dialog-body zf-broker-form-body">
            <p className="zf-broker-hint">{HELPER[provider.id]}</p>

            <label className="zf-label" htmlFor={`${titleId}-name`}>Connection label</label>
            <input
              id={`${titleId}-name`}
              className="zf-input"
              value={displayName}
              maxLength={60}
              placeholder={`${provider.name} account`}
              autoComplete="off"
              onChange={(event) => setDisplayName(event.target.value)}
            />

            <label className="zf-label" htmlFor={`${titleId}-key`}>
              {provider.id === "zerodha" ? "Kite API key (client ID)" : "API key"}
            </label>
            <input
              id={`${titleId}-key`}
              className="zf-input"
              value={apiKey}
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              aria-describedby={`${titleId}-key-error`}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <span className="zf-broker-field-error" id={`${titleId}-key-error`} aria-live="polite">
              {editing ? "" : keyError ?? ""}
            </span>

            <label className="zf-label" htmlFor={`${titleId}-secret`}>
              {provider.id === "zerodha" ? "Kite API secret" : "API secret"}
            </label>
            <input
              id={`${titleId}-secret`}
              className="zf-input"
              value={apiSecret}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              required
              aria-describedby={`${titleId}-secret-error`}
              onChange={(event) => setApiSecret(event.target.value)}
            />
            <span className="zf-broker-field-error" id={`${titleId}-secret-error`} aria-live="polite">
              {editing ? "" : secretError ?? ""}
            </span>

            <p className="zf-broker-hint">
              <ShieldCheck aria-hidden="true" /> Secrets are sent once over HTTPS and stored encrypted on the server.
              They are never written to browser storage, logs or analytics.
            </p>

            {error && (
              <p className="zf-broker-error" role="alert">
                <AlertTriangle aria-hidden="true" /> {error}
              </p>
            )}
          </div>

          <DialogFooter className="zf-dialog-footer zf-broker-dialog-actions">
            <button type="button" className="zf-btn zf-btn-outline" onClick={close} disabled={submitting}>Cancel</button>
            <button type="submit" className="zf-btn zf-btn-primary" disabled={!canSubmit}>
              {submitting ? <Loader2 className="zf-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              {editing ? "Save and continue" : method === "oauth" ? "Save and continue to broker" : "Save and verify"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
