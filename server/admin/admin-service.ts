import { randomUUID } from "node:crypto";
import { normalizeLanguageSearch, type LanguageOption } from "../../lib/languages";
import {
  findCatalogLanguage,
  isCatalogLanguageName,
  maximumSearchResults,
  searchCatalogLanguages,
} from "../languages/language-catalog";
import { normalizeEmail } from "../auth/identity";
import type {
  AccessibleLanguageProject,
  AdminStore,
  AdministrativeUserWithCaretakerAssignments,
  CustomLanguage,
  LanguageProject,
  PermissionAuditRecord,
  ProjectMember,
  ProjectMembership,
  ProjectRole,
} from "./admin-store";
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from "./errors";
import {
  requireProjectManagementAuthority,
  requireSystemAdministrator,
} from "./guards";

const maximumProjectNameBytes = 160;
const maximumSearchQueryBytes = 160;
const auditPageSize = 200;
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const customLanguagePrefix = "custom:";

function normalizeLanguageField(value: string, maximumBytes = maximumProjectNameBytes): string {
  const name = value.trim().replaceAll(/\s+/gu, " ");
  const hasControlCharacter = [...name].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
  if (!name || Buffer.byteLength(name, "utf8") > maximumBytes || hasControlCharacter) {
    throw new AdminValidationError();
  }
  return name;
}

function assertProjectIdentifier(value: string): void {
  if (!uuidShape.test(value)) throw new AdminValidationError();
}

function assertLanguageKey(value: string): void {
  if (!value || Buffer.byteLength(value, "utf8") > 1_024) throw new AdminValidationError();
}

function customLanguageOption(language: CustomLanguage): LanguageOption {
  return {
    id: `${customLanguagePrefix}${language.id}`,
    name: language.name,
    regionOrCountry: language.regionOrCountry,
    source: "custom",
  };
}

function compareLanguageSearchResults(
  left: LanguageOption,
  right: LanguageOption,
  normalizedQuery: string,
): number {
  const leftName = normalizeLanguageSearch(left.name);
  const rightName = normalizeLanguageSearch(right.name);
  const leftStarts = leftName.startsWith(normalizedQuery);
  const rightStarts = rightName.startsWith(normalizedQuery);
  if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
  return left.name.localeCompare(right.name, "en");
}

function normalizeCaretakerProjectIds(projectIds: string[]): string[] {
  const uniqueProjectIds = new Set<string>();
  for (const projectId of projectIds) {
    assertProjectIdentifier(projectId);
    if (uniqueProjectIds.has(projectId)) throw new AdminValidationError();
    uniqueProjectIds.add(projectId);
  }
  return [...uniqueProjectIds].sort();
}

function assertMembershipInput(role: string, caretaker: boolean): asserts role is ProjectRole {
  if (role !== "reader" && role !== "writer" && role !== "maintainer") {
    throw new AdminValidationError();
  }
  if (typeof caretaker !== "boolean" || (caretaker && role === "reader")) {
    throw new AdminValidationError();
  }
}

/**
 * Local administration workflow. It is intentionally independent of PLAID:
 * no local project role grants PLAID membership or corpus authority.
 */
export class AdminService {
  readonly #clock: () => Date;
  readonly #store: AdminStore;

  constructor(store: AdminStore, options: { clock?: () => Date } = {}) {
    this.#store = store;
    this.#clock = options.clock ?? (() => new Date());
  }

