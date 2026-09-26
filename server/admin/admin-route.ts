import {
  requireAuthenticatedCsrf,
  requireAuthenticatedRoute,
  requireSameOrigin,
  type AuthenticatedRouteContext,
  type AuthRouteContext,
} from "../auth/route-utils";
import { createAdminRuntime } from "./admin-runtime";

export type AuthenticatedAdminRouteContext = AuthenticatedRouteContext & {
  admin: ReturnType<typeof createAdminRuntime>;
};

export async function requireAdminReadRoute(
  context: AuthRouteContext,
  request: Request,
): Promise<AuthenticatedAdminRouteContext> {
  const authenticated = await requireAuthenticatedRoute(context, request);
  return { ...authenticated, admin: createAdminRuntime(context.runtime) };
}

/** All local-access mutations require an authenticated, same-origin CSRF proof. */
export async function requireAdminMutationRoute(
  context: AuthRouteContext,
  request: Request,
): Promise<AuthenticatedAdminRouteContext> {
  requireSameOrigin(context, request);
  const authenticated = await requireAuthenticatedRoute(context, request);
  requireAuthenticatedCsrf(authenticated, request);
  return { ...authenticated, admin: createAdminRuntime(context.runtime) };
}
