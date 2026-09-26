/**
 * Local DIG4EL language-project administration only. These records are not a
 * PLAID project mirror, do not grant PLAID corpus access, and must never be
 * used in place of a fresh PLAID API authorization check in future features.
 */

export const projectRoles = ["reader", "writer", "maintainer"] as const;

export type ProjectRole = (typeof projectRoles)[number];

export type LanguageProject = {
  createdAt: Date;
  createdByUserId: string;
  id: string;
  /** Immutable link to a v1 catalog entry or a user-added language. */
  languageKey: string | null;
  name: string;
  updatedAt: Date;
};

/**
 * A language added after the immutable WALS/Grambank baseline. The record
 * itself is the provenance trail required for a user-created language.
 */
export type CustomLanguage = {
  createdAt: Date;
  createdByUserId: string;
  id: string;
  name: string;
  regionOrCountry: string;
  updatedAt: Date;
};

export type ProjectMembership = {
  caretaker: boolean;
  createdAt: Date;
  grantedByUserId: string;
  projectId: string;
  role: ProjectRole;
  updatedAt: Date;
  userId: string;
};

/** Safe user details available to an authorized administrator; never a hash. */
export type AdministrativeUser = {
  activatedAt: Date | null;
  createdAt: Date;
  email: string;
  id: string;
  status: "active" | "disabled" | "pending_activation";
  /** A distinct local operational capability, never a PLAID role. */
  systemAdministrator: boolean;
};

/**
 * Safe administrator-facing account details. Caretaker assignments are kept
 * separate from the global account capability because they remain scoped to
 * individual language projects.
 */
export type AdministrativeUserWithCaretakerAssignments = AdministrativeUser & {
  caretakerProjectIds: string[];
};

export type ProjectMember = ProjectMembership & {
  user: AdministrativeUser;
};

export type AccessibleLanguageProject = {
  caretaker: boolean;
  project: LanguageProject;
  role: ProjectRole | null;
};

export type PermissionAuditAction =
  | "user_deleted"
  | "language_project_created"
  | "membership_changed"
  | "membership_granted"
  | "membership_revoked"
  | "system_administrator_granted"
  | "system_administrator_revoked";

export type PermissionAuditActorKind = "bootstrap" | "user";

/** The snapshots intentionally contain only permission/project metadata. */
export type PermissionAuditState = Record<string, boolean | string | null> | null;

export type PermissionAuditRecord = {
  action: PermissionAuditAction;
  actorEmail: string | null;
  actorKind: PermissionAuditActorKind;
  actorUserId: string | null;
  id: string;
  newState: PermissionAuditState;
  occurredAt: Date;
  oldState: PermissionAuditState;
  projectId: string | null;
  requestId: string;
  targetEmail: string | null;
  targetUserId: string | null;
};

export type CreateLanguageProjectInput = {
  actorUserId: string;
  id: string;
  languageKey: string;
  name: string;
  now: Date;
  requestId: string;
};

export type CreateCustomLanguageInput = {
  actorUserId: string;
  id: string;
  name: string;
  normalizedName: string;
  now: Date;
  regionOrCountry: string;
};

export type GrantProjectMembershipInput = {
  actorUserId: string;
  caretaker: boolean;
  projectId: string;
  role: ProjectRole;
  targetEmail: string;
  now: Date;
  requestId: string;
};

export type ChangeProjectMembershipInput = {
  actorUserId: string;
  caretaker: boolean;
  projectId: string;
  role: ProjectRole;
  targetUserId: string;
  now: Date;
  requestId: string;
};

export type RevokeProjectMembershipInput = {
  actorUserId: string;
  projectId: string;
  targetUserId: string;
  now: Date;
  requestId: string;
};

/**
 * A system administrator updates the global account capability and the exact
 * set of language projects for which the target is a caretaker. Caretaker
 * access remains a project membership capability, never a global role.
 */
export type UpdateAdministrativeUserInput = {
  actorUserId: string;
  caretakerProjectIds: string[];
  now: Date;
  requestId: string;
  systemAdministrator: boolean;
  targetUserId: string;
};

export type BootstrapSystemAdministratorInput = {
  now: Date;
  requestId: string;
  targetEmail: string;
};

export type BootstrapSystemAdministratorResult = {
  granted: boolean;
  user: AdministrativeUser;
};

export type DeleteAdministrativeUserInput = {
  actorUserId: string;
  targetUserId: string;
  now: Date;
  requestId: string;
};

export interface AdminStore {
  deleteAdministrativeUser(input: DeleteAdministrativeUserInput): Promise<void>;
  bootstrapSystemAdministrator(
    input: BootstrapSystemAdministratorInput,
  ): Promise<BootstrapSystemAdministratorResult>;
  changeProjectMembership(input: ChangeProjectMembershipInput): Promise<ProjectMembership>;
  createCustomLanguage(input: CreateCustomLanguageInput): Promise<CustomLanguage>;
  createLanguageProject(input: CreateLanguageProjectInput): Promise<LanguageProject>;
  findCustomLanguage(customLanguageId: string): Promise<CustomLanguage | null>;
  findCustomLanguageByNormalizedName(normalizedName: string): Promise<CustomLanguage | null>;
  findLanguageProject(projectId: string): Promise<LanguageProject | null>;
  findProjectMembership(projectId: string, userId: string): Promise<ProjectMembership | null>;
  grantProjectMembership(input: GrantProjectMembershipInput): Promise<ProjectMembership>;
  isSystemAdministrator(userId: string): Promise<boolean>;
  listAccessibleLanguageProjects(
    userId: string,
    includeAllProjects: boolean,
  ): Promise<AccessibleLanguageProject[]>;
  listAdministrativeUsers(): Promise<AdministrativeUserWithCaretakerAssignments[]>;
  listProjectMemberships(projectId: string): Promise<ProjectMember[]>;
  listProjectPermissionAudit(projectId: string, limit: number): Promise<PermissionAuditRecord[]>;
  listUserPermissionAudit(userId: string, limit: number): Promise<PermissionAuditRecord[]>;
  revokeProjectMembership(input: RevokeProjectMembershipInput): Promise<void>;
  searchCustomLanguages(normalizedQuery: string, limit: number): Promise<CustomLanguage[]>;
  updateAdministrativeUser(
    input: UpdateAdministrativeUserInput,
  ): Promise<AdministrativeUserWithCaretakerAssignments>;
}
