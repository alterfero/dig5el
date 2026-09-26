import { readyHealthResponse } from "../../../../server/health";
import { createRequestId } from "../../../../server/http";
import { createLogger } from "../../../../server/logger";
import { readNodeRuntimeBindings } from "../../../../server/runtime-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  const bindings = readNodeRuntimeBindings();
  const response = await readyHealthResponse(bindings, requestId);

  createLogger(bindings.DIG4EL_LOG_LEVEL).info("request.completed", {
    event: "request.completed",
    method: "GET",
    requestId,
    route: "/api/health/ready",
    status: response.status,
  });

  return response;
}
