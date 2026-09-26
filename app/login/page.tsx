import { AuthScreen } from "../../components/auth-screen";

type LoginPageProps = {
  searchParams: Promise<{ reason?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: Readonly<LoginPageProps>) {
  const { reason } = await searchParams;
  const isExpired = Array.isArray(reason) ? reason.includes("expired") : reason === "expired";

  return <AuthScreen mode="login" notice={isExpired ? "session-expired" : undefined} />;
}
