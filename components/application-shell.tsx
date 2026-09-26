"use client";

import Image from "next/image";
import Link from "next/link";
import { AuthStatusControl } from "./auth-status-control";
import { Icon } from "./icon";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-provider";

const externalLink = {
  rel: "noreferrer",
  target: "_blank",
} as const;

export function ApplicationShell() {
  const { t } = useLocale();

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">
        {t("a11y.skipToMain")}
      </a>

      <header className="landing-header">
        <div className="landing-header-inner">
          <a
            aria-label={t("a11y.home")}
            className="brand"
            href="#about"
            title={t("a11y.home")}
          >
            <span aria-hidden="true" className="brand-mark">
              D
            </span>
            <span>DIG4EL</span>
          </a>

          <nav aria-label={t("a11y.primaryNavigation")} className="landing-navigation">
            <Link href="/contribute">{t("nav.contribute")}</Link>
            <span aria-disabled="true" role="link">{t("nav.generate")}</span>
          </nav>

          <div className="topbar-actions">
            <AuthStatusControl />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="landing-main" id="main-content" tabIndex={-1}>
        <section aria-labelledby="landing-title" className="landing-introduction" id="about">
          <h1 className="landing-section-title" id="landing-title">{t("hero.title")}</h1>
          <p className="landing-summary">
            {t("hero.summary")} {t("hero.governance.beforeCare")}
            <a href="https://www.gida-global.org/careprinciples" {...externalLink}>CARE</a>
            {t("hero.governance.afterCare")}
            <a href="https://www.go-fair.org/fair-principles/" {...externalLink}>FAIR</a>
            {t("hero.governance.afterFair")}
          </p>
        </section>

        <section aria-labelledby="worth-reading-title" className="worth-reading" id="worth-reading">
          <div className="worth-reading-heading">
            <h2 className="landing-section-title" id="worth-reading-title">{t("reading.title")}</h2>
            <p>{t("reading.summary")}</p>
          </div>

          <div className="reading-grid">
            <details className="reading-item">
              <summary>
                <span>
                  <strong>{t("reading.notice.title")}</strong>
                  <span>{t("reading.notice.summary")}</span>
                </span>
              </summary>
              <div className="reading-detail">
                <p>{t("reading.notice.detail")}</p>
              </div>
            </details>

            <details className="reading-item">
              <summary>
                <span>
                  <strong>{t("reading.access.title")}</strong>
                  <span>{t("reading.access.summary")}</span>
                </span>
              </summary>
              <div className="reading-detail">
                <p>{t("reading.access.detail")}</p>
              </div>
            </details>

            <details className="reading-item">
              <summary>
                <span>
                  <strong>{t("reading.references.title")}</strong>
                  <span>{t("reading.references.summary")}</span>
                </span>
              </summary>
              <div className="reading-detail">
                <p>{t("reading.references.detail")}</p>
                <ul>
                  <li>
                    <a href="https://doi.org/10.5281/zenodo.16944459" {...externalLink}>
                      {t("reading.references.dig4el")}
                    </a>
                  </li>
                  <li>
                    <a href="https://aclanthology.org/2026.findings-acl.1327.pdf" {...externalLink}>
                      {t("reading.references.paper")}
                    </a>
                  </li>
                  <li>
                    <a href="https://aclanthology.org/2026.computel-1.4.pdf" {...externalLink}>
                      {t("reading.references.interactiveSystem")}
                    </a>
                  </li>
                  <li>
                    <a href="https://aclanthology.org/2026.computel-1.15.pdf" {...externalLink}>
                      {t("reading.references.infrastructure")}
                    </a>
                  </li>
                  <li>
                    <a href="https://wals.info/" {...externalLink}>WALS</a>
                    <span aria-hidden="true"> · </span>
                    <a href="https://grambank.clld.org/" {...externalLink}>Grambank</a>
                  </li>
                  <li>
                    <a href="https://hal.science/hal-02061237/document" {...externalLink}>
                      {t("reading.references.questionnaires")}
                    </a>
                  </li>
                </ul>
              </div>
            </details>

            <details className="reading-item">
              <summary>
                <span>
                  <strong>{t("reading.project.title")}</strong>
                  <span>{t("reading.project.summary")}</span>
                </span>
              </summary>
              <div className="reading-detail">
                <p>
                  {t("reading.project.detail")}{" "}
                  <a href="https://www.cnrs.fr/en/ri2-project/heliceo" {...externalLink}>
                    {t("reading.project.link")}
                  </a>
                  .
                </p>
              </div>
            </details>
          </div>
        </section>
        <div className="landing-actions">
          <Link className="landing-action landing-action-contribute" href="/contribute">
            <span>{t("home.action.contribute")}</span>
            <Icon className="landing-action-arrow" name="arrow-right" />
          </Link>
          <Link className="landing-action landing-action-generate" href="/generate">
            <span>{t("home.action.generate")}</span>
            <Icon className="landing-action-arrow" name="arrow-right" />
          </Link>
        </div>
        <figure className="landing-project-centered col-span-full grid justify-items-center gap-2.5 m-0 text-center">
          <Image
            alt="Heliceo"
            className="landing-project-logo"
            height={296}
            sizes="(max-width: 620px) 110px, 180px"
            src="/landing/Heliceo_logo_lite.png"
            width={296}
          />
          <figcaption className="text-xs leading-normal text-[var(--muted)]">
            {t("home.project.beforeName")}
            <a className="font-semibold underline underline-offset-2" href="https://www.cnrs.fr/en/ri2-project/heliceo" {...externalLink}>Heliceo</a>
            {t("home.project.afterName")}
          </figcaption>
        </figure>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-copy">
          <p>{t("footer.support")}</p>
          <div>
            <span>{t("footer.license")}</span>
            <span aria-hidden="true"> · </span>
            <a href="https://github.com/alterfero/dig4el" {...externalLink}>
              {t("footer.source")}
            </a>
          </div>
        </div>
        <div className="partner-logos-clip">
          <Image
            alt={t("footer.logos")}
            className="partner-logos"
            height={208}
            src="/landing/supporting-organizations.png"
            width={1191}
          />
        </div>
      </footer>
    </div>
  );
}
