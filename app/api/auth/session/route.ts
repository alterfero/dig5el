import {
  requireAuthenticatedRoute,
  responseWithResolvedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/auth/session", async (context) => {
    const authenticated = await requireAuthenticatedRoute(context, request);
    return responseWithResolvedSession(authenticated);
  });
}
