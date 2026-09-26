import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getSession } from "../../../app/api/auth/session/route";
import { POST as postLogout } from "../../../app/api/auth/logout/route";
import { POST as postLogin } from "../../../app/api/auth/login/route";
import {
  getLocalAuthRuntime,
  resetLocalAuthRuntimeForTests,
} from "../../../server/auth/auth-runtime";
import { hashSessionIdentifier } from "../../../server/auth/session-manager";

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

async function issueActiveSession() {
  const runtime = getLocalAuthRuntime();
  const now = new Date();
  const userId = "00000000-0000-4000-8000-000000000010";
  await runtime.persistence.store.createUser({
    activatedAt: now,
    email: "route-test@example.test",
    id: userId,
    now,
    passwordHash: "scrypt-v1$32768$8$1$A0bbwQFplbLZHxJt3ltmdg$XmFvFYHMDndXafW6gLj0_np7GbPL0Ys6Y7U7cedxAqhUKqyRANKKV2foea-wRwfHdB2cVGJC6DALValYruGCkg",
    status: "active",
  });
  return { issued: await runtime.sessions.issue(userId), runtime };
}

function sessionRequest(cookieValue?: string): Request {
  return new Request("http://localhost:3000/api/auth/session", {
    headers: cookieValue ? { cookie: `dig4el_session=${cookieValue}` } : undefined,
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
    SESSION_ENCRYPTION_KEY: "e".repeat(64),
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

describe("auth API session boundary", () => {
  it("returns a safe authenticated session and rolls its HttpOnly cookie", async () => {
    const { issued } = await issueActiveSession();

    const response = await getSession(sessionRequest(issued.cookieValue));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("dig4el_session=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(payload).toMatchObject({
      data: { session: { user: { email: "route-test@example.test" } } },
    });
    expect(JSON.stringify(payload)).not.toContain("passwordHash");
  });

  it("rejects an unauthenticated session request", async () => {
    const response = await getSession(sessionRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("reports an expired session and clears its browser cookie", async () => {
    const { issued, runtime } = await issueActiveSession();
    const idHash = hashSessionIdentifier(issued.cookieValue, runtime.sessions.sessionSecret)!;
    const stored = await runtime.persistence.store.findSession(idHash);
    if (!stored) throw new Error("Expected a stored session.");
    await runtime.persistence.store.updateSession({ ...stored, expiresAt: new Date(0) });

    const response = await getSession(sessionRequest(issued.cookieValue));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_EXPIRED" },
    });
  });

  it("rejects cross-origin login before parsing credentials", async () => {
    const response = await postLogin(
      new Request("http://localhost:3000/api/auth/login", {
        body: JSON.stringify({ email: "route-test@example.test", password: "not-used" }),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example.test",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });
  });

  it("requires an authenticated CSRF token to log out", async () => {
    const { issued } = await issueActiveSession();
    const response = await postLogout(
      new Request("http://localhost:3000/api/auth/logout", {
        headers: {
          cookie: `dig4el_session=${issued.cookieValue}`,
          origin: "http://localhost:3000",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("signs out a valid local session and clears its opaque cookie", async () => {
    const { issued, runtime } = await issueActiveSession();
    const resolved = await runtime.sessions.resolve(issued.cookieValue);
    if (resolved.state !== "authenticated") throw new Error("Expected authenticated session.");

    const response = await postLogout(
      new Request("http://localhost:3000/api/auth/logout", {
        headers: {
          cookie: `dig4el_session=${issued.cookieValue}`,
          origin: "http://localhost:3000",
          "x-dig4el-csrf": resolved.session.csrfToken,
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toMatchObject({ data: { signedOut: true } });
    expect(await runtime.sessions.resolve(issued.cookieValue)).toEqual({ state: "unauthenticated" });
  });
});
