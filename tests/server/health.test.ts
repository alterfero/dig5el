import { afterEach, describe, expect, it } from "vitest";
import { resetLocalAuthRuntimeForTests } from "../../server/auth/auth-runtime";
import { liveHealthResponse, readyHealthResponse } from "../../server/health";

describe("health endpoints", () => {
  afterEach(async () => {
    await resetLocalAuthRuntimeForTests();
  });
  it("returns a no-store liveness response without configuration", async () => {
    const response = liveHealthResponse("req_live");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      data: { status: "ok", service: "dig4el", version: "0.1.0" },
      meta: { requestId: "req_live" },
    });
  });

  it("never returns PLAID credentials in readiness data", async () => {
    const secret = "do-not-return-this-service-token";
    const response = await readyHealthResponse(
      {
        DIG4EL_ENVIRONMENT: "development",
        PLAID_AUTH_MODE: "disabled",
        PLAID_SERVICE_TOKEN: secret,
      },
      "req_ready",
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(payload).toMatchObject({
      data: {
        status: "ready",
        dependencies: {
          configuration: "ready",
          plaidProbe: "not-run",
        },
      },
      meta: { requestId: "req_ready" },
    });
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  it("reports an invalid runtime configuration without diagnostics", async () => {
    const response = await readyHealthResponse(
      { DIG4EL_ENVIRONMENT: "production", PLAID_BASE_URL: "http://unsafe.test" },
      "req_degraded",
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      data: {
        status: "degraded",
        dependencies: { configuration: "degraded" },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("unsafe.test");
  });

  it("fails readiness closed when an environment is absent", async () => {
    const response = await readyHealthResponse({ PLAID_AUTH_MODE: "disabled" }, "req_missing");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: "degraded" },
    });
  });

  it("probes the configured local auth store before reporting ready", async () => {
    const response = await readyHealthResponse(
      {
        DIG4EL_APP_ORIGIN: "http://localhost:3000",
        DIG4EL_AUTH_MODE: "local-password",
        DIG4EL_ENVIRONMENT: "development",
        PLAID_AUTH_MODE: "disabled",
        SESSION_ENCRYPTION_KEY: "a".repeat(64),
      },
      "req_local_auth",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "ready",
        dependencies: { configuration: "ready", localPersistence: "development-only" },
      },
    });
  });
});
