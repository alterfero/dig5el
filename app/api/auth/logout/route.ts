import {
  requireAuthenticatedCsrf,
  requireAuthenticatedRoute,
  requireSameOrigin,
  responseAfterLogout,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/auth/logout", async (context) => {
    requireSameOrigin(context, request);
    const authenticated = await requireAuthenticatedRoute(context, request);
    requireAuthenticatedCsrf(authenticated, request);
    await context.runtime.sessions.destroy(authenticated.cookieValue);
    return responseAfterLogout(authenticated);
  });
}
