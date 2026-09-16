import { describe, expect, it } from "vitest";
import {
  inspectRuntimeEnv,
  RuntimeConfigError,
  validateRuntimeEnv,
} from "../../server/runtime-env";

describe("runtime configuration", () => {
  it("allows an intentionally disabled local PLAID integration", () => {
    const config = validateRuntimeEnv({
      DIG4EL_APP_ORIGIN: "http://localhost:3000",
      DIG4EL_ENVIRONMENT: "development",
      PLAID_AUTH_MODE: "disabled",
      PLAID_BASE_URL: "http://localhost:8787",
    });

    expect(config.plaidAuthMode).toBe("disabled");
    expect(config.plaidBaseUrl?.origin).toBe("http://localhost:8787");
  });

  it("rejects HTTP PLAID origins outside local development", () => {
    expect(() =>
      validateRuntimeEnv({
        DIG4EL_ENVIRONMENT: "production",
        PLAID_BASE_URL: "http://plaid.example.org",
      }),
    ).toThrow(RuntimeConfigError);
  });

  it("rejects unapproved auth modes and malformed session keys", () => {
    expect(() =>
      validateRuntimeEnv({
        PLAID_AUTH_MODE: "password-pass-through",
        SESSION_ENCRYPTION_KEY: "too-short",
      }),
    ).toThrow(RuntimeConfigError);
  });

  it("returns only a safe degraded signal to health callers", () => {
    expect(
      inspectRuntimeEnv({
        DIG4EL_ENVIRONMENT: "production",
        PLAID_BASE_URL: "http://plaid.example.org",
      }),
    ).toEqual({ ready: false });
  });
});
