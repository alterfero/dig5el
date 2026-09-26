import { randomUUID } from "node:crypto";
import { hashAuthActionToken, mintAuthActionToken, type IssuedAuthActionToken } from "./action-tokens";
import type { AuthStore, AuthUser } from "./auth-store";
import { normalizeEmail } from "./identity";
import { hashPassword, verifyPasswordHash } from "./passwords";
import { AuthRateLimiter } from "./rate-limit";
import { type IssuedSession, SessionManager } from "./session-manager";

const dummyPasswordHash =
  "scrypt-v1$32768$8$1$A0bbwQFplbLZHxJt3ltmdg$XmFvFYHMDndXafW6gLj0_np7GbPL0Ys6Y7U7cedxAqhUKqyRANKKV2foea-wRwfHdB2cVGJC6DALValYruGCkg";
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export class LocalAuthFlowError extends Error {
  constructor(readonly code: "INVALID_CREDENTIALS" | "INVALID_OR_EXPIRED_TOKEN") {
    super(
      code === "INVALID_CREDENTIALS"
        ? "That email or password is not correct."
        : "That setup or recovery code is no longer valid. Please ask an administrator for a new one.",
    );
    this.name = "LocalAuthFlowError";
  }
}

export class LocalAuthRequestValidationError extends Error {
  constructor() {
    super("The account request is not valid.");
    this.name = "LocalAuthRequestValidationError";
  }
}

export type AuthRequestContext = {
  /** A trusted-proxy resolved client address, never a raw browser header. */
  ip: string;
};

export type LoginInput = AuthRequestContext & {
  email: string;
  password: string;
};

export type RegisterInput = AuthRequestContext & {
  password: string;
  token: string;
};

export type PasswordResetConfirmationInput = AuthRequestContext & {
  password: string;
  token: string;
};

export type ProvisionedAccount = {
  setupToken: IssuedAuthActionToken;
  user: AuthUser;
};

export type IssuedRecovery = {
  recoveryToken: IssuedAuthActionToken;
  user: AuthUser;
};

/**
 * Local-account workflow service. Administrators provision identities and
 * disclose short-lived opaque codes out of band. Route handlers own request
 * parsing, Origin/CSRF checks, cookie serialization, and friendly JSON
 * envelopes. Raw codes are never written to logs or a mail queue.
 */
export class LocalAuthService {
  readonly #clock: () => Date;
  readonly #limiter: AuthRateLimiter;
  readonly #sessions: SessionManager;
  readonly #store: AuthStore;

  constructor(
    options: {
      clock?: () => Date;
      limiter: AuthRateLimiter;
      sessions: SessionManager;
      store: AuthStore;
    },
  ) {
    this.#clock = options.clock ?? (() => new Date());
    this.#limiter = options.limiter;
    this.#sessions = options.sessions;
    this.#store = options.store;
  }

  /** Activates an administrator-provisioned pending account and signs it in. */
  async register(input: RegisterInput): Promise<IssuedSession> {
    await this.#limiter.assertAllowed("registration_confirmation", {
      account: input.token,
      ip: input.ip,
    });
    const tokenHash = hashAuthActionToken("account_registration", input.token);
    if (!tokenHash) throw new LocalAuthFlowError("INVALID_OR_EXPIRED_TOKEN");
    const passwordHash = await hashPassword(input.password);
    const user = await this.#store.activateAccountWithToken(tokenHash, passwordHash, this.#clock());
    if (!user) throw new LocalAuthFlowError("INVALID_OR_EXPIRED_TOKEN");
    return this.#sessions.issue(user.id);
  }

  /** Consumes an administrator-issued recovery code, revoking prior sessions. */
  async confirmPasswordReset(
    input: PasswordResetConfirmationInput,
  ): Promise<IssuedSession> {
    await this.#limiter.assertAllowed("password_recovery_confirmation", {
      account: input.token,
      ip: input.ip,
    });
    const tokenHash = hashAuthActionToken("password_recovery", input.token);
    if (!tokenHash) throw new LocalAuthFlowError("INVALID_OR_EXPIRED_TOKEN");
    const passwordHash = await hashPassword(input.password);
    const user = await this.#store.resetPasswordWithToken(
      tokenHash,
      passwordHash,
      this.#clock(),
    );
    if (!user) throw new LocalAuthFlowError("INVALID_OR_EXPIRED_TOKEN");
    return this.#sessions.issue(user.id);
  }

  /**
   * Creates a pending local account and returns the setup capability exactly
   * once to a system administrator. The store re-checks the actor within its
   * transaction; this method alone is never a substitute for server guards.
   */
  async createPendingAccount(input: {
    actorUserId: string;
    email: string;
    requestId: string;
  }): Promise<ProvisionedAccount> {
    const now = this.#clock();
    const id = randomUUID();
    const action = mintAuthActionToken("account_registration", id, input.actorUserId, now);
    const user = await this.#store.createPendingAccountWithRegistrationToken({
      action: action.stored,
      actorUserId: input.actorUserId,
      email: normalizeEmail(input.email),
      id,
      now,
      requestId: input.requestId,
    });
    return { setupToken: action.action, user };
  }

  async issueRegistrationToken(input: {
    actorUserId: string;
    requestId: string;
    userId: string;
  }): Promise<ProvisionedAccount> {
    assertUserId(input.userId);
    const now = this.#clock();
    const action = mintAuthActionToken(
      "account_registration",
      input.userId,
      input.actorUserId,
      now,
    );
    const user = await this.#store.issueRegistrationToken({
      action: action.stored,
      actorUserId: input.actorUserId,
      now,
      requestId: input.requestId,
      userId: input.userId,
    });
    return { setupToken: action.action, user };
  }

  async issuePasswordRecoveryToken(input: {
    actorUserId: string;
    requestId: string;
    userId: string;
  }): Promise<IssuedRecovery> {
    assertUserId(input.userId);
    const now = this.#clock();
    const action = mintAuthActionToken(
      "password_recovery",
      input.userId,
      input.actorUserId,
      now,
    );
    const user = await this.#store.issuePasswordRecoveryToken({
      action: action.stored,
      actorUserId: input.actorUserId,
      now,
      requestId: input.requestId,
      userId: input.userId,
    });
    return { recoveryToken: action.action, user };
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const email = normalizeEmail(input.email);
    await this.#limiter.assertAllowed("login", { account: email, ip: input.ip });
    const user = await this.#store.findUserByEmail(email);
    const passwordMatches = await verifyPasswordHash(
      input.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    // A pending or disabled account intentionally gets the same response as
    // an unknown account, avoiding a public account-status oracle.
    if (!user || user.status !== "active" || !passwordMatches) {
      throw new LocalAuthFlowError("INVALID_CREDENTIALS");
    }
    return this.#sessions.issue(user.id);
  }
}

function assertUserId(value: string): void {
  if (!uuidShape.test(value)) throw new LocalAuthRequestValidationError();
}
