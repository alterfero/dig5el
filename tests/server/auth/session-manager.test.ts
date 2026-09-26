import { describe, expect, it } from "vitest";
import { InMemoryAuthStore } from "../../../server/auth/memory-auth-store";
import {
  assertLocalRecordOwnership,
  AuthenticationRequiredError,
  AuthorizationError,
  requireAuthenticatedSession,
} from "../../../server/auth/guards";
import { hashSessionIdentifier, SessionManager } from "../../../server/auth/session-manager";

const secret = "a".repeat(64);

async function activeUser(store: InMemoryAuthStore, now: Date) {
  await store.createUser({
    activatedAt: now,
    email: "person@example.test",
    id: "00000000-0000-4000-8000-000000000001",
    now,
    passwordHash: "not-used-by-this-test",
    status: "active",
  });
  return "00000000-0000-4000-8000-000000000001";
}

describe("opaque local sessions", () => {
  it("resolves an authenticated user without exposing a password hash", async () => {
    const store = new InMemoryAuthStore();
    const now = new Date("2026-09-16T10:00:00.000Z");
    const userId = await activeUser(store, now);
    const manager = new SessionManager(store, secret, { clock: () => now });

    const issued = await manager.issue(userId);
    const authenticated = await requireAuthenticatedSession(manager, issued.cookieValue);

    expect(issued.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authenticated.user).toMatchObject({ id: userId, status: "active" });
    expect(authenticated.user).not.toHaveProperty("passwordHash");
    expect(authenticated.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("treats a missing cookie as unauthenticated", async () => {
    const manager = new SessionManager(new InMemoryAuthStore(), secret);

    await expect(requireAuthenticatedSession(manager, null)).rejects.toMatchObject<
      Partial<AuthenticationRequiredError>
    >({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("removes and reports an expired session", async () => {
    const store = new InMemoryAuthStore();
    let now = new Date("2026-09-16T10:00:00.000Z");
    const userId = await activeUser(store, now);
    const manager = new SessionManager(store, secret, {
      clock: () => now,
      policy: {
        absoluteLifetimeMs: 60 * 60 * 1000,
        idleLifetimeMs: 60 * 1000,
        renewalWindowMs: 0,
      },
    });
    const issued = await manager.issue(userId);
    now = new Date("2026-09-16T10:01:00.000Z");

    await expect(requireAuthenticatedSession(manager, issued.cookieValue)).rejects.toMatchObject<
      Partial<AuthenticationRequiredError>
    >({ code: "SESSION_EXPIRED" });
    expect(await manager.resolve(issued.cookieValue)).toEqual({ state: "unauthenticated" });
  });

  it("extends the idle expiry from each authenticated request", async () => {
    const store = new InMemoryAuthStore();
    let now = new Date("2026-09-16T10:00:00.000Z");
    const userId = await activeUser(store, now);
    const manager = new SessionManager(store, secret, {
      clock: () => now,
      policy: {
        absoluteLifetimeMs: 8 * 60 * 60 * 1000,
        idleLifetimeMs: 30 * 60 * 1000,
        renewalWindowMs: 5 * 60 * 1000,
      },
    });
    const issued = await manager.issue(userId);

    now = new Date("2026-09-16T10:24:00.000Z");
    await expect(manager.resolve(issued.cookieValue)).resolves.toMatchObject({
      state: "authenticated",
    });
    const stored = await store.findSession(
      hashSessionIdentifier(issued.cookieValue, manager.sessionSecret)!,
    );

    expect(stored?.lastSeenAt.toISOString()).toBe("2026-09-16T10:24:00.000Z");
    expect(stored?.expiresAt.toISOString()).toBe("2026-09-16T10:54:00.000Z");
  });

  it("does not turn an authenticated local identity into a universal authorization grant", () => {
    expect(() =>
      assertLocalRecordOwnership(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ),
    ).toThrow(AuthorizationError);
  });
});
