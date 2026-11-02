import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BrokerConnectionPublic, BrokerProviderPublic } from "@/lib/brokers/contracts";
import { BrokerTile } from "./BrokerTile";

const provider = (overrides: Partial<BrokerProviderPublic> = {}) =>
  ({ id: "zerodha", enabled: true, setupIssues: [], unavailableReason: null, ...overrides }) as unknown as BrokerProviderPublic;

const connection = (status: string) => ({ status } as unknown as BrokerConnectionPublic);

describe("BrokerTile", () => {
  it("offers Connect when the provider has no record", () => {
    const onAction = vi.fn();
    render(<BrokerTile provider={provider()} connection={null} onAction={onAction} />);

    expect(screen.getByText("Not connected")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith("connect");
  });

  it("offers Manage for a connected record", () => {
    render(<BrokerTile provider={provider()} connection={connection("connected")} onAction={() => {}} />);

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage" })).toBeEnabled();
  });

  it("disables setup and explains the missing configuration", () => {
    render(
      <BrokerTile
        provider={provider({
          enabled: false,
          setupIssues: ["BROKER_ENCRYPTION_KEY"],
          unavailableReason: "Broker storage is not configured.",
        })}
        connection={null}
        onAction={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Setup required" })).toBeDisabled();
    expect(screen.getByText(/Broker storage is not configured/)).toBeInTheDocument();
  });

  it("never renders credential values", () => {
    const withSecrets = { ...connection("connected"), apiKey: "live-key-value", apiSecret: "live-secret-value" };
    const { container } = render(
      <BrokerTile provider={provider()} connection={withSecrets as BrokerConnectionPublic} onAction={() => {}} />,
    );

    expect(container.textContent).not.toMatch(/secret|api[-_ ]?key/i);
    expect(container.textContent).not.toContain("live-key-value");
    expect(container.textContent).not.toContain("live-secret-value");
  });
});
