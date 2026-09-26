import type { IssuedSession, SessionManager } from "./session-manager";

export class AuthenticationRequiredError extends Error {
  constructor(readonly code: "AUTHENTICATION_REQUIRED" | "SESSION_EXPIRED") {
    super(
      code === "SESSION_EXPIRED"
        ? "Your session has ended. Please sign in again."
        : "Please sign in to continue.",
    );
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationError extends Error {
  constructor() {
    super("You do not have permission to do that.");
    this.name = "AuthorizationError";
  }
}

/** Route-level guard: callers must not substitute a local role for PLAID ACLs. */
export async function requireAuthenticatedSession(
  sessions: SessionManager,
  cookieValue: string | null,
): Promise<Omit<IssuedSession, "cookieValue">> {
  const resolved = await sessions.resolve(cookieValue);
  if (resolved.state === "authenticated") return resolved.session;
  throw new AuthenticationRequiredError(
    resolved.state === "expired" ? "SESSION_EXPIRED" : "AUTHENTICATION_REQUIRED",
  );
}

/**
 * Use for DIG4EL-local records only. PLAID project/document permissions must
 * still be checked against the present PLAID API response on every request.
 */
export function assertLocalRecordOwnership(currentUserId: string, ownerUserId: string): void {
  if (currentUserId !== ownerUserId) throw new AuthorizationError();
}
