import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceScreen } from "../../components/workspace-screen";
import { getLocalAuthRuntime } from "../../server/auth/auth-runtime";
import { getSessionCookieName } from "../../server/auth/cookies";
import { AuthenticationRequiredError, requireAuthenticatedSession } from "../../server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * This is the initial protected page. Future authenticated pages and APIs must
 * use the same server-side guard; the browser cookie alone is never trusted.
 */
export default async function WorkspacePage() {
  try {
    const runtime = getLocalAuthRuntime();
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(getSessionCookieName(runtime.secureCookies))?.value ?? null;
    await requireAuthenticatedSession(runtime.sessions, cookieValue);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(error.code === "SESSION_EXPIRED" ? "/login?reason=expired" : "/login");
    }
    throw error;
  }

  return <WorkspaceScreen />;
}
