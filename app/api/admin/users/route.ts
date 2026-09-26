import {
  readAuthJson,
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";
import {
  requireAdminMutationRoute,
  requireAdminReadRoute,
} from "../../../../server/admin/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users", async (context) => {
    const authenticated = await requireAdminReadRoute(context, request);
    const result = await authenticated.admin.service.listUsers(authenticated.session.user.id);
    return responseWithAuthenticatedSession(
      {
        projects: result.projects.map((project) => ({ id: project.id, name: project.name })),
        users: result.users,
      },
      authenticated,
    );
  });
}

/**
 * System administrators create a pending local account and receive its opaque
 * setup token once in this no-store response. The server stores only a hash.
 */
export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users", async (context) => {
    const authenticated = await requireAdminMutationRoute(context, request);
    const body = await readAuthJson(request, ["email"]);
    const provisioned = await authenticated.runtime.service.createPendingAccount({
      actorUserId: authenticated.session.user.id,
      email: body.email,
      requestId: authenticated.requestId,
    });
    return responseWithAuthenticatedSession(
      {
        setupToken: {
          expiresAt: provisioned.setupToken.expiresAt.toISOString(),
          token: provisioned.setupToken.token,
        },
        user: {
          activatedAt: provisioned.user.activatedAt?.toISOString() ?? null,
          email: provisioned.user.email,
          id: provisioned.user.id,
          status: provisioned.user.status,
        },
      },
      authenticated,
      201,
    );
  });
}
