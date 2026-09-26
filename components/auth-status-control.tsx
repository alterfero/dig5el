"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icon";
import { useLocale } from "./locale-provider";

type SessionState =
  | { kind: "checking" }
  | { kind: "signed-out" }
  | { csrfToken: string; systemAdministrator: boolean; kind: "signed-in" }
  | { kind: "signing-out"; csrfToken: string; systemAdministrator: boolean }
  | { kind: "unavailable" };

type SessionPayload = {
  data?: {
    session?: {
      csrfToken?: unknown;
      user?: { systemAdministrator?: unknown };
    };
  };
};

function csrfFrom(payload: SessionPayload | null): string | null {
  const token = payload?.data?.session?.csrfToken;
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/u.test(token) ? token : null;
}

/**
 * Keeps the browser interaction deliberately small: the HttpOnly cookie stays
 * unreadable and this component holds only the short-lived CSRF proof needed
 * for a same-origin sign-out request.
 */
export function AuthStatusControl() {
  const { t } = useLocale();
  const [state, setState] = useState<SessionState>({ kind: "checking" });
  const [signOutError, setSignOutError] = useState(false);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal,
      });
      const payload = (await response.json().catch(() => null)) as SessionPayload | null;
      const csrfToken = response.ok ? csrfFrom(payload) : null;
      if (signal?.aborted) return;
      if (csrfToken) setState({ csrfToken, systemAdministrator: payload?.data?.session?.user?.systemAdministrator === true, kind: "signed-in" });
      else if (response.status === 401) setState({ kind: "signed-out" });
      else setState({ kind: "unavailable" });
    } catch {
      if (!signal?.aborted) setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadSession(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSession]);

  async function signOut() {
    if (state.kind !== "signed-in") return;
    const { csrfToken, systemAdministrator } = state;
    setSignOutError(false);
    setState({ csrfToken, systemAdministrator, kind: "signing-out" });
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "x-dig4el-csrf": csrfToken,
        },
      });
      if (response.ok || response.status === 401) {
        setState({ kind: "signed-out" });
        window.dispatchEvent(new Event("dig4el:signed-out"));
      } else {
        setSignOutError(true);
        setState({ csrfToken, systemAdministrator, kind: "signed-in" });
      }
    } catch {
      setSignOutError(true);
      setState({ csrfToken, systemAdministrator, kind: "signed-in" });
    }
  }

  if (state.kind === "checking") {
    return (
      <span aria-label={t("auth.status.checking")} className="auth-status-checking" role="status">
        <span aria-hidden="true" className="auth-spinner" />
      </span>
    );
  }

  if (state.kind === "signed-out") {
    return (
      <Link
        aria-label={t("auth.status.signIn")}
        className="icon-button"
        data-tooltip={t("auth.status.signIn")}
        href="/login"
        title={t("auth.status.signIn")}
      >
        <Icon className="interface-icon" name="lock" />
      </Link>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <>
        <button
          aria-label={t("auth.status.retry")}
          className="icon-button"
          data-tooltip={t("auth.status.unavailable")}
          onClick={() => void loadSession()}
          title={t("auth.status.unavailable")}
          type="button"
        >
          <Icon className="interface-icon" name="alert" />
        </button>
        <span className="sr-only" role="alert">{t("auth.status.unavailable")}</span>
      </>
    );
  }

  const isSigningOut = state.kind === "signing-out";
  return (
    <>
      {state.systemAdministrator && (
        <Link className="admin-navigation-link" href="/admin">{t("nav.admin")}</Link>
      )}
      <button
        aria-label={t(isSigningOut ? "auth.status.signingOut" : "auth.status.signOut")}
        className="icon-button"
        data-tooltip={t(isSigningOut ? "auth.status.signingOut" : "auth.status.signOut")}
        disabled={isSigningOut}
        onClick={() => void signOut()}
        title={t(isSigningOut ? "auth.status.signingOut" : "auth.status.signOut")}
        type="button"
      >
        {isSigningOut ? <span aria-hidden="true" className="auth-spinner" /> : <Icon className="interface-icon" name="arrow-right" />}
      </button>
      {signOutError && <span className="sr-only" role="alert">{t("auth.status.signOutError")}</span>}
    </>
  );
}
