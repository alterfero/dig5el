"use client";
import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import { contributeMessages } from "../../i18n/contribute";
export default function ContributeError({ reset }: { reset: () => void }) {
  const { locale } = useLocale(); const c = contributeMessages[locale];
  return <main className="auth-page"><section className="auth-card"><h1>{c.loadError}</h1><p>{c.retryHint}</p><button className="contribute-primary" onClick={reset}>{c.retry}</button><Link href="/">{c.home}</Link></section></main>;
}
