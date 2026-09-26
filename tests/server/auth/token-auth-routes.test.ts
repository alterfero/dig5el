import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postLogin } from "../../../app/api/auth/login/route";
import { GET as getSession } from "../../../app/api/auth/session/route";
import { POST as postRegistration } from "../../../app/api/auth/register/route";
import { POST as postRecoveryConfirmation } from "../../../app/api/auth/password-reset/confirm/route";
import { POST as postUser } from "../../../app/api/admin/users/route";
import { POST as postRecoveryToken } from "../../../app/api/admin/users/[userId]/recovery-token/route";
import { POST as postRegistrationToken } from "../../../app/api/admin/users/[userId]/registration-token/route";
import { getLocalAuthRuntime, resetLocalAuthRuntimeForTests } from "../../../server/auth/auth-runtime";
import { hashPassword } from "../../../server/auth/passwords";

const administratorId = "00000000-0000-4000-8000-000000000301";
const ordinaryId = "00000000-0000-4000-8000-000000000302";
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

async function issueActiveSession(id: string, email: string, administrator = false): Promise<Issued> {
  const runtime = getLocalAuthRuntime();
  const now = new Date();
  await runtime.persistence.store.createUser({
    activatedAt: now,
    email,
    id,
    now,
    passwordHash: await hashPassword("welcome-to-dig4el"),
    status: "active",
  });
  if (administrator) {
    await runtime.persistence.store.bootstrapSystemAdministrator({
      now,
      requestId: "bootstrap_token_routes",
      targetEmail: email,
    });
  }
  const session = await runtime.sessions.issue(id);
  return { cookieValue: session.cookieValue, csrfToken: session.csrfToken };
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
    SESSION_ENCRYPTION_KEY: "6".repeat(64),
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

describe("administrator-issued token API", () => {
  it("rejects unauthenticated, non-administrator, cross-origin, and CSRF-less account creation", async () => {
    const unauthenticated = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", undefined, {
        body: { email: "new@example.test" },
        origin: "http://localhost:3000",
      }),
    );
    expect(unauthenticated.status).toBe(401);

    const ordinary = await issueActiveSession(ordinaryId, "ordinary@example.test");
    const nonAdministrator = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", ordinary, {
        body: { email: "new@example.test" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
    );
    expect(nonAdministrator.status).toBe(403);

    const administrator = await issueActiveSession(administratorId, "admin@example.test", true);
    const missingCsrf = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", administrator, {
        body: { email: "new@example.test" },
        origin: "http://localhost:3000",
      }),
    );
    expect(missingCsrf.status).toBe(403);
    const wrongOrigin = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", administrator, {
        body: { email: "new@example.test" },
        csrf: true,
        origin: "https://attacker.example.test",
      }),
    );
    expect(wrongOrigin.status).toBe(403);
    await expect(wrongOrigin.json()).resolves.toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });
  });

  it("returns a setup token once, activates a pending account, and rejects token replay", async () => {
    const administrator = await issueActiveSession(administratorId, "admin@example.test", true);
    const created = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", administrator, {
        body: { email: "new-person@example.test" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
    );
    expect(created.status).toBe(201);
    const payload = await created.json() as {
      data: { setupToken: { expiresAt: string; token: string }; user: { id: string; status: string } };
    };
    expect(payload.data.user.status).toBe("pending_activation");
    expect(payload.data.setupToken.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.headers.get("cache-control")).toContain("no-store");
    const audit = await getLocalAuthRuntime().persistence.store.listAuthAccountAudit(
      payload.data.user.id,
      10,
    );
    expect(JSON.stringify(audit)).not.toContain(payload.data.setupToken.token);

    const registered = await postRegistration(
      request("http://localhost:3000/api/auth/register", "POST", undefined, {
        body: { password: "a-new-welcome-to-dig4el", token: payload.data.setupToken.token },
        origin: "http://localhost:3000",
      }),
    );
    expect(registered.status).toBe(200);
    expect(registered.headers.get("set-cookie")).toContain("HttpOnly");
    const replay = await postRegistration(
      request("http://localhost:3000/api/auth/register", "POST", undefined, {
        body: { password: "another-new-welcome-password", token: payload.data.setupToken.token },
        origin: "http://localhost:3000",
      }),
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "INVALID_OR_EXPIRED_TOKEN" } });
  });

  it("replaces a pending setup code and only allows recovery codes for active accounts", async () => {
    const administrator = await issueActiveSession(administratorId, "admin@example.test", true);
    const created = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", administrator, {
        body: { email: "reissue@example.test" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
    );
    const payload = await created.json() as { data: { setupToken: { token: string }; user: { id: string } } };
    const replaced = await postRegistrationToken(
      request(
        `http://localhost:3000/api/admin/users/${payload.data.user.id}/registration-token`,
        "POST",
        administrator,
        { csrf: true, origin: "http://localhost:3000" },
      ),
      { params: Promise.resolve({ userId: payload.data.user.id }) },
    );
    expect(replaced.status).toBe(200);
    const replacement = await replaced.json() as { data: { setupToken: { token: string } } };
    const recoveryForPending = await postRecoveryToken(
      request(
        `http://localhost:3000/api/admin/users/${payload.data.user.id}/recovery-token`,
        "POST",
        administrator,
        { csrf: true, origin: "http://localhost:3000" },
      ),
      { params: Promise.resolve({ userId: payload.data.user.id }) },
    );
    expect(recoveryForPending.status).toBe(409);

    const oldToken = await postRegistration(
      request("http://localhost:3000/api/auth/register", "POST", undefined, {
        body: { password: "a-new-welcome-to-dig4el", token: payload.data.setupToken.token },
        origin: "http://localhost:3000",
      }),
    );
    expect(oldToken.status).toBe(400);
    const active = await postRegistration(
      request("http://localhost:3000/api/auth/register", "POST", undefined, {
        body: { password: "a-new-welcome-to-dig4el", token: replacement.data.setupToken.token },
        origin: "http://localhost:3000",
      }),
    );
    expect(active.status).toBe(200);
  });

  it("lets a system administrator issue recovery code that revokes existing sessions when consumed", async () => {
    const administrator = await issueActiveSession(administratorId, "admin@example.test", true);
    const created = await postUser(
      request("http://localhost:3000/api/admin/users", "POST", administrator, {
        body: { email: "recover-route@example.test" },
        csrf: true,
        origin: "http://localhost:3000",
      }),
    );
    const creation = await created.json() as { data: { setupToken: { token: string }; user: { id: string } } };
    const activation = await postRegistration(
      request("http://localhost:3000/api/auth/register", "POST", undefined, {
        body: { password: "a-new-welcome-to-dig4el", token: creation.data.setupToken.token },
        origin: "http://localhost:3000",
      }),
    );
    const activationCookie = activation.headers.get("set-cookie")?.match(/dig4el_session=([^;]+)/)?.[1];
    if (!activationCookie) throw new Error("Expected an active session cookie.");
    const recovery = await postRecoveryToken(
      request(
        `http://localhost:3000/api/admin/users/${creation.data.user.id}/recovery-token`,
        "POST",
        administrator,
        { csrf: true, origin: "http://localhost:3000" },
      ),
      { params: Promise.resolve({ userId: creation.data.user.id }) },
    );
    const recoveryPayload = await recovery.json() as { data: { recoveryToken: { token: string } } };
    const reset = await postRecoveryConfirmation(
      request("http://localhost:3000/api/auth/password-reset/confirm", "POST", undefined, {
        body: { password: "another-new-welcome-password", token: recoveryPayload.data.recoveryToken.token },
        origin: "http://localhost:3000",
      }),
    );
    expect(reset.status).toBe(200);
    expect(await getLocalAuthRuntime().sessions.resolve(activationCookie)).toEqual({ state: "unauthenticated" });
  });
});


describe("signed-in navigation", () => {
  it.each([true, false])("returns home and the trusted administrator flag (admin=%s)", async (administrator) => {
    const issued = await issueActiveSession(ordinaryId, "person@example.test", administrator);
    const login = await postLogin(request("http://localhost:3000/api/auth/login", "POST", undefined, {
      origin: "http://localhost:3000",
      body: { email: "person@example.test", password: "welcome-to-dig4el" },
    }));
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ data: { redirectTo: "/" } });
    const session = await getSession(request("http://localhost:3000/api/auth/session", "GET", issued));
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ data: { session: { user: { systemAdministrator: administrator } } } });
  });
});
