"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { MessageKey } from "../i18n/messages";
import type { LanguageOption } from "../lib/languages";
import { Icon } from "./icon";
import { AuthStatusControl } from "./auth-status-control";
import { LanguageSelector } from "./language-selector";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-provider";

type ProjectRole = "reader" | "writer" | "maintainer";

type ProjectSummary = {
  caretaker: boolean;
  canManageAccess: boolean;
  id: string;
  name: string;
  role: ProjectRole | null;
};

type AccessProject = Pick<ProjectSummary, "id" | "name">;

type AccessMember = {
  caretaker: boolean;
  email: string;
  role: ProjectRole;
  systemAdministrator?: boolean;
  userId: string;
};

type AccessAudit = {
  action: string;
  actorEmail: string | null;
  createdAt: string;
  id: string;
  targetEmail: string | null;
};

type AccessDetails = {
  audit: AccessAudit[];
  canManageAccess: boolean;
  members: AccessMember[];
  project: AccessProject;
  systemAdministrator: boolean;
};

type SessionPayload = {
  session?: { csrfToken?: unknown };
};

type OverviewPayload = {
  projects?: unknown;
  systemAdministrator?: unknown;
};

type LanguageSearchPayload = {
  language?: unknown;
  languages?: unknown;
};

type AccessPayload = {
  audit?: unknown;
  canManageAccess?: unknown;
  members?: unknown;
  project?: unknown;
  systemAdministrator?: unknown;
};

type UserStatus = "active" | "disabled" | "pending_activation";

type UserSummary = {
  caretakerProjectIds: string[];
  email: string;
  id: string;
  status: UserStatus;
  systemAdministrator: boolean;
};

type UserListPayload = {
  projects?: unknown;
  users?: unknown;
};

type OneTimeToken = {
  expiresAt: string;
  token: string;
};

type IssuedAdminToken = OneTimeToken & {
  email: string;
  kind: "recovery" | "setup";
};

class AdministrationRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "AdministrationRequestError";
  }
}

function isRole(value: unknown): value is ProjectRole {
  return value === "reader" || value === "writer" || value === "maintainer";
}

function asProject(value: unknown): ProjectSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role: ProjectRole | null | undefined = record.role === null
    ? null
    : isRole(record.role)
      ? record.role
      : undefined;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    role === undefined ||
    typeof record.caretaker !== "boolean" ||
    typeof record.canManageAccess !== "boolean"
  ) {
    return null;
  }
  return {
    caretaker: record.caretaker,
    canManageAccess: record.canManageAccess,
    id: record.id,
    name: record.name,
    role,
  };
}

function asAccessProject(value: unknown): AccessProject | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string"
    ? { id: record.id, name: record.name }
    : null;
}

function asMember(value: unknown): AccessMember | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === "string" &&
    typeof record.email === "string" &&
    isRole(record.role) &&
    typeof record.caretaker === "boolean"
  )
    ? {
        caretaker: record.caretaker,
        email: record.email,
        role: record.role,
        systemAdministrator:
          typeof record.systemAdministrator === "boolean" ? record.systemAdministrator : undefined,
        userId: record.userId,
      }
    : null;
}

function asAudit(value: unknown): AccessAudit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const actor = record.actor;
  const target = record.target;
  const actorEmail =
    actor && typeof actor === "object" && typeof (actor as Record<string, unknown>).email === "string"
      ? (actor as Record<string, unknown>).email as string
      : typeof record.actorEmail === "string"
        ? record.actorEmail
        : null;
  const targetEmail =
    target && typeof target === "object" && typeof (target as Record<string, unknown>).email === "string"
      ? (target as Record<string, unknown>).email as string
      : typeof record.targetEmail === "string"
        ? record.targetEmail
        : null;
  const createdAt = typeof record.occurredAt === "string"
    ? record.occurredAt
    : typeof record.createdAt === "string"
      ? record.createdAt
      : null;
  return (
    typeof record.id === "string" &&
    typeof record.action === "string" &&
    createdAt !== null
  )
    ? {
        action: record.action,
        actorEmail,
        createdAt,
        id: record.id,
        targetEmail,
      }
    : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

function asLanguage(value: unknown): LanguageOption | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const source = record.source;
  const regionOrCountry = record.regionOrCountry;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    (source === "catalog" || source === "custom") &&
    (regionOrCountry === null || typeof regionOrCountry === "string")
  )
    ? {
        id: record.id,
        name: record.name,
        regionOrCountry,
        source,
      }
    : null;
}

function asUser(value: unknown): UserSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const status = record.status;
  return (
    typeof record.id === "string" &&
    typeof record.email === "string" &&
    (status === "active" || status === "disabled" || status === "pending_activation")
  )
    ? {
        caretakerProjectIds: asStringList(record.caretakerProjectIds),
        email: record.email,
        id: record.id,
        status,
        systemAdministrator: record.systemAdministrator === true,
      }
    : null;
}

