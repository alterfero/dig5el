import {
  readJsonObject,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";
import { requireAdminMutationRoute, requireAdminReadRoute } from "../../../../server/admin/admin-route";
import { projectListDto } from "../../../../server/admin/api-dto";
import { requiredString } from "../../../../server/admin/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/projects", async (context) => {
    const authenticated = await requireAdminReadRoute(context, request);
    const result = await authenticated.admin.service.listAccessibleProjects(
      authenticated.session.user.id,
    );
    return responseWithAuthenticatedSession({
      projects: projectListDto(result.projects, result.systemAdministrator),
      systemAdministrator: result.systemAdministrator,
    }, authenticated);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/projects", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const body = await readJsonObject(request, ["languageKey"]);
    const project = await authenticated.admin.service.createProject({
      actorUserId: authenticated.session.user.id,
      languageKey: requiredString(body.languageKey),
      requestId: context.requestId,
    });
    return responseWithAuthenticatedSession({ project }, authenticated, 201);
  });
}
