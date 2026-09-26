import { randomUUID } from "node:crypto";
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
  type AuthActionToken,
  type AuthAccountAuditRecord,
  type AuthRateLimitInput,
  type AuthRateLimitResult,
  type AuthStore,
  type AuthUser,
  type AuthUserRecord,
  type NewAuthActionToken,
  type NewPendingAccountWithRegistrationToken,
  type IssueAdminActionTokenInput,
  type NewAuthSession,
  type NewAuthUser,
  type PlaidIdentityLink,
  type StoredAuthSession,
} from "./auth-store";

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

function copyUser(user: AuthUserRecord): AuthUserRecord {
  return {
    ...user,
    activatedAt: user.activatedAt ? copyDate(user.activatedAt) : null,
    createdAt: copyDate(user.createdAt),
    updatedAt: copyDate(user.updatedAt),
  };
}

function asPublicUser(user: AuthUserRecord): AuthUser {
  return {
    activatedAt: user.activatedAt ? copyDate(user.activatedAt) : null,
    createdAt: copyDate(user.createdAt),
    email: user.email,
    id: user.id,
    status: user.status,
    updatedAt: copyDate(user.updatedAt),
  };
}

function copySession(session: StoredAuthSession): StoredAuthSession {
  return {
    ...session,
    absoluteExpiresAt: copyDate(session.absoluteExpiresAt),
    expiresAt: copyDate(session.expiresAt),
    issuedAt: copyDate(session.issuedAt),
    lastSeenAt: copyDate(session.lastSeenAt),
  };
}

function asAdministrativeUser(
  user: AuthUserRecord,
  systemAdministrator = false,
): AdministrativeUser {
  return {
    activatedAt: user.activatedAt ? copyDate(user.activatedAt) : null,
    createdAt: copyDate(user.createdAt),
    email: user.email,
    id: user.id,
    status: user.status,
    systemAdministrator,
  };
}

function asAdministrativeUserWithCaretakerAssignments(
  user: AuthUserRecord,
  systemAdministrator: boolean,
  caretakerProjectIds: string[],
): AdministrativeUserWithCaretakerAssignments {
  return {
    ...asAdministrativeUser(user, systemAdministrator),
    caretakerProjectIds: [...caretakerProjectIds].sort(),
  };
}

function copyLanguageProject(project: LanguageProject): LanguageProject {
  return {
    ...project,
    createdAt: copyDate(project.createdAt),
    updatedAt: copyDate(project.updatedAt),
  };
}

function copyCustomLanguage(language: CustomLanguage): CustomLanguage {
  return {
    ...language,
    createdAt: copyDate(language.createdAt),
    updatedAt: copyDate(language.updatedAt),
  };
}

function copyMembership(membership: ProjectMembership): ProjectMembership {
  return {
    ...membership,
    createdAt: copyDate(membership.createdAt),
    updatedAt: copyDate(membership.updatedAt),
  };
}

function copyAuditState(state: PermissionAuditState): PermissionAuditState {
  return state ? { ...state } : null;
}

function copyPermissionAudit(record: PermissionAuditRecord): PermissionAuditRecord {
  return {
    ...record,
    newState: copyAuditState(record.newState),
    occurredAt: copyDate(record.occurredAt),
    oldState: copyAuditState(record.oldState),
  };
}

function membershipState(membership: ProjectMembership | null): PermissionAuditState {
  return membership ? { caretaker: membership.caretaker, role: membership.role } : null;
}

function membershipKey(projectId: string, userId: string): string {
  return `${projectId}\0${userId}`;
}

function assertCaretakerInvariant(role: ProjectMembership["role"], caretaker: boolean): void {
  if (caretaker && role === "reader") throw new AdminValidationError();
}

/**
 * Deterministic in-process adapter for development and automated tests only.
 * Do not configure it in staging/production: a restart would sign everyone
 * out and a second instance would not recognize existing sessions.
 */
export class InMemoryAuthStore implements AuthStore {
  readonly #actionTokens = new Map<string, AuthActionToken>();
  readonly #accountAudit: AuthAccountAuditRecord[] = [];
  readonly #customLanguages = new Map<string, CustomLanguage>();
  readonly #customLanguagesByNormalizedName = new Map<string, string>();
  readonly #languageProjects = new Map<string, LanguageProject>();
  readonly #permissionAudit: PermissionAuditRecord[] = [];
  readonly #projectMemberships = new Map<string, ProjectMembership>();
  readonly #plaidLinks = new Map<string, PlaidIdentityLink>();
  readonly #rateLimits = new Map<string, { attempts: number; windowStartedAt: Date }>();
  readonly #sessions = new Map<string, StoredAuthSession>();
  readonly #systemAdministrators = new Map<string, { grantedAt: Date }>();
  readonly #deletedUsers = new Set<string>();
  readonly #users = new Map<string, AuthUserRecord>();
  readonly #usersByEmail = new Map<string, string>();

