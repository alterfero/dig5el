import {
  readJsonObject,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../../../../server/auth/route-utils";
import { requireAdminMutationRoute } from "../../../../../../../server/admin/admin-route";
import { requiredBoolean, requiredString } from "../../../../../../../server/admin/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string; userId: string }> };

export async function PATCH(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(
    request,
    "/api/admin/projects/:projectId/access/:userId",
    async (context) => {
      const authenticated = await requireAdminMutationRoute(context, request);
      const { projectId, userId } = await routeContext.params;
      const body = await readJsonObject(request, ["role", "caretaker"]);
      const membership = await authenticated.admin.service.changeMembership({
        actorUserId: authenticated.session.user.id,
        caretaker: requiredBoolean(body.caretaker),
        projectId,
        requestId: context.requestId,
        role: requiredString(body.role),
        targetUserId: userId,
      });
      return responseWithAuthenticatedSession({ membership }, authenticated);
    },
  );
}

export async function DELETE(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(
    request,
    "/api/admin/projects/:projectId/access/:userId",
    async (context) => {
      const authenticated = await requireAdminMutationRoute(context, request);
      const { projectId, userId } = await routeContext.params;
      await authenticated.admin.service.revokeMembership({
        actorUserId: authenticated.session.user.id,
        projectId,
        requestId: context.requestId,
        targetUserId: userId,
      });
      return responseWithAuthenticatedSession({ revoked: true }, authenticated);
    },
  );
}
