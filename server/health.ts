import { apiSuccess } from "./http";
import { getLocalAuthRuntime } from "./auth/auth-runtime";
import { inspectRuntimeEnv, type RuntimeBindings } from "./runtime-env";

export const applicationVersion = "0.1.0";

export function liveHealthResponse(requestId: string): Response {
  return apiSuccess(
    { status: "ok", service: "dig4el", version: applicationVersion },
    requestId,
  );
}

/**
 * Readiness intentionally exposes dependency state, not connection strings,
 * database errors, or account data. When local auth is enabled it verifies the
 * authentication and local-administration schema rather than treating a
 * valid-looking URL as ready.
 */
export async function readyHealthResponse(
  bindings: RuntimeBindings,
  requestId: string,
): Promise<Response> {
  const runtime = inspectRuntimeEnv(bindings);
  if (!runtime.ready) {
    return apiSuccess(
      {
        status: "degraded",
        service: "dig4el",
        version: applicationVersion,
        dependencies: {
          configuration: "degraded",
          localPersistence: "not-configured",
          plaidProbe: "not-run",
        },
      },
      requestId,
      503,
    );
  }

  if (runtime.config.dig4elAuthMode !== "local-password") {
    return apiSuccess(
      {
        status: "ready",
        service: "dig4el",
        version: applicationVersion,
        dependencies: {
          configuration: "ready",
          localPersistence: "not-configured",
          plaidProbe: "not-run",
        },
      },
      requestId,
    );
  }

  try {
    const auth = getLocalAuthRuntime(bindings);
    await auth.persistence.store.ping();
    return apiSuccess(
      {
        status: "ready",
        service: "dig4el",
        version: applicationVersion,
        dependencies: {
          configuration: "ready",
          localPersistence: auth.persistence.persistent ? "ready" : "development-only",
          plaidProbe: "not-run",
        },
      },
      requestId,
    );
  } catch {
    return apiSuccess(
      {
        status: "degraded",
        service: "dig4el",
        version: applicationVersion,
        dependencies: {
          configuration: "ready",
          localPersistence: "degraded",
          plaidProbe: "not-run",
        },
      },
      requestId,
      503,
    );
  }
}
