import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Radix's dialog machinery touches ResizeObserver, which jsdom does not
 * implement. A no-op class is enough: the assertions below are about the
 * assistant's own behaviour, not about layout.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const useAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuth() }));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { default: AssistantRoot } = await import("./AssistantRoot");

const signedIn = (id: string) => ({
  user: { id, email: `${id}@example.com` },
  isAuthenticated: true,
  isLoading: false,
});

const replyPayload = {
  reply: "You hold two positions.",
  cards: [],
  degraded: false,
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  usage: { rounds: 1, toolCalls: 0, durationMs: 12 },
  toolTrace: [],
};

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const renderRoot = () =>
  render(
    <MemoryRouter>
      <AssistantRoot />
    </MemoryRouter>,
  );

const openPanel = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open the ZenFolio assistant" }));
  return screen.findByLabelText("Ask the ZenFolio assistant");
};

const submit = (input: HTMLElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
};

beforeEach(() => {
  apiFetch.mockReset();
  useAuth.mockReturnValue(signedIn("user-a"));
  window.localStorage.clear();
});

describe("AssistantRoot", () => {
  it("renders nothing at all when nobody is signed in", () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });
    renderRoot();

    expect(screen.queryByRole("button", { name: /ZenFolio assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the panel from the launcher and closes it again", async () => {
    renderRoot();

    const launcher = screen.getByRole("button", { name: "Open the ZenFolio assistant" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(launcher).toHaveAttribute("aria-controls", "zf-assistant-panel");

    fireEvent.click(launcher);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("toggles with the keyboard shortcut", async () => {
    renderRoot();
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("posts the turn and renders the reply", async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, replyPayload));
    renderRoot();

    submit(await openPanel(), "show my holdings");

    expect(await screen.findByText("You hold two positions.")).toBeInTheDocument();

    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe("/api/assistant/chat");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      conversationId: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[body.messages.length - 1]).toEqual({ role: "user", content: "show my holdings" });
    // A correlation id is sent for logging; it carries no identity.
    expect(body.conversationId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(JSON.stringify(body)).not.toContain("user-a");
  });

  it("reports an expired session instead of a generic failure", async () => {
    apiFetch.mockResolvedValue(jsonResponse(401, { error: "Authentication required" }));
    renderRoot();

    submit(await openPanel(), "hi");

    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired");
  });

  it("rejects an unreadable response rather than rendering it", async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, { reply: "", cards: "lots" }));
    renderRoot();

    submit(await openPanel(), "hi");

    expect(await screen.findByRole("alert")).toHaveTextContent("unreadable response");
  });

  it("does not carry one account's conversation into the next", async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, replyPayload));
    const view = renderRoot();

    submit(await openPanel(), "show my holdings");
    expect(await screen.findByText("You hold two positions.")).toBeInTheDocument();

    // Account switch: the panel must reload empty for the new uid.
    useAuth.mockReturnValue(signedIn("user-b"));
    view.rerender(
      <MemoryRouter>
        <AssistantRoot />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("You hold two positions.")).not.toBeInTheDocument());
    expect(screen.getByText("Ask about your portfolio")).toBeInTheDocument();
  });
});
