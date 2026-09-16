import { apiSuccess } from "./http";
import { inspectRuntimeEnv, type RuntimeBindings } from "./runtime-env";

export const applicationVersion = "0.1.0";

export function liveHealthResponse(requestId: string): Response {
  return apiSuccess(
    { status: "ok", service: "dig4el", version: applicationVersion },
    requestId,
  );
}

/**
 * This foundation has no local database or session store yet. Future adapters
 * can make them required dependencies without exposing their diagnostics here.
 */
export function readyHealthResponse(
  bindings: RuntimeBindings,
  requestId: string,
): Response {
  const runtime = inspectRuntimeEnv(bindings);
  const ready = runtime.ready;

  return apiSuccess(
    {
      status: ready ? "ready" : "degraded",
      service: "dig4el",
      version: applicationVersion,
      dependencies: {
        configuration: ready ? "ready" : "degraded",
        localPersistence: "not-configured",
        plaidProbe: "not-run",
      },
    },
    requestId,
    ready ? 200 : 503,
  );
}
