import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  AccessibleLanguageProject,
  AdministrativeUser,
  AdministrativeUserWithCaretakerAssignments,
  BootstrapSystemAdministratorInput,
  BootstrapSystemAdministratorResult,
  ChangeProjectMembershipInput,
  CreateCustomLanguageInput,
  CreateLanguageProjectInput,
  CustomLanguage,
  DeleteAdministrativeUserInput,
  GrantProjectMembershipInput,
  LanguageProject,
  PermissionAuditRecord,
  PermissionAuditState,
  ProjectMember,
  ProjectMembership,
  ProjectRole,
  RevokeProjectMembershipInput,
  UpdateAdministrativeUserInput,
} from "../admin/admin-store";
import {
  AdminAuthorizationError,
  AdminConflictError,
  AdminNotFoundError,
  AdminValidationError,
} from "../admin/errors";
import {
  AuthAccountStateError,
  AuthStoreConflictError,
  type AuthAccountAuditRecord,
  type AuthRateLimitInput,
  type AuthRateLimitResult,
  type AuthStore,
  type AuthUser,
  type AuthUserRecord,
  type IssueAdminActionTokenInput,
  type NewAuthActionToken,
  type NewPendingAccountWithRegistrationToken,
  type NewAuthSession,
  type NewAuthUser,
  type PlaidIdentityLink,
  type StoredAuthSession,
} from "./auth-store";

type UserRow = {
  activated_at: Date | string | null;
  created_at: Date | string;
  email: string;
  id: string;
  password_hash: string | null;
  status: AuthUserRecord["status"];
  updated_at: Date | string;
};

type SessionRow = {
  absolute_expires_at: Date | string;
  expires_at: Date | string;
  id_hash: string;
  issued_at: Date | string;
  last_seen_at: Date | string;
  user_id: string;
};

type RateLimitRow = {
  attempts: number;
  window_started_at: Date | string;
};

type LanguageProjectRow = {
  created_at: Date | string;
  created_by_user_id: string;
  id: string;
  language_key: string | null;
  name: string;
  updated_at: Date | string;
};

type CustomLanguageRow = {
  created_at: Date | string;
  created_by_user_id: string;
  id: string;
  name: string;
  normalized_name: string;
  region_or_country: string;
  updated_at: Date | string;
};

type ProjectMembershipRow = {
  caretaker: boolean;
  created_at: Date | string;
  granted_by_user_id: string;
  project_id: string;
  role: ProjectRole;
  updated_at: Date | string;
  user_id: string;
};

type ProjectMemberRow = ProjectMembershipRow & {
  user_activated_at: Date | string | null;
  user_created_at: Date | string;
  user_email: string;
  user_status: AdministrativeUser["status"];
  user_system_administrator: boolean;
};

type AdministrativeUserRow = {
  activated_at: Date | string | null;
  created_at: Date | string;
  email: string;
  id: string;
  status: AdministrativeUser["status"];
  system_administrator: boolean;
};

type CaretakerAssignmentRow = {
  project_id: string;
  user_id: string;
};

type PermissionAuditRow = {
  action: PermissionAuditRecord["action"];
  actor_email: string | null;
  actor_kind: PermissionAuditRecord["actorKind"];
  actor_user_id: string | null;
  id: string;
  new_state: unknown;
  occurred_at: Date | string;
  old_state: unknown;
  project_id: string | null;
  request_id: string;
  target_email: string | null;
  target_user_id: string | null;
};

type AuthAccountAuditRow = {
  action: AuthAccountAuditRecord["action"];
  actor_user_id: string | null;
  id: string;
  metadata: unknown;
  occurred_at: Date | string;
  request_id: string | null;
  target_user_id: string;
};

type PostgresError = { code?: string };

function asDate(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function toUser(row: UserRow): AuthUserRecord {
  return {
    activatedAt: row.activated_at ? asDate(row.activated_at) : null,
    createdAt: asDate(row.created_at),
    email: row.email,
    id: row.id,
    passwordHash: row.password_hash,
    status: row.status,
    updatedAt: asDate(row.updated_at),
  };
}

function toPublicUser(row: UserRow): AuthUser {
  const user = toUser(row);
  return {
    activatedAt: user.activatedAt,
    createdAt: user.createdAt,
    email: user.email,
    id: user.id,
    status: user.status,
    updatedAt: user.updatedAt,
  };
}

function toSession(row: SessionRow): StoredAuthSession {
  return {
    absoluteExpiresAt: asDate(row.absolute_expires_at),
    expiresAt: asDate(row.expires_at),
    idHash: row.id_hash,
    issuedAt: asDate(row.issued_at),
    lastSeenAt: asDate(row.last_seen_at),
    userId: row.user_id,
  };
}

function toLanguageProject(row: LanguageProjectRow): LanguageProject {
  return {
    createdAt: asDate(row.created_at),
    createdByUserId: row.created_by_user_id,
    id: row.id,
    languageKey: row.language_key,
    name: row.name,
    updatedAt: asDate(row.updated_at),
  };
}

function toCustomLanguage(row: CustomLanguageRow): CustomLanguage {
  return {
    createdAt: asDate(row.created_at),
    createdByUserId: row.created_by_user_id,
    id: row.id,
    name: row.name,
    regionOrCountry: row.region_or_country,
    updatedAt: asDate(row.updated_at),
  };
}

function toProjectMembership(row: ProjectMembershipRow): ProjectMembership {
  return {
    caretaker: row.caretaker,
    createdAt: asDate(row.created_at),
    grantedByUserId: row.granted_by_user_id,
    projectId: row.project_id,
    role: row.role,
    updatedAt: asDate(row.updated_at),
    userId: row.user_id,
  };
}

function toAdministrativeUser(row: AdministrativeUserRow): AdministrativeUser {
  return {
    activatedAt: row.activated_at ? asDate(row.activated_at) : null,
    createdAt: asDate(row.created_at),
    email: row.email,
    id: row.id,
    status: row.status,
    systemAdministrator: row.system_administrator,
  };
}

function toAdministrativeUserWithCaretakerAssignments(
  row: AdministrativeUserRow,
  caretakerProjectIds: string[],
): AdministrativeUserWithCaretakerAssignments {
  return {
    ...toAdministrativeUser(row),
    caretakerProjectIds: [...caretakerProjectIds].sort(),
  };
}

function toProjectMember(row: ProjectMemberRow): ProjectMember {
  return {
    ...toProjectMembership(row),
    user: {
      activatedAt: row.user_activated_at ? asDate(row.user_activated_at) : null,
      createdAt: asDate(row.user_created_at),
      email: row.user_email,
      id: row.user_id,
      status: row.user_status,
      systemAdministrator: row.user_system_administrator,
    },
  };
}

function toPermissionAuditState(value: unknown): PermissionAuditState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const state: NonNullable<PermissionAuditState> = {};
  if (typeof source.name === "string") state.name = source.name;
  if (source.role === "reader" || source.role === "writer" || source.role === "maintainer") {
    state.role = source.role;
  }
  if (typeof source.caretaker === "boolean") state.caretaker = source.caretaker;
  if (typeof source.systemAdministrator === "boolean") {
    state.systemAdministrator = source.systemAdministrator;
  }
  return Object.keys(state).length > 0 ? state : null;
}

