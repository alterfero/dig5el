// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationShell } from "../../components/application-shell";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";

const fetchMock = vi.fn();

function renderShell() {
  return render(
    <LocaleProvider>
      <ApplicationShell />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(localeStorageKey, "en");
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
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
  it("provides a skip link and placeholders for the upcoming pages", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contribute" })).toHaveAttribute("href", "/contribute");
    expect(screen.getByRole("link", { name: "Generate" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "About" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Worth reading" })).not.toBeInTheDocument();
  });

  it("keeps the v1 reading topics and omits the media panel", () => {
    renderShell();

    expect(
      screen.getByRole("heading", { level: 2, name: "Worth reading before generating" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Human review mandatory")).toBeInTheDocument();
    expect(screen.getByText("Access and caretaking")).toBeInTheDocument();
    expect(screen.getByText("Sources and citations")).toBeInTheDocument();
    expect(screen.getByText("Research context")).toBeInTheDocument();
    expect(screen.queryByText("Overview video")).not.toBeInTheDocument();
    expect(screen.queryByText("Before you generate")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Sources and citations"));

    expect(
      screen.getByRole("link", { name: "DIG4EL software record on Zenodo" }),
    ).toHaveAttribute("href", "https://doi.org/10.5281/zenodo.16944459");
    expect(
      screen.getByRole("link", { name: "The Bayesian component of DIG4EL" }),
    ).toHaveAttribute("href", "https://aclanthology.org/2026.findings-acl.1327.pdf");
    expect(screen.getByAltText(/Research Center for Pacific Societies and Humanities/i)).toHaveAttribute(
      "src",
      expect.stringContaining("supporting-organizations.png"),
    );
  });

  it("switches the visible interface and document language to French", async () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Change language: English" }));
    expect(screen.getByRole("group", { name: "Language choices" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Français/ }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "DIG4EL est un logiciel d'assistance à la création de descriptions grammaticales pour les langues en danger." }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Générer" })).toHaveAttribute("aria-disabled", "true");
    expect(document.documentElement).toHaveAttribute("lang", "fr");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(window.localStorage.getItem(localeStorageKey)).toBe("fr");
  });

  it("restores keyboard focus to the language control when its choices close", () => {
    renderShell();

    const trigger = screen.getByRole("button", { name: "Change language: English" });
    fireEvent.click(trigger);
    const frenchChoice = screen.getByRole("button", { name: /Français/ });
    frenchChoice.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Language choices" })).not.toBeInTheDocument();
  });

  it("uses a saved language and follows a later browser storage change", async () => {
    window.localStorage.setItem(localeStorageKey, "fr");
    renderShell();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "DIG4EL est un logiciel d'assistance à la création de descriptions grammaticales pour les langues en danger." }),
      ).toBeInTheDocument();
    });

    window.localStorage.setItem(localeStorageKey, "en");
    window.dispatchEvent(new StorageEvent("storage", { key: localeStorageKey }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Supporting the creation of grammatical descriptions of endangered languages." }),
      ).toBeInTheDocument();
    });
  });

  it("does not gate the landing page on a health-status panel", async () => {
    renderShell();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/session",
        expect.objectContaining({
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/health/ready",
      expect.anything(),
    );
  });
});
