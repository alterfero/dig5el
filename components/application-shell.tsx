"use client";

import { useEffect, useState } from "react";

type ConnectionState = "checking" | "ready" | "needs-setup";

type HealthPayload = {
  data?: {
    status?: "ready" | "degraded" | "ok";
  };
};

const primaryNavigation = ["Welcome", "Your language space", "People together"];
const supportNavigation = ["How DIG4EL works", "Get help"];

function connectionMessage(state: ConnectionState): string {
  if (state === "ready") return "Local service is ready";
  if (state === "needs-setup") return "Connection setup is still needed";
  return "Checking the local service";
}

export function ApplicationShell() {
  const [isNavigationOpen, setNavigationOpen] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkService() {
      try {
        const response = await fetch("/api/health/ready", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as HealthPayload;
        setConnectionState(
          response.ok && payload.data?.status === "ready"
            ? "ready"
            : "needs-setup",
        );
      } catch {
        if (!controller.signal.aborted) setConnectionState("needs-setup");
      }
    }

    void checkService();
    return () => controller.abort();
  }, []);

  const closeNavigation = () => setNavigationOpen(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to the main content
      </a>

      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="DIG4EL home">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>DIG4EL</span>
        </a>

        <div className="topbar-actions">
          <span className="connection-indicator" aria-hidden="true" />
          <span className="topbar-status">A thoughtful start</span>
          <button
            className="menu-button"
            type="button"
            aria-controls="primary-navigation"
            aria-expanded={isNavigationOpen}
            onClick={() => setNavigationOpen((isOpen) => !isOpen)}
          >
            {isNavigationOpen ? "Close menu" : "Open menu"}
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="sidebar">
          <nav
            aria-label="Primary navigation"
            className={isNavigationOpen ? "navigation navigation-open" : "navigation"}
            id="primary-navigation"
          >
            <p className="navigation-label">Your space</p>
            <ul>
              {primaryNavigation.map((item, index) => (
                <li key={item}>
                  <a
                    aria-current={index === 0 ? "page" : undefined}
                    href={index === 0 ? "#main-content" : "#coming-soon"}
                    onClick={closeNavigation}
                  >
                    <span className="nav-marker" aria-hidden="true" />
                    {item}
                  </a>
                </li>
              ))}
            </ul>

            <p className="navigation-label navigation-label-secondary">
              A little help
            </p>
            <ul>
              {supportNavigation.map((item) => (
                <li key={item}>
                  <a href="#coming-soon" onClick={closeNavigation}>
                    <span className="nav-marker nav-marker-soft" aria-hidden="true" />
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="main-content" className="main-content" tabIndex={-1}>
          <section className="welcome-panel" aria-labelledby="welcome-title">
            <p className="eyebrow">Welcome to your language space</p>
            <h1 id="welcome-title">Start with what you already know.</h1>
            <p className="welcome-copy">
              DIG4EL will help you keep stories, words, and community knowledge
              connected—without asking you to become a linguist first.
            </p>
            <div className="welcome-actions">
              <button
                aria-describedby="connection-note"
                className="primary-action"
                type="button"
                disabled
              >
                Connect a PLAID project
              </button>
              <p id="connection-note" className="action-note">
                Secure project connection is being prepared.
              </p>
            </div>
          </section>

          <section className="next-step-panel" aria-labelledby="next-step-title">
            <div>
              <p className="eyebrow">A gentle first step</p>
              <h2 id="next-step-title">Choose a place to begin</h2>
              <p>
                When your PLAID project is connected, you can choose what feels
                most useful today. Nothing needs to be perfect or complete.
              </p>
            </div>
            <div className="step-list" aria-label="Planned starting points">
              <article>
                <span className="step-number" aria-hidden="true">
                  1
                </span>
                <div>
                  <h3>Tell a short story</h3>
                  <p>Capture a memory, a conversation, or a small moment.</p>
                </div>
              </article>
              <article>
                <span className="step-number" aria-hidden="true">
                  2
                </span>
                <div>
                  <h3>Explore a word</h3>
                  <p>Notice how one familiar word is used and understood.</p>
                </div>
              </article>
              <article>
                <span className="step-number" aria-hidden="true">
                  3
                </span>
                <div>
                  <h3>Ask together</h3>
                  <p>Invite a relative, teacher, or friend into the process.</p>
                </div>
              </article>
            </div>
          </section>

          <section className="reassurance-grid" aria-label="DIG4EL principles">
            <article className="reassurance-card reassurance-card-strong">
              <p className="eyebrow">Made for people</p>
              <h2>Your knowledge stays in context.</h2>
              <p>
                DIG4EL is designed to make careful work feel calm, clear, and
                shared.
              </p>
            </article>
            <article className="reassurance-card">
              <p className="eyebrow">A secure boundary</p>
              <h2>PLAID stays behind the scenes.</h2>
              <p>
                Your browser talks only to DIG4EL. Sensitive PLAID credentials
                never enter the page.
              </p>
            </article>
          </section>
        </main>

        <aside className="right-rail" aria-label="Workspace status">
          <section className="status-card" aria-labelledby="status-title">
            <span className="status-orb" aria-hidden="true" />
            <p className="eyebrow">Connection check</p>
            <h2 id="status-title">{connectionMessage(connectionState)}</h2>
            <p>
              {connectionState === "ready"
                ? "The foundation is responding locally. PLAID sign-in remains intentionally off until it is approved."
                : "DIG4EL can be explored now. Add server-only settings when the PLAID connection is approved."}
            </p>
            <p className="status-live" role="status" aria-live="polite">
              {connectionMessage(connectionState)}
            </p>
          </section>

          <section className="tip-card" id="coming-soon">
            <p className="eyebrow">A promise</p>
            <h2>Plain language, careful records.</h2>
            <p>
              We will explain each next step in everyday words and make room for
              questions along the way.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
