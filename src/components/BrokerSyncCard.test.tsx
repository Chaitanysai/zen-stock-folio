import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({ useBrokerSync: vi.fn() }));

vi.mock("@/hooks/useBrokerSync", () => ({ useBrokerSync: hook.useBrokerSync }));

import BrokerSyncCard from "./BrokerSyncCard";
import type { BrokerSyncState } from "@/hooks/useBrokerSync";
import type {
  ApplyResult,
  BrokerConnection,
  PreviewResult,
} from "@/lib/broker/types";

type Controller = BrokerSyncState & {
  link: ReturnType<typeof vi.fn>;
  runPreview: ReturnType<typeof vi.fn>;
  apply: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const connection: BrokerConnection = {
  provider: "indmoney",
  ciphertext: "ciphertext-material",
  iv: "initialization-vector",
  keyVersion: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
  syncedAt: null,
};

const preview: PreviewResult = {
  mode: "preview",
  provider: "indmoney",
  generatedAt: "2026-11-01T00:00:00.000Z",
  holdingsSeen: 2,
  executionsSeen: 3,
  openPositions: [
    { ticker: "RELIANCE", before: null, after: { quantity: 15, averagePrice: 2450 } },
    { ticker: "TCS", before: { quantity: 8, averagePrice: 3900 }, after: null },
  ],
  closedPositions: [],
  executionsAdded: 2,
  unmatched: [],
  conflicts: [],
  warnings: [],
  snapshotUpdateTime: "2026-11-01T00:00:00.000Z",
  unchangedPositions: 0,
  requiresEmptyConfirmation: false,
};

const applied: ApplyResult = {
  mode: "apply",
  provider: "indmoney",
  appliedAt: "2026-11-01T01:00:00.000Z",
  openPositions: 1,
  closedPositions: 0,
  executions: 2,
  snapshotUpdateTime: "2026-11-01T01:00:00.000Z",
};

const setup = (overrides: Partial<Controller> = {}, onApplied?: () => void): Controller => {
  const state: Controller = {
    connection: null,
    preview: null,
    applied: null,
    loading: false,
    busy: false,
    error: null,
    expired: false,
    disabled: false,
    link: vi.fn().mockResolvedValue(true),
    runPreview: vi.fn().mockResolvedValue(preview),
    apply: vi.fn().mockResolvedValue(applied),
    disconnect: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  hook.useBrokerSync.mockReturnValue(state);
  render(<BrokerSyncCard userId="user-1" onApplied={onApplied} />);
  return state;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linking", () => {
  it("submits the pasted token", async () => {
    const state = setup();

    fireEvent.change(screen.getByLabelText("INDstocks API token"), {
      target: { value: "tok_1234567890abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link account" }));

    await waitFor(() => expect(state.link).toHaveBeenCalledWith("tok_1234567890abcdef"));
  });

  it("keeps the submit disabled until a token is entered", () => {
    setup();
    expect(screen.getByRole("button", { name: "Link account" })).toBeDisabled();
  });

  it("states that sync is read-only and never touches manual rows", () => {
    setup();
    expect(screen.getByText(/Read-only · NSE holdings and trade book/i)).toBeInTheDocument();
    expect(screen.getByText(/manual rows are never changed/i)).toBeInTheDocument();
  });

  it("shows the deployment notice without a token form when disabled", () => {
    setup({ disabled: true });

    expect(screen.getByRole("status")).toHaveTextContent(/not configured/i);
    expect(screen.queryByLabelText("INDstocks API token")).not.toBeInTheDocument();
  });

  it("shows only the hook alert when a disabled deployment reports the error", () => {
    setup({ disabled: true, error: "Broker sync is not configured on this deployment." });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Broker sync is not configured on this deployment.",
    );
    expect(screen.queryByLabelText("INDstocks API token")).not.toBeInTheDocument();
  });

  it("does not claim the account is unlinked while the connection is still loading", () => {
    setup({ loading: true });

    expect(screen.getByText(/^Checking$/)).toBeInTheDocument();
    expect(screen.getByText(/checking the broker connection/i)).toBeInTheDocument();
  });

  it("asks for a new token when the saved one expired", () => {
    setup({ connection, expired: true });

    expect(screen.getByLabelText("INDstocks API token")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link account" })).toBeInTheDocument();
    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });
});

describe("linked account", () => {
  it("shows the token expiry and runs a preview", async () => {
    const state = setup({ connection });

    expect(screen.getByText(/token valid until/i)).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview sync" }));
    await waitFor(() => expect(state.runPreview).toHaveBeenCalledTimes(1));
  });

  it("shows the diff and applies it", async () => {
    const onApplied = vi.fn();
    const state = setup({ connection, preview }, onApplied);

    expect(screen.getByText("RELIANCE")).toBeInTheDocument();
    expect(screen.getByText("TCS")).toBeInTheDocument();
    expect(screen.getByText(/3 executions read/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

    await waitFor(() => expect(state.apply).toHaveBeenCalledWith(false));
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });

  it("requires an explicit confirmation before removing every open position", async () => {
    const emptyPreview: PreviewResult = {
      ...preview,
      openPositions: [
        { ticker: "RELIANCE", before: { quantity: 15, averagePrice: 2450 }, after: null },
      ],
      requiresEmptyConfirmation: true,
    };
    const state = setup({ connection, preview: emptyPreview });

    const applyButton = screen.getByRole("button", { name: "Apply changes" });
    expect(applyButton).toBeDisabled();
    expect(screen.getByText(/returned no holdings/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", {
      name: /remove every synced open position/i,
    }));
    expect(applyButton).toBeEnabled();

    fireEvent.click(applyButton);
    await waitFor(() => expect(state.apply).toHaveBeenCalledWith(true));
  });

  it("keeps applying disabled once the saved token expired", () => {
    setup({ connection, preview, expired: true });

    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("refuses to apply a preview that exceeds a storage limit", () => {
    setup({
      connection,
      preview: {
        ...preview,
        conflicts: [{ code: "limit", detail: "The portfolio exceeds 1000 positions." }],
      },
    });

    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
    expect(screen.getByText(/storage limit/i)).toBeInTheDocument();
  });

  it("surfaces conflicts, unmatched rows, and warnings", () => {
    setup({
      connection,
      preview: {
        ...preview,
        conflicts: [{ code: "manual-position", ticker: "TCS", detail: "A manual TCS row wins." }],
        unmatched: [{ ticker: "BSEONLY", brokerRef: "BSE:BSEONLY", reason: "unsupported-exchange", detail: "BSE is not supported yet." }],
        warnings: ["The broker returned no trade history."],
      },
    });

    expect(screen.getByText(/manual TCS row wins/i)).toBeInTheDocument();
    expect(screen.getByText(/BSE is not supported yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no trade history/i)).toBeInTheDocument();
  });

  it("shows the applied summary", () => {
    setup({ connection, applied });
    expect(screen.getByRole("status")).toHaveTextContent(/synced 1 open, 0 closed, 2 new executions/i);
  });

  it("shows an error from the hook", () => {
    setup({ connection, error: "The portfolio changed since the preview. Run the preview again." });
    expect(screen.getByRole("alert")).toHaveTextContent(/preview again/i);
  });
});

describe("unlinking", () => {
  it("requires confirmation and keeps synced rows", async () => {
    const state = setup({ connection });

    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Unlink INDmoney?" });
    expect(dialog).toHaveTextContent(/already synced stay in your portfolio/i);
    expect(state.disconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unlink account" }));
    await waitFor(() => expect(state.disconnect).toHaveBeenCalledTimes(1));
  });
});
