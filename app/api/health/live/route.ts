import { liveHealthResponse } from "../../../../server/health";
import { createRequestId } from "../../../../server/http";
import { createLogger } from "../../../../server/logger";
import { readNodeRuntimeBindings } from "../../../../server/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  const requestId = createRequestId();
  const bindings = readNodeRuntimeBindings();
  const response = liveHealthResponse(requestId);

  createLogger(bindings.DIG4EL_LOG_LEVEL).info("request.completed", {
    event: "request.completed",
    method: "GET",
    requestId,
    route: "/api/health/live",
    status: response.status,
  });

  return response;
}