function asOneTimeToken(value: unknown): OneTimeToken | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.token === "string" && record.token.length > 0 && typeof record.expiresAt === "string"
    ? { expiresAt: record.expiresAt, token: record.token }
    : null;
}

function csrfFrom(payload: SessionPayload | null): string | null {
  const candidate = payload?.session?.csrfToken;
  return typeof candidate === "string" && /^[A-Za-z0-9_-]{43}$/u.test(candidate)
    ? candidate
    : null;
}

async function requestData<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      accept: "application/json",
      ...options.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: unknown };
  } | null;
  if (!response.ok) {
    throw new AdministrationRequestError(
      typeof payload?.error?.code === "string" ? payload.error.code : "INTERNAL",
      response.status,
    );
  }
  if (!payload?.data) throw new AdministrationRequestError("INTERNAL", response.status);
  return payload.data;
}

function errorMessageKey(error: unknown): MessageKey {
  if (!(error instanceof AdministrationRequestError)) return "admin.error.unavailable";
  if (error.status === 401 || error.code === "SESSION_EXPIRED") return "admin.error.session";
  if (error.status === 403 || error.code === "FORBIDDEN") return "admin.error.forbidden";
  if (error.code === "LAST_SYSTEM_ADMINISTRATOR") {
    return "admin.error.lastSystemAdministrator";
  }
  if (error.code === "LAST_MAINTAINER" || error.code === "LAST_PROJECT_MAINTAINER") {
    return "admin.error.lastMaintainer";
  }
  if (
    error.code === "USER_NOT_FOUND" ||
    error.code === "MEMBER_NOT_FOUND" ||
    error.code === "INVITEE_NOT_FOUND"
  ) {
    return "admin.error.memberNotFound";
  }
  if (error.code === "EMAIL_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS") {
    return "admin.error.userExists";
  }
  if (error.status === 400 || error.code === "INVALID_REQUEST") return "admin.error.validation";
  return "admin.error.generic";
}

function roleLabel(role: ProjectRole | null, t: (key: MessageKey) => string): string {
  if (!role) return t("admin.access");
  if (role === "reader") return t("admin.role.viewer");
  if (role === "writer") return t("admin.role.contributor");
  return t("admin.projectManager");
}

