import {
  responseWithAuthenticatedSession,
  runLocalAuthRoute,
} from "../../../../../../server/auth/route-utils";
import { requireAdminMutationRoute } from "../../../../../../server/admin/admin-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Issues an administrator-mediated password-recovery capability for an active account. */
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  return runLocalAuthRoute(request, "/api/admin/users/:userId/recovery-token", async (route) => {
    const authenticated = await requireAdminMutationRoute(route, request);
    const { userId } = await context.params;
    const issued = await authenticated.runtime.service.issuePasswordRecoveryToken({
      actorUserId: authenticated.session.user.id,
      requestId: authenticated.requestId,
      userId,
    });
    return responseWithAuthenticatedSession(
      {
        recoveryToken: {
          expiresAt: issued.recoveryToken.expiresAt.toISOString(),
          token: issued.recoveryToken.token,
        },
        user: {
          activatedAt: issued.user.activatedAt?.toISOString() ?? null,
          email: issued.user.email,
          id: issued.user.id,
          status: issued.user.status,
        },
      },
      authenticated,
    );
  });
}
