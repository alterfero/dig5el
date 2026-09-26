import {
  readAuthJson,
  requireSameOrigin,
  responseWithIssuedSession,
  runLocalAuthRoute,
} from "../../../../server/auth/route-utils";
import { trustedClientAddress } from "../../../../server/auth/auth-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return runLocalAuthRoute(request, "/api/auth/login", async (context) => {
    requireSameOrigin(context, request);
    const body = await readAuthJson(request, ["email", "password"]);
    const issued = await context.runtime.service.login({
      email: body.email,
      ip: trustedClientAddress(request, context.runtime),
      password: body.password,
    });
    return responseWithIssuedSession(issued, context.runtime, context.requestId);
  });
}
