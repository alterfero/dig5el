import { apiError, createRequestId } from "../../../server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableApiRoute(): Response {
  return apiError("NOT_FOUND", createRequestId());
}

export const DELETE = unavailableApiRoute;
export const GET = unavailableApiRoute;
export const OPTIONS = unavailableApiRoute;
export const PATCH = unavailableApiRoute;
export const POST = unavailableApiRoute;
export const PUT = unavailableApiRoute;
