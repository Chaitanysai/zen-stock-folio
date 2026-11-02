import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { signIn } = vi.hoisted(() => ({
  signIn: vi.fn(() => new Promise<void>(() => {})),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    isConfigured: true,
    signIn,
    signUpWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));

import Login from "./Login";

describe("Login skeleton transition", () => {
  it("shows the dashboard skeleton immediately on submit", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secret123" } });

    const submit = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
    expect(submit).not.toBeNull();
    fireEvent.click(submit!);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Signing you in"));
  });
});
