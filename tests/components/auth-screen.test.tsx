// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "../../components/auth-screen";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";

const fetchMock = vi.fn();

function renderAuth(
  mode: ComponentProps<typeof AuthScreen>["mode"],
  props: Partial<ComponentProps<typeof AuthScreen>> = {},
) {
  return render(
    <LocaleProvider>
      <AuthScreen mode={mode} {...props} />
    </LocaleProvider>,
  );
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  window.localStorage.setItem(localeStorageKey, "en");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthScreen", () => {
  it("submits a same-origin login, shows progress, and lets the host navigate after success", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finishRequest = resolve;
      }),
    );
    const onNavigate = vi.fn();
    renderAuth("login", { onNavigate });

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: "a password for sign in" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "person@example.test", password: "a password for sign in" }),
      }),
    );

    finishRequest?.(jsonResponse({ data: { redirectTo: "/" } }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows a friendly authentication error without revealing server details", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "INVALID_CREDENTIALS", message: "database lookup was denied" } },
        401,
      ),
    );
    renderAuth("login", { onNavigate: vi.fn() });

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "wrong password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("That email or password doesn’t look right.");
    expect(screen.queryByText("database lookup was denied")).not.toBeInTheDocument();
  });

  it("explains when DIG4EL is opened at a different local address", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "ORIGIN_MISMATCH", message: "CSRF origin rejected" } },
        403,
      ),
    );
    renderAuth("login", { onNavigate: vi.fn() });

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "person@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "a password for sign in" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Open DIG4EL at its configured local address (usually http://localhost:3000), then try again.",
    );
    expect(screen.queryByText("CSRF origin rejected")).not.toBeInTheDocument();
  });

  it("sets up an account with an administrator-issued token and no email field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { redirectTo: "/" } }));
    const onNavigate = vi.fn();
    renderAuth("register", { initialToken: "setup-token", onNavigate });

    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        body: JSON.stringify({ token: "setup-token", password: "this is a long enough password" }),
      }),
    );
  });

  it("requires a setup token before an account can be set up", async () => {
    renderAuth("register", { onNavigate: vi.fn() });

    fireEvent.change(await screen.findByLabelText(/^Password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your token.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a setup token from the URL fragment and clears it before submitting", async () => {
    const token = "s".repeat(43);
    const onNavigate = vi.fn();
    window.history.replaceState(null, "", `/register#token=${token}`);
    fetchMock.mockResolvedValue(jsonResponse({ data: { redirectTo: "/" } }));
    renderAuth("register", { onNavigate });

    fireEvent.change(await screen.findByLabelText(/^Password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"));
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ body: JSON.stringify({ token, password: "this is a long enough password" }) }),
    );
  });

  it("keeps recovery email-free and directs a person to their administrator", async () => {
    renderAuth("recover");

    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByText(/Ask a system administrator for a one-time recovery token/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use a recovery token" })).toHaveAttribute(
      "href",
      "/reset-password",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a manual recovery token only to the confirm endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { redirectTo: "/" } }));
    const onNavigate = vi.fn();
    renderAuth("reset", { initialToken: "recovery-token", onNavigate });

    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm password/), {
      target: { value: "this is a long enough password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password-reset/confirm",
      expect.objectContaining({
        body: JSON.stringify({ token: "recovery-token", password: "this is a long enough password" }),
      }),
    );
  });

  it("uses French messages and validates token-password confirmation locally", async () => {
    window.localStorage.setItem(localeStorageKey, "fr");
    renderAuth("register", { initialToken: "jeton" });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Configurez votre compte" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Mot de passe/), {
      target: { value: "un mot de passe suffisamment long" },
    });
    fireEvent.change(screen.getByLabelText(/^Confirmer le mot de passe/), {
      target: { value: "un autre mot de passe suffisamment long" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Définir le mot de passe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Les mots de passe ne correspondent pas.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
