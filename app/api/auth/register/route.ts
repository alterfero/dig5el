import { trustedClientAddress } from "../../../../server/auth/auth-runtime";
import {
  readAuthJson,
  requireSameOrigin,
  responseWithIssuedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/auth/register", async (context) => {
    requireSameOrigin(context, request);
    const body = await readAuthJson(request, ["token", "password"]);
    const issued = await context.runtime.service.register({
      ip: trustedClientAddress(request, context.runtime),
      password: body.password,
      token: body.token,
    });
    return responseWithIssuedSession(issued, context.runtime, context.requestId);
  });
}
