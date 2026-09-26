import { questionnaireTemplates } from "../../../../../server/contribute/templates";
import { requireAuthenticatedRoute, responseWithAuthenticatedSession, runLocalAuthRoute } from "../../../../../server/auth/route-utils";
import { apiError } from "../../../../../server/http";
export async function GET(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const templateId = (await context.params).templateId;
  return runLocalAuthRoute(request, "/api/contribute/questionnaires/:templateId", async (routeContext) => {
    const authenticated = await requireAuthenticatedRoute(routeContext, request);
    const template = questionnaireTemplates.find((item) => item.uid === templateId);
    return template ? responseWithAuthenticatedSession({ template }, authenticated) : apiError("NOT_FOUND", routeContext.requestId);
  });
}
