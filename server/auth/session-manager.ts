import { createHmac, randomBytes } from "node:crypto";
import type { AuthStore, AuthUser, StoredAuthSession } from "./auth-store";
import { createCsrfToken } from "./csrf";

const sessionIdentifierBytes = 32;
const sessionIdentifierShape = /^[A-Za-z0-9_-]{43}$/u;

export const defaultSessionPolicy = {
  absoluteLifetimeMs: 8 * 60 * 60 * 1000,
  idleLifetimeMs: 30 * 60 * 1000,
  renewalWindowMs: 5 * 60 * 1000,
} as const;

export type SessionPolicy = typeof defaultSessionPolicy;

export class SessionConfigurationError extends Error {
  constructor() {
    super("The server session configuration is invalid.");
    this.name = "SessionConfigurationError";
  }
}

export type IssuedSession = {
  cookieValue: string;
  csrfToken: string;
  expiresAt: Date;
  user: AuthUser;
};

export type ResolvedSession =
  | { state: "authenticated"; session: Omit<IssuedSession, "cookieValue"> }
  | { state: "expired" }
  | { state: "unauthenticated" };

function validateSessionPolicy(policy: SessionPolicy): void {
  if (
    policy.absoluteLifetimeMs <= 0 ||
    policy.idleLifetimeMs <= 0 ||
    policy.renewalWindowMs < 0 ||
    policy.idleLifetimeMs > policy.absoluteLifetimeMs
  ) {
    throw new SessionConfigurationError();
  }
}

/** Decodes the existing 32-byte server-only SESSION_ENCRYPTION_KEY value. */
export function decodeSessionSecret(value: string): Buffer {
  const secret = /^[a-f0-9]{64}$/iu.test(value)
    ? Buffer.from(value, "hex")
    : /^[A-Za-z0-9_-]{43}$/u.test(value)
      ? Buffer.from(value, "base64url")
      : null;
  if (!secret) throw new SessionConfigurationError();
  if (secret.length !== 32) throw new SessionConfigurationError();
  return secret;
}

export function isSessionIdentifier(value: string): boolean {
  return sessionIdentifierShape.test(value);
}

/** A server-secret HMAC prevents database rows from being reusable elsewhere. */
export function hashSessionIdentifier(value: string, secret: Buffer): string | null {
  if (!sessionIdentifierShape.test(value)) return null;
  return createHmac("sha256", secret)
    .update("dig4el.auth.session.v1\0", "utf8")
    .update(value, "utf8")
    .digest("base64url");
}

function boundedExpiry(now: Date, absoluteExpiresAt: Date, idleLifetimeMs: number): Date {
  return new Date(Math.min(now.getTime() + idleLifetimeMs, absoluteExpiresAt.getTime()));
}

function publicUser(user: AuthUser): AuthUser {
  return {
    activatedAt: user.activatedAt ? new Date(user.activatedAt.getTime()) : null,
    createdAt: new Date(user.createdAt.getTime()),
    email: user.email,
    id: user.id,
    status: user.status,
    updatedAt: new Date(user.updatedAt.getTime()),
  };
}

/**
 * Creates and resolves opaque, server-side sessions. Cookie values are random
 * capabilities; the database receives only a server-keyed HMAC digest.
 */
export class SessionManager {
  readonly #clock: () => Date;
  readonly #policy: SessionPolicy;
  readonly #secret: Buffer;
  readonly #store: AuthStore;

  constructor(
    store: AuthStore,
    sessionSecret: string | Buffer,
    options: { clock?: () => Date; policy?: Partial<SessionPolicy> } = {},
  ) {
    this.#store = store;
    this.#secret = typeof sessionSecret === "string"
      ? decodeSessionSecret(sessionSecret)
      : Buffer.from(sessionSecret);
    if (this.#secret.length !== 32) throw new SessionConfigurationError();
    this.#clock = options.clock ?? (() => new Date());
    this.#policy = { ...defaultSessionPolicy, ...options.policy };
    validateSessionPolicy(this.#policy);
  }

  async issue(userId: string): Promise<IssuedSession> {
    const now = this.#clock();
    const user = await this.#store.findUserById(userId);
    if (!user || user.status !== "active") {
      throw new SessionConfigurationError();
    }

    const cookieValue = randomBytes(sessionIdentifierBytes).toString("base64url");
    const idHash = hashSessionIdentifier(cookieValue, this.#secret);
    if (!idHash) throw new SessionConfigurationError();
    const absoluteExpiresAt = new Date(now.getTime() + this.#policy.absoluteLifetimeMs);
    const expiresAt = boundedExpiry(now, absoluteExpiresAt, this.#policy.idleLifetimeMs);
    await this.#store.createSession({
      absoluteExpiresAt,
      expiresAt,
      idHash,
      issuedAt: now,
      lastSeenAt: now,
      userId,
    });

    return {
      cookieValue,
      csrfToken: createCsrfToken(cookieValue, this.#secret),
      expiresAt,
      user: publicUser(user),
    };
  }

  async resolve(cookieValue: string | null): Promise<ResolvedSession> {
    const idHash = cookieValue ? hashSessionIdentifier(cookieValue, this.#secret) : null;
    if (!idHash || !cookieValue) return { state: "unauthenticated" };

    const now = this.#clock();
    const stored = await this.#store.findSession(idHash);
    if (!stored) return { state: "unauthenticated" };

    if (
      stored.expiresAt.getTime() <= now.getTime() ||
      stored.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      await this.#store.deleteSession(idHash);
      return { state: "expired" };
    }

    const user = await this.#store.findUserById(stored.userId);
    if (!user || user.status !== "active") {
      await this.#store.deleteSession(idHash);
      return { state: "unauthenticated" };
    }

    const session = await this.#renewIfNeeded(stored, now);
    return {
      state: "authenticated",
      session: {
        csrfToken: createCsrfToken(cookieValue, this.#secret),
        expiresAt: session.expiresAt,
        user: publicUser(user),
      },
    };
  }

  async destroy(cookieValue: string | null): Promise<void> {
    const idHash = cookieValue ? hashSessionIdentifier(cookieValue, this.#secret) : null;
    if (idHash) await this.#store.deleteSession(idHash);
  }

  /** For route guards that have already resolved an authenticated session. */
  csrfTokenFor(cookieValue: string): string {
    if (!isSessionIdentifier(cookieValue)) throw new SessionConfigurationError();
    return createCsrfToken(cookieValue, this.#secret);
  }

  get sessionSecret(): Buffer {
    return Buffer.from(this.#secret);
  }

  async #renewIfNeeded(session: StoredAuthSession, now: Date): Promise<StoredAuthSession> {
    // Every authenticated request is activity. Update the server expiry from
    // it so the documented idle timeout is genuinely rolling; the absolute
    // lifetime remains a firm upper bound.
    const expiresAt = boundedExpiry(now, session.absoluteExpiresAt, this.#policy.idleLifetimeMs);
    if (session.lastSeenAt.getTime() === now.getTime() && session.expiresAt.getTime() === expiresAt.getTime()) {
      return session;
    }
    const renewed = {
      ...session,
      expiresAt,
      lastSeenAt: now,
    };
    await this.#store.updateSession(renewed);
    return renewed;
  }
}

export function createSessionManager(
  store: AuthStore,
  sessionSecret: string | Buffer,
  options?: { clock?: () => Date; policy?: Partial<SessionPolicy> },
): SessionManager {
  return new SessionManager(store, sessionSecret, options);
}