function toPermissionAuditRecord(row: PermissionAuditRow): PermissionAuditRecord {
  return {
    action: row.action,
    actorEmail: row.actor_email,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    id: row.id,
    newState: toPermissionAuditState(row.new_state),
    occurredAt: asDate(row.occurred_at),
    oldState: toPermissionAuditState(row.old_state),
    projectId: row.project_id,
    requestId: row.request_id,
    targetEmail: row.target_email,
    targetUserId: row.target_user_id,
  };
}

function toAuthAccountAudit(row: AuthAccountAuditRow): AuthAccountAuditRecord {
  const source = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const metadata: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" || value === null) metadata[key] = value;
  }
  return {
    action: row.action,
    actorUserId: row.actor_user_id,
    id: row.id,
    metadata,
    occurredAt: asDate(row.occurred_at),
    requestId: row.request_id,
    targetUserId: row.target_user_id,
  };
}

function membershipState(membership: ProjectMembership | null): PermissionAuditState {
  return membership ? { caretaker: membership.caretaker, role: membership.role } : null;
}

function jsonPermissionState(state: PermissionAuditState): string {
  return JSON.stringify(state);
}

function assertCaretakerInvariant(role: ProjectRole, caretaker: boolean): void {
  if (caretaker && role === "reader") throw new AdminValidationError();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as PostgresError).code === "23505";
}

const userColumns = `
  id, email, password_hash, status, activated_at, created_at, updated_at
`;

const languageProjectColumns = `
  id, name, language_key, created_by_user_id, created_at, updated_at
`;

const languageProjectProjection = `
  project.id,
  project.name,
  project.language_key,
  project.created_by_user_id,
  project.created_at,
  project.updated_at
`;

const projectMembershipColumns = `
  project_id, user_id, role, caretaker, granted_by_user_id, created_at, updated_at
`;

const customLanguageColumns = `
  id, name, normalized_name, region_or_country, created_by_user_id, created_at, updated_at
`;

/**
 * PostgreSQL adapter for local-account sessions. Apply every migration in
 * db/migrations before constructing this store in production.
 */
