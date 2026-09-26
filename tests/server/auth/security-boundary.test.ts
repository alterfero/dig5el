import { describe, expect, it } from "vitest";
import { buildSessionCookie, clearSessionCookie, parseSessionCookie } from "../../../server/auth/cookies";
import { assertAuthenticatedCsrf, assertSameOrigin, CsrfProtectionError } from "../../../server/auth/csrf";
import { createAuthStore, AuthPersistenceConfigurationError } from "../../../server/auth/create-auth-store";
import { InMemoryAuthStore } from "../../../server/auth/memory-auth-store";
import { AuthRateLimitError, AuthRateLimiter } from "../../../server/auth/rate-limit";
import { decodeSessionSecret, SessionConfigurationError } from "../../../server/auth/session-manager";

const cookieValue = "A".repeat(43);
const secret = Buffer.from("b".repeat(64), "hex");
const origin = new URL("https://dig4el.example.test");

describe("browser session boundary", () => {
  it("uses a host-only secure HttpOnly cookie in production", () => {
    const expiresAt = new Date("2026-09-16T11:00:00.000Z");
    const cookie = buildSessionCookie(cookieValue, expiresAt, {
      now: new Date("2026-09-16T10:00:00.000Z"),
      secure: true,
    });

    expect(cookie).toContain("__Host-dig4el_session=");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
    expect(parseSessionCookie(`theme=warm; ${cookie.split("; ")[0]}`, true)).toBe(cookieValue);
    expect(clearSessionCookie({ secure: true })).toContain("Max-Age=0");
  });

  it("rejects cross-origin and missing CSRF token mutations", () => {
    const request = new Request("https://dig4el.example.test/api/auth/logout", {
      headers: { origin: "https://attacker.example.test" },
      method: "POST",
    });
    expect(() => assertSameOrigin(request, origin)).toThrow(CsrfProtectionError);

    const sameOriginRequest = new Request("https://dig4el.example.test/api/auth/logout", {
      headers: { origin: origin.origin },
      method: "POST",
    });
    expect(() =>
      assertAuthenticatedCsrf(sameOriginRequest, origin, cookieValue, secret),
    ).toThrow(CsrfProtectionError);
  });

  it("fails closed without durable storage outside development and test", () => {
    expect(() => createAuthStore({ environment: "production" })).toThrow(
      AuthPersistenceConfigurationError,
    );
    const development = createAuthStore({ environment: "development" });
    expect(development.persistent).toBe(false);
    expect(development.store).toBeInstanceOf(InMemoryAuthStore);
  });

  it("accepts only an exact 32-byte server session secret", () => {
    expect(decodeSessionSecret("d".repeat(64))).toHaveLength(32);
    expect(() => decodeSessionSecret("not-a-valid-session-secret".repeat(2))).toThrow(
      SessionConfigurationError,
    );
  });

  it("bounds repeated login attempts using hashed account and IP buckets", async () => {
    const now = new Date("2026-09-16T10:00:00.000Z");
    const limiter = new AuthRateLimiter(new InMemoryAuthStore(), secret, {
      clock: () => now,
      policies: { login: { accountLimit: 2, ipLimit: 3, windowMs: 60_000 } },
    });
    const identifiers = { account: "person@example.test", ip: "192.0.2.8" };

    await expect(limiter.assertAllowed("login", identifiers)).resolves.toBeUndefined();
    await expect(limiter.assertAllowed("login", identifiers)).resolves.toBeUndefined();
    await expect(limiter.assertAllowed("login", identifiers)).rejects.toBeInstanceOf(
      AuthRateLimitError,
    );
  });
});
