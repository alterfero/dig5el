import { sourceRoute } from "../../../../../../../server/contribute/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; sourceId: string }> };
export async function GET(request: Request, context: Context) {
  const { projectId, sourceId } = await context.params;
  return sourceRoute(request, projectId, sourceId);
}
export async function PUT(request: Request, context: Context) {
  const { projectId, sourceId } = await context.params;
  return sourceRoute(request, projectId, sourceId);
}
