import type { AdminStore } from "../admin/admin-store";

/**
 * Server-only persistence contract for DIG4EL's local account and session
 * boundary. Accounts are deliberately provisioned by a DIG4EL system
 * administrator: there is no public sign-up, email verification, or public
 * password-reset request endpoint.
 *
 * This remains a distinct DIG4EL identity register. It deliberately contains
 * no PLAID password, bearer token, role, project membership, or corpus
 * permission. A future PLAID link is optional metadata only.
 */

export type AuthUserStatus = "active" | "disabled" | "pending_activation";

export type AuthUser = {
  activatedAt: Date | null;
  createdAt: Date;
  email: string;
  id: string;
  status: AuthUserStatus;
  updatedAt: Date;
};

/** Password hashes stay inside the server persistence layer. */
export type AuthUserRecord = AuthUser & {
  passwordHash: string | null;
};

/**
 * This low-level helper is kept for controlled test/bootstrap fixtures. Public
 * application flows must use `createPendingAccountWithRegistrationToken`.
 */
export type NewAuthUser = {
  activatedAt?: Date | null;
  email: string;
  id: string;
  now: Date;
  passwordHash: string | null;
  status?: AuthUserStatus;
};

export type AuthActionPurpose = "account_registration" | "password_recovery";

export type NewAuthActionToken = {
  expiresAt: Date;
  id: string;
  issuedByUserId: string | null;
  now: Date;
  purpose: AuthActionPurpose;
  tokenHash: string;
  userId: string;
};

export type AuthActionToken = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  issuedByUserId: string | null;
  purpose: AuthActionPurpose;
  tokenHash: string;
  usedAt: Date | null;
  userId: string;
};

export type NewPendingAccountWithRegistrationToken = {
  action: NewAuthActionToken;
  actorUserId: string;
  email: string;
  id: string;
  now: Date;
  requestId: string;
};

export type IssueAdminActionTokenInput = {
  action: NewAuthActionToken;
  actorUserId: string;
  now: Date;
  requestId: string;
  userId: string;
};

export type AuthAccountAuditAction =
  | "account_activated"
  | "account_created"
  | "password_recovered"
  | "registration_token_issued"
  | "recovery_token_issued";

/** Never contains a raw token, a token hash, password material, or session ID. */
export type AuthAccountAuditRecord = {
  action: AuthAccountAuditAction;
  actorUserId: string | null;
  id: string;
  metadata: Record<string, string | null>;
  occurredAt: Date;
  requestId: string | null;
  targetUserId: string;
};

export type StoredAuthSession = {
  absoluteExpiresAt: Date;
  expiresAt: Date;
  idHash: string;
  issuedAt: Date;
  lastSeenAt: Date;
  userId: string;
};

export type NewAuthSession = StoredAuthSession;

/**
 * A non-authoritative optional connection to a PLAID identity. This link is
 * never a copy of PLAID credentials, permissions, or roles.
 */
export type PlaidIdentityLink = {
  createdAt: Date;
  plaidInstanceId: string;
  plaidUserId: string;
  userId: string;
};

export type AuthRateLimitResult = {
  allowed: boolean;
  retryAt: Date;
};

export type AuthRateLimitInput = {
  bucketHash: string;
  limit: number;
  now: Date;
  windowStartedAt: Date;
  windowMs: number;
};

export class AuthStoreConflictError extends Error {
  constructor(readonly resource: "email" | "plaid_identity") {
    super("This account record already exists.");
    this.name = "AuthStoreConflictError";
  }
}

/** A target exists but is not eligible for the requested administrator action. */
export class AuthAccountStateError extends Error {
  constructor(
    readonly state: "active" | "disabled" | "pending_activation",
  ) {
    super("This account is not eligible for that action.");
    this.name = "AuthAccountStateError";
  }
}

/**
 * Transaction-aware store. Token issuance/consumption, password replacement,
 * session revocation, and audit insertion stay inseparable in production.
 */
export interface AuthStore extends AdminStore {
  activateAccountWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null>;
  consumeRateLimit(input: AuthRateLimitInput): Promise<AuthRateLimitResult>;
  createPendingAccountWithRegistrationToken(
    input: NewPendingAccountWithRegistrationToken,
  ): Promise<AuthUser>;
  /** Controlled server/test fixture helper; not used by public routes. */
  createUser(input: NewAuthUser): Promise<AuthUser>;
  createSession(session: NewAuthSession): Promise<void>;
  deleteSession(idHash: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;
  findSession(idHash: string): Promise<StoredAuthSession | null>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  issuePasswordRecoveryToken(input: IssueAdminActionTokenInput): Promise<AuthUser>;
  issueRegistrationToken(input: IssueAdminActionTokenInput): Promise<AuthUser>;
  linkPlaidIdentity(link: PlaidIdentityLink): Promise<void>;
  listAuthAccountAudit(userId: string, limit: number): Promise<AuthAccountAuditRecord[]>;
  ping(): Promise<void>;
  resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null>;
  updateSession(session: StoredAuthSession): Promise<void>;
}
