"use client";

import Link from "next/link";
import { Icon } from "../../components/icon";
import { useLocale } from "../../components/locale-provider";

/** Friendly boundary for a real auth/database outage, distinct from sign-out. */
export default function WorkspaceError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  const { t } = useLocale();
  return (
    <main className="auth-page workspace-page" id="main-content">
      <section aria-labelledby="workspace-error-title" className="auth-card workspace-card">
        <span aria-hidden="true" className="auth-success-icon"><Icon name="alert" /></span>
        <p className="eyebrow">DIG4EL</p>
        <h1 id="workspace-error-title">{t("workspace.unavailableTitle")}</h1>
        <p className="auth-description">{t("workspace.unavailableDescription")}</p>
        <div className="auth-links">
          <button className="auth-primary" onClick={reset} type="button">
            <Icon aria-hidden="true" name="arrow-right" />
            <span>{t("workspace.retry")}</span>
          </button>
          <Link className="auth-secondary-link" href="/">{t("workspace.home")}</Link>
        </div>
      </section>
    </main>
  );
}
