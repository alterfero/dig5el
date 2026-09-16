// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationShell } from "../../components/application-shell";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { status: "ready" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ApplicationShell", () => {
  it("provides a skip link and labelled primary navigation", () => {
    render(<ApplicationShell />);

    expect(
      screen.getByRole("link", { name: "Skip to the main content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation).toHaveAttribute("id", "primary-navigation");
    expect(
      screen.getByRole("link", { name: "Welcome" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("opens and closes the mobile navigation menu", () => {
    render(<ApplicationShell />);

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    const menuButton = screen.getByRole("button", { name: "Open menu" });

    expect(menuButton).toHaveAttribute("aria-controls", "primary-navigation");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(navigation).not.toHaveClass("navigation-open");

    fireEvent.click(menuButton);

    expect(
      screen.getByRole("button", { name: "Close menu" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(navigation).toHaveClass("navigation-open");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(navigation).not.toHaveClass("navigation-open");
  });

  it("checks health through the same-origin DIG4EL endpoint", async () => {
    render(<ApplicationShell />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/health/ready",
        expect.objectContaining({
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
      );
    });
  });
});
