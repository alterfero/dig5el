import {
  readJsonObject,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../../../server/auth/route-utils";
import { requireAdminMutationRoute, requireAdminReadRoute } from "../../../../../../server/admin/admin-route";
import { permissionAuditDto, projectMembersDto } from "../../../../../../server/admin/api-dto";
import { requiredBoolean, requiredString } from "../../../../../../server/admin/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/projects/:projectId/access", async (context) => {
    const authenticated = await requireAdminReadRoute(context, request);
    const { projectId } = await routeContext.params;
    const result = await authenticated.admin.service.getProjectAccess({
      actorUserId: authenticated.session.user.id,
      projectId,
    });
    return responseWithAuthenticatedSession({
      audit: permissionAuditDto(result.audit),
      canManageAccess: result.canManageAccess,
      members: projectMembersDto(result.members),
      project: { id: result.project.id, name: result.project.name },
      systemAdministrator: result.systemAdministrator,
    }, authenticated);
  });
}

export async function POST(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/projects/:projectId/access", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const { projectId } = await routeContext.params;
    const body = await readJsonObject(request, ["email", "role", "caretaker"]);
    const membership = await authenticated.admin.service.grantMembership({
      actorUserId: authenticated.session.user.id,
      caretaker: requiredBoolean(body.caretaker),
      email: requiredString(body.email),
      projectId,
      requestId: context.requestId,
      role: requiredString(body.role),
    });
    return responseWithAuthenticatedSession({ membership }, authenticated, 201);
  });
}
