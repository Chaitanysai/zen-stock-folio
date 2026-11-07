import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("renders the hero heading with sign-up, explore and sign-in CTAs", () => {
    renderLanding();
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero).toHaveTextContent(/your wealth/i);
    expect(hero).toHaveTextContent(/one clear perspective/i);

    const heroSection = hero.closest("section") as HTMLElement;
    expect(within(heroSection).getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/signup");
    expect(within(heroSection).getByRole("link", { name: /explore zenfolio/i })).toHaveAttribute("href", "#story");
    expect(within(heroSection).getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login");
  });

  it("links the nav CTAs to /signup and /login", () => {
    renderLanding();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/signup");
    expect(within(nav).getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login");
  });

  it("uses a portfolio-growth illustration and labels preview data as sample data", () => {
    const { container } = renderLanding();
    const preview = screen.getByRole("figure", { name: /illustrative preview with sample data/i });
    expect(within(preview).getByText("Sample data")).toBeInTheDocument();
    expect(container.querySelector(".zl-growth-chart")).toBeInTheDocument();
    expect(container.querySelector(".zl-scene-candle")).toBeNull();
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
