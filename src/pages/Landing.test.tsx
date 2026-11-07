import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";
import Landing from "./Landing";

const renderLanding = () =>
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("Landing page", () => {
  it("renders the hero heading with sign-up, product and sign-in CTAs", () => {
    renderLanding();
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero).toHaveTextContent(/know exactly/i);
    expect(hero).toHaveTextContent(/where you stand/i);

    const heroSection = hero.closest("section") as HTMLElement;
    expect(within(heroSection).getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/signup");
    expect(within(heroSection).getByRole("link", { name: /see the product/i })).toHaveAttribute("href", "#product");
    expect(within(heroSection).getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login");
  });

  it("links the nav CTAs to /signup and /login", () => {
    renderLanding();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/signup");
    expect(within(nav).getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login");
  });

  it("counts the sample portfolio value up to its final figure", async () => {
    renderLanding();
    const statement = screen.getByRole("region", { name: /sample portfolio statement/i });
    await waitFor(
      () => expect(within(statement).getByText("₹12,48,560")).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("switches the statement curve between ranges", () => {
    renderLanding();
    const statement = screen.getByRole("region", { name: /sample portfolio statement/i });
    const range = within(statement).getByRole("group", { name: /chart range/i });
    expect(within(range).getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(range).getByRole("button", { name: "1Y" }));
    expect(within(range).getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    expect(within(statement).getByText("+14.9% · past year")).toBeInTheDocument();
  });

  it("uses the workspace preview and labels preview data as sample data", () => {
    const { container } = renderLanding();
    const preview = screen.getByRole("figure", { name: /illustrative preview with sample data/i });
    expect(within(preview).getByText("Sample data")).toBeInTheDocument();
    expect(container.querySelector(".zl-sheet")).toBeInTheDocument();
    expect(container.querySelector(".zl-curve-line")).toBeInTheDocument();
  });

  it("opens and closes the mobile menu from the keyboard", () => {
    renderLanding();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("zl-mobile-menu")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("zl-mobile-menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("keeps content visible when IntersectionObserver is unavailable", () => {
    // jsdom has no IntersectionObserver: the reveal hook must not opt in.
    const { container } = renderLanding();
    expect(container.querySelector(".zl")).not.toHaveClass("zl-js");
  });
});
