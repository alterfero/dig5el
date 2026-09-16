import { describe, expect, it, vi } from "vitest";
import {
  createPlaidGateway,
  PlaidGatewayError,
} from "../../server/plaid-gateway";
import {
  validateRuntimeEnv,
  type ServerRuntimeConfig,
} from "../../server/runtime-env";

function approvedConfig(): ServerRuntimeConfig {
  return {
    ...validateRuntimeEnv({
      DIG4EL_ENVIRONMENT: "development",
      PLAID_BASE_URL: "http://localhost:8787",
    }),
    // This fixture models a future approved hand-off. Runtime validation does
    // not permit this mode in the current foundation.
    plaidAuthMode: "approved",
  };
}

describe("PLAID gateway", () => {
  it("is unavailable while the foundation keeps PLAID auth disabled", () => {
    const config = validateRuntimeEnv({
      DIG4EL_ENVIRONMENT: "development",
      PLAID_BASE_URL: "http://localhost:8787",
    });

    expect(() => createPlaidGateway(config)).toThrow(PlaidGatewayError);
  });

  it("uses the pinned origin and a server-held credential only", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const gateway = createPlaidGateway(
      approvedConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await gateway.request(
      {
        method: "GET",
        operation: "background",
        path: "/api/v1/projects?limit=10",
      },
      { kind: "service", token: "server-only-token" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://localhost:8787/api/v1/projects?limit=10"),
      expect.objectContaining({
        headers: {
          accept: "application/json",
          authorization: "Bearer server-only-token",
        },
        redirect: "error",
      }),
    );
  });

  it("rejects hostile paths and a service credential for a user-directed write", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const gateway = createPlaidGateway(
      approvedConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      gateway.request(
        {
          method: "GET",
          operation: "background",
          path: "https://attacker.invalid/api/v1/projects",
        },
        { kind: "service", token: "server-only-token" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(
      gateway.request(
        {
          method: "POST",
          operation: "user-directed",
          path: "/api/v1/projects",
        },
        { kind: "service", token: "server-only-token" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
