import {
  readJsonObject,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../../server/auth/route-utils";
import { requireAdminMutationRoute } from "../../../../../server/admin/admin-route";
import { requiredBoolean, requiredStringArray } from "../../../../../server/admin/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * Updates local operational access only: the global system-administrator
 * capability and the exact set of language projects where this user is a
 * caretaker. It never represents a PLAID user type or corpus permission.
 */
export async function PATCH(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users/:userId", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const { userId } = await routeContext.params;
    const body = await readJsonObject(request, ["systemAdministrator", "caretakerProjectIds"]);
    const user = await authenticated.admin.service.updateUser({
      actorUserId: authenticated.session.user.id,
      caretakerProjectIds: requiredStringArray(body.caretakerProjectIds),
      requestId: context.requestId,
      systemAdministrator: requiredBoolean(body.systemAdministrator),
      targetUserId: userId,
    });
    return responseWithAuthenticatedSession({ user }, authenticated);
  });
}

export async function DELETE(request: Request, routeContext: RouteContext): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users/:userId", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const { userId } = await routeContext.params;
    await authenticated.admin.service.deleteUser({
      actorUserId: authenticated.session.user.id,
      targetUserId: userId,
      requestId: context.requestId,
    });
    return responseWithAuthenticatedSession({ deleted: true }, authenticated);
  });
}
