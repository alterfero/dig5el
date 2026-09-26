import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getLanguages, POST as postLanguages } from "../../../app/api/admin/languages/route";
import { GET as getProjects, POST as postProjects } from "../../../app/api/admin/projects/route";
import { GET as getAccess, POST as postAccess } from "../../../app/api/admin/projects/[projectId]/access/route";
import {
  DELETE as deleteAccess,
  PATCH as patchAccess,
} from "../../../app/api/admin/projects/[projectId]/access/[userId]/route";
import { GET as getUsers } from "../../../app/api/admin/users/route";
import { DELETE as deleteUser, PATCH as patchUser } from "../../../app/api/admin/users/[userId]/route";
import { getLocalAuthRuntime, resetLocalAuthRuntimeForTests } from "../../../server/auth/auth-runtime";
import { hashSessionIdentifier } from "../../../server/auth/session-manager";

const passwordHash = "scrypt-v1$32768$8$1$A0bbwQFplbLZHxJt3ltmdg$XmFvFYHMDndXafW6gLj0_np7GbPL0Ys6Y7U7cedxAqhUKqyRANKKV2foea-wRwfHdB2cVGJC6DALValYruGCkg";
const environmentKeys = [
  "AUTH_SESSION_TTL_SECONDS",
  "DATABASE_URL",
  "DIG4EL_APP_ORIGIN",
  "DIG4EL_AUTH_MODE",
  "DIG4EL_ENVIRONMENT",
  "DIG4EL_LOG_LEVEL",
  "DIG4EL_TRUST_PROXY",
  "PLAID_AUTH_MODE",
  "SESSION_ENCRYPTION_KEY",
] as const;
const originalEnvironment = new Map<string, string | undefined>();

type Issued = { cookieValue: string; csrfToken: string };

async function issueActiveSession(id: string, email: string): Promise<Issued> {
  const runtime = getLocalAuthRuntime();
  const now = new Date();
  await runtime.persistence.store.createUser({
    activatedAt: now,
    email,
    id,
    now,
    passwordHash,
    status: "active",
  });
  const issued = await runtime.sessions.issue(id);
  return { cookieValue: issued.cookieValue, csrfToken: issued.csrfToken };
}

function request(
  url: string,
  method: string,
  issued?: Issued,
  options: { body?: unknown; csrf?: boolean; origin?: string } = {},
): Request {
  const headers = new Headers();
  if (issued) headers.set("cookie", `dig4el_session=${issued.cookieValue}`);
  if (options.origin) headers.set("origin", options.origin);
  if (options.csrf && issued) headers.set("x-dig4el-csrf", issued.csrfToken);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method,
  });
}

beforeEach(async () => {
  await resetLocalAuthRuntimeForTests();
  for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);
  Object.assign(process.env, {
    DIG4EL_APP_ORIGIN: "http://localhost:3000",
    DIG4EL_AUTH_MODE: "local-password",
    DIG4EL_ENVIRONMENT: "development",
    DIG4EL_LOG_LEVEL: "silent",
    DIG4EL_TRUST_PROXY: "false",
    PLAID_AUTH_MODE: "disabled",
    SESSION_ENCRYPTION_KEY: "f".repeat(64),
  });
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SESSION_TTL_SECONDS;
});

afterEach(async () => {
  await resetLocalAuthRuntimeForTests();
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnvironment.clear();
});

