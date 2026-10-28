import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, Loader2, PlayCircle,
  RefreshCw, ShieldCheck, Unplug,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { PortfolioStock } from "@/data/sampleData";
import { brokerApi, BrokerApiError, clearBrokerCallback, readBrokerCallback } from "@/lib/brokers/client";
import type {
  BrokerConnectionPublic,
  BrokerConnectionStatus,
  BrokerErrorCode,
  BrokerProviderPublic,
} from "@/lib/brokers/contracts";
import {
  BROKER_CATEGORY_LABELS,
  BROKER_ERROR_MESSAGES,
  BROKER_METHOD_LABELS,
  BROKER_STATUS_LABELS,
} from "@/lib/brokers/messages";
import { mergeBrokerHoldings } from "@/lib/brokers/merge";
import { BrokerFormDialog } from "./BrokerFormDialog";

interface BrokersProps {
  stocks: PortfolioStock[];
  onImportStocks: (stocks: PortfolioStock[], label: string) => void;
}

const STATUS_COLOR: Record<BrokerConnectionStatus, string> = {
  connected: "var(--green)",
  syncing: "var(--blue, #2563eb)",
  pending_credentials: "var(--amber)",
  pending_authorization: "var(--amber)",
  reauthorization_required: "var(--amber)",
  permission_required: "var(--amber)",
  temporarily_unavailable: "var(--tx-400)",
  error: "var(--red)",
  disconnected: "var(--tx-400)",
};

const actionError = (error: unknown): string => {
  if (error instanceof BrokerApiError) {
    return BROKER_ERROR_MESSAGES[error.code as BrokerErrorCode] ?? error.message;
  }
  return "The request could not be completed.";
};

