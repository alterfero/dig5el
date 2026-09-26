import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthActionPurpose, NewAuthActionToken } from "./auth-store";

const actionTokenLength = 32;
const tokenShape = /^[A-Za-z0-9_-]{43}$/u;

export type IssuedAuthActionToken = {
  expiresAt: Date;
  id: string;
  purpose: AuthActionPurpose;
  token: string;
};

export type MintedAuthActionToken = {
  action: IssuedAuthActionToken;
  stored: NewAuthActionToken;
};

/** Registration tokens intentionally last longer than recovery tokens. */
export const actionTokenLifetimeMs: Record<AuthActionPurpose, number> = {
  account_registration: 7 * 24 * 60 * 60 * 1000,
  password_recovery: 60 * 60 * 1000,
};

export function isValidAuthActionToken(token: string): boolean {
  return tokenShape.test(token);
}

/**
 * The database stores only this one-way digest. Purpose domain separation
 * means a setup token cannot be replayed as a recovery token (or vice versa).
 */
export function hashAuthActionToken(
  purpose: AuthActionPurpose,
  token: string,
): string | null {
  if (!isValidAuthActionToken(token)) return null;
  return createHash("sha256")
    .update(`dig4el.auth.action.${purpose}.v1\0`, "utf8")
    .update(token, "utf8")
    .digest("base64url");
}

/**
 * Mints an opaque 256-bit capability. Callers must return the raw token only
 * in the administrator response that creates it; never persist or log it.
 */
export function mintAuthActionToken(
  purpose: AuthActionPurpose,
  userId: string,
  issuedByUserId: string | null,
  now = new Date(),
): MintedAuthActionToken {
  const token = randomBytes(actionTokenLength).toString("base64url");
  const tokenHash = hashAuthActionToken(purpose, token);
  if (!tokenHash) throw new Error("Could not create an authentication action token.");
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + actionTokenLifetimeMs[purpose]);
  return {
    action: { expiresAt, id, purpose, token },
    stored: {
      expiresAt,
      id,
      issuedByUserId,
      now,
      purpose,
      tokenHash,
      userId,
    },
  };
}
