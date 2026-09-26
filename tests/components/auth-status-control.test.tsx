// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStatusControl } from "../../components/auth-status-control";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";

const fetchMock = vi.fn();
const csrfToken = "z".repeat(43);

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(localeStorageKey, "en");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthStatusControl", () => {
  it.each([true, false])("shows the admin link only for administrators (admin=%s)", async (systemAdministrator) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { session: { csrfToken, user: { systemAdministrator } } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { signedOut: true } }));
    render(<LocaleProvider><AuthStatusControl /></LocaleProvider>);

    const signOut = await screen.findByRole("button", { name: "Sign out" });
    if (systemAdministrator) {
      expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    } else {
      expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    }
    fireEvent.click(signOut);
    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows a compact sign-in link when no local session exists", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    render(<LocaleProvider><AuthStatusControl /></LocaleProvider>);

    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
  });

  it("uses only the session CSRF proof for same-origin sign-out", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ data: { session: { csrfToken, user: { email: "person@example.test" } } } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { signedOut: true } }));
    render(<LocaleProvider><AuthStatusControl /></LocaleProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "POST",
      }),
    );
  });

  it("keeps a sign-out failure friendly and does not render upstream text", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { session: { csrfToken } } }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "An upstream service rejected the request." } }, 503),
      );
    render(<LocaleProvider><AuthStatusControl /></LocaleProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t sign you out. Please try again.",
    );
    expect(screen.queryByText("An upstream service rejected the request.")).not.toBeInTheDocument();
  });

  it("shows a retryable unavailable state instead of pretending an outage is a sign-out", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: "database unavailable" } }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401));
    render(<LocaleProvider><AuthStatusControl /></LocaleProvider>);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account service is temporarily unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry account check" }));
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});
