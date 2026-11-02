import { describe, expect, it } from "vitest";
import type { BrokerConnectionPublic, BrokerProviderPublic } from "./contracts";
import { BROKER_BRANDING, brokerTileState } from "./branding";

const provider = { id: "groww", enabled: true, setupIssues: [] } as unknown as BrokerProviderPublic;
const connection = (status: string) =>
  ({ status, updatedAt: "2026-11-01T00:00:00Z" }) as unknown as BrokerConnectionPublic;

describe("broker branding", () => {
  it("brands Groww and Zerodha", () => {
    expect(BROKER_BRANDING.groww.displayName).toBe("Groww");
    expect(BROKER_BRANDING.zerodha.displayName).toBe("Zerodha");
    expect(BROKER_BRANDING.groww.brandColor).toMatch(/^#/);
  });

  it("maps real states without inventing connection", () => {
    expect(brokerTileState(provider, null)).toBe("connect");
    expect(brokerTileState({ ...provider, enabled: false }, null)).toBe("setup");
    expect(brokerTileState(provider, connection("pending_authorization"))).toBe("connecting");
    expect(brokerTileState(provider, connection("connected"))).toBe("connected");
    expect(brokerTileState(provider, connection("error"))).toBe("attention");
  });
});