describe("local administration API", () => {
  it("requires an authenticated session for local project discovery", async () => {
    const response = await getProjects(request("http://localhost:3000/api/admin/projects", "GET"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("rejects an expired session on an administration route", async () => {
    const issued = await issueActiveSession(
      "00000000-0000-4000-8000-000000000200",
      "expired@example.test",
    );
    const runtime = getLocalAuthRuntime();
    const idHash = hashSessionIdentifier(issued.cookieValue, runtime.sessions.sessionSecret);
    if (!idHash) throw new Error("Expected a valid opaque session identifier.");
    const stored = await runtime.persistence.store.findSession(idHash);
    if (!stored) throw new Error("Expected a stored session.");
    await runtime.persistence.store.updateSession({ ...stored, expiresAt: new Date(0) });

    const response = await getProjects(request("http://localhost:3000/api/admin/projects", "GET", issued));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  });

  it("searches the catalog and creates a provenance-bearing custom language through the protected route", async () => {
    const administratorId = "00000000-0000-4000-8000-000000000206";
    const readerId = "00000000-0000-4000-8000-000000000207";
    const administrator = await issueActiveSession(administratorId, "language-admin@example.test");
    const reader = await issueActiveSession(readerId, "language-reader@example.test");
    const languageUrl = "http://localhost:3000/api/admin/languages";
    const customLanguageBody = {
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
    };

    const anonymousSearch = await getLanguages(request(`${languageUrl}?query=tahi`, "GET"));
    expect(anonymousSearch.status).toBe(401);
    await expect(anonymousSearch.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const readerSearch = await getLanguages(request(`${languageUrl}?query=tahi`, "GET", reader));
    expect(readerSearch.status).toBe(200);
    await expect(readerSearch.json()).resolves.toMatchObject({
      data: {
        languages: expect.arrayContaining([
          expect.objectContaining({ id: "catalog:Tahitian", name: "Tahitian", source: "catalog" }),
        ]),
      },
    });

    const anonymousCreate = await postLanguages(request(languageUrl, "POST", undefined, {
      body: customLanguageBody,
      origin: "http://localhost:3000",
    }));
    expect(anonymousCreate.status).toBe(401);
    await expect(anonymousCreate.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });

    const nonAdministratorCreate = await postLanguages(request(languageUrl, "POST", reader, {
      body: customLanguageBody,
      csrf: true,
      origin: "http://localhost:3000",
    }));
    expect(nonAdministratorCreate.status).toBe(403);
    await expect(nonAdministratorCreate.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });

    await getLocalAuthRuntime().persistence.store.bootstrapSystemAdministrator({
      now: new Date(),
      requestId: "bootstrap_language_admin",
      targetEmail: "language-admin@example.test",
    });

    const missingCsrf = await postLanguages(request(languageUrl, "POST", administrator, {
      body: customLanguageBody,
      origin: "http://localhost:3000",
    }));
    expect(missingCsrf.status).toBe(403);

    const wrongOrigin = await postLanguages(request(languageUrl, "POST", administrator, {
      body: customLanguageBody,
      csrf: true,
      origin: "https://attacker.example.test",
    }));
    expect(wrongOrigin.status).toBe(403);
    await expect(wrongOrigin.json()).resolves.toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });

    const extraField = await postLanguages(request(languageUrl, "POST", administrator, {
      body: { ...customLanguageBody, untrusted: true },
      csrf: true,
      origin: "http://localhost:3000",
    }));
    expect(extraField.status).toBe(400);
    await expect(extraField.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });

    const created = await postLanguages(request(languageUrl, "POST", administrator, {
      body: customLanguageBody,
      csrf: true,
      origin: "http://localhost:3000",
    }));
    expect(created.status).toBe(201);
    const createdPayload = await created.json() as {
      data: { language: { id: string; name: string; regionOrCountry: string; source: string } };
    };
    expect(createdPayload.data.language).toMatchObject({
      id: expect.stringMatching(/^custom:/u),
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
      source: "custom",
    });
    const customId = createdPayload.data.language.id.slice("custom:".length);
    await expect(getLocalAuthRuntime().persistence.store.findCustomLanguage(customId)).resolves.toMatchObject({
      createdAt: expect.any(Date),
      createdByUserId: administratorId,
      id: customId,
      name: "Te Reo Vāna",
      regionOrCountry: "Te Moana-nui-a-Kiwa",
    });

    const customSearch = await getLanguages(request(`${languageUrl}?query=vana`, "GET", administrator));
    await expect(customSearch.json()).resolves.toMatchObject({
      data: { languages: expect.arrayContaining([expect.objectContaining({ id: createdPayload.data.language.id })]) },
    });

    const duplicate = await postLanguages(request(languageUrl, "POST", administrator, {
      body: { name: "Te Reo Vana", regionOrCountry: "Another region" },
      csrf: true,
      origin: "http://localhost:3000",
    }));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: "LANGUAGE_EXISTS" } });

    const createdProject = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      administrator,
      {
        body: { languageKey: createdPayload.data.language.id },
        csrf: true,
        origin: "http://localhost:3000",
      },
    ));
    expect(createdProject.status).toBe(201);
    await expect(createdProject.json()).resolves.toMatchObject({
      data: {
        project: {
          languageKey: createdPayload.data.language.id,
          name: "Te Reo Vāna",
        },
      },
    });
  });

  it("requires same-origin CSRF proof for every local administration mutation", async () => {
    const administratorId = "00000000-0000-4000-8000-000000000201";
    const issued = await issueActiveSession(administratorId, "admin@example.test");
    await getLocalAuthRuntime().persistence.store.bootstrapSystemAdministrator({
      now: new Date(),
      requestId: "bootstrap_api_admin",
      targetEmail: "admin@example.test",
    });

    const missingCsrf = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      issued,
      { body: { languageKey: "catalog:Tahitian" }, origin: "http://localhost:3000" },
    ));
    expect(missingCsrf.status).toBe(403);

    const wrongOrigin = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      issued,
      {
        body: { languageKey: "catalog:Tahitian" },
        csrf: true,
        origin: "https://attacker.example.test",
      },
    ));
    expect(wrongOrigin.status).toBe(403);
    await expect(wrongOrigin.json()).resolves.toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });

    const created = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      issued,
      { body: { languageKey: "catalog:Tahitian" }, csrf: true, origin: "http://localhost:3000" },
    ));
    expect(created.status).toBe(201);
    const createdPayload = await created.json() as { data: { project: { id: string; languageKey: string; name: string } } };
    expect(createdPayload.data.project).toMatchObject({ languageKey: "catalog:Tahitian", name: "Tahitian" });
    const projectId = createdPayload.data.project.id;

    const missingPatchCsrf = await patchAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access/${administratorId}`, "PATCH", issued, {
        body: { caretaker: true, role: "maintainer" },
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId, userId: administratorId }) },
    );
    expect(missingPatchCsrf.status).toBe(403);
    const missingGrantCsrf = await postAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access`, "POST", issued, {
        body: { caretaker: false, email: "nobody@example.test", role: "reader" },
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(missingGrantCsrf.status).toBe(403);
    const missingDeleteCsrf = await deleteAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access/${administratorId}`, "DELETE", issued, {
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId, userId: administratorId }) },
    );
    expect(missingDeleteCsrf.status).toBe(403);
  });

  it("returns safe flattened local roster DTOs and distinct authorization errors", async () => {
    const administratorId = "00000000-0000-4000-8000-000000000202";
    const writerId = "00000000-0000-4000-8000-000000000203";
    const administrator = await issueActiveSession(administratorId, "admin@example.test");
    const writer = await issueActiveSession(writerId, "writer@example.test");
    const runtime = getLocalAuthRuntime();
    await runtime.persistence.store.bootstrapSystemAdministrator({
      now: new Date(),
      requestId: "bootstrap_api_admin",
      targetEmail: "admin@example.test",
    });
    const created = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      administrator,
      { body: { languageKey: "catalog:Tahitian" }, csrf: true, origin: "http://localhost:3000" },
    ));
    const projectId = (await created.json() as { data: { project: { id: string } } }).data.project.id;

    const missingUser = await postAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access`, "POST", administrator, {
        body: { caretaker: false, email: "nobody@example.test", role: "reader" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(missingUser.status).toBe(404);
    await expect(missingUser.json()).resolves.toMatchObject({ error: { code: "USER_NOT_FOUND" } });

    const granted = await postAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access`, "POST", administrator, {
        body: { caretaker: true, email: "writer@example.test", role: "writer" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(granted.status).toBe(201);

    const projects = await getProjects(request(
      "http://localhost:3000/api/admin/projects",
      "GET",
      writer,
    ));
    await expect(projects.json()).resolves.toMatchObject({
      data: {
        projects: [{
          canManageAccess: false,
          caretaker: true,
          id: projectId,
          name: "Tahitian",
          role: "writer",
        }],
        systemAdministrator: false,
      },
    });

    const access = await getAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access`, "GET", administrator),
      { params: Promise.resolve({ projectId }) },
    );
    const accessPayload = await access.json() as {
      data: { audit: Array<{ actor: { email: string } | null; target: { email: string } | null }>; members: Array<{ email: string; userId: string }> };
    };
    expect(access.status).toBe(200);
    expect(accessPayload.data.members).toEqual(expect.arrayContaining([
      expect.objectContaining({
        email: "admin@example.test",
        systemAdministrator: true,
        userId: administratorId,
      }),
      expect.objectContaining({
        email: "writer@example.test",
        systemAdministrator: false,
        userId: writerId,
      }),
    ]));
    expect(accessPayload.data.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actor: { email: "admin@example.test", id: administratorId },
        target: { email: "writer@example.test", id: writerId },
      }),
    ]));

    const nonAdministratorUsers = await getUsers(request(
      "http://localhost:3000/api/admin/users",
      "GET",
      writer,
    ));
    expect(nonAdministratorUsers.status).toBe(403);

    const administratorUsers = await getUsers(request(
      "http://localhost:3000/api/admin/users",
      "GET",
      administrator,
    ));
    await expect(administratorUsers.json()).resolves.toMatchObject({
      data: {
        users: expect.arrayContaining([
          expect.objectContaining({
            email: "admin@example.test",
            id: administratorId,
            systemAdministrator: true,
          }),
        ]),
      },
    });

    const lastMaintainer = await deleteAccess(
      request(`http://localhost:3000/api/admin/projects/${projectId}/access/${administratorId}`, "DELETE", administrator, {
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ projectId, userId: administratorId }) },
    );
    expect(lastMaintainer.status).toBe(409);
    await expect(lastMaintainer.json()).resolves.toMatchObject({
      error: { code: "LAST_PROJECT_MAINTAINER" },
    });
  });

  it("lets a system administrator update a global user type and exact caretaker project set", async () => {
    const administratorId = "00000000-0000-4000-8000-000000000204";
    const targetId = "00000000-0000-4000-8000-000000000205";
    const administrator = await issueActiveSession(administratorId, "admin-update@example.test");
    const target = await issueActiveSession(targetId, "target-update@example.test");
    const runtime = getLocalAuthRuntime();
    await runtime.persistence.store.bootstrapSystemAdministrator({
      now: new Date(),
      requestId: "bootstrap_user_update_admin",
      targetEmail: "admin-update@example.test",
    });

    const firstProjectResponse = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      administrator,
      { body: { languageKey: "catalog:Tahitian" }, csrf: true, origin: "http://localhost:3000" },
    ));
    const firstProjectId = (await firstProjectResponse.json() as { data: { project: { id: string } } })
      .data.project.id;
    const secondProjectResponse = await postProjects(request(
      "http://localhost:3000/api/admin/projects",
      "POST",
      administrator,
      { body: { languageKey: "catalog:English" }, csrf: true, origin: "http://localhost:3000" },
    ));
    const secondProjectId = (await secondProjectResponse.json() as { data: { project: { id: string } } })
      .data.project.id;

    const finalAdministrator = await patchUser(
      request(`http://localhost:3000/api/admin/users/${administratorId}`, "PATCH", administrator, {
        body: { caretakerProjectIds: [], systemAdministrator: false },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ userId: administratorId }) },
    );
    expect(finalAdministrator.status).toBe(409);
    await expect(finalAdministrator.json()).resolves.toMatchObject({
      error: { code: "LAST_SYSTEM_ADMINISTRATOR" },
    });

    const unknownProject = await patchUser(
      request(`http://localhost:3000/api/admin/users/${targetId}`, "PATCH", administrator, {
        body: {
          caretakerProjectIds: ["00000000-0000-4000-8000-000000000299"],
          systemAdministrator: true,
        },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ userId: targetId }) },
    );
    expect(unknownProject.status).toBe(404);
    await expect(unknownProject.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
    await expect(runtime.persistence.store.isSystemAdministrator(targetId)).resolves.toBe(false);

    const missingCsrf = await patchUser(
      request(`http://localhost:3000/api/admin/users/${targetId}`, "PATCH", administrator, {
        body: { caretakerProjectIds: [], systemAdministrator: false },
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ userId: targetId }) },
    );
    expect(missingCsrf.status).toBe(403);

    const forbidden = await patchUser(
      request(`http://localhost:3000/api/admin/users/${administratorId}`, "PATCH", target, {
        body: { caretakerProjectIds: [], systemAdministrator: true },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ userId: administratorId }) },
    );
    expect(forbidden.status).toBe(403);

    const updated = await patchUser(
      request(`http://localhost:3000/api/admin/users/${targetId}`, "PATCH", administrator, {
        body: {
          caretakerProjectIds: [secondProjectId, firstProjectId],
          systemAdministrator: true,
        },
        csrf: true,
        origin: "http://localhost:3000",
      }),
      { params: Promise.resolve({ userId: targetId }) },
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: {
        user: {
          caretakerProjectIds: [firstProjectId, secondProjectId].sort(),
          id: targetId,
          systemAdministrator: true,
        },
      },
    });

    const users = await getUsers(request("http://localhost:3000/api/admin/users", "GET", administrator));
    await expect(users.json()).resolves.toMatchObject({
      data: {
        projects: expect.arrayContaining([
          expect.objectContaining({ id: firstProjectId, name: "Tahitian" }),
          expect.objectContaining({ id: secondProjectId, name: "English" }),
        ]),
        users: expect.arrayContaining([
          expect.objectContaining({
            caretakerProjectIds: [firstProjectId, secondProjectId].sort(),
            id: targetId,
            systemAdministrator: true,
          }),
        ]),
      },
    });

    const firstAccess = await getAccess(
      request(`http://localhost:3000/api/admin/projects/${firstProjectId}/access`, "GET", administrator),
      { params: Promise.resolve({ projectId: firstProjectId }) },
    );
    await expect(firstAccess.json()).resolves.toMatchObject({
      data: {
        members: expect.arrayContaining([
          expect.objectContaining({ caretaker: true, role: "writer", userId: targetId }),
        ]),
      },
    });
  });
});


it("protects user deletion with CSRF and revokes the deleted user's session", async () => {
  const ownerId = "00000000-0000-4000-8000-000000000901";
  const targetId = "00000000-0000-4000-8000-000000000902";
  const owner = await issueActiveSession(ownerId, "owner@example.test");
  const target = await issueActiveSession(targetId, "target@example.test");
  await getLocalAuthRuntime().persistence.store.bootstrapSystemAdministrator({
    now: new Date(), requestId: "bootstrap", targetEmail: "owner@example.test",
  });
  const url = `http://localhost:3000/api/admin/users/${targetId}`;
  const context = { params: Promise.resolve({ userId: targetId }) };
  expect((await deleteUser(request(url, "DELETE", owner, { origin: "http://localhost:3000" }), context)).status).toBe(403);
  expect((await deleteUser(request(url, "DELETE", target, { csrf: true, origin: "http://localhost:3000" }), context)).status).toBe(403);
  expect((await deleteUser(request(url, "DELETE", owner, { csrf: true, origin: "http://localhost:3000" }), context)).status).toBe(200);
  expect((await getProjects(request("http://localhost:3000/api/admin/projects", "GET", target))).status).toBe(401);
});
