// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAccessScreen } from "../../components/admin-access-screen";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";

const fetchMock = vi.fn();
const csrfToken = "s".repeat(43);
const projectId = "00000000-0000-4000-8000-000000000080";
const catalogLanguage = {
  id: "catalog:Tahitian",
  name: "Tahitian",
  regionOrCountry: null,
  source: "catalog",
};
let rejectLastSystemAdministrator = false;

function response(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function mockHealthyAdministration() {
  fetchMock.mockImplementation((input: string | URL | Request, options?: RequestInit) => {
    const path = typeof input === "string" ? input : input.toString();
    if (path === "/api/auth/session") {
      return Promise.resolve(response({ data: { session: { csrfToken } } }));
    }
    if (path === "/api/admin/projects" && (!options?.method || options.method === "GET")) {
      return Promise.resolve(response({
        data: {
          projects: [{
            caretaker: true,
            canManageAccess: true,
            id: projectId,
            name: "Tahitian",
            role: "maintainer",
          }],
          systemAdministrator: true,
        },
      }));
    }
    if (path === "/api/admin/projects" && options?.method === "POST") {
      return Promise.resolve(response({
        data: {
          project: {
            id: "00000000-0000-4000-8000-000000000090",
            languageKey: catalogLanguage.id,
            name: catalogLanguage.name,
          },
        },
      }, 201));
    }
    if (path.startsWith("/api/admin/languages?query=")) {
      return Promise.resolve(response({ data: { languages: [catalogLanguage] } }));
    }
    if (path === `/api/admin/projects/${projectId}/access`) {
      if (options?.method === "POST") return Promise.resolve(response({ data: { ok: true } }));
      return Promise.resolve(response({
        data: {
          audit: [{
            action: "membership.granted",
            actor: { email: "owner@example.test", id: "00000000-0000-4000-8000-000000000001" },
            id: "00000000-0000-4000-8000-000000000081",
            occurredAt: "2026-09-17T10:00:00.000Z",
            target: { email: "friend@example.test", id: "00000000-0000-4000-8000-000000000002" },
          }],
          canManageAccess: true,
          members: [{
            caretaker: true,
            email: "owner@example.test",
            role: "maintainer",
            systemAdministrator: true,
            userId: "00000000-0000-4000-8000-000000000001",
          }],
          project: {
            id: projectId,
            name: "Tahitian",
          },
          systemAdministrator: true,
        },
      }));
    }
    if (path === "/api/admin/users" && options?.method === "POST") {
      return Promise.resolve(response({
        data: {
          setupToken: { expiresAt: "2026-09-18T10:00:00.000Z", token: "setup-token" },
          user: { email: "new@example.test", id: "00000000-0000-4000-8000-000000000003", status: "pending_activation" },
        },
      }, 201));
    }
    if (path === "/api/admin/users") {
      return Promise.resolve(response({
        data: {
          projects: [{ id: projectId, name: "Tahitian" }],
          users: [
            {
              caretakerProjectIds: [projectId],
              email: "owner@example.test",
              id: "00000000-0000-4000-8000-000000000001",
              status: "active",
              systemAdministrator: true,
            },
            {
              caretakerProjectIds: [],
              email: "waiting@example.test",
              id: "00000000-0000-4000-8000-000000000004",
              status: "pending_activation",
              systemAdministrator: false,
            },
            {
              caretakerProjectIds: [],
              email: "disabled@example.test",
              id: "00000000-0000-4000-8000-000000000005",
              status: "disabled",
              systemAdministrator: false,
            },
          ],
        },
      }));
    }
    if (path === "/api/admin/users/00000000-0000-4000-8000-000000000001" && options?.method === "PATCH") {
      if (rejectLastSystemAdministrator) {
        return Promise.resolve(response({ error: { code: "LAST_SYSTEM_ADMINISTRATOR" } }, 409));
      }
      return Promise.resolve(response({ data: { user: {} } }));
    }
    if (path === "/api/admin/users/00000000-0000-4000-8000-000000000004" && options?.method === "PATCH") {
      return Promise.resolve(response({ data: { user: {} } }));
    }
    if (path === "/api/admin/users/00000000-0000-4000-8000-000000000004/registration-token") {
      return Promise.resolve(response({
        data: { setupToken: { expiresAt: "2026-09-18T10:00:00.000Z", token: "replacement-setup-token" } },
      }));
    }
    if (path === "/api/admin/users/00000000-0000-4000-8000-000000000001/recovery-token") {
      return Promise.resolve(response({
        data: { recoveryToken: { expiresAt: "2026-09-18T10:00:00.000Z", token: "recovery-token" } },
      }));
    }
    return Promise.resolve(response({ error: { code: "NOT_FOUND" } }, 404));
  });
}

function renderScreen() {
  return render(<LocaleProvider><AdminAccessScreen /></LocaleProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(localeStorageKey, "en");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
  fetchMock.mockReset();
  rejectLastSystemAdministrator = false;
  mockHealthyAdministration();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminAccessScreen", () => {
  it("uses plain-language access choices and keeps system administration distinct", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "People and access" })).toBeInTheDocument();
    expect(screen.getByText("System administration")).toBeInTheDocument();
    expect(screen.getByText(/does not make you a caretaker/i)).toBeInTheDocument();
    expect(screen.getByText("What each choice means")).toBeInTheDocument();
    expect(screen.getByText(/Viewer — can look at the documentation/i)).toBeInTheDocument();
    expect(screen.getByText(/Language caretaker is a separate/i)).toBeInTheDocument();
    expect((await screen.findAllByText("owner@example.test")).length).toBeGreaterThan(0);
    expect(await screen.findAllByLabelText("User type")).toHaveLength(3);
    expect(screen.getAllByText("Caretaker languages")).toHaveLength(3);
    expect(screen.getAllByText(/may grant contributor-level project access/i)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/projects",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("switches language spaces and shows only the selected space's access information", async () => {
    const defaultFetch = fetchMock.getMockImplementation()!;
    let resolveAccess!: (value: Response) => void;
    fetchMock.mockImplementation((input: string, options?: RequestInit) => {
      if (input === "/api/admin/projects") {
        return Promise.resolve(response({ data: {
          projects: [
            { id: projectId, name: "Tahitian", role: "maintainer", caretaker: true, canManageAccess: true },
            { id: "second-space", name: "French", role: "maintainer", caretaker: false, canManageAccess: true },
          ],
          systemAdministrator: false,
        } }));
      }
      if (input === "/api/admin/projects/second-space/access") {
        return new Promise<Response>((resolve) => { resolveAccess = resolve; });
      }
      return defaultFetch(input, options);
    });
    renderScreen();

    const picker = await screen.findByRole("combobox", { name: "Language space" });
    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual(["Tahitian", "French"]);
    expect(await screen.findByText("owner@example.test")).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "second-space" } });
    expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("friend@example.test")).not.toBeInTheDocument();
    await waitFor(() => expect(resolveAccess).toBeDefined());
    resolveAccess(response({ data: {
      project: { id: "second-space", name: "French" },
      canManageAccess: true,
      systemAdministrator: false,
      audit: [],
      members: [{ userId: "french-manager", email: "french@example.test", role: "maintainer", caretaker: false }],
    } }));
    expect(await screen.findByText("french@example.test")).toBeInTheDocument();
    expect(picker).toHaveValue("second-space");
    expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
  });

  it("sends a same-origin CSRF-protected access invitation without exposing server messages", async () => {
    renderScreen();

    const email = await screen.findByLabelText("Their DIG4EL email");
    fireEvent.change(email, { target: { value: "friend@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Give access" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/projects/${projectId}/access`,
        expect.objectContaining({
          body: JSON.stringify({ caretaker: false, email: "friend@example.test", role: "reader" }),
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "POST",
        }),
      );
    });
  });

  it("creates a language space from a selected catalogue language using its language key", async () => {
    renderScreen();

    const languageInput = await screen.findByRole<HTMLInputElement>("combobox", {
      name: "Language name",
    });
    fireEvent.change(languageInput, { target: { value: "Tahi" } });
    fireEvent.click(await within(await screen.findByRole("listbox")).findByRole("option", { name: /Tahitian/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create space" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/languages?query=Tahi",
        expect.objectContaining({ credentials: "same-origin" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/projects",
        expect.objectContaining({
          body: JSON.stringify({ languageKey: catalogLanguage.id }),
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "POST",
        }),
      );
    });
    expect(await screen.findByText("Language space created.")).toBeInTheDocument();
  });

  it("lets a system administrator create an account and shows its setup token only after success", async () => {
    renderScreen();

    fireEvent.change(await screen.findByLabelText("Their email"), {
      target: { value: "new@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({
          body: JSON.stringify({ email: "new@example.test" }),
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "POST",
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Give them this setup token" })).toBeInTheDocument();
    expect(screen.getByLabelText("One-time token")).toHaveValue("setup-token");
    expect(screen.getByText(/It appears only once/i)).toBeInTheDocument();
  });

  it("uses the dedicated registration-token route for a person still setting up", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "New setup token" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/00000000-0000-4000-8000-000000000004/registration-token",
        expect.objectContaining({
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "POST",
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Give them this setup token" })).toBeInTheDocument();
    expect(screen.getByLabelText("One-time token")).toHaveValue("replacement-setup-token");
  });

  it("uses the dedicated recovery-token route for an active account", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "New recovery token" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/00000000-0000-4000-8000-000000000001/recovery-token",
        expect.objectContaining({
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "POST",
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Give them this recovery token" })).toBeInTheDocument();
    expect(screen.getByLabelText("One-time token")).toHaveValue("recovery-token");
  });

  it("updates a user's type and caretaker languages through the CSRF-protected user route", async () => {
    renderScreen();

    const usersCard = (await screen.findByRole("heading", { name: "DIG4EL accounts" })).closest("section");
    expect(usersCard).not.toBeNull();
    const userRow = (await within(usersCard!).findByText("waiting@example.test")).closest("li");
    expect(userRow).not.toBeNull();
    const row = within(userRow!);
    fireEvent.change(row.getByLabelText("User type"), {
      target: { value: "system-administrator" },
    });
    fireEvent.click(row.getByLabelText("Tahitian"));
    fireEvent.click(row.getByRole("button", { name: "Save user settings" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/00000000-0000-4000-8000-000000000004",
        expect.objectContaining({
          body: JSON.stringify({ caretakerProjectIds: [projectId], systemAdministrator: true }),
          credentials: "same-origin",
          headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }),
          method: "PATCH",
        }),
      );
    });
    expect(await row.findByText("User settings saved.")).toBeInTheDocument();
  });

  it("explains why the final system administrator cannot be demoted", async () => {
    rejectLastSystemAdministrator = true;
    renderScreen();

    const usersCard = (await screen.findByRole("heading", { name: "DIG4EL accounts" })).closest("section");
    expect(usersCard).not.toBeNull();
    const userRow = (await within(usersCard!).findByText("owner@example.test")).closest("li");
    expect(userRow).not.toBeNull();
    const row = within(userRow!);
    fireEvent.change(row.getByLabelText("User type"), {
      target: { value: "standard-user" },
    });
    fireEvent.click(row.getByRole("button", { name: "Save user settings" }));

    expect(await row.findByRole("alert")).toHaveTextContent(
      "Keep at least one system administrator.",
    );
  });

  it("keeps user-management controls read-only for a disabled account", async () => {
    renderScreen();

    const usersCard = (await screen.findByRole("heading", { name: "DIG4EL accounts" })).closest("section");
    expect(usersCard).not.toBeNull();
    const userRow = (await within(usersCard!).findByText("disabled@example.test")).closest("li");
    expect(userRow).not.toBeNull();
    const row = within(userRow!);
    expect(row.getByLabelText("User type")).toBeDisabled();
    expect(row.getByLabelText("Tahitian")).toBeDisabled();
    expect(row.getByText("This account is unavailable and cannot receive local operational access.")).toBeInTheDocument();
  });

  it("keeps an unavailable access service friendly", async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const path = typeof input === "string" ? input : input.toString();
      if (path === "/api/auth/session") {
        return Promise.resolve(response({ data: { session: { csrfToken } } }));
      }
      return Promise.resolve(response({ error: { code: "INTERNAL", message: "postgres role password rejected" } }, 503));
    });
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not open language access right now.",
    );
    expect(screen.queryByText("postgres role password rejected")).not.toBeInTheDocument();
  });
});


it("confirms deletion of an admin and sends a protected DELETE request", async () => {
  renderScreen();
  const usersCard = (await screen.findByRole("heading", { name: "DIG4EL accounts" })).closest("section")!;
  const userRow = (await within(usersCard).findByText("owner@example.test")).closest("li")!;
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(within(userRow).getByRole("button", { name: "Delete user" }));
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fetchMock.mockImplementationOnce(() => Promise.resolve(response({ data: { deleted: true } })));
  fireEvent.click(within(userRow).getByRole("button", { name: "Delete user" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/users/00000000-0000-4000-8000-000000000001",
    expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "x-dig4el-csrf": csrfToken }) }),
  ));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("owner@example.test"));
});
