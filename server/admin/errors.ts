/**
 * Deliberately small, server-only errors for local DIG4EL administration.
 * They do not represent, mirror, or authorize PLAID corpus access.
 */
export class AdminAuthorizationError extends Error {
  constructor() {
    super("You do not have permission to manage this local DIG4EL project.");
    this.name = "AdminAuthorizationError";
  }
}

export class AdminConflictError extends Error {
  constructor(
    readonly code:
      | "LANGUAGE_EXISTS"
      | "LAST_MAINTAINER"
      | "LAST_SYSTEM_ADMINISTRATOR"
      | "MEMBERSHIP_EXISTS",
  ) {
    super(
      code === "LANGUAGE_EXISTS"
        ? "That language is already available in DIG4EL."
        : code === "LAST_MAINTAINER"
        ? "Each language project needs at least one maintainer."
        : code === "LAST_SYSTEM_ADMINISTRATOR"
          ? "At least one active system administrator is required."
          : "That person already has access to this language project.",
    );
    this.name = "AdminConflictError";
  }
}

export class AdminNotFoundError extends Error {
  constructor(
    readonly resource: "language" | "language_project" | "membership" | "user",
  ) {
    super("That item is not available.");
    this.name = "AdminNotFoundError";
  }
}

export class AdminValidationError extends Error {
  constructor() {
    super("Please check that request and try again.");
    this.name = "AdminValidationError";
  }
}
