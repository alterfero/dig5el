"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { MessageKey } from "../i18n/messages";
import { Icon } from "./icon";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-provider";

export type AuthMode = "login" | "register" | "recover" | "reset";

type AuthScreenProps = {
  /** A token may be supplied by a route host or entered directly by the person. */
  initialToken?: string;
  mode: AuthMode;
  notice?: "session-expired";
  /** Lets the route host own navigation; useful for an embedded/native shell too. */
  onNavigate?: (destination: string) => void;
};

type AuthResponse = {
  data?: {
    redirectTo?: unknown;
  };
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

const minimumPasswordLength = 12;

const errorMessageKeys: Record<string, MessageKey> = {
  AUTHENTICATION_REQUIRED: "auth.error.authenticationRequired",
  EMAIL_INVALID: "auth.error.emailInvalid",
  EMAIL_TOO_LONG: "auth.error.emailTooLong",
  INVALID_CREDENTIALS: "auth.error.invalidCredentials",
  INVALID_OR_EXPIRED_TOKEN: "auth.error.invalidOrExpiredToken",
  ORIGIN_MISMATCH: "auth.error.originMismatch",
  PASSWORD_TOO_LONG: "auth.error.passwordLong",
  PASSWORD_TOO_SHORT: "auth.error.passwordShort",
  RATE_LIMITED: "auth.error.rateLimited",
  SESSION_EXPIRED: "auth.error.sessionExpired",
  TOKEN_INVALID_OR_EXPIRED: "auth.error.invalidOrExpiredToken",
  TOKEN_REQUIRED: "auth.error.tokenRequired",
  UNAUTHORIZED: "auth.error.unauthorized",
  VALIDATION_FAILED: "auth.error.validation",
};

type ErrorMessage = { key: MessageKey; kind: "translated" } | null;

function responseErrorMessage(payload: AuthResponse | null): ErrorMessage {
  const code = typeof payload?.error?.code === "string" ? payload.error.code : "";
  const mappedKey = errorMessageKeys[code];
  if (mappedKey) return { kind: "translated", key: mappedKey };

  // Keep UI errors deliberate and localized. Server text may contain a useful
  // implementation detail, but it must never become part of the auth surface.
  return null;
}

function destinationFrom(payload: AuthResponse | null, fallback: string): string {
  const candidate = payload?.data?.redirectTo;
  return typeof candidate === "string" && candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : fallback;
}

async function postAuth(path: string, body: Record<string, string>): Promise<AuthResponse> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as AuthResponse | null;
  if (!response.ok) {
    const error = new Error("AUTH_REQUEST_FAILED");
    Object.assign(error, { payload });
    throw error;
  }

  return payload ?? {};
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function tokenFromFragment(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim() ?? "";
}

function AuthFrame({
  children,
  description,
  title,
}: Readonly<{
  children: ReactNode;
  description: string;
  title: string;
}>) {
  const { t } = useLocale();

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <Link aria-label={t("auth.backHome")} className="brand" href="/" title={t("auth.backHome")}>
          <span aria-hidden="true" className="brand-mark">
            D
          </span>
          <span>DIG4EL</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="auth-main" id="main-content">
        <section aria-labelledby="auth-title" className="auth-card">
          <p className="eyebrow">DIG4EL</p>
          <h1 id="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
      </main>
    </div>
  );
}

function RecoveryHelp() {
  const { t } = useLocale();
  return (
    <div className="auth-recovery-help">
      <span aria-hidden="true" className="auth-success-icon">
        <Icon name="lock" />
      </span>
      <p>{t("auth.recover.help")}</p>
      <Link className="auth-primary" href="/reset-password">
        <Icon aria-hidden="true" name="arrow-right" />
        <span>{t("auth.recover.useToken")}</span>
      </Link>
      <Link className="auth-secondary-link" href="/login">
        {t("auth.recover.backToLogin")}
      </Link>
    </div>
  );
}

/**
 * A small, same-origin auth surface. It never reads or stores session values:
 * the server creates the HTTP-only session cookie after a successful request.
 * Account and recovery tokens remain only in the form while a person uses them.
 */
