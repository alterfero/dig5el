import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAccessScreen, AdministrationPageFrame } from "../../components/admin-access-screen";
import { getLocalAuthRuntime } from "../../server/auth/auth-runtime";
import { getSessionCookieName } from "../../server/auth/cookies";
import { AuthenticationRequiredError, requireAuthenticatedSession } from "../../server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Authentication is checked on the server before the access UI renders. The
 * API routes repeat the project-specific authorization for every request.
 */
export default async function AdministrationPage() {
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

  return (
    <AdministrationPageFrame>
      <AdminAccessScreen />
    </AdministrationPageFrame>
  );
}