export class PostgresAuthStore implements AuthStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  static fromDatabaseUrl(databaseUrl: string): PostgresAuthStore {
    return new PostgresAuthStore(new Pool({ connectionString: databaseUrl }));
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async bootstrapSystemAdministrator(
    input: BootstrapSystemAdministratorInput,
  ): Promise<BootstrapSystemAdministratorResult> {
    return this.#transaction(async (client) => {
      const user = await client.query<AdministrativeUserRow>(
        `
          SELECT
            account.id,
            account.email,
            account.status,
            account.activated_at,
            account.created_at,
            EXISTS (
              SELECT 1
              FROM dig4el_system_administrators AS administrator
              WHERE administrator.user_id = account.id
            ) AS system_administrator
          FROM dig4el_auth_users AS account
          WHERE email = $1
            AND account.status <> 'disabled'
          FOR UPDATE
        `,
        [input.targetEmail],
      );
      if (!user.rows[0]) throw new AdminNotFoundError("user");
      const target = toAdministrativeUser(user.rows[0]);
      const inserted = await client.query<{ user_id: string }>(
        `
          INSERT INTO dig4el_system_administrators
            (user_id, granted_at, granted_by_user_id)
          VALUES ($1, $2, NULL)
          ON CONFLICT (user_id) DO NOTHING
          RETURNING user_id
        `,
        [target.id, input.now],
      );
      if (inserted.rows.length === 0) return { granted: false, user: target };
      await this.#insertPermissionAudit(client, {
        action: "system_administrator_granted",
        actorKind: "bootstrap",
        actorUserId: null,
        newState: { systemAdministrator: true },
        now: input.now,
        oldState: { systemAdministrator: false },
        projectId: null,
        requestId: input.requestId,
        targetUserId: target.id,
      });
      return { granted: true, user: { ...target, systemAdministrator: true } };
    });
  }

  async changeProjectMembership(input: ChangeProjectMembershipInput): Promise<ProjectMembership> {
    assertCaretakerInvariant(input.role, input.caretaker);
    return this.#transaction(async (client) => {
      await this.#requireProjectManagementAuthority(client, input.actorUserId, input.projectId);
      const existingResult = await client.query<ProjectMembershipRow>(
        `
          SELECT ${projectMembershipColumns}
          FROM dig4el_language_project_memberships
          WHERE project_id = $1 AND user_id = $2
          FOR UPDATE
        `,
        [input.projectId, input.targetUserId],
      );
      if (!existingResult.rows[0]) throw new AdminNotFoundError("membership");
      const existing = toProjectMembership(existingResult.rows[0]);
      if (existing.role === "maintainer" && input.role !== "maintainer") {
        await this.#assertNotLastMaintainer(client, input.projectId);
      }
      if (existing.role === input.role && existing.caretaker === input.caretaker) {
        return existing;
      }
      const updated = await client.query<ProjectMembershipRow>(
        `
          UPDATE dig4el_language_project_memberships
          SET role = $3, caretaker = $4, updated_at = $5
          WHERE project_id = $1 AND user_id = $2
          RETURNING ${projectMembershipColumns}
        `,
        [input.projectId, input.targetUserId, input.role, input.caretaker, input.now],
      );
      const membership = toProjectMembership(updated.rows[0]);
      await this.#insertPermissionAudit(client, {
        action: "membership_changed",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: membershipState(membership),
        now: input.now,
        oldState: membershipState(existing),
        projectId: input.projectId,
        requestId: input.requestId,
        targetUserId: input.targetUserId,
      });
      return membership;
    });
  }

  async createCustomLanguage(input: CreateCustomLanguageInput): Promise<CustomLanguage> {
    return this.#transaction(async (client) => {
      await this.#requireSystemAdministrator(client, input.actorUserId);
      try {
        const result = await client.query<CustomLanguageRow>(
          `
            INSERT INTO dig4el_custom_languages
              (id, name, normalized_name, region_or_country, created_by_user_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING ${customLanguageColumns}
          `,
          [
            input.id,
            input.name,
            input.normalizedName,
            input.regionOrCountry,
            input.actorUserId,
            input.now,
          ],
        );
        return toCustomLanguage(result.rows[0]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new AdminConflictError("LANGUAGE_EXISTS");
        throw error;
      }
    });
  }

  async createLanguageProject(input: CreateLanguageProjectInput): Promise<LanguageProject> {
    return this.#transaction(async (client) => {
      await this.#requireSystemAdministrator(client, input.actorUserId);
      const projectResult = await client.query<LanguageProjectRow>(
        `
          INSERT INTO dig4el_language_projects
            (id, name, language_key, created_by_user_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $5)
          RETURNING ${languageProjectColumns}
        `,
        [input.id, input.name, input.languageKey, input.actorUserId, input.now],
      );
      const project = toLanguageProject(projectResult.rows[0]);
      const membershipResult = await client.query<ProjectMembershipRow>(
        `
          INSERT INTO dig4el_language_project_memberships
            (project_id, user_id, role, caretaker, granted_by_user_id, created_at, updated_at)
          VALUES ($1, $2, 'maintainer', TRUE, $2, $3, $3)
          RETURNING ${projectMembershipColumns}
        `,
        [project.id, input.actorUserId, input.now],
      );
      const membership = toProjectMembership(membershipResult.rows[0]);
      await this.#insertPermissionAudit(client, {
        action: "language_project_created",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: { name: project.name },
        now: input.now,
        oldState: null,
        projectId: project.id,
        requestId: input.requestId,
        targetUserId: input.actorUserId,
      });
      await this.#insertPermissionAudit(client, {
        action: "membership_granted",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: membershipState(membership),
        now: input.now,
        oldState: null,
        projectId: project.id,
        requestId: input.requestId,
        targetUserId: input.actorUserId,
      });
      return project;
    });
  }

  async findCustomLanguage(customLanguageId: string): Promise<CustomLanguage | null> {
    const result = await this.#pool.query<CustomLanguageRow>(
      `
        SELECT ${customLanguageColumns}
        FROM dig4el_custom_languages
        WHERE id = $1
      `,
      [customLanguageId],
    );
    return result.rows[0] ? toCustomLanguage(result.rows[0]) : null;
  }

  async findCustomLanguageByNormalizedName(normalizedName: string): Promise<CustomLanguage | null> {
    const result = await this.#pool.query<CustomLanguageRow>(
      `
        SELECT ${customLanguageColumns}
        FROM dig4el_custom_languages
        WHERE normalized_name = $1
      `,
      [normalizedName],
    );
    return result.rows[0] ? toCustomLanguage(result.rows[0]) : null;
  }

  async findLanguageProject(projectId: string): Promise<LanguageProject | null> {
    const result = await this.#pool.query<LanguageProjectRow>(
      `
        SELECT ${languageProjectColumns}
        FROM dig4el_language_projects
        WHERE id = $1
      `,
      [projectId],
    );
    return result.rows[0] ? toLanguageProject(result.rows[0]) : null;
  }

  async findProjectMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership | null> {
    const result = await this.#pool.query<ProjectMembershipRow>(
      `
        SELECT ${projectMembershipColumns}
        FROM dig4el_language_project_memberships
        WHERE project_id = $1 AND user_id = $2
      `,
      [projectId, userId],
    );
    return result.rows[0] ? toProjectMembership(result.rows[0]) : null;
  }

  async grantProjectMembership(input: GrantProjectMembershipInput): Promise<ProjectMembership> {
    assertCaretakerInvariant(input.role, input.caretaker);
    return this.#transaction(async (client) => {
      await this.#requireProjectManagementAuthority(client, input.actorUserId, input.projectId);
      const targetResult = await client.query<AdministrativeUserRow>(
        `
          SELECT
            account.id,
            account.email,
            account.status,
            account.activated_at,
            account.created_at,
            EXISTS (
              SELECT 1
              FROM dig4el_system_administrators AS administrator
              WHERE administrator.user_id = account.id
            ) AS system_administrator
          FROM dig4el_auth_users AS account
          WHERE email = $1
            AND account.status <> 'disabled'
          FOR UPDATE
        `,
        [input.targetEmail],
      );
      if (!targetResult.rows[0]) throw new AdminNotFoundError("user");
      const target = toAdministrativeUser(targetResult.rows[0]);
      const existing = await client.query<{ user_id: string }>(
        `
          SELECT user_id
          FROM dig4el_language_project_memberships
          WHERE project_id = $1 AND user_id = $2
          FOR UPDATE
        `,
        [input.projectId, target.id],
      );
      if (existing.rows.length > 0) throw new AdminConflictError("MEMBERSHIP_EXISTS");
      const inserted = await client.query<ProjectMembershipRow>(
        `
          INSERT INTO dig4el_language_project_memberships
            (project_id, user_id, role, caretaker, granted_by_user_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING ${projectMembershipColumns}
        `,
        [
          input.projectId,
          target.id,
          input.role,
          input.caretaker,
          input.actorUserId,
          input.now,
        ],
      );
      const membership = toProjectMembership(inserted.rows[0]);
      await this.#insertPermissionAudit(client, {
        action: "membership_granted",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: membershipState(membership),
        now: input.now,
        oldState: null,
        projectId: input.projectId,
        requestId: input.requestId,
        targetUserId: target.id,
      });
      return membership;
    });
  }

  async isSystemAdministrator(userId: string): Promise<boolean> {
    const result = await this.#pool.query<{ user_id: string }>(
      `
        SELECT administrator.user_id
        FROM dig4el_system_administrators AS administrator
        INNER JOIN dig4el_auth_users AS account ON account.id = administrator.user_id
        WHERE administrator.user_id = $1 AND account.status = 'active'
      `,
      [userId],
    );
    return result.rows.length > 0;
  }

  async listAccessibleLanguageProjects(
    userId: string,
    includeAllProjects: boolean,
  ): Promise<AccessibleLanguageProject[]> {
    const result = await this.#pool.query<LanguageProjectRow & {
      caretaker: boolean | null;
      role: ProjectRole | null;
    }>(
      includeAllProjects
        ? `
            SELECT ${languageProjectProjection}, membership.role, membership.caretaker
            FROM dig4el_language_projects AS project
            LEFT JOIN dig4el_language_project_memberships AS membership
              ON membership.project_id = project.id AND membership.user_id = $1
            ORDER BY project.name ASC, project.id ASC
          `
        : `
            SELECT ${languageProjectProjection}, membership.role, membership.caretaker
            FROM dig4el_language_projects AS project
            INNER JOIN dig4el_language_project_memberships AS membership
              ON membership.project_id = project.id AND membership.user_id = $1
            ORDER BY project.name ASC, project.id ASC
          `,
      [userId],
    );
    return result.rows.map((row) => ({
      caretaker: row.caretaker ?? false,
      project: toLanguageProject(row),
      role: row.role,
    }));
  }

  async listAdministrativeUsers(): Promise<AdministrativeUserWithCaretakerAssignments[]> {
    const [users, assignments] = await Promise.all([
      this.#pool.query<AdministrativeUserRow>(
        `
          SELECT
            account.id,
            account.email,
            account.status,
            account.activated_at,
            account.created_at,
            EXISTS (
              SELECT 1
              FROM dig4el_system_administrators AS administrator
              WHERE administrator.user_id = account.id
            ) AS system_administrator
          FROM dig4el_auth_users AS account
          WHERE account.deleted_at IS NULL
          ORDER BY account.email ASC, account.id ASC
        `,
      ),
      this.#pool.query<CaretakerAssignmentRow>(
        `
          SELECT user_id, project_id
          FROM dig4el_language_project_memberships
          WHERE caretaker = TRUE
          ORDER BY user_id ASC, project_id ASC
        `,
      ),
    ]);
    const caretakerProjectIdsByUser = new Map<string, string[]>();
    for (const assignment of assignments.rows) {
      const projectIds = caretakerProjectIdsByUser.get(assignment.user_id) ?? [];
      projectIds.push(assignment.project_id);
      caretakerProjectIdsByUser.set(assignment.user_id, projectIds);
    }
    return users.rows.map((user) => toAdministrativeUserWithCaretakerAssignments(
      user,
      caretakerProjectIdsByUser.get(user.id) ?? [],
    ));
  }

  async listProjectMemberships(projectId: string): Promise<ProjectMember[]> {
    const result = await this.#pool.query<ProjectMemberRow>(
      `
        SELECT
          membership.project_id,
          membership.user_id,
          membership.role,
          membership.caretaker,
          membership.granted_by_user_id,
          membership.created_at,
          membership.updated_at,
          account.email AS user_email,
          account.status AS user_status,
          account.activated_at AS user_activated_at,
          account.created_at AS user_created_at,
          EXISTS (
            SELECT 1
            FROM dig4el_system_administrators AS administrator
            WHERE administrator.user_id = account.id
          ) AS user_system_administrator
        FROM dig4el_language_project_memberships AS membership
        INNER JOIN dig4el_auth_users AS account ON account.id = membership.user_id
        WHERE membership.project_id = $1
        ORDER BY account.email ASC, account.id ASC
      `,
      [projectId],
    );
    return result.rows.map(toProjectMember);
  }

  async listProjectPermissionAudit(projectId: string, limit: number): Promise<PermissionAuditRecord[]> {
    const boundedLimit = Math.max(0, Math.min(200, Math.floor(limit)));
    const result = await this.#pool.query<PermissionAuditRow>(
      `
        SELECT
          audit.id,
          audit.occurred_at,
          audit.action,
          audit.actor_kind,
          audit.actor_user_id,
          actor.email AS actor_email,
          audit.target_user_id,
          target.email AS target_email,
          audit.project_id,
          audit.old_state,
          audit.new_state,
          audit.request_id
        FROM dig4el_permission_audit AS audit
        LEFT JOIN dig4el_auth_users AS actor ON actor.id = audit.actor_user_id
        LEFT JOIN dig4el_auth_users AS target ON target.id = audit.target_user_id
        WHERE audit.project_id = $1
        ORDER BY audit.occurred_at DESC, audit.id DESC
        LIMIT $2
      `,
      [projectId, boundedLimit],
    );
    return result.rows.map(toPermissionAuditRecord);
  }

  async listUserPermissionAudit(userId: string, limit: number): Promise<PermissionAuditRecord[]> {
    const boundedLimit = Math.max(0, Math.min(200, Math.floor(limit)));
    const result = await this.#pool.query<PermissionAuditRow>(
      `
        SELECT
          audit.id,
          audit.occurred_at,
          audit.action,
          audit.actor_kind,
          audit.actor_user_id,
          actor.email AS actor_email,
          audit.target_user_id,
          target.email AS target_email,
          audit.project_id,
          audit.old_state,
          audit.new_state,
          audit.request_id
        FROM dig4el_permission_audit AS audit
        LEFT JOIN dig4el_auth_users AS actor ON actor.id = audit.actor_user_id
        LEFT JOIN dig4el_auth_users AS target ON target.id = audit.target_user_id
        WHERE audit.target_user_id = $1
        ORDER BY audit.occurred_at DESC, audit.id DESC
        LIMIT $2
      `,
      [userId, boundedLimit],
    );
    return result.rows.map(toPermissionAuditRecord);
  }

  async revokeProjectMembership(input: RevokeProjectMembershipInput): Promise<void> {
    await this.#transaction(async (client) => {
      await this.#requireProjectManagementAuthority(client, input.actorUserId, input.projectId);
      const existingResult = await client.query<ProjectMembershipRow>(
        `
          SELECT ${projectMembershipColumns}
          FROM dig4el_language_project_memberships
          WHERE project_id = $1 AND user_id = $2
          FOR UPDATE
        `,
        [input.projectId, input.targetUserId],
      );
      if (!existingResult.rows[0]) throw new AdminNotFoundError("membership");
      const existing = toProjectMembership(existingResult.rows[0]);
      if (existing.role === "maintainer") {
        await this.#assertNotLastMaintainer(client, input.projectId);
      }
      await client.query(
        `
          DELETE FROM dig4el_language_project_memberships
          WHERE project_id = $1 AND user_id = $2
        `,
        [input.projectId, input.targetUserId],
      );
      await this.#insertPermissionAudit(client, {
        action: "membership_revoked",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: null,
        now: input.now,
        oldState: membershipState(existing),
        projectId: input.projectId,
        requestId: input.requestId,
        targetUserId: input.targetUserId,
      });
    });
  }

  async searchCustomLanguages(normalizedQuery: string, limit: number): Promise<CustomLanguage[]> {
    const boundedLimit = Math.max(0, Math.min(200, Math.floor(limit)));
    if (!normalizedQuery || boundedLimit === 0) return [];
    const result = await this.#pool.query<CustomLanguageRow>(
      `
        SELECT ${customLanguageColumns}
        FROM dig4el_custom_languages
        WHERE POSITION($1 IN normalized_name) > 0
        ORDER BY
          CASE WHEN POSITION($1 IN normalized_name) = 1 THEN 0 ELSE 1 END,
          name ASC,
          id ASC
        LIMIT $2
      `,
      [normalizedQuery, boundedLimit],
    );
    return result.rows.map(toCustomLanguage);
  }

  async deleteAdministrativeUser(input: DeleteAdministrativeUserInput): Promise<void> {
    await this.#transaction(async (client) => {
      const administrators = await client.query<{ user_id: string; status: string }>(`
        SELECT administrator.user_id, account.status
        FROM dig4el_system_administrators AS administrator
        JOIN dig4el_auth_users AS account ON account.id = administrator.user_id
        ORDER BY administrator.user_id FOR UPDATE OF administrator
      `);
      if (!administrators.rows.some((row) => row.user_id === input.actorUserId && row.status === "active")) {
        throw new AdminAuthorizationError();
      }
      const result = await client.query<UserRow>(
        `SELECT ${userColumns} FROM dig4el_auth_users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [input.targetUserId],
      );
      const target = result.rows[0];
      if (!target) throw new AdminNotFoundError("user");
      if (target.status === "active" && administrators.rows.some((row) => row.user_id === target.id)
        && administrators.rows.filter((row) => row.status === "active").length <= 1) {
        throw new AdminConflictError("LAST_SYSTEM_ADMINISTRATOR");
      }
      await client.query("SELECT id FROM dig4el_language_projects ORDER BY id FOR UPDATE");
      await this.#insertPermissionAudit(client, { ...input, action: "user_deleted", actorKind: "user",
        projectId: null, oldState: { status: target.status }, newState: null });
      await client.query("DELETE FROM dig4el_system_administrators WHERE user_id = $1", [target.id]);
      await client.query("DELETE FROM dig4el_language_project_memberships WHERE user_id = $1", [target.id]);
      await client.query("DELETE FROM dig4el_auth_sessions WHERE user_id = $1", [target.id]);
      await client.query("DELETE FROM dig4el_auth_action_tokens WHERE user_id = $1", [target.id]);
      await client.query("DELETE FROM dig4el_auth_plaid_identity_links WHERE user_id = $1", [target.id]);
      // Retain an inert account reference for immutable audit and project provenance.
      await client.query(`UPDATE dig4el_auth_users SET email = $2, password_hash = NULL,
        status = 'disabled', deleted_at = $3, updated_at = $3 WHERE id = $1`,
        [target.id, `deleted-${target.id}@deleted.invalid`, input.now]);
    });
  }

  async updateAdministrativeUser(
    input: UpdateAdministrativeUserInput,
  ): Promise<AdministrativeUserWithCaretakerAssignments> {
    return this.#transaction(async (client) => {
      // Lock every current administrator before checking the actor or deciding
      // whether a demotion would remove the final active administrator. This
      // serializes simultaneous global-role changes.
      const administrators = await client.query<{
        status: AuthUserRecord["status"];
        user_id: string;
      }>(
        `
          SELECT administrator.user_id, account.status
          FROM dig4el_system_administrators AS administrator
          INNER JOIN dig4el_auth_users AS account ON account.id = administrator.user_id
          ORDER BY administrator.user_id ASC
          FOR UPDATE OF administrator
        `,
      );
      if (!administrators.rows.some(
        (administrator) =>
          administrator.user_id === input.actorUserId && administrator.status === "active",
      )) {
        throw new AdminAuthorizationError();
      }

      const targetResult = await client.query<UserRow>(
        `
          SELECT ${userColumns}
          FROM dig4el_auth_users
          WHERE id = $1
          FOR UPDATE
        `,
        [input.targetUserId],
      );
      if (!targetResult.rows[0]) throw new AdminNotFoundError("user");
      const target = targetResult.rows[0];
      if (target.status === "disabled") throw new AuthAccountStateError("disabled");

      // This operation defines the target's complete caretaker set. Lock all
      // projects in stable order before locking memberships so concurrent
      // project-scoped changes cannot leave a partially applied set.
      const projects = await client.query<{ id: string }>(
        `
          SELECT id
          FROM dig4el_language_projects
          ORDER BY id ASC
          FOR UPDATE
        `,
      );
      const knownProjectIds = new Set(projects.rows.map((project) => project.id));
      const requestedCaretakerProjects = new Set(input.caretakerProjectIds);
      if (requestedCaretakerProjects.size !== input.caretakerProjectIds.length) {
        throw new AdminValidationError();
      }
      for (const projectId of requestedCaretakerProjects) {
        if (!knownProjectIds.has(projectId)) throw new AdminNotFoundError("language_project");
      }

      const currentlySystemAdministrator = administrators.rows.some(
        (administrator) => administrator.user_id === target.id,
      );
      if (input.systemAdministrator && !currentlySystemAdministrator) {
        const granted = await client.query<{ user_id: string }>(
          `
            INSERT INTO dig4el_system_administrators
              (user_id, granted_at, granted_by_user_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO NOTHING
            RETURNING user_id
          `,
          [target.id, input.now, input.actorUserId],
        );
        if (granted.rows.length > 0) {
          await this.#insertPermissionAudit(client, {
            action: "system_administrator_granted",
            actorKind: "user",
            actorUserId: input.actorUserId,
            newState: { systemAdministrator: true },
            now: input.now,
            oldState: { systemAdministrator: false },
            projectId: null,
            requestId: input.requestId,
            targetUserId: target.id,
          });
        }
      } else if (!input.systemAdministrator && currentlySystemAdministrator) {
        const activeAdministratorCount = administrators.rows.filter(
          (administrator) => administrator.status === "active",
        ).length;
        if (target.status === "active" && activeAdministratorCount <= 1) {
          throw new AdminConflictError("LAST_SYSTEM_ADMINISTRATOR");
        }
        await client.query(
          "DELETE FROM dig4el_system_administrators WHERE user_id = $1",
          [target.id],
        );
        await this.#insertPermissionAudit(client, {
          action: "system_administrator_revoked",
          actorKind: "user",
          actorUserId: input.actorUserId,
          newState: { systemAdministrator: false },
          now: input.now,
          oldState: { systemAdministrator: true },
          projectId: null,
          requestId: input.requestId,
          targetUserId: target.id,
        });
      }

      const memberships = await client.query<ProjectMembershipRow>(
        `
          SELECT ${projectMembershipColumns}
          FROM dig4el_language_project_memberships
          WHERE user_id = $1
          FOR UPDATE
        `,
        [target.id],
      );
      const membershipsByProject = new Map(
        memberships.rows.map((row) => {
          const membership = toProjectMembership(row);
          return [membership.projectId, membership] as const;
        }),
      );

      for (const membership of membershipsByProject.values()) {
        if (!membership.caretaker || requestedCaretakerProjects.has(membership.projectId)) continue;
        const updated = await client.query<ProjectMembershipRow>(
          `
            UPDATE dig4el_language_project_memberships
            SET caretaker = FALSE, updated_at = $3
            WHERE project_id = $1 AND user_id = $2
            RETURNING ${projectMembershipColumns}
          `,
          [membership.projectId, target.id, input.now],
        );
        const next = toProjectMembership(updated.rows[0]);
        await this.#insertPermissionAudit(client, {
          action: "membership_changed",
          actorKind: "user",
          actorUserId: input.actorUserId,
          newState: membershipState(next),
          now: input.now,
          oldState: membershipState(membership),
          projectId: membership.projectId,
          requestId: input.requestId,
          targetUserId: target.id,
        });
      }

      for (const projectId of [...requestedCaretakerProjects].sort()) {
        const membership = membershipsByProject.get(projectId);
        if (!membership) {
          const inserted = await client.query<ProjectMembershipRow>(
            `
              INSERT INTO dig4el_language_project_memberships
                (project_id, user_id, role, caretaker, granted_by_user_id, created_at, updated_at)
              VALUES ($1, $2, 'writer', TRUE, $3, $4, $4)
              RETURNING ${projectMembershipColumns}
            `,
            [projectId, target.id, input.actorUserId, input.now],
          );
          const next = toProjectMembership(inserted.rows[0]);
          await this.#insertPermissionAudit(client, {
            action: "membership_granted",
            actorKind: "user",
            actorUserId: input.actorUserId,
            newState: membershipState(next),
            now: input.now,
            oldState: null,
            projectId,
            requestId: input.requestId,
            targetUserId: target.id,
          });
          continue;
        }
        if (membership.caretaker) continue;
        const updated = await client.query<ProjectMembershipRow>(
          `
            UPDATE dig4el_language_project_memberships
            SET role = $3, caretaker = TRUE, updated_at = $4
            WHERE project_id = $1 AND user_id = $2
            RETURNING ${projectMembershipColumns}
          `,
          [
            projectId,
            target.id,
            membership.role === "reader" ? "writer" : membership.role,
            input.now,
          ],
        );
        const next = toProjectMembership(updated.rows[0]);
        await this.#insertPermissionAudit(client, {
          action: "membership_changed",
          actorKind: "user",
          actorUserId: input.actorUserId,
          newState: membershipState(next),
          now: input.now,
          oldState: membershipState(membership),
          projectId,
          requestId: input.requestId,
          targetUserId: target.id,
        });
      }

      return toAdministrativeUserWithCaretakerAssignments(
        { ...target, system_administrator: input.systemAdministrator },
        [...requestedCaretakerProjects],
      );
    });
  }

  async activateAccountWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null> {
    return this.#transaction(async (client) => {
      const result = await client.query<UserRow>(
        `
          WITH valid_token AS (
            UPDATE dig4el_auth_action_tokens AS token
            SET used_at = $3
            FROM dig4el_auth_users AS candidate
            WHERE token.token_hash = $1
              AND token.purpose = 'account_registration'
              AND token.used_at IS NULL
              AND token.expires_at > $3
              AND candidate.id = token.user_id
              AND candidate.status = 'pending_activation'
            RETURNING token.user_id
          )
          UPDATE dig4el_auth_users AS account
          SET status = 'active',
              password_hash = $2,
              activated_at = COALESCE(account.activated_at, $3),
              updated_at = $3
          FROM valid_token
          WHERE account.id = valid_token.user_id
          RETURNING ${userColumns}
        `,
        [tokenHash, passwordHash, now],
      );
      if (!result.rows[0]) return null;
      const user = toPublicUser(result.rows[0]);
      await this.#insertAccountAudit(client, {
        action: "account_activated",
        actorUserId: user.id,
        metadata: {},
        now,
        requestId: null,
        targetUserId: user.id,
      });
      return user;
    });
  }

  async consumeRateLimit(input: AuthRateLimitInput): Promise<AuthRateLimitResult> {
    const result = await this.#pool.query<RateLimitRow>(
      `
        INSERT INTO dig4el_auth_rate_limits
          (bucket_hash, window_started_at, attempts, updated_at)
        VALUES ($1, $2, 1, $3)
        ON CONFLICT (bucket_hash) DO UPDATE
        SET attempts = CASE
              WHEN dig4el_auth_rate_limits.window_started_at = EXCLUDED.window_started_at
              THEN dig4el_auth_rate_limits.attempts + 1
              ELSE 1
            END,
            window_started_at = EXCLUDED.window_started_at,
            updated_at = EXCLUDED.updated_at
        RETURNING attempts, window_started_at
      `,
      [input.bucketHash, input.windowStartedAt, input.now],
    );
    const row = result.rows[0];
    return {
      allowed: row.attempts <= input.limit,
      retryAt: new Date(asDate(row.window_started_at).getTime() + input.windowMs),
    };
  }

  async createPendingAccountWithRegistrationToken(
    input: NewPendingAccountWithRegistrationToken,
  ): Promise<AuthUser> {
    if (input.action.purpose !== "account_registration" || input.action.userId !== input.id) {
      throw new Error("Invalid registration token input.");
    }
    return this.#transaction(async (client) => {
      await this.#requireSystemAdministrator(client, input.actorUserId);
      let result;
      try {
        result = await client.query<UserRow>(
          `
            INSERT INTO dig4el_auth_users
              (id, email, password_hash, status, activated_at, created_at, updated_at)
            VALUES ($1, $2, NULL, 'pending_activation', NULL, $3, $3)
            RETURNING ${userColumns}
          `,
          [input.id, input.email, input.now],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new AuthStoreConflictError("email");
        throw error;
      }
      await this.#storeActionToken(client, input.action);
      await this.#insertAccountAudit(client, {
        action: "account_created",
        actorUserId: input.actorUserId,
        metadata: { status: "pending_activation" },
        now: input.now,
        requestId: input.requestId,
        targetUserId: input.id,
      });
      await this.#insertAccountAudit(client, {
        action: "registration_token_issued",
        actorUserId: input.actorUserId,
        metadata: {
          expiresAt: input.action.expiresAt.toISOString(),
          purpose: input.action.purpose,
        },
        now: input.now,
        requestId: input.requestId,
        targetUserId: input.id,
      });
      return toPublicUser(result.rows[0]);
    });
  }

  async createSession(session: NewAuthSession): Promise<void> {
    await this.#pool.query(
      `
        INSERT INTO dig4el_auth_sessions
          (id_hash, user_id, issued_at, last_seen_at, expires_at, absolute_expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        session.idHash,
        session.userId,
        session.issuedAt,
        session.lastSeenAt,
        session.expiresAt,
        session.absoluteExpiresAt,
      ],
    );
  }

  async createUser(input: NewAuthUser): Promise<AuthUser> {
    try {
      const result = await this.#pool.query<UserRow>(
        `
          INSERT INTO dig4el_auth_users
            (id, email, password_hash, status, activated_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING ${userColumns}
        `,
        [
          input.id,
          input.email,
          input.passwordHash,
          input.status ?? "pending_activation",
          input.activatedAt ?? (input.status === "active" ? input.now : null),
          input.now,
        ],
      );
      return toPublicUser(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AuthStoreConflictError("email");
      throw error;
    }
  }

  async deleteSession(idHash: string): Promise<void> {
    await this.#pool.query("DELETE FROM dig4el_auth_sessions WHERE id_hash = $1", [idHash]);
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.#pool.query("DELETE FROM dig4el_auth_sessions WHERE user_id = $1", [userId]);
  }

  async findSession(idHash: string): Promise<StoredAuthSession | null> {
    const result = await this.#pool.query<SessionRow>(
      `
        SELECT id_hash, user_id, issued_at, last_seen_at, expires_at, absolute_expires_at
        FROM dig4el_auth_sessions
        WHERE id_hash = $1
      `,
      [idHash],
    );
    return result.rows[0] ? toSession(result.rows[0]) : null;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const result = await this.#pool.query<UserRow>(
      `SELECT ${userColumns} FROM dig4el_auth_users WHERE email = $1`,
      [email],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const result = await this.#pool.query<UserRow>(
      `SELECT ${userColumns} FROM dig4el_auth_users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async linkPlaidIdentity(link: PlaidIdentityLink): Promise<void> {
    try {
      const result = await this.#pool.query<{ user_id: string }>(
        `
          INSERT INTO dig4el_auth_plaid_identity_links
            (user_id, plaid_instance_id, plaid_user_id, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (plaid_instance_id, plaid_user_id) DO UPDATE
          SET user_id = dig4el_auth_plaid_identity_links.user_id
          WHERE dig4el_auth_plaid_identity_links.user_id = EXCLUDED.user_id
          RETURNING user_id
        `,
        [link.userId, link.plaidInstanceId, link.plaidUserId, link.createdAt],
      );
      if (result.rows.length === 0) throw new AuthStoreConflictError("plaid_identity");
    } catch (error) {
      if (isUniqueViolation(error)) throw new AuthStoreConflictError("plaid_identity");
      throw error;
    }
  }

  async issuePasswordRecoveryToken(input: IssueAdminActionTokenInput): Promise<AuthUser> {
    return this.#issueAdministratorToken(
      input,
      "password_recovery",
      "active",
      "recovery_token_issued",
    );
  }

  async issueRegistrationToken(input: IssueAdminActionTokenInput): Promise<AuthUser> {
    return this.#issueAdministratorToken(
      input,
      "account_registration",
      "pending_activation",
      "registration_token_issued",
    );
  }

  async listAuthAccountAudit(userId: string, limit: number): Promise<AuthAccountAuditRecord[]> {
    const boundedLimit = Math.max(0, Math.min(200, Math.floor(limit)));
    const result = await this.#pool.query<AuthAccountAuditRow>(
      `
        SELECT id, occurred_at, action, actor_user_id, target_user_id, request_id, metadata
        FROM dig4el_auth_account_audit
        WHERE target_user_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT $2
      `,
      [userId, boundedLimit],
    );
    return result.rows.map(toAuthAccountAudit);
  }

  /** Confirms connectivity and all local auth/administration schema tables. */
  async ping(): Promise<void> {
    await Promise.all([
      this.#pool.query("SELECT 1 FROM dig4el_auth_users LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_auth_action_tokens LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_auth_account_audit LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_auth_rate_limits LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_auth_sessions LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_auth_plaid_identity_links LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_language_projects LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_custom_languages LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_language_project_memberships LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_system_administrators LIMIT 1"),
      this.#pool.query("SELECT 1 FROM dig4el_permission_audit LIMIT 1"),
    ]);
  }

  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null> {
    return this.#transaction(async (client) => {
      const result = await client.query<UserRow>(
        `
          WITH valid_token AS (
            UPDATE dig4el_auth_action_tokens AS token
            SET used_at = $3
            FROM dig4el_auth_users AS candidate
            WHERE token.token_hash = $1
              AND token.purpose = 'password_recovery'
              AND token.used_at IS NULL
              AND token.expires_at > $3
              AND candidate.id = token.user_id
              AND candidate.status = 'active'
            RETURNING token.user_id
          )
          UPDATE dig4el_auth_users AS account
          SET password_hash = $2, updated_at = $3
          FROM valid_token
          WHERE account.id = valid_token.user_id
          RETURNING ${userColumns}
        `,
        [tokenHash, passwordHash, now],
      );
      if (!result.rows[0]) return null;
      await client.query("DELETE FROM dig4el_auth_sessions WHERE user_id = $1", [result.rows[0].id]);
      const user = toPublicUser(result.rows[0]);
      await this.#insertAccountAudit(client, {
        action: "password_recovered",
        actorUserId: user.id,
        metadata: {},
        now,
        requestId: null,
        targetUserId: user.id,
      });
      return user;
    });
  }

  async updateSession(session: StoredAuthSession): Promise<void> {
    await this.#pool.query(
      `
        UPDATE dig4el_auth_sessions
        SET last_seen_at = $2, expires_at = $3
        WHERE id_hash = $1
      `,
      [session.idHash, session.lastSeenAt, session.expiresAt],
    );
  }

  async #issueAdministratorToken(
    input: IssueAdminActionTokenInput,
    purpose: NewAuthActionToken["purpose"],
    requiredStatus: AuthUserRecord["status"],
    auditAction: "registration_token_issued" | "recovery_token_issued",
  ): Promise<AuthUser> {
    if (input.action.purpose !== purpose || input.action.userId !== input.userId) {
      throw new Error("Invalid authentication token input.");
    }
    return this.#transaction(async (client) => {
      await this.#requireSystemAdministrator(client, input.actorUserId);
      const targetResult = await client.query<UserRow>(
        `
          SELECT ${userColumns}
          FROM dig4el_auth_users
          WHERE id = $1
          FOR UPDATE
        `,
        [input.userId],
      );
      if (!targetResult.rows[0]) throw new AdminNotFoundError("user");
      const target = toUser(targetResult.rows[0]);
      if (target.status !== requiredStatus) throw new AuthAccountStateError(target.status);
      await this.#storeActionToken(client, input.action);
      await this.#insertAccountAudit(client, {
        action: auditAction,
        actorUserId: input.actorUserId,
        metadata: {
          expiresAt: input.action.expiresAt.toISOString(),
          purpose: input.action.purpose,
        },
        now: input.now,
        requestId: input.requestId,
        targetUserId: target.id,
      });
      return toPublicUser(targetResult.rows[0]);
    });
  }

  async #assertNotLastMaintainer(client: PoolClient, projectId: string): Promise<void> {
    const result = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM dig4el_language_project_memberships
        WHERE project_id = $1 AND role = 'maintainer'
      `,
      [projectId],
    );
    if (Number(result.rows[0]?.count ?? "0") <= 1) {
      throw new AdminConflictError("LAST_MAINTAINER");
    }
  }

  async #insertPermissionAudit(
    client: PoolClient,
    input: {
      action: PermissionAuditRecord["action"];
      actorKind: PermissionAuditRecord["actorKind"];
      actorUserId: string | null;
      newState: PermissionAuditState;
      now: Date;
      oldState: PermissionAuditState;
      projectId: string | null;
      requestId: string;
      targetUserId: string | null;
    },
  ): Promise<void> {
    if (!input.requestId || Buffer.byteLength(input.requestId, "utf8") > 128) {
      throw new AdminValidationError();
    }
    await client.query(
      `
        INSERT INTO dig4el_permission_audit
          (id, occurred_at, action, actor_kind, actor_user_id, target_user_id,
           project_id, old_state, new_state, request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      `,
      [
        randomUUID(),
        input.now,
        input.action,
        input.actorKind,
        input.actorUserId,
        input.targetUserId,
        input.projectId,
        jsonPermissionState(input.oldState),
        jsonPermissionState(input.newState),
        input.requestId,
      ],
    );
  }

  async #insertAccountAudit(
    client: PoolClient,
    input: {
      action: AuthAccountAuditRecord["action"];
      actorUserId: string | null;
      metadata: Record<string, string | null>;
      now: Date;
      requestId: string | null;
      targetUserId: string;
    },
  ): Promise<void> {
    if (
      (input.requestId !== null && (!input.requestId || Buffer.byteLength(input.requestId, "utf8") > 128)) ||
      Object.entries(input.metadata).some(
        ([key, value]) =>
          !key || Buffer.byteLength(key, "utf8") > 64 ||
          (typeof value === "string" && Buffer.byteLength(value, "utf8") > 512),
      )
    ) {
      throw new AdminValidationError();
    }
    await client.query(
      `
        INSERT INTO dig4el_auth_account_audit
          (id, occurred_at, action, actor_user_id, target_user_id, request_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        randomUUID(),
        input.now,
        input.action,
        input.actorUserId,
        input.targetUserId,
        input.requestId,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async #requireProjectManagementAuthority(
    client: PoolClient,
    actorUserId: string,
    projectId: string,
  ): Promise<void> {
    // A project-row lock makes role changes, revocations, and the last-
    // maintainer invariant serial with other administration mutations.
    const project = await client.query<{ id: string }>(
      "SELECT id FROM dig4el_language_projects WHERE id = $1 FOR UPDATE",
      [projectId],
    );
    if (project.rows.length === 0) throw new AdminNotFoundError("language_project");
    const administrator = await client.query<{ user_id: string }>(
      `
        SELECT administrator.user_id
        FROM dig4el_system_administrators AS administrator
        INNER JOIN dig4el_auth_users AS account ON account.id = administrator.user_id
        WHERE administrator.user_id = $1 AND account.status = 'active'
      `,
      [actorUserId],
    );
    if (administrator.rows.length > 0) return;
    const membership = await client.query<{ role: ProjectRole }>(
      `
        SELECT role
        FROM dig4el_language_project_memberships
        WHERE project_id = $1 AND user_id = $2
      `,
      [projectId, actorUserId],
    );
    if (membership.rows[0]?.role !== "maintainer") throw new AdminAuthorizationError();
  }

  async #requireSystemAdministrator(client: PoolClient, userId: string): Promise<void> {
    const result = await client.query<{ user_id: string }>(
      `
        SELECT administrator.user_id
        FROM dig4el_system_administrators AS administrator
        INNER JOIN dig4el_auth_users AS account ON account.id = administrator.user_id
        WHERE administrator.user_id = $1 AND account.status = 'active'
      `,
      [userId],
    );
    if (result.rows.length === 0) throw new AdminAuthorizationError();
  }

  async #storeActionToken(client: PoolClient, input: NewAuthActionToken): Promise<void> {
    // Serialise all action-link replacement for one account. Updating only the
    // existing token rows is insufficient when two first-time requests race:
    // neither transaction would otherwise see the other's newly inserted row.
    // The parent user row always exists for valid callers and gives us a stable
    // lock even when this is the account's first action token.
    const account = await client.query<{ id: string }>(
      "SELECT id FROM dig4el_auth_users WHERE id = $1 FOR UPDATE",
      [input.userId],
    );
    if (account.rows.length === 0) throw new Error("Unknown authentication user.");
    await client.query(
      `
        UPDATE dig4el_auth_action_tokens
        SET used_at = $3
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
      `,
      [input.userId, input.purpose, input.now],
    );
    await client.query(
      `
        INSERT INTO dig4el_auth_action_tokens
          (id, user_id, purpose, token_hash, expires_at, used_at, created_at, issued_by_user_id)
        VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
      `,
      [
        input.id,
        input.userId,
        input.purpose,
        input.tokenHash,
        input.expiresAt,
        input.now,
        input.issuedByUserId,
      ],
    );
  }

  async #transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original database error is more useful to the caller.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
