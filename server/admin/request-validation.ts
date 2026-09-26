import { AdminValidationError } from "./errors";

export function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AdminValidationError();
  return value;
}

export function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new AdminValidationError();
  return value;
}

export function requiredStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AdminValidationError();
  }
  return [...value];
}
