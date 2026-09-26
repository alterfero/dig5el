import { describe, expect, it } from "vitest";
import { AuthAccountStateError } from "../../../server/auth/auth-store";
import { LocalAuthFlowError, LocalAuthService } from "../../../server/auth/local-auth-service";
import { InMemoryAuthStore } from "../../../server/auth/memory-auth-store";
import { hashPassword } from "../../../server/auth/passwords";
import { AuthRateLimiter } from "../../../server/auth/rate-limit";
import { SessionManager } from "../../../server/auth/session-manager";

const secret = "c".repeat(64);
const administratorId = "00000000-0000-4000-8000-000000000001";

function createFixture(now = new Date("2026-09-17T10:00:00.000Z")) {
  const store = new InMemoryAuthStore();
  const sessions = new SessionManager(store, secret, { clock: () => now });
  const limiter = new AuthRateLimiter(store, sessions.sessionSecret, { clock: () => now });
  return {
    now,
    service: new LocalAuthService({ clock: () => now, limiter, sessions, store }),
    sessions,
    store,
  };
}

async function bootstrapActiveAdministrator(store: InMemoryAuthStore, now: Date): Promise<void> {
  await store.createUser({
    activatedAt: now,
    email: "admin@example.test",
    id: administratorId,
    now,
    passwordHash: await hashPassword("welcome-to-dig4el"),
    status: "active",
  });
  await store.bootstrapSystemAdministrator({
    now,
    requestId: "bootstrap_test_admin",
    targetEmail: "admin@example.test",
  });
}

describe("administrator-issued local account tokens", () => {
  it("creates a pending account, stores no raw setup token, activates it once, and signs it in", async () => {
    const { now, service, store } = createFixture();
    await bootstrapActiveAdministrator(store, now);

    const provisioned = await service.createPendingAccount({
      actorUserId: administratorId,
      email: "Person@Example.Test",
      requestId: "req_create_account",
    });
    expect(provisioned.user).toMatchObject({
      email: "person@example.test",
      status: "pending_activation",
    });
    expect(provisioned.setupToken.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(await store.findUserById(provisioned.user.id))).not.toContain(
      provisioned.setupToken.token,
    );
    expect(JSON.stringify(await store.listAuthAccountAudit(provisioned.user.id, 10))).not.toContain(
      provisioned.setupToken.token,
    );

    const issued = await service.register({
      ip: "192.0.2.10",
      password: "a-new-welcome-to-dig4el",
      token: provisioned.setupToken.token,
    });
    expect(issued.user).toMatchObject({
      email: "person@example.test",
      status: "active",
    });
    expect(issued.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(
      service.register({
        ip: "192.0.2.10",
        password: "another-new-welcome-password",
        token: provisioned.setupToken.token,
      }),
    ).rejects.toMatchObject<Partial<LocalAuthFlowError>>({ code: "INVALID_OR_EXPIRED_TOKEN" });
  });

  it("requires a system administrator to create or issue account codes", async () => {
    const { now, service, store } = createFixture();
    await store.createUser({
      activatedAt: now,
      email: "ordinary@example.test",
      id: "00000000-0000-4000-8000-000000000002",
      now,
      passwordHash: await hashPassword("welcome-to-dig4el"),
      status: "active",
    });

    await expect(
      service.createPendingAccount({
        actorUserId: "00000000-0000-4000-8000-000000000002",
        email: "new@example.test",
        requestId: "req_denied_create",
      }),
    ).rejects.toMatchObject({ name: "AdminAuthorizationError" });
  });

  it("replaces setup codes for pending accounts and issues recovery only for active accounts", async () => {
    const { now, service, store } = createFixture();
    await bootstrapActiveAdministrator(store, now);
    const provisioned = await service.createPendingAccount({
      actorUserId: administratorId,
      email: "pending@example.test",
      requestId: "req_pending",
    });
    const replacement = await service.issueRegistrationToken({
      actorUserId: administratorId,
      requestId: "req_reissue_setup",
      userId: provisioned.user.id,
    });
    await expect(
      service.register({
        ip: "192.0.2.11",
        password: "a-new-welcome-to-dig4el",
        token: provisioned.setupToken.token,
      }),
    ).rejects.toMatchObject<Partial<LocalAuthFlowError>>({ code: "INVALID_OR_EXPIRED_TOKEN" });
    const activated = await service.register({
      ip: "192.0.2.11",
      password: "a-new-welcome-to-dig4el",
      token: replacement.setupToken.token,
    });
    expect(activated.user.status).toBe("active");

    const recovery = await service.issuePasswordRecoveryToken({
      actorUserId: administratorId,
      requestId: "req_recovery",
      userId: provisioned.user.id,
    });
    await expect(
      service.issueRegistrationToken({
        actorUserId: administratorId,
        requestId: "req_wrong_action",
        userId: provisioned.user.id,
      }),
    ).rejects.toBeInstanceOf(AuthAccountStateError);
    expect(recovery.recoveryToken.expiresAt.getTime() - now.getTime()).toBe(60 * 60 * 1000);
  });

  it("uses a one-time administrator recovery token and revokes earlier sessions", async () => {
    const { now, service, sessions, store } = createFixture();
    await bootstrapActiveAdministrator(store, now);
    const provisioned = await service.createPendingAccount({
      actorUserId: administratorId,
      email: "recover@example.test",
      requestId: "req_recover_create",
    });
    const first = await service.register({
      ip: "192.0.2.12",
      password: "a-new-welcome-to-dig4el",
      token: provisioned.setupToken.token,
    });
    const recovery = await service.issuePasswordRecoveryToken({
      actorUserId: administratorId,
      requestId: "req_recovery",
      userId: provisioned.user.id,
    });
    const next = await service.confirmPasswordReset({
      ip: "192.0.2.12",
      password: "another-new-welcome-password",
      token: recovery.recoveryToken.token,
    });
    expect(await sessions.resolve(first.cookieValue)).toEqual({ state: "unauthenticated" });
    expect(next.user.email).toBe("recover@example.test");
    await expect(store.listAuthAccountAudit(provisioned.user.id, 10)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "password_recovered" })]),
    );
    await expect(
      service.confirmPasswordReset({
        ip: "192.0.2.12",
        password: "another-new-welcome-password",
        token: recovery.recoveryToken.token,
      }),
    ).rejects.toMatchObject<Partial<LocalAuthFlowError>>({ code: "INVALID_OR_EXPIRED_TOKEN" });
  });

  it("does not make pending or disabled account state discoverable through login", async () => {
    const { now, service, store } = createFixture();
    await bootstrapActiveAdministrator(store, now);
    await service.createPendingAccount({
      actorUserId: administratorId,
      email: "pending-login@example.test",
      requestId: "req_pending_login",
    });
    await expect(
      service.login({
        email: "pending-login@example.test",
        ip: "192.0.2.13",
        password: "a-new-welcome-to-dig4el",
      }),
    ).rejects.toMatchObject<Partial<LocalAuthFlowError>>({ code: "INVALID_CREDENTIALS" });
    await expect(
      service.login({
        email: "missing@example.test",
        ip: "192.0.2.13",
        password: "a-new-welcome-to-dig4el",
      }),
    ).rejects.toMatchObject<Partial<LocalAuthFlowError>>({ code: "INVALID_CREDENTIALS" });
  });
});
