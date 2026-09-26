import { createHmac } from "node:crypto";
import type { AuthRateLimitResult, AuthStore } from "./auth-store";

export type AuthRateLimitAction =
  | "login"
  | "password_recovery_confirmation"
  | "registration_confirmation";

type RateLimitPolicy = {
  accountLimit: number;
  ipLimit: number;
  windowMs: number;
};

export const defaultAuthRateLimitPolicies: Record<AuthRateLimitAction, RateLimitPolicy> = {
  login: { accountLimit: 5, ipLimit: 20, windowMs: 15 * 60 * 1000 },
  password_recovery_confirmation: {
    accountLimit: 5,
    ipLimit: 20,
    windowMs: 15 * 60 * 1000,
  },
  registration_confirmation: {
    accountLimit: 5,
    ipLimit: 20,
    windowMs: 15 * 60 * 1000,
  },
};

export class AuthRateLimitError extends Error {
  constructor(readonly retryAt: Date) {
    super("Please wait a moment before trying again.");
    this.name = "AuthRateLimitError";
  }
}

function bucketHash(
  secret: Buffer,
  action: AuthRateLimitAction,
  scope: "account" | "ip",
  identifier: string,
): string {
  return createHmac("sha256", secret)
    .update(`dig4el.auth.rate-limit.${action}.${scope}.v1\0`, "utf8")
    .update(identifier, "utf8")
    .digest("base64url");
}

function startOfFixedWindow(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function validateIdentifier(identifier: string): void {
  if (!identifier || Buffer.byteLength(identifier, "utf8") > 512) {
    throw new Error("Invalid rate-limit identifier.");
  }
}

export type AuthRateLimitIdentifiers = {
  account: string;
  /**
   * Resolve this only from a trusted deployment proxy. Do not accept a raw
   * browser-supplied x-forwarded-for value on an internet-facing server.
   */
  ip: string;
};

/**
 * Fixed-window defence-in-depth limiter. Account and IP identifiers are HMAC
 * digests before persistence, preventing the session database from becoming a
 * store of raw email addresses or client addresses beyond the user table.
 */
export class AuthRateLimiter {
  readonly #clock: () => Date;
  readonly #policies: Record<AuthRateLimitAction, RateLimitPolicy>;
  readonly #secret: Buffer;
  readonly #store: AuthStore;

  constructor(
    store: AuthStore,
    secret: Buffer,
    options: {
      clock?: () => Date;
      policies?: Partial<Record<AuthRateLimitAction, Partial<RateLimitPolicy>>>;
    } = {},
  ) {
    if (secret.length !== 32) throw new Error("Invalid rate-limit secret.");
    this.#clock = options.clock ?? (() => new Date());
    this.#policies = {
      login: { ...defaultAuthRateLimitPolicies.login, ...options.policies?.login },
      password_recovery_confirmation: {
        ...defaultAuthRateLimitPolicies.password_recovery_confirmation,
        ...options.policies?.password_recovery_confirmation,
      },
      registration_confirmation: {
        ...defaultAuthRateLimitPolicies.registration_confirmation,
        ...options.policies?.registration_confirmation,
      },
    };
    this.#secret = Buffer.from(secret);
    this.#store = store;
  }

  async assertAllowed(
    action: AuthRateLimitAction,
    identifiers: AuthRateLimitIdentifiers,
  ): Promise<void> {
    validateIdentifier(identifiers.account);
    validateIdentifier(identifiers.ip);
    const policy = this.#policies[action];
    const now = this.#clock();
    const windowStartedAt = startOfFixedWindow(now, policy.windowMs);
    const [account, ip] = await Promise.all([
      this.#consume(action, "account", identifiers.account, policy, now, windowStartedAt),
      this.#consume(action, "ip", identifiers.ip, policy, now, windowStartedAt),
    ]);
    if (!account.allowed || !ip.allowed) {
      throw new AuthRateLimitError(
        new Date(Math.max(account.retryAt.getTime(), ip.retryAt.getTime())),
      );
    }
  }

  async #consume(
    action: AuthRateLimitAction,
    scope: "account" | "ip",
    identifier: string,
    policy: RateLimitPolicy,
    now: Date,
    windowStartedAt: Date,
  ): Promise<AuthRateLimitResult> {
    return this.#store.consumeRateLimit({
      bucketHash: bucketHash(this.#secret, action, scope, identifier),
      limit: scope === "account" ? policy.accountLimit : policy.ipLimit,
      now,
      windowMs: policy.windowMs,
      windowStartedAt,
    });
  }
}
