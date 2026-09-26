/** Input validation for the local DIG4EL account identifier. */

export class EmailValidationError extends Error {
  constructor(readonly code: "EMAIL_INVALID" | "EMAIL_TOO_LONG") {
    super("Please enter a valid email address.");
    this.name = "EmailValidationError";
  }
}

const maximumEmailLength = 320;
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * DIG4EL treats the normalized email as its local login identifier. It is not
 * a PLAID identifier and is never used to infer a PLAID account.
 */
export function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > maximumEmailLength) {
    throw new EmailValidationError("EMAIL_TOO_LONG");
  }
  if (!emailShape.test(normalized)) {
    throw new EmailValidationError("EMAIL_INVALID");
  }
  return normalized;
}