  async bootstrapSystemAdministrator(
    input: BootstrapSystemAdministratorInput,
  ): Promise<BootstrapSystemAdministratorResult> {
    const user = await this.findUserByEmail(input.targetEmail);
    if (!user || user.status === "disabled") {
      throw new AdminNotFoundError("user");
    }
    if (this.#systemAdministrators.has(user.id)) {
      return { granted: false, user: asAdministrativeUser(user, true) };
    }
    this.#systemAdministrators.set(user.id, { grantedAt: copyDate(input.now) });
    this.#appendPermissionAudit({
      action: "system_administrator_granted",
      actorKind: "bootstrap",
      actorUserId: null,
      newState: { systemAdministrator: true },
      now: input.now,
      oldState: { systemAdministrator: false },
      projectId: null,
      requestId: input.requestId,
      targetUserId: user.id,
    });
    return { granted: true, user: asAdministrativeUser(user, true) };
  }

  async changeProjectMembership(input: ChangeProjectMembershipInput): Promise<ProjectMembership> {
    this.#assertProjectManagementAuthority(input.actorUserId, input.projectId);
    assertCaretakerInvariant(input.role, input.caretaker);
    const key = membershipKey(input.projectId, input.targetUserId);
    const existing = this.#projectMemberships.get(key);
    if (!existing) throw new AdminNotFoundError("membership");
    if (
      existing.role === "maintainer" &&
      input.role !== "maintainer" &&
      this.#countMaintainers(input.projectId) <= 1
    ) {
      throw new AdminConflictError("LAST_MAINTAINER");
    }
    if (existing.role === input.role && existing.caretaker === input.caretaker) {
      return copyMembership(existing);
    }
    const next: ProjectMembership = {
      ...existing,
      caretaker: input.caretaker,
      role: input.role,
      updatedAt: copyDate(input.now),
    };
    this.#projectMemberships.set(key, next);
    this.#appendPermissionAudit({
      action: "membership_changed",
      actorKind: "user",
      actorUserId: input.actorUserId,
      newState: membershipState(next),
      now: input.now,
      oldState: membershipState(existing),
      projectId: input.projectId,
      requestId: input.requestId,
      targetUserId: input.targetUserId,
    });
    return copyMembership(next);
  }

  async createCustomLanguage(input: CreateCustomLanguageInput): Promise<CustomLanguage> {
    if (!this.#systemAdministrators.has(input.actorUserId)) throw new AdminAuthorizationError();
    const actor = this.#users.get(input.actorUserId);
    if (!actor || actor.status !== "active") throw new AdminAuthorizationError();
    if (!input.normalizedName || this.#customLanguages.has(input.id)) {
      throw new AdminValidationError();
    }
    if (this.#customLanguagesByNormalizedName.has(input.normalizedName)) {
      throw new AdminConflictError("LANGUAGE_EXISTS");
    }
    const language: CustomLanguage = {
      createdAt: copyDate(input.now),
      createdByUserId: input.actorUserId,
      id: input.id,
      name: input.name,
      regionOrCountry: input.regionOrCountry,
      updatedAt: copyDate(input.now),
    };
    this.#customLanguages.set(language.id, language);
    this.#customLanguagesByNormalizedName.set(input.normalizedName, language.id);
    return copyCustomLanguage(language);
  }

  async createLanguageProject(input: CreateLanguageProjectInput): Promise<LanguageProject> {
    if (!this.#systemAdministrators.has(input.actorUserId)) throw new AdminAuthorizationError();
    if (this.#languageProjects.has(input.id)) throw new Error("Duplicate language project identifier.");
    const actor = this.#users.get(input.actorUserId);
    if (!actor || actor.status !== "active") throw new AdminAuthorizationError();
    const project: LanguageProject = {
      createdAt: copyDate(input.now),
      createdByUserId: input.actorUserId,
      id: input.id,
      languageKey: input.languageKey,
      name: input.name,
      updatedAt: copyDate(input.now),
    };
    const membership: ProjectMembership = {
      caretaker: true,
      createdAt: copyDate(input.now),
      grantedByUserId: input.actorUserId,
      projectId: project.id,
      role: "maintainer",
      updatedAt: copyDate(input.now),
      userId: input.actorUserId,
    };
    this.#languageProjects.set(project.id, project);
    this.#projectMemberships.set(membershipKey(project.id, input.actorUserId), membership);
    this.#appendPermissionAudit({
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
    this.#appendPermissionAudit({
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
    return copyLanguageProject(project);
  }

  async findCustomLanguage(customLanguageId: string): Promise<CustomLanguage | null> {
    const language = this.#customLanguages.get(customLanguageId);
    return language ? copyCustomLanguage(language) : null;
  }

  async findCustomLanguageByNormalizedName(normalizedName: string): Promise<CustomLanguage | null> {
    const languageId = this.#customLanguagesByNormalizedName.get(normalizedName);
    return languageId ? this.findCustomLanguage(languageId) : null;
  }

  async findLanguageProject(projectId: string): Promise<LanguageProject | null> {
    const project = this.#languageProjects.get(projectId);
    return project ? copyLanguageProject(project) : null;
  }

  async findProjectMembership(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembership | null> {
    const membership = this.#projectMemberships.get(membershipKey(projectId, userId));
    return membership ? copyMembership(membership) : null;
  }

  async grantProjectMembership(input: GrantProjectMembershipInput): Promise<ProjectMembership> {
    this.#assertProjectManagementAuthority(input.actorUserId, input.projectId);
    assertCaretakerInvariant(input.role, input.caretaker);
    const target = await this.findUserByEmail(input.targetEmail);
    if (!target || target.status === "disabled") {
      throw new AdminNotFoundError("user");
    }
    const key = membershipKey(input.projectId, target.id);
    if (this.#projectMemberships.has(key)) throw new AdminConflictError("MEMBERSHIP_EXISTS");
    const membership: ProjectMembership = {
      caretaker: input.caretaker,
      createdAt: copyDate(input.now),
      grantedByUserId: input.actorUserId,
      projectId: input.projectId,
      role: input.role,
      updatedAt: copyDate(input.now),
      userId: target.id,
    };
    this.#projectMemberships.set(key, membership);
    this.#appendPermissionAudit({
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
    return copyMembership(membership);
  }

  async isSystemAdministrator(userId: string): Promise<boolean> {
    return this.#systemAdministrators.has(userId) && this.#users.get(userId)?.status === "active";
  }

  async listAccessibleLanguageProjects(
    userId: string,
    includeAllProjects: boolean,
  ): Promise<AccessibleLanguageProject[]> {
    const projects = includeAllProjects
      ? [...this.#languageProjects.values()]
      : [...this.#projectMemberships.values()]
        .filter((membership) => membership.userId === userId)
        .map((membership) => this.#languageProjects.get(membership.projectId))
        .filter((project): project is LanguageProject => Boolean(project));
    return projects
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((project) => {
        const membership = this.#projectMemberships.get(membershipKey(project.id, userId));
        return {
          caretaker: membership?.caretaker ?? false,
          project: copyLanguageProject(project),
          role: membership?.role ?? null,
        };
      });
  }

  async listAdministrativeUsers(): Promise<AdministrativeUserWithCaretakerAssignments[]> {
    return [...this.#users.values()]
      .filter((user) => !this.#deletedUsers.has(user.id))
      .sort((left, right) => left.email.localeCompare(right.email) || left.id.localeCompare(right.id))
      .map((user) => asAdministrativeUserWithCaretakerAssignments(
        user,
        this.#systemAdministrators.has(user.id),
        [...this.#projectMemberships.values()]
          .filter((membership) => membership.userId === user.id && membership.caretaker)
          .map((membership) => membership.projectId),
      ));
  }

  async listProjectMemberships(projectId: string): Promise<ProjectMember[]> {
    return [...this.#projectMemberships.values()]
      .filter((membership) => membership.projectId === projectId)
      .map((membership) => {
        const user = this.#users.get(membership.userId);
        if (!user) throw new Error("Unknown project membership user.");
        return {
          ...copyMembership(membership),
          user: asAdministrativeUser(user, this.#systemAdministrators.has(user.id)),
        };
      })
      .sort((left, right) => left.user.email.localeCompare(right.user.email) || left.userId.localeCompare(right.userId));
  }

  async listProjectPermissionAudit(projectId: string, limit: number): Promise<PermissionAuditRecord[]> {
    return this.#permissionAudit
      .filter((record) => record.projectId === projectId)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, Math.max(0, limit))
      .map(copyPermissionAudit);
  }

  async listUserPermissionAudit(userId: string, limit: number): Promise<PermissionAuditRecord[]> {
    return this.#permissionAudit
      .filter((record) => record.targetUserId === userId)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, Math.max(0, Math.min(200, Math.floor(limit))))
      .map(copyPermissionAudit);
  }

  async revokeProjectMembership(input: RevokeProjectMembershipInput): Promise<void> {
    this.#assertProjectManagementAuthority(input.actorUserId, input.projectId);
    const key = membershipKey(input.projectId, input.targetUserId);
    const existing = this.#projectMemberships.get(key);
    if (!existing) throw new AdminNotFoundError("membership");
    if (existing.role === "maintainer" && this.#countMaintainers(input.projectId) <= 1) {
      throw new AdminConflictError("LAST_MAINTAINER");
    }
    this.#projectMemberships.delete(key);
    this.#appendPermissionAudit({
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
  }

  async searchCustomLanguages(normalizedQuery: string, limit: number): Promise<CustomLanguage[]> {
    if (!normalizedQuery || limit <= 0) return [];
    return [...this.#customLanguagesByNormalizedName.entries()]
      .map(([normalizedName, languageId]) => [normalizedName, this.#customLanguages.get(languageId)] as const)
      .filter((entry): entry is readonly [string, CustomLanguage] => {
        const [normalizedName, language] = entry;
        return Boolean(language) && normalizedName.includes(normalizedQuery);
      })
      .sort(([leftName, leftLanguage], [rightName, rightLanguage]) => {
        const leftStarts = leftName.startsWith(normalizedQuery);
        const rightStarts = rightName.startsWith(normalizedQuery);
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        return leftName.localeCompare(rightName, "en") || leftLanguage.id.localeCompare(rightLanguage.id);
      })
      .slice(0, limit)
      .map(([, language]) => copyCustomLanguage(language));
  }

  async deleteAdministrativeUser(input: DeleteAdministrativeUserInput): Promise<void> {
    this.#assertSystemAdministrator(input.actorUserId);
    const target = this.#users.get(input.targetUserId);
    if (!target || this.#deletedUsers.has(target.id)) throw new AdminNotFoundError("user");
    if (this.#systemAdministrators.has(target.id) && target.status === "active" && this.#countActiveSystemAdministrators() <= 1) {
      throw new AdminConflictError("LAST_SYSTEM_ADMINISTRATOR");
    }
    this.#appendPermissionAudit({ ...input, action: "user_deleted", actorKind: "user",
      projectId: null, oldState: { status: target.status }, newState: null });
    this.#systemAdministrators.delete(target.id);
    for (const [key, membership] of this.#projectMemberships) {
      if (membership.userId === target.id) this.#projectMemberships.delete(key);
    }
    for (const [key, token] of this.#actionTokens) {
      if (token.userId === target.id) this.#actionTokens.delete(key);
    }
    for (const [key, session] of this.#sessions) {
      if (session.userId === target.id) this.#sessions.delete(key);
    }
    for (const [key, link] of this.#plaidLinks) {
      if (link.userId === target.id) this.#plaidLinks.delete(key);
    }
    this.#usersByEmail.delete(target.email);
    target.email = `deleted-${target.id}@deleted.invalid`;
    target.passwordHash = null;
    target.status = "disabled";
    target.updatedAt = copyDate(input.now);
    this.#deletedUsers.add(target.id);
  }

  async updateAdministrativeUser(
    input: UpdateAdministrativeUserInput,
  ): Promise<AdministrativeUserWithCaretakerAssignments> {
    this.#assertSystemAdministrator(input.actorUserId);
    const target = this.#users.get(input.targetUserId);
    if (!target) throw new AdminNotFoundError("user");
    if (target.status === "disabled") throw new AuthAccountStateError("disabled");

    const requestedCaretakerProjects = new Set(input.caretakerProjectIds);
    if (requestedCaretakerProjects.size !== input.caretakerProjectIds.length) {
      throw new AdminValidationError();
    }
    for (const projectId of requestedCaretakerProjects) {
      if (!this.#languageProjects.has(projectId)) throw new AdminNotFoundError("language_project");
    }

    const currentlySystemAdministrator = this.#systemAdministrators.has(target.id);
    if (input.systemAdministrator && !currentlySystemAdministrator) {
      this.#systemAdministrators.set(target.id, { grantedAt: copyDate(input.now) });
      this.#appendPermissionAudit({
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
    } else if (!input.systemAdministrator && currentlySystemAdministrator) {
      if (target.status === "active" && this.#countActiveSystemAdministrators() <= 1) {
        throw new AdminConflictError("LAST_SYSTEM_ADMINISTRATOR");
      }
      this.#systemAdministrators.delete(target.id);
      this.#appendPermissionAudit({
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

    const existingMemberships = new Map(
      [...this.#projectMemberships.values()]
        .filter((membership) => membership.userId === target.id)
        .map((membership) => [membership.projectId, membership] as const),
    );

    for (const [projectId, existing] of existingMemberships) {
      if (!existing.caretaker || requestedCaretakerProjects.has(projectId)) continue;
      const next: ProjectMembership = {
        ...existing,
        caretaker: false,
        updatedAt: copyDate(input.now),
      };
      this.#projectMemberships.set(membershipKey(projectId, target.id), next);
      this.#appendPermissionAudit({
        action: "membership_changed",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: membershipState(next),
        now: input.now,
        oldState: membershipState(existing),
        projectId,
        requestId: input.requestId,
        targetUserId: target.id,
      });
    }

    for (const projectId of [...requestedCaretakerProjects].sort()) {
      const existing = existingMemberships.get(projectId);
      if (!existing) {
        const membership: ProjectMembership = {
          caretaker: true,
          createdAt: copyDate(input.now),
          grantedByUserId: input.actorUserId,
          projectId,
          role: "writer",
          updatedAt: copyDate(input.now),
          userId: target.id,
        };
        this.#projectMemberships.set(membershipKey(projectId, target.id), membership);
        this.#appendPermissionAudit({
          action: "membership_granted",
          actorKind: "user",
          actorUserId: input.actorUserId,
          newState: membershipState(membership),
          now: input.now,
          oldState: null,
          projectId,
          requestId: input.requestId,
          targetUserId: target.id,
        });
        continue;
      }
      if (existing.caretaker) continue;
      const next: ProjectMembership = {
        ...existing,
        caretaker: true,
        role: existing.role === "reader" ? "writer" : existing.role,
        updatedAt: copyDate(input.now),
      };
      this.#projectMemberships.set(membershipKey(projectId, target.id), next);
      this.#appendPermissionAudit({
        action: "membership_changed",
        actorKind: "user",
        actorUserId: input.actorUserId,
        newState: membershipState(next),
        now: input.now,
        oldState: membershipState(existing),
        projectId,
        requestId: input.requestId,
        targetUserId: target.id,
      });
    }

    return asAdministrativeUserWithCaretakerAssignments(
      target,
      this.#systemAdministrators.has(target.id),
      [...requestedCaretakerProjects],
    );
  }

  async activateAccountWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null> {
    const token = this.#actionTokens.get(tokenHash);
    if (
      !token ||
      token.purpose !== "account_registration" ||
      token.usedAt ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    const user = this.#users.get(token.userId);
    if (!user || user.status !== "pending_activation") return null;

    token.usedAt = copyDate(now);
    user.activatedAt = copyDate(now);
    user.passwordHash = passwordHash;
    user.status = "active";
    user.updatedAt = copyDate(now);
    this.#appendAccountAudit({
      action: "account_activated",
      actorUserId: user.id,
      metadata: {},
      now,
      requestId: null,
      targetUserId: user.id,
    });
    return asPublicUser(user);
  }

  async consumeRateLimit(input: AuthRateLimitInput): Promise<AuthRateLimitResult> {
    const existing = this.#rateLimits.get(input.bucketHash);
    const sameWindow =
      existing && existing.windowStartedAt.getTime() === input.windowStartedAt.getTime();
    const attempts = sameWindow ? existing.attempts + 1 : 1;
    this.#rateLimits.set(input.bucketHash, {
      attempts,
      windowStartedAt: copyDate(input.windowStartedAt),
    });
    return {
      allowed: attempts <= input.limit,
      retryAt: new Date(input.windowStartedAt.getTime() + input.windowMs),
    };
  }

  async createPendingAccountWithRegistrationToken(
    input: NewPendingAccountWithRegistrationToken,
  ): Promise<AuthUser> {
    this.#assertSystemAdministrator(input.actorUserId);
    if (input.action.purpose !== "account_registration" || input.action.userId !== input.id) {
      throw new Error("Invalid registration token input.");
    }
    if (this.#usersByEmail.has(input.email)) throw new AuthStoreConflictError("email");
    const user: AuthUserRecord = {
      activatedAt: null,
      createdAt: copyDate(input.now),
      email: input.email,
      id: input.id,
      passwordHash: null,
      status: "pending_activation",
      updatedAt: copyDate(input.now),
    };
    this.#users.set(user.id, user);
    this.#usersByEmail.set(user.email, user.id);
    this.#storeActionToken(input.action);
    this.#appendAccountAudit({
      action: "account_created",
      actorUserId: input.actorUserId,
      metadata: { status: "pending_activation" },
      now: input.now,
      requestId: input.requestId,
      targetUserId: user.id,
    });
    this.#appendAccountAudit({
      action: "registration_token_issued",
      actorUserId: input.actorUserId,
      metadata: {
        expiresAt: input.action.expiresAt.toISOString(),
        purpose: input.action.purpose,
      },
      now: input.now,
      requestId: input.requestId,
      targetUserId: user.id,
    });
    return asPublicUser(user);
  }

  #storeActionToken(input: NewAuthActionToken): void {
    if (!this.#users.has(input.userId)) throw new Error("Unknown authentication user.");
    for (const token of this.#actionTokens.values()) {
      if (token.userId === input.userId && token.purpose === input.purpose && !token.usedAt) {
        token.usedAt = copyDate(input.now);
      }
    }
    this.#actionTokens.set(input.tokenHash, {
      createdAt: copyDate(input.now),
      expiresAt: copyDate(input.expiresAt),
      id: input.id,
      issuedByUserId: input.issuedByUserId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      usedAt: null,
      userId: input.userId,
    });
  }

  async createSession(session: NewAuthSession): Promise<void> {
    if (!this.#users.has(session.userId)) throw new Error("Unknown authentication user.");
    this.#sessions.set(session.idHash, copySession(session));
  }

  async createUser(input: NewAuthUser): Promise<AuthUser> {
    if (this.#usersByEmail.has(input.email)) throw new AuthStoreConflictError("email");
    const user: AuthUserRecord = {
      activatedAt: input.activatedAt
        ? copyDate(input.activatedAt)
        : input.status === "active"
          ? copyDate(input.now)
          : null,
      createdAt: copyDate(input.now),
      email: input.email,
      id: input.id,
      passwordHash: input.passwordHash,
      status: input.status ?? "pending_activation",
      updatedAt: copyDate(input.now),
    };
    this.#users.set(user.id, user);
    this.#usersByEmail.set(user.email, user.id);
    return asPublicUser(user);
  }

  async deleteSession(idHash: string): Promise<void> {
    this.#sessions.delete(idHash);
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    for (const [idHash, session] of this.#sessions) {
      if (session.userId === userId) this.#sessions.delete(idHash);
    }
  }

  async findSession(idHash: string): Promise<StoredAuthSession | null> {
    const session = this.#sessions.get(idHash);
    return session ? copySession(session) : null;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const userId = this.#usersByEmail.get(email);
    const user = userId ? this.#users.get(userId) : null;
    return user ? copyUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = this.#users.get(id);
    return user ? copyUser(user) : null;
  }

  async linkPlaidIdentity(link: PlaidIdentityLink): Promise<void> {
    if (!this.#users.has(link.userId)) throw new Error("Unknown authentication user.");
    const key = `${link.plaidInstanceId}\0${link.plaidUserId}`;
    const existing = this.#plaidLinks.get(key);
    if (existing && existing.userId !== link.userId) {
      throw new AuthStoreConflictError("plaid_identity");
    }
    this.#plaidLinks.set(key, { ...link, createdAt: copyDate(link.createdAt) });
  }

  async issuePasswordRecoveryToken(input: IssueAdminActionTokenInput): Promise<AuthUser> {
    return this.#issueAdministratorToken(input, "password_recovery", "active", "recovery_token_issued");
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
    return this.#accountAudit
      .filter((record) => record.targetUserId === userId)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, Math.max(0, Math.min(200, Math.floor(limit))))
      .map((record) => ({
        ...record,
        metadata: { ...record.metadata },
        occurredAt: copyDate(record.occurredAt),
      }));
  }

  async ping(): Promise<void> {
    // This adapter is intentionally used only for local development/tests.
  }

  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<AuthUser | null> {
    const token = this.#actionTokens.get(tokenHash);
    if (
      !token ||
      token.purpose !== "password_recovery" ||
      token.usedAt ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    const user = this.#users.get(token.userId);
    if (!user || user.status !== "active") return null;

    token.usedAt = copyDate(now);
    user.passwordHash = passwordHash;
    user.updatedAt = copyDate(now);
    await this.deleteSessionsForUser(user.id);
    this.#appendAccountAudit({
      action: "password_recovered",
      actorUserId: user.id,
      metadata: {},
      now,
      requestId: null,
      targetUserId: user.id,
    });
    return asPublicUser(user);
  }

  #issueAdministratorToken(
    input: IssueAdminActionTokenInput,
    purpose: AuthActionToken["purpose"],
    requiredStatus: AuthUserRecord["status"],
    auditAction: "registration_token_issued" | "recovery_token_issued",
  ): AuthUser {
    this.#assertSystemAdministrator(input.actorUserId);
    if (input.action.purpose !== purpose || input.action.userId !== input.userId) {
      throw new Error("Invalid authentication token input.");
    }
    const target = this.#users.get(input.userId);
    if (!target) throw new AdminNotFoundError("user");
    if (target.status !== requiredStatus) throw new AuthAccountStateError(target.status);
    this.#storeActionToken(input.action);
    this.#appendAccountAudit({
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
    return asPublicUser(target);
  }

  #appendAccountAudit(input: {
    action: AuthAccountAuditRecord["action"];
    actorUserId: string | null;
    metadata: Record<string, string | null>;
    now: Date;
    requestId: string | null;
    targetUserId: string;
  }): void {
    this.#accountAudit.push({
      action: input.action,
      actorUserId: input.actorUserId,
      id: randomUUID(),
      metadata: { ...input.metadata },
      occurredAt: copyDate(input.now),
      requestId: input.requestId,
      targetUserId: input.targetUserId,
    });
  }


  #appendPermissionAudit(input: {
    action: PermissionAuditRecord["action"];
    actorKind: PermissionAuditRecord["actorKind"];
    actorUserId: string | null;
    newState: PermissionAuditState;
    now: Date;
    oldState: PermissionAuditState;
    projectId: string | null;
    requestId: string;
    targetUserId: string | null;
  }): void {
    this.#permissionAudit.push({
      action: input.action,
      actorEmail: input.actorUserId ? this.#users.get(input.actorUserId)?.email ?? null : null,
      actorKind: input.actorKind,
      actorUserId: input.actorUserId,
      id: randomUUID(),
      newState: copyAuditState(input.newState),
      occurredAt: copyDate(input.now),
      oldState: copyAuditState(input.oldState),
      projectId: input.projectId,
      requestId: input.requestId,
      targetEmail: input.targetUserId ? this.#users.get(input.targetUserId)?.email ?? null : null,
      targetUserId: input.targetUserId,
    });
  }

  #assertProjectManagementAuthority(actorUserId: string, projectId: string): void {
    if (!this.#languageProjects.has(projectId)) throw new AdminNotFoundError("language_project");
    if (this.#systemAdministrators.has(actorUserId) && this.#users.get(actorUserId)?.status === "active") {
      return;
    }
    const membership = this.#projectMemberships.get(membershipKey(projectId, actorUserId));
    if (membership?.role !== "maintainer") throw new AdminAuthorizationError();
  }

  #assertSystemAdministrator(actorUserId: string): void {
    const account = this.#users.get(actorUserId);
    if (!account || account.status !== "active" || !this.#systemAdministrators.has(actorUserId)) {
      throw new AdminAuthorizationError();
    }
  }

  #countMaintainers(projectId: string): number {
    return [...this.#projectMemberships.values()].filter(
      (membership) => membership.projectId === projectId && membership.role === "maintainer",
    ).length;
  }

  #countActiveSystemAdministrators(): number {
    return [...this.#systemAdministrators.keys()].filter(
      (userId) => this.#users.get(userId)?.status === "active",
    ).length;
  }

  async updateSession(session: StoredAuthSession): Promise<void> {
    if (!this.#sessions.has(session.idHash)) return;
    this.#sessions.set(session.idHash, copySession(session));
  }
}
