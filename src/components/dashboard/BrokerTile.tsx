import type { BrokerConnectionPublic, BrokerProviderPublic } from "@/lib/brokers/contracts";
import { BROKER_BRANDING, brokerTileState, type BrokerTileState } from "@/lib/brokers/branding";

const STATUS_LABEL: Record<BrokerTileState, string> = {
  setup: "Not available in this deployment",
  connect: "Not connected",
  connecting: "Waiting for authorization",
  connected: "Connected",
  attention: "Needs attention",
};

const ACTION_LABEL: Record<BrokerTileState, string> = {
  setup: "Setup required",
  connect: "Connect",
  connecting: "Connecting…",
  connected: "Manage",
  attention: "Review",
};

interface BrokerTileProps {
  provider: BrokerProviderPublic;
  connection: BrokerConnectionPublic | null;
  onAction: (state: BrokerTileState) => void;
}

export function BrokerTile({ provider, connection, onAction }: BrokerTileProps) {
  const brand = BROKER_BRANDING[provider.id];
  const state = brokerTileState(provider, connection);
  const disabled = state === "setup" || state === "connecting";
  const hint =
    state === "setup"
      ? [
          provider.unavailableReason,
          provider.setupIssues.length > 0 ? `Missing server configuration: ${provider.setupIssues.join(", ")}.` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;

  return (
    <article className="zf-broker-tile" data-state={state}>
      <div className="zf-broker-id">
        <span className="zf-broker-logo" style={{ background: `${brand.brandColor}14`, color: brand.brandColor }}>
          {brand.logo ? (
            <img src={brand.logo} alt={brand.logoAlt} width={28} height={28} loading="lazy" />
          ) : (
            brand.displayName
          )}
        </span>
        <div>
          <p className="zf-broker-name">{brand.displayName}</p>
          <p className="zf-broker-sub">{brand.tagline}</p>
        </div>
      </div>
      <p className="zf-broker-status" data-state={state} aria-live="polite">{STATUS_LABEL[state]}</p>
      {hint && <p className="zf-broker-hint">{hint}</p>}
      <button
        type="button"
        className="zf-btn zf-btn-outline"
        disabled={disabled}
        onClick={() => onAction(state)}
      >
        {ACTION_LABEL[state]}
      </button>
    </article>
  );
}
