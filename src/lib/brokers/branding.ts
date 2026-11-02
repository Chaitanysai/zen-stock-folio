import type { BrokerConnectionPublic, BrokerProviderId, BrokerProviderPublic } from "./contracts";

export interface BrokerBrand {
  displayName: string;
  tagline: string;
  brandColor: string;
  logo: string | null;
  logoAlt: string;
}

export const BROKER_BRANDING: Record<BrokerProviderId, BrokerBrand> = {
  zerodha: {
    displayName: "Zerodha",
    tagline: "Kite Connect · own app credentials",
    brandColor: "#387ED1",
    logo: "/brand/zerodha.svg",
    logoAlt: "Zerodha",
  },
  groww: {
    displayName: "Groww",
    tagline: "Groww Trading API · API key and secret",
    brandColor: "#00D09C",
    logo: "/brand/groww.png",
    logoAlt: "Groww",
  },
  upstox: {
    displayName: "Upstox",
    tagline: "Upstox API v2 · OAuth",
    brandColor: "#5B2EFF",
    logo: null,
    logoAlt: "Upstox",
  },
};

export type BrokerTileState = "setup" | "connect" | "connecting" | "connected" | "attention";

export function brokerTileState(
  provider: BrokerProviderPublic,
  connection: BrokerConnectionPublic | null,
): BrokerTileState {
  if (!provider.enabled || provider.setupIssues.length > 0) return "setup";
  if (!connection) return "connect";
  switch (connection.status) {
    case "pending_credentials":
    case "pending_authorization":
    case "syncing":
      return "connecting";
    case "connected":
    case "disconnected":
      return "connected";
    default:
      return "attention";
  }
}
