import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

const renderLanding = () =>
  render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </ThemeProvider>,
  );

/**
 * Lets the async resolve (and React's state update) settle. Only Date is faked,
 * so real timers still run and this cannot deadlock.
 */
const flush = async () => {
  for (let index = 0; index < 8; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("Landing seasonal layer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the Diwali layer on Diwali", async () => {
    vi.setSystemTime(new Date("2026-11-08T12:00:00+05:30"));
    const { container } = renderLanding();

    await flush();

    const layer = container.querySelector('.zl-event[data-animation="diwali"]');
    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the Christmas layer on Christmas", async () => {
    vi.setSystemTime(new Date("2026-12-25T12:00:00+05:30"));
    const { container } = renderLanding();

    await flush();

    expect(container.querySelector('.zl-event[data-animation="christmas"]')).not.toBeNull();
  });

  it("renders no layer outside a display window", async () => {
    vi.setSystemTime(new Date("2026-11-10T12:00:00+05:30"));
    const { container } = renderLanding();

    await flush();

    expect(container.querySelector(".zl-event")).toBeNull();
  });

  it("keeps the hero content and CTAs intact with a layer mounted", async () => {
    vi.setSystemTime(new Date("2026-11-08T12:00:00+05:30"));
    const { container } = renderLanding();

    await flush();

    expect(container.querySelector(".zl-event")).not.toBeNull();
    expect(container.querySelector(".zl-hero-grid")).not.toBeNull();
    expect(container.querySelector('a[href="/signup"]')).not.toBeNull();
  });
});
