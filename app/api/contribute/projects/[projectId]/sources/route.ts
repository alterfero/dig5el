import { sourceRoute } from "../../../../../../server/contribute/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return sourceRoute(request, (await context.params).projectId);
}