export function AuthScreen({
  initialToken = "",
  mode,
  notice,
  onNavigate,
}: Readonly<AuthScreenProps>) {
  const { t } = useLocale();
  const emailId = useId();
  const tokenId = useId();
  const passwordId = useId();
  const confirmationId = useId();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(initialToken.trim());
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenMode = mode === "register" || mode === "reset";
  const [fragmentResolved, setFragmentResolved] = useState(
    !tokenMode || Boolean(initialToken.trim()),
  );

  useEffect(() => {
    if (!tokenMode || initialToken.trim()) return;
    const timer = window.setTimeout(() => {
      const fragmentToken = tokenFromFragment();
      if (fragmentToken) {
        setToken(fragmentToken);
        // Do not leave a bearer token in browser history after it has been read.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setFragmentResolved(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialToken, tokenMode]);

  const titleKey: Record<AuthMode, MessageKey> = {
    login: "auth.login.title",
    recover: "auth.recover.title",
    register: "auth.register.title",
    reset: "auth.reset.title",
  };
  const descriptionKey: Record<AuthMode, MessageKey> = {
    login: "auth.login.description",
    recover: "auth.recover.description",
    register: "auth.register.description",
    reset: "auth.reset.description",
  };
  const submitKey: Record<Exclude<AuthMode, "recover">, MessageKey> = {
    login: "auth.login.submit",
    register: "auth.register.submit",
    reset: "auth.reset.submit",
  };
  const loadingKey: Record<Exclude<AuthMode, "recover">, MessageKey> = {
    login: "auth.login.loading",
    register: "auth.register.loading",
    reset: "auth.reset.loading",
  };

  function navigate(destination: string) {
    if (onNavigate) {
      onNavigate(destination);
      return;
    }
    window.location.assign(destination);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || mode === "recover") return;

    setError(null);

    const normalizedEmail = email.trim();
    const actionToken = token.trim();
    if (mode === "login") {
      if (!normalizedEmail) {
        setError(t("auth.error.emailRequired"));
        return;
      }
      if (!isEmailAddress(normalizedEmail)) {
        setError(t("auth.error.emailInvalid"));
        return;
      }
    }
    if (tokenMode && !actionToken) {
      setError(t("auth.error.tokenRequired"));
      return;
    }
    if (!password) {
      setError(t("auth.error.passwordRequired"));
      return;
    }
    if ((mode === "register" || mode === "reset") && password.length < minimumPasswordLength) {
      setError(t("auth.error.passwordShort"));
      return;
    }
    if ((mode === "register" || mode === "reset") && password !== passwordConfirmation) {
      setError(t("auth.error.passwordMismatch"));
      return;
    }

    const path = mode === "login"
      ? "/api/auth/login"
      : mode === "register"
        ? "/api/auth/register"
        : "/api/auth/password-reset/confirm";
    let body: Record<string, string>;
    if (mode === "login") {
      body = { email: normalizedEmail, password };
    } else {
      body = { token: actionToken, password };
    }

    setSubmitting(true);
    try {
      const payload = await postAuth(path, body);
      navigate(destinationFrom(payload, "/"));
    } catch (requestError) {
      const payload = requestError instanceof Error
        ? (requestError as Error & { payload?: AuthResponse | null }).payload ?? null
        : null;
      const friendlyError = responseErrorMessage(payload);
      setError(
        friendlyError?.kind === "translated"
          ? t(friendlyError.key)
          : payload
            ? t("auth.error.generic")
            : t("auth.error.connection"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (tokenMode && !fragmentResolved) {
    return (
      <AuthFrame description={t("auth.link.loadingDescription")} title={t("auth.link.loadingTitle")}>
        <p className="auth-notice" role="status"><span>{t("auth.link.loading")}</span></p>
      </AuthFrame>
    );
  }

  if (mode === "recover") {
    return (
      <AuthFrame description={t(descriptionKey.recover)} title={t(titleKey.recover)}>
        <RecoveryHelp />
      </AuthFrame>
    );
  }

  const requiresPasswordConfirmation = mode === "register" || mode === "reset";
  const submitLabel = isSubmitting ? loadingKey[mode] : submitKey[mode];

  return (
    <AuthFrame description={t(descriptionKey[mode])} title={t(titleKey[mode])}>
      {notice === "session-expired" && mode === "login" && (
        <p className="auth-notice" role="status">
          <Icon aria-hidden="true" name="alert" />
          <span>{t("auth.login.sessionExpiredNotice")}</span>
        </p>
      )}

      <form aria-busy={isSubmitting} className="auth-form" noValidate onSubmit={handleSubmit}>
        {mode === "login" && (
          <div className="auth-field">
            <label className="auth-label" htmlFor={emailId}>
              {t("auth.field.email")}
              <span aria-hidden="true"> · {t("auth.form.required")}</span>
            </label>
            <div className="auth-input-wrap">
              <Icon aria-hidden="true" className="auth-input-icon" name="mail" />
              <input
                autoComplete="email"
                id={emailId}
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
          </div>
        )}

        {tokenMode && (
          <div className="auth-field">
            <label className="auth-label" htmlFor={tokenId}>
              {t(mode === "register" ? "auth.field.setupToken" : "auth.field.recoveryToken")}
              <span aria-hidden="true"> · {t("auth.form.required")}</span>
            </label>
            <div className="auth-input-wrap">
              <Icon aria-hidden="true" className="auth-input-icon" name="lock" />
              <input
                autoCapitalize="none"
                autoComplete="one-time-code"
                autoCorrect="off"
                id={tokenId}
                name="token"
                onChange={(event) => setToken(event.target.value)}
                required
                spellCheck={false}
                type="text"
                value={token}
              />
            </div>
            <p className="auth-hint">{t("auth.tokenHint")}</p>
          </div>
        )}

        <div className="auth-field">
          <label className="auth-label" htmlFor={passwordId}>
            {t(mode === "reset" ? "auth.field.newPassword" : "auth.field.password")}
            <span aria-hidden="true"> · {t("auth.form.required")}</span>
          </label>
          <div className="auth-input-wrap">
            <Icon aria-hidden="true" className="auth-input-icon" name="lock" />
            <input
              aria-describedby={requiresPasswordConfirmation ? `${passwordId}-hint` : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              id={passwordId}
              minLength={requiresPasswordConfirmation ? minimumPasswordLength : undefined}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {requiresPasswordConfirmation && (
            <p className="auth-hint" id={`${passwordId}-hint`}>
              {t("auth.passwordHint")}
            </p>
          )}
        </div>

        {requiresPasswordConfirmation && (
          <div className="auth-field">
            <label className="auth-label" htmlFor={confirmationId}>
              {t("auth.field.confirmPassword")}
              <span aria-hidden="true"> · {t("auth.form.required")}</span>
            </label>
            <div className="auth-input-wrap">
              <Icon aria-hidden="true" className="auth-input-icon" name="lock" />
              <input
                autoComplete="new-password"
                id={confirmationId}
                name="password-confirmation"
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                type="password"
                value={passwordConfirmation}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="auth-error" role="alert">
            <Icon aria-hidden="true" name="alert" />
            <span>{error}</span>
          </p>
        )}

        <button className="auth-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? <span aria-hidden="true" className="auth-spinner" /> : <Icon name="arrow-right" />}
          <span>{t(submitLabel)}</span>
        </button>
      </form>

      {mode === "login" && (
        <div className="auth-links">
          <Link href="/recover">{t("auth.login.forgotPassword")}</Link>
          <p>
            {t("auth.login.newHere")} <Link href="/register">{t("auth.login.createAccount")}</Link>
          </p>
        </div>
      )}
      {mode === "register" && (
        <p className="auth-links auth-links-single">
          {t("auth.register.hasAccount")} <Link href="/login">{t("auth.register.signIn")}</Link>
        </p>
      )}
      {mode === "reset" && (
        <p className="auth-links auth-links-single">
          <Link href="/recover">{t("auth.reset.needToken")}</Link>
        </p>
      )}
    </AuthFrame>
  );
}