function auditLabel(action: string, t: (key: MessageKey) => string): string {
  if (action.includes("created")) return t("admin.audit.created");
  if (action.includes("revoked") || action.includes("removed")) return t("admin.audit.revoked");
  if (action.includes("changed") || action.includes("updated")) return t("admin.audit.changed");
  return t("admin.audit.granted");
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CreateProjectForm({
  csrfToken,
  onCreated,
}: Readonly<{
  csrfToken: string;
  onCreated: () => Promise<void>;
}>) {
  const { t } = useLocale();
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setError(null);
    setSuccess(false);
    if (!selectedLanguage) {
      setError("admin.error.validation");
      return;
    }
    setSaving(true);
    try {
      await requestData("/api/admin/projects", {
        body: JSON.stringify({ languageKey: selectedLanguage.id }),
        headers: {
          "content-type": "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "POST",
      });
      setSelectedLanguage(null);
      setSuccess(true);
      await onCreated();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="create-project-title" className="admin-card admin-create-card">
      <div className="admin-card-heading">
        <span aria-hidden="true" className="admin-card-icon"><Icon name="book" /></span>
        <div>
          <h2 id="create-project-title">{t("admin.create")}</h2>
          <p>{t("admin.createDescription")}</p>
        </div>
      </div>
      <form aria-busy={isSaving} className="admin-form admin-create-form" noValidate onSubmit={submit}>
        <LanguageSelector
          allowCreate
          disabled={isSaving}
          hint={t("admin.createNameHint")}
          label={t("admin.createName")}
          loadLanguages={async (query) => {
            const data = await requestData<LanguageSearchPayload>(
              `/api/admin/languages?query=${encodeURIComponent(query)}`,
            );
            return Array.isArray(data.languages)
              ? data.languages
                  .map(asLanguage)
                  .filter((language): language is LanguageOption => language !== null)
              : [];
          }}
          onChange={setSelectedLanguage}
          onCreateLanguage={async ({ name, regionOrCountry }) => {
            const data = await requestData<LanguageSearchPayload>("/api/admin/languages", {
              body: JSON.stringify({ name, regionOrCountry }),
              headers: {
                "content-type": "application/json",
                "x-dig4el-csrf": csrfToken,
              },
              method: "POST",
            });
            const language = asLanguage(data.language);
            if (!language) {
              throw new AdministrationRequestError("INVALID_RESPONSE", 500);
            }
            return language;
          }}
          placeholder={t("admin.createNameHint")}
          value={selectedLanguage}
        />
        {error && <p className="admin-error" role="alert"><Icon name="alert" />{t(error)}</p>}
        {success && <p className="admin-success" role="status"><Icon name="check" />{t("admin.createSuccess")}</p>}
        <button className="auth-primary" disabled={isSaving} type="submit">
          {isSaving ? <span aria-hidden="true" className="auth-spinner" /> : <Icon name="arrow-right" />}
          <span>{t(isSaving ? "admin.createLoading" : "admin.createSubmit")}</span>
        </button>
      </form>
    </section>
  );
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function TokenPanel({
  onDismiss,
  token,
}: Readonly<{
  onDismiss: () => void;
  token: IssuedAdminToken;
}>) {
  const { locale, t } = useLocale();
  const [copyState, setCopyState] = useState<"copied" | "manual" | "ready">("ready");
  const fieldId = useId();

  async function copyToken() {
    if (!navigator.clipboard?.writeText) {
      setCopyState("manual");
      return;
    }
    try {
      await navigator.clipboard.writeText(token.token);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  const title = token.kind === "setup" ? "admin.token.setupTitle" : "admin.token.recoveryTitle";
  const expiry = formatTime(token.expiresAt, locale);

  return (
    <section aria-labelledby="issued-token-title" className="admin-token-card" role="status">
      <div className="admin-card-heading">
        <span aria-hidden="true" className="admin-card-icon"><Icon name="lock" /></span>
        <div>
          <h2 id="issued-token-title">{t(title)}</h2>
          <p>{token.email}</p>
        </div>
      </div>
      <p className="admin-token-description">{t("admin.token.description")}</p>
      <label className="admin-token-field" htmlFor={fieldId}>
        <span>{t("admin.token.label")}</span>
        <input
          autoCapitalize="none"
          autoCorrect="off"
          id={fieldId}
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          spellCheck={false}
          type="text"
          value={token.token}
        />
      </label>
      <div className="admin-token-actions">
        <button className="admin-secondary-button" onClick={() => void copyToken()} type="button">
          {copyState === "copied" ? t("admin.token.copied") : t("admin.token.copy")}
        </button>
        <button className="admin-quiet-button" onClick={onDismiss} type="button">
          {t("admin.token.dismiss")}
        </button>
      </div>
      {copyState === "manual" && <p className="admin-token-feedback" role="alert">{t("admin.token.copyUnavailable")}</p>}
      {copyState === "copied" && <p className="sr-only" role="status">{t("admin.token.copied")}</p>}
      {expiry && <p className="admin-token-expiry">{t("admin.token.expiresAt")} <time dateTime={token.expiresAt}>{expiry}</time></p>}
    </section>
  );
}

function CreateAccountForm({
  csrfToken,
  onChanged,
  onTokenIssued,
}: Readonly<{
  csrfToken: string;
  onChanged: () => Promise<void>;
  onTokenIssued: (token: IssuedAdminToken) => void;
}>) {
  const { t } = useLocale();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const normalizedEmail = email.trim();
    setError(null);
    setSuccess(false);
    if (!isEmailAddress(normalizedEmail)) {
      setError("admin.error.validation");
      return;
    }
    setSaving(true);
    try {
      const data = await requestData<{ setupToken?: unknown; user?: unknown }>("/api/admin/users", {
        body: JSON.stringify({ email: normalizedEmail }),
        headers: {
          "content-type": "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "POST",
      });
      const setupToken = asOneTimeToken(data.setupToken);
      const user = asUser(data.user);
      if (!setupToken) throw new AdministrationRequestError("INTERNAL", 500);
      onTokenIssued({
        ...setupToken,
        email: user?.email ?? normalizedEmail,
        kind: "setup",
      });
      setEmail("");
      setSuccess(true);
      await onChanged();
    } catch (requestError) {
      setError(
        requestError instanceof AdministrationRequestError && requestError.code === "CONFLICT"
          ? "admin.error.userExists"
          : errorMessageKey(requestError),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="create-account-title" className="admin-account-create">
      <div className="admin-card-heading">
        <span aria-hidden="true" className="admin-card-icon"><Icon name="people" /></span>
        <div>
          <h3 id="create-account-title">{t("admin.account.title")}</h3>
          <p>{t("admin.account.createDescription")}</p>
        </div>
      </div>
      <form aria-busy={isSaving} className="admin-form admin-account-form" noValidate onSubmit={submit}>
        <label htmlFor={emailId}>
          <span>{t("admin.account.email")}</span>
          <input
            autoComplete="email"
            id={emailId}
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <button className="auth-primary" disabled={isSaving} type="submit">
          {isSaving ? <span aria-hidden="true" className="auth-spinner" /> : <Icon name="arrow-right" />}
          <span>{t(isSaving ? "admin.account.createLoading" : "admin.account.create")}</span>
        </button>
        {error && <p className="admin-error" role="alert"><Icon name="alert" />{t(error)}</p>}
        {success && <p className="admin-success" role="status"><Icon name="check" />{t("admin.account.success")}</p>}
      </form>
    </section>
  );
}

function AddMemberForm({
  csrfToken,
  projectId,
  onChanged,
}: Readonly<{
  csrfToken: string;
  projectId: string;
  onChanged: () => Promise<void>;
}>) {
  const { t } = useLocale();
  const emailId = useId();
  const roleId = useId();
  const caretakerId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("reader");
  const [caretaker, setCaretaker] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isSaving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setError(null);
    if (!email.trim() || (caretaker && role === "reader")) {
      setError(caretaker && role === "reader" ? "admin.caretakerRequiresContributor" : "admin.error.validation");
      return;
    }
    setSaving(true);
    try {
      await requestData(`/api/admin/projects/${encodeURIComponent(projectId)}/access`, {
        body: JSON.stringify({ caretaker, email: email.trim(), role }),
        headers: {
          "content-type": "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "POST",
      });
      setEmail("");
      setRole("reader");
      setCaretaker(false);
      await onChanged();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="add-person-title" className="admin-card admin-add-card">
      <div className="admin-card-heading">
        <span aria-hidden="true" className="admin-card-icon"><Icon name="people" /></span>
        <div>
          <h2 id="add-person-title">{t("admin.addPerson")}</h2>
          <p>{t("admin.addPersonDescription")}</p>
        </div>
      </div>
      <form aria-busy={isSaving} className="admin-form" noValidate onSubmit={submit}>
        <label htmlFor={emailId}>
          <span>{t("admin.form.email")}</span>
          <input autoComplete="email" id={emailId} inputMode="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label htmlFor={roleId}>
          <span>{t("admin.form.role")}</span>
          <select
            id={roleId}
            onChange={(event) => {
              const nextRole = event.target.value as ProjectRole;
              setRole(nextRole);
              if (nextRole === "reader") setCaretaker(false);
            }}
            value={role}
          >
            <option value="reader">{t("admin.role.viewer")}</option>
            <option value="writer">{t("admin.role.contributor")}</option>
            <option value="maintainer">{t("admin.projectManager")}</option>
          </select>
        </label>
        <label className="admin-check" htmlFor={caretakerId}>
          <input
            checked={caretaker}
            disabled={role === "reader"}
            id={caretakerId}
            onChange={(event) => setCaretaker(event.target.checked)}
            type="checkbox"
          />
          <span>{t("admin.form.caretaker")}</span>
        </label>
        {error && <p className="admin-error" role="alert"><Icon name="alert" />{t(error)}</p>}
        <button className="auth-primary" disabled={isSaving} type="submit">
          {isSaving ? <span aria-hidden="true" className="auth-spinner" /> : <Icon name="arrow-right" />}
          <span>{t(isSaving ? "admin.form.submitting" : "admin.form.submit")}</span>
        </button>
      </form>
    </section>
  );
}

function MemberRow({
  csrfToken,
  member,
  onChanged,
  projectId,
}: Readonly<{
  csrfToken: string;
  member: AccessMember;
  onChanged: () => Promise<void>;
  projectId: string;
}>) {
  const { t } = useLocale();
  const [role, setRole] = useState<ProjectRole>(member.role);
  const [caretaker, setCaretaker] = useState(member.caretaker);
  const [error, setError] = useState<MessageKey | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isRemoving, setRemoving] = useState(false);

  async function save() {
    if (isSaving || isRemoving) return;
    if (caretaker && role === "reader") {
      setError("admin.caretakerRequiresContributor");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await requestData(`/api/admin/projects/${encodeURIComponent(projectId)}/access/${encodeURIComponent(member.userId)}`, {
        body: JSON.stringify({ caretaker, role }),
        headers: {
          "content-type": "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "PATCH",
      });
      await onChanged();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isSaving || isRemoving || !window.confirm(t("admin.removeConfirm"))) return;
    setError(null);
    setRemoving(true);
    try {
      await requestData(`/api/admin/projects/${encodeURIComponent(projectId)}/access/${encodeURIComponent(member.userId)}`, {
        headers: { "x-dig4el-csrf": csrfToken },
        method: "DELETE",
      });
      await onChanged();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li className="admin-member">
      <div className="admin-member-identity">
        <span aria-hidden="true" className="admin-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{member.email}</strong>
          <span className="admin-member-tags">
            <span>{roleLabel(member.role, t)}</span>
            {member.caretaker && <span>{t("admin.caretakerShort")}</span>}
            {member.systemAdministrator && <span>{t("admin.system")}</span>}
          </span>
        </div>
      </div>
      <div className="admin-member-actions">
        <label className="sr-only" htmlFor={`role-${member.userId}`}>{t("admin.form.role")}</label>
        <select
          id={`role-${member.userId}`}
          onChange={(event) => {
            const nextRole = event.target.value as ProjectRole;
            setRole(nextRole);
            if (nextRole === "reader") setCaretaker(false);
          }}
          value={role}
        >
          <option value="reader">{t("admin.role.viewer")}</option>
          <option value="writer">{t("admin.role.contributor")}</option>
          <option value="maintainer">{t("admin.projectManager")}</option>
        </select>
        <label className="admin-check admin-check-compact" htmlFor={`caretaker-${member.userId}`}>
          <input
            checked={caretaker}
            disabled={role === "reader"}
            id={`caretaker-${member.userId}`}
            onChange={(event) => setCaretaker(event.target.checked)}
            type="checkbox"
          />
          <span>{t("admin.caretakerShort")}</span>
        </label>
        <button className="admin-secondary-button" disabled={isSaving || isRemoving} onClick={() => void save()} type="button">
          {isSaving ? t("admin.saving") : t("admin.save")}
        </button>
        <button className="admin-danger-button" disabled={isSaving || isRemoving} onClick={() => void remove()} type="button">
          {isRemoving ? t("admin.removing") : t("admin.remove")}
        </button>
      </div>
      {error && <p className="admin-error admin-member-error" role="alert"><Icon name="alert" />{t(error)}</p>}
    </li>
  );
}

function userStatusLabel(status: UserStatus, t: (key: MessageKey) => string): string {
  if (status === "active") return t("admin.user.status.active");
  if (status === "pending_activation") return t("admin.user.status.pendingActivation");
  return t("admin.user.status.disabled");
}

function UserRow({
  caretakerProjects,
  csrfToken,
  onChanged,
  onTokenIssued,
  user,
}: Readonly<{
  caretakerProjects: AccessProject[];
  csrfToken: string;
  onChanged: () => Promise<void>;
  onTokenIssued: (token: IssuedAdminToken) => void;
  user: UserSummary;
}>) {
  const { t } = useLocale();
  const userTypeId = useId();
  const caretakerHintId = useId();
  const userTitleId = useId();
  const [error, setError] = useState<MessageKey | null>(null);
  const [isGenerating, setGenerating] = useState(false);
  const [isSavingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [systemAdministrator, setSystemAdministrator] = useState(user.systemAdministrator);
  const [caretakerProjectIds, setCaretakerProjectIds] = useState(user.caretakerProjectIds);
  const tokenKind = user.status === "pending_activation" ? "setup" : "recovery";
  const canIssueToken = user.status === "pending_activation" || user.status === "active";
  const canChangeSettings = user.status !== "disabled";
  const settingsChanged =
    systemAdministrator !== user.systemAdministrator ||
    caretakerProjectIds.length !== user.caretakerProjectIds.length ||
    caretakerProjectIds.some((projectId) => !user.caretakerProjectIds.includes(projectId));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCaretakerProjectIds(user.caretakerProjectIds);
      setSystemAdministrator(user.systemAdministrator);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user.caretakerProjectIds, user.systemAdministrator]);

  function changeCaretakerProject(projectId: string, checked: boolean) {
    setSettingsSaved(false);
    setCaretakerProjectIds((current) => {
      if (checked) return current.includes(projectId) ? current : [...current, projectId];
      return current.filter((currentProjectId) => currentProjectId !== projectId);
    });
  }

  async function saveUserSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChangeSettings || isSavingSettings || !settingsChanged) return;
    setError(null);
    setSettingsSaved(false);
    setSavingSettings(true);
    try {
      await requestData<{ user?: unknown }>(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        body: JSON.stringify({ caretakerProjectIds, systemAdministrator }),
        headers: {
          "content-type": "application/json",
          "x-dig4el-csrf": csrfToken,
        },
        method: "PATCH",
      });
      setSettingsSaved(true);
      await onChanged();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setSavingSettings(false);
    }
  }

  async function deleteUser() {
    if (isGenerating || isSavingSettings) return;
    if (!window.confirm(`${t("admin.user.deleteConfirm")}\n${user.email}`)) return;
    setError(null);
    setSavingSettings(true);
    try {
      await requestData(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { "x-dig4el-csrf": csrfToken },
      });
      await onChanged();
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setSavingSettings(false);
    }
  }

  async function issueToken() {
    if (isGenerating || isSavingSettings || !canIssueToken) return;
    setError(null);
    setGenerating(true);
    const isSetup = tokenKind === "setup";
    try {
      const data = await requestData<{ recoveryToken?: unknown; setupToken?: unknown }>(
        `/api/admin/users/${encodeURIComponent(user.id)}/${isSetup ? "registration-token" : "recovery-token"}`,
        {
          headers: {
            "x-dig4el-csrf": csrfToken,
          },
          method: "POST",
        },
      );
      const rawToken = asOneTimeToken(isSetup ? data.setupToken : data.recoveryToken);
      if (!rawToken) throw new AdministrationRequestError("INTERNAL", 500);
      onTokenIssued({ ...rawToken, email: user.email, kind: tokenKind });
    } catch (requestError) {
      setError(errorMessageKey(requestError));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <li className="admin-user">
      <div className="admin-user-identity">
        <span aria-hidden="true" className="admin-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong id={userTitleId}>{user.email}</strong>
          <span className="admin-member-tags">
            <span>{userStatusLabel(user.status, t)}</span>
            {user.systemAdministrator && <span>{t("admin.system")}</span>}
          </span>
        </div>
      </div>
      <button className="admin-quiet-button" disabled={isGenerating || isSavingSettings} onClick={() => void deleteUser()} type="button">
        {t("admin.user.delete")}
      </button>
      {canIssueToken && (
        <button className="admin-secondary-button" disabled={isGenerating || isSavingSettings} onClick={() => void issueToken()} type="button">
          {isGenerating
            ? t(tokenKind === "setup" ? "admin.user.setupLoading" : "admin.user.recoveryLoading")
            : t(tokenKind === "setup" ? "admin.user.setup" : "admin.user.recovery")}
        </button>
      )}
      <form
        aria-busy={isSavingSettings}
        aria-labelledby={userTitleId}
        className="admin-user-settings"
        noValidate
        onSubmit={(event) => void saveUserSettings(event)}
      >
        <label className="admin-user-settings-field" htmlFor={userTypeId}>
          <span>{t("admin.user.type")}</span>
          <select
            disabled={isSavingSettings || !canChangeSettings}
            id={userTypeId}
            onChange={(event) => {
              setSettingsSaved(false);
              setSystemAdministrator(event.target.value === "system-administrator");
            }}
            value={systemAdministrator ? "system-administrator" : "standard-user"}
          >
            <option value="system-administrator">{t("admin.user.type.systemAdministrator")}</option>
            <option value="standard-user">{t("admin.user.type.standardUser")}</option>
          </select>
        </label>
        <fieldset
          aria-describedby={caretakerHintId}
          className="admin-caretaker-languages"
          disabled={isSavingSettings || !canChangeSettings}
        >
          <legend>{t("admin.user.caretakerLanguages")}</legend>
          <p id={caretakerHintId}>{t("admin.user.caretakerLanguagesDescription")}</p>
          {caretakerProjects.length === 0 ? (
            <p className="admin-muted">{t("admin.user.caretakerLanguagesEmpty")}</p>
          ) : (
            <div className="admin-caretaker-language-options">
              {caretakerProjects.map((project) => {
                const checkboxId = `caretaker-language-${user.id}-${project.id}`;
                return (
                  <label className="admin-caretaker-language-option" htmlFor={checkboxId} key={project.id}>
                    <input
                      checked={caretakerProjectIds.includes(project.id)}
                      id={checkboxId}
                      onChange={(event) => changeCaretakerProject(project.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{project.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="admin-user-settings-actions">
          <button className="admin-secondary-button" disabled={!canChangeSettings || isSavingSettings || !settingsChanged} type="submit">
            {isSavingSettings ? t("admin.user.permissionsSaving") : t("admin.user.permissions")}
          </button>
          {settingsSaved && <p className="admin-success" role="status"><Icon name="check" />{t("admin.user.permissionsSaved")}</p>}
        </div>
        {!canChangeSettings && <p className="admin-read-only-note admin-user-settings-disabled">{t("admin.user.permissionsDisabled")}</p>}
      </form>
      {error && <p className="admin-error admin-user-error" role="alert"><Icon name="alert" />{t(error)}</p>}
    </li>
  );
}

function RoleGuide() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="role-guide-title" className="admin-card admin-guide">
      <div className="admin-card-heading">
        <span aria-hidden="true" className="admin-card-icon"><Icon name="help" /></span>
        <div>
          <h2 id="role-guide-title">{t("admin.guide")}</h2>
          <p>{t("admin.guide.caretaker")}</p>
        </div>
      </div>
      <dl>
        <div><dt>{t("admin.role.viewer")}</dt><dd>{t("admin.guide.viewer")}</dd></div>
        <div><dt>{t("admin.role.contributor")}</dt><dd>{t("admin.guide.contributor")}</dd></div>
        <div><dt>{t("admin.projectManager")}</dt><dd>{t("admin.guide.manager")}</dd></div>
        <div><dt>{t("admin.caretaker")}</dt><dd>{t("admin.caretakerDescription")}</dd></div>
      </dl>
    </section>
  );
}

/**
 * The browser renders plain-language choices only. Every list and mutation is
 * still authorized by the server against the current session and project scope.
 */
export function AdminAccessScreen() {
  const { locale, t } = useLocale();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isSystemAdministrator, setSystemAdministrator] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [details, setDetails] = useState<AccessDetails | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userManagementProjects, setUserManagementProjects] = useState<AccessProject[] | null>(null);
  const [issuedToken, setIssuedToken] = useState<IssuedAdminToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [refresh, setRefresh] = useState(0);

  const activeProjectId = useMemo(() => {
    if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
      return selectedProjectId;
    }
    return projects[0]?.id ?? null;
  }, [projects, selectedProjectId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await requestData<SessionPayload>("/api/auth/session");
      const csrf = csrfFrom(session);
      if (!csrf) throw new AdministrationRequestError("AUTHENTICATION_REQUIRED", 401);
      const overview = await requestData<OverviewPayload>("/api/admin/projects");
      const nextProjects = Array.isArray(overview.projects)
        ? overview.projects.map(asProject).filter((project): project is ProjectSummary => Boolean(project))
        : [];
      setCsrfToken(csrf);
      setProjects(nextProjects);
      setSystemAdministrator(overview.systemAdministrator === true);
    } catch (requestError) {
      setError(errorMessageKey(requestError));
      setCsrfToken(null);
      setProjects([]);
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, reload]);

  useEffect(() => {
    const projectCanManage = activeProjectId
      ? projects.find((project) => project.id === activeProjectId)?.canManageAccess === true
      : false;
    if (!activeProjectId || !csrfToken || (!projectCanManage && !isSystemAdministrator)) {
      const clearTimer = window.setTimeout(() => {
        setDetails(null);
        setLoadingDetails(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingDetails(true);
      void requestData<AccessPayload>(`/api/admin/projects/${encodeURIComponent(activeProjectId)}/access`)
        .then((payload) => {
          if (cancelled) return;
          const project = asAccessProject(payload.project);
          if (!project) throw new AdministrationRequestError("INTERNAL", 500);
          setDetails({
            audit: Array.isArray(payload.audit)
              ? payload.audit.map(asAudit).filter((entry): entry is AccessAudit => Boolean(entry))
              : [],
            canManageAccess: payload.canManageAccess === true,
            members: Array.isArray(payload.members)
              ? payload.members.map(asMember).filter((member): member is AccessMember => Boolean(member))
              : [],
            project,
            systemAdministrator: payload.systemAdministrator === true,
          });
        })
        .catch((requestError: unknown) => {
          if (!cancelled) setError(errorMessageKey(requestError));
        })
        .finally(() => {
          if (!cancelled) setLoadingDetails(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProjectId, csrfToken, isSystemAdministrator, projects, refresh]);

  useEffect(() => {
    if (!isSystemAdministrator || !csrfToken) {
      const clearTimer = window.setTimeout(() => {
        setUserManagementProjects(null);
        setUsers([]);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void requestData<UserListPayload>("/api/admin/users")
        .then((payload) => {
          if (cancelled) return;
          if (!Array.isArray(payload.users)) {
            setUsers([]);
            setUserManagementProjects(null);
            return;
          }
          setUsers(payload.users.map(asUser).filter((user): user is UserSummary => Boolean(user)));
          setUserManagementProjects(
            Array.isArray(payload.projects)
              ? payload.projects.map(asAccessProject).filter((project): project is AccessProject => Boolean(project))
              : null,
          );
        })
        .catch((requestError: unknown) => {
          if (!cancelled) {
            setUserManagementProjects(null);
            setUsers([]);
            setError(errorMessageKey(requestError));
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [csrfToken, isSystemAdministrator, refresh]);

  async function reloadEverything() {
    setRefresh((value) => value + 1);
  }

  if (loading) {
    return (
      <main className="admin-main" id="main-content">
        <p className="admin-loading" role="status"><span aria-hidden="true" className="auth-spinner" />{t("admin.loading")}</p>
      </main>
    );
  }

  if (error && !csrfToken) {
    const sessionEnded = error === "admin.error.session";
    return (
      <main className="admin-main" id="main-content">
        <section className="admin-empty-state" role="alert">
          <span aria-hidden="true" className="admin-card-icon"><Icon name="alert" /></span>
          <h1>{t("admin.unavailable")}</h1>
          <p>{t(error)}</p>
          {sessionEnded ? <Link className="auth-secondary-link" href="/login">{t("auth.status.signIn")}</Link> : <button className="auth-primary" onClick={() => void reload()} type="button">{t("admin.refresh")}</button>}
        </section>
      </main>
    );
  }

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeDetails = details?.project.id === activeProjectId ? details : null;
  const canManage = activeDetails?.canManageAccess ?? activeProject?.canManageAccess ?? false;
  const caretakerProjects = userManagementProjects ?? projects.map(({ id, name }) => ({ id, name }));

  return (
    <main className="admin-main" id="main-content">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">DIG4EL</p>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.accessDescription")}</p>
        </div>
        <button aria-label={t("admin.refresh")} className="icon-button" data-tooltip={t("admin.refresh")} onClick={() => void reloadEverything()} type="button">
          <Icon className="interface-icon" name="spark" />
        </button>
      </header>

      {error && <p className="admin-error admin-page-error" role="alert"><Icon name="alert" />{t(error)}</p>}

      {isSystemAdministrator && csrfToken && (
        <section className="admin-system-note" aria-labelledby="system-administration-title">
          <Icon aria-hidden="true" name="lock" />
          <div>
            <h2 id="system-administration-title">{t("admin.system")}</h2>
            <p>{t("admin.systemDescription")}</p>
          </div>
        </section>
      )}

      {issuedToken && <TokenPanel key={issuedToken.token} onDismiss={() => setIssuedToken(null)} token={issuedToken} />}

      <div className="admin-layout">
        <div className="admin-primary-column">
          {isSystemAdministrator && csrfToken && <CreateProjectForm csrfToken={csrfToken} onCreated={reloadEverything} />}

          {!activeProject && !isSystemAdministrator && (
            <section className="admin-empty-state">
              <span aria-hidden="true" className="admin-card-icon"><Icon name="people" /></span>
              <h2>{t("admin.empty")}</h2>
              <p>{t("admin.emptyDescription")}</p>
            </section>
          )}

          {activeProject && (
            <section aria-labelledby="access-title" className="admin-card admin-access-card">
              <div className="admin-card-heading admin-access-heading">
                <span aria-hidden="true" className="admin-card-icon"><Icon name="people" /></span>
                <div>
                  <h2 id="access-title">{t("admin.projectLabel")}</h2>
                </div>
              </div>
              <div className="admin-form admin-project-picker">
                <label htmlFor="admin-language-space">
                  <span className="sr-only">{t("admin.projectLabel")}</span>
                  <select
                    id="admin-language-space"
                    value={activeProject.id}
                    onChange={(event) => {
                      setDetails(null);
                      setError(null);
                      setLoadingDetails(true);
                      setSelectedProjectId(event.target.value);
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {loadingDetails && <p className="admin-loading" role="status"><span aria-hidden="true" className="auth-spinner" />{t("admin.loading")}</p>}
              {!loadingDetails && canManage && csrfToken && <AddMemberForm csrfToken={csrfToken} key={activeProject.id} onChanged={reloadEverything} projectId={activeProject.id} />}
              {!loadingDetails && !canManage && <p className="admin-read-only-note">{roleLabel(activeProject.role, t)}{activeProject.caretaker ? ` · ${t("admin.caretakerShort")}` : ""}</p>}
              {!loadingDetails && canManage && (
                <>
                  <h3>{t("admin.people")}</h3>
                  <ul className="admin-member-list">
                    {(activeDetails?.members ?? []).map((member) => (
                      <MemberRow
                        csrfToken={csrfToken!}
                        key={`${activeProject.id}-${member.userId}`}
                        member={member}
                        onChanged={reloadEverything}
                        projectId={activeProject.id}
                      />
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {isSystemAdministrator && csrfToken && (
            <section aria-labelledby="users-title" className="admin-card admin-users-card">
              <div className="admin-card-heading">
                <span aria-hidden="true" className="admin-card-icon"><Icon name="people" /></span>
                <div>
                  <h2 id="users-title">{t("admin.users")}</h2>
                  <p>{t("admin.usersDescription")}</p>
                </div>
              </div>
              <CreateAccountForm
                csrfToken={csrfToken}
                onChanged={reloadEverything}
                onTokenIssued={(token) => setIssuedToken(token)}
              />
              <ul className="admin-user-list">
                {users.map((user) => (
                  <UserRow
                    caretakerProjects={caretakerProjects}
                    csrfToken={csrfToken}
                    key={user.id}
                    onChanged={async () => { setIssuedToken(null); await reloadEverything(); }}
                    onTokenIssued={(token) => setIssuedToken(token)}
                    user={user}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="admin-side-column">
          <RoleGuide />
          {activeProject && canManage && !loadingDetails && (
            <section aria-labelledby="audit-title" className="admin-card admin-audit-card">
              <div className="admin-card-heading">
                <span aria-hidden="true" className="admin-card-icon"><Icon name="check" /></span>
                <div><h2 id="audit-title">{t("admin.activity")}</h2></div>
              </div>
              {(activeDetails?.audit ?? []).length === 0 ? (
                <p className="admin-muted">{t("admin.noActivity")}</p>
              ) : (
                <ol className="admin-audit-list">
                  {(activeDetails?.audit ?? []).map((entry) => (
                    <li key={entry.id}>
                      <strong>{auditLabel(entry.action, t)}</strong>
                      <span>{entry.targetEmail || entry.actorEmail || "DIG4EL"}</span>
                      <time dateTime={entry.createdAt}>{formatTime(entry.createdAt, locale)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

export function AdministrationPageFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="auth-page admin-page">
      <header className="auth-topbar">
        <Link aria-label="DIG4EL" className="brand" href="/workspace">
          <span aria-hidden="true" className="brand-mark">D</span>
          <span>DIG4EL</span>
        </Link>
        <div className="topbar-actions">
          <AuthStatusControl />
          <LanguageSwitcher />
        </div>
      </header>
      {children}
    </div>
  );
}
