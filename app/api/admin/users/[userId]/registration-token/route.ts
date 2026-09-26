import {
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../../../server/auth/route-utils";
import { requireAdminMutationRoute } from "../../../../../../server/admin/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Replaces a lost setup token for a still-pending account. */
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users/:userId/registration-token", async (route) => {
    const authenticated = await requireAdminMutationRoute(route, request);
    const { userId } = await context.params;
    const provisioned = await authenticated.runtime.service.issueRegistrationToken({
      actorUserId: authenticated.session.user.id,
      requestId: authenticated.requestId,
      userId,
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
    );
  });
}
