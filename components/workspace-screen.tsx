"use client";

import Link from "next/link";
import { AuthStatusControl } from "./auth-status-control";
import { Icon } from "./icon";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-provider";

/** A deliberately small authenticated landing page until workspace features arrive. */
export function WorkspaceScreen() {
  const { t } = useLocale();
  return (
    <main className="auth-page workspace-page" id="main-content">
      <header className="auth-topbar">
        <Link aria-label={t("auth.backHome")} className="brand" href="/" title={t("auth.backHome")}>
          <span aria-hidden="true" className="brand-mark">D</span>
          <span>DIG4EL</span>
        </Link>
        <div className="topbar-actions">
          <AuthStatusControl />
          <LanguageSwitcher />
        </div>
      </header>
      <section aria-labelledby="workspace-title" className="auth-card workspace-card">
        <span aria-hidden="true" className="auth-success-icon"><Icon name="check" /></span>
        <p className="eyebrow">{t("workspace.eyebrow")}</p>
        <h1 id="workspace-title">{t("workspace.title")}</h1>
        <p className="auth-description">{t("workspace.description")}</p>
        <Link className="auth-primary-button" href="/contribute">{t("nav.contribute")}</Link>
        <Link className="auth-secondary-link" href="/admin">{t("admin.access")}</Link>
        <Link className="auth-secondary-link" href="/">{t("workspace.home")}</Link>
      </section>
    </main>
  );
}
