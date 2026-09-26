import {
  readJsonObject,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";
import { requireAdminMutationRoute, requireAdminReadRoute } from "../../../../server/admin/admin-route";
import { requiredString } from "../../../../server/admin/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Search is intentionally separate from language-project administration: the
 * baseline catalogue must not become thousands of local access-space tabs.
 */
export async function GET(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/languages", async (context) => {
    const authenticated = await requireAdminReadRoute(context, request);
    const query = new URL(request.url).searchParams.get("query") ?? "";
    const languages = await authenticated.admin.service.searchLanguages(query);
    return responseWithAuthenticatedSession({ languages }, authenticated);
  });
}

/** Adds a non-baseline language and records its origin and creating user. */
export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/languages", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const body = await readJsonObject(request, ["name", "regionOrCountry"]);
    const language = await authenticated.admin.service.createCustomLanguage({
      actorUserId: authenticated.session.user.id,
      name: requiredString(body.name),
      regionOrCountry: requiredString(body.regionOrCountry),
      requestId: context.requestId,
    });
    return responseWithAuthenticatedSession({ language }, authenticated, 201);
  });
}