  async changeMembership(input: {
    actorUserId: string;
    caretaker: boolean;
    projectId: string;
    role: string;
    targetUserId: string;
    requestId: string;
  }): Promise<ProjectMembership> {
    assertProjectIdentifier(input.projectId);
    assertProjectIdentifier(input.targetUserId);
    assertMembershipInput(input.role, input.caretaker);
    await requireProjectManagementAuthority(this.#store, input.actorUserId, input.projectId);
    return this.#store.changeProjectMembership({
      actorUserId: input.actorUserId,
      caretaker: input.caretaker,
      now: this.#clock(),
      projectId: input.projectId,
      requestId: input.requestId,
      role: input.role,
      targetUserId: input.targetUserId,
    });
  }

  async createCustomLanguage(input: {
    actorUserId: string;
    name: string;
    regionOrCountry: string;
    requestId: string;
  }): Promise<LanguageOption> {
    await requireSystemAdministrator(this.#store, input.actorUserId);
    const name = normalizeLanguageField(input.name);
    const regionOrCountry = normalizeLanguageField(input.regionOrCountry);
    const normalizedName = normalizeLanguageSearch(name);
    if (isCatalogLanguageName(name) || await this.#store.findCustomLanguageByNormalizedName(normalizedName)) {
      throw new AdminConflictError("LANGUAGE_EXISTS");
    }
    const language = await this.#store.createCustomLanguage({
      actorUserId: input.actorUserId,
      id: randomUUID(),
      name,
      normalizedName,
      now: this.#clock(),
      regionOrCountry,
    });
    return customLanguageOption(language);
  }

  async createProject(input: {
    actorUserId: string;
    languageKey: string;
    requestId: string;
  }): Promise<LanguageProject> {
    await requireSystemAdministrator(this.#store, input.actorUserId);
    const language = await this.getLanguage(input.languageKey);
    return this.#store.createLanguageProject({
      actorUserId: input.actorUserId,
      id: randomUUID(),
      languageKey: language.id,
      name: language.name,
      now: this.#clock(),
      requestId: input.requestId,
    });
  }

  async getLanguage(languageKey: string): Promise<LanguageOption> {
    assertLanguageKey(languageKey);
    const catalogLanguage = findCatalogLanguage(languageKey);
    if (catalogLanguage) return catalogLanguage;
    if (!languageKey.startsWith(customLanguagePrefix)) throw new AdminNotFoundError("language");
    const customLanguageId = languageKey.slice(customLanguagePrefix.length);
    assertProjectIdentifier(customLanguageId);
    const customLanguage = await this.#store.findCustomLanguage(customLanguageId);
    if (!customLanguage) throw new AdminNotFoundError("language");
    return customLanguageOption(customLanguage);
  }

  async getProjectAccess(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<{
    audit: PermissionAuditRecord[];
    canManageAccess: true;
    members: ProjectMember[];
    project: LanguageProject;
    systemAdministrator: boolean;
  }> {
    assertProjectIdentifier(input.projectId);
    const authority = await requireProjectManagementAuthority(
      this.#store,
      input.actorUserId,
      input.projectId,
    );
    const [members, audit] = await Promise.all([
      this.#store.listProjectMemberships(input.projectId),
      this.#store.listProjectPermissionAudit(input.projectId, auditPageSize),
    ]);
    return {
      audit,
      canManageAccess: true,
      members,
      project: authority.project,
      systemAdministrator: authority.systemAdministrator,
    };
  }

  async grantMembership(input: {
    actorUserId: string;
    caretaker: boolean;
    email: string;
    projectId: string;
    role: string;
    requestId: string;
  }): Promise<ProjectMembership> {
    assertProjectIdentifier(input.projectId);
    assertMembershipInput(input.role, input.caretaker);
    await requireProjectManagementAuthority(this.#store, input.actorUserId, input.projectId);
    return this.#store.grantProjectMembership({
      actorUserId: input.actorUserId,
      caretaker: input.caretaker,
      now: this.#clock(),
      projectId: input.projectId,
      requestId: input.requestId,
      role: input.role,
      targetEmail: normalizeEmail(input.email),
    });
  }

  async listAccessibleProjects(actorUserId: string): Promise<{
    projects: AccessibleLanguageProject[];
    systemAdministrator: boolean;
  }> {
    const systemAdministrator = await this.#store.isSystemAdministrator(actorUserId);
    return {
      projects: await this.#store.listAccessibleLanguageProjects(actorUserId, systemAdministrator),
      systemAdministrator,
    };
  }

  async searchLanguages(query: string): Promise<LanguageOption[]> {
    if (Buffer.byteLength(query, "utf8") > maximumSearchQueryBytes) {
      throw new AdminValidationError();
    }
    const normalizedQuery = normalizeLanguageSearch(query);
    if (!normalizedQuery) return [];
    const [catalogLanguages, customLanguages] = await Promise.all([
      Promise.resolve(searchCatalogLanguages(query, maximumSearchResults)),
      this.#store.searchCustomLanguages(normalizedQuery, maximumSearchResults),
    ]);
    return [...catalogLanguages, ...customLanguages.map(customLanguageOption)]
      .sort((left, right) => compareLanguageSearchResults(left, right, normalizedQuery))
      .slice(0, maximumSearchResults);
  }

  async listUsers(actorUserId: string): Promise<{
    projects: LanguageProject[];
    users: AdministrativeUserWithCaretakerAssignments[];
  }> {
    await requireSystemAdministrator(this.#store, actorUserId);
    const [users, accessibleProjects] = await Promise.all([
      this.#store.listAdministrativeUsers(),
      this.#store.listAccessibleLanguageProjects(actorUserId, true),
    ]);
    return {
      projects: accessibleProjects.map(({ project }) => project),
      users,
    };
  }

  async revokeMembership(input: {
    actorUserId: string;
    projectId: string;
    requestId: string;
    targetUserId: string;
  }): Promise<void> {
    assertProjectIdentifier(input.projectId);
    assertProjectIdentifier(input.targetUserId);
    await requireProjectManagementAuthority(this.#store, input.actorUserId, input.projectId);
    await this.#store.revokeProjectMembership({
      actorUserId: input.actorUserId,
      now: this.#clock(),
      projectId: input.projectId,
      requestId: input.requestId,
      targetUserId: input.targetUserId,
    });
  }

  /**
   * Updates a global account capability and its project-scoped caretaker set.
   * The store repeats the system-administrator check inside its transaction so
   * this service guard cannot become a stale authorization decision.
   */
  async deleteUser(input: {
    actorUserId: string;
    targetUserId: string;
    requestId: string;
  }): Promise<void> {
    assertProjectIdentifier(input.targetUserId);
    await requireSystemAdministrator(this.#store, input.actorUserId);
    await this.#store.deleteAdministrativeUser({ ...input, now: this.#clock() });
  }

  async updateUser(input: {
    actorUserId: string;
    caretakerProjectIds: string[];
    requestId: string;
    systemAdministrator: boolean;
    targetUserId: string;
  }): Promise<AdministrativeUserWithCaretakerAssignments> {
    assertProjectIdentifier(input.targetUserId);
    const caretakerProjectIds = normalizeCaretakerProjectIds(input.caretakerProjectIds);
    if (typeof input.systemAdministrator !== "boolean") throw new AdminValidationError();
    await requireSystemAdministrator(this.#store, input.actorUserId);
    return this.#store.updateAdministrativeUser({
      actorUserId: input.actorUserId,
      caretakerProjectIds,
      now: this.#clock(),
      requestId: input.requestId,
      systemAdministrator: input.systemAdministrator,
      targetUserId: input.targetUserId,
    });
  }

  /** Creates a safe request identifier for non-HTTP bootstrap callers. */
  static bootstrapRequestId(): string {
    return `bootstrap_${randomUUID().replaceAll("-", "")}`;
  }
}