const formatDate = (value: string | null): string => {
  if (!value) return "Never";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Unknown";
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

const CATEGORY_ORDER = ["holdings", "positions", "orders", "trades"] as const;

function StatusChip({ status }: { status: BrokerConnectionStatus }) {
  return (
    <span className="zf-broker-chip" style={{ color: STATUS_COLOR[status] }}>
      <i aria-hidden="true" style={{ background: STATUS_COLOR[status] }} />
      {BROKER_STATUS_LABELS[status]}
    </span>
  );
}

function ConnectionCard({
  connection,
  provider,
  busy,
  onAuthorize,
  onTest,
  onSync,
  onEdit,
  onDisconnect,
}: {
  connection: BrokerConnectionPublic;
  provider?: BrokerProviderPublic;
  busy: string | null;
  onAuthorize: (connection: BrokerConnectionPublic) => void;
  onTest: (connection: BrokerConnectionPublic) => void;
  onSync: (connection: BrokerConnectionPublic) => void;
  onEdit: (connection: BrokerConnectionPublic, method: "oauth" | "api_keys") => void;
  onDisconnect: (connection: BrokerConnectionPublic) => void;
}) {
  const working = busy === connection.id;
  const sync = connection.lastSync;
  const canSync = connection.status === "connected" || connection.status === "temporarily_unavailable" || connection.status === "permission_required" || connection.status === "error";

  return (
    <article className="zf-broker-card zf-card" aria-label={`${connection.displayName} connection`}>
      <div className="zf-card-head">
        <div>
          <h3 className="zf-card-title">{connection.displayName}</h3>
          <p className="zf-card-sub">
            {provider?.name ?? connection.provider} · {BROKER_METHOD_LABELS[connection.method]}
          </p>
        </div>
        <StatusChip status={connection.status} />
      </div>

      <div className="zf-card-body zf-broker-body">
        <dl className="zf-broker-meta">
          <div><dt>Last synced</dt><dd>{formatDate(connection.lastSuccessfulSyncAt)}</dd></div>
          <div><dt>Last tested</dt><dd>{formatDate(connection.lastTestedAt)}</dd></div>
          <div><dt>Session expires</dt><dd>{formatDate(connection.tokenExpiresAt)}</dd></div>
          <div><dt>Permissions</dt><dd>{connection.permissions.length > 0 ? "Read-only portfolio access" : "None recorded"}</dd></div>
        </dl>

        {connection.lastErrorCode && (
          <p className="zf-broker-error" role="status">
            <AlertTriangle aria-hidden="true" />
            {BROKER_ERROR_MESSAGES[connection.lastErrorCode]}
          </p>
        )}

        {connection.status === "pending_authorization" && (
          <p className="zf-broker-hint">
            Credentials are stored. Open the broker's login page to finish authorization; this connection stays
            pending until the broker confirms it.
          </p>
        )}

        {(connection.status === "reauthorization_required" || connection.status === "permission_required") && provider && (
          <p className="zf-broker-hint">{provider.reauthNote}</p>
        )}

        {sync && (
          <div className="zf-broker-sync">
            <p className="zf-broker-sync-head">
              Last sync <span className={`zf-broker-sync-status zf-${sync.status}`}>{sync.status}</span>
              <span className="zf-mono">{sync.counts.new + sync.counts.updated + sync.counts.unchanged} records</span>
            </p>
            <ul className="zf-broker-cats">
              {CATEGORY_ORDER.map((id) => {
                const result = sync.categories[id];
                return (
                  <li key={id} data-state={result.status}>
                    <span>{BROKER_CATEGORY_LABELS[id]}</span>
                    <span className="zf-mono">{result.status === "failed" ? "unavailable" : result.count}</span>
                  </li>
                );
              })}
            </ul>
            <p className="zf-broker-hint">
              {sync.coverage.note}
              {sync.coverage.currentDayOnly ? " Earlier history is not available from the trading API." : ""}
            </p>
          </div>
        )}

        <div className="zf-broker-actions">
          {connection.status === "pending_authorization" && (
            <button type="button" className="zf-btn zf-btn-primary zf-btn-sm" disabled={working} onClick={() => onAuthorize(connection)}>
              {working ? <Loader2 className="zf-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />} Continue to broker
            </button>
          )}
          {(connection.status === "reauthorization_required" || connection.status === "permission_required" || connection.status === "error") && (
            <button type="button" className="zf-btn zf-btn-primary zf-btn-sm" disabled={working} onClick={() => onAuthorize(connection)}>
              {working ? <Loader2 className="zf-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />} Reauthorize
            </button>
          )}
          {connection.status !== "disconnected" && (
            <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" disabled={working} onClick={() => onTest(connection)}>
              {working ? <Loader2 className="zf-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />} Test connection
            </button>
          )}
          <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" disabled={working || !canSync} onClick={() => onSync(connection)}>
            {working ? <Loader2 className="zf-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Sync now
          </button>
          {connection.status !== "disconnected" && (
            <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" disabled={working} onClick={() => onEdit(connection, connection.method)}>
              <KeyRound aria-hidden="true" /> Update credentials
            </button>
          )}
          {connection.status !== "disconnected" && (
            <button type="button" className="zf-btn zf-btn-outline zf-btn-sm zf-danger" disabled={working} onClick={() => onDisconnect(connection)}>
              <Unplug aria-hidden="true" /> Disconnect
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ProviderCard({
  provider,
  busy,
  onConnect,
}: {
  provider: BrokerProviderPublic;
  busy: boolean;
  onConnect: (provider: BrokerProviderPublic, method: "oauth" | "api_keys") => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(provider.callbackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className="zf-broker-card zf-card" aria-label={`${provider.name} provider`}>
      <div className="zf-card-head">
        <div>
          <h3 className="zf-card-title">{provider.name}</h3>
          <p className="zf-card-sub">{provider.authProduct}</p>
        </div>
        <span className="zf-broker-chip" style={{ color: provider.enabled ? "var(--green)" : "var(--tx-400)" }}>
          <i aria-hidden="true" style={{ background: provider.enabled ? "var(--green)" : "var(--tx-400)" }} />
          {provider.enabled ? "Available" : "Not configured"}
        </span>
      </div>

      <div className="zf-card-body zf-broker-body">
        {!provider.enabled && provider.unavailableReason && (
          <p className="zf-broker-notice" role="status">
            <AlertTriangle aria-hidden="true" />
            <span>
              {provider.unavailableReason}
              {provider.setupIssues.length > 0 && (
                <> Missing server configuration: <code>{provider.setupIssues.join(", ")}</code>.</>
              )}
            </span>
          </p>
        )}

        <div className="zf-broker-methods">
          {provider.methods.oauth && (
            <button type="button" className="zf-btn zf-btn-primary zf-btn-sm" disabled={!provider.enabled || busy}
              onClick={() => onConnect(provider, "oauth")}>
              <Link2 aria-hidden="true" /> Connect account
            </button>
          )}
          {provider.methods.apiKeys && (
            <button type="button" className="zf-btn zf-btn-primary zf-btn-sm" disabled={!provider.enabled || busy}
              onClick={() => onConnect(provider, "api_keys")}>
              <KeyRound aria-hidden="true" /> Use my API keys
            </button>
          )}
          <a className="zf-btn zf-btn-outline zf-btn-sm" href={provider.setupUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLink aria-hidden="true" /> Provider setup
          </a>
        </div>

        <dl className="zf-broker-meta">
          <div><dt>Shared multi-user</dt><dd>{provider.sharedMultiUserReason}</dd></div>
          <div><dt>Token lifetime</dt><dd>{provider.tokenLifetime}</dd></div>
          <div><dt>Rate limits</dt><dd>{provider.rateLimitNote}</dd></div>
          <div><dt>Subscription</dt><dd>{provider.subscriptionNote}</dd></div>
        </dl>

        <div className="zf-broker-history">
          <p className="zf-broker-sync-head">Data available</p>
          <ul className="zf-broker-cats">
            {CATEGORY_ORDER.map((id) => (
              <li key={id} data-state={provider.data[id] ? "ok" : "unsupported"}>
                <span>{BROKER_CATEGORY_LABELS[id]}</span>
                <span className="zf-mono">{provider.history[id].replace("_", " ")}</span>
              </li>
            ))}
          </ul>
          <p className="zf-broker-hint">{provider.historyNote}</p>
        </div>

        {provider.methods.oauth && (
          <div className="zf-broker-callback">
            <p className="zf-broker-sync-head">Registered redirect URL</p>
            <div className="zf-broker-callback-row">
              <code>{provider.callbackUrl}</code>
              <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={() => void copyCallback()}>
                <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="zf-broker-hint">
              Add this exact URL to your {provider.authProduct} app before starting the login flow.
            </p>
          </div>
        )}

        <ul className="zf-broker-limits">
          {provider.limitations.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </article>
  );
}

export default function Brokers({ stocks, onImportStocks }: BrokersProps) {
  const { toast } = useToast();
  const [providers, setProviders] = useState<BrokerProviderPublic[]>([]);
  const [connections, setConnections] = useState<BrokerConnectionPublic[]>([]);
  const [storeReady, setStoreReady] = useState(true);
  const [setupIssues, setSetupIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ provider: BrokerProviderPublic; method: "oauth" | "api_keys"; connection?: BrokerConnectionPublic } | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<BrokerConnectionPublic | null>(null);
  const callbackHandled = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const providerData = await brokerApi.providers();
      setProviders(providerData.providers);
      setStoreReady(providerData.storeReady);
      setSetupIssues(providerData.setupIssues);
      if (providerData.storeReady) {
        const connectionData = await brokerApi.connections();
        setConnections(connectionData.connections);
      } else {
        setConnections([]);
      }
    } catch (caught) {
      setError(actionError(caught));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (callbackHandled.current) return;
    const callback = readBrokerCallback();
    if (!callback) return;
    callbackHandled.current = true;
    clearBrokerCallback();
    if (callback.status === "connected") {
      toast({ title: "Broker authorization completed", description: "Run Sync now to import holdings and the current day's activity." });
    } else {
      const code = (callback.code ?? "provider_error") as BrokerErrorCode;
      toast({
        title: "Broker authorization failed",
        description: BROKER_ERROR_MESSAGES[code] ?? "The broker did not confirm the authorization.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const providerById = (id: string) => providers.find((provider) => provider.id === id);

  const startAuthorization = async (connection: BrokerConnectionPublic) => {
    setBusy(connection.id);
    try {
      const result = await brokerApi.authorize({ connectionId: connection.id });
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      toast({ title: "Could not start authorization", description: actionError(caught), variant: "destructive" });
      setBusy(null);
    }
  };

  const testConnection = async (connection: BrokerConnectionPublic) => {
    setBusy(connection.id);
    try {
      await brokerApi.test(connection.id);
      toast({ title: "Connection verified", description: "The broker accepted the read-only request." });
      await refresh(true);
    } catch (caught) {
      toast({ title: "Connection test failed", description: actionError(caught), variant: "destructive" });
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const syncConnection = async (connection: BrokerConnectionPublic) => {
    setBusy(connection.id);
    try {
      const result = await brokerApi.sync(connection.id);
      const report = result.report;
      const merged = mergeBrokerHoldings(stocks, connection.provider, connection.id, report.records.holdings, report.finishedAt);
      if (report.records.holdings.length > 0) {
        onImportStocks(merged.stocks, `Broker sync (${merged.added} added, ${merged.updated} updated)`);
      }
      const parts = [
        `${report.records.holdings.length} holdings`,
        `${report.records.positions.length} positions`,
        `${report.records.orders.length} orders today`,
        `${report.records.trades.length} trades today`,
      ];
      toast({
        title: report.status === "success" ? "Broker sync complete" : "Broker sync finished with limits",
        description: `${parts.join(" · ")}. ${report.coverage.note}`,
      });
      await refresh(true);
    } catch (caught) {
      toast({ title: "Broker sync failed", description: actionError(caught), variant: "destructive" });
      await refresh(true);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (connection: BrokerConnectionPublic) => {
    setBusy(connection.id);
    try {
      await brokerApi.disconnect(connection.id);
      toast({ title: "Broker disconnected", description: "Stored credentials were deleted. Imported holdings remain in your portfolio." });
      setDisconnectTarget(null);
      await refresh(true);
    } catch (caught) {
      toast({ title: "Could not disconnect", description: actionError(caught), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="zf-broker-loading" role="status">
        <Loader2 className="zf-spin" aria-hidden="true" /> Loading broker connections…
      </div>
    );
  }

  return (
    <div className="zf-brokers">
      {!storeReady && (
        <div className="zf-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            Broker connections need server configuration before they can be used. Missing:{" "}
            <code>{setupIssues.join(", ") || "storage"}</code>. Credentials are never stored until this is set up.
          </span>
        </div>
      )}

      {error && (
        <div className="zf-notice" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={() => void refresh()}>Try again</button>
        </div>
      )}

      <section aria-labelledby="zf-broker-connections-title">
        <div className="zf-broker-section-head">
          <div>
            <h2 className="zf-card-title" id="zf-broker-connections-title">Your connections</h2>
            <p className="zf-card-sub">Read-only access. ZenFolio never places, modifies or cancels orders.</p>
          </div>
        </div>

        {connections.length === 0 ? (
          <div className="zf-card zf-empty-state" style={{ padding: 28 }}>
            <span className="zf-empty-icon" aria-hidden="true"><Link2 /></span>
            <p className="zf-empty-title">No broker connected</p>
            <p className="zf-empty-body">
              Link a broker below to import holdings and today's orders and trades. Market prices stay on the
              existing quote provider and do not need a broker connection.
            </p>
          </div>
        ) : (
          <div className="zf-broker-grid">
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                provider={providerById(connection.provider)}
                busy={busy}
                onAuthorize={(item) => void startAuthorization(item)}
                onTest={(item) => void testConnection(item)}
                onSync={(item) => void syncConnection(item)}
                onEdit={(item, method) => {
                  const provider = providerById(item.provider);
                  if (provider) setForm({ provider, method, connection: item });
                }}
                onDisconnect={setDisconnectTarget}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="zf-broker-providers-title">
        <div className="zf-broker-section-head">
          <div>
            <h2 className="zf-card-title" id="zf-broker-providers-title">Supported brokers</h2>
            <p className="zf-card-sub">Each method follows the provider's documented authentication flow.</p>
          </div>
        </div>
        <div className="zf-broker-grid">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              busy={busy !== null}
              onConnect={(item, method) => setForm({ provider: item, method })}
            />
          ))}
        </div>
      </section>

      <p className="zf-broker-footnote">
        <PlayCircle aria-hidden="true" />
        Broker APIs cover the current day's orders and trades. Contract notes or statement import are required for
        older transactions.
      </p>

      {form && (
        <BrokerFormDialog
          provider={form.provider}
          method={form.method}
          connection={form.connection}
          onClose={() => setForm(null)}
          onDone={async (authorizationUrl) => {
            setForm(null);
            if (authorizationUrl) {
              window.location.assign(authorizationUrl);
              return;
            }
            await refresh(true);
          }}
        />
      )}

      <Dialog open={disconnectTarget !== null} onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect {disconnectTarget?.displayName}?</DialogTitle>
            <DialogDescription>
              The encrypted credentials are deleted and the connection stops syncing. Holdings already imported stay
              in your portfolio so you can remove them yourself.
            </DialogDescription>
          </DialogHeader>
          <div className="zf-broker-dialog-actions">
            <button type="button" className="zf-btn zf-btn-outline" onClick={() => setDisconnectTarget(null)}>Cancel</button>
            <button
              type="button"
              className="zf-btn zf-btn-primary zf-danger"
              disabled={busy !== null}
              onClick={() => disconnectTarget && void disconnect(disconnectTarget)}
            >
              {busy ? <Loader2 className="zf-spin" aria-hidden="true" /> : <Unplug aria-hidden="true" />} Disconnect
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
