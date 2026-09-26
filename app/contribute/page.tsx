import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ContributeScreen } from "../../components/contribute/contribute-screen";
import { getLocalAuthRuntime } from "../../server/auth/auth-runtime";
import { getSessionCookieName } from "../../server/auth/cookies";
import { AuthenticationRequiredError, requireAuthenticatedSession } from "../../server/auth/guards";
import { createAdminRuntime } from "../../server/admin/admin-runtime";
import { projectListDto } from "../../server/admin/api-dto";
import { questionnaireTemplates } from "../../server/contribute/templates";

export const dynamic = "force-dynamic";

export default async function ContributePage() {
  let props;
  try {
    const runtime = getLocalAuthRuntime();
    const cookieStore = await cookies();
    const session = await requireAuthenticatedSession(runtime.sessions, cookieStore.get(getSessionCookieName(runtime.secureCookies))?.value ?? null);
    const result = await createAdminRuntime(runtime).service.listAccessibleProjects(session.user.id);
    props = {
      csrfToken: session.csrfToken,
      projects: projectListDto(result.projects, result.systemAdministrator),
      templates: questionnaireTemplates.map((item) => ({ uid: item.uid, title: item.title, context: item.context, count: Object.keys(item.dialog).length })),
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect(error.code === "SESSION_EXPIRED" ? "/login?reason=expired" : "/login");
    throw error;
  }
  return <ContributeScreen {...props} />;
}
